/**
 * PHASE 11.1 — UNIQUE HERO DESIGN FOR ALL 5 THEMES
 *
 * Mounts the REAL five theme renderers in jsdom and verifies, per theme and
 * per viewport (desktop / tablet / mobile):
 *
 *   1. Every hero contains: salon logo/name, theme headline, short
 *      description, primary Book Appointment CTA, secondary Explore Services
 *      CTA, and hero media (image and/or video).
 *   2. Optional rating / location / open-status information renders.
 *   3. The primary CTA opens the existing booking flow; the secondary CTA
 *      targets the services section.
 *   4. Each theme's hero is COMPLETELY different: distinct layout token,
 *      distinct background surface, distinct headline/description/CTA copy
 *      and distinct hero imagery (pairwise checks across all five).
 *   5. Phase 10 chrome is untouched: header, canonical section order,
 *      Language (EN/HI) and per-theme Dark Mode still drive the hero.
 *   6. Desktop and mobile both render the full hero contract.
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

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');

const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { collectSiteSectionOrder, SITE_SECTION_ORDER } = await import('../src/lib/siteStructure.ts');
const { heroText, HERO_TEXT_TABLE } = await import('../src/lib/siteHeroI18n.ts');
const { heroMedia, heroLocationLabel, heroLogoInitials } = await import('../src/lib/siteHero.ts');

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

function richData(templateId, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: 'Phase Eleven Salon',
    tagline: '',
    about: '',
    ownerName: 'Asha Verma',
    phone: '+91 99999 00000',
    whatsappPhone: '+91 99999 00000',
    logoUrl: '',
    heroImageUrl: '',
    gallery: [],
    socialVideos: [],
    services: [
      { id: 'svc-1', name: 'Signature Service', category: 'Haircut', description: 'Cut and finish.', price: 499, duration: 45, status: 'active', featured: true },
      { id: 'svc-2', name: 'Deluxe Service', category: 'Skin', description: 'Glow therapy.', price: 999, duration: 60, status: 'active' },
    ],
    packages: [{ id: 'pkg-1', name: 'Festive Combo', description: 'Bundle.', price: 1199, duration: 90, status: 'active' }],
    team: [{ id: 'tm-1', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: ['Color'], imageUrl: 'https://example.com/r.jpg', bio: 'Craft.', status: 'Available' }],
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

function reset() {
  cleanup();
  window.localStorage.clear();
  setSiteLocale('en');
  setSiteAppearance(undefined);
  document.head.innerHTML = '';
}

function heroOf(container) {
  const hero = container.querySelector('[data-testid="site-hero"]');
  assert.ok(hero, 'hero section missing');
  return hero;
}

/* ------------------------------------------------------------------ */
/* 1. Per-theme, per-viewport hero contract                            */
/* ------------------------------------------------------------------ */

const heroSignatures = new Map();
const heroBackgrounds = new Map();
const heroHeadlines = new Map();
const heroDescriptions = new Map();
const heroImageSets = new Map();
const heroCtaLabels = new Map();

for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode}`);
    reset();
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode }));
    const hero = heroOf(utils.container);
    const H = heroText(config.id, 'en');

    await test('hero section is present, ordered and marked with its own layout', () => {
      assert.equal(hero.id, 'section-hero');
      assert.equal(hero.getAttribute('data-site-section'), 'hero');
      assert.equal(hero.getAttribute('data-hero-theme'), config.id);
      assert.equal(hero.getAttribute('data-hero-layout'), config.layout);
    });

    await test('hero shows the salon logo/name lockup', () => {
      const brand = hero.querySelector('[data-testid="hero-brand"]');
      assert.ok(brand, 'hero-brand missing');
      const logo = hero.querySelector('[data-testid="hero-logo"]');
      assert.ok(logo, 'hero-logo missing');
      const name = hero.querySelector('[data-testid="hero-salon-name"]');
      assert.ok(name, 'hero-salon-name missing');
      assert.match(name.textContent, /Phase Eleven Salon/);
      // Without an uploaded logo, the initials mark is used.
      assert.equal(logo.textContent.trim(), heroLogoInitials(data));
    });

    await test('hero has exactly one theme-specific H1 headline', () => {
      const h1s = hero.querySelectorAll('h1');
      assert.equal(h1s.length, 1, `expected 1 hero H1, found ${h1s.length}`);
      const text = h1s[0].textContent.replace(/\s+/g, ' ').trim();
      assert.ok(text.length > 0, 'headline empty');
      assert.ok(text.includes(H.headlineAccent), `headline missing theme accent line: ${text}`);
      assert.equal(hero.querySelector('[data-testid="hero-headline"]'), h1s[0]);
    });

    await test('hero has a short theme description', () => {
      const desc = hero.querySelector('[data-testid="hero-description"]');
      assert.ok(desc, 'hero-description missing');
      const text = desc.textContent.trim();
      assert.ok(text.length > 30, 'description too short');
      assert.ok(text.length < 400, 'hero description should stay short');
      assert.equal(text, H.description);
    });

    await test('primary CTA is Book Appointment and opens the existing booking flow', async () => {
      const cta = hero.querySelector('[data-testid="hero-book-cta"]');
      assert.ok(cta, 'hero-book-cta missing');
      assert.equal(cta.getAttribute('data-open-booking'), 'true');
      assert.equal(cta.textContent.replace(/\s+/g, ' ').trim(), H.primaryCta);
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
      await act(async () => { fireEvent.click(cta); });
      assert.ok(utils.container.querySelector('[data-testid="site-booking-flow"]'), 'booking flow did not open');
      const back = Array.from(utils.container.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
      await act(async () => { fireEvent.click(back); });
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    });

    await test('secondary CTA explores services and reaches the services section', async () => {
      const cta = hero.querySelector('[data-testid="hero-services-cta"]');
      assert.ok(cta, 'hero-services-cta missing');
      assert.equal(cta.textContent.replace(/\s+/g, ' ').trim().replace(/\s*$/, ''), H.secondaryCta);
      assert.notEqual(cta.getAttribute('data-open-booking'), 'true', 'secondary CTA must not be a booking trigger');
      assert.ok(utils.container.querySelector('#section-services'), 'services target section missing');
      let threw = null;
      try {
        await act(async () => { fireEvent.click(cta); });
      } catch (error) { threw = error; }
      assert.equal(threw, null, 'secondary CTA click failed');
    });

    await test('hero renders theme media (image and/or video)', () => {
      const media = hero.querySelector('[data-testid="hero-media"]');
      assert.ok(media, 'hero-media missing');
      const imgs = hero.querySelectorAll('img');
      assert.ok(imgs.length >= 1, 'hero should render at least one image');
      const wrappers = hero.querySelectorAll('[data-context="hero"]');
      assert.ok(wrappers.length >= 1, 'hero images should use the hero image context');
    });

    await test('hero image is eager / above-the-fold optimized', () => {
      const img = hero.querySelector('[data-testid="site-image"]');
      assert.ok(img, 'optimized hero image missing');
      assert.equal(img.getAttribute('loading'), 'eager');
    });

    await test('optional location + live open-status info renders', () => {
      const location = hero.querySelector('[data-testid="hero-location"]');
      assert.ok(location, 'hero-location missing while an address exists');
      assert.equal(location.textContent.trim(), heroLocationLabel(data));
      const status = hero.querySelector('[data-testid="hero-status"]');
      assert.ok(status, 'hero-status missing');
      assert.ok(status.querySelector('[data-testid="site-salon-status"]'), 'live status chip missing');
    });

    await test('hero does not force horizontal overflow', () => {
      assert.ok(hero.className.includes('overflow-hidden'), 'hero should contain its decorations');
      for (const img of hero.querySelectorAll('img')) {
        assert.ok(!/\bw-\[\d{4,}px\]/.test(img.className), 'hero image uses an oversized fixed width');
      }
    });

    await test('Phase 10 chrome above/below the hero is intact', () => {
      assert.ok(utils.getByTestId('site-header'), 'Phase 10.1 header missing');
      const order = collectSiteSectionOrder(utils.container);
      assert.deepEqual(order, [...SITE_SECTION_ORDER], `section order changed: ${order.join(' → ')}`);
    });

    if (mode === 'desktop') {
      heroSignatures.set(config.id, hero.getAttribute('data-hero-layout'));
      heroBackgrounds.set(config.id, hero.getAttribute('style') || '');
      heroHeadlines.set(config.id, hero.querySelector('h1').textContent.replace(/\s+/g, ' ').trim());
      heroDescriptions.set(config.id, hero.querySelector('[data-testid="hero-description"]').textContent.trim());
      heroCtaLabels.set(config.id, [
        hero.querySelector('[data-testid="hero-book-cta"]').textContent.trim(),
        hero.querySelector('[data-testid="hero-services-cta"]').textContent.trim(),
      ].join(' | '));
      heroImageSets.set(config.id, Array.from(hero.querySelectorAll('img')).map((img) => img.getAttribute('src')));
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2. Owner media, rating and video variants                           */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — owner content variants`);
  reset();
  const data = richData(config.id, {
    logoUrl: 'https://example.com/owner-logo.png',
    heroImageUrl: 'https://example.com/owner-hero.jpg',
    tagline: 'Owner written tagline for the hero',
    about: 'Owner written about copy that should appear as the hero description on this theme.',
    socialVideos: [
      { id: 'v1', title: 'Studio reel', platform: 'instagram', url: 'https://example.com/reel', thumbnailUrl: 'https://example.com/t.jpg' },
      { id: 'v2', title: 'Second reel', platform: 'instagram', url: 'https://example.com/reel-2', thumbnailUrl: 'https://example.com/t2.jpg' },
    ],
  });
  const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
  const hero = heroOf(utils.container);

  await test('owner logo replaces the initials mark', () => {
    const logo = hero.querySelector('[data-testid="hero-logo"]');
    assert.equal(logo.tagName, 'IMG');
    assert.equal(logo.getAttribute('src'), 'https://example.com/owner-logo.png');
  });

  await test('owner tagline + about copy drive the hero headline and description', () => {
    assert.match(hero.querySelector('h1').textContent, /Owner written tagline/);
    assert.match(hero.querySelector('[data-testid="hero-description"]').textContent, /Owner written about copy/);
  });

  await test('owner hero image is used as the primary hero visual', () => {
    const srcs = Array.from(hero.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    assert.ok(srcs.includes('https://example.com/owner-hero.jpg'), `owner hero image not used: ${srcs.join(', ')}`);
  });

  await test('hero video surfaces when the owner published a reel', () => {
    const video = hero.querySelector('[data-testid="hero-video"]');
    assert.ok(video, 'hero-video missing');
    assert.ok((video.getAttribute('href') || '').startsWith('https://example.com/reel'));
  });

  await test('hero never repeats the same visual twice', () => {
    const srcs = Array.from(hero.querySelectorAll('img'))
      .map((img) => img.getAttribute('src'))
      .filter((src) => src && !src.includes('owner-logo'));
    assert.equal(new Set(srcs).size, srcs.length, `duplicate hero visuals: ${srcs.join(', ')}`);
  });
}

/* ------------------------------------------------------------------ */
/* 3. Language + dark mode still drive every hero                      */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — language & dark mode`);

  reset();
  {
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));
    const enHeadline = heroOf(utils.container).querySelector('h1').textContent;
    await act(async () => { setSiteLocale('hi'); });
    const hiHero = heroOf(utils.container);
    const hiHeadline = hiHero.querySelector('h1').textContent;

    await test('Hindi repaints the hero headline, description and CTAs', () => {
      const HI = heroText(config.id, 'hi');
      assert.notEqual(enHeadline, hiHeadline, 'hero headline did not switch to Hindi');
      assert.ok(hiHeadline.includes(HI.headlineAccent));
      assert.equal(hiHero.querySelector('[data-testid="hero-description"]').textContent.trim(), HI.description);
      assert.equal(hiHero.querySelector('[data-testid="hero-book-cta"]').textContent.replace(/\s+/g, ' ').trim(), HI.primaryCta);
    });
    setSiteLocale('en');
  }

  reset();
  {
    // The barber theme is dark by design; every other theme defaults to light.
    const themeDefault = config.id === 'barber_mens_grooming' ? 'dark' : 'light';
    const opposite = themeDefault === 'dark' ? 'light' : 'dark';
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));
    const defaultStyle = heroOf(utils.container).getAttribute('style');
    await act(async () => { setSiteAppearance(opposite); });
    const flippedStyle = heroOf(utils.container).getAttribute('style');
    await test(`appearance toggle repaints the hero surface (${themeDefault} ↔ ${opposite})`, async () => {
      assert.notEqual(defaultStyle, flippedStyle, 'hero surface unchanged when the appearance flipped');
      await act(async () => { setSiteAppearance(themeDefault); });
      assert.equal(heroOf(utils.container).getAttribute('style'), defaultStyle);
    });
    setSiteAppearance(undefined);
  }
}

/* ------------------------------------------------------------------ */
/* 4. Cross-theme uniqueness — no hero copied into another theme       */
/* ------------------------------------------------------------------ */

section('Cross-theme hero uniqueness');

await test('all five heroes declare a different layout signature', () => {
  const values = [...heroSignatures.values()];
  assert.equal(values.length, CASES.length);
  assert.equal(new Set(values).size, CASES.length, `layouts not distinct: ${values.join(', ')}`);
});

await test('all five hero background surfaces differ pairwise', () => {
  const values = [...heroBackgrounds.values()];
  assert.equal(new Set(values).size, CASES.length, `hero surfaces not distinct: ${values.join(' || ')}`);
});

await test('all five hero headlines differ pairwise', () => {
  const values = [...heroHeadlines.values()];
  assert.equal(new Set(values).size, CASES.length, `headlines not distinct: ${values.join(' || ')}`);
});

await test('all five hero descriptions differ pairwise', () => {
  const values = [...heroDescriptions.values()];
  assert.equal(new Set(values).size, CASES.length, `descriptions not distinct: ${values.join(' || ')}`);
});

await test('all five hero CTA label pairs differ pairwise', () => {
  const values = [...heroCtaLabels.values()];
  assert.equal(new Set(values).size, CASES.length, `CTA labels not distinct: ${values.join(' || ')}`);
});

await test('no hero image is shared between any two themes', () => {
  const seen = new Map();
  for (const [themeId, srcs] of heroImageSets) {
    for (const src of srcs) {
      if (!src) continue;
      const owner = seen.get(src);
      assert.ok(!owner || owner === themeId, `image ${src} is used by both ${owner} and ${themeId}`);
      seen.set(src, themeId);
    }
  }
  assert.ok(seen.size >= CASES.length, 'expected at least one distinct hero image per theme');
});

await test('theme hero fallback media sets are disjoint at the source level', () => {
  const seen = new Map();
  for (const config of CASES) {
    const media = heroMedia(config.id, richData(config.id));
    for (const visual of [media.primary, ...media.support]) {
      const owner = seen.get(visual.url);
      assert.ok(!owner || owner === config.id, `${visual.url} shared by ${owner} and ${config.id}`);
      seen.set(visual.url, config.id);
    }
  }
});

await test('hero copy tables are namespaced per theme in both locales', () => {
  for (const locale of ['en', 'hi']) {
    const headlines = CASES.map((c) => HERO_TEXT_TABLE[c.id][locale].headlineAccent);
    assert.equal(new Set(headlines).size, CASES.length, `${locale} accents not distinct`);
    const eyebrows = CASES.map((c) => HERO_TEXT_TABLE[c.id][locale].eyebrow);
    assert.equal(new Set(eyebrows).size, CASES.length, `${locale} eyebrows not distinct`);
    const media = CASES.map((c) => HERO_TEXT_TABLE[c.id][locale].mediaTitle);
    assert.equal(new Set(media).size, CASES.length, `${locale} media titles not distinct`);
  }
});

/* ------------------------------------------------------------------ */
/* 5. Rating information when reviews exist                            */
/* ------------------------------------------------------------------ */

section('Optional rating information');

const { insertReviewForTests, setReviewStoreForTests, reviewBusinessId } = await import('../src/lib/siteReviews.ts');

for (const config of CASES) {
  reset();
  setReviewStoreForTests(null);
  const data = richData(config.id);
  insertReviewForTests({
    businessId: reviewBusinessId(data),
    themeId: config.id,
    customerName: 'Meera S',
    body: 'Absolutely loved the whole experience here.',
    rating: 5,
    status: 'approved',
  });
  const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
  const hero = heroOf(utils.container);
  await test(`${config.id}: hero shows the review rating when one exists`, () => {
    const rating = hero.querySelector('[data-testid="hero-rating"]');
    assert.ok(rating, 'hero-rating missing while an approved review exists');
    assert.match(rating.textContent, /5\.0/);
  });
  setReviewStoreForTests(null);
}

reset();
setReviewStoreForTests(null);
{
  const utils = render(React.createElement(Barber, { data: richData('barber_mens_grooming'), mode: 'desktop' }));
  await test('hero rating is hidden when the salon has no approved reviews', () => {
    assert.equal(heroOf(utils.container).querySelector('[data-testid="hero-rating"]'), null);
  });
}

reset();
{
  const utils = render(React.createElement(Barber, { data: richData('barber_mens_grooming', { address: undefined }), mode: 'mobile' }));
  await test('hero location is hidden when the owner set no address', () => {
    assert.equal(heroOf(utils.container).querySelector('[data-testid="hero-location"]'), null);
  });
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 11.1 unique hero design: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes verified: distinct hero layout, imagery and copy across desktop, tablet and mobile.');
// Salon-status/live-clock intervals keep the jsdom loop alive; unmount and exit.
cleanup();
process.exit(0);
