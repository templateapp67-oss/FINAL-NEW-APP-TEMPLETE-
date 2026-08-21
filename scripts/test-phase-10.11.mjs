/**
 * PHASE 10.11 — DYNAMIC SEO & SOCIAL METADATA
 * Verifies per-theme SEO, language SEO, OG, technical SEO
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
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
const { generateSeoMeta, buildCanonicalUrl, buildOgImage, verifyHeadingHierarchy, findDuplicateSeo, buildSitemapEntry } = await import('../src/lib/siteSeo.ts');
const { siteText } = await import('../src/lib/siteI18n.ts');

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
    salonName: `Test ${templateId} Salon`,
    tagline: `Premium ${templateId} experience in Jaipur`,
    about: `Welcome to Test ${templateId} Salon, a professional salon offering top services in Jaipur. Located at 21 Test Street.`,
    ownerName: 'Asha Verma',
    email: `hello@${templateId}.test`,
    phone: '+91 99999 00000',
    whatsappPhone: '+91 99999 00000',
    contactOptions: { callNow: true, whatsapp: true, bookNow: true },
    services: [
      { id: 'svc-1', name: `${templateId} Signature Cut`, category: 'Haircuts', description: 'Cut and finish.', price: 499, duration: 45, status: 'active', businessId: `biz-${templateId}` },
      { id: 'svc-2', name: `${templateId} Deluxe Treatment`, category: 'Treatment', description: 'Luxury treatment.', price: 999, duration: 60, status: 'active', businessId: `biz-${templateId}` },
    ],
    packages: [
      { id: 'pkg-1', name: `${templateId} Combo`, description: 'Bundle.', price: 1199, duration: 90, status: 'active' },
    ],
    team: [{ id: 'tm-1', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: ['Color'], imageUrl: 'https://example.com/r.jpg', bio: 'Craft.', status: 'Available' }],
    gallery: [
      { id: 'gal-1', url: `https://example.com/${templateId}-hero.jpg`, alt: 'Hero', category: 'General' },
      { id: 'gal-2', url: `https://example.com/${templateId}-2.jpg`, alt: 'Work', category: 'General' },
    ],
    heroImageUrl: `https://example.com/${templateId}-hero.jpg`,
    logoUrl: `https://example.com/${templateId}-logo.png`,
    websiteSlug: `test-${templateId.replace(/_/g, '-')}-jaipur`,
    address: { fullAddress: '21 Test Street, Jaipur, Rajasthan 302001', area: 'Test', city: 'Jaipur', state: 'Rajasthan', pinCode: '302001', latitude: 26.9124, longitude: 75.7873 },
    openingHours: {
      monday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      sunday: { open: false, startTime: '10:00 AM', endTime: '04:00 PM' },
    },
    socialProfiles: { instagram: 'https://instagram.com/testsalon' },
    ...extras,
  };
}

const CASES = [
  { id: 'barber_mens_grooming', label: "Barber & Men's Grooming", Component: Barber, verticalEn: "Men's Haircut", verticalHi: 'पुरुषों की हेयरकट' },
  { id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar', Component: HairStudio, verticalEn: 'Hair Color', verticalHi: 'हेयर कलर' },
  { id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa', Component: BeautySpa, verticalEn: 'Facial', verticalHi: 'फेशियल' },
  { id: 'family_full_service', label: 'Full-Service Family Salon', Component: Family, verticalEn: 'Family Salon', verticalHi: 'फैमिली सैलून' },
  { id: 'nail_lash_studio', label: 'Nail & Lash Studio', Component: NailLash, verticalEn: 'Nails', verticalHi: 'नेल्स' },
];

// Helper to get SEO testids
function seoFromContainer(container) {
  const el = container.querySelector('[data-testid="site-seo"]');
  if (!el) return null;
  return {
    title: el.getAttribute('data-title'),
    description: el.getAttribute('data-description'),
    keywords: el.getAttribute('data-keywords'),
    canonical: el.getAttribute('data-canonical'),
    robots: el.getAttribute('data-robots'),
    ogTitle: el.getAttribute('data-og-title'),
    ogDescription: el.getAttribute('data-og-description'),
    ogImage: el.getAttribute('data-og-image'),
    ogSiteName: el.getAttribute('data-og-site-name'),
    ogUrl: el.getAttribute('data-og-url'),
    ogLocale: el.getAttribute('data-og-locale'),
    theme: el.getAttribute('data-theme'),
    locale: el.getAttribute('data-locale'),
    vertical: el.getAttribute('data-vertical'),
    city: el.getAttribute('data-city'),
    salonName: el.getAttribute('data-salon-name'),
    el,
  };
}

for (const config of CASES) {
  section(`${config.label} — dynamic SEO`);

  cleanup();
  window.localStorage.clear();
  setSiteLocale('en');
  setSiteAppearance(undefined);
  document.head.innerHTML = '';
  {
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    await test(`${config.id} EN: SEO component exists`, () => {
      const seo = seoFromContainer(utils.container);
      assert.ok(seo, 'site-seo div missing');
      assert.equal(seo.theme, config.id);
      assert.equal(seo.locale, 'en');
    });

    await test(`${config.id} EN: title is theme-specific and uses real salon data`, () => {
      const seo = seoFromContainer(utils.container);
      assert.ok(seo.title.includes(data.salonName), `title should include real salonName: ${seo.title}`);
      assert.ok(seo.title.toLowerCase().includes(config.verticalEn.toLowerCase().split(' ')[0].toLowerCase()) || seo.title.toLowerCase().includes(config.id.split('_')[0]), `title should include theme vertical: ${seo.title}`);
      // No fake placeholder like "Your Salon" when real name exists
      assert.ok(!seo.title.includes('Your Salon'), 'should not use fake placeholder');
    });

    await test(`${config.id} EN: meta description is theme-specific and uses real data`, () => {
      const seo = seoFromContainer(utils.container);
      assert.ok(seo.description.length >= 40, `description too short: ${seo.description}`);
      assert.ok(seo.description.length <= 250, `description too long: ${seo.description.length}`);
      assert.ok(seo.description.includes(data.salonName) || seo.description.toLowerCase().includes('professional'), 'description should include salon context');
      // Theme-specific focus should appear
      if (config.id === 'barber_mens_grooming') assert.ok(/fade|beard|groom/i.test(seo.description), `barber description should include barber terms: ${seo.description}`);
      if (config.id === 'hair_studio_color_bar') assert.ok(/balayage|color|cut/i.test(seo.description), `hair studio description should include color terms`);
      if (config.id === 'beauty_skin_spa') assert.ok(/facial|spa|skin/i.test(seo.description), `spa description should include facial/spa`);
      if (config.id === 'family_full_service') assert.ok(/family|unisex|kids/i.test(seo.description), `family description should include family terms`);
      if (config.id === 'nail_lash_studio') assert.ok(/nail|lash|brow/i.test(seo.description), `nail/lash description should include nail/lash`);
    });

    await test(`${config.id} EN: keywords are theme-specific, unique, use real service names`, () => {
      const seo = seoFromContainer(utils.container);
      assert.ok(seo.keywords.includes('jaipur') || seo.keywords.includes('test'), 'keywords should include city or salon context from real data');
      assert.ok(seo.keywords.toLowerCase().includes(config.id.split('_')[0]) || seo.keywords.includes(config.verticalEn.toLowerCase().split(' ')[0]), 'keywords should include theme vertical');
      // Check real service name appears
      assert.ok(seo.keywords.toLowerCase().includes('signature') || seo.keywords.toLowerCase().includes(config.id), 'keywords should include actual service names from data, not fake');
      // Ensure theme-specific distinctness: barber keywords should not be same as nail
    });

    await test(`${config.id} EN: OG tags use active salon/theme content`, () => {
      const seo = seoFromContainer(utils.container);
      assert.equal(seo.ogTitle, seo.title, 'OG title should match page title');
      assert.equal(seo.ogDescription, seo.description, 'OG description should match meta description');
      assert.ok(seo.ogSiteName.includes('Test'), `OG site name should be real salonName: ${seo.ogSiteName}`);
      assert.ok(seo.ogUrl.startsWith('https://'), `OG url should be canonical https: ${seo.ogUrl}`);
      assert.ok(seo.ogImage && seo.ogImage.includes(config.id), `OG image should be actual salon image containing theme id: ${seo.ogImage}`);
      assert.equal(seo.ogLocale, 'en_US');
    });

    await test(`${config.id} EN: canonical + robots + technical SEO`, () => {
      const seo = seoFromContainer(utils.container);
      assert.ok(seo.canonical.startsWith('https://'), `canonical should be absolute https: ${seo.canonical}`);
      assert.ok(seo.canonical.includes('test-'), `canonical should use real slug from data: ${seo.canonical}`);
      assert.equal(seo.robots, 'index, follow');
      // Check <link rel="canonical"> was injected into head
      const link = document.head.querySelector('link[rel="canonical"]');
      assert.ok(link, 'canonical link tag should exist in head');
      assert.equal(link.getAttribute('href'), seo.canonical);
      // Check meta description in head
      const metaDesc = document.head.querySelector('meta[name="description"]');
      assert.ok(metaDesc, 'meta description in head missing');
      assert.equal(metaDesc.getAttribute('content'), seo.description);
      // Check OG meta in head
      const ogTitle = document.head.querySelector('meta[property="og:title"]');
      assert.ok(ogTitle, 'og:title in head missing');
    });

    await test(`${config.id} EN: heading hierarchy valid (single H1)`, () => {
      const h1s = utils.container.querySelectorAll('h1');
      assert.equal(h1s.length, 1, `should have exactly 1 H1, found ${h1s.length}`);
      const h1Text = h1s[0]?.textContent?.trim();
      assert.ok(h1Text && h1Text.length > 0, 'H1 should have text');
      // H1 should be from real data (tagline)
      assert.ok(h1Text.includes('Premium') || h1Text.includes('Sharp') || h1Text.includes('Your glow') || h1Text.includes('One salon') || h1Text.includes('Restore') || h1Text.includes(richData(config.id).tagline.split(' ')[0]), 'H1 should be from real salon data/tagline');
    });

    cleanup();
    document.head.innerHTML = '';
  }

  // Language SEO: HI
  section(`${config.label} — भाषा SEO (HI)`);
  {
    cleanup();
    window.localStorage.clear();
    setSiteLocale('hi');
    setSiteAppearance(undefined);
    document.head.innerHTML = '';
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'mobile' }));

    await test(`${config.id} HI: localized title + description`, () => {
      const seo = seoFromContainer(utils.container);
      assert.equal(seo.locale, 'hi');
      assert.ok(seo.title.includes(data.salonName), 'HI title should still include real salonName');
      // Should contain Hindi chars or Hindi vertical
      const hasHindi = /[\u0900-\u097F]/.test(seo.title + seo.description);
      assert.ok(hasHindi, `HI SEO should contain Devanagari: title=${seo.title} desc=${seo.description}`);
      assert.ok(seo.description.includes(config.verticalHi.split(' ')[0]) || /[\u0900-\u097F]/.test(seo.description), 'HI description should be localized');
      assert.equal(seo.ogLocale, 'hi_IN');
      // Document title should be HI
      assert.equal(document.title, seo.title);
    });

    cleanup();
    document.head.innerHTML = '';
  }

  // Light/Dark does not break SEO
  section(`${config.label} — Light/Dark does not break SEO`);
  for (const appearance of ['light', 'dark']) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale('en');
    setSiteAppearance(appearance);
    document.head.innerHTML = '';
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    await test(`${config.id} ${appearance}: SEO still valid`, () => {
      const seo = seoFromContainer(utils.container);
      assert.ok(seo.title && seo.description && seo.canonical, `SEO missing in ${appearance} mode`);
      assert.equal(seo.robots, 'index, follow');
      // Appearance should not affect title (only surfaces)
      assert.ok(seo.title.includes(data.salonName));
    });

    cleanup();
    document.head.innerHTML = '';
  }

  // Desktop/Mobile both have SEO
  section(`${config.label} — Desktop/Mobile SEO parity`);
  for (const mode of ['desktop', 'mobile']) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale('en');
    setSiteAppearance(undefined);
    document.head.innerHTML = '';
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode }));

    await test(`${config.id} ${mode}: SEO present`, () => {
      const seo = seoFromContainer(utils.container);
      assert.ok(seo, `SEO missing in ${mode}`);
      assert.ok(seo.canonical.startsWith('https://'));
    });

    cleanup();
    document.head.innerHTML = '';
  }
}

// Cross-theme: no duplicate metadata
section('Cross-theme — no duplicate metadata + sitemap compatibility');
{
  const seoList = [];
  for (const config of CASES) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale('en');
    setSiteAppearance(undefined);
    document.head.innerHTML = '';
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const seo = seoFromContainer(utils.container);
    seoList.push({ themeId: config.id, ...seo, raw: generateSeoMeta(data, config.id, 'en') });
    cleanup();
  }

  await test('titles are pairwise distinct across 5 themes', () => {
    const titles = seoList.map((s) => s.title);
    const unique = new Set(titles);
    assert.equal(unique.size, 5, `expected 5 unique titles, got ${unique.size}: ${JSON.stringify(titles)}`);
  });

  await test('descriptions are pairwise distinct across 5 themes', () => {
    const descs = seoList.map((s) => s.description);
    const unique = new Set(descs);
    assert.equal(unique.size, 5, `expected 5 unique descriptions, got ${unique.size}`);
  });

  await test('keywords are theme-specific (pairwise distinct)', () => {
    const kws = seoList.map((s) => s.keywords);
    const unique = new Set(kws);
    assert.equal(unique.size, 5, `expected 5 unique keyword sets, got ${unique.size}: ${JSON.stringify(kws)}`);
  });

  await test('findDuplicateSeo reports unique', () => {
    const metas = seoList.map((s) => s.raw);
    const { isUnique, duplicates } = findDuplicateSeo(metas);
    assert.equal(isUnique, true, `should have no duplicate SEO, found: ${JSON.stringify(duplicates)}`);
  });

  await test('canonical URLs are absolute https and use real slug', () => {
    for (const seo of seoList) {
      assert.ok(seo.canonical.startsWith('https://'), `canonical not https: ${seo.canonical}`);
      assert.ok(seo.canonical.includes('test-'), `canonical should use real slug: ${seo.canonical}`);
    }
  });

  await test('sitemap entries are compatible', () => {
    for (const config of CASES) {
      const data = richData(config.id);
      const entry = buildSitemapEntry(data, config.id, 'en');
      assert.ok(entry.loc.startsWith('https://'), `sitemap loc not https: ${entry.loc}`);
      assert.ok(entry.lastmod.match(/^\d{4}-\d{2}-\d{2}$/), `lastmod not YYYY-MM-DD: ${entry.lastmod}`);
      assert.ok(['daily', 'weekly', 'monthly'].includes(entry.changefreq));
      assert.ok(entry.priority >= 0.5 && entry.priority <= 1.0);
    }
  });

  await test('OG images use actual salon media, not fake placeholder', () => {
    for (const seo of seoList) {
      if (seo.ogImage) {
        assert.ok(seo.ogImage.startsWith('https://'), `OG image should be real URL: ${seo.ogImage}`);
        assert.ok(!seo.ogImage.includes('placeholder') && !seo.ogImage.includes('fake'), 'OG image should not be fake');
      }
    }
  });
}

// Language SEO cross-theme
section('Language SEO — EN vs HI generate correct localized metadata');
{
  for (const config of CASES) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale('en');
    document.head.innerHTML = '';
    const data = richData(config.id);
    const enUtils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const enSeo = seoFromContainer(enUtils.container);
    cleanup();
    document.head.innerHTML = '';

    window.localStorage.clear();
    setSiteLocale('hi');
    const hiUtils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const hiSeo = seoFromContainer(hiUtils.container);

    await test(`${config.id} EN vs HI: titles differ and are localized`, () => {
      assert.notEqual(enSeo.title, hiSeo.title, 'EN and HI titles should differ');
      assert.ok(/[\u0900-\u097F]/.test(hiSeo.title) || hiSeo.title.includes('में'), `HI title should be Hindi: ${hiSeo.title}`);
      assert.ok(!/[\u0900-\u097F]/.test(enSeo.title) || enSeo.title.includes('in'), `EN title should be English: ${enSeo.title}`);
    });

    cleanup();
    document.head.innerHTML = '';
  }
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 10.11 dynamic SEO & social metadata: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log('All five themes verified: EN/HI, Light/Dark, Desktop/Mobile, metadata + social preview, canonical, robots, sitemap, heading hierarchy, no duplicates.');
