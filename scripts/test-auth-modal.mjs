#!/usr/bin/env node
import fs from 'fs';
import assert from 'node:assert/strict';

console.log('🧪 Running Auth Modal & Login Reliability Regression Tests...\n');

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
  // 1. Check LoginModal.tsx source and implementation
  const loginModalSrc = fs.readFileSync('src/components/LoginModal.tsx', 'utf8');

  await test('LoginModal imports and uses createPortal with document.body', () => {
    assert.ok(loginModalSrc.includes("import { createPortal } from 'react-dom'"), 'Missing createPortal import');
    assert.ok(loginModalSrc.includes('createPortal(modalContent, document.body)'), 'Does not render through createPortal to document.body');
  });

  await test('LoginModal has required dialog accessibility attributes and testids', () => {
    assert.ok(loginModalSrc.includes('role="dialog"'), 'Missing role="dialog"');
    assert.ok(loginModalSrc.includes('aria-modal="true"'), 'Missing aria-modal="true"');
    assert.ok(loginModalSrc.includes('aria-labelledby="auth-modal-title"'), 'Missing aria-labelledby');
    assert.ok(loginModalSrc.includes('data-testid="auth-modal"'), 'Missing data-testid="auth-modal"');
    assert.ok(loginModalSrc.includes('data-testid="auth-form"'), 'Missing data-testid="auth-form"');
    assert.ok(loginModalSrc.includes('data-testid="auth-login-tab"'), 'Missing auth-login-tab');
    assert.ok(loginModalSrc.includes('data-testid="auth-signup-tab"'), 'Missing auth-signup-tab');
    assert.ok(loginModalSrc.includes('data-testid="auth-email-input"'), 'Missing auth-email-input');
    assert.ok(loginModalSrc.includes('data-testid="auth-password-input"'), 'Missing auth-password-input');
    assert.ok(loginModalSrc.includes('data-testid="auth-submit-btn"'), 'Missing auth-submit-btn');
    assert.ok(loginModalSrc.includes('data-testid="auth-close-btn"'), 'Missing auth-close-btn');
  });

  await test('LoginModal handles Escape key and backdrop click to close', () => {
    assert.ok(loginModalSrc.includes("event.key === 'Escape'"), 'Missing Escape key listener');
    assert.ok(loginModalSrc.includes('onClose()'), 'Missing onClose call');
    assert.ok(loginModalSrc.includes('e.target === e.currentTarget'), 'Missing backdrop click check');
  });

  await test('LoginModal has explicit missing-env warning with exact prompt wording', () => {
    const expectedWarning = 'Authentication form is ready, but Supabase is not connected. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the app.';
    assert.ok(loginModalSrc.includes(expectedWarning), 'Missing exact required warning text');
    assert.ok(loginModalSrc.includes('data-testid="auth-warning-banner"'), 'Missing warning banner testid');
    assert.ok(loginModalSrc.includes('!isSupabaseConfigured'), 'Missing isSupabaseConfigured check');
  });

  await test('LoginModal enforces form submission, 6-char password on signup, and error states', () => {
    assert.ok(loginModalSrc.includes('password.length < 6'), 'Missing min 6 char password check');
    assert.ok(loginModalSrc.includes('Password must be at least 6 characters.'), 'Missing 6-char error message');
    assert.ok(loginModalSrc.includes('Enter your email and password.'), 'Missing empty fields error message');
    assert.ok(loginModalSrc.includes('signInWithPassword'), 'Missing signInWithPassword call');
    assert.ok(loginModalSrc.includes('signUpWithPassword'), 'Missing signUpWithPassword call');
    assert.ok(loginModalSrc.includes('needsConfirmation'), 'Missing needsConfirmation handling');
  });

  await test('LoginModal has Log In and Sign Up tabs with clear mode switching', () => {
    assert.ok(loginModalSrc.includes("setMode('login')") || loginModalSrc.includes("switchMode('login')"), 'Missing switch to login');
    assert.ok(loginModalSrc.includes("setMode('signup')") || loginModalSrc.includes("switchMode('signup')"), 'Missing switch to signup');
    assert.ok(loginModalSrc.includes('data-testid="auth-switch-mode-btn"'), 'Missing switch mode button testid');
  });

  // 2. Check trigger buttons in screens
  const heroSplitSrc = fs.readFileSync('src/screens/HeroSplit.tsx', 'utf8');
  const topBarSrc = fs.readFileSync('src/components/TopBar.tsx', 'utf8');
  const stepLocationSrc = fs.readFileSync('src/screens/StepLocation.tsx', 'utf8');
  const providerSrc = fs.readFileSync('src/components/AuthModalProvider.tsx', 'utf8');
  const mainSrc = fs.readFileSync('src/main.tsx', 'utf8');

  await test('One root-level auth provider owns the modal across every screen', () => {
    assert.ok(mainSrc.includes('<AuthModalProvider>'), 'App is not wrapped in AuthModalProvider');
    assert.ok(providerSrc.includes('<LoginModal open={open}'), 'Provider does not render LoginModal');
    assert.ok(providerSrc.includes('setOpen(true)'), 'Provider cannot open the dialog');
    assert.ok(providerSrc.includes('setOpen(false)'), 'Provider cannot close the dialog');
  });

  await test('HeroSplit (Screen 02) Log In button opens the root LoginModal reliably', () => {
    assert.ok(heroSplitSrc.includes('data-testid="hero-login-btn"'), 'Missing hero-login-btn');
    assert.ok(heroSplitSrc.includes('type="button"'), 'Missing type="button" on hero login button');
    assert.ok(heroSplitSrc.includes("openAuth('login')"), 'Hero does not open the root auth dialog');
  });

  await test('TopBar Log In button opens the root LoginModal and handles loading gracefully', () => {
    assert.ok(topBarSrc.includes('data-testid="topbar-login-btn"'), 'Missing topbar-login-btn');
    assert.ok(topBarSrc.includes('type="button"'), 'Missing type="button" on TopBar buttons');
    assert.ok(topBarSrc.includes("openAuth('login')"), 'TopBar does not open the root auth dialog');
    assert.ok(topBarSrc.includes('authLoading ?'), 'Missing auth loading state in TopBar');
    assert.ok(topBarSrc.includes('Checking...'), 'Missing auth loading indicator in TopBar');
  });

  await test('StepLocation Log In button opens the same root auth dialog', () => {
    assert.ok(stepLocationSrc.includes('data-testid="location-login-btn"'), 'Missing location-login-btn');
    assert.ok(stepLocationSrc.includes('type="button"'), 'Missing type="button" on Location screen login button');
    assert.ok(stepLocationSrc.includes("openAuth('login')"), 'Location does not open the root auth dialog');
  });

  // 3. Check useAuth and supabaseClient safety
  const useAuthSrc = fs.readFileSync('src/lib/useAuth.ts', 'utf8');
  const supabaseClientSrc = fs.readFileSync('src/lib/supabaseClient.ts', 'utf8');

  await test('useAuth has try-catch error handling and timeout safety', () => {
    assert.ok(useAuthSrc.includes('timeoutId') || useAuthSrc.includes('timeoutTimer'), 'Missing session timeout fallback');
    assert.ok(useAuthSrc.includes('try {') && useAuthSrc.includes('catch'), 'Missing try-catch in useAuth');
  });

  await test('Supabase client uses only public anon key, never service_role', () => {
    assert.ok(supabaseClientSrc.includes('VITE_SUPABASE_URL'), 'Missing VITE_SUPABASE_URL');
    assert.ok(supabaseClientSrc.includes('VITE_SUPABASE_ANON_KEY'), 'Missing VITE_SUPABASE_ANON_KEY');
    assert.ok(!supabaseClientSrc.includes('SUPABASE_SERVICE_ROLE'), 'service_role key detected in client!');
    assert.ok(!loginModalSrc.includes('localStorage.setItem("password"'), 'Password stored in localStorage!');
  });

  // 4. Runtime auth helper behavior when unconfigured
  await test('Runtime auth helpers return readable missing-env errors without crashing', async () => {
    // Dynamic import through tsx
    const { signInWithPassword, signUpWithPassword } = await import('../src/lib/useAuth.ts');
    const { isSupabaseConfigured, supabase } = await import('../src/lib/supabaseClient.ts');

    assert.equal(isSupabaseConfigured, false, 'isSupabaseConfigured should be false when env is absent');
    assert.equal(supabase, null, 'supabase client should be null when env is absent');

    const signInRes = await signInWithPassword('owner@example.com', 'mypassword');
    assert.ok(signInRes.error?.includes('Authentication is not configured'), 'signInWithPassword did not return expected error');

    const signUpRes = await signUpWithPassword('owner@example.com', 'mypassword');
    assert.ok(signUpRes.error?.includes('Authentication is not configured'), 'signUpWithPassword did not return expected error');
    assert.equal(signUpRes.needsConfirmation, false);
  });

  // 5. Check that the draft migrations remain intact and unexecuted
  const migrationsDir = 'supabase/migrations';
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
  await test('The original 24 draft migrations exist and are preserved', () => {
    assert.ok(migrationFiles.length >= 24, `Expected at least 24 migrations, found ${migrationFiles.length}`);
    for (let number = 1; number <= 24; number += 1) {
      const marker = `_m${String(number).padStart(2, '0')}_`;
      assert.ok(migrationFiles.some((file) => file.includes(marker)), `Original M${String(number).padStart(2, '0')} is missing`);
    }
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passedTests}/${totalTests} tests passed`);
  console.log(`========================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests();
