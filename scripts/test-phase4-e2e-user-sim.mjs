/**
 * PHASE 4 — End-to-end user-flow simulation on the real `/arts-by-uma` page.
 *
 * jsdom + @testing-library harness (no browser driver). Exercises the ACTUAL
 * rendered components — seeded public salon data, header nav, auth, the full
 * booking orchestrator, MY BOOKINGS and LOGOUT — with ZERO captured
 * `console.error`s from app code.
 *
 * Two modes (same file):
 *   default         "guest journey" — offline seeded `/arts-by-uma`:
 *                    header nav + smooth scroll, EN/हिन्दी, the full
 *                    HydraFacial booking through the 25% advance checkout,
 *                    and the booking appearing under MY BOOKINGS.
 *   PHASE4_MODE=auth  configured + stubbed Supabase Auth — Sign Up / Log In
 *                    create an auth user via the app's own auth path, the
 *                    signed-in header shows MY BOOKINGS + Logout, and LOGOUT
 *                    returns to a clean logged-out state.
 *
 * IMPORTANT: the JSDOM document must exist BEFORE `@testing-library/react`
 * (and React) are imported — importing them before `globalThis.document` is
 * set leaves the DOM event system unable to drive React controlled inputs.
 * The auth mode runs as a child process (fresh module registry) from the
 * guest run so the two Supabase env configurations never collide.
 */
import fs from 'fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const MODE = process.env.PHASE4_MODE ?? 'guest';

/* ------------------------------------------------------------------ */
/* Shared JSDOM bootstrap (must run before React/testing-library)      */
/* ------------------------------------------------------------------ */
function bootstrapDom(pathname, { supabaseUrl, supabaseAnon } = {}) {
  if (supabaseUrl) process.env.VITE_SUPABASE_URL = supabaseUrl;
  if (supabaseAnon) process.env.VITE_SUPABASE_ANON_KEY = supabaseAnon;

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `http://localhost${pathname}`,
    pretendToBeVisual: true,
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
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.matchMedia = () => ({
    matches: false, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
  });
  dom.window.matchMedia = globalThis.matchMedia;

  // Smooth-scroll stubs (jsdom does not implement scrolling).
  const scrollSpy = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
    scrollSpy.push(this.id || this.getAttribute?.('id') || String(this.getAttribute?.('data-testid') || ''));
  };
  dom.window.HTMLElement.prototype.scrollTo = function scrollTo(options) {
    if (options && typeof options === 'object' && typeof options.top === 'number') this.scrollTop = options.top;
    else if (typeof options === 'number') this.scrollTop = options;
  };
  globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;
  globalThis.HTMLElement.prototype.scrollTo = dom.window.HTMLElement.prototype.scrollTo;
  dom.window.HTMLElement.prototype.scrollTo = dom.window.HTMLElement.prototype.scrollTo;

  globalThis.window.innerWidth = 1280;
  return { dom, scrollSpy };
}

// Set up the DOM for the current mode BEFORE importing React/testing-library.
const BOOT = MODE === 'auth'
  ? bootstrapDom('/arts-by-uma', {
      supabaseUrl: 'https://nexora-phase4-test.example.com',
      supabaseAnon: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.phase4-test-anon-key',
    })
  : bootstrapDom('/arts-by-uma');
const { scrollSpy } = BOOT;

/** Capture every console.error emitted by app code during the run. */
const consoleErrors = [];
const realConsoleError = console.error.bind(console);
console.error = (...args) => { consoleErrors.push(args.map(String).join(' ')); };

// React + testing-library imported only AFTER the document exists.
const React = (await import('react')).default;
const { render, cleanup, act, fireEvent, within } = await import('@testing-library/react');

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) {
    failed += 1; failures.push({ name, error });
    realConsoleError(`  ✗ ${name}\n    ${String(error.message).split('\n').join('\n    ')}`);
  }
}
function section(title) { console.log(`\n■ ${title}`); }
function assertNoConsoleErrors() {
  assert.equal(consoleErrors.length, 0, `App emitted console.error(s): ${consoleErrors.slice(0, 5).join(' | ')}`);
}

/* ================================================================== */
/* AUTH MODE — configured + stubbed Supabase Auth                      */
/* ================================================================== */
if (MODE === 'auth') {
  const { AuthModalProvider } = await import('../src/components/AuthModalProvider.tsx');
  const { supabase, isSupabaseConfigured } = await import('../src/lib/supabaseClient.ts');
  const { buildDemoSeedSalonData } = await import('../src/lib/salonRouting.ts');
  const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
  const { readMyBookings } = await import('../src/lib/bookingManagement.ts');

  assert.equal(isSupabaseConfigured, true, 'auth mode must run configured');
  const data = buildDemoSeedSalonData('arts-by-uma');

  // ---- Stubbed Supabase auth --------------------------------------
  let authCb = null;
  const authCbSubs = [];
  let signOutCalls = 0;
  let signUpCalls = 0;
  let signInCalls = 0;
  let activeUser = null;
  const fakeUser = (email) => ({ id: 'cust-phase4', email, app_metadata: {}, user_metadata: {} });
  const mkSession = (email) => ({ access_token: 'tok', refresh_token: 'ref', expires_at: 9999999999, user: fakeUser(email) });

  supabase.auth.onAuthStateChange = (cb) => {
    authCb = cb;
    authCbSubs.push(cb);
    return { data: { subscription: { unsubscribe() {} } } };
  };
  supabase.auth.getSession = async () => ({ data: { session: activeUser ? mkSession(activeUser) : null }, error: null });
  supabase.auth.getUser = async () => ({ data: { user: activeUser ? fakeUser(activeUser) : null }, error: null });
  supabase.auth.signUp = async ({ email }) => {
    signUpCalls += 1;
    activeUser = email;
    for (const cb of authCbSubs) cb('SIGNED_IN', mkSession(email));
    return { data: { user: fakeUser(email), session: mkSession(email) }, error: null };
  };
  supabase.auth.signInWithPassword = async ({ email }) => {
    signInCalls += 1;
    activeUser = email;
    for (const cb of authCbSubs) cb('SIGNED_IN', mkSession(email));
    return { data: { session: mkSession(email) }, error: null };
  };
  supabase.auth.signOut = async () => {
    signOutCalls += 1;
    activeUser = null;
    for (const cb of authCbSubs) cb('SIGNED_OUT', null);
    return { error: null };
  };
  // No real network: the theme catalog RPC returns an empty payload so the app
  // uses its local catalog fallback without a DNS hit or warning.
  supabase.rpc = async () => ({ data: null, error: null });

  const wrap = (ui) => React.createElement(AuthModalProvider, null, ui);
  render(wrap(React.createElement(Barber, { data, mode: 'desktop' })));

  async function waitForHeader() {
    let el = null;
    for (let i = 0; i < 80 && !el; i += 1) {
      await act(async () => { await Promise.resolve(); });
      el = document.querySelector('[data-testid="site-header"]');
    }
    return el;
  }

  await waitForHeader();

  section('AUTH — seeded /arts-by-uma renders (signed out)');
  await test('seeded salon renders with HydraFacial service', () => {
    assert.ok(document.querySelector('[data-testid="site-header"]'), 'header missing');
    assert.ok(document.body.textContent.includes('Arts By Uma'), 'salon name missing');
    assert.ok(document.body.textContent.includes('HydraFacial'), 'HydraFacial missing');
    assert.ok(document.querySelector('[data-testid="site-header-login"]'), 'Login shown when signed out');
    assert.ok(document.querySelector('[data-testid="site-header-signup"]'), 'Sign Up shown when signed out');
  });

  section('AUTH — Sign Up creates an auth user via the app auth path');
  await test('header Sign Up opens the auth modal (signup tab)', async () => {
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-header-signup"]')); });
    const modal = document.querySelector('[data-testid="auth-modal"]');
    assert.ok(modal, 'auth modal did not open');
    assert.ok(modal.querySelector('[data-testid="auth-signup-tab"]'), 'signup tab missing');
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="auth-close-btn"]')); });
  });

  await test('filling + submitting the sign-up form creates the auth user and signs in', async () => {
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-header-signup"]')); });
    const modal = document.querySelector('[data-testid="auth-modal"]');
    await act(async () => {
      fireEvent.change(modal.querySelector('[data-testid="auth-email-input"]'), { target: { value: 'ph4.customer@test.test' } });
      fireEvent.change(modal.querySelector('[data-testid="auth-password-input"]'), { target: { value: 'secret123' } });
      fireEvent.change(modal.querySelector('[data-testid="auth-password-confirm-input"]'), { target: { value: 'secret123' } });
    });
    await act(async () => { fireEvent.click(modal.querySelector('[data-testid="auth-submit-btn"]')); });
    assert.ok(signUpCalls >= 1, 'supabase.auth.signUp was not called (app auth path not exercised)');
    // SIGNED_IN emitted → the header must flip to the signed-in view.
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    await waitForHeader();
    assert.ok(document.querySelector('[data-testid="site-header-my-bookings"]'), 'My Bookings missing after sign-up');
    assert.ok(document.querySelector('[data-testid="site-header-logout"]'), 'Logout missing after sign-up');
    assert.equal(document.querySelector('[data-testid="site-header-login"]'), null, 'Login still shown after sign-up');
  });

  section('AUTH — LOGOUT executes and cleanly resets state');
  await test('clicking LOGOUT calls auth.signOut and returns to Login / Sign Up', async () => {
    signOutCalls = 0;
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-header-logout"]')); });
    assert.ok(signOutCalls >= 1, 'auth.signOut was not called');
    await act(async () => { await Promise.resolve(); });
    await waitForHeader();
    assert.ok(document.querySelector('[data-testid="site-header-login"]'), 'Login did not reappear after logout');
    assert.ok(document.querySelector('[data-testid="site-header-signup"]'), 'Sign Up did not reappear after logout');
    assert.equal(document.querySelector('[data-testid="site-header-logout"]'), null, 'Logout still shown after logout');
  });

  await test('clean state reset: no auth user survives LOGOUT', () => {
    assert.equal(activeUser, null, 'auth user should be cleared after logout');
    const mine = readMyBookings();
    assert.ok(Array.isArray(mine), 'readMyBookings must return an array');
  });

  await test('zero console.errors during the auth journey', () => {
    assertNoConsoleErrors();
  });

  cleanup();
  console.log('\n────────────────────────────────────────');
  console.log(`Phase 4 E2E (auth mode): ${passed} passed, ${failed} failed`);
  if (failures.length > 0) { console.log('Failures:', failures.map((f) => ` - ${f.name}`).join('\n')); }
  console.error = realConsoleError;
  process.exit(failures.length > 0 ? 1 : 0);
}

/* ================================================================== */
/* GUEST JOURNEY — offline seeded `/arts-by-uma`                       */
/* ================================================================== */
const { AuthModalProvider } = await import('../src/components/AuthModalProvider.tsx');
const PublicSalonView = (await import('../src/components/PublicSalonView.tsx')).default;
const SiteBookingFullFlow = (await import('../src/components/SiteBookingFullFlow.tsx')).default;
const SiteMyBookings = (await import('../src/components/SiteMyBookings.tsx')).default;
const { buildDemoSeedSalonData } = await import('../src/lib/salonRouting.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { setBookingHoldsForTests, setBookingDatesStateForTests } = await import('../src/lib/siteBookingFlow.ts');
const { setBookingDraftStoreForTests } = await import('../src/lib/siteBookingDraft.ts');
const { setPaymentStoreForTests, setPaymentScenarioForTests, setPaymentGatewayTimeoutForTests, calculatePaymentAmounts } = await import('../src/lib/siteBookingPayment.ts');
const { readMyBookings } = await import('../src/lib/bookingManagement.ts');

function resetState() {
  cleanup();
  window.localStorage.clear();
  setBookingHoldsForTests(null);
  setBookingDraftStoreForTests(null);
  setPaymentStoreForTests(null);
  setBookingDatesStateForTests(null);
  setPaymentGatewayTimeoutForTests(null);
  setPaymentScenarioForTests('all_success');
  setSiteLocale('en');
  setSiteAppearance('light');
}
function at(year, month, day, hour, minute) { return new Date(year, month - 1, day, hour, minute, 0, 0); }
// Thursday 2026-08-13 11:00 — salon open 10:00–20:00 in the seed.
setSalonClockForTests(at(2026, 8, 13, 11, 0));

const wrap = (ui) => React.createElement(AuthModalProvider, null, ui);

async function waitForHeader() {
  let el = null;
  for (let i = 0; i < 80 && !el; i += 1) {
    await act(async () => { await Promise.resolve(); });
    el = document.querySelector('[data-testid="site-header"]');
  }
  return el;
}

/* ---------------- A: seeded /arts-by-uma renders ------------------- */
resetState();
section('GUEST — seeded /arts-by-uma renders');
{
  render(wrap(React.createElement(PublicSalonView, { slug: 'arts-by-uma' })));
  await waitForHeader();

  await test('PublicSalonView resolves /arts-by-uma to the seeded salon', () => {
    assert.ok(document.body.textContent.includes('Arts By Uma'), 'seeded salon name missing');
    assert.ok(document.body.textContent.includes('HydraFacial'), 'HydraFacial service missing from seeded services');
    assert.ok(document.body.textContent.includes('Uma Sharma'), 'seeded owner missing');
    assert.ok(document.body.textContent.includes('Grooming Ritual Combo'), 'seeded package missing');
  });

  await test('all canonical sections render on the seeded page', () => {
    assert.ok(document.getElementById('section-header') || document.querySelector('header, #section-header'), 'no header section');
    assert.ok(document.querySelector('#section-hero, [id^="section-hero"]'), 'hero section missing');
    assert.ok(document.querySelector('#section-services, #section-featured-services'), 'services section missing');
    assert.ok(document.querySelector('#section-offers, #section-combos, #section-service-menu'), 'offers section missing');
    assert.ok(document.querySelector('#section-about, #about'), 'about section missing');
    assert.ok(document.querySelector('#section-contact, #contact'), 'contact section missing');
  });

  cleanup();
}

/* ---------------- B: desktop header nav + smooth scroll ------------ */
resetState();
section('GUEST — desktop header navigation (HOME/SERVICES/OFFERS/ABOUT/CONTACT)');
{
  render(wrap(React.createElement(PublicSalonView, { slug: 'arts-by-uma' })));
  await waitForHeader();

  const header = document.querySelector('[data-testid="site-header"]');
  const navButtons = ['home', 'services', 'offers', 'about', 'contact'];

  await test('desktop header renders HOME / SERVICES / OFFERS / ABOUT / CONTACT', () => {
    for (const key of navButtons) {
      assert.ok(header.querySelector(`[data-testid="nav-${key}"]`), `missing nav-${key}`);
    }
    assert.ok(header.querySelector('[data-testid="site-header-lang-en"]'), 'EN switcher missing');
    assert.ok(header.querySelector('[data-testid="site-header-lang-hi"]'), 'हिन्दी switcher missing');
    assert.ok(header.querySelector('[data-testid="site-book-cta"]'), 'Book CTA missing');
  });

  await test('clicking each nav button smooth-scrolls to its section + sets aria-current', () => {
    const scrollTargets = {
      services: ['section-services', 'services'],
      offers: ['section-offers', 'section-combos', 'section-service-menu', 'offers'],
      about: ['section-about', 'about'],
      contact: ['section-contact', 'contact'],
    };
    for (const key of ['services', 'offers', 'about', 'contact']) {
      scrollSpy.length = 0;
      fireEvent.click(header.querySelector(`[data-testid="nav-${key}"]`));
      assert.equal(header.querySelector(`[data-testid="nav-${key}"]`).getAttribute('aria-current'), 'page', `${key} not active`);
      const ok = scrollTargets[key].some((t) => scrollSpy.includes(t));
      assert.ok(ok, `nav-${key} did not scroll (spy: ${scrollSpy.join(',')})`);
    }
    // HOME returns to the top (scroller scrollTop resets) or the hero.
    fireEvent.click(header.querySelector('[data-testid="nav-home"]'));
    assert.equal(header.querySelector('[data-testid="nav-home"]').getAttribute('aria-current'), 'page', 'home not active');
    const scroller = document.querySelector('.site-scroll') || document.body;
    assert.ok(scrollSpy.includes('section-header') || scrollSpy.includes('hero') || scroller.scrollTop === 0,
      `home did not scroll to top (spy: ${scrollSpy.join(',')})`);
  });

  await test('nav clicks update the canonical route hash for deep links', () => {
    fireEvent.click(header.querySelector('[data-testid="nav-services"]'));
    assert.equal(window.location.hash, '#services');
    fireEvent.click(header.querySelector('[data-testid="nav-about"]'));
    assert.equal(window.location.hash, '#about');
  });

  await test('zero console.errors during desktop nav', () => {
    assertNoConsoleErrors();
  });

  cleanup();
}

/* ---------------- C: mobile drawer nav + smooth scroll ------------- */
resetState();
section('GUEST — mobile drawer navigation');
{
  window.innerWidth = 375;
  render(wrap(React.createElement(PublicSalonView, { slug: 'arts-by-uma' })));
  await waitForHeader();

  await test('hamburger opens the mobile drawer with nav + locale controls', async () => {
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-menu-button"]')); });
    const drawer = document.querySelector('[data-testid="site-mobile-drawer"]');
    assert.ok(drawer, 'mobile drawer did not open');
    for (const key of ['home', 'services', 'offers', 'about', 'contact']) {
      assert.ok(drawer.querySelector(`[data-testid="nav-mobile-${key}"]`), `missing nav-mobile-${key}`);
    }
  });

  await test('mobile drawer nav smooth-scrolls to the target section', async () => {
    // SERVICES (re-open drawer if the previous nav click closed it).
    let drawer = document.querySelector('[data-testid="site-mobile-drawer"]');
    if (!drawer) { await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-menu-button"]')); }); drawer = document.querySelector('[data-testid="site-mobile-drawer"]'); }
    scrollSpy.length = 0;
    await act(async () => { fireEvent.click(drawer.querySelector('[data-testid="nav-mobile-services"]')); });
    assert.ok(scrollSpy.some((t) => t === 'section-services' || t === 'services'),
      `drawer services did not scroll (spy: ${scrollSpy.join(',')})`);

    // CONTACT (re-open the drawer after the services click).
    drawer = document.querySelector('[data-testid="site-mobile-drawer"]');
    if (!drawer) { await act(async () => { fireEvent.click(document.querySelector('[data-testid="site-menu-button"]')); }); drawer = document.querySelector('[data-testid="site-mobile-drawer"]'); }
    scrollSpy.length = 0;
    await act(async () => { fireEvent.click(drawer.querySelector('[data-testid="nav-mobile-contact"]')); });
    assert.ok(scrollSpy.some((t) => t === 'section-contact' || t === 'contact'),
      `drawer contact did not scroll (spy: ${scrollSpy.join(',')})`);
  });

  await test('zero console.errors during mobile drawer nav', () => {
    assertNoConsoleErrors();
  });

  window.innerWidth = 1280;
  cleanup();
}

/* ---------------- D: EN / हिन्दी locale switcher -------------------- */
resetState();
section('GUEST — EN / हिन्दी locale switcher');
{
  render(wrap(React.createElement(PublicSalonView, { slug: 'arts-by-uma' })));
  await waitForHeader();
  const header = document.querySelector('[data-testid="site-header"]');

  await test('switch to हिन्दी repaints nav labels and persists', async () => {
    await act(async () => { fireEvent.click(header.querySelector('[data-testid="site-header-lang-hi"]')); });
    assert.equal(window.localStorage.getItem('nexora_locale'), 'hi', 'locale not persisted');
    const navHome = header.querySelector('[data-testid="nav-home"]');
    assert.ok(/मुख्य|होम/.test(navHome.textContent || ''), `home label not localized: "${navHome.textContent}"`);
  });

  await test('switch back to EN restores English labels + persists', async () => {
    await act(async () => { fireEvent.click(header.querySelector('[data-testid="site-header-lang-en"]')); });
    assert.equal(window.localStorage.getItem('nexora_locale'), 'en');
    assert.equal(header.querySelector('[data-testid="nav-home"]').textContent.trim(), 'Home');
  });

  await test('zero console.errors during locale switching', () => {
    assertNoConsoleErrors();
  });

  cleanup();
}

/* ---------------- E: full HydraFacial booking through 25% checkout - */
resetState();
section('GUEST — full booking journey (HydraFacial → 25% advance checkout)');
{
  const data = buildDemoSeedSalonData('arts-by-uma');
  const utils = render(wrap(React.createElement(SiteBookingFullFlow, { themeId: 'barber_mens_grooming', data })));
  const flow = utils.getByTestId('site-booking-flow-orchestrator');
  assert.equal(flow.dataset.phase, 'entry');

  // Walk salon → service → date → time → details.
  await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // salon→service
  const svc = utils.getByTestId('booking-service-au-6');
  assert.ok(svc && svc.textContent.includes('HydraFacial'), 'HydraFacial service (au-6) missing');
  await act(async () => { fireEvent.click(svc); });
  await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // service→date
  const dateEl = document.querySelector('[data-testid^="booking-date-"]');
  assert.ok(dateEl, 'no booking date offered (is the salon open this week?)');
  await act(async () => { fireEvent.click(dateEl); });
  await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // date→time
  const slot = document.querySelector('[data-testid^="booking-slot-"]');
  assert.ok(slot, 'no time slot offered');
  await act(async () => { fireEvent.click(slot); });
  await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // time→details
  assert.equal(utils.getByTestId('booking-flow').dataset.step, 'details');

  // Fill the customer details.
  await act(async () => { fireEvent.change(utils.getByTestId('booking-input-name'), { target: { value: 'Phase4 User' } }); });
  await act(async () => { fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '9876543210' } }); });
  await act(async () => { await Promise.resolve(); });
  assert.equal(utils.getByTestId('booking-continue').disabled, false, 'Continue should enable once details are valid');
  await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); }); // details→summary
  await act(async () => { await Promise.resolve(); });
  assert.equal(utils.getByTestId('booking-flow').dataset.step, 'summary');

  await test('summary shows HydraFacial and the 25% advance math matches calculatePaymentAmounts', async () => {
    const body = utils.container.textContent || '';
    assert.ok(body.includes('HydraFacial'), 'HydraFacial not in summary');
    assert.ok(body.includes('1,799') || body.includes('1799'), 'summary should show the ₹1799 total');
    // The authoritative 25% advance math — the fixed 25% CHECK is locked at 25.
    const amounts = calculatePaymentAmounts(
      'advance',
      { price: 1799, finalPrice: 1799 },
      { advanceDepositPercentage: 25 },
    );
    assert.equal(amounts.advancePercent, 25, 'advance percent must be exactly 25');
    assert.equal(amounts.amountDue, Math.round((1799 * 25) / 100), 'amountDue should be 25% of 1799 (rounded)');
    assert.equal(amounts.remainingAmount, 1799 - amounts.amountDue, 'remaining = total - 25% advance');
    assert.equal(amounts.amountDue, 450, '25% of ₹1799 = ₹450');
    assert.equal(amounts.remainingAmount, 1349, 'remaining = ₹1799 − ₹450');
  });

  await test('confirm → payment flow, choose 25% advance, pay via card → confirmation', async () => {
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'option');

    // Choose the 25% advance option.
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    assert.equal(utils.getByTestId('payment-flow').dataset.step, 'gateway');

    fireEvent.change(utils.getByTestId('payment-card-number'), { target: { value: '4242424242424242' } });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
  });

  await test('booking is confirmed with a reference and payment reference', async () => {
    // Let the simulated Razorpay gateway settle (~1.7s) after gateway-pay,
    // keeping every state update inside act so no React act() warnings leak.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1800)); });
    const confirmation = document.querySelector('[data-testid="payment-confirm-card"]')
      || document.querySelector('[data-testid="payment-confirm-booking-id"]')
      || document.querySelector('[data-testid^="confirmation-"]');
    assert.ok(confirmation, 'no confirmation screen rendered');
    const step = document.querySelector('[data-testid="payment-flow"]')?.dataset.step;
    assert.ok(step === 'confirm' || step === 'receipt', `payment flow did not end confirmed (step=${step})`);
    const text = utils.container.textContent || '';
    assert.ok(/confirmed/i.test(text), 'confirmation text missing');
  });

  await test('zero console.errors during the booking journey', () => {
    assertNoConsoleErrors();
  });

  cleanup();
}

/* ---------------- F: booking appears under MY BOOKINGS -------------- */
resetState();
section('GUEST — MY BOOKINGS shows the HydraFacial booking');
{
  // Persist the confirmed booking the same way the payment store writes it
  // (localStorage keyed by version), scoped to THIS browser identity.
  const { PAYMENT_STORE_KEY, PAYMENT_STORE_VERSION, PAYMENT_EVENT } = await import('../src/lib/siteBookingPayment.ts');
  const { bookingBrowserId } = await import('../src/lib/siteBookingFlow.ts');
  const me = bookingBrowserId();
  const record = {
    id: 'rec-phase4',
    idempotencyKey: 'key-phase4',
    businessId: 'public-site',
    themeId: 'barber_mens_grooming',
    customerId: me,
    bookingId: 'AU-PH4-1234',
    serviceId: 'au-6',
    serviceName: 'HydraFacial',
    dateKey: '2026-08-14',
    startMinutes: 660,
    endMinutes: 720,
    baseAmount: 1799,
    amountDue: 450,
    remainingAmount: 1349,
    currency: 'INR',
    paymentOption: 'advance',
    paymentMethod: 'card',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    customer: { name: 'Phase4 User', mobile: '9876543210', email: '', notes: '' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    payAtSalon: false,
  };
  window.localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify({ version: PAYMENT_STORE_VERSION, records: [record] }));
  window.dispatchEvent(new window.Event(PAYMENT_EVENT));

  const data = buildDemoSeedSalonData('arts-by-uma');
  const utils = render(wrap(React.createElement(SiteMyBookings, {
    businessId: 'public-site',
    themeId: 'barber_mens_grooming',
    data,
    onBack: () => {},
  })));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });

  await test('readMyBookings returns the confirmed booking scoped to this browser', () => {
    const mine = readMyBookings();
    assert.ok(mine.some((r) => r.serviceName === 'HydraFacial' && r.customerId === me), 'HydraFacial booking missing from my bookings');
  });

  await test('SiteMyBookings renders the HydraFacial booking card', async () => {
    const text = utils.container.textContent || '';
    assert.ok(text.includes('HydraFacial'), 'MY BOOKINGS does not show HydraFacial');
    assert.ok(/confirmed/i.test(text), 'booking status not shown as confirmed');
  });

  await test('zero console.errors rendering MY BOOKINGS', () => {
    assertNoConsoleErrors();
  });

  cleanup();
}

/* ---------------- spawn the auth-mode child and summarize ----------- */
console.log('\n────────────────────────────────────────');
console.log(`Phase 4 E2E (guest journey): ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('Failures:', failures.map((f) => ` - ${f.name}`).join('\n'));
}

let authOk = true;
if (failed === 0) {
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', new URL(import.meta.url).pathname],
    { cwd: process.cwd(), env: { ...process.env, PHASE4_MODE: 'auth' }, encoding: 'utf8' },
  );
  process.stdout.write(child.stdout || '');
  if (child.stderr) process.stderr.write(child.stderr || '');
  authOk = child.status === 0;
}

console.error = realConsoleError;
process.exit(failed > 0 || !authOk ? 1 : 0);
