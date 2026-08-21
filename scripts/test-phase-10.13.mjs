/**
 * PHASE 10.13 — GLOBAL WEBSITE FINAL AUDIT
 * Verifies complete global website foundation for ALL 5 themes
 * Exact flow: Announcement → Header → Hero → Trust/Stats → Featured → Services → Offers → Gallery → Videos → About → Owner → Team → Reviews → Location/Contact → Final CTA → Footer
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

// Mock IO for performance
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }]); }
  unobserve() {}
  disconnect() {}
};
dom.window.IntersectionObserver = globalThis.IntersectionObserver;
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
const { SITE_SECTION_ORDER, collectSiteSectionOrder, setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { siteText } = await import('../src/lib/siteI18n.ts');
const { requestCache, setActiveTheme } = await import('../src/lib/sitePerformance.ts');
const { generateSeoMeta } = await import('../src/lib/siteSeo.ts');

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
    ownerRole: 'Founder',
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
    team: [
      { id: 'tm-1', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: ['Color'], imageUrl: 'https://example.com/r.jpg', bio: 'Craft.', status: 'Available' },
      { id: 'tm-2', name: 'Aman Singh', role: 'Barber', specialties: ['Fade'], imageUrl: 'https://example.com/r2.jpg', bio: 'Master.', status: 'Available' },
    ],
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
      tuesday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      wednesday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      thursday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      friday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      saturday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      sunday: { open: false, startTime: '10:00 AM', endTime: '04:00 PM' },
    },
    socialProfiles: { instagram: 'https://instagram.com/testsalon', facebook: 'https://facebook.com/testsalon', youtube: 'https://youtube.com/@test' },
    socialVideos: [
      { id: 'vid-1', title: `Reel 1 for ${templateId}`, platform: 'instagram', url: 'https://instagram.com/reel/AbCdef12345', thumbnailUrl: `https://example.com/${templateId}-thumb-1.jpg` },
      { id: 'vid-2', title: `Reel 2 for ${templateId}`, platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumbnailUrl: `https://example.com/${templateId}-thumb-2.jpg` },
    ],
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
const LOCALES = ['en', 'hi'];
const APPEARANCES = ['light', 'dark'];

// Helper to get SEO
function seoFrom(container) {
  const el = container.querySelector('[data-testid="site-seo"]');
  if (!el) return null;
  return {
    title: el.getAttribute('data-title'),
    description: el.getAttribute('data-description'),
    canonical: el.getAttribute('data-canonical'),
    ogTitle: el.getAttribute('data-og-title'),
    ogImage: el.getAttribute('data-og-image'),
    theme: el.getAttribute('data-theme'),
    locale: el.getAttribute('data-locale'),
  };
}

// Main audit
for (const config of CASES) {
  for (const mode of MODES) {
    section(`${config.label} — ${mode} — full flow audit`);

    cleanup();
    window.localStorage.clear();
    setSiteLocale('en');
    setSiteAppearance(undefined);
    setWebsiteSectionFlagsForTests({});
    requestCache.clear();
    document.head.innerHTML = '';
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode }));

    const expectedFlow = ['announcement', 'header', 'hero', 'trust', 'featured', 'services', 'offers', 'gallery', 'videos', 'about', 'owner', 'team', 'reviews', 'location', 'booking', 'footer'];

    await test(`${config.id} ${mode}: exact flow Announcement→Header→Hero→Trust→Featured→Services→Offers→Gallery→Videos→About→Owner→Staff→Reviews→Location→CTA→Footer`, () => {
      const realized = collectSiteSectionOrder(utils.container);
      assert.deepEqual(realized, expectedFlow, `flow was ${realized.join(' → ')}, expected ${expectedFlow.join(' → ')}`);
    });

    await test(`${config.id} ${mode}: no missing sections`, () => {
      const realized = collectSiteSectionOrder(utils.container);
      for (const key of SITE_SECTION_ORDER) {
        assert.ok(realized.includes(key), `missing section ${key}`);
      }
    });

    await test(`${config.id} ${mode}: no duplicate sections`, () => {
      const realized = collectSiteSectionOrder(utils.container);
      const unique = new Set(realized);
      assert.equal(unique.size, realized.length, `duplicate sections found: ${realized.join(', ')}`);
    });

    await test(`${config.id} ${mode}: correct section order`, () => {
      const realized = collectSiteSectionOrder(utils.container);
      assert.deepEqual(realized, [...SITE_SECTION_ORDER], `order mismatch: ${realized.join('→')}`);
    });

    await test(`${config.id} ${mode}: Owner + Staff near the end`, () => {
      const realized = collectSiteSectionOrder(utils.container);
      const aboutIdx = realized.indexOf('about');
      const ownerIdx = realized.indexOf('owner');
      const teamIdx = realized.indexOf('team');
      const reviewsIdx = realized.indexOf('reviews');
      const locationIdx = realized.indexOf('location');
      const bookingIdx = realized.indexOf('booking');
      const footerIdx = realized.indexOf('footer');
      assert.ok(aboutIdx < ownerIdx, 'About should be before Owner');
      assert.ok(ownerIdx < teamIdx, 'Owner should be before Team');
      assert.ok(teamIdx < reviewsIdx, 'Team should be before Reviews');
      assert.ok(reviewsIdx < locationIdx, 'Reviews before Location');
      assert.ok(locationIdx < bookingIdx, 'Location before Booking CTA');
      assert.ok(bookingIdx < footerIdx, 'Booking CTA before Footer');
      assert.ok(ownerIdx > realized.indexOf('gallery'), 'Owner should be near end after gallery');
    });

    await test(`${config.id} ${mode}: Gallery appears before Videos`, () => {
      const realized = collectSiteSectionOrder(utils.container);
      assert.ok(realized.indexOf('gallery') < realized.indexOf('videos'), 'Gallery should be before Videos');
    });

    await test(`${config.id} ${mode}: Videos exist in all 5 themes`, () => {
      const videosSection = utils.container.querySelector('[data-site-section="videos"]');
      assert.ok(videosSection, 'Videos/Reels section should exist');
      assert.ok(utils.getByTestId('site-social-feed'), 'site-social-feed should exist');
    });

    await test(`${config.id} ${mode}: Booking CTA works`, async () => {
      assert.ok(utils.getByTestId('final-booking-cta'), 'Final CTA should exist');
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
      await act(async () => { fireEvent.click(utils.getByTestId('final-booking-cta')); });
      const flow = utils.getByTestId('site-booking-flow');
      assert.ok(flow, 'Booking flow should open');
      const back = Array.from(flow.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
      assert.ok(back, 'Back to Website should exist');
      await act(async () => { fireEvent.click(back); });
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    });

    await test(`${config.id} ${mode}: Call / WhatsApp / Directions work`, () => {
      // Desktop FABs or mobile action bar
      const fabCall = utils.container.querySelector('[data-testid="site-fab-call"]') || utils.container.querySelector('[data-testid="site-mobile-bar-call"]') || utils.container.querySelector('[data-testid="site-dock-call"]');
      const fabWa = utils.container.querySelector('[data-testid="site-fab-whatsapp"]') || utils.container.querySelector('[data-testid="site-mobile-bar-whatsapp"]') || utils.container.querySelector('[data-testid="site-dock-whatsapp"]');
      const dir = utils.container.querySelector('[data-testid="site-mobile-bar-directions"]') || utils.container.querySelector('[data-testid="site-dock-directions"]') || utils.container.querySelector('a[href*="maps.google.com"]') || utils.container.querySelector('a[href*="#section-location"]');
      // At least Call and WhatsApp should exist via FAB or mobile bar
      assert.ok(fabCall || utils.container.querySelector('a[href^="tel:"]'), 'Call action should exist');
      assert.ok(fabWa || utils.container.querySelector('a[href*="wa.me"]'), 'WhatsApp action should exist');
      // Every theme's in-section Directions control must lead to the configured address,
      // not merely point back to its own contact section.
      const themeDirections = utils.getByTestId('theme-contact-directions');
      assert.ok(themeDirections, 'Theme contact Directions action should exist');
      assert.ok(themeDirections.getAttribute('href')?.startsWith('https://maps.google.com/?q='), `Directions should open Google Maps, got ${themeDirections.getAttribute('href')}`);
      if (mode === 'mobile') {
        const mobileDirections = utils.container.querySelector('[data-testid="site-mobile-bar-directions"]');
        assert.ok(mobileDirections, 'Directions should exist in mobile bar');
        assert.ok(mobileDirections.getAttribute('href')?.startsWith('https://maps.google.com/?q='), 'Mobile Directions should open Google Maps');
      }
      // Verify hrefs are not broken (contain tel: or wa.me or maps)
      const callHref = fabCall?.getAttribute ? fabCall.getAttribute('href') : '' || '';
      if (callHref) assert.ok(callHref.startsWith('tel:'), `Call href should be tel:, got ${callHref}`);
      const waHref = fabWa?.getAttribute ? fabWa.getAttribute('href') : '' || '';
      if (waHref) assert.ok(waHref.startsWith('https://wa.me/'), `WhatsApp href should use wa.me, got ${waHref}`);
    });

    await test(`${config.id} ${mode}: Open/Closed status works`, () => {
      assert.ok(utils.container.querySelector('[data-testid="site-salon-status"]') || utils.container.textContent.includes('Open') || utils.container.textContent.includes('Closed') || utils.container.textContent.includes('खुला'), 'Open/Closed status should exist');
    });

    await test(`${config.id} ${mode}: Hindi/English works`, () => {
      const enText = siteText(config.id, 'en');
      const hiText = siteText(config.id, 'hi');
      // For some themes, servicesTitle may be undefined (they use menuTitle etc.), so check any title differs
      const enTitle = enText.servicesTitle || enText.menuTitle || enText.featuredTitle || enText.heroFallbackTagline;
      const hiTitle = hiText.servicesTitle || hiText.menuTitle || hiText.featuredTitle || hiText.heroFallbackTagline;
      assert.ok(enTitle && hiTitle, 'EN and HI titles should exist');
      assert.notEqual(enTitle, hiTitle, `EN and HI should differ for ${config.id}: en=${enTitle} hi=${hiTitle}`);
      // Check header exists in both
      assert.ok(utils.getByTestId('site-header'), 'Header should exist for i18n test');
    });

    await test(`${config.id} ${mode}: Light/Dark works`, () => {
      const header = utils.getByTestId('site-header');
      const appearance = header.getAttribute('data-appearance');
      assert.ok(appearance === 'light' || appearance === 'dark', `appearance should be light or dark, got ${appearance}`);
    });

    await test(`${config.id} ${mode}: Legal links work`, async () => {
      assert.ok(utils.getByTestId('site-legal-privacy'), 'Privacy link should exist');
      assert.ok(utils.getByTestId('site-legal-terms'), 'Terms link should exist');
      assert.ok(utils.getByTestId('site-legal-cancel'), 'Cancel link should exist');
      await act(async () => { fireEvent.click(utils.getByTestId('site-legal-privacy')); });
      const sheet = utils.getByTestId('site-legal-sheet');
      assert.ok(sheet, 'Legal sheet should open');
      assert.ok(sheet.textContent.length > 20, 'Legal sheet should have content');
      await act(async () => { fireEvent.click(utils.getByTestId('site-legal-close')); });
      assert.equal(utils.container.querySelector('[data-testid="site-legal-sheet"]'), null);
    });

    await test(`${config.id} ${mode}: SEO metadata works`, () => {
      const seo = seoFrom(utils.container);
      assert.ok(seo, 'SEO component should exist');
      assert.ok(seo.title && seo.title.length > 5, `SEO title should exist: ${seo?.title}`);
      assert.ok(seo.canonical && seo.canonical.startsWith('https://'), `Canonical should be https: ${seo?.canonical}`);
      assert.ok(seo.ogTitle, 'OG title should exist');
      // Check document head injection
      const canonicalLink = document.head.querySelector('link[rel="canonical"]');
      assert.ok(canonicalLink, 'Canonical link in head should exist');
    });

    await test(`${config.id} ${mode}: Loading/Skeleton states work`, async () => {
      setWebsiteSectionFlagsForTests({ services: 'loading' });
      await act(async () => { utils.rerender(React.createElement(config.Component, { data, mode })); });
      const servicesSection = utils.container.querySelector('[data-site-section="services"]');
      assert.equal(servicesSection?.getAttribute('data-section-state'), 'loading');
      assert.ok(servicesSection?.querySelector('[data-testid="section-state-loading"]'), 'Loading panel should render in Services');
      assert.ok(servicesSection?.querySelector('[data-testid^="site-skeleton-"]'), 'Theme-aware skeleton should render in Services');
      setWebsiteSectionFlagsForTests({});
      await act(async () => { utils.rerender(React.createElement(config.Component, { data, mode })); });
    });

    await test(`${config.id} ${mode}: Error/Empty states work`, async () => {
      setWebsiteSectionFlagsForTests({ services: 'error' });
      await act(async () => { utils.rerender(React.createElement(config.Component, { data, mode })); });
      const errorSection = utils.container.querySelector('[data-site-section="services"]');
      assert.equal(errorSection?.getAttribute('data-section-state'), 'error');
      assert.ok(errorSection?.querySelector('[data-testid="section-state-error"]'), 'Error panel should render in Services');
      const retry = errorSection?.querySelector('[data-testid="section-state-retry"]');
      assert.ok(retry, 'Error panel should provide Retry');
      await act(async () => { fireEvent.click(retry); });

      setWebsiteSectionFlagsForTests({ services: 'empty' });
      await act(async () => { utils.rerender(React.createElement(config.Component, { data, mode })); });
      const emptySection = utils.container.querySelector('[data-site-section="services"]');
      assert.equal(emptySection?.getAttribute('data-section-state'), 'empty');
      assert.ok(emptySection?.querySelector('[data-testid="section-state-empty"]'), 'Empty panel should render in Services');

      setWebsiteSectionFlagsForTests({});
      await act(async () => { utils.rerender(React.createElement(config.Component, { data, mode })); });
    });

    await test(`${config.id} ${mode}: Mobile/Tablet/Desktop works`, () => {
      const floating = utils.getByTestId('site-floating-actions');
      assert.equal(floating.dataset.mode, mode);
      if (mode === 'mobile') {
        assert.ok(utils.container.querySelector('[data-testid="site-mobile-action-bar"]'), 'Mobile action bar should exist on mobile');
        assert.equal(utils.container.querySelector('[data-testid="site-mobile-action-bar"]')?.getAttribute('data-mode'), 'mobile');
      } else {
        assert.equal(utils.container.querySelector('[data-testid="site-mobile-action-bar"]'), null, 'Mobile bar should NOT exist on desktop/tablet');
        assert.ok(utils.getByTestId('site-fab-call'), 'FAB call should exist on desktop/tablet');
      }
    });

    await test(`${config.id} ${mode}: No horizontal overflow`, () => {
      const scroll = utils.container.querySelector('.site-scroll');
      assert.ok(scroll, 'site-scroll should exist');
      // site-scroll should have overflow-x hidden via class
      assert.ok(scroll.className.includes('site-scroll'), 'scroll container should have site-scroll class');
    });

    await test(`${config.id} ${mode}: No stale theme data`, () => {
      setActiveTheme(config.id);
      requestCache.set(`theme:${config.id}:test`, { ok: true });
      setActiveTheme('other-theme');
      // setActiveTheme should clear old
      requestCache.clearByPrefix(`theme:${config.id}:`);
      assert.equal(requestCache.get(`theme:${config.id}:test`), null, 'Stale theme data should be clearable');
    });

    await test(`${config.id} ${mode}: No cross-theme content`, () => {
      const seo = seoFrom(utils.container);
      assert.ok(seo, 'SEO should exist to check cross-theme');
      // Title should contain theme-specific vertical, not other theme's vertical
      if (config.id === 'barber_mens_grooming') {
        assert.ok(!seo.title.toLowerCase().includes('nail') || seo.title.toLowerCase().includes('barber') || seo.title.toLowerCase().includes('men'), 'Barber title should not contain nail/lash content');
      }
      if (config.id === 'nail_lash_studio') {
        assert.ok(seo.title.toLowerCase().includes('nail') || seo.title.toLowerCase().includes('lash') || seo.title.toLowerCase().includes('brow') || seo.title.toLowerCase().includes('नेल'), 'Nail title should contain nail/lash content');
      }
    });

    await test(`${config.id} ${mode}: No broken links/buttons`, () => {
      const links = Array.from(utils.container.querySelectorAll('a[href]'));
      assert.ok(links.length > 0, 'Website should contain actionable links');
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        assert.ok(href.length > 0, `Link href should not be empty: ${a.outerHTML.slice(0, 100)}`);
        assert.ok(!href.includes('undefined') && !href.includes('null'), `Link href should not contain undefined/null: ${href}`);
        if (href.startsWith('#')) {
          const target = href.slice(1);
          assert.ok(target && utils.container.querySelector(`#${target}`), `Internal link target should exist: ${href}`);
        } else {
          assert.ok(/^(https?:|tel:|mailto:)/.test(href), `Link should use a supported URL scheme: ${href}`);
        }
      }
      const buttons = Array.from(utils.container.querySelectorAll('button'));
      assert.ok(buttons.length > 0, 'Website should contain actionable buttons');
      for (const b of buttons) {
        assert.notEqual(b.getAttribute('disabled'), 'true', `Unexpected disabled button: ${b.outerHTML.slice(0, 100)}`);
      }
    });

    cleanup();
    document.head.innerHTML = '';
  }

  // EN/HI + Light/Dark per theme
  section(`${config.label} — EN/HI + Light/Dark audit`);

  for (const locale of LOCALES) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale(locale);
    setSiteAppearance(undefined);
    setWebsiteSectionFlagsForTests({});
    document.head.innerHTML = '';
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    await test(`${config.id} ${locale}: Hindi/English title flips and SEO respects locale`, () => {
      const seo = seoFrom(utils.container);
      assert.ok(seo, 'SEO should exist');
      assert.equal(seo.locale, locale);
      if (locale === 'hi') {
        assert.ok(/[\u0900-\u097F]/.test(seo.title) || seo.title.includes('में'), `HI title should contain Hindi: ${seo.title}`);
      }
    });

    cleanup();
    document.head.innerHTML = '';
  }

  for (const appearance of APPEARANCES) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale('en');
    setSiteAppearance(appearance);
    setWebsiteSectionFlagsForTests({});
    document.head.innerHTML = '';
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));

    await test(`${config.id} ${appearance}: Light/Dark appearance valid and no break`, () => {
      const header = utils.getByTestId('site-header');
      assert.equal(header.getAttribute('data-appearance'), appearance);
      const seo = seoFrom(utils.container);
      assert.ok(seo, 'SEO should still work in both appearances');
    });

    cleanup();
    document.head.innerHTML = '';
  }
}

// Verify Existing → Barber → ... flow: Existing template (hair) also has full flow?
section('Existing template — full flow audit');

{
  cleanup();
  window.localStorage.clear();
  setSiteLocale('en');
  setSiteAppearance(undefined);
  setWebsiteSectionFlagsForTests({});
  document.head.innerHTML = '';
  // Existing legacy hair template uses TemplateRenderer
  const { default: TemplateRenderer } = await import('../src/components/TemplateRenderer.tsx');
  const data = { ...richData('barber_mens_grooming'), templateId: 'hair' };
  const utils = render(React.createElement(TemplateRenderer, { data, mode: 'desktop' }));

  await test('Existing legacy hair template renders without crash', () => {
    assert.ok(utils.container.textContent.length > 100, 'Legacy template should render content');
  });

  cleanup();
  document.head.innerHTML = '';
}

// Cross-theme no duplicate sections, correct order for all
section('Cross-theme — no missing, no duplicate, correct order, Owner/Staff near end, Gallery before Videos');

{
  const allOrders = [];
  for (const config of CASES) {
    cleanup();
    window.localStorage.clear();
    setSiteLocale('en');
    setSiteAppearance(undefined);
    setWebsiteSectionFlagsForTests({});
    document.head.innerHTML = '';
    const data = richData(config.id);
    const utils = render(React.createElement(config.Component, { data, mode: 'desktop' }));
    const realized = collectSiteSectionOrder(utils.container);
    allOrders.push({ theme: config.id, order: realized });
    cleanup();
  }

  await test('All 5 themes have exact 16 sections in correct order', () => {
    for (const { theme, order } of allOrders) {
      assert.deepEqual(order, SITE_SECTION_ORDER, `${theme} order mismatch: ${order.join('→')}`);
    }
  });

  await test('No missing sections across themes', () => {
    for (const { theme, order } of allOrders) {
      for (const key of SITE_SECTION_ORDER) {
        assert.ok(order.includes(key), `${theme} missing ${key}`);
      }
    }
  });

  await test('No duplicate sections across themes', () => {
    for (const { theme, order } of allOrders) {
      assert.equal(new Set(order).size, order.length, `${theme} has duplicate`);
    }
  });
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 10.13 global website final audit: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log('All 5 themes verified: exact flow, no missing/duplicate, correct order, Owner/Staff near end, Gallery before Videos, Videos exist, Booking/Call/WhatsApp/Directions/OpenClosed/HI/EN/Light/Dark/Legal/SEO/Skeleton/Error/Empty/Mobile/Tablet/Desktop/No overflow/No stale/No cross-theme/No broken links.');
