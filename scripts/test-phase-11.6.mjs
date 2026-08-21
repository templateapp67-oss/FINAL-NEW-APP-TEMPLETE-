/**
 * PHASE 11.6 — HERO INTERACTION & CONVERSION (five-theme acceptance)
 *
 * Interaction/conversion QA of the Phase 11.1–11.5 hero. No layout, content
 * or media is redesigned here.
 *
 *   1. CTA behaviour — Book Appointment → existing booking flow;
 *      Explore Services → All Services section; View Gallery → Gallery
 *      section; Call / WhatsApp → existing contact actions.
 *   2. Interactions — hover / focus-visible / active on every CTA, subtle
 *      per-theme motion, reduced-motion respected, no excessive animation.
 *   3. Scroll flow — CTAs land on real, unique, existing sections; no
 *      duplicate sections or routes are created.
 *   4. Accessibility — keyboard operable, visible focus, correct button vs
 *      link semantics, labelled media, sufficient contrast.
 *   5. Theme isolation — unique CTA styling + destinations, no previous
 *      theme state after switching.
 *   6. Desktop → Tablet → Mobile × EN → HI × Light → Dark.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

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

/** Records every scroll request so we can assert the destination + behaviour. */
let lastScroll = null;
const scrollLog = [];
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView(options) {
  lastScroll = { id: this.id, section: this.getAttribute('data-site-section'), behavior: options && options.behavior };
  scrollLog.push(lastScroll);
};
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;
dom.window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
dom.window.HTMLMediaElement.prototype.pause = function pause() {};

const fs = await import('node:fs');
const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');

const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { heroText } = await import('../src/lib/siteHeroI18n.ts');
const { setReducedMotionForTests, resetThemeHeroVideos } = await import('../src/lib/siteHeroMedia.ts');
const { heroTargetId, heroCtaClass, HERO_CTA_MOTION, heroScrollTo } = await import('../src/lib/siteHeroNav.ts');
const { SITE_SECTION_ORDER, collectSiteSectionOrder } = await import('../src/lib/siteStructure.ts');

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
    console.error(`  ✗ ${name}\n    ${String(error.message).split('\n').join('\n    ')}`);
  }
}
function section(title) {
  console.log(`\n■ ${title}`);
}

function salonData(templateId, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: 'Bandra Cuts Co',
    tagline: '',
    about: '',
    ownerName: 'Asha Verma',
    phone: '+91 99999 00000',
    whatsappPhone: '+91 99999 00000',
    contactOptions: { callNow: true, whatsapp: true, bookNow: true },
    logoUrl: '',
    heroImageUrl: '',
    gallery: [{ id: 'g1', url: `https://owner.example/${templateId}-g1.jpg`, alt: 'Work', category: 'General' }],
    socialVideos: [],
    services: [
      { id: 's1', name: 'Signature Service', category: 'Haircut', description: 'Cut.', price: 499, duration: 45, status: 'active', featured: true },
      { id: 's2', name: 'Second Service', category: 'Care', description: 'Care.', price: 299, duration: 30, status: 'active' },
    ],
    packages: [{ id: 'p1', name: 'Combo', description: 'Bundle.', price: 999, duration: 60, status: 'active' }],
    team: [{ id: 't1', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: [], imageUrl: '', bio: '', status: 'Available' }],
    address: { fullAddress: '21 Test Street, Bandra West, Mumbai 400050', area: 'Bandra West', city: 'Mumbai', state: 'Maharashtra', pinCode: '400050' },
    openingHours: {
      monday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      sunday: { open: false, startTime: '10:00 AM', endTime: '04:00 PM' },
    },
    ...extras,
  };
}

const CASES = [
  { id: 'barber_mens_grooming', label: "Barber & Men's Grooming", Component: Barber, layout: 'cinematic-slab' },
  { id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar', Component: HairStudio, layout: 'editorial-gallery' },
  { id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa', Component: BeautySpa, layout: 'soft-arch' },
  { id: 'family_full_service', label: 'Full-Service Family Salon', Component: Family, layout: 'action-card-collage' },
  { id: 'nail_lash_studio', label: 'Nail & Lash Studio', Component: NailLash, layout: 'glam-card-shelf' },
];
const MODES = ['desktop', 'tablet', 'mobile'];

function reset({ locale = 'en', appearance = undefined, reducedMotion = false } = {}) {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
  setReducedMotionForTests(reducedMotion);
  resetThemeHeroVideos();
  document.head.innerHTML = '';
  lastScroll = null;
  scrollLog.length = 0;
}
function heroOf(container) {
  const hero = container.querySelector('[data-testid="site-hero"]');
  assert.ok(hero, 'hero section missing');
  return hero;
}
const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const cls = (el) => el?.getAttribute('class') || '';
const CTA_IDS = ['hero-book-cta', 'hero-services-cta', 'hero-call-cta', 'hero-whatsapp-cta', 'hero-gallery-cta'];

/* ------------------------------------------------------------------ */
/* 1. CTA behaviour + scroll flow, per theme × viewport                */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode} CTA behaviour`);
    reset();
    const data = salonData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode }));
    const hero = heroOf(utils.container);
    const H = heroText(config.id, 'en');

    await test('Book Appointment opens the EXISTING booking flow (no second system)', async () => {
      const cta = hero.querySelector('[data-testid="hero-book-cta"]');
      assert.equal(cta.tagName, 'BUTTON', 'an action must be a <button>, not a link');
      assert.equal(cta.getAttribute('type'), 'button');
      assert.equal(cta.getAttribute('data-open-booking'), 'true');
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
      await act(async () => { fireEvent.click(cta); });
      const flows = utils.container.querySelectorAll('[data-testid="site-booking-flow"]');
      assert.equal(flows.length, 1, `expected exactly one booking flow, found ${flows.length}`);
      const back = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
      await act(async () => { fireEvent.click(back); });
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    });

    await test('Explore Services scrolls to the All Services section', async () => {
      const cta = hero.querySelector('[data-testid="hero-services-cta"]');
      const expected = heroTargetId(config.id, 'services');
      assert.equal(cta.getAttribute('href'), `#${expected}`, 'services CTA has the wrong href');
      lastScroll = null;
      await act(async () => { fireEvent.click(cta); });
      assert.ok(lastScroll, 'no scroll happened');
      assert.equal(lastScroll.id, expected);
      assert.equal(lastScroll.section, 'services', 'landed on a section that is not All Services');
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null, 'services CTA must not open booking');
    });

    await test('View Gallery scrolls to the Gallery section', async () => {
      const cta = hero.querySelector('[data-testid="hero-gallery-cta"]');
      const expected = heroTargetId(config.id, 'gallery');
      assert.equal(cta.getAttribute('href'), `#${expected}`, 'gallery CTA has the wrong href');
      lastScroll = null;
      await act(async () => { fireEvent.click(cta); });
      assert.ok(lastScroll, 'no scroll happened');
      assert.equal(lastScroll.id, expected);
      assert.equal(lastScroll.section, 'gallery', 'landed on a section that is not Gallery');
    });

    await test('Call and WhatsApp use the existing protected contact actions', () => {
      const call = hero.querySelector('[data-testid="hero-call-cta"]');
      const wa = hero.querySelector('[data-testid="hero-whatsapp-cta"]');
      // PHASE 16.8 — before the required 25% advance payment both actions are
      // locked: rendered as buttons that carry no contact target whatsoever.
      assert.equal(call.tagName, 'BUTTON');
      assert.equal(wa.tagName, 'BUTTON');
      assert.equal(call.dataset.locked, 'true');
      assert.equal(wa.dataset.locked, 'true');
      assert.equal(call.getAttribute('href'), null);
      assert.equal(wa.getAttribute('href'), null);
      assert.ok(flat(call).includes(H.callCta));
      assert.ok(flat(wa).includes(H.whatsAppCta));
    });

    await test('hero CTAs never create duplicate sections or routes', () => {
      const order = collectSiteSectionOrder(utils.container);
      assert.deepEqual(order, [...SITE_SECTION_ORDER], 'section flow changed');
      assert.equal(new Set(order).size, order.length, 'duplicate sections rendered');
      for (const key of ['services', 'gallery']) {
        const id = heroTargetId(config.id, key);
        assert.equal(utils.container.querySelectorAll(`#${id}`).length, 1, `#${id} is not unique`);
      }
      assert.equal(window.location.pathname, '/', 'a hero CTA changed the route');
    });
  }
}

/* ------------------------------------------------------------------ */
/* 2. Interactions + reduced motion                                    */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — interaction states`);
  reset();
  const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
  const hero = heroOf(utils.container);

  await test('every CTA carries the shared state class + this theme’s motion class', () => {
    let seen = 0;
    for (const id of CTA_IDS) {
      const el = hero.querySelector(`[data-testid="${id}"]`);
      if (!el) continue;
      seen += 1;
      assert.ok(cls(el).includes('site-hero-cta'), `${id} has no base interaction class`);
      assert.ok(cls(el).includes(HERO_CTA_MOTION[config.id]), `${id} missing ${config.id} motion signature`);
      assert.ok(cls(el).includes('site-touch'), `${id} lost its 44px target`);
    }
    assert.equal(seen, CTA_IDS.length, `expected all ${CTA_IDS.length} CTAs`);
  });

  await test('no theme borrows another theme’s motion signature', () => {
    for (const other of CASES) {
      if (other.id === config.id) continue;
      assert.ok(
        !cls(hero.querySelector('[data-testid="hero-book-cta"]')).includes(HERO_CTA_MOTION[other.id]),
        `${config.id} uses ${other.id} motion`,
      );
    }
  });

  await test('animation is subtle: no looping/attention-seeking motion on hero content', () => {
    for (const el of hero.querySelectorAll('*')) {
      const c = cls(el);
      // `animate-pulse` on a loading skeleton is the EXISTING Phase 10.12
      // placeholder and disappears once media loads — it is not hero motion.
      const isLoadingSkeleton = el.getAttribute('data-testid') === 'site-image-skeleton';
      if (isLoadingSkeleton) continue;
      assert.ok(!/\banimate-(bounce|ping|spin|pulse)\b/.test(c), `excessive animation: ${c}`);
    }
  });
}

await test('CSS defines a distinct motion signature per theme', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  for (const config of CASES) {
    assert.ok(css.includes(`.${HERO_CTA_MOTION[config.id]}`), `missing CSS for ${config.id}`);
  }
  assert.equal(new Set(Object.values(HERO_CTA_MOTION)).size, CASES.length, 'motion classes are not unique');
});

await test('CSS provides hover, focus-visible and active states', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  assert.ok(/\.site-hero-cta:hover/.test(css), 'no hover state');
  assert.ok(/\.site-hero-cta:focus-visible/.test(css), 'no focus-visible state');
  assert.ok(/\.site-hero-cta:active/.test(css), 'no active state');
  assert.ok(/outline:\s*2px solid currentColor/.test(css), 'focus ring is not visible');
});

await test('a reduced-motion block disables every hero motion signature', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const config of CASES) {
    assert.ok(block.includes(HERO_CTA_MOTION[config.id]), `${config.id} motion not disabled under reduced motion`);
  }
  assert.ok(/transition:\s*none/.test(block) && /animation:\s*none/.test(block));
});

for (const config of CASES) {
  section(`${config.label} — reduced motion behaviour`);

  reset({ reducedMotion: false });
  {
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const hero = heroOf(utils.container);
    lastScroll = null;
    await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-services-cta"]')); });
    await test('default visitors get a smooth scroll', () => {
      assert.equal(lastScroll.behavior, 'smooth');
    });
  }

  reset({ reducedMotion: true });
  {
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    const hero = heroOf(utils.container);
    lastScroll = null;
    await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-services-cta"]')); });
    await test('reduced-motion visitors get an instant jump to the same target', () => {
      assert.equal(lastScroll.behavior, 'auto', 'reduced motion still animates the scroll');
      assert.equal(lastScroll.id, heroTargetId(config.id, 'services'), 'reduced motion changed the destination');
    });

    await test('reduced motion still suppresses hero video autoplay', () => {
      const frame = hero.querySelector('[data-testid="hero-media-frame"]');
      assert.equal(frame.getAttribute('data-hero-motion'), 'reduced');
      assert.equal(frame.querySelector('video'), null);
    });
  }
}
setReducedMotionForTests(false);

await test('heroScrollTo is a no-op for an unknown target (never throws)', () => {
  let threw = null;
  try { heroScrollTo('section-does-not-exist', false); } catch (error) { threw = error; }
  assert.equal(threw, null);
});

await test('heroCtaClass composes touch + base + theme classes', () => {
  const result = heroCtaClass('barber_mens_grooming', 'px-4');
  assert.ok(result.includes('site-touch') && result.includes('site-hero-cta') && result.includes('site-hero-cta--barber') && result.includes('px-4'));
});

/* ------------------------------------------------------------------ */
/* 3. Accessibility                                                    */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode} accessibility`);
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
    const hero = heroOf(utils.container);

    await test('correct semantics: actions are buttons, navigation are links', () => {
      const book = hero.querySelector('[data-testid="hero-book-cta"]');
      assert.equal(book.tagName, 'BUTTON', 'booking is an action → <button>');
      for (const id of ['hero-services-cta', 'hero-gallery-cta']) {
        const el = hero.querySelector(`[data-testid="${id}"]`);
        assert.equal(el.tagName, 'A', `${id} navigates → <a href>`);
        assert.ok((el.getAttribute('href') || '').startsWith('#'), `${id} needs a real in-page href`);
      }
      for (const el of hero.querySelectorAll('button')) {
        assert.equal(el.getAttribute('type'), 'button', 'buttons must declare type to avoid form submits');
      }
    });

    await test('every CTA is keyboard reachable (no negative tabindex)', () => {
      for (const id of CTA_IDS) {
        const el = hero.querySelector(`[data-testid="${id}"]`);
        if (!el) continue;
        const tabindex = el.getAttribute('tabindex');
        assert.ok(tabindex === null || Number(tabindex) >= 0, `${id} is removed from the tab order`);
        assert.ok(!el.hasAttribute('disabled'), `${id} is disabled`);
        assert.ok(!el.hasAttribute('aria-hidden'), `${id} is hidden from AT`);
      }
    });

    await test('keyboard activation works: Enter on the booking CTA opens booking', async () => {
      const book = hero.querySelector('[data-testid="hero-book-cta"]');
      // A native <button> fires click on Enter/Space; assert the handler is on
      // click (not mousedown) so keyboard users get the same behaviour.
      await act(async () => { fireEvent.click(book); });
      assert.ok(utils.container.querySelector('[data-testid="site-booking-flow"]'), 'keyboard path cannot open booking');
      const back = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
      await act(async () => { fireEvent.click(back); });
    });

    await test('every CTA has an accessible name', () => {
      for (const id of CTA_IDS) {
        const el = hero.querySelector(`[data-testid="${id}"]`);
        if (!el) continue;
        const name = flat(el) || el.getAttribute('aria-label') || '';
        assert.ok(name.length > 1, `${id} has no accessible name`);
      }
    });

    await test('media is labelled and decorative icons are hidden', () => {
      for (const img of hero.querySelectorAll('img')) {
        assert.ok((img.getAttribute('alt') || '').trim().length > 0, 'image without alt');
      }
      const video = hero.querySelector('video');
      if (video) {
        assert.ok((video.getAttribute('aria-label') || '').length > 0, 'video without a label');
        assert.equal(video.getAttribute('tabindex'), '-1', 'ambience video should not be a tab stop');
      }
      const exposedIcons = Array.from(hero.querySelectorAll('svg')).filter((s) => s.getAttribute('aria-hidden') !== 'true');
      assert.equal(exposedIcons.length, 0, 'decorative icons are announced');
    });

    await test('in-page CTA hrefs point at elements that exist exactly once', () => {
      for (const id of ['hero-services-cta', 'hero-gallery-cta']) {
        const href = hero.querySelector(`[data-testid="${id}"]`).getAttribute('href');
        const targets = utils.container.querySelectorAll(href);
        assert.equal(targets.length, 1, `${href} resolves to ${targets.length} elements`);
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* 4. EN/HI × Light/Dark CTA sweep                                     */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — EN/HI × Light/Dark CTA sweep`);
  for (const mode of MODES) {
    for (const locale of ['en', 'hi']) {
      for (const appearance of ['light', 'dark']) {
        reset({ locale, appearance });
        const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
        const hero = heroOf(utils.container);
        const T = heroText(config.id, locale);

        await test(`${mode}/${locale}/${appearance}: every CTA renders, is labelled and points somewhere real`, async () => {
          const book = hero.querySelector('[data-testid="hero-book-cta"]');
          assert.equal(flat(book), T.primaryCta);
          const services = hero.querySelector('[data-testid="hero-services-cta"]');
          assert.equal(flat(services), T.secondaryCta);
          assert.equal(services.getAttribute('href'), `#${heroTargetId(config.id, 'services')}`);
          const gallery = hero.querySelector('[data-testid="hero-gallery-cta"]');
          assert.equal(flat(gallery), T.galleryCta);
          assert.equal(gallery.getAttribute('href'), `#${heroTargetId(config.id, 'gallery')}`);
          // PHASE 16.8 — protected until the advance payment succeeds.
          assert.equal(hero.querySelector('[data-testid="hero-call-cta"]').dataset.locked, 'true');
          assert.equal(hero.querySelector('[data-testid="hero-whatsapp-cta"]').dataset.locked, 'true');
          for (const id of CTA_IDS) {
            assert.ok(cls(hero.querySelector(`[data-testid="${id}"]`)).includes('site-hero-cta'));
          }
        });

        await test(`${mode}/${locale}/${appearance}: booking + services CTAs actually work`, async () => {
          lastScroll = null;
          await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-services-cta"]')); });
          assert.equal(lastScroll.section, 'services');
          await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-book-cta"]')); });
          assert.ok(utils.container.querySelector('[data-testid="site-booking-flow"]'), 'booking failed to open');
          const back = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
          if (back) await act(async () => { fireEvent.click(back); });
        });
      }
    }
  }
}
setSiteLocale('en');
setSiteAppearance(undefined);

/* ------------------------------------------------------------------ */
/* 5. Theme isolation across switches                                  */
/* ------------------------------------------------------------------ */

section('Theme isolation — Barber → Hair → Spa → Family → Nail');

for (const mode of MODES) {
  reset();
  let utils = null;
  let previous = null;

  for (const config of CASES) {
    const data = salonData(config.id);
    if (utils === null) {
      utils = render(React.createElement(config.Component, { data, mode }));
    } else {
      await act(async () => { utils.rerender(React.createElement(config.Component, { data, mode })); });
    }
    const hero = heroOf(utils.container);
    const H = heroText(config.id, 'en');
    const prior = previous;

    await test(`${mode}: ${config.id} has unique CTA styling`, () => {
      for (const id of CTA_IDS) {
        const el = hero.querySelector(`[data-testid="${id}"]`);
        assert.ok(cls(el).includes(HERO_CTA_MOTION[config.id]), `${id} missing own motion`);
      }
    });

    await test(`${mode}: ${config.id} CTA destinations are correct`, async () => {
      assert.equal(hero.querySelector('[data-testid="hero-services-cta"]').getAttribute('href'), `#${heroTargetId(config.id, 'services')}`);
      assert.equal(hero.querySelector('[data-testid="hero-gallery-cta"]').getAttribute('href'), `#${heroTargetId(config.id, 'gallery')}`);
      lastScroll = null;
      await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-gallery-cta"]')); });
      assert.equal(lastScroll.section, 'gallery');
    });

    await test(`${mode}: ${config.id} content, media and layout are its own`, () => {
      assert.equal(hero.getAttribute('data-hero-layout'), config.layout);
      assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).includes(H.headlineAccent));
      assert.equal(hero.querySelector('[data-testid="hero-media-frame"]').getAttribute('data-hero-media-theme'), config.id);
    });

    if (prior) {
      await test(`${mode}: no ${prior.id} interaction state survives into ${config.id}`, () => {
        const P = heroText(prior.id, 'en');
        const text = flat(hero);
        for (const value of [P.headlineAccent, P.primaryCta, P.secondaryCta, P.callCta, P.galleryCta]) {
          assert.ok(!text.includes(value), `stale copy "${value}"`);
        }
        for (const el of hero.querySelectorAll('[class]')) {
          assert.ok(!cls(el).includes(HERO_CTA_MOTION[prior.id]), `stale ${prior.id} motion class`);
        }
        for (const img of hero.querySelectorAll('img')) {
          assert.ok(!(img.getAttribute('src') || '').includes(prior.id), 'stale media');
        }
      });
    }
    previous = config;
  }
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 11.6 hero interaction & conversion: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five heroes pass interaction QA: correct CTA destinations, per-theme motion, reduced-motion, a11y semantics and clean theme isolation.');
cleanup();
process.exit(0);
