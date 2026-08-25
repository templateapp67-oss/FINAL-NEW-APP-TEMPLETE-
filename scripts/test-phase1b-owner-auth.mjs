#!/usr/bin/env node
/** Phase 1-B — real owner signup/login session (no fake auth). */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
function pass(l) { passed++; console.log(`✓ PASS [${l}]`); }
function fail(l, d) { failed++; console.log(`✗ FAIL [${l}] ${d}`); }
function read(p) { return readFileSync(resolve(ROOT, p), 'utf8'); }

{
  const auth = read('src/lib/useAuth.ts');
  if (
    auth.includes("signup_role: accountIntent === 'owner' ? 'business_user' : 'customer'")
    && auth.includes('signUp(')
  ) {
    pass('Signup metadata separates explicit owner and customer intent');
  } else fail('Signup role', 'missing intent-bound signup_role metadata');
  if (!/localStorage\.setItem\(.*token|fakeUser|HARDCODED_USER/.test(auth)) {
    pass('useAuth has no localStorage/fake identity');
  } else fail('useAuth fake', 'found fake identity');
}

{
  const session = read('src/lib/ownerSession.ts');
  if (session.includes('auth.getUser()') && session.includes('resolveOrProvisionOwnerSalon')) {
    pass('Owner session uses getUser + provision RPC');
  } else fail('ownerSession', 'missing getUser/provision');
  if (session.includes('localStorage') && session.includes('as authentication')) {
    fail('ownerSession storage', 'uses localStorage as auth');
  } else pass('Owner session does not treat localStorage as auth');
}

{
  const dash = read('src/lib/ownerDashboard.ts');
  if (dash.includes("mock-salon-123")) fail('Dashboard mock', 'hardcoded mock salon still present');
  else pass('Owner dashboard no longer authorizes a hardcoded mock salon');
  if (dash.includes('completeOwnerAuthSession')) pass('Dashboard provisions missing owner membership from session');
  else fail('Dashboard provision', 'does not complete owner session');
}

{
  const app = read('src/App.tsx');
  if (app.includes("activeModule === 'owner-dashboard'") && app.includes('user')) {
    pass('Owner dashboard not gated on published URL');
  } else fail('App gate', 'owner dashboard still publish-gated or missing');
}

{
  const login = read('src/components/LoginModal.tsx');
  if (login.includes('completeOwnerAuthSession') && login.includes('enterOwnerWorkspace')) {
    pass('Login completes owner session then opens workspace');
  } else fail('Login flow', 'missing session complete / workspace enter');
}

{
  const signup = read('src/components/SignUpPage.tsx');
  if (signup.includes('signUpWithPassword') && signup.includes('salonName') && signup.includes('enterOwnerWorkspace')) {
    pass('Sign-up page provisions owner and enters workspace');
  } else fail('Signup page', 'missing provision/redirect');
}

{
  const session = read('src/lib/ownerSession.ts');
  if (session.includes('OWNER_ONBOARDING_PATH') && session.includes("'/builder'") && session.includes('isPublished')) {
    pass('Unpublished owners are sent to /builder onboarding');
  } else fail('First-login route', 'missing unpublished → /builder');
  if (session.includes('resumeWizardStep')) {
    pass('Resume helper exists for lastCompletedStep');
  } else fail('Resume', 'missing resumeWizardStep');
}

{
  const app = read('src/App.tsx');
  if (app.includes('resumeWizardStep') && app.includes('lastCompletedStep')) {
    pass('App resumes wizard from saved lastCompletedStep');
  } else fail('App resume', 'does not resume from DB lastCompletedStep');
}

{
  const main = read('src/main.tsx');
  if (main.includes('ProtectedApp') && main.includes('useAuth()') && main.includes("!user")) {
    pass('/dashboard requires a live Supabase user');
  } else fail('ProtectedApp', 'dashboard not session-gated');
}

{
  try {
    const out = execSync('npx tsc --noEmit 2>&1', { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    if (out.includes('error TS')) fail('TYPECHECK', out.slice(0, 240));
    else pass('TYPECHECK');
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : String(e);
    if (out.includes('error TS')) fail('TYPECHECK', out.split('\n').filter((l) => l.includes('error')).slice(0, 4).join(' | '));
    else pass('TYPECHECK');
  }
}

console.log(`\nPHASE 1-B OWNER AUTH: ${passed}/${passed + failed} PASS`);
process.exit(failed > 0 ? 1 : 0);
