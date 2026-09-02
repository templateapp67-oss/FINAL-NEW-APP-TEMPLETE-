/**
 * Header AUTH + LOCALE — public-site LOGOUT and EN/HI language switcher.
 *
 * Mounts the real Barber theme renderer with a stubbed Supabase auth session
 * (a signed-in customer) and verifies:
 *   1. Logged-in header shows My Bookings + Logout (no Login/Sign Up).
 *   2. The EN / हिन्दी switcher repaints ALL action labels instantly and
 *      persists (nexora_locale), both desktop and mobile drawer.
 *   3. Clicking LOGOUT runs the auth sign-out (clears the session/token) and
 *      the header state updates back to the logged-out Login / Sign Up view.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Must be set before any app module that reads supabase env is imported.
// Non-`.supabase.co` host so the project-mismatch guards stay inert.
process.env.VITE_SUPABASE_URL = 'https://nexora-header-test.example.com';
process.env.VITE_SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test-anon-key-for-header-test';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/arts-by-uma',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;
dom.window.HTMLElement.prototype.scrollTo = function () {};
globalThis.HTMLElement.prototype.scrollTo = dom.window.HTMLElement.prototype.scrollTo;

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent, within } = await import('@testing-library/react');
const { supabase } = await import('../src/lib/supabaseClient.ts');
const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const { initialData } = await import('../src/types.ts');

// ---- Stub Supabase auth: signed-in customer ------------------------------
const fakeUser = { id: 'cust-123', email: 'customer@test.test', app_metadata: {}, user_metadata: {} };
const fakeSession = { access_token: 'tok', refresh_token: 'ref', expires_at: 9999999999, user: fakeUser };
let authCb = null;
let signOutCalls = 0;
supabase.auth.onAuthStateChange = (cb) => {
  authCb = cb;
  return { data: { subscription: { unsubscribe() {} } } };
};
supabase.auth.getSession = async () => ({ data: { session: fakeSession }, error: null });
supabase.auth.getUser = async () => ({ data: { user: fakeUser }, error: null });
supabase.auth.signOut = async () => {
  signOutCalls += 1;
  if (authCb) authCb('SIGNED_OUT', null);
  return { error: null };
};

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { failed += 1; failures.push({ name, error }); console.error(`  ✗ ${name}\n    ${String(error.message).split('\n').join('\n    ')}`); }
}

const data = { ...initialData, templateId: 'barber_mens_grooming', salonName: 'Arts By Uma', ownerName: 'Uma' };

async function waitForHeader() {
  let el = null;
  for (let i = 0; i < 40 && !el; i += 1) {
    await act(async () => { await Promise.resolve(); });
    el = document.querySelector('[data-testid="site-header"]');
  }
  return el;
}

/* ---------------- Desktop: logged-in header + language + logout ---------- */
{
  window.localStorage.clear();
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  await waitForHeader();

  await test('signed-in header shows My Bookings + Logout (not Login/Sign Up)', () => {
    assert.ok(document.querySelector('[data-testid="site-header-my-bookings"]'), 'My Bookings missing');
    assert.ok(document.querySelector('[data-testid="site-header-logout"]'), 'Logout missing');
    assert.equal(document.querySelector('[data-testid="site-header-login"]'), null, 'Login should be hidden when signed in');
  });

  await test('EN → हिन्दी switches My Bookings, Logout and Book labels instantly + persists', async () => {
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-header-lang-hi"]')); });
    assert.equal(window.localStorage.getItem('nexora_locale'), 'hi');
    assert.equal(document.querySelector('[data-testid="site-header-my-bookings"]').textContent, 'मेरी बुकिंग');
    assert.equal(document.querySelector('[data-testid="site-header-logout"]').textContent, 'लॉग आउट');
    assert.ok((document.querySelector('[data-testid="site-book-cta"]').textContent || '').includes('अपॉइंटमेंट बुक करें'));
    // back to English
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-header-lang-en"]')); });
    assert.equal(window.localStorage.getItem('nexora_locale'), 'en');
    assert.equal(document.querySelector('[data-testid="site-header-my-bookings"]').textContent, 'My Bookings');
    assert.equal(document.querySelector('[data-testid="site-header-logout"]').textContent, 'Logout');
  });

  await test('clicking LOGOUT runs auth sign-out and flips to Login / Sign Up', async () => {
    signOutCalls = 0;
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-header-logout"]')); });
    assert.ok(signOutCalls >= 1, 'auth.signOut was not called');
    await act(async () => { await Promise.resolve(); });
    assert.ok(document.querySelector('[data-testid="site-header-login"]'), 'Login did not reappear after logout');
    assert.ok(document.querySelector('[data-testid="site-header-signup"]'), 'Sign Up did not reappear after logout');
    assert.equal(document.querySelector('[data-testid="site-header-logout"]'), null, 'Logout still shown after logout');
  });

  cleanup();
}

/* ---------------- Mobile drawer: localized logout + logout transition ---- */
{
  window.localStorage.clear();
  // Re-seed a signed-in session (the shared auth store is a process singleton,
  // so the desktop logout above left it signed out).
  await act(async () => { if (authCb) authCb('SIGNED_IN', fakeSession); });
  await act(async () => { await Promise.resolve(); });
  const utils = render(React.createElement(Barber, { data, mode: 'mobile' }));
  await waitForHeader();

  await test('mobile drawer localizes My Bookings / Logout and logs out', async () => {
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-menu-button"]')); });
    const drawer = document.querySelector('[data-testid="site-mobile-drawer"]');
    assert.ok(drawer.querySelector('[data-testid="site-drawer-my-bookings"]'), 'drawer My Bookings missing');
    assert.ok(drawer.querySelector('[data-testid="site-drawer-logout"]'), 'drawer Logout missing');
    await act(async () => { fireEvent.click(drawer.querySelector('[data-testid="site-drawer-lang-hi"]')); });
    assert.equal(drawer.querySelector('[data-testid="site-drawer-my-bookings"]').textContent.includes('मेरी बुकिंग'), true);
    assert.equal(drawer.querySelector('[data-testid="site-drawer-logout"]').textContent.includes('लॉग आउट'), true);
    signOutCalls = 0;
    await act(async () => { fireEvent.click(drawer.querySelector('[data-testid="site-drawer-logout"]')); });
    assert.ok(signOutCalls >= 1, 'drawer auth.signOut was not called');
    await act(async () => { await Promise.resolve(); });
    // Drawer closes on logout — reopen to inspect the logged-out drawer.
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-menu-button"]')); });
    const drawerAfter = document.querySelector('[data-testid="site-mobile-drawer"]');
    assert.ok(drawerAfter.querySelector('[data-testid="site-drawer-login"]'), 'drawer Login did not reappear after logout');
    assert.equal(drawerAfter.querySelector('[data-testid="site-drawer-logout"]'), null, 'drawer Logout still shown after logout');
  });
  cleanup();
}

console.log('\n────────────────────────────────────────');
console.log(`Header auth & locale: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}`);
}
console.log('Logout and EN/हिन्दी language switcher verified.');
// The real Supabase client keeps background timers alive, so exit explicitly.
process.exit(failures.length > 0 ? 1 : 0);
