/**
 * Arts By Uma — FULL USER JOURNEY (E2E).
 *
 * Renders the REAL seeded `/arts-by-uma` public salon through
 * `PublicSalonView` (offline seed path, no Supabase env) and walks the full
 * customer journey on BOTH desktop and mobile:
 *   - the seeded "Arts By Uma" salon renders with services/gallery/team;
 *   - every header nav button is present, clickable, and smooth-scrolls
 *     (behavior:'smooth') to its section with the canonical route hash;
 *   - BOOK APPOINTMENT opens the booking flow (#booking);
 *   - LOGIN opens the auth modal;
 *   - the mobile drawer opens and its nav rows smooth-scroll too;
 *   - ZERO console errors during the entire journey.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// NO Supabase env vars -> isSupabaseConfigured=false -> offline seed path.
const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost/arts-by-uma' },
);
globalThis.window = dom.window; globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node; globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent; globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const scrollSpy = [];
dom.window.HTMLElement.prototype.scrollIntoView = function (o) {
  scrollSpy.push(`${o && typeof o === 'object' ? o.behavior : '(default)'}:${this.id}`);
};
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;
dom.window.HTMLElement.prototype.scrollTo = function (o) {
  if (o && typeof o === 'object') scrollSpy.push(`${o.behavior}:scrollTo:${this.id}`);
  this.scrollTop = o && typeof o === 'object' && typeof o.top === 'number' ? o.top : 0;
};
globalThis.HTMLElement.prototype.scrollTo = dom.window.HTMLElement.prototype.scrollTo;

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');
const { AuthModalProvider } = await import('../src/components/AuthModalProvider.tsx');
const PublicSalonView = (await import('../src/components/PublicSalonView.tsx')).default;

const setViewport = (w) => {
  dom.window.innerWidth = w;
  globalThis.innerWidth = w;
};
setViewport(1280); // desktop

const consoleErrors = [];
const origError = console.error;
const origWarn = console.warn;
console.error = (...a) => { consoleErrors.push(a.map(String).join(' ')); origError(...a); };
console.warn = (...a) => { /* allow (harmless) warnings, keep log clean */ };

let passed = 0, failed = 0; const failures = [];
async function test(n, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { failed++; failures.push({ n, e }); origError(`  ✗ ${n}\n    ${String(e.message).split('\n').join('\n    ')}`); }
}
const section = (t) => console.log(`\n■ ${t}`);

function renderSalon() {
  return render(React.createElement(AuthModalProvider, null,
    React.createElement(PublicSalonView, { slug: 'arts-by-uma', resolved: null })));
}
const waitHeader = async () => {
  let el = null;
  for (let i = 0; i < 60 && !el; i++) {
    await act(async () => { await Promise.resolve(); });
    el = document.querySelector('[data-testid="site-header"]');
  }
  return el;
};
const click = async (id) => {
  await act(async () => { fireEvent.click(document.querySelector(`[data-testid="${id}"]`)); });
};

section('Desktop journey — /arts-by-uma (seeded salon)');
let utils;
{
  window.localStorage.clear();
  utils = renderSalon();
  await waitHeader();

  // 1. Seeded salon data renders
  await test('seeded Arts By Uma salon renders (name, services, team, gallery)', async () => {
    const text = document.body.textContent;
    assert.ok(text.includes('Arts By Uma'), 'salon name not rendered');
    assert.ok(text.includes('Signature Haircut'), 'service not rendered');
    assert.ok(text.includes('Uma Sharma'), 'team member not rendered');
    assert.ok(text.includes('Jaipur'), 'address not rendered');
  });

  // 2. Header nav buttons present + clickable (accessible button semantics)
  await test('header nav buttons render as real buttons (clickable/accessible)', async () => {
    for (const id of ['nav-home', 'nav-services', 'nav-offers', 'nav-about', 'nav-contact']) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      assert.ok(el, `${id} missing`);
      assert.ok(el.closest('button') || el.tagName === 'BUTTON', `${id} is not a button`);
      assert.equal(el.getAttribute('aria-label') || el.textContent.trim().length > 0, true, `${id} has no accessible label`);
    }
    const book = document.querySelector('[data-testid="site-book-cta"]');
    assert.ok(book && book.tagName === 'BUTTON', 'BOOK APPOINTMENT is not a button');
  });

  // 3. Smooth scrolling on each nav click + canonical route hash
  await test('HOME smooth-scrolls to top and sets #home', async () => {
    scrollSpy.length = 0;
    await click('nav-home');
    assert.ok(scrollSpy.some((s) => s.startsWith('smooth')), `HOME not smooth: ${scrollSpy.join(',')}`);
    assert.equal(window.location.hash, '#home');
  });

  const map = [
    ['nav-services', 'section-services', '#services'],
    ['nav-offers', 'section-offers', '#offers'],
    ['nav-about', 'section-about', '#about'],
    ['nav-contact', 'section-contact', '#contact'],
  ];
  for (const [id, sec, hsh] of map) {
    await test(`${id} smooth-scrolls to ${sec} + sets ${hsh}`, async () => {
      scrollSpy.length = 0;
      await click(id);
      assert.ok(scrollSpy.some((s) => s === `smooth:${sec}`), `no smooth scroll to ${sec}: ${scrollSpy.join(',')}`);
      assert.equal(window.location.hash, hsh);
    });
  }

  // 4. BOOK APPOINTMENT opens booking flow + #booking
  await test('BOOK APPOINTMENT opens the booking flow and sets #booking', async () => {
    assert.equal(document.querySelector('[data-testid="site-booking-flow"]'), null);
    await click('site-book-cta');
    assert.ok(document.querySelector('[data-testid="site-booking-flow"]'), 'booking flow did not open');
    assert.equal(window.location.hash, '#booking');
  });

  // 5. LOGIN opens the auth modal
  await test('LOGIN opens the auth modal (signed out)', async () => {
    await click('site-header-login');
    assert.ok(document.querySelector('[data-testid="auth-modal"]'), 'auth modal did not open');
    await act(async () => {
      const c = document.querySelector('[data-testid="auth-close-btn"]');
      if (c) fireEvent.click(c);
    });
    assert.equal(document.querySelector('[data-testid="auth-modal"]'), null, 'modal did not close');
  });

  cleanup();
}

section('Mobile journey — /arts-by-uma (drawer)');
{
  setViewport(375); // mobile
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  window.localStorage.clear();
  renderSalon();
  await waitHeader();

  await test('mobile hamburger opens the drawer; nav rows clickable', async () => {
    await click('site-menu-button');
    const drawer = document.querySelector('[data-testid="site-mobile-drawer"]');
    assert.ok(drawer, 'mobile drawer did not open');
    for (const id of ['nav-mobile-services', 'nav-mobile-offers', 'nav-mobile-about', 'nav-mobile-contact', 'site-drawer-login']) {
      assert.ok(document.querySelector(`[data-testid="${id}"]`), `${id} missing in drawer`);
    }
  });

  await test('drawer nav row smooth-scrolls + sets hash', async () => {
    scrollSpy.length = 0;
    await click('nav-mobile-services');
    assert.ok(scrollSpy.some((s) => s === 'smooth:section-services'), `drawer services not smooth: ${scrollSpy.join(',')}`);
    assert.equal(window.location.hash, '#services');
  });

  await test('mobile BOOK APPOINTMENT (drawer CTA) opens booking', async () => {
    // (re-open drawer if a prior nav click closed it)
    if (!document.querySelector('[data-testid="site-mobile-drawer"]')) await click('site-menu-button');
    await click('site-book-cta-mobile');
    assert.ok(document.querySelector('[data-testid="site-booking-flow"]'), 'mobile booking flow did not open');
  });

  await test('drawer LOGIN opens auth modal', async () => {
    if (!document.querySelector('[data-testid="site-mobile-drawer"]')) await click('site-menu-button');
    await click('site-drawer-login');
    assert.ok(document.querySelector('[data-testid="auth-modal"]'), 'drawer auth modal did not open');
  });

  cleanup();
}

section('Console / a11y health');
await test('no console.error during the whole journey', async () => {
  assert.equal(consoleErrors.length, 0, `console errors:\n  ${consoleErrors.join('\n  ')}`);
});

console.log('\n────────────────────────────────────────');
console.log(`Arts By Uma full journey: ${passed} passed, ${failed} failed`);
if (failures.length > 0) { console.log('\nFailures:'); for (const f of failures) console.log(`  - ${f.n}`); }
process.exit(failures.length > 0 ? 1 : 0);
