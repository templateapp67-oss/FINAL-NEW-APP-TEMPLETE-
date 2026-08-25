import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  oauthRedirect,
  publicSalonAuthContinuation,
  safeAuthContinuation,
  signupConfirmationRedirect,
} from '../src/lib/authRedirect.ts';
import {
  ownerDashboardSectionFromPath,
  ownerDashboardSectionPath,
} from '../src/lib/ownerDashboard.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const originalWindow = globalThis.window;
globalThis.window = {
  location: {
    origin: 'https://app.example.test',
    pathname: '/rose-salon',
  },
};

assert.equal(safeAuthContinuation('/rose-salon?step=pay#book', '/'), '/rose-salon?step=pay#book');
for (const unsafe of [
  'https://evil.test/steal',
  '//evil.test/steal',
  '/auth/callback?next=/dashboard',
  '/reset-password',
  '/safe\\evil',
  '/safe\nheader',
]) {
  assert.equal(safeAuthContinuation(unsafe, '/fallback'), '/fallback', unsafe);
}
ok('Auth continuation accepts guarded local paths and rejects external/loop/control forms');

const customerSignup = new URL(signupConfirmationRedirect('/rose-salon', 'customer'));
assert.equal(customerSignup.origin, 'https://app.example.test');
assert.equal(customerSignup.pathname, '/auth/callback');
assert.equal(customerSignup.searchParams.get('intent'), 'customer');
assert.equal(customerSignup.searchParams.get('next'), '/rose-salon');
assert.equal(customerSignup.searchParams.get('flow'), 'signup');
const ownerOauth = new URL(oauthRedirect('/dashboard/customers', 'owner'));
assert.equal(ownerOauth.searchParams.get('intent'), 'owner');
assert.equal(ownerOauth.searchParams.get('next'), '/dashboard/customers');
assert.equal(ownerOauth.searchParams.get('flow'), 'oauth');
ok('signup/OAuth redirects preserve explicit intent and guarded continuation');

assert.equal(publicSalonAuthContinuation('Rose-Salon'), '/rose-salon');
assert.equal(publicSalonAuthContinuation('bad/slug'), '/rose-salon');
ok('public salon continuation survives canonical-origin callbacks without accepting crafted slugs');

const [auth, callback, modal, provider, header, booking, myBookings] = await Promise.all([
  read('src/lib/useAuth.ts'),
  read('src/components/AuthCallbackPage.tsx'),
  read('src/components/LoginModal.tsx'),
  read('src/components/AuthModalProvider.tsx'),
  read('src/components/SiteHeader.tsx'),
  read('src/components/SiteBookingFullFlow.tsx'),
  read('src/components/SiteMyBookings.tsx'),
]);
assert.match(auth, /signup_role: accountIntent === 'owner' \? 'business_user' : 'customer'/);
assert.match(auth, /signupConfirmationRedirect/);
assert.match(auth, /oauthRedirect\(next, accountIntent\)/);
assert.doesNotMatch(callback, /\.exchangeCodeForSession\s*\(/);
assert.match(callback, /const \{ session, loading \} = useAuth\(\)/);
assert.match(callback, /context\.intent === 'owner'/);
assert.match(callback, /context\.codePresent && context\.flow === 'signup'/);
ok('one shared Supabase client owns PKCE exchange and callback preserves owner/customer semantics');

assert.match(provider, /accountIntent: 'owner'/);
assert.match(modal, /if \(!isCustomer\) \{/);
assert.match(modal, /accountIntent,/);
assert.match(modal, /if \(!isCustomer\) await navigateAfterOwnerAuth\(\)/);
for (const source of [header, booking, myBookings]) {
  assert.match(source, /accountIntent: 'customer'/);
  assert.match(source, /publicSalonAuthContinuation/);
}
ok('public Auth entry points use customer intent and cannot enter owner provisioning/navigation');

assert.equal(ownerDashboardSectionFromPath('/dashboard'), 'overview');
assert.equal(ownerDashboardSectionFromPath('/dashboard/customers'), 'customers');
assert.equal(ownerDashboardSectionFromPath('/dashboard/not-a-section'), 'overview');
assert.equal(ownerDashboardSectionFromPath('/builder/services'), null);
assert.equal(ownerDashboardSectionPath('calendar'), '/dashboard/calendar');
assert.equal(ownerDashboardSectionPath('overview'), '/dashboard');
ok('dashboard descendants map deterministically for refresh/direct/back navigation');

const main = await read('src/main.tsx');
assert.match(main, /pathname\.startsWith\('\/dashboard\/'\)/);
assert.match(main, /pathname\.startsWith\('\/builder\/'\)/);
assert.match(main, /protectedPath\.startsWith\('\/builder\/'\)/);
ok('root router dispatches nested dashboard and builder paths to the protected shell');

if (originalWindow === undefined) delete globalThis.window;
else globalThis.window = originalWindow;

console.log(`\nAuth intent and protected routing: ${passed}/${passed} checks PASS`);
