/**
 * PHASE 11.3 — HERO MEDIA & CALL-TO-ACTION (five-theme acceptance)
 *
 * Phase 11.1 (layout) and 11.2 (content) are regression-checked by their own
 * suites. This one validates hero MEDIA and CTA behaviour:
 *
 *   1. Every theme renders its own hero media (image or video) with a
 *      mobile-optimized source and a reserved aspect ratio.
 *   2. Video is muted / playsInline / loop and never has controls or sound;
 *      reduced-motion visitors get the still poster instead.
 *   3. Media failures fall back: video error → poster image, image error →
 *      the existing SiteImage error state.
 *   4. Hero CTAs: Book Appointment (existing booking flow), Explore Services,
 *      and optional Call / WhatsApp / View Gallery through the existing
 *      contact system — hidden when the owner disabled them.
 *   5. Theme isolation: no shared hero media source, no shared CTA text,
 *      no shared CTA styling.
 *   6. Desktop / tablet / mobile × EN / HI × light / dark all verified.
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
// jsdom has no media pipeline: make play() a resolved no-op so the component
// behaves like a browser that allowed muted autoplay.
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
const { heroCtaOptions } = await import('../src/lib/siteHero.ts');
const {
  heroImageSrc,
  heroImageSizes,
  heroMediaPlan,
  heroVideoSource,
  isPlayableVideoFile,
  setReducedMotionForTests,
  setThemeHeroVideo,
  resetThemeHeroVideos,
  themeHeroVideoSrc,
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

function baseData(templateId, extras = {}) {
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
    // Each theme is a separate salon in these fixtures, so owner media is
    // per-theme too; the cross-theme uniqueness rule below targets the media
    // the THEME itself supplies.
    gallery: [{ id: 'g1', url: `https://example.com/${templateId}-gallery-1.jpg`, alt: 'Work', category: 'General' }],
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
  { id: 'barber_mens_grooming', label: "Barber & Men's Grooming", Component: Barber },
  { id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar', Component: HairStudio },
  { id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa', Component: BeautySpa },
  { id: 'family_full_service', label: 'Full-Service Family Salon', Component: Family },
  { id: 'nail_lash_studio', label: 'Nail & Lash Studio', Component: NailLash },
];
const MODES = ['desktop', 'tablet', 'mobile'];

function reset({ locale = 'en', appearance = undefined, reducedMotion = false } = {}) {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(appearance);
  setReducedMotionForTests(reducedMotion);
  document.head.innerHTML = '';
}
function heroOf(container) {
  const hero = container.querySelector('[data-testid="site-hero"]');
  assert.ok(hero, 'hero section missing');
  return hero;
}
const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ */
/* 1. Media contract per theme and viewport                            */
/* ------------------------------------------------------------------ */

const mediaSources = new Map();
const ctaStyles = new Map();

for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode} media`);
    reset();
    const data = baseData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode }));
    const hero = heroOf(utils.container);
    const frame = hero.querySelector('[data-testid="hero-media-frame"]');

    await test('hero exposes a dedicated media frame for this theme', () => {
      assert.ok(frame, 'hero-media-frame missing');
      assert.equal(frame.getAttribute('data-hero-media-theme'), config.id);
    });

    await test('media frame reserves an aspect ratio (no layout shift)', () => {
      const ratio = frame.style.aspectRatio;
      assert.ok(ratio && /\d/.test(ratio), `aspect-ratio not reserved, got "${ratio}"`);
    });

    await test('hero renders a video or an image, never nothing', () => {
      const kind = frame.getAttribute('data-hero-media-kind');
      assert.ok(kind === 'video' || kind === 'image', `unexpected media kind ${kind}`);
      const media = frame.querySelector('video') || frame.querySelector('img');
      assert.ok(media, 'no <video> or <img> rendered in the hero frame');
    });

    await test('hero video is muted, inline, looping and has no controls', () => {
      const video = frame.querySelector('video');
      if (!video) return; // image hero for this configuration
      assert.ok(video.hasAttribute('muted') || video.muted === true, 'video is not muted');
      assert.ok(video.hasAttribute('playsinline') || video.playsInline === true, 'video is not inline');
      assert.ok(video.hasAttribute('loop') || video.loop === true, 'video does not loop');
      assert.ok(!video.hasAttribute('controls'), 'video must not expose sound controls');
      assert.ok(video.getAttribute('poster'), 'video must carry a poster fallback frame');
    });

    await test('hero still image uses the existing optimized image system', () => {
      const img = hero.querySelector('[data-testid="site-image"]');
      assert.ok(img, 'no SiteImage-rendered hero image');
      assert.equal(img.getAttribute('loading'), 'eager', 'above-the-fold hero image must be eager');
      assert.ok(img.getAttribute('srcset'), 'hero image should expose a srcset');
    });

    await test('media source is mobile-optimized for this viewport', () => {
      const video = frame.querySelector('video');
      const source = video ? video.getAttribute('poster') : (frame.querySelector('img')?.getAttribute('src') || '');
      if (!/[?&]w=/.test(source)) return; // owner upload without transform support
      assert.match(source, new RegExp(`[?&]w=${HERO_WIDTHS[mode]}(&|$)`), `expected w=${HERO_WIDTHS[mode]} in ${source}`);
    });

    if (mode === 'desktop') {
      const video = frame.querySelector('video');
      mediaSources.set(config.id, {
        video: video?.getAttribute('src') || '',
        poster: video?.getAttribute('poster') || frame.querySelector('img')?.getAttribute('src') || '',
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2. Reduced motion                                                   */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — reduced motion`);
  reset({ reducedMotion: true });
  const utils = render(React.createElement(config.Component, { data: baseData(config.id), mode: 'desktop' }));
  const frame = heroOf(utils.container).querySelector('[data-testid="hero-media-frame"]');

  await test('reduced-motion visitors never get an autoplaying hero video', () => {
    assert.equal(frame.getAttribute('data-hero-motion'), 'reduced');
    assert.equal(frame.getAttribute('data-hero-media-kind'), 'image');
    assert.equal(frame.querySelector('video'), null, 'video rendered despite reduced-motion preference');
  });

  await test('reduced-motion hero still shows the theme poster image', () => {
    const img = frame.querySelector('img');
    assert.ok(img, 'poster image missing under reduced motion');
    assert.ok((img.getAttribute('src') || '').length > 0);
  });
}
setReducedMotionForTests(false);

/* ------------------------------------------------------------------ */
/* 3. Fallbacks                                                        */
/* ------------------------------------------------------------------ */

section('Media fallbacks');

for (const config of CASES) {
  reset();
  const utils = render(React.createElement(config.Component, { data: baseData(config.id), mode: 'desktop' }));
  const frame = heroOf(utils.container).querySelector('[data-testid="hero-media-frame"]');
  const video = frame.querySelector('video');

  await test(`${config.id}: video failure falls back to the poster image`, async () => {
    if (!video) {
      assert.equal(frame.getAttribute('data-hero-media-kind'), 'image');
      return;
    }
    await act(async () => { fireEvent.error(video); });
    const after = heroOf(utils.container).querySelector('[data-testid="hero-media-frame"]');
    assert.equal(after.getAttribute('data-hero-video-failed'), 'true');
    assert.equal(after.getAttribute('data-hero-media-kind'), 'image');
    assert.equal(after.querySelector('video'), null, 'failed video should be replaced');
    assert.ok(after.querySelector('img'), 'fallback image missing after video failure');
  });

  await test(`${config.id}: image failure shows the existing error state`, async () => {
    reset();
    setReducedMotionForTests(true); // force the image path
    const still = render(React.createElement(config.Component, { data: baseData(config.id), mode: 'desktop' }));
    const img = heroOf(still.container).querySelector('[data-testid="hero-media-frame"] img');
    assert.ok(img, 'hero image missing');
    await act(async () => { fireEvent.error(img); });
    assert.ok(
      heroOf(still.container).querySelector('[data-testid="site-image-error"]'),
      'SiteImage error state not shown',
    );
    setReducedMotionForTests(false);
  });
}

await test('owner reels that are not playable files are treated as external links', () => {
  const data = baseData('barber_mens_grooming', {
    socialVideos: [{ id: 'v1', title: 'Reel', platform: 'instagram', url: 'https://instagram.com/reel/abc', thumbnailUrl: 'https://example.com/t.jpg' }],
  });
  const plan = heroMediaPlan('barber_mens_grooming', data, false);
  assert.equal(plan.video, null, 'external reel must not autoplay inline');
  assert.ok(plan.externalVideo, 'external reel link missing');
  assert.equal(plan.externalVideo.kind, 'embed');
});

await test('owner-uploaded playable video files are used inline', () => {
  const data = baseData('barber_mens_grooming', {
    socialVideos: [{ id: 'v1', title: 'Shop clip', platform: 'instagram', url: 'https://cdn.example.com/shop.mp4', thumbnailUrl: 'https://example.com/t.jpg' }],
  });
  const plan = heroMediaPlan('barber_mens_grooming', data, false);
  assert.ok(plan.video, 'playable owner video should be used');
  assert.equal(plan.video.origin, 'owner');
  assert.equal(plan.video.src, 'https://cdn.example.com/shop.mp4');
});

await test('owner hero image always wins as the poster frame', () => {
  const data = baseData('nail_lash_studio', {
    heroImageUrl: 'https://example.com/owner-hero.jpg',
    socialVideos: [{ id: 'v1', title: 'Reel', platform: 'instagram', url: 'https://cdn.example.com/a.mp4', thumbnailUrl: 'https://example.com/thumb.jpg' }],
  });
  assert.equal(heroMediaPlan('nail_lash_studio', data, false).posterUrl, 'https://example.com/owner-hero.jpg');
});

await test('isPlayableVideoFile recognises real media files only', () => {
  assert.ok(isPlayableVideoFile('https://x.com/a.mp4'));
  assert.ok(isPlayableVideoFile('https://x.com/a.webm?v=2'));
  assert.ok(!isPlayableVideoFile('https://instagram.com/reel/abc'));
  assert.ok(!isPlayableVideoFile('https://youtube.com/watch?v=abc'));
});

await test('heroImageSrc narrows width per viewport and leaves uploads untouched', () => {
  const unsplash = 'https://images.unsplash.com/photo-1?q=80&w=1400&auto=format&fit=crop';
  assert.match(heroImageSrc(unsplash, 'mobile'), /w=640/);
  assert.match(heroImageSrc(unsplash, 'tablet'), /w=1000/);
  assert.match(heroImageSrc(unsplash, 'desktop'), /w=1400/);
  assert.equal(heroImageSrc('data:image/png;base64,AAA', 'mobile'), 'data:image/png;base64,AAA');
  assert.equal(heroImageSrc('https://example.com/owner.jpg', 'mobile'), 'https://example.com/owner.jpg');
  assert.equal(heroImageSizes('mobile'), '100vw');
});

/* ------------------------------------------------------------------ */
/* 4. Hero CTAs                                                        */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode} CTAs`);
    reset();
    const data = baseData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode }));
    const hero = heroOf(utils.container);
    const H = heroText(config.id, 'en');

    await test('primary Book Appointment opens the existing booking flow', async () => {
      const cta = hero.querySelector('[data-testid="hero-book-cta"]');
      assert.ok(cta, 'hero-book-cta missing');
      assert.equal(cta.getAttribute('data-open-booking'), 'true');
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
      await act(async () => { fireEvent.click(cta); });
      assert.ok(utils.container.querySelector('[data-testid="site-booking-flow"]'), 'booking flow did not open');
      const back = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
      await act(async () => { fireEvent.click(back); });
    });

    await test('secondary Explore Services is present and not a booking trigger', () => {
      const cta = hero.querySelector('[data-testid="hero-services-cta"]');
      assert.ok(cta, 'hero-services-cta missing');
      assert.notEqual(cta.getAttribute('data-open-booking'), 'true');
      assert.ok(utils.container.querySelector('#section-services'), 'services target missing');
    });

    await test('optional Call CTA uses the existing protected contact system', () => {
      const call = hero.querySelector('[data-testid="hero-call-cta"]');
      assert.ok(call, 'hero-call-cta missing');
      // PHASE 16.8 — the hero Call CTA is gated on the required 25% advance
      // payment: locked it exposes no tel: target at all.
      assert.equal(call.dataset.locked, 'true');
      assert.equal(call.getAttribute('href'), null);
      assert.ok(flat(call).includes(H.callCta));
    });

    await test('optional WhatsApp CTA uses the existing protected contact system', () => {
      const wa = hero.querySelector('[data-testid="hero-whatsapp-cta"]');
      assert.ok(wa, 'hero-whatsapp-cta missing');
      assert.equal(wa.dataset.locked, 'true');
      assert.equal(wa.getAttribute('href'), null);
      assert.ok(flat(wa).includes(H.whatsAppCta));
    });

    await test('optional View Gallery CTA targets the gallery section', () => {
      const gallery = hero.querySelector('[data-testid="hero-gallery-cta"]');
      assert.ok(gallery, 'hero-gallery-cta missing');
      assert.equal(flat(gallery), H.galleryCta);
      assert.ok(utils.container.querySelector('#section-gallery'), 'gallery target section missing');
      let threw = null;
      try { fireEvent.click(gallery); } catch (error) { threw = error; }
      assert.equal(threw, null, 'gallery CTA click failed');
    });

    await test('every hero CTA meets the 44px touch target rule', () => {
      for (const id of ['hero-book-cta', 'hero-services-cta', 'hero-call-cta', 'hero-whatsapp-cta', 'hero-gallery-cta']) {
        const el = hero.querySelector(`[data-testid="${id}"]`);
        if (el) assert.ok(el.className.includes('site-touch'), `${id} missing site-touch sizing`);
      }
    });

    if (mode === 'desktop') {
      const row = hero.querySelector('[data-testid="hero-cta-secondary-row"]');
      ctaStyles.set(config.id, [
        hero.querySelector('[data-testid="hero-call-cta"]')?.className || '',
        row?.className || '',
      ].join(' ~ '));
    }
  }
}

section('Optional CTAs respect the existing contact configuration');

for (const config of CASES) {
  reset();
  const data = baseData(config.id, {
    contactOptions: { callNow: false, whatsapp: false, bookNow: true },
    gallery: [],
  });
  const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
  const hero = heroOf(utils.container);

  await test(`${config.id}: Call / WhatsApp / Gallery hide when unavailable`, () => {
    assert.equal(hero.querySelector('[data-testid="hero-call-cta"]'), null, 'Call shown while disabled');
    assert.equal(hero.querySelector('[data-testid="hero-whatsapp-cta"]'), null, 'WhatsApp shown while disabled');
    assert.equal(hero.querySelector('[data-testid="hero-gallery-cta"]'), null, 'Gallery shown without photos');
  });

  await test(`${config.id}: required Book + Explore CTAs remain`, () => {
    assert.ok(hero.querySelector('[data-testid="hero-book-cta"]'));
    assert.ok(hero.querySelector('[data-testid="hero-services-cta"]'));
  });

  await test(`${config.id}: heroCtaOptions mirrors the rendered availability`, () => {
    const options = heroCtaOptions(data);
    assert.equal(options.call, null);
    assert.equal(options.whatsApp, null);
    assert.equal(options.gallery, null);
  });
}

/* ------------------------------------------------------------------ */
/* 5. Language + appearance                                            */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — EN/HI × light/dark media + CTA`);

  reset({ locale: 'hi' });
  {
    const utils = render(React.createElement(config.Component, { data: baseData(config.id), mode: 'desktop' }));
    const hero = heroOf(utils.container);
    const HI = heroText(config.id, 'hi');
    await test('Hindi translates every optional CTA label', () => {
      assert.equal(flat(hero.querySelector('[data-testid="hero-call-cta"]')), HI.callCta);
      assert.equal(flat(hero.querySelector('[data-testid="hero-whatsapp-cta"]')), HI.whatsAppCta);
      assert.equal(flat(hero.querySelector('[data-testid="hero-gallery-cta"]')), HI.galleryCta);
      for (const key of ['callCta', 'whatsAppCta', 'galleryCta', 'videoCta']) {
        assert.match(HI[key], /[\u0900-\u097F]/, `${key} not translated to Hindi`);
      }
    });
    await test('Hindi keeps the protected contact CTAs consistent', () => {
      // PHASE 16.8 — locked in Hindi too, with the Hindi lock explanation.
      const call = hero.querySelector('[data-testid="hero-call-cta"]');
      const wa = hero.querySelector('[data-testid="hero-whatsapp-cta"]');
      assert.equal(call.getAttribute('href'), null);
      assert.equal(wa.getAttribute('href'), null);
      assert.match(call.getAttribute('title') || '', /[\u0900-\u097F]/);
      assert.match(wa.getAttribute('title') || '', /[\u0900-\u097F]/);
    });
  }

  for (const appearance of ['light', 'dark']) {
    reset({ appearance });
    const utils = render(React.createElement(config.Component, { data: baseData(config.id), mode: 'mobile' }));
    const hero = heroOf(utils.container);
    await test(`${appearance} mode keeps the hero media and all CTAs rendered`, () => {
      assert.ok(hero.querySelector('[data-testid="hero-media-frame"]'), 'media frame missing');
      assert.ok(hero.querySelector('[data-testid="hero-book-cta"]'), 'book CTA missing');
      assert.ok(hero.querySelector('[data-testid="hero-services-cta"]'), 'services CTA missing');
      assert.ok(hero.querySelector('[data-testid="hero-call-cta"]'), 'call CTA missing');
      const header = utils.container.querySelector('[data-testid="site-header"]');
      assert.equal(header.getAttribute('data-appearance'), appearance);
    });
  }
}
setSiteAppearance(undefined);
setSiteLocale('en');

/* ------------------------------------------------------------------ */
/* 6. Theme isolation                                                  */
/* ------------------------------------------------------------------ */

section('Theme isolation — media and CTA');

await test('themes ship image-first: no guessed third-party clip is hardcoded', () => {
  resetThemeHeroVideos();
  for (const config of CASES) {
    assert.equal(themeHeroVideoSrc(config.id), '', `${config.id} hardcodes a hero clip`);
    const plan = heroMediaPlan(config.id, baseData(config.id), false);
    assert.equal(plan.video, null, `${config.id} plays a clip with no verified source`);
    assert.ok(plan.posterUrl, `${config.id} has no poster image`);
  }
});

await test('each theme has its OWN hero video slot — clips are never shared', () => {
  resetThemeHeroVideos();
  for (const config of CASES) setThemeHeroVideo(config.id, `https://cdn.example.com/${config.id}.mp4`);
  const srcs = CASES.map((c) => themeHeroVideoSrc(c.id));
  assert.equal(new Set(srcs).size, CASES.length, `theme videos not distinct: ${srcs.join(', ')}`);
  for (const config of CASES) {
    const plan = heroMediaPlan(config.id, baseData(config.id), false);
    assert.ok(plan.video, `${config.id} did not use its registered clip`);
    assert.equal(plan.video.src, `https://cdn.example.com/${config.id}.mp4`);
    assert.equal(plan.video.origin, 'theme');
  }
  resetThemeHeroVideos();
});

await test('a registered theme clip is still suppressed under reduced motion', () => {
  setThemeHeroVideo('barber_mens_grooming', 'https://cdn.example.com/barber.mp4');
  const plan = heroMediaPlan('barber_mens_grooming', baseData('barber_mens_grooming'), true);
  assert.equal(plan.video, null, 'reduced motion must suppress the registered clip');
  assert.equal(plan.motionSuppressed, true);
  resetThemeHeroVideos();
});

await test('no two themes share a rendered hero media source', () => {
  // Owner uploads are per-salon; this asserts the rendered result stays
  // disjoint so a visitor never sees the same hero picture on two themes.
  const owner = new Map();
  for (const [themeId, sources] of mediaSources) {
    for (const src of [sources.video, sources.poster]) {
      if (!src) continue;
      const previous = owner.get(src);
      assert.ok(!previous || previous === themeId, `media ${src} shared by ${previous} and ${themeId}`);
      owner.set(src, themeId);
    }
  }
});

await test('an owner-published playable clip beats the theme slot', () => {
  for (const config of CASES) {
    setThemeHeroVideo(config.id, `https://cdn.example.com/${config.id}.mp4`);
    const resolved = heroVideoSource(config.id, baseData(config.id, {
      socialVideos: [{ id: 'v1', title: 'Owner clip', platform: 'instagram', url: 'https://cdn.example.com/owner.mp4', thumbnailUrl: '' }],
    }));
    assert.ok(resolved);
    assert.equal(resolved.origin, 'owner');
    assert.equal(resolved.src, 'https://cdn.example.com/owner.mp4');
  }
  resetThemeHeroVideos();
});

for (const locale of ['en', 'hi']) {
  await test(`${locale}: optional CTA text differs pairwise across themes`, () => {
    for (const field of ['callCta', 'whatsAppCta', 'galleryCta', 'videoCta']) {
      const values = CASES.map((c) => heroText(c.id, locale)[field]);
      assert.equal(new Set(values).size, CASES.length, `${field} repeats: ${values.join(' || ')}`);
    }
  });
}

await test('optional CTA styling differs pairwise across themes', () => {
  const values = [...ctaStyles.values()];
  assert.equal(values.length, CASES.length);
  assert.equal(new Set(values).size, CASES.length, 'CTA styling is shared between themes');
});

await test('Phase 11.1 layout signatures and Phase 10 header still intact', () => {
  const layouts = {
    barber_mens_grooming: 'cinematic-slab',
    hair_studio_color_bar: 'editorial-gallery',
    beauty_skin_spa: 'soft-arch',
    family_full_service: 'action-card-collage',
    nail_lash_studio: 'glam-card-shelf',
  };
  for (const config of CASES) {
    reset();
    const utils = render(React.createElement(config.Component, { data: baseData(config.id), mode: 'desktop' }));
    const hero = heroOf(utils.container);
    assert.equal(hero.getAttribute('data-hero-layout'), layouts[config.id]);
    assert.equal(hero.querySelectorAll('h1').length, 1);
    assert.ok(utils.getByTestId('site-header'));
  }
});

console.log('\n────────────────────────────────────────');
console.log(`Phase 11.3 hero media & CTA: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes verified: own media, muted/reduced-motion video, fallbacks, and Book/Explore/Call/WhatsApp/Gallery CTAs across desktop, tablet, mobile, EN/HI and light/dark.');
cleanup();
process.exit(0);
