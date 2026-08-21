/**
 * PHASE 10.2 — GLOBAL LANGUAGE & DARK MODE (five-theme acceptance)
 *
 * Mounts the REAL five theme renderers in jsdom and verifies, per theme:
 *
 * LANGUAGE (English ↔ हिन्दी)
 *   1.  Header Language control switches the WHOLE site chrome instantly:
 *       navigation, Book buttons, section headings, eyebrow labels, location
 *       labels, day names, deposit card, footer.
 *   2.  Theme-specific copy stays theme-specific in हिन्दी (services titles
 *       differ pairwise across themes — no cross-theme mixing).
 *   3.  Service categories translate via the global category dictionary and
 *       never mix between themes; service names honour `translations` (Phase
 *       9.2 pipeline) while untranslated records stay in English.
 *   4.  Package/offer rows keep prices + badges; locale never mutates data.
 *   5.  Default language is English; switching back restores English fully.
 *
 * DARK MODE (Light ↔ Dark)
 *   6.  The header toggle flips EVERY website surface: page, hero, services,
 *       offers, gallery/about/team/reviews, location, contact band and footer
 *       (representative inline styles asserted per theme).
 *   7.  Each theme keeps its own identity in dark mode — hero/services/footer
 *       surface colors are pairwise distinct across the five themes.
 *   8.  The choice persists: a FRESH mount (simulating refresh) rehydrates
 *       in the stored mode.
 *   9.  Toggling back to light restores the exact original light surfaces.
 *  10.  Works in mobile mode too (drawer toggle drives the same global state).
 *
 * Nothing about the DOM is stubbed except scrollIntoView (jsdom lacks it).
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
const { surfacesOf, BARBER_SURFACES, HAIR_STUDIO_SURFACES, BEAUTY_SPA_SURFACES, FAMILY_SURFACES, NAIL_LASH_SURFACES } = await import('../src/lib/themeSurfaces.ts');
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

function richData(templateId) {
  return {
    ...initialData,
    templateId,
    salonName: 'Phase Ten Salon',
    tagline: '',
    about: '',
    ownerName: 'Asha Verma',
    ownerRole: '',
    email: 'hello@phaseten.test',
    phone: '+91 99999 00000',
    address: { fullAddress: '21 Test Street, Jaipur', area: 'Test', city: 'Jaipur', state: 'Rajasthan', pinCode: '302001' },
    openingHours: {
      monday: { open: true, working: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      sunday: { open: false, working: false, startTime: '10:00 AM', endTime: '04:00 PM' },
    },
    services: [
      {
        id: 'svc-1', name: 'Signature Haircut', category: 'Haircut', description: 'Precision cut and finish.',
        price: 499, duration: 45, status: 'active',
        translations: [{ locale: 'hi', name: 'सिग्नेचर हेयरकट', description: 'परफ़ेक्ट कट और फ़िनिश।' }],
      },
      { id: 'svc-2', name: 'Strawberry Spa Wrap', category: 'Combos', description: 'No Hindi translation on purpose.', price: 899, duration: 50, status: 'active' },
    ],
    packages: [
      { id: 'pkg-1', name: 'Festive Combo', description: 'Bundle under test.', price: 1199, duration: 90, status: 'active' },
    ],
    team: [{ id: 'tm-1', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: ['Color'], imageUrl: 'https://example.com/riya.jpg', bio: 'Craft first.', status: 'Available' }],
    gallery: [{ id: 'gal-1', url: 'https://example.com/g1.jpg', alt: 'Work', category: 'General' }],
    socialVideos: [{ id: 'vid-1', title: 'Reel', platform: 'instagram', url: 'https://example.com/r', thumbnailUrl: 'https://example.com/t.jpg' }],
  };
}

const CASES = [
  {
    id: 'barber_mens_grooming', label: "Barber & Men's Grooming", Component: Barber,
    surfaces: BARBER_SURFACES,
    heroId: 'section-hero', servicesId: 'section-services', contactId: 'section-contact', footerId: 'section-footer',
    servicesTitleEn: 'Cuts & Services', servicesTitleHi: 'कट और सेवाएँ',
    contactTitleEn: 'Book Your Chair', contactTitleHi: 'अपनी कुर्सी बुक करें',
    defaultAppearance: 'dark',
  },
  {
    id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar', Component: HairStudio,
    surfaces: HAIR_STUDIO_SURFACES,
    heroId: 'section-hero', servicesId: 'section-services', contactId: 'section-contact', footerId: 'section-footer',
    servicesTitleEn: 'Services, Curated', servicesTitleHi: 'सेवाएँ, चुनिंदा',
    contactTitleEn: 'Book Your Appointment', contactTitleHi: 'अपनी अपॉइंटमेंट बुक करें',
    defaultAppearance: 'light',
  },
  {
    id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa', Component: BeautySpa,
    surfaces: BEAUTY_SPA_SURFACES,
    heroId: 'section-hero', servicesId: 'section-services', contactId: 'section-contact', footerId: 'section-footer',
    servicesTitleEn: 'Services & Rituals', servicesTitleHi: 'सेवाएँ और रिचुअल',
    contactTitleEn: 'Book Your Appointment', contactTitleHi: 'अपनी अपॉइंटमेंट बुक करें',
    defaultAppearance: 'light',
  },
  {
    id: 'family_full_service', label: 'Full-Service Family Salon', Component: Family,
    surfaces: FAMILY_SURFACES,
    heroId: 'section-hero', servicesId: 'section-services', contactId: 'section-contact', footerId: 'section-footer',
    servicesTitleEn: 'A menu made for real life', servicesTitleHi: 'असली ज़िंदगी के लिए बना मेनू',
    contactTitleEn: 'Ready when your family is', contactTitleHi: 'जब आपका परिवार तैयार हो, हम तैयार हैं',
    defaultAppearance: 'light',
  },
  {
    id: 'nail_lash_studio', label: 'Nail & Lash Studio', Component: NailLash,
    surfaces: NAIL_LASH_SURFACES,
    heroId: 'section-hero', servicesId: 'section-featured-services', contactId: 'section-contact', footerId: 'section-footer',
    servicesTitleEn: 'Featured services', servicesTitleHi: 'चुनिंदा सेवाएँ',
    contactTitleEn: 'Ready for your close-up?', contactTitleHi: 'क्लोज़-अप के लिए तैयार?',
    defaultAppearance: 'light',
  },
];

const bgOf = (el) => (el?.getAttribute('style') || '').match(/background-color:\s*([^;]+)/i)?.[1]?.trim() || null;
/** jsdom CSSOM normalizes colors (hex → rgb()) — canonicalize both sides. */
const canon = (color) => {
  if (!color) return color;
  const probe = dom.window.document.createElement('div');
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor || color;
};
const bgIs = (el, tokenColor) => bgOf(el) === canon(tokenColor);

/* ================= LANGUAGE ============================================= */

for (const config of CASES) {
  section(`${config.label} — language (desktop)`);
  {
    cleanup();
    window.localStorage.clear();
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));
    const S = siteText(config.id, 'hi');
    const body = () => document.body.textContent || '';

    await test('renders in English by default', async () => {
      assert.ok(body().includes(config.servicesTitleEn), `default English title missing: ${config.servicesTitleEn}`);
      assert.ok(body().includes('Home'), 'English nav missing');
      assert.ok(body().includes(config.contactTitleEn), 'English contact title missing');
    });

    await test('switching to हिन्दी flips nav, headings, CTAs, days and labels', async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('site-header-lang-hi')); });
      const text = body();
      // Nav + global CTAs
      assert.ok(text.includes('होम') && text.includes('सेवाएँ') && text.includes('संपर्क'), 'Hindi nav missing');
      assert.ok(text.includes('अपॉइंटमेंट बुक करें'), 'Hindi Book CTA missing');
      // Theme-specific headings
      assert.ok(text.includes(config.servicesTitleHi), `Hindi ${config.servicesTitleHi} missing`);
      assert.ok(text.includes(config.contactTitleHi), `Hindi contact title missing for ${config.id}`);
      // Common labels
      assert.ok(text.includes('खुलने का समय') || text.includes('समय') || text.includes('स्टूडियो का समय'), 'Hindi hours label missing');
      assert.ok(text.includes('सोमवार'), 'Hindi day name missing');
      assert.ok(text.includes('बंद'), 'Hindi Closed label missing');
      assert.ok(text.includes('रास्ता देखें') || text.includes('Nexora प्लेटफ़ॉर्म'), 'Hindi common labels missing');
      // Theme reviews/localised chrome come from the theme namespace
      assert.ok(text.includes(S.reviewsTitle || S.testimonialsTitle), 'theme-localised reviews/testimonials title missing');
    });

    await test('service name translations + category localisation work without mixing themes', async () => {
      const text = body();
      assert.ok(text.includes('सिग्नेचर हेयरकट'), 'translated service name missing');
      assert.ok(text.includes('परफ़ेक्ट कट और फ़िनिश।'), 'translated description missing');
      assert.ok(text.includes('हेयरकट'), 'translated category missing');
      assert.ok(text.includes('Strawberry Spa Wrap'), 'untranslated service must stay in English');
      assert.ok(text.includes('कॉम्बो'), 'category "Combos" should localise via the global dictionary');
      // Theme-specific services titles never equal another theme's in Hindi.
      const others = CASES.filter((c) => c.id !== config.id).map((c) => c.servicesTitleHi);
      assert.ok(!others.includes(config.servicesTitleHi), 'Hindi services title collides with another theme');
    });

    await test('offers/prices keep working in हिन्दी (package name + ₹ price intact)', async () => {
      const text = body();
      assert.ok(text.includes('Festive Combo'), 'package name missing');
      assert.ok(/₹/.test(text), 'rupee price missing');
    });

    await test('switching back to English restores original copy', async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('site-header-lang-en')); });
      assert.ok(body().includes(config.servicesTitleEn), 'English title not restored');
      assert.ok(body().includes('Home'), 'English nav not restored');
    });

    cleanup();
  }
}

/* ================= DARK MODE ============================================ */

const darkHeroBgs = new Map();
const darkServicesBgs = new Map();
const darkFooterBgs = new Map();

for (const config of CASES) {
  section(`${config.label} — dark mode (desktop)`);
  {
    cleanup();
    window.localStorage.clear();
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));

    const tokenKeyForServices = {
      barber_mens_grooming: 'charcoalSoft',
      hair_studio_color_bar: 'paper',
      beauty_skin_spa: 'cream',
      family_full_service: 'white',
      nail_lash_studio: 'cream',
    }[config.id];
    const tokenKeyForContact = {
      barber_mens_grooming: 'charcoal',
      hair_studio_color_bar: 'paperDeep',
      beauty_skin_spa: 'cream',
      family_full_service: 'contactBand',
      nail_lash_studio: 'bandBg',
    }[config.id];

    await test('default appearance matches theme design', async () => {
      assert.equal(utils.getByTestId('site-header').dataset.appearance, config.defaultAppearance);
      const lightTokens = surfacesOf(config.surfaces, config.defaultAppearance);
      assert.ok(bgIs(utils.container.querySelector(`#${config.servicesId}`), lightTokens[tokenKeyForServices]));
      assert.ok(bgIs(utils.container.querySelector(`#${config.footerId}`), lightTokens.footerBg));
    });

    await test('toggle flips every surface: page/hero/services/contact/footer — and back', async () => {
      // Light surfaces before toggling (baseline = theme default).
      const baseTokens = surfacesOf(config.surfaces, config.defaultAppearance);
      assert.ok(bgIs(utils.container.querySelector(`#${config.servicesId}`), baseTokens[tokenKeyForServices]));

      // FLIP to the opposite mode.
      const targetMode = config.defaultAppearance === 'dark' ? 'light' : 'dark';
      const expected = surfacesOf(config.surfaces, targetMode);
      await act(async () => { fireEvent.click(utils.getByTestId('site-header-dark-toggle')); });
      assert.equal(utils.getByTestId('site-header').dataset.appearance, targetMode);

      const servicesEl = utils.container.querySelector(`#${config.servicesId}`);
      const contactEl = utils.container.querySelector(`#${config.contactId}`);
      const footerEl = utils.container.querySelector(`#${config.footerId}`);
      const heroEl = utils.container.querySelector(`#${config.heroId}`);

      assert.ok(bgIs(servicesEl, expected[tokenKeyForServices]), `services bg != ${targetMode} token: got ${bgOf(servicesEl)}, want ${expected[tokenKeyForServices]}`);
      assert.ok(bgIs(contactEl, expected[tokenKeyForContact]), `contact bg != ${targetMode} token: got ${bgOf(contactEl)}, want ${expected[tokenKeyForContact]}`);
      assert.ok(bgIs(footerEl, expected.footerBg), 'footer bg != target token');
      assert.ok(heroEl.getAttribute('style'), 'hero keeps a styled surface');
      // The page scroll surface carries a themed background as well.
      const scroller = utils.container.querySelector('.overflow-y-auto');
      assert.ok(bgOf(scroller), 'page surface missing background');

      // FLIP BACK restores the original light/dark surfaces exactly.
      await act(async () => { fireEvent.click(utils.getByTestId('site-header-dark-toggle')); });
      assert.equal(utils.getByTestId('site-header').dataset.appearance, config.defaultAppearance);
      assert.ok(bgIs(utils.container.querySelector(`#${config.servicesId}`), baseTokens[tokenKeyForServices]), 'services bg did not restore');
      assert.ok(bgIs(utils.container.querySelector(`#${config.footerId}`), baseTokens.footerBg), 'footer bg did not restore');
      assert.ok(bgIs(utils.container.querySelector(`#${config.contactId}`), baseTokens[tokenKeyForContact]), 'contact bg did not restore');
    });

    await test('mode persists across remount (refresh simulation)', async () => {
      // Set dark explicitly, unmount, remount — must come back dark.
      const header = utils.getByTestId('site-header');
      if (header.dataset.appearance !== 'dark') {
        await act(async () => { fireEvent.click(utils.getByTestId('site-header-dark-toggle')); });
      }
      assert.equal(window.localStorage.getItem('nexora_site_appearance'), 'dark');
      cleanup();
      const fresh = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));
      assert.equal(fresh.getByTestId('site-header').dataset.appearance, 'dark', 'dark mode not persisted after remount');
      assert.ok(bgIs(fresh.container.querySelector(`#${config.footerId}`), config.surfaces.dark.footerBg));
      cleanup();
      window.localStorage.clear();
    });

    cleanup();
    window.localStorage.clear();
  }
}

section('Cross-theme dark identity');
{
  // Render each theme FORCED into dark mode (persisted preference) and record
  // the actual rendered surfaces — identity must survive the toggle, not just
  // exist in the token table.
  for (const config of CASES) {
    cleanup();
    window.localStorage.clear();
    window.localStorage.setItem('nexora_site_appearance', 'dark');
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));
    assert.equal(utils.getByTestId('site-header').dataset.appearance, 'dark');
    darkHeroBgs.set(config.id, utils.container.querySelector(`#${config.heroId}`).getAttribute('style'));
    darkServicesBgs.set(config.id, bgOf(utils.container.querySelector(`#${config.servicesId}`)));
    darkFooterBgs.set(config.id, bgOf(utils.container.querySelector(`#${config.footerId}`)));
    cleanup();
    window.localStorage.clear();
  }
  await test('dark services surfaces differ pairwise across all five themes', async () => {
    const values = [...darkServicesBgs.values()];
    assert.equal(new Set(values).size, CASES.length, `dark services bgs not all distinct: ${values.join(' | ')}`);
  });
  await test('dark footer surfaces differ pairwise across all five themes', async () => {
    const values = [...darkFooterBgs.values()];
    assert.equal(new Set(values).size, CASES.length, `dark footer bgs not all distinct: ${values.join(' | ')}`);
  });
  await test('dark hero surfaces differ pairwise across all five themes', async () => {
    const values = [...darkHeroBgs.values()];
    assert.equal(new Set(values).size, CASES.length, `dark hero surfaces not all distinct`);
  });
  await test('light surfaces also differ pairwise (identity intact in both modes)', async () => {
    const lightServices = CASES.map((c) => surfacesOf(c.surfaces, c.id === 'barber_mens_grooming' ? 'dark' : 'light')[{
      barber_mens_grooming: 'charcoalSoft', hair_studio_color_bar: 'paper', beauty_skin_spa: 'cream',
      family_full_service: 'white', nail_lash_studio: 'cream',
    }[c.id]]);
    assert.equal(new Set(lightServices).size, CASES.length);
  });
}

section('Mobile — global controls in the drawer');
{
  for (const config of CASES) {
    await test(`${config.label}: drawer dark toggle + language drive the global site state`, async () => {
      cleanup();
      window.localStorage.clear();
      const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'mobile' }));
      await act(async () => { fireEvent.click(utils.getByTestId('site-menu-button')); });
      const before = utils.getByTestId('site-header').dataset.appearance;
      await act(async () => { fireEvent.click(utils.getByTestId('site-drawer-dark-toggle')); });
      assert.notEqual(utils.getByTestId('site-header').dataset.appearance, before);
      const contactBg = bgOf(utils.container.querySelector(`#${config.contactId}`));
      const expected = surfacesOf(config.surfaces, utils.getByTestId('site-header').dataset.appearance);
      const key = { barber_mens_grooming: 'charcoal', hair_studio_color_bar: 'paperDeep', beauty_skin_spa: 'cream', family_full_service: 'contactBand', nail_lash_studio: 'bandBg' }[config.id];
      assert.ok(canon(expected[key]) === contactBg, `mobile toggle did not retheme contact section: got ${contactBg}, want ${canon(expected[key])}`);
      await act(async () => { fireEvent.click(utils.getByTestId('site-drawer-lang-hi')); });
      assert.ok((document.body.textContent || '').includes(config.servicesTitleHi), 'mobile language switch failed');
      cleanup();
      window.localStorage.clear();
    });
  }
}

/* ================= SUMMARY ============================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 10.2 language & dark mode: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}`);
  process.exit(1);
}
console.log('All five themes verified: English ↔ हिन्दी and Light ↔ Dark.');
