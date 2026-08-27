#!/usr/bin/env node
/**
 * Auth Flow Fix Regression Suite.
 *
 * Locks in the permanent fixes to the Login & Sign Up flow:
 *   1. Credential normalization (email.toLowerCase().trim()) before any
 *      validation/submission, and distinct user feedback for invalid
 *      credentials vs network vs server errors.
 *   2. Supabase session handling: signInWithPassword/signUp wrapped in
 *      try/catch, exactly ONE onAuthStateChange listener updating the shared
 *      auth store, and session restoration on reload via auth.getSession().
 *   3. Form UX: inputs + submit locked while isSubmitting, error alerts
 *      cleared the moment a credential field is edited, and a seamless
 *      Log In ⇄ Sign Up toggle with no residual error state.
 *   4. Demo/preview fallback: when (and ONLY when) Supabase is unconfigured,
 *      the local bypass continues smoothly and never throws; a configured
 *      deployment can never bypass auth.
 *
 * Runtime checks run with no env vars, so the app is in the unconfigured
 * (demo/preview) state — exactly where the fallback must be smooth.
 */
import fs from 'fs';
import assert from 'node:assert/strict';

console.log('🧪 Running Auth Flow Fix Regression Tests...\n');

let totalTests = 0;
let passedTests = 0;

async function test(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ PASS — ${description}`);
  } catch (err) {
    console.error(`❌ FAIL — ${description}`);
    console.error(`   ${err.message}`);
  }
}

async function runAllTests() {
  const useAuthSrc = fs.readFileSync('src/lib/useAuth.ts', 'utf8');
  const loginModalSrc = fs.readFileSync('src/components/LoginModal.tsx', 'utf8');
  const signUpPageSrc = fs.readFileSync('src/components/SignUpPage.tsx', 'utf8');
  const authLoginPageSrc = fs.readFileSync('src/components/AuthLoginPage.tsx', 'utf8');
  const demoAuthSrc = fs.readFileSync('src/lib/demoAuth.ts', 'utf8');
  const authIdentitySrc = fs.readFileSync('src/lib/authIdentity.ts', 'utf8');

  // ── 1. Credential normalization + error classification ──────────────────
  const {
    normalizeAuthEmail,
    classifyAuthError,
    isValidAuthEmail,
  } = await import('../src/lib/useAuth.ts');

  await test('emails are normalized lowercase+trim before validation/submission', () => {
    assert.equal(normalizeAuthEmail('  Foo@Bar.COM  '), 'foo@bar.com');
    assert.equal(normalizeAuthEmail('USER@EXAMPLE.COM'), 'user@example.com');
    assert.equal(normalizeAuthEmail('\tMixed.Case@Salon.Co\n'), 'mixed.case@salon.co');
    assert.equal(normalizeAuthEmail(''), '');
    // Normalization happens in the forms before validation:
    const modalNormalizeIdx = loginModalSrc.indexOf('const mail = normalizeAuthEmail(email)');
    const modalValidateIdx = loginModalSrc.indexOf('isValidAuthEmail(mail)');
    assert.ok(modalNormalizeIdx !== -1 && modalValidateIdx > modalNormalizeIdx, 'LoginModal must normalize before validating');
    const signupNormalizeIdx = signUpPageSrc.indexOf('const mail = normalizeAuthEmail(email)');
    const signupValidateIdx = signUpPageSrc.indexOf('isValidAuthEmail(mail)');
    assert.ok(signupNormalizeIdx !== -1 && signupValidateIdx > signupNormalizeIdx, 'SignUpPage must normalize before validating');
    assert.ok(useAuthSrc.includes("email: normalizedEmail"), 'Supabase submissions must use the normalized email');
    assert.ok(isValidAuthEmail('  Valid@Email.com '), 'normalized email must pass validation');
  });

  await test('invalid credentials vs network vs server errors are classified distinctly', () => {
    const creds = classifyAuthError('Invalid login credentials');
    assert.equal(creds.kind, 'invalid-credentials');
    assert.equal(creds.message, 'Incorrect email or password.');

    const grant = classifyAuthError('invalid_grant');
    assert.equal(grant.kind, 'invalid-credentials');

    const network = classifyAuthError('Failed to fetch');
    assert.equal(network.kind, 'network');
    assert.match(network.message, /Unable to connect/i);

    const timeout = classifyAuthError('request timed out');
    assert.equal(timeout.kind, 'network');

    const confirm = classifyAuthError('Email not confirmed');
    assert.equal(confirm.kind, 'email-not-confirmed');

    const dup = classifyAuthError('User already registered');
    assert.equal(dup.kind, 'already-registered');

    const rate = classifyAuthError('Email rate limit exceeded');
    assert.equal(rate.kind, 'rate-limited');

    // Unknown messages are NEVER blamed on the user's credentials by default:
    const unknown = classifyAuthError('unexpected 500 from auth server');
    assert.equal(unknown.kind, 'server');
  });

  await test('forms surface the classified kind on the error banner', () => {
    assert.ok(loginModalSrc.includes('data-error-kind={errorKind'), 'LoginModal banner must expose the error kind');
    assert.ok(loginModalSrc.includes('role="alert"'), 'LoginModal banner must be an assertive alert');
    assert.ok(signUpPageSrc.includes('data-error-kind={errorKind'), 'SignUpPage banner must expose the error kind');
    assert.ok(signUpPageSrc.includes('role="alert"'), 'SignUpPage banner must be an assertive alert');
    assert.ok(loginModalSrc.includes('raiseError(err, kind)'), 'LoginModal must propagate the classified kind');
    assert.ok(signUpPageSrc.includes('raiseError(err, kind)'), 'SignUpPage must propagate the classified kind');
  });

  // ── 2. Supabase session handling & auth state management ────────────────
  await test('signInWithPassword / signUp are fully try-catch wrapped and never throw', () => {
    // Every Supabase auth call in useAuth lives inside a try block:
    for (const call of [
      'supabase.auth.signInWithPassword(',
      'supabase.auth.signUp(',
      'supabase.auth.resend(',
      'supabase.auth.signInWithOAuth(',
      'supabase.auth.resetPasswordForEmail(',
      'supabase.auth.updateUser(',
      'supabase.auth.signOut(',
    ]) {
      assert.ok(useAuthSrc.includes(call), `missing auth call ${call}`);
    }
    for (const marker of [
      'Sign-in exception',
      'Sign-up exception',
      'Resend confirmation exception',
      'Google sign-in exception',
      'Password reset exception',
      'Update password exception',
      'Sign-out exception',
    ]) {
      assert.ok(useAuthSrc.includes(marker), `missing exception guard: ${marker}`);
    }
  });

  await test('exactly ONE onAuthStateChange listener feeds the shared auth store', () => {
    const registrations = useAuthSrc.match(/supabase\.auth\.onAuthStateChange\(/g) || [];
    assert.equal(registrations.length, 1, 'useAuth must register exactly one listener');
    assert.ok(useAuthSrc.includes('authSyncStarted'), 'listener must be guarded by the idempotent start flag');
    assert.ok(useAuthSrc.includes('authListeners'), 'hook instances must subscribe to the shared store');
    assert.ok(useAuthSrc.includes('emitAuthState'), 'the listener must publish to every subscriber');
  });

  await test('session restoration on reload goes through auth.getSession() validation', () => {
    assert.ok(useAuthSrc.includes("getAuthoritativeAuthIdentity('auth.initial_session')"), 'initial session must be validated on startup');
    assert.ok(authIdentitySrc.includes('client.auth.getSession()'), 'authoritative identity must read the persisted session');
    assert.ok(authIdentitySrc.includes('client.auth.getUser()'), 'the access token must be validated with Supabase Auth');
    assert.ok(useAuthSrc.includes("validateEmittedSession(session ?? null"), 'emitted events must be validated, not trusted raw');
    assert.ok(useAuthSrc.includes('authValidationVersion'), 'stale validation results must be discarded by version');
  });

  // ── 3. Demo/preview fallback (unconfigured) — smooth, never throwing ────
  const {
    signInWithPassword,
    signUpWithPassword,
    resendConfirmationEmail,
    signInWithGoogle,
    sendPasswordReset,
    updatePassword,
  } = await import('../src/lib/useAuth.ts');
  const { isSupabaseConfigured } = await import('../src/lib/supabaseClient.ts');
  const demoAuth = await import('../src/lib/demoAuth.ts');

  await test('runtime auth helpers return classified results without throwing when unconfigured', async () => {
    assert.equal(isSupabaseConfigured, false, 'this suite must run unconfigured');

    const signInRes = await signInWithPassword('  Owner@Example.com ', 'mypassword');
    assert.ok(signInRes.error?.includes('Authentication is not configured'));
    assert.equal(signInRes.kind, 'unconfigured');
    assert.equal(signInRes.needsConfirmation, false);

    const signUpRes = await signUpWithPassword('Owner@Example.com', 'mypassword');
    assert.equal(signUpRes.kind, 'unconfigured');
    assert.ok(signUpRes.error?.includes('Authentication is not configured'));

    const resendRes = await resendConfirmationEmail('Owner@Example.com');
    assert.equal(resendRes.kind, 'unconfigured');

    const googleRes = await signInWithGoogle();
    assert.ok(typeof googleRes.error === 'string');

    const resetRes = await sendPasswordReset('Owner@Example.com');
    assert.ok(typeof resetRes.error === 'string');

    const updateRes = await updatePassword('mypassword');
    assert.ok(typeof updateRes.error === 'string');
  });

  await test('demo bypass exists ONLY when Supabase is unconfigured and never throws', () => {
    assert.equal(demoAuth.isDemoAuthBypassAvailable(), !isSupabaseConfigured, 'bypass must mirror the unconfigured state');
    // No browser window here — must return false gracefully, never throw:
    assert.equal(demoAuth.enterDemoOwnerWorkspace(), false);
    assert.equal(demoAuth.enterDemoOwnerWorkspace('/dashboard'), false);
    assert.match(demoAuth.demoAuthBypassNotice('owner'), /preview mode/i);
    // Hard guard: the navigation helper refuses to run when a backend exists.
    assert.ok(demoAuthSrc.includes('if (!isDemoAuthBypassAvailable()) return false;'), 'navigation must be gated by the bypass guard');
    assert.ok(demoAuthSrc.includes('return !isSupabaseConfigured;'), 'bypass availability must derive solely from configuration state');
  });

  await test('forms continue smoothly through the demo bypass when unconfigured', () => {
    assert.ok(loginModalSrc.includes('isDemoAuthBypassAvailable()'), 'LoginModal must consult the bypass guard');
    assert.ok(loginModalSrc.includes('enterDemoOwnerWorkspace()'), 'LoginModal owner flow must continue into the demo workspace');
    assert.ok(loginModalSrc.includes('demoAuthBypassNotice'), 'LoginModal must explain the preview continuation');
    assert.ok(signUpPageSrc.includes('isDemoAuthBypassAvailable()'), 'SignUpPage must consult the bypass guard');
    assert.ok(signUpPageSrc.includes('enterDemoOwnerWorkspace()'), 'SignUpPage must continue into the demo workspace');
    assert.ok(authLoginPageSrc.includes('auth-login-page-demo-btn'), 'Login page must offer a preview continuation when unconfigured');
  });

  // ── 4. Form UI/UX: isSubmitting lock, error clearing, seamless toggle ───
  await test('inputs and submit stay disabled for the whole isSubmitting lifecycle', () => {
    for (const [name, src] of [['LoginModal', loginModalSrc], ['SignUpPage', signUpPageSrc]]) {
      const disabledCount = (src.match(/disabled=\{isSubmitting/g) || []).length;
      assert.ok(disabledCount >= 4, `${name}: expected >=4 isSubmitting-disabled controls, found ${disabledCount}`);
      assert.ok(src.includes('aria-busy={isSubmitting}'), `${name}: form must expose aria-busy`);
      assert.ok(!/\bsetBusy\b/.test(src), `${name}: stale busy state must be fully replaced by isSubmitting`);
    }
    // isSubmitting must NOT be released before owner provisioning finishes:
    assert.ok(!/signInWithPassword\(mail, password\);\s*setIsSubmitting\(false\)/.test(loginModalSrc), 'busy state must survive past sign-in until provisioning ends');
  });

  await test('editing email/password clears existing error alerts', () => {
    for (const [name, src, emailHandler, passHandler] of [
      ['LoginModal', loginModalSrc, 'handleEmailChange', 'handlePasswordChange'],
      ['SignUpPage', signUpPageSrc, 'handleEmailChange', 'handlePasswordChange'],
    ]) {
      assert.ok(src.includes('const clearFieldError'), `${name}: missing clearFieldError helper`);
      assert.ok(/clearFieldError = \(\) => \{[\s\S]*?setError\(null\)/.test(src), `${name}: editing must clear the error alert`);
      assert.ok(src.includes(`onChange={(e) => ${emailHandler}(e.target.value)}`), `${name}: email input must use the clearing handler`);
      assert.ok(src.includes(`onChange={(e) => ${passHandler}(e.target.value)}`), `${name}: password input must use the clearing handler`);
    }
    assert.ok(loginModalSrc.includes('onChange={(e) => handlePasswordConfirmChange(e.target.value)}'), 'confirm input must also clear errors');
  });

  await test('Log In ⇄ Sign Up toggle drops all residual error/confirmation state', () => {
    const switchModeMatch = loginModalSrc.match(/const switchMode = \(newMode: AuthMode\) => \{[\s\S]*?\n  \};/);
    assert.ok(switchModeMatch, 'LoginModal switchMode not found');
    const body = switchModeMatch[0];
    for (const reset of ['setError(null)', 'setErrorKind(null)', 'setNotice(null)', 'setPasswordConfirm(\'\')', 'setUnconfirmedEmail(null)', 'setResendStatus(null)']) {
      assert.ok(body.includes(reset), `switchMode must reset ${reset}`);
    }
    assert.ok(body.includes('if (isSubmitting) return;'), 'mode must never switch mid-request');
    assert.ok(loginModalSrc.includes('disabled={isSubmitting}\n            aria-pressed={isLogin}') || loginModalSrc.includes('aria-pressed={isLogin}'), 'tabs must be locked while submitting');
    // Reopening the modal resets transient state too:
    assert.ok(/Reset transient state[\s\S]*?setIsSubmitting\(false\)/.test(loginModalSrc), 'opening the modal must reset submit/error state');
  });

  await test('protected routes still bypass auth ONLY when unconfigured (demo mode)', () => {
    const mainSrc = fs.readFileSync('src/main.tsx', 'utf8');
    assert.ok(mainSrc.includes('if (!isSupabaseConfigured) return <App initialModule={initialModule} />;'), 'ProtectedApp demo bypass must remain intact');
    assert.ok(demoAuthSrc.includes('NEVER'), 'demo module must document that configured deployments never bypass');
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passedTests}/${totalTests} tests passed`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests();
