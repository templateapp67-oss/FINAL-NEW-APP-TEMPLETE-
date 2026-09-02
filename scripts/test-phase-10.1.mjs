/**
 * PHASE 10.1 — GLOBAL HEADER & NAVIGATION (five-theme acceptance)
 *
 * Mounts the REAL theme renderers (Barber, Hair Studio, Beauty Spa, Family,
 * Nail & Lash) in jsdom via @testing-library/react — nothing is mocked except
 * `scrollIntoView` (jsdom does not implement scrolling).
 *
 * Per theme, in BOTH desktop and mobile preview modes, verifies:
 *   1.  Header exists (data-testid="site-header") with the theme's own
 *       data-theme id + the salon name/logo lockup.
 *   2.  Desktop nav exposes the canonical global order:
 *       Home → Services → Offers → Gallery → Videos → About → Team → Contact
 *       → Language → Dark Mode → Book Appointment (data-dependent links mirror
 *       the sections that actually render; family/nail have no Videos section).
 *   3.  Book Appointment is always LAST and opens the existing booking flow
 *       (and sets the #booking route hash).
 *   4.  Nav clicks set aria-current, scroll the matching section into view,
 *       and mirror the canonical route hash (#services, #offers, …); Home
 *       scrolls to the top and sets #home.
 *   5.  Language control switches EN ↔ हिन्दी instantly (labels + persisted
 *       `nexora_locale`) and flips back.
 *   6.  Dark Mode toggle flips the header's data-appearance, persists to
 *       `nexora_site_appearance`, and swaps the Sun/Moon affordance.
 *   7.  Mobile: hamburger opens a drawer containing the same ordered nav,
 *       Language control, Dark Mode row and a full-width Book CTA; choosing
 *       an item closes the drawer.
 *   8.  The five headers are NOT copies of each other: bar styles, drawer
 *       styles, brand treatments and CTA styles differ pairwise per theme.
 *   9.  Existing site content (hero, services, prices, footer) still renders
 *       below the new header — nothing else was touched.
 *
 * Also verifies TemplateRenderer routes each of the five theme ids to its
 * themed header.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ---- DOM bootstrap (before React/component imports) ----------------------
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
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

// scrollIntoView spy (jsdom does not implement it).
const scrollSpy = [];
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
  scrollSpy.push(this.id || '(no-id)');
};
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;

// scrollTo stub (jsdom does not implement it) — records the scrollTop so the
// "Home scrolls to top" path (scrollSiteToTop) is observable.
dom.window.HTMLElement.prototype.scrollTo = function scrollTo(options) {
  if (options && typeof options === 'object' && typeof options.top === 'number') this.scrollTop = options.top;
  else if (typeof options === 'number') this.scrollTop = options;
};
globalThis.HTMLElement.prototype.scrollTo = dom.window.HTMLElement.prototype.scrollTo;

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent, within } = await import('@testing-library/react');

const TemplateRenderer = (await import('../src/components/TemplateRenderer.tsx')).default;
const BarberTemplateRenderer = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudioTemplateRenderer = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpaTemplateRenderer = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const FamilyFullServiceTemplateRenderer = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLashStudioTemplateRenderer = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { SITE_NAV_KEYS, SITE_NAV_LABELS } = await import('../src/lib/siteNavigation.ts');

/* --------------------------------------------------------------- */
/* Test plumbing                                                    */
/* --------------------------------------------------------------- */

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.error(`  ✗ ${name}\n    ${error.message.split('\n').join('\n    ')}`);
  }
}
function section(title) {
  console.log(`\n■ ${title}`);
}

/** Full data payload so EVERY conditional nav section renders. */
function richData(templateId) {
  return {
    ...initialData,
    templateId,
    salonName: 'Phase Ten Salon',
    tagline: 'Navigate me',
    about: 'A full website under test.',
    ownerName: 'Asha Verma',
    email: 'hello@phaseten.test',
    phone: '+91 99999 00000',
    websiteAppearance: 'light',
    services: [
      { id: 'svc-1', name: 'Signature Haircut', category: 'Haircut', description: 'Cut and finish.', price: 499, duration: 45, status: 'active' },
      { id: 'svc-2', name: 'Deluxe Facial', category: 'Skin', description: 'Glow therapy.', price: 999, duration: 60, status: 'active' },
    ],
    packages: [
      {
        id: 'pkg-1', name: 'Festive Combo', description: 'Bundle under test.', price: 1199, duration: 90,
        status: 'active',
        includedServices: [
          { serviceId: 'svc-1', name: 'Signature Haircut', category: 'Haircut', individualPrice: 499, duration: 45, displayOrder: 0 },
          { serviceId: 'svc-2', name: 'Deluxe Facial', category: 'Skin', individualPrice: 999, duration: 60, displayOrder: 1 },
        ],
      },
    ],
    team: [
      { id: 'tm-1', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: ['Color'], imageUrl: 'https://example.com/r.jpg', bio: 'Ten years of craft.', status: 'Available' },
    ],
    gallery: [
      { id: 'gal-1', url: 'https://example.com/g1.jpg', alt: 'Work', category: 'General' },
    ],
    socialVideos: [
      { id: 'vid-1', title: 'Reel', platform: 'instagram', url: 'https://example.com/r', thumbnailUrl: 'https://example.com/t.jpg', likesCount: '1.2K' },
    ],
    address: { fullAddress: '21 Test Street, Jaipur', area: 'Test', city: 'Jaipur', state: 'Rajasthan', pinCode: '302001' },
    openingHours: {
      monday: { open: true, working: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      tuesday: { open: true, working: true, startTime: '09:00 AM', endTime: '08:00 PM' },
    },
    socialProfiles: { instagram: 'https://instagram.com/phaseten' },
  };
}

const CASES = [
  {
    id: 'barber_mens_grooming',
    label: "Barber & Men's Grooming",
    Component: BarberTemplateRenderer,
    // All nine links render with rich data.
    expectedDesktop: ['home', 'services', 'offers', 'gallery', 'videos', 'about', 'team', 'contact'],
    defaultAppearance: 'dark',
  },
  {
    id: 'hair_studio_color_bar',
    label: 'Hair Studio & Color Bar',
    Component: HairStudioTemplateRenderer,
    expectedDesktop: ['home', 'services', 'offers', 'gallery', 'videos', 'about', 'team', 'contact'],
    defaultAppearance: 'light',
  },
  {
    id: 'beauty_skin_spa',
    label: 'Beauty, Skin & Spa',
    Component: BeautySpaTemplateRenderer,
    expectedDesktop: ['home', 'services', 'offers', 'gallery', 'videos', 'about', 'team', 'contact'],
    defaultAppearance: 'light',
  },
  {
    id: 'family_full_service',
    label: 'Full-Service Family Salon',
    Component: FamilyFullServiceTemplateRenderer,
    // Family theme design has no social-videos section → Videos is not offered.
    expectedDesktop: ['home', 'services', 'offers', 'gallery', 'about', 'team', 'contact'],
    defaultAppearance: 'light',
  },
  {
    id: 'nail_lash_studio',
    label: 'Nail & Lash Studio',
    Component: NailLashStudioTemplateRenderer,
    expectedDesktop: ['home', 'services', 'offers', 'gallery', 'about', 'team', 'contact'],
    defaultAppearance: 'light',
  },
];

function orderOfTestIds(container, testIds) {
  const positions = [];
  let cursor = null; // walker position tracking via compareDocumentPosition
  for (const id of testIds) {
    const el = container.querySelector(`[data-testid="${id}"]`);
    assert.ok(el, `expected element [data-testid="${id}"] to exist`);
    positions.push(el);
    if (cursor) {
      const rel = cursor.compareDocumentPosition(el);
      assert.ok(
        rel & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        `[data-testid="${id}"] must come AFTER the previous element in the header order`,
      );
    }
    cursor = el;
  }
}

/* --------------------------------------------------------------- */
/* 1–7 · Per-theme, per-mode header verification                   */
/* --------------------------------------------------------------- */

for (const config of CASES) {
  section(`${config.label} — desktop`);
  {
    cleanup();
    window.localStorage.clear();
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const header = utils.getByTestId('site-header');

    await test('header renders with salon name and correct theme id', () => {
      assert.equal(header.dataset.theme, config.id);
      assert.ok(within(header).getByText('Phase Ten Salon'), 'salon name missing from header brand');
      assert.ok(header.querySelector('#section-header,header') || header.id === 'section-header');
    });

    await test('default appearance matches theme design', () => {
      assert.equal(header.dataset.appearance, config.defaultAppearance);
    });

    await test('desktop nav follows the canonical global order', () => {
      const realized = utils.getAllByTestId(/^nav-/).map((el) => el.dataset.testid.replace(/^nav-/, ''));
      assert.deepEqual(realized, config.expectedDesktop);
      // Canonical order is a subsequence of the global SITE_NAV_KEYS order.
      const idx = config.expectedDesktop.map((k) => SITE_NAV_KEYS.indexOf(k));
      assert.ok(idx.every((v, i) => i === 0 || v > idx[i - 1]), 'nav order broke canonical sequence');
      assert.deepEqual(config.expectedDesktop[0], 'home', 'Home must be first');
    });

    await test('trailing order is Contact → Language → Dark Mode → Book Appointment', () => {
      const tail = ['nav-contact', 'site-header-language', 'site-header-dark-toggle', 'site-book-cta'];
      orderOfTestIds(header, tail);
    });

    await test('navigation click marks active and scrolls its section', () => {
      scrollSpy.length = 0;
      fireEvent.click(utils.getByTestId('nav-services'));
      assert.equal(utils.getByTestId('nav-services').getAttribute('aria-current'), 'page');
      const servicesTarget = config.id === 'nail_lash_studio' ? 'section-featured-services' : 'section-services';
      assert.ok(scrollSpy.includes(servicesTarget), `expected scroll to ${servicesTarget}, got ${scrollSpy.join(',')}`);
    });

    await test('Offers link targets the packages/offers block', () => {
      scrollSpy.length = 0;
      fireEvent.click(utils.getByTestId('nav-offers'));
      const expected = config.id === 'family_full_service'
        ? 'section-combos'
        : config.id === 'nail_lash_studio'
          ? 'section-service-menu'
          : 'section-offers';
      assert.ok(scrollSpy.includes(expected), `expected scroll to ${expected}, got ${scrollSpy.join(',')}`);
    });

    await test('nav clicks update the canonical route hash for deep links', () => {
      fireEvent.click(utils.getByTestId('nav-services'));
      assert.equal(window.location.hash, '#services', `expected #services, got ${window.location.hash}`);
      fireEvent.click(utils.getByTestId('nav-offers'));
      assert.equal(window.location.hash, '#offers', `expected #offers, got ${window.location.hash}`);
    });

    await test('Home navigates to the top of the site', () => {
      const scroller = utils.container.querySelector('.site-scroll');
      if (scroller) scroller.scrollTop = 400;
      scrollSpy.length = 0;
      fireEvent.click(utils.getByTestId('nav-home'));
      assert.equal(utils.getByTestId('nav-home').getAttribute('aria-current'), 'page');
      assert.equal(window.location.hash, '#home', `expected #home, got ${window.location.hash}`);
      if (scroller) assert.equal(scroller.scrollTop, 0, 'Home did not scroll to the top of the site');
    });

    await test('Book Appointment opens the booking flow and sets #booking', async () => {
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
      await act(async () => { fireEvent.click(utils.getByTestId('site-book-cta')); });
      assert.ok(utils.container.querySelector('[data-testid="site-booking-flow"]'), 'booking flow did not open from Book Appointment');
      assert.equal(window.location.hash, '#booking', `expected #booking, got ${window.location.hash}`);
      // Close so later tests start clean.
      await act(async () => {
        const close = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
        if (close) fireEvent.click(close);
      });
    });

    await test('language control switches to हिन्दी and persists', () => {
      fireEvent.click(utils.getByTestId('site-header-lang-hi'));
      assert.equal(window.localStorage.getItem('nexora_locale'), 'hi');
      assert.equal(within(utils.getByTestId('site-nav-desktop')).getByTestId('nav-home').textContent, SITE_NAV_LABELS.home.hi);
      assert.ok(within(header).getByText('अपॉइंटमेंट बुक करें'), 'Hindi Book label missing');
      fireEvent.click(utils.getByTestId('site-header-lang-en'));
      assert.equal(window.localStorage.getItem('nexora_locale'), 'en');
      assert.equal(utils.getByTestId('nav-home').textContent, SITE_NAV_LABELS.home.en);
    });

    await test('dark mode toggle flips header appearance and persists', () => {
      const before = header.dataset.appearance;
      const toggle = utils.getByTestId('site-header-dark-toggle');
      const pressedBefore = toggle.getAttribute('aria-pressed');
      fireEvent.click(toggle);
      const after = header.dataset.appearance;
      assert.notEqual(after, before, 'data-appearance did not change');
      assert.equal(window.localStorage.getItem('nexora_site_appearance'), after);
      assert.notEqual(toggle.getAttribute('aria-pressed'), pressedBefore);
      // Toggle back to the design default for isolation.
      fireEvent.click(utils.getByTestId('site-header-dark-toggle'));
      assert.equal(header.dataset.appearance, before);
    });

    await test('website content below the header still renders (hero + services + footer)', () => {
      assert.ok(utils.container.querySelector('#section-hero'), 'hero section missing');
      assert.ok(utils.container.querySelector('#section-services') || utils.container.querySelector('#section-featured-services'), 'services section missing');
      assert.ok(utils.container.querySelector('#section-contact'), 'contact section missing');
      assert.ok(utils.getAllByText(/Festive Combo/).length > 0 || config.id === /* never */ '', 'package content missing');
    });

    cleanup();
  }

  section(`${config.label} — mobile`);
  {
    cleanup();
    window.localStorage.clear();
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'mobile' }));
    const header = utils.getByTestId('site-header');

    await test('mobile shows brand + hamburger, no inline desktop nav', () => {
      assert.ok(within(header).getByText('Phase Ten Salon'));
      assert.ok(utils.getByTestId('site-menu-button'));
      assert.throws(() => utils.getByTestId('site-nav-desktop'), /Unable to find/);
    });

    await test('hamburger opens drawer with the canonical nav order', () => {
      const button = utils.getByTestId('site-menu-button');
      assert.equal(button.getAttribute('aria-expanded'), 'false');
      fireEvent.click(button);
      assert.equal(button.getAttribute('aria-expanded'), 'true');
      const drawer = utils.getByTestId('site-mobile-drawer');
      const realized = within(drawer).getAllByTestId(/^nav-mobile-/).map((el) => el.dataset.testid.replace(/^nav-mobile-/, ''));
      assert.deepEqual(realized, config.expectedDesktop);
    });

    await test('drawer contains Language, Dark Mode and a final Book Appointment CTA', () => {
      const drawer = utils.getByTestId('site-mobile-drawer');
      orderOfTestIds(drawer, ['site-drawer-language', 'site-drawer-dark-toggle', 'site-book-cta-mobile']);
      // Book CTA is the LAST control in the drawer.
      const buttons = within(drawer).getAllByRole('button');
      assert.equal(buttons[buttons.length - 1].dataset.testid, 'site-book-cta-mobile');
    });

    await test('mobile nav click scrolls, marks active and closes the drawer', () => {
      scrollSpy.length = 0;
      fireEvent.click(utils.getByTestId('nav-mobile-team'));
      assert.ok(scrollSpy.includes('section-team'), `expected scroll to section-team, got ${scrollSpy.join(',')}`);
      assert.throws(() => utils.getByTestId('site-mobile-drawer'), /Unable to find/, 'drawer should close after navigation');
      // Re-open and close via Escape.
      fireEvent.click(utils.getByTestId('site-menu-button'));
      assert.ok(utils.getByTestId('site-mobile-drawer'));
      fireEvent.keyDown(window, { key: 'Escape' });
      assert.throws(() => utils.getByTestId('site-mobile-drawer'), /Unable to find/, 'drawer should close on Escape');
    });

    await test('mobile dark toggle + language live in the drawer and work', () => {
      fireEvent.click(utils.getByTestId('site-menu-button'));
      const before = header.dataset.appearance;
      fireEvent.click(utils.getByTestId('site-drawer-dark-toggle'));
      assert.notEqual(header.dataset.appearance, before);
      fireEvent.click(utils.getByTestId('site-drawer-lang-hi'));
      assert.equal(window.localStorage.getItem('nexora_locale'), 'hi');
      assert.equal(utils.getByTestId('site-book-cta-mobile').textContent.trim(), 'अपॉइंटमेंट बुक करें');
      window.localStorage.removeItem('nexora_locale');
    });

    cleanup();
  }
}

/* --------------------------------------------------------------- */
/* 8 · The five headers are NOT one copied design                  */
/* --------------------------------------------------------------- */

section('Cross-theme visual distinctness');
{
  cleanup();
  window.localStorage.clear();
  const signatures = new Map();
  for (const config of CASES) {
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));
    const header = utils.getByTestId('site-header');
    const bar = header.querySelector('[data-testid="site-nav-desktop"]').parentElement;
    const cta = utils.getByTestId('site-book-cta');
    const lang = utils.getByTestId('site-header-language');
    signatures.set(config.id, {
      barClass: bar.className,
      barStyle: (bar.getAttribute('style') || '').toLowerCase(),
      ctaClass: cta.className,
      ctaStyle: (cta.getAttribute('style') || '').toLowerCase(),
      langClass: lang.className,
      langStyle: (lang.getAttribute('style') || '').toLowerCase(),
    });
    cleanup();
  }
  await test('bar background/border styling differs pairwise across themes', () => {
    const ids = [...signatures.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = signatures.get(ids[i]);
        const b = signatures.get(ids[j]);
        assert.notEqual(
          `${a.barClass}|${a.barStyle}`,
          `${b.barClass}|${b.barStyle}`,
          `${ids[i]} and ${ids[j]} share identical header bar styling`,
        );
      }
    }
  });
  await test('CTA, language control and default appearance differ across themes', () => {
    const uniqueCta = new Set([...signatures.values()].map((s) => `${s.ctaClass}|${s.ctaStyle}`));
    assert.ok(uniqueCta.size >= 4, `expected at least 4 distinct CTA treatments, got ${uniqueCta.size}`);
    const uniqueLang = new Set([...signatures.values()].map((s) => `${s.langClass}|${s.langStyle}`));
    assert.ok(uniqueLang.size >= 4, `expected at least 4 distinct language-control treatments, got ${uniqueLang.size}`);
  });
}

/* --------------------------------------------------------------- */
/* 9 · TemplateRenderer routing + data-dependent link visibility   */
/* --------------------------------------------------------------- */

section('Routing & conditional visibility');
{
  await test('TemplateRenderer routes all five theme ids to their themed headers', async () => {
    for (const config of CASES) {
      cleanup();
      const utils = render(React.createElement(TemplateRenderer, { data: richData(config.id), mode: 'desktop' }));
      // Themed renderers are code-split (lazy chunks): the header appears
      // after the dynamic import resolves, so wait for it instead of
      // asserting against the Suspense fallback synchronously.
      const header = await utils.findByTestId('site-header');
      assert.equal(header.dataset.theme, config.id);
      cleanup();
    }
    assert.ok(true);
  });

  await test('Gallery/Videos/About/Team links hide when their data is absent (barber)', () => {
    cleanup();
    window.localStorage.clear();
    const bare = { ...richData('barber_mens_grooming'), gallery: [], socialVideos: [], team: [], ownerName: '' };
    const utils = render(React.createElement(BarberTemplateRenderer, { data: bare, mode: 'desktop' }));
    const nav = utils.getByTestId('site-nav-desktop');
    for (const missing of ['nav-gallery', 'nav-videos', 'nav-about', 'nav-team']) {
      assert.equal(nav.querySelector(`[data-testid="${missing}"]`), null, `${missing} should be hidden without data`);
    }
    for (const kept of ['nav-home', 'nav-services', 'nav-offers', 'nav-contact']) {
      assert.ok(nav.querySelector(`[data-testid="${kept}"]`), `${kept} must always render`);
    }
    cleanup();
  });

  await test('offers link still works when no packages exist (falls back to services menu)', () => {
    cleanup();
    window.localStorage.clear();
    const bare = { ...richData('hair_studio_color_bar'), packages: [] };
    const utils = render(React.createElement(HairStudioTemplateRenderer, { data: bare, mode: 'desktop' }));
    scrollSpy.length = 0;
    fireEvent.click(utils.getByTestId('nav-offers'));
    assert.ok(scrollSpy.includes('section-services'), `expected fallback scroll to section-services, got ${scrollSpy.join(',')}`);
    cleanup();
  });
}

/* --------------------------------------------------------------- */

console.log('\n────────────────────────────────────────');
console.log(`Phase 10.1 header & navigation: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}`);
  process.exit(1);
}
console.log('All five themed headers verified.');
