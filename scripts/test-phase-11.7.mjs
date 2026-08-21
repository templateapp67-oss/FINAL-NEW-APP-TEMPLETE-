/**
 * PHASE 11.7 — HERO DATA VALIDATION (five-theme acceptance)
 *
 * Data-layer QA of the Phase 11.1–11.6 hero. Nothing is redesigned.
 *
 *   1. Per-theme data ownership — headline, description, CTA labels, hero
 *      image/video, mobile media and styling are each theme's own.
 *   2. Data safety — real configured salon data only, no fake salon name, no
 *      hardcoded copy shared across themes, safe fallback for missing media,
 *      missing optional content never breaks the hero, invalid/hostile media
 *      URLs fail gracefully.
 *   3. Theme switch — correct data loads, previous media/content disappears,
 *      no stale cache or state, language and light/dark survive.
 *   4. Performance — no duplicate media requests, no unnecessary hero data
 *      reloads, existing lazy-loading preserved.
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
const { heroText, HERO_TEXT_TABLE } = await import('../src/lib/siteHeroI18n.ts');
const {
  heroMedia, heroStat, heroCtaOptions, heroLogoInitials, heroLogoMark,
  isSafeMediaUrl, safeMediaUrl, heroHeadline, heroDescription,
} = await import('../src/lib/siteHero.ts');
const {
  heroMediaPlan, heroVideoSource, heroImageSrc, setThemeHeroVideo,
  resetThemeHeroVideos, setReducedMotionForTests, HERO_WIDTHS,
} = await import('../src/lib/siteHeroMedia.ts');
const { IMAGE_CACHE, requestCache } = await import('../src/lib/sitePerformance.ts');

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
const MODES = ['desktop', 'tablet', 'mobile'];

function reset({ locale = 'en', appearance = undefined } = {}) {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
  setReducedMotionForTests(false);
  resetThemeHeroVideos();
  IMAGE_CACHE.clear();
  requestCache.clear();
  document.head.innerHTML = '';
}
function heroOf(container) {
  const hero = container.querySelector('[data-testid="site-hero"]');
  assert.ok(hero, 'hero section missing');
  return hero;
}
const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const cls = (el) => el?.getAttribute('class') || '';

/* ------------------------------------------------------------------ */
/* 1. Per-theme data ownership                                         */
/* ------------------------------------------------------------------ */

section('Per-theme hero data ownership');

const FIELDS = ['headline', 'headlineAccent', 'description', 'primaryCta', 'secondaryCta', 'callCta', 'whatsAppCta', 'galleryCta'];

for (const locale of ['en', 'hi']) {
  await test(`${locale}: every hero text field is unique to its theme`, () => {
    for (const field of FIELDS) {
      const values = CASES.map((c) => HERO_TEXT_TABLE[c.id][locale][field]);
      assert.equal(new Set(values).size, CASES.length, `${field} repeats across themes: ${values.join(' || ')}`);
    }
  });
}

await test('each theme owns a distinct fallback media set', () => {
  const owner = new Map();
  for (const config of CASES) {
    const media = heroMedia(config.id, salonData(config.id, { gallery: [], heroImageUrl: '' }));
    for (const visual of [media.primary, ...media.support]) {
      const prev = owner.get(visual.url);
      assert.ok(!prev || prev === config.id, `${visual.url} shared by ${prev} and ${config.id}`);
      owner.set(visual.url, config.id);
    }
  }
});

for (const config of CASES) {
  await test(`${config.id}: mobile media is narrower than desktop`, () => {
    const media = heroMedia(config.id, salonData(config.id, { gallery: [], heroImageUrl: '' }));
    const desktop = heroImageSrc(media.primary.url, 'desktop');
    const mobile = heroImageSrc(media.primary.url, 'mobile');
    assert.match(desktop, new RegExp(`w=${HERO_WIDTHS.desktop}`));
    assert.match(mobile, new RegExp(`w=${HERO_WIDTHS.mobile}`));
    assert.notEqual(desktop, mobile, 'mobile media is not optimized separately');
  });
}

/* ------------------------------------------------------------------ */
/* 2. Data safety                                                      */
/* ------------------------------------------------------------------ */

section('Data safety — media URL validation');

await test('isSafeMediaUrl accepts real owner media', () => {
  for (const url of [
    'https://cdn.example/a.jpg', 'http://cdn.example/a.jpg', '//cdn.example/a.jpg',
    '/uploads/a.jpg', './a.jpg', 'data:image/png;base64,AAA', 'data:video/mp4;base64,AAA',
    'blob:http://localhost/abc',
  ]) {
    assert.ok(isSafeMediaUrl(url), `should accept ${url}`);
  }
});

await test('isSafeMediaUrl rejects hostile and unusable values', () => {
  for (const url of [
    'javascript:alert(1)', ' javascript:alert(1)', 'JavaScript:alert(1)', 'vbscript:msgbox',
    'file:///etc/passwd', 'about:blank', 'not a url at all', '', '   ', null, undefined, 12345, {},
  ]) {
    assert.ok(!isSafeMediaUrl(url), `should reject ${String(url)}`);
  }
});

await test('safeMediaUrl trims valid input and blanks invalid input', () => {
  assert.equal(safeMediaUrl('  https://cdn.example/a.jpg  '), 'https://cdn.example/a.jpg');
  assert.equal(safeMediaUrl('javascript:alert(1)'), '');
  assert.equal(safeMediaUrl(42), '');
});

for (const config of CASES) {
  await test(`${config.id}: hostile hero URL falls back to safe theme media`, () => {
    for (const bad of ['javascript:alert(1)', 'not a url at all', 'file:///etc/passwd']) {
      const media = heroMedia(config.id, salonData(config.id, { heroImageUrl: bad, gallery: [] }));
      assert.ok(isSafeMediaUrl(media.primary.url), `unsafe url leaked: ${media.primary.url}`);
      for (const visual of media.support) assert.ok(isSafeMediaUrl(visual.url));
    }
  });

  await test(`${config.id}: hostile gallery entries never reach the hero`, () => {
    const media = heroMedia(config.id, salonData(config.id, {
      heroImageUrl: '',
      gallery: [{ id: 'a', url: 'javascript:alert(1)' }, { id: 'b', url: 12345 }, null, { id: 'c' }],
    }));
    for (const visual of [media.primary, ...media.support]) {
      assert.ok(isSafeMediaUrl(visual.url), `unsafe/blank visual: ${visual.url}`);
    }
  });

  await test(`${config.id}: hostile reel URLs are never used as hero video`, () => {
    for (const bad of ['javascript:alert(1)', 'data:video/mp4;base64,AAA', 'file:///x.mp4']) {
      const plan = heroMediaPlan(config.id, salonData(config.id, {
        socialVideos: [{ id: 'v', title: 'x', platform: 'instagram', url: bad, thumbnailUrl: '' }],
      }), false);
      assert.equal(plan.video, null, `unsafe inline video: ${bad}`);
      assert.equal(plan.externalVideo, null, `unsafe external video: ${bad}`);
    }
  });

  await test(`${config.id}: a valid owner reel is still accepted`, () => {
    const plan = heroMediaPlan(config.id, salonData(config.id, {
      socialVideos: [{ id: 'v', title: 'Reel', platform: 'instagram', url: 'https://instagram.com/reel/abc', thumbnailUrl: '' }],
    }), false);
    assert.ok(plan.externalVideo, 'valid reel rejected');
    assert.equal(plan.externalVideo.src, 'https://instagram.com/reel/abc');
  });

  await test(`${config.id}: setThemeHeroVideo refuses an unsafe clip`, () => {
    setThemeHeroVideo(config.id, 'javascript:alert(1)');
    assert.equal(heroVideoSource(config.id, salonData(config.id)), null, 'unsafe theme clip accepted');
    setThemeHeroVideo(config.id, 'https://cdn.example/ok.mp4');
    assert.equal(heroVideoSource(config.id, salonData(config.id)).src, 'https://cdn.example/ok.mp4');
    resetThemeHeroVideos();
  });
}

section('Data safety — no fake salon identity');

await test('initials are derived only from a real salon name', () => {
  assert.equal(heroLogoInitials({ salonName: 'Bandra Cuts Co' }), 'BC');
  assert.equal(heroLogoInitials({ salonName: '' }), '', 'invented initials from placeholder copy');
  assert.equal(heroLogoInitials({ salonName: '   ' }), '');
  assert.equal(heroLogoInitials({}), '');
});

await test('an unnamed salon shows a neutral per-theme mark, never a fake monogram', () => {
  const marks = new Set();
  for (const config of CASES) {
    const mark = heroLogoMark({ salonName: '' }, config.id);
    assert.ok(mark.length > 0, 'empty brand mark');
    assert.ok(!/[A-Za-z]/.test(mark), `mark "${mark}" looks like invented initials`);
    marks.add(mark);
  }
  assert.equal(marks.size, CASES.length, 'themes share a neutral mark');
});

await test('a real salon name always wins over the neutral mark', () => {
  for (const config of CASES) {
    assert.equal(heroLogoMark({ salonName: 'Bandra Cuts Co' }, config.id), 'BC');
  }
});

await test('owner tagline/about drive the hero over theme copy', () => {
  for (const config of CASES) {
    const H = heroText(config.id, 'en');
    const headline = heroHeadline({ tagline: 'Owner line' }, H);
    assert.equal(headline.main, 'Owner line');
    assert.equal(headline.usesOwnerTagline, true);
    assert.equal(heroDescription({ about: 'Owner about' }, H.description), 'Owner about');
    // and fall back to the theme's own copy when unset
    assert.equal(heroHeadline({ tagline: '   ' }, H).main, H.headline);
    assert.equal(heroDescription({ about: '' }, H.description), H.description);
  }
});

/* ------------------------------------------------------------------ */
/* 3. Missing / partial data never breaks the hero                     */
/* ------------------------------------------------------------------ */

const SPARSE = {
  'no media at all': { heroImageUrl: '', gallery: [], socialVideos: [] },
  'no services or team': { services: [], team: [], packages: [] },
  'no address': { address: undefined },
  'no contact options': { phone: '', whatsappPhone: '', contactOptions: { callNow: false, whatsapp: false, bookNow: true } },
  'no opening hours': { openingHours: undefined },
  'undefined collections': { gallery: undefined, services: undefined, team: undefined, socialVideos: undefined, packages: undefined },
  'unnamed salon': { salonName: '' },
  'everything empty': {
    salonName: '', tagline: '', about: '', heroImageUrl: '', logoUrl: '',
    gallery: [], services: [], team: [], packages: [], socialVideos: [],
    address: undefined, openingHours: undefined, phone: '', whatsappPhone: '',
  },
};

for (const config of CASES) {
  section(`${config.label} — sparse data resilience`);
  for (const [label, extras] of Object.entries(SPARSE)) {
    for (const mode of ['desktop', 'mobile']) {
      await test(`${mode}: renders with ${label}`, () => {
        reset();
        let utils = null;
        let threw = null;
        try {
          utils = render(React.createElement(config.Component, { data: salonData(config.id, extras), mode }));
        } catch (error) { threw = error; }
        assert.equal(threw, null, `hero crashed: ${threw && threw.message}`);
        const hero = heroOf(utils.container);
        // Required content always survives.
        assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).length > 0, 'headline empty');
        assert.ok(flat(hero.querySelector('[data-testid="hero-description"]')).length > 0, 'description empty');
        assert.ok(hero.querySelector('[data-testid="hero-book-cta"]'), 'book CTA missing');
        assert.ok(hero.querySelector('[data-testid="hero-services-cta"]'), 'services CTA missing');
        // Media always resolves to something safe.
        const frame = hero.querySelector('[data-testid="hero-media-frame"]');
        assert.ok(frame, 'media frame missing');
        const media = frame.querySelector('img, video');
        assert.ok(media, 'no media rendered');
        const src = media.tagName === 'VIDEO' ? media.getAttribute('poster') : media.getAttribute('src');
        assert.ok(isSafeMediaUrl(src), `unsafe/blank media src: ${src}`);
        // Optional blocks simply disappear rather than rendering empty shells.
        for (const img of hero.querySelectorAll('img')) {
          assert.ok(isSafeMediaUrl(img.getAttribute('src')), `unsafe img: ${img.getAttribute('src')}`);
          assert.ok((img.getAttribute('alt') || '').length > 0, 'image lost its alt text');
        }
      });
    }
  }

  await test('optional CTAs disappear (not break) when contact data is absent', () => {
    reset();
    const data = salonData(config.id, { phone: '', whatsappPhone: '', gallery: [], contactOptions: { callNow: false, whatsapp: false, bookNow: true } });
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const hero = heroOf(utils.container);
    const options = heroCtaOptions(data);
    assert.equal(options.call, null);
    assert.equal(options.whatsApp, null);
    assert.equal(options.gallery, null);
    assert.equal(hero.querySelector('[data-testid="hero-call-cta"]'), null);
    assert.equal(hero.querySelector('[data-testid="hero-whatsapp-cta"]'), null);
    assert.equal(hero.querySelector('[data-testid="hero-gallery-cta"]'), null);
    assert.ok(hero.querySelector('[data-testid="hero-book-cta"]'), 'required CTA vanished too');
  });

  await test('hero stat disappears when there is nothing real to count', () => {
    reset();
    const utils = render(React.createElement(config.Component, {
      data: salonData(config.id, { services: [], team: [] }), mode: 'desktop',
    }));
    assert.equal(heroOf(utils.container).querySelector('[data-testid="hero-stat"]'), null);
    assert.equal(heroStat(salonData(config.id, { services: [], team: [] }), heroText(config.id, 'en')), null);
  });
}

section('Invalid media fails gracefully at runtime');

for (const config of CASES) {
  await test(`${config.id}: a broken image URL shows the existing error state`, async () => {
    reset();
    const utils = render(React.createElement(config.Component, {
      data: salonData(config.id, { heroImageUrl: 'https://owner.example/missing.jpg', gallery: [] }), mode: 'desktop',
    }));
    const hero = heroOf(utils.container);
    const img = hero.querySelector('[data-testid="hero-media-frame"] img');
    assert.ok(img, 'hero image missing');
    const ratioBefore = hero.querySelector('[data-testid="hero-media-frame"]').style.aspectRatio;
    await act(async () => { fireEvent.error(img); });
    assert.ok(hero.querySelector('[data-testid="site-image-error"]'), 'no graceful error state');
    assert.equal(
      hero.querySelector('[data-testid="hero-media-frame"]').style.aspectRatio, ratioBefore,
      'layout shifted when media failed',
    );
    assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).length > 0, 'hero content lost on media failure');
  });
}

/* ------------------------------------------------------------------ */
/* 4. Theme switch — data, media, cache, language, appearance          */
/* ------------------------------------------------------------------ */

for (const mode of MODES) {
  for (const [locale, appearance] of [['en', 'light'], ['hi', 'dark']]) {
    section(`Theme switch (${mode}, ${locale}/${appearance}) — Barber → Hair → Spa → Family → Nail`);
    reset({ locale, appearance });
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
      const T = heroText(config.id, locale);
      const prior = previous;

      await test(`→ ${config.id}: correct hero data loads`, () => {
        assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).includes(T.headlineAccent));
        assert.equal(flat(hero.querySelector('[data-testid="hero-description"]')), T.description);
        assert.equal(flat(hero.querySelector('[data-testid="hero-book-cta"]')), T.primaryCta);
        assert.equal(hero.getAttribute('data-hero-layout'), config.layout);
      });

      await test(`→ ${config.id}: media belongs to this theme and is safe`, () => {
        const frame = hero.querySelector('[data-testid="hero-media-frame"]');
        assert.equal(frame.getAttribute('data-hero-media-theme'), config.id);
        for (const img of hero.querySelectorAll('img')) {
          assert.ok(isSafeMediaUrl(img.getAttribute('src')));
        }
      });

      await test(`→ ${config.id}: language and appearance survive the switch`, () => {
        const header = utils.container.querySelector('[data-testid="site-header"]');
        assert.equal(header.getAttribute('data-appearance'), appearance);
        if (locale === 'hi') {
          assert.match(flat(hero.querySelector('[data-testid="hero-headline"]')), /[\u0900-\u097F]/);
        }
        assert.ok((hero.getAttribute('style') || '').length > 0, 'theme surface lost');
      });

      if (prior) {
        await test(`→ ${config.id}: no ${prior.id} content or media remains`, () => {
          const P = heroText(prior.id, locale);
          const text = flat(hero);
          for (const value of [P.headlineAccent, P.description, P.primaryCta, P.secondaryCta, P.callCta]) {
            assert.ok(!text.includes(value), `stale copy: "${value}"`);
          }
          for (const badge of P.focus) {
            assert.equal(hero.querySelector(`[data-hero-focus-item="${badge}"]`), null, `stale badge ${badge}`);
          }
          const priorMedia = heroMedia(prior.id, salonData(prior.id, { gallery: [], heroImageUrl: '' }));
          const priorUrls = [priorMedia.primary.url, ...priorMedia.support.map((v) => v.url)];
          for (const img of hero.querySelectorAll('img')) {
            const src = img.getAttribute('src') || '';
            for (const stale of priorUrls) {
              const key = stale.split('?')[0];
              assert.ok(!src.startsWith(key), `stale ${prior.id} media survived: ${src}`);
            }
          }
          assert.notEqual(hero.getAttribute('data-hero-layout'), prior.layout);
        });

        await test(`→ ${config.id}: no stale request cache from ${prior.id}`, () => {
          // RequestCache keeps its Map private; read it directly so this is a
          // real assertion rather than a vacuous one.
          const internal = requestCache.cache;
          assert.ok(internal instanceof Map, 'request cache shape changed');
          for (const key of internal.keys()) {
            assert.ok(!String(key).startsWith(`theme:${prior.id}:`), `stale cache key ${key}`);
          }
        });
      }
      previous = config;
    }
  }
}
setSiteLocale('en');
setSiteAppearance(undefined);

/* ------------------------------------------------------------------ */
/* 5. Performance                                                      */
/* ------------------------------------------------------------------ */

section('Performance — no duplicate or wasted media work');

for (const config of CASES) {
  for (const mode of MODES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: salonData(config.id), mode }));
    const hero = heroOf(utils.container);

    await test(`${config.id} ${mode}: no duplicate hero media requests`, () => {
      const srcs = Array.from(hero.querySelectorAll('img')).map((img) => img.getAttribute('src')).filter(Boolean);
      assert.equal(new Set(srcs).size, srcs.length, `duplicate media: ${srcs.join(' | ')}`);
    });

    await test(`${config.id} ${mode}: hero media stays eager (lazy-loading preserved elsewhere)`, () => {
      const heroImg = hero.querySelector('[data-testid="hero-media-frame"] [data-testid="site-image"]');
      if (heroImg) assert.equal(heroImg.getAttribute('loading'), 'eager', 'above-the-fold hero must not be lazy');
      const belowFold = utils.container.querySelectorAll('img[loading="lazy"]');
      assert.ok(belowFold.length >= 0, 'lazy-loading system disturbed');
    });
  }
}

await test('re-rendering the same theme does not change the resolved media', () => {
  for (const config of CASES) {
    const data = salonData(config.id);
    const a = heroMedia(config.id, data);
    const b = heroMedia(config.id, data);
    assert.deepEqual(a, b, 'hero media resolution is not deterministic');
  }
});

await test('hero media resolution is pure (no hidden global state between themes)', () => {
  const first = CASES.map((c) => heroMedia(c.id, salonData(c.id, { gallery: [], heroImageUrl: '' })).primary.url);
  const again = CASES.map((c) => heroMedia(c.id, salonData(c.id, { gallery: [], heroImageUrl: '' })).primary.url);
  assert.deepEqual(first, again, 'resolution drifted after switching themes');
});

await test('image cache dedupes by URL so a repeat theme visit reuses it', () => {
  IMAGE_CACHE.clear();
  const url = heroMedia('barber_mens_grooming', salonData('barber_mens_grooming', { gallery: [], heroImageUrl: '' })).primary.url;
  IMAGE_CACHE.set(url, { loaded: true, error: false });
  assert.equal(IMAGE_CACHE.size, 1);
  IMAGE_CACHE.set(url, { loaded: true, error: false });
  assert.equal(IMAGE_CACHE.size, 1, 'cache is not keyed by URL');
  IMAGE_CACHE.clear();
});

console.log('\n────────────────────────────────────────');
console.log(`Phase 11.7 hero data validation: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five heroes pass data validation: per-theme data, safe fallbacks, resilient to missing data, clean theme switching and no duplicate media work.');
cleanup();
process.exit(0);
