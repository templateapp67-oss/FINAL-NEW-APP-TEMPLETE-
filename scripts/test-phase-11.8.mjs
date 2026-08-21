/**
 * PHASE 11.8 — FINAL HERO ACCEPTANCE (all five themes)
 *
 * The sign-off gate for Phase 11. It re-proves the complete hero contract
 * end-to-end rather than trusting the individual sub-phase suites:
 *
 *   A. Per-theme uniqueness — layout, headline, description, image/video,
 *      styling.
 *   B. Required elements — Book Appointment + Explore Services CTAs, mobile
 *      media, fallback media, EN/HI, Light/Dark, a11y, loading/error states.
 *   C. Complete flows — Hero → Book Appointment → existing booking flow;
 *      Hero → Explore Services → services section; Hero → Gallery → gallery
 *      section; Hero → Call/WhatsApp → existing contact actions.
 *   D. Full-cycle theme switch — Barber → Hair → Spa → Family → Nail →
 *      **back to Barber**, asserting no stale content/media/state at any step.
 *   E. Responsive — desktop → tablet → mobile throughout.
 *   F. Single implementation — exactly one hero per page, one booking flow.
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

let lastScroll = null;
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView(options) {
  lastScroll = { id: this.id, section: this.getAttribute('data-site-section'), behavior: options && options.behavior };
};
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;
dom.window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
dom.window.HTMLMediaElement.prototype.pause = function pause() {};

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
const { heroMedia, isSafeMediaUrl } = await import('../src/lib/siteHero.ts');
const { heroTargetId, HERO_CTA_MOTION } = await import('../src/lib/siteHeroNav.ts');
const {
  setReducedMotionForTests, resetThemeHeroVideos, setThemeHeroVideo, HERO_WIDTHS,
} = await import('../src/lib/siteHeroMedia.ts');
const { IMAGE_CACHE, requestCache } = await import('../src/lib/sitePerformance.ts');
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
const BY_ID = Object.fromEntries(CASES.map((c) => [c.id, c]));
const MODES = ['desktop', 'tablet', 'mobile'];
const CTA_IDS = ['hero-book-cta', 'hero-services-cta', 'hero-call-cta', 'hero-whatsapp-cta', 'hero-gallery-cta'];

function reset({ locale = 'en', appearance = undefined, reducedMotion = false } = {}) {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
  setReducedMotionForTests(reducedMotion);
  resetThemeHeroVideos();
  IMAGE_CACHE.clear();
  requestCache.clear();
  document.head.innerHTML = '';
  lastScroll = null;
}
function heroOf(container) {
  const hero = container.querySelector('[data-testid="site-hero"]');
  assert.ok(hero, 'hero section missing');
  return hero;
}
const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const cls = (el) => el?.getAttribute('class') || '';

async function closeBooking(utils) {
  const back = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
  if (back) await act(async () => { fireEvent.click(back); });
}

/* ================================================================== */
/* A. Per-theme acceptance sweep                                       */
/* ================================================================== */

const snapshot = { layout: new Map(), headline: new Map(), description: new Map(), surface: new Map(), media: new Map() };

for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode} acceptance`);
    reset();
    const data = salonData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode }));
    const hero = heroOf(utils.container);
    const H = heroText(config.id, 'en');

    await test('exactly one hero implementation on the page', () => {
      assert.equal(utils.container.querySelectorAll('[data-testid="site-hero"]').length, 1);
      assert.equal(utils.container.querySelectorAll('#section-hero').length, 1);
      assert.equal(hero.querySelectorAll('h1').length, 1);
      assert.equal(utils.container.querySelectorAll('[data-testid="hero-media-frame"]').length, 1);
    });

    await test('unique layout signature for this theme', () => {
      assert.equal(hero.getAttribute('data-hero-layout'), config.layout);
      assert.equal(hero.getAttribute('data-hero-theme'), config.id);
    });

    await test('unique headline and description from this theme', () => {
      const headline = flat(hero.querySelector('[data-testid="hero-headline"]'));
      assert.ok(headline.includes(H.headlineAccent), `headline is not this theme's: ${headline}`);
      assert.equal(flat(hero.querySelector('[data-testid="hero-description"]')), H.description);
    });

    await test('theme-specific styling (own surface + own CTA motion)', () => {
      assert.ok((hero.getAttribute('style') || '').length > 0, 'hero has no themed surface');
      for (const id of CTA_IDS) {
        const el = hero.querySelector(`[data-testid="${id}"]`);
        if (el) assert.ok(cls(el).includes(HERO_CTA_MOTION[config.id]), `${id} lost its theme motion`);
      }
    });

    await test('hero image/video belongs to this theme and is safe', () => {
      const frame = hero.querySelector('[data-testid="hero-media-frame"]');
      assert.equal(frame.getAttribute('data-hero-media-theme'), config.id);
      const media = frame.querySelector('img, video');
      assert.ok(media, 'no hero media');
      for (const img of hero.querySelectorAll('img')) {
        assert.ok(isSafeMediaUrl(img.getAttribute('src')), `unsafe media: ${img.getAttribute('src')}`);
      }
      for (const other of CASES) {
        if (other.id === config.id) continue;
        for (const img of hero.querySelectorAll('img')) {
          assert.ok(!(img.getAttribute('src') || '').includes(other.id), `renders ${other.id} media`);
        }
      }
    });

    await test('Book Appointment + Explore Services CTAs are both present', () => {
      const book = hero.querySelector('[data-testid="hero-book-cta"]');
      const services = hero.querySelector('[data-testid="hero-services-cta"]');
      assert.ok(book && services);
      assert.equal(book.tagName, 'BUTTON');
      assert.equal(services.tagName, 'A');
      assert.equal(flat(book), H.primaryCta);
      assert.equal(flat(services), H.secondaryCta);
    });

    await test('correct mobile-optimized media source for this frame', () => {
      const frame = hero.querySelector('[data-testid="hero-media-frame"]');
      const media = frame.querySelector('video, img');
      const src = media.tagName === 'VIDEO' ? media.getAttribute('poster') : media.getAttribute('src');
      if (!/[?&]w=/.test(src || '')) return;
      assert.match(src, new RegExp(`[?&]w=${HERO_WIDTHS[mode]}(&|$)`), `expected w=${HERO_WIDTHS[mode]}, got ${src}`);
    });

    await test('correct fallback media when the owner supplied none', () => {
      reset();
      const bare = render(React.createElement(config.Component, {
        data: salonData(config.id, { heroImageUrl: '', gallery: [], socialVideos: [] }), mode,
      }));
      const bareHero = heroOf(bare.container);
      const expected = heroMedia(config.id, salonData(config.id, { heroImageUrl: '', gallery: [] }));
      const srcs = Array.from(bareHero.querySelectorAll('img')).map((i) => (i.getAttribute('src') || '').split('?')[0]);
      assert.ok(srcs.some((s) => s === expected.primary.url.split('?')[0]), 'theme fallback media not used');
      for (const s of srcs) assert.ok(isSafeMediaUrl(s));
    });

    await test('loading state reserves space; error state degrades gracefully', async () => {
      reset();
      const fresh = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
      const freshHero = heroOf(fresh.container);
      const frame = freshHero.querySelector('[data-testid="hero-media-frame"]');
      assert.ok(/\d/.test(frame.style.aspectRatio || ''), 'frame reserves no space while loading');
      const wrapper = frame.querySelector('[data-testid="site-image-wrapper"]');
      if (wrapper) assert.ok(/\d/.test(wrapper.style.aspectRatio || ''), 'image wrapper reserves no space');
      const img = frame.querySelector('img');
      if (img) {
        const before = frame.style.aspectRatio;
        await act(async () => { fireEvent.error(img); });
        assert.ok(freshHero.querySelector('[data-testid="site-image-error"]'), 'no error state');
        assert.equal(
          freshHero.querySelector('[data-testid="hero-media-frame"]').style.aspectRatio, before,
          'layout shifted on error',
        );
        assert.ok(flat(freshHero.querySelector('[data-testid="hero-headline"]')).length > 0, 'content lost on error');
      }
    });

    await test('accessibility contract holds', () => {
      for (const img of hero.querySelectorAll('img')) {
        assert.ok((img.getAttribute('alt') || '').trim().length > 0, 'image without alt');
      }
      for (const control of hero.querySelectorAll('button, a')) {
        const name = flat(control) || control.getAttribute('aria-label') || '';
        assert.ok(name.length > 0, `unnamed control: ${cls(control)}`);
      }
      for (const el of hero.querySelectorAll('button')) {
        assert.equal(el.getAttribute('type'), 'button');
      }
      const exposedIcons = Array.from(hero.querySelectorAll('svg')).filter((s) => s.getAttribute('aria-hidden') !== 'true');
      assert.equal(exposedIcons.length, 0, 'decorative icons announced');
      for (const id of CTA_IDS) {
        const el = hero.querySelector(`[data-testid="${id}"]`);
        if (!el) continue;
        const ti = el.getAttribute('tabindex');
        assert.ok(ti === null || Number(ti) >= 0, `${id} not keyboard reachable`);
        assert.ok(cls(el).includes('site-touch'), `${id} below the 44px target`);
      }
    });

    if (mode === 'desktop') {
      snapshot.layout.set(config.id, hero.getAttribute('data-hero-layout'));
      snapshot.headline.set(config.id, flat(hero.querySelector('[data-testid="hero-headline"]')));
      snapshot.description.set(config.id, flat(hero.querySelector('[data-testid="hero-description"]')));
      snapshot.surface.set(config.id, hero.getAttribute('style') || '');
      snapshot.media.set(config.id, Array.from(hero.querySelectorAll('img')).map((i) => i.getAttribute('src')));
    }
  }
}

section('Cross-theme uniqueness (final)');

for (const field of ['layout', 'headline', 'description', 'surface']) {
  await test(`every theme has a unique ${field}`, () => {
    const values = [...snapshot[field].values()];
    assert.equal(values.length, CASES.length);
    assert.equal(new Set(values).size, CASES.length, `${field} repeats: ${values.join(' || ')}`);
  });
}

await test('no hero image is shared between any two themes', () => {
  const owner = new Map();
  for (const [themeId, srcs] of snapshot.media) {
    for (const src of srcs) {
      if (!src) continue;
      const prev = owner.get(src);
      assert.ok(!prev || prev === themeId, `${src} shared by ${prev} and ${themeId}`);
      owner.set(src, themeId);
    }
  }
});

/* ================================================================== */
/* B. Complete hero flows                                              */
/* ================================================================== */

for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode} complete flows`);
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
    const hero = heroOf(utils.container);

    await test('Hero → Book Appointment → existing booking flow (and back)', async () => {
      assert.equal(utils.container.querySelectorAll('[data-testid="site-booking-flow"]').length, 0);
      await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-book-cta"]')); });
      const flows = utils.container.querySelectorAll('[data-testid="site-booking-flow"]');
      assert.equal(flows.length, 1, `expected exactly 1 booking flow, got ${flows.length}`);
      await closeBooking(utils);
      assert.equal(utils.container.querySelectorAll('[data-testid="site-booking-flow"]').length, 0);
    });

    await test('Hero → Explore Services → correct services section', async () => {
      lastScroll = null;
      await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-services-cta"]')); });
      assert.ok(lastScroll, 'no scroll occurred');
      assert.equal(lastScroll.id, heroTargetId(config.id, 'services'));
      assert.equal(lastScroll.section, 'services');
      assert.equal(utils.container.querySelectorAll('[data-testid="site-booking-flow"]').length, 0);
    });

    await test('Hero → Gallery → correct gallery section', async () => {
      lastScroll = null;
      await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-gallery-cta"]')); });
      assert.ok(lastScroll, 'no scroll occurred');
      assert.equal(lastScroll.id, heroTargetId(config.id, 'gallery'));
      assert.equal(lastScroll.section, 'gallery');
    });

    await test('Hero → Call / WhatsApp → existing protected contact actions', () => {
      const call = hero.querySelector('[data-testid="hero-call-cta"]');
      const wa = hero.querySelector('[data-testid="hero-whatsapp-cta"]');
      // PHASE 16.8 — the salon's real numbers stay out of the markup until the
      // visitor's required 25% advance payment has actually succeeded.
      assert.equal(call.dataset.locked, 'true');
      assert.equal(wa.dataset.locked, 'true');
      assert.equal(call.getAttribute('href'), null);
      assert.equal(wa.getAttribute('href'), null);
      assert.equal(hero.innerHTML.includes('919999900000'), false);
    });

    await test('flows create no duplicate sections and no route change', () => {
      const order = collectSiteSectionOrder(utils.container);
      assert.deepEqual(order, [...SITE_SECTION_ORDER]);
      assert.equal(new Set(order).size, order.length);
      assert.equal(window.location.pathname, '/');
    });
  }
}

/* ================================================================== */
/* C. EN/HI × Light/Dark                                               */
/* ================================================================== */

for (const config of CASES) {
  section(`${config.label} — EN/HI × Light/Dark`);
  for (const mode of MODES) {
    for (const locale of ['en', 'hi']) {
      for (const appearance of ['light', 'dark']) {
        reset({ locale, appearance });
        const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
        const hero = heroOf(utils.container);
        const T = heroText(config.id, locale);

        await test(`${mode}/${locale}/${appearance}: hero renders fully with working CTAs`, async () => {
          assert.equal(utils.container.querySelector('[data-testid="site-header"]').getAttribute('data-appearance'), appearance);
          assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).includes(T.headlineAccent));
          assert.equal(flat(hero.querySelector('[data-testid="hero-description"]')), T.description);
          assert.equal(flat(hero.querySelector('[data-testid="hero-book-cta"]')), T.primaryCta);
          assert.equal(flat(hero.querySelector('[data-testid="hero-services-cta"]')), T.secondaryCta);
          assert.ok(hero.querySelector('[data-testid="hero-media-frame"]'));
          if (locale === 'hi') {
            assert.match(flat(hero.querySelector('[data-testid="hero-headline"]')), /[\u0900-\u097F]/);
          }
          lastScroll = null;
          await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-services-cta"]')); });
          assert.equal(lastScroll.section, 'services');
          await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-book-cta"]')); });
          assert.equal(utils.container.querySelectorAll('[data-testid="site-booking-flow"]').length, 1);
          await closeBooking(utils);
        });
      }
    }
  }
}
setSiteLocale('en');
setSiteAppearance(undefined);

/* ================================================================== */
/* D. FULL-CYCLE theme switch (…→ Nail → back to Barber)               */
/* ================================================================== */

const CYCLE = [...CASES, CASES[0]];

/**
 * Real baseline: render each theme standalone in both appearances and record
 * its hero surface, so the cycle can assert against an INDEPENDENT expected
 * value instead of comparing the element to itself.
 */
const SURFACE_BASELINE = new Map();
for (const config of CASES) {
  for (const appearance of ['light', 'dark']) {
    reset({ appearance });
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
    SURFACE_BASELINE.set(`${config.id}:${appearance}`, heroOf(utils.container).getAttribute('style'));
  }
}
cleanup();

await test('every theme/appearance pair has a distinct recorded surface', () => {
  const light = CASES.map((c) => SURFACE_BASELINE.get(`${c.id}:light`));
  const dark = CASES.map((c) => SURFACE_BASELINE.get(`${c.id}:dark`));
  assert.equal(new Set(light).size, CASES.length, 'light surfaces not distinct');
  assert.equal(new Set(dark).size, CASES.length, 'dark surfaces not distinct');
});

for (const mode of MODES) {
  for (const [locale, appearance] of [['en', 'light'], ['hi', 'dark']]) {
    section(`Full cycle (${mode}, ${locale}/${appearance}) — Barber → … → Nail → Barber`);
    reset({ locale, appearance });
    let utils = null;
    let previous = null;
    let step = 0;

    for (const config of CYCLE) {
      step += 1;
      const data = salonData(config.id);
      if (utils === null) {
        utils = render(React.createElement(config.Component, { data, mode }));
      } else {
        await act(async () => { utils.rerender(React.createElement(config.Component, { data, mode })); });
      }
      const hero = heroOf(utils.container);
      const T = heroText(config.id, locale);
      const prior = previous;
      const tag = `step ${step} → ${config.id}`;

      await test(`${tag}: correct hero content and styling`, () => {
        assert.equal(hero.getAttribute('data-hero-layout'), config.layout);
        assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).includes(T.headlineAccent));
        assert.equal(flat(hero.querySelector('[data-testid="hero-description"]')), T.description);
        assert.equal(
          hero.getAttribute('style'),
          SURFACE_BASELINE.get(`${config.id}:${appearance}`),
          'hero surface differs from this theme rendered standalone',
        );
        assert.equal(utils.container.querySelector('[data-testid="site-header"]').getAttribute('data-appearance'), appearance);
      });

      await test(`${tag}: correct hero media`, () => {
        assert.equal(hero.querySelector('[data-testid="hero-media-frame"]').getAttribute('data-hero-media-theme'), config.id);
        for (const img of hero.querySelectorAll('img')) {
          assert.ok(isSafeMediaUrl(img.getAttribute('src')));
        }
      });

      await test(`${tag}: correct CTA destinations`, async () => {
        assert.equal(hero.querySelector('[data-testid="hero-services-cta"]').getAttribute('href'), `#${heroTargetId(config.id, 'services')}`);
        assert.equal(hero.querySelector('[data-testid="hero-gallery-cta"]').getAttribute('href'), `#${heroTargetId(config.id, 'gallery')}`);
        lastScroll = null;
        await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-services-cta"]')); });
        assert.equal(lastScroll.section, 'services');
        await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-book-cta"]')); });
        assert.equal(utils.container.querySelectorAll('[data-testid="site-booking-flow"]').length, 1);
        await closeBooking(utils);
      });

      if (prior && prior.id !== config.id) {
        await test(`${tag}: no ${prior.id} content, media or state remains`, () => {
          const P = heroText(prior.id, locale);
          const text = flat(hero);
          for (const value of [P.headlineAccent, P.description, P.primaryCta, P.secondaryCta, P.callCta, P.galleryCta]) {
            assert.ok(!text.includes(value), `stale copy: "${value}"`);
          }
          for (const badge of P.focus) {
            assert.equal(hero.querySelector(`[data-hero-focus-item="${badge}"]`), null, `stale badge ${badge}`);
          }
          for (const el of hero.querySelectorAll('[class]')) {
            assert.ok(!cls(el).includes(HERO_CTA_MOTION[prior.id]), `stale ${prior.id} motion class`);
          }
          const priorMedia = heroMedia(prior.id, salonData(prior.id, { gallery: [], heroImageUrl: '' }));
          for (const img of hero.querySelectorAll('img')) {
            const src = (img.getAttribute('src') || '').split('?')[0];
            for (const stale of [priorMedia.primary, ...priorMedia.support]) {
              assert.notEqual(src, stale.url.split('?')[0], `stale ${prior.id} media`);
            }
          }
          assert.notEqual(hero.getAttribute('data-hero-layout'), prior.layout);
          for (const key of requestCache.cache.keys()) {
            assert.ok(!String(key).startsWith(`theme:${prior.id}:`), `stale cache key ${key}`);
          }
        });
      }
      previous = config;
    }

    await test(`returning to Barber restores its own hero exactly`, () => {
      const hero = heroOf(utils.container);
      const B = heroText('barber_mens_grooming', locale);
      assert.equal(hero.getAttribute('data-hero-layout'), 'cinematic-slab');
      assert.equal(hero.getAttribute('data-hero-theme'), 'barber_mens_grooming');
      assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).includes(B.headlineAccent));
      assert.equal(flat(hero.querySelector('[data-testid="hero-description"]')), B.description);
      assert.equal(flat(hero.querySelector('[data-testid="hero-book-cta"]')), B.primaryCta);
      for (const other of CASES.slice(1)) {
        assert.ok(!flat(hero).includes(heroText(other.id, locale).headlineAccent), `${other.id} copy leaked back into barber`);
      }
    });
  }
}

/* ================================================================== */
/* E. Reduced motion + registered video, end to end                    */
/* ================================================================== */

section('Motion preferences at acceptance level');

for (const config of CASES) {
  reset({ reducedMotion: true });
  const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
  const hero = heroOf(utils.container);

  await test(`${config.id}: reduced motion keeps a working, still hero`, async () => {
    const frame = hero.querySelector('[data-testid="hero-media-frame"]');
    assert.equal(frame.getAttribute('data-hero-motion'), 'reduced');
    assert.equal(frame.querySelector('video'), null);
    lastScroll = null;
    await act(async () => { fireEvent.click(hero.querySelector('[data-testid="hero-services-cta"]')); });
    assert.equal(lastScroll.behavior, 'auto');
    assert.equal(lastScroll.section, 'services');
  });
}
setReducedMotionForTests(false);

for (const config of CASES) {
  reset();
  setThemeHeroVideo(config.id, `https://cdn.example.com/${config.id}.mp4`);
  const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode: 'desktop' }));
  const hero = heroOf(utils.container);

  await test(`${config.id}: a registered clip plays muted, inline and labelled`, () => {
    const video = hero.querySelector('video');
    assert.ok(video, 'registered clip did not render');
    assert.ok(video.hasAttribute('muted') || video.muted === true);
    assert.ok(video.hasAttribute('playsinline') || video.playsInline === true);
    assert.ok(video.hasAttribute('loop'));
    assert.ok(!video.hasAttribute('controls'));
    assert.ok(video.getAttribute('poster'));
    assert.ok((video.getAttribute('aria-label') || '').length > 0);
    assert.equal(video.getAttribute('tabindex'), '-1');
  });

  await test(`${config.id}: a failing clip falls back to the poster image`, async () => {
    const video = hero.querySelector('video');
    const frame = hero.querySelector('[data-testid="hero-media-frame"]');
    const before = frame.style.aspectRatio;
    await act(async () => { fireEvent.error(video); });
    const after = heroOf(utils.container).querySelector('[data-testid="hero-media-frame"]');
    assert.equal(after.getAttribute('data-hero-media-kind'), 'image');
    assert.ok(after.querySelector('img'));
    assert.equal(after.style.aspectRatio, before, 'layout shifted on video fallback');
  });
  resetThemeHeroVideos();
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 11.8 final hero acceptance: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('PHASE 11 ACCEPTED — all five heroes pass final acceptance across desktop/tablet/mobile, EN/HI, Light/Dark, every CTA flow and the full theme cycle.');
cleanup();
process.exit(0);
