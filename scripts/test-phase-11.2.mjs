/**
 * PHASE 11.2 — HERO HEADLINE & CONTENT (five-theme content validation)
 *
 * Phase 11.1 owns the hero LAYOUTS and is regression-checked separately.
 * This suite validates the hero CONTENT only:
 *
 *   1. Each theme renders its exact mandated headline.
 *   2. Each theme has a unique short description.
 *   3. Each theme has theme-specific CTA text (primary + secondary).
 *   4. Supporting labels/badges name the theme's real service focus
 *      (Barber: Haircuts/Beard/Shave/Grooming, Hair: Haircuts/Colour/
 *      Balayage/Treatments, Spa: Facial/Skin/Spa/Wellness/Makeup,
 *      Family: Men/Women/Kids/Haircare/Combos, Nail: Nail Art/Gel/Lash/
 *      Brow/Mani-Pedi) and each theme states its target audience.
 *   5. NO hero text is shared between any two themes, in EN or HI.
 *   6. Hindi flows through the EXISTING Phase 10.2 language system.
 *   7. Content stays editable from the existing data system (owner tagline /
 *      about / services still drive the hero).
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
const { render, cleanup, act } = await import('@testing-library/react');

const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { heroText, HERO_TEXT_TABLE } = await import('../src/lib/siteHeroI18n.ts');
const { heroFocusBadges } = await import('../src/lib/siteHero.ts');
const { SUPPORTED_LOCALES } = await import('../src/lib/locale.ts');

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
    logoUrl: '',
    heroImageUrl: '',
    gallery: [],
    socialVideos: [],
    services: [],
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

/** The exact headlines mandated by the Phase 11.2 brief. */
const MANDATED_HEADLINES = {
  barber_mens_grooming: 'Sharp Cuts. Classic Grooming. Modern Confidence.',
  hair_studio_color_bar: 'Luxury Hair. Signature Style. Beautifully You.',
  beauty_skin_spa: 'Relax. Refresh. Reveal Your Natural Glow.',
  family_full_service: 'Beauty & Grooming for the Whole Family.',
  nail_lash_studio: 'Nails, Lashes & Beauty Made to Stand Out.',
};

/** The service focus each theme must advertise — and must NOT advertise. */
const FOCUS_EXPECTATIONS = {
  barber_mens_grooming: {
    required: ['haircut', 'beard', 'shave', 'grooming'],
    forbidden: ['balayage', 'facial', 'lash', 'nail art', 'kids'],
  },
  hair_studio_color_bar: {
    required: ['cut', 'colour', 'balayage', 'treatment'],
    forbidden: ['beard', 'shave', 'facial', 'lash', 'nail art'],
  },
  beauty_skin_spa: {
    required: ['facial', 'skin', 'spa', 'wellness', 'makeup'],
    forbidden: ['beard', 'balayage', 'nail art', 'combos'],
  },
  family_full_service: {
    required: ['men', 'women', 'kids', 'haircare', 'combos'],
    forbidden: ['balayage', 'lash', 'nail art', 'shave', 'facial'],
  },
  nail_lash_studio: {
    required: ['nail art', 'gel', 'lash', 'brow', 'mani'],
    forbidden: ['beard', 'shave', 'balayage', 'kids'],
  },
};

const CASES = [
  { id: 'barber_mens_grooming', label: "Barber & Men's Grooming", Component: Barber },
  { id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar', Component: HairStudio },
  { id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa', Component: BeautySpa },
  { id: 'family_full_service', label: 'Full-Service Family Salon', Component: Family },
  { id: 'nail_lash_studio', label: 'Nail & Lash Studio', Component: NailLash },
];

function reset(locale = 'en') {
  cleanup();
  window.localStorage.clear();
  setSiteLocale(locale);
  setSiteAppearance(undefined);
  document.head.innerHTML = '';
}

function heroOf(container) {
  const hero = container.querySelector('[data-testid="site-hero"]');
  assert.ok(hero, 'hero section missing');
  return hero;
}
const flat = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ */
/* 1. Mandated headline + unique content, per theme, in EN and HI      */
/* ------------------------------------------------------------------ */

const seen = { en: new Map(), hi: new Map() };

for (const config of CASES) {
  for (const locale of ['en', 'hi']) {
    section(`${config.label} — ${locale.toUpperCase()} hero content`);
    reset(locale);
    const data = baseData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const hero = heroOf(utils.container);
    const H = heroText(config.id, locale);

    if (locale === 'en') {
      await test('renders the exact mandated headline', () => {
        const rendered = flat(hero.querySelector('[data-testid="hero-headline"]'));
        assert.equal(rendered, MANDATED_HEADLINES[config.id]);
      });
    } else {
      await test('renders a fully Hindi headline (Devanagari, not English)', () => {
        const rendered = flat(hero.querySelector('[data-testid="hero-headline"]'));
        assert.notEqual(rendered, MANDATED_HEADLINES[config.id], 'Hindi headline still shows English');
        assert.match(rendered, /[\u0900-\u097F]/, 'Hindi headline has no Devanagari characters');
        assert.equal(rendered, `${H.headline} ${H.headlineAccent}`.replace(/\s+/g, ' ').trim());
      });
    }

    await test('renders a unique short description', () => {
      const rendered = flat(hero.querySelector('[data-testid="hero-description"]'));
      assert.equal(rendered, H.description);
      assert.ok(rendered.length > 40, 'description too short to be useful');
      assert.ok(rendered.length < 400, 'hero description must stay short');
      if (locale === 'hi') assert.match(rendered, /[\u0900-\u097F]/, 'Hindi description not translated');
    });

    await test('renders theme-specific primary + secondary CTA text', () => {
      const primary = flat(hero.querySelector('[data-testid="hero-book-cta"]'));
      const secondary = flat(hero.querySelector('[data-testid="hero-services-cta"]'));
      assert.equal(primary, H.primaryCta);
      assert.equal(secondary, H.secondaryCta);
      assert.notEqual(primary, secondary);
      if (locale === 'hi') {
        assert.match(primary, /[\u0900-\u097F]/, 'Hindi primary CTA not translated');
        assert.match(secondary, /[\u0900-\u097F]/, 'Hindi secondary CTA not translated');
      }
    });

    await test('renders supporting focus badges with a label', () => {
      const focusBlock = hero.querySelector('[data-testid="hero-focus"]');
      assert.ok(focusBlock, 'hero-focus block missing');
      assert.ok(flat(focusBlock).includes(H.focusLabel), 'focus label missing');
      const items = Array.from(focusBlock.querySelectorAll('[data-hero-focus-item]'))
        .map((el) => el.getAttribute('data-hero-focus-item'));
      assert.deepEqual(items, [...H.focus], `focus badges mismatch: ${items.join(', ')}`);
      assert.ok(items.length >= 4, 'each theme should advertise at least 4 focus areas');
    });

    await test('states the target audience', () => {
      const audience = hero.querySelector('[data-testid="hero-audience"]');
      assert.ok(audience, 'hero-audience missing');
      assert.equal(flat(audience), H.audience);
      if (locale === 'hi') assert.match(flat(audience), /[\u0900-\u097F]/, 'Hindi audience not translated');
    });

    if (locale === 'en') {
      await test('focus badges match this theme and no other theme', () => {
        const badges = H.focus.join(' | ').toLowerCase();
        const rules = FOCUS_EXPECTATIONS[config.id];
        for (const required of rules.required) {
          assert.ok(badges.includes(required), `missing required focus "${required}" in: ${badges}`);
        }
        for (const forbidden of rules.forbidden) {
          assert.ok(!badges.includes(forbidden), `focus wrongly advertises "${forbidden}": ${badges}`);
        }
      });

      await test('hero copy stays inside this theme (no other theme’s speciality leaks)', () => {
        const blob = [H.headline, H.headlineAccent, H.description, H.primaryCta, H.secondaryCta, H.eyebrow, H.audience]
          .join(' ')
          .toLowerCase();
        for (const forbidden of FOCUS_EXPECTATIONS[config.id].forbidden) {
          assert.ok(!blob.includes(forbidden), `hero copy leaks "${forbidden}"`);
        }
      });
    }

    seen[locale].set(config.id, {
      headline: flat(hero.querySelector('[data-testid="hero-headline"]')),
      description: flat(hero.querySelector('[data-testid="hero-description"]')),
      primary: flat(hero.querySelector('[data-testid="hero-book-cta"]')),
      secondary: flat(hero.querySelector('[data-testid="hero-services-cta"]')),
      eyebrow: H.eyebrow,
      audience: H.audience,
      focus: H.focus.join(' | '),
    });
  }
}

/* ------------------------------------------------------------------ */
/* 2. Live language switching through the EXISTING 10.2 system         */
/* ------------------------------------------------------------------ */

for (const config of CASES) {
  section(`${config.label} — live EN ↔ HI switching`);
  reset('en');
  const utils = render(React.createElement(config.Component, { data: baseData(config.id), mode: 'desktop' }));

  const before = {
    headline: flat(heroOf(utils.container).querySelector('[data-testid="hero-headline"]')),
    focus: flat(heroOf(utils.container).querySelector('[data-testid="hero-focus"]')),
  };

  await act(async () => { setSiteLocale('hi'); });
  const hiHero = heroOf(utils.container);
  const HI = heroText(config.id, 'hi');

  await test('header language control repaints every hero content block', () => {
    assert.notEqual(flat(hiHero.querySelector('[data-testid="hero-headline"]')), before.headline);
    assert.equal(flat(hiHero.querySelector('[data-testid="hero-description"]')), HI.description);
    assert.equal(flat(hiHero.querySelector('[data-testid="hero-book-cta"]')), HI.primaryCta);
    assert.equal(flat(hiHero.querySelector('[data-testid="hero-services-cta"]')), HI.secondaryCta);
    assert.equal(flat(hiHero.querySelector('[data-testid="hero-audience"]')), HI.audience);
  });

  await test('focus badges translate to Hindi', () => {
    const items = Array.from(hiHero.querySelectorAll('[data-hero-focus-item]'))
      .map((el) => el.getAttribute('data-hero-focus-item'));
    assert.deepEqual(items, [...HI.focus]);
    assert.match(items.join(' '), /[\u0900-\u097F]/, 'Hindi focus badges not translated');
    assert.notEqual(flat(hiHero.querySelector('[data-testid="hero-focus"]')), before.focus);
  });

  await act(async () => { setSiteLocale('en'); });
  await test('switching back to English restores the mandated headline', () => {
    assert.equal(flat(heroOf(utils.container).querySelector('[data-testid="hero-headline"]')), MANDATED_HEADLINES[config.id]);
  });
}

/* ------------------------------------------------------------------ */
/* 3. Cross-theme uniqueness of every content field                    */
/* ------------------------------------------------------------------ */

for (const locale of ['en', 'hi']) {
  section(`Cross-theme content uniqueness — ${locale.toUpperCase()}`);
  const rows = [...seen[locale].values()];
  for (const field of ['headline', 'description', 'primary', 'secondary', 'eyebrow', 'audience', 'focus']) {
    await test(`${field}: all five themes differ pairwise`, () => {
      const values = rows.map((row) => row[field]);
      assert.equal(values.length, CASES.length);
      assert.equal(new Set(values).size, CASES.length, `${field} not distinct: ${values.join(' || ')}`);
    });
  }

  await test('no theme shares a focus badge with another theme', () => {
    const owner = new Map();
    for (const config of CASES) {
      for (const badge of HERO_TEXT_TABLE[config.id][locale].focus) {
        const key = badge.toLowerCase();
        const previous = owner.get(key);
        assert.ok(!previous || previous === config.id, `focus "${badge}" shared by ${previous} and ${config.id}`);
        owner.set(key, config.id);
      }
    }
  });

  await test('CTA text is never generic "Book Now" boilerplate across themes', () => {
    const primaries = CASES.map((c) => HERO_TEXT_TABLE[c.id][locale].primaryCta.toLowerCase());
    assert.equal(new Set(primaries).size, CASES.length, 'primary CTA labels repeat');
    const secondaries = CASES.map((c) => HERO_TEXT_TABLE[c.id][locale].secondaryCta.toLowerCase());
    assert.equal(new Set(secondaries).size, CASES.length, 'secondary CTA labels repeat');
  });
}

/* ------------------------------------------------------------------ */
/* 4. Copy-table completeness in every supported locale                */
/* ------------------------------------------------------------------ */

section('Hero copy table completeness');

const CONTENT_KEYS = [
  'eyebrow', 'headline', 'headlineAccent', 'description', 'primaryCta', 'secondaryCta',
  'chip1', 'chip2', 'focusLabel', 'audience', 'mediaEyebrow', 'mediaTitle', 'mediaBody',
  'mediaAlt', 'mediaAltB', 'mediaAltC',
  // PHASE 11.5 — the hero stat VALUE is derived from real salon data via
  // heroStat(); only the wording lives in the copy table.
  'statServicesLabel', 'statTeamLabel',
];

for (const config of CASES) {
  await test(`${config.id}: every content key exists in each supported locale`, () => {
    for (const locale of SUPPORTED_LOCALES) {
      const copy = HERO_TEXT_TABLE[config.id][locale];
      assert.ok(copy, `missing ${locale} table`);
      for (const key of CONTENT_KEYS) {
        assert.equal(typeof copy[key], 'string', `${locale}.${key} is not a string`);
        assert.ok(copy[key].trim().length > 0, `${locale}.${key} is empty`);
      }
      assert.ok(Array.isArray(copy.focus) && copy.focus.length >= 4, `${locale}.focus too small`);
    }
  });

  await test(`${config.id}: Hindi table is genuinely translated, not English copy`, () => {
    const en = HERO_TEXT_TABLE[config.id].en;
    const hi = HERO_TEXT_TABLE[config.id].hi;
    for (const key of ['headline', 'headlineAccent', 'description', 'primaryCta', 'secondaryCta', 'focusLabel', 'audience']) {
      assert.notEqual(hi[key], en[key], `${key} not translated`);
      assert.match(hi[key], /[\u0900-\u097F]/, `${key} has no Devanagari`);
    }
    assert.equal(hi.focus.length, en.focus.length, 'focus list length differs between locales');
  });
}

/* ------------------------------------------------------------------ */
/* 5. Content remains editable from the existing data system           */
/* ------------------------------------------------------------------ */

section('Editable from the existing configuration/data system');

for (const config of CASES) {
  reset('en');
  const data = baseData(config.id, {
    tagline: 'Owner edited headline for this salon',
    about: 'Owner edited hero description coming from the existing salon data system.',
  });
  const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
  const hero = heroOf(utils.container);

  await test(`${config.id}: owner tagline + about override the theme hero copy`, () => {
    assert.match(flat(hero.querySelector('[data-testid="hero-headline"]')), /Owner edited headline/);
    assert.match(flat(hero.querySelector('[data-testid="hero-description"]')), /Owner edited hero description/);
  });

  await test(`${config.id}: theme accent line still identifies the theme`, () => {
    const H = heroText(config.id, 'en');
    assert.ok(flat(hero.querySelector('[data-testid="hero-headline"]')).includes(H.headlineAccent));
  });
}

for (const config of CASES) {
  const H = heroText(config.id, 'en');
  await test(`${config.id}: focus badges narrow to the owner's real catalog when it is specific`, () => {
    const target = H.focus[0];
    const narrowed = heroFocusBadges(
      baseData(config.id, {
        services: [
          { id: 's1', name: `${target} Signature`, category: target, price: 500, duration: 30, status: 'active', description: '' },
          { id: 's2', name: `${target} Express`, category: target, price: 300, duration: 20, status: 'active', description: '' },
        ],
      }),
      H.focus,
      1,
    );
    assert.deepEqual(narrowed, [target], `expected only "${target}", got ${narrowed.join(', ')}`);
  });

  await test(`${config.id}: full theme focus is shown when the owner has no services yet`, () => {
    assert.deepEqual(heroFocusBadges(baseData(config.id), H.focus), [...H.focus]);
  });

  await test(`${config.id}: archived/inactive services never drive the focus badges`, () => {
    const badges = heroFocusBadges(
      baseData(config.id, {
        services: [
          { id: 's1', name: `${H.focus[0]} Retired`, category: H.focus[0], price: 500, duration: 30, status: 'archived', description: '' },
          { id: 's2', name: `${H.focus[0]} Paused`, category: H.focus[0], price: 500, duration: 30, status: 'inactive', description: '' },
        ],
      }),
      H.focus,
    );
    assert.deepEqual(badges, [...H.focus], 'inactive catalog should not narrow the badges');
  });
}

/* ------------------------------------------------------------------ */
/* 6. Phase 11.1 layout + Phase 10 chrome untouched                    */
/* ------------------------------------------------------------------ */

section('Phase 11.1 layouts and Phase 10 chrome are untouched');

const LAYOUTS = {
  barber_mens_grooming: 'cinematic-slab',
  hair_studio_color_bar: 'editorial-gallery',
  beauty_skin_spa: 'soft-arch',
  family_full_service: 'action-card-collage',
  nail_lash_studio: 'glam-card-shelf',
};

for (const config of CASES) {
  for (const mode of ['desktop', 'mobile']) {
    reset('en');
    const utils = render(React.createElement(config.Component, { data: baseData(config.id), mode }));
    const hero = heroOf(utils.container);
    await test(`${config.id} ${mode}: Phase 11.1 layout signature and header intact`, () => {
      assert.equal(hero.getAttribute('data-hero-layout'), LAYOUTS[config.id]);
      assert.equal(hero.getAttribute('data-hero-theme'), config.id);
      assert.equal(hero.id, 'section-hero');
      assert.ok(utils.getByTestId('site-header'), 'Phase 10.1 header missing');
      assert.equal(hero.querySelectorAll('h1').length, 1, 'hero must keep exactly one H1');
    });
  }
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 11.2 hero headline & content: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure.name}: ${failure.error.message}`);
  process.exit(1);
}
console.log('All five themes verified in English and हिन्दी: mandated headlines, unique descriptions, theme CTAs, focus badges and audience.');
cleanup();
process.exit(0);
