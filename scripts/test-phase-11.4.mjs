/**
 * PHASE 11.4 — HERO DESKTOP + TABLET + MOBILE QA (all five themes)
 *
 * Pure QA of the Phase 11.1–11.3 hero. Nothing is redesigned here; this suite
 * proves the hero behaves correctly on every frame size, in both languages and
 * both appearances, and that the Phase 11.4 responsive root-cause fix holds.
 *
 * Per theme × desktop / tablet / mobile:
 *   1. Hero media fits its frame, keeps a reserved aspect ratio, and important
 *      content (headline, description, CTAs) is never cropped away.
 *   2. No horizontal overflow: the hero clips its own decorations and never
 *      uses a fixed width wider than the narrowest frame.
 *   3. Headline + description stay readable (present, non-empty, sized for
 *      the frame — never desktop type inside the phone frame).
 *   4. CTAs stay visible and touch-friendly (44px rule).
 *   5. Book Appointment opens the existing booking flow; Explore Services
 *      targets the real services section.
 *   6. Mobile hero is genuinely optimized (narrow image sources, single
 *      column, no desktop-only flourishes).
 *   7. Video + image fallbacks work; loading reserves space (no layout shift).
 *   8. Light/Dark and English/Hindi both work.
 *   9. Each theme keeps its own design, content and media — no cross-theme
 *      fallback, no generic copy.
 *
 * ROOT-CAUSE GUARD (fixed in 11.4): the hero must never size itself with CSS
 * viewport breakpoints (`md:` etc.). The website renders inside a fixed-width
 * preview frame, so a `md:` class matched the wide browser even in the 390px
 * phone frame — tablet rendered at desktop scale and `hidden md:inline-flex`
 * elements appeared on mobile. Heroes now resolve from the renderer `mode`.
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
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
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
const { heroModeValue } = await import('../src/lib/siteHero.ts');
const {
  setReducedMotionForTests,
  setThemeHeroVideo,
  resetThemeHeroVideos,
  HERO_WIDTHS,
} = await import('../src/lib/siteHeroMedia.ts');

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

/** Widths of the real preview frames (src/lib/siteStructure.ts). */
const FRAME_WIDTH = { desktop: 950, tablet: 768, mobile: 390 };

function qaData(templateId, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: 'Phase Eleven Salon',
    tagline: '',
    about: '',
    ownerName: 'Asha Verma',
    phone: '+91 99999 00000',
    whatsappPhone: '+91 99999 00000',
    contactOptions: { callNow: true, whatsapp: true, bookNow: true },
    logoUrl: '',
    heroImageUrl: '',
    gallery: [{ id: 'g1', url: `https://example.com/${templateId}-g1.jpg`, alt: 'Work', category: 'General' }],
    socialVideos: [],
    services: [
      { id: 'svc-1', name: 'Signature Service', category: 'Haircut', description: 'Cut.', price: 499, duration: 45, status: 'active', featured: true },
    ],
    packages: [],
    team: [],
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
}
function heroOf(container) {
  const hero = container.querySelector('[data-testid="site-hero"]');
  assert.ok(hero, 'hero section missing');
  return hero;
}
const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const classesOf = (el) => (el?.getAttribute('class') || '');

/** Collects every CSS viewport-breakpoint class inside a subtree. */
function breakpointClasses(root) {
  const found = new Set();
  for (const el of root.querySelectorAll('*')) {
    for (const cls of classesOf(el).split(/\s+/)) {
      if (/^(sm|md|lg|xl|2xl):/.test(cls)) found.add(cls);
    }
  }
  return [...found];
}

/** Largest fixed pixel width used anywhere in the subtree. */
function widestFixedPx(root) {
  let widest = 0;
  for (const el of root.querySelectorAll('*')) {
    for (const match of classesOf(el).matchAll(/\bw-\[(\d+)px\]/g)) {
      widest = Math.max(widest, Number(match[1]));
    }
    const inline = el.style?.width || '';
    const px = /^(\d+)px$/.exec(inline);
    if (px) widest = Math.max(widest, Number(px[1]));
  }
  return widest;
}

/* ------------------------------------------------------------------ */
/* 1. Per theme × viewport QA sweep                                    */
/* ------------------------------------------------------------------ */

const perModeHeadlineClass = new Map();

for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode}`);
    reset();
    const data = qaData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode }));
    const hero = heroOf(utils.container);
    const H = heroText(config.id, 'en');
    const frame = hero.querySelector('[data-testid="hero-media-frame"]');

    /* --- Media fit ------------------------------------------------ */

    await test('hero media fits the frame with a reserved aspect ratio', () => {
      assert.ok(frame, 'hero-media-frame missing');
      assert.ok(/\d/.test(frame.style.aspectRatio || ''), 'aspect-ratio not reserved (layout shift risk)');
      assert.ok(classesOf(frame).includes('overflow-hidden'), 'media frame does not clip its content');
      const media = frame.querySelector('video, img');
      assert.ok(media, 'no media element rendered');
      const cls = classesOf(media);
      assert.ok(/object-cover/.test(cls), 'media must object-cover to fill without distortion');
      assert.ok(/w-full|inset-0/.test(cls), 'media must fill its frame');
    });

    await test('media source is sized for this frame (mobile-optimized)', () => {
      const media = frame.querySelector('video, img');
      const source = media.tagName === 'VIDEO' ? media.getAttribute('poster') : media.getAttribute('src');
      if (!/[?&]w=/.test(source || '')) return; // owner upload without transform support
      assert.match(source, new RegExp(`[?&]w=${HERO_WIDTHS[mode]}(&|$)`), `expected w=${HERO_WIDTHS[mode]}, got ${source}`);
    });

    /* --- No cropping of important content ------------------------- */

    await test('important content is present and not cropped away', () => {
      for (const id of ['hero-brand', 'hero-salon-name', 'hero-headline', 'hero-description', 'hero-book-cta', 'hero-services-cta']) {
        const el = hero.querySelector(`[data-testid="${id}"]`);
        assert.ok(el, `${id} missing on ${mode}`);
        assert.ok(!classesOf(el).split(/\s+/).includes('hidden'), `${id} is hidden on ${mode}`);
      }
      assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).length > 0, 'headline empty');
      assert.ok(flat(hero.querySelector('[data-testid="hero-description"]')).length > 0, 'description empty');
    });

    await test('no element is hidden by a CSS viewport breakpoint', () => {
      const hiddenByBreakpoint = Array.from(hero.querySelectorAll('*')).filter((el) => {
        const cls = classesOf(el).split(/\s+/);
        return cls.includes('hidden') && cls.some((c) => /^(sm|md|lg|xl|2xl):(inline-)?(flex|block|grid|inline)/.test(c));
      });
      assert.equal(
        hiddenByBreakpoint.length, 0,
        `${hiddenByBreakpoint.length} element(s) toggle visibility on the browser viewport instead of the frame mode`,
      );
    });

    /* --- Horizontal overflow -------------------------------------- */

    await test('hero clips its own decorations (no horizontal overflow)', () => {
      assert.ok(classesOf(hero).includes('overflow-hidden'), 'hero root must clip absolute decorations');
    });

    await test('no fixed width exceeds this frame', () => {
      const widest = widestFixedPx(hero);
      assert.ok(widest <= FRAME_WIDTH[mode], `fixed width ${widest}px exceeds the ${mode} frame (${FRAME_WIDTH[mode]}px)`);
    });

    await test('hero images never exceed their container', () => {
      for (const img of hero.querySelectorAll('img')) {
        const cls = classesOf(img);
        assert.ok(/w-full|w-\d|h-full|inset-0/.test(cls), `hero image has no width containment: "${cls}"`);
      }
    });

    /* --- Readability ---------------------------------------------- */

    await test('headline and description are sized for THIS frame', () => {
      const h1Class = classesOf(hero.querySelector('[data-testid="hero-headline"]'));
      assert.equal(breakpointClasses(hero).length, 0, `hero still uses viewport breakpoints: ${breakpointClasses(hero).join(' ')}`);
      assert.ok(/text-/.test(h1Class), 'headline has no explicit type size');
      perModeHeadlineClass.set(`${config.id}:${mode}`, h1Class);
    });

    await test('exactly one H1 and it carries the hero headline', () => {
      const h1s = hero.querySelectorAll('h1');
      assert.equal(h1s.length, 1, `expected 1 H1, found ${h1s.length}`);
      assert.equal(h1s[0], hero.querySelector('[data-testid="hero-headline"]'));
    });

    await test('description stays a short, readable paragraph', () => {
      const text = flat(hero.querySelector('[data-testid="hero-description"]'));
      assert.ok(text.length > 40 && text.length < 400, `description length ${text.length} is not hero-appropriate`);
      const cls = classesOf(hero.querySelector('[data-testid="hero-description"]'));
      assert.ok(/max-w-/.test(cls), 'description needs a max width to stay readable');
    });

    /* --- CTAs ------------------------------------------------------ */

    await test('all rendered CTAs are visible and touch-friendly', () => {
      const ids = ['hero-book-cta', 'hero-services-cta', 'hero-call-cta', 'hero-whatsapp-cta', 'hero-gallery-cta'];
      let seen = 0;
      for (const id of ids) {
        const el = hero.querySelector(`[data-testid="${id}"]`);
        if (!el) continue;
        seen += 1;
        const cls = classesOf(el);
        assert.ok(cls.includes('site-touch'), `${id} missing the 44px site-touch rule`);
        assert.ok(!cls.split(/\s+/).includes('hidden'), `${id} is hidden on ${mode}`);
      }
      assert.ok(seen >= 2, 'hero must always expose at least the two primary CTAs');
    });

    await test('Book Appointment opens the existing booking flow', async () => {
      const cta = hero.querySelector('[data-testid="hero-book-cta"]');
      assert.equal(cta.getAttribute('data-open-booking'), 'true');
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
      await act(async () => { fireEvent.click(cta); });
      assert.ok(utils.container.querySelector('[data-testid="site-booking-flow"]'), `booking flow did not open on ${mode}`);
      const back = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
      assert.ok(back, 'booking flow has no way back');
      await act(async () => { fireEvent.click(back); });
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    });

    await test('Explore Services reaches the real services section', async () => {
      const cta = hero.querySelector('[data-testid="hero-services-cta"]');
      const target = utils.container.querySelector('#section-services');
      assert.ok(target, 'services section missing from the page');
      assert.equal(target.getAttribute('data-site-section'), 'services');
      assert.notEqual(cta.getAttribute('data-open-booking'), 'true', 'Explore Services must not open booking');
      let threw = null;
      try { await act(async () => { fireEvent.click(cta); }); } catch (error) { threw = error; }
      assert.equal(threw, null, 'Explore Services click failed');
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null, 'Explore Services wrongly opened booking');
    });

    /* --- Mobile-specific optimization ----------------------------- */

    if (mode === 'mobile') {
      await test('mobile hero stacks into a single column', () => {
        const grids = Array.from(hero.querySelectorAll('*')).filter((el) => classesOf(el).split(/\s+/).includes('grid'));
        const multiCol = grids.filter((el) => /grid-cols-\[[^\]]*fr[^\]]*fr/.test(classesOf(el)));
        assert.equal(multiCol.length, 0, 'mobile hero still uses a desktop fr/fr split');
      });

      await test('mobile requests the narrowest media source', () => {
        const media = frame.querySelector('video, img');
        const source = media.tagName === 'VIDEO' ? media.getAttribute('poster') : media.getAttribute('src');
        if (!/[?&]w=/.test(source || '')) return;
        assert.match(source, /[?&]w=640(&|$)/, `mobile should request w=640, got ${source}`);
        assert.match(source, /[?&]q=70(&|$)/, 'mobile should lower image quality for payload');
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2. Root-cause guard: three genuinely distinct frame scales          */
/* ------------------------------------------------------------------ */

section('Responsive scaling is frame-accurate (11.4 root-cause fix)');

for (const config of CASES) {
  await test(`${config.id}: desktop / tablet / mobile each get their own headline size`, () => {
    const desktop = perModeHeadlineClass.get(`${config.id}:desktop`);
    const tablet = perModeHeadlineClass.get(`${config.id}:tablet`);
    const mobile = perModeHeadlineClass.get(`${config.id}:mobile`);
    assert.ok(desktop && tablet && mobile, 'missing captured headline classes');
    assert.notEqual(desktop, tablet, 'tablet renders at desktop scale');
    assert.notEqual(tablet, mobile, 'tablet renders at mobile scale');
    assert.notEqual(desktop, mobile, 'desktop and mobile share a scale');
  });
}

await test('no hero uses a CSS viewport breakpoint anywhere', () => {
  const offenders = [];
  for (const config of CASES) {
    for (const mode of MODES) {
      reset();
      const utils = render(React.createElement(config.Component, { data: qaData(config.id), mode }));
      const found = breakpointClasses(heroOf(utils.container));
      if (found.length) offenders.push(`${config.id}/${mode}: ${found.join(' ')}`);
    }
  }
  assert.equal(offenders.length, 0, `viewport breakpoints leak into the frame-sized hero:\n${offenders.join('\n')}`);
});

/* ------------------------------------------------------------------ */
/* 3. Fallbacks + layout shift                                         */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — fallbacks & layout stability`);

  for (const mode of MODES) {
    reset();
    setThemeHeroVideo(config.id, `https://cdn.example.com/${config.id}.mp4`);
    const utils = render(React.createElement(config.Component, { data: qaData(config.id), mode }));
    const frame = heroOf(utils.container).querySelector('[data-testid="hero-media-frame"]');

    await test(`${mode}: video fallback swaps to the poster image, keeping the frame`, async () => {
      const video = frame.querySelector('video');
      assert.ok(video, 'registered clip did not render');
      const ratioBefore = frame.style.aspectRatio;
      await act(async () => { fireEvent.error(video); });
      const after = heroOf(utils.container).querySelector('[data-testid="hero-media-frame"]');
      assert.equal(after.getAttribute('data-hero-media-kind'), 'image', 'did not fall back to image');
      assert.ok(after.querySelector('img'), 'no fallback image after video failure');
      assert.equal(after.style.aspectRatio, ratioBefore, 'frame ratio changed → layout shift on fallback');
    });
    resetThemeHeroVideos();

    reset({ reducedMotion: true });
    const still = render(React.createElement(config.Component, { data: qaData(config.id), mode }));
    const stillFrame = heroOf(still.container).querySelector('[data-testid="hero-media-frame"]');

    await test(`${mode}: image fallback shows the existing error state, keeping the frame`, async () => {
      const img = stillFrame.querySelector('img');
      assert.ok(img, 'hero image missing');
      const ratioBefore = stillFrame.style.aspectRatio;
      await act(async () => { fireEvent.error(img); });
      const heroAfter = heroOf(still.container);
      assert.ok(heroAfter.querySelector('[data-testid="site-image-error"]'), 'SiteImage error state missing');
      assert.equal(
        heroAfter.querySelector('[data-testid="hero-media-frame"]').style.aspectRatio, ratioBefore,
        'frame ratio changed → layout shift on image error',
      );
    });

    await test(`${mode}: loading state reserves space (skeleton inside a sized box)`, () => {
      const wrapper = heroOf(still.container).querySelector('[data-testid="site-image-wrapper"]');
      if (!wrapper) return;
      assert.ok(/\d/.test(wrapper.style.aspectRatio || ''), 'image wrapper does not reserve an aspect ratio');
    });
  }
}
setReducedMotionForTests(false);
resetThemeHeroVideos();

/* ------------------------------------------------------------------ */
/* 4. Light / Dark × English / Hindi on every frame                    */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — light/dark × EN/HI`);

  for (const mode of MODES) {
    for (const appearance of ['light', 'dark']) {
      reset({ appearance });
      const utils = render(React.createElement(config.Component, { data: qaData(config.id), mode }));
      const hero = heroOf(utils.container);
      await test(`${mode}/${appearance}: hero, media and CTAs all render`, () => {
        assert.equal(utils.container.querySelector('[data-testid="site-header"]').getAttribute('data-appearance'), appearance);
        assert.ok(hero.querySelector('[data-testid="hero-media-frame"]'), 'media frame missing');
        assert.ok(hero.querySelector('[data-testid="hero-headline"]'), 'headline missing');
        assert.ok(hero.querySelector('[data-testid="hero-book-cta"]'), 'book CTA missing');
        assert.ok(hero.querySelector('[data-testid="hero-services-cta"]'), 'services CTA missing');
        assert.ok((hero.getAttribute('style') || '').length > 0, 'hero surface lost its themed style');
      });
    }

    reset({ locale: 'hi' });
    const hiUtils = render(React.createElement(config.Component, { data: qaData(config.id), mode }));
    const hiHero = heroOf(hiUtils.container);
    const HI = heroText(config.id, 'hi');

    await test(`${mode}/HI: headline, description and CTAs are in Hindi`, () => {
      const headline = flat(hiHero.querySelector('[data-testid="hero-headline"]'));
      assert.match(headline, /[\u0900-\u097F]/, 'headline not in Devanagari');
      assert.equal(flat(hiHero.querySelector('[data-testid="hero-description"]')), HI.description);
      assert.equal(flat(hiHero.querySelector('[data-testid="hero-book-cta"]')), HI.primaryCta);
      assert.equal(flat(hiHero.querySelector('[data-testid="hero-services-cta"]')), HI.secondaryCta);
    });

    await test(`${mode}/HI: longer Hindi copy does not break containment`, () => {
      assert.ok(classesOf(hiHero).includes('overflow-hidden'));
      assert.ok(widestFixedPx(hiHero) <= FRAME_WIDTH[mode], 'Hindi layout introduced an oversized fixed width');
      assert.equal(breakpointClasses(hiHero).length, 0, 'Hindi layout leaks viewport breakpoints');
    });

    await test(`${mode}/HI: Book Appointment still opens the booking flow`, async () => {
      await act(async () => { fireEvent.click(hiHero.querySelector('[data-testid="hero-book-cta"]')); });
      assert.ok(hiUtils.container.querySelector('[data-testid="site-booking-flow"]'), 'Hindi booking flow did not open');
      const back = Array.from(hiUtils.container.querySelectorAll('button')).find((b) => /Back to Website|वेबसाइट/i.test(b.textContent || ''));
      if (back) await act(async () => { fireEvent.click(back); });
    });
  }
}
setSiteLocale('en');
setSiteAppearance(undefined);

/* ------------------------------------------------------------------ */
/* 5. Theme isolation across every frame                               */
/* ------------------------------------------------------------------ */

section('Each theme keeps its own hero design, content and media');

for (const mode of MODES) {
  const layouts = new Map();
  const headlines = new Map();
  const surfaces = new Map();
  const images = new Map();

  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: qaData(config.id), mode }));
    const hero = heroOf(utils.container);
    layouts.set(config.id, hero.getAttribute('data-hero-layout'));
    headlines.set(config.id, flat(hero.querySelector('[data-testid="hero-headline"]')));
    surfaces.set(config.id, hero.getAttribute('style') || '');
    images.set(config.id, Array.from(hero.querySelectorAll('img')).map((img) => img.getAttribute('src')));

    await test(`${mode}/${config.id}: keeps its own 11.1 layout signature`, () => {
      assert.equal(hero.getAttribute('data-hero-layout'), config.layout);
      assert.equal(hero.getAttribute('data-hero-theme'), config.id);
      assert.equal(hero.querySelector('[data-testid="hero-media-frame"]').getAttribute('data-hero-media-theme'), config.id);
    });

    await test(`${mode}/${config.id}: uses its own 11.2 content, not generic copy`, () => {
      const H = heroText(config.id, 'en');
      assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).includes(H.headlineAccent));
      assert.equal(flat(hero.querySelector('[data-testid="hero-description"]')), H.description);
      assert.equal(flat(hero.querySelector('[data-testid="hero-book-cta"]')), H.primaryCta);
      const focus = Array.from(hero.querySelectorAll('[data-hero-focus-item]')).map((el) => el.getAttribute('data-hero-focus-item'));
      assert.deepEqual(focus, [...H.focus], 'focus badges are not this theme’s own');
    });
  }

  await test(`${mode}: layouts, headlines and surfaces differ pairwise across all five themes`, () => {
    for (const [label, map] of [['layout', layouts], ['headline', headlines], ['surface', surfaces]]) {
      const values = [...map.values()];
      assert.equal(new Set(values).size, CASES.length, `${label} not distinct on ${mode}: ${values.join(' || ')}`);
    }
  });

  await test(`${mode}: no hero image is shared between two themes`, () => {
    const owner = new Map();
    for (const [themeId, srcs] of images) {
      for (const src of srcs) {
        if (!src) continue;
        const previous = owner.get(src);
        assert.ok(!previous || previous === themeId, `${src} shared by ${previous} and ${themeId}`);
        owner.set(src, themeId);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* 6. Helper unit checks + previous-phase guard                        */
/* ------------------------------------------------------------------ */

section('Helpers and previous phases');

await test('heroModeValue resolves each frame mode independently', () => {
  const values = { desktop: 'D', tablet: 'T', mobile: 'M' };
  assert.equal(heroModeValue('desktop', values), 'D');
  assert.equal(heroModeValue('tablet', values), 'T');
  assert.equal(heroModeValue('mobile', values), 'M');
});

await test('Phase 10 chrome and canonical order survive on every frame', () => {
  for (const config of CASES) {
    for (const mode of MODES) {
      reset();
      const utils = render(React.createElement(config.Component, { data: qaData(config.id), mode }));
      assert.ok(utils.container.querySelector('[data-testid="site-header"]'), `header missing ${config.id}/${mode}`);
      assert.ok(utils.container.querySelector('[data-testid="site-footer"]'), `footer missing ${config.id}/${mode}`);
      const hero = heroOf(utils.container);
      assert.equal(hero.getAttribute('data-site-section'), 'hero');
      assert.equal(hero.id, 'section-hero');
    }
  }
});

console.log('\n────────────────────────────────────────');
console.log(`Phase 11.4 hero desktop + tablet + mobile QA: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five heroes pass Desktop + Tablet + Mobile QA in EN/HI and Light/Dark.');
cleanup();
process.exit(0);
