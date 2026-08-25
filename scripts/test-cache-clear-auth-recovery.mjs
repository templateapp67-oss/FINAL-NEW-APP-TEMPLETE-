import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isMissingAuthSessionDiagnostic } from '../src/lib/workspaceDiagnostics.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const diagnostic = (overrides = {}) => ({
  operation: 'workspace.provision',
  stage: 'auth-session',
  code: null,
  message: 'Auth session missing!',
  details: null,
  hint: null,
  authenticatedUserExists: false,
  userId: null,
  ...overrides,
});

assert.equal(isMissingAuthSessionDiagnostic(diagnostic()), true);
assert.equal(isMissingAuthSessionDiagnostic(diagnostic({ code: '28000', message: 'No authenticated Supabase session.' })), true);
assert.equal(isMissingAuthSessionDiagnostic(diagnostic({ message: 'Invalid Refresh Token: Refresh Token Not Found' })), true);
assert.equal(isMissingAuthSessionDiagnostic(diagnostic({ code: 'AUTH_USER_MISSING', message: 'User is empty.' })), true);
ok('missing, cleared and invalid browser auth state is classified as session loss');

assert.equal(isMissingAuthSessionDiagnostic(diagnostic({ message: 'Failed to fetch', code: null })), false);
assert.equal(isMissingAuthSessionDiagnostic(diagnostic({ stage: 'workspace-hydration', message: 'Session expired' })), false);
assert.equal(isMissingAuthSessionDiagnostic(undefined), false);
ok('network and non-auth workspace failures remain retryable errors');

const [app, auth, dashboard, main] = await Promise.all([
  read('src/App.tsx'),
  read('src/lib/useAuth.ts'),
  read('src/lib/ownerDashboard.ts'),
  read('src/main.tsx'),
]);

assert.match(app, /const \{ user, session, loading: authLoading \} = useAuth\(\)/);
assert.match(app, /const hasSession = Boolean\(session\?\.access_token && session\.user\?\.id\)/);
assert.match(app, /authLoading \|\| !user \|\| !hasSession/);
assert.match(app, /isMissingAuthSessionDiagnostic\(diagnostic\)[\s\S]*redirectToOwnerLoginForSessionLoss\(\)[\s\S]*return/);
assert.match(auth, /if \(!session && !loading\) \{[\s\S]*clearOwnerBrowserWorkspaceCache\(\)/);
assert.match(auth, /window\.location\.replace\(`\$\{AUTH_LOGIN_PATH\}\?intent=owner&next=/);
assert.match(main, /const \{ user, session, loading \} = useAuth\(\)/);
assert.match(main, /!user \|\| !session\?\.access_token \|\| !session\.user\?\.id/);
ok('root auth and workspace hydration redirect signed-out browsers before the error screen');

assert.match(dashboard, /case 'error':[\s\S]*isMissingAuthSessionDiagnostic\(resolution\.diagnostic\)[\s\S]*'not-authenticated'/);
ok('workspace hook maps a missing session to signed-out access without reading a salon id');

console.log(`\nCache-clear auth recovery: ${passed}/${passed} checks PASS`);
