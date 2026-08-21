/**
 * PHASE 10.5 — ANNOUNCEMENT BAR & LIVE SALON STATUS (five-theme acceptance)
 *
 * Pure clock/announcement logic plus REAL five-theme renderers in jsdom.
 *
 *   Open day · Closed day · Weekly holiday · Special holiday
 *   Before opening · Closing soon · Expired announcement
 *   Theme-scoped copy · English/Hindi · Light/Dark · Mobile/Desktop
 *   Status in announcement + contact + booking
 *   Phase 10.1 header and 10.4 footer remain intact
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
const {
  resolveSalonStatus,
  setSalonClockForTests,
  parseClockToMinutes,
  formatClockLabel,
} = await import('../src/lib/salonStatus.ts');
const {
  announcementIsLive,
  pickDatedAnnouncement,
  resolveVisibleAnnouncement,
} = await import('../src/lib/salonAnnouncements.ts');
const { salonStatusLabel } = await import('../src/lib/siteStatusI18n.ts');
const { setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { HAIR_STUDIO_SURFACES, surfacesOf } = await import('../src/lib/themeSurfaces.ts');

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

function at(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function weekHours(overrides = {}) {
  return {
    monday: { open: true, startTime: '10:00', endTime: '20:00' },
    tuesday: { open: true, startTime: '10:00', endTime: '20:00' },
    wednesday: { open: true, startTime: '10:00', endTime: '20:00' },
    thursday: { open: true, startTime: '10:00', endTime: '20:00' },
    friday: { open: true, startTime: '10:00', endTime: '20:00' },
    saturday: { open: true, startTime: '10:00', endTime: '20:00' },
    sunday: { open: false, startTime: '10:00', endTime: '20:00' },
    ...overrides,
  };
}

const HOLIDAYS = [
  { date: '2026-08-15', name: 'Independence Day', nameHi: 'स्वतंत्रता दिवस', closed: true },
];

function richData(templateId, extras = {}) {
  return {
    ...initialData,
    templateId,
    salonName: 'Phase Ten Salon',
    tagline: 'Navigate me',
    about: 'A full website under test.',
    ownerName: 'Asha Verma',
    email: 'hello@phaseten.test',
    phone: '+91 99999 00000',
    whatsappPhone: '+91 99999 00000',
    contactOptions: { callNow: true, whatsapp: true, bookNow: true },
    openingHours: weekHours(),
    holidays: HOLIDAYS,
    announcements: [
      {
        id: 'ann-live',
        kind: 'festival',
        status: 'active',
        startDate: '2026-08-01',
        endDate: '2026-08-20',
        message: 'Rakhi week live offer',
        messageHi: 'राखी सप्ताह लाइव ऑफ़र',
        badge: 'Festival',
        badgeHi: 'त्योहार',
        ctaLabel: 'Book now',
        ctaLabelHi: 'अभी बुक करें',
        ctaTarget: 'booking',
      },
      {
        id: 'ann-expired',
        kind: 'seasonal',
        status: 'active',
        startDate: '2026-01-01',
        endDate: '2026-01-15',
        message: 'EXPIRED WINTER NIGHTS MUST HIDE',
        messageHi: 'समाप्त विंटर ऑफ़र नहीं दिखना चाहिए',
        badge: 'Seasonal',
      },
      {
        id: 'ann-inactive',
        kind: 'important',
        status: 'inactive',
        startDate: '2026-08-01',
        endDate: '2026-12-31',
        message: 'INACTIVE RENOVATION MUST HIDE',
        badge: 'Notice',
      },
    ],
    services: [
      { id: 'svc-1', name: 'Signature Haircut', category: 'Haircut', description: 'Cut and finish.', price: 499, duration: 45, status: 'active', featured: true },
    ],
    packages: [
      { id: 'pkg-1', name: 'Festive Combo', description: 'Bundle under test.', price: 1199, duration: 90, status: 'active' },
    ],
    team: [
      { id: 'tm-1', name: 'Riya Kapoor', role: 'Senior Stylist', specialties: ['Color'], imageUrl: 'https://example.com/r.jpg', bio: 'Craft.', status: 'Available' },
    ],
    gallery: [{ id: 'gal-1', url: 'https://example.com/g1.jpg', alt: 'Work', category: 'General' }],
    socialVideos: [{ id: 'vid-1', title: 'Reel', platform: 'instagram', url: 'https://example.com/r', thumbnailUrl: 'https://example.com/t.jpg' }],
    address: { fullAddress: '21 Test Street, Jaipur', area: 'Test', city: 'Jaipur', state: 'Rajasthan', pinCode: '302001' },
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

const THU_OPEN = at(2026, 8, 13, 11, 0);
const THU_BEFORE = at(2026, 8, 13, 8, 0);
const THU_SOON = at(2026, 8, 13, 19, 40);
const THU_AFTER = at(2026, 8, 13, 21, 0);
const SUN_CLOSED = at(2026, 8, 16, 11, 0);
const SAT_HOLIDAY = at(2026, 8, 15, 11, 0);
const MON_CLOSED_DAY = at(2026, 8, 17, 11, 0);

/* ================= UNIT: clock + announcements ========================== */

section('Clock parser + live status (no DOM)');
{
  await test('parses 24h and 12h opening-hour strings', () => {
    assert.equal(parseClockToMinutes('10:00'), 600);
    assert.equal(parseClockToMinutes('20:00'), 1200);
    assert.equal(parseClockToMinutes('09:00 AM'), 540);
    assert.equal(parseClockToMinutes('08:00 PM'), 1200);
    assert.equal(parseClockToMinutes('8:00 pm'), 1200);
    assert.equal(formatClockLabel(600), '10:00 AM');
    assert.equal(formatClockLabel(1200), '08:00 PM');
  });

  const base = { openingHours: weekHours(), holidays: HOLIDAYS };

  await test('open day (Thu 11:00) is Open Now', () => {
    const status = resolveSalonStatus(base, THU_OPEN);
    assert.equal(status.kind, 'open');
    assert.equal(salonStatusLabel(status, 'en'), 'Open Now');
    assert.equal(salonStatusLabel(status, 'hi'), 'अभी खुला है');
  });

  await test('weekly holiday (Sunday) is Closed Today', () => {
    const status = resolveSalonStatus(base, SUN_CLOSED);
    assert.equal(status.kind, 'closed_today');
    assert.equal(salonStatusLabel(status, 'en'), 'Closed Today');
    assert.equal(salonStatusLabel(status, 'hi'), 'आज बंद है');
  });

  await test('weekday marked closed is Closed Today', () => {
    const status = resolveSalonStatus({
      openingHours: weekHours({ monday: { open: false, startTime: '10:00', endTime: '20:00' } }),
      holidays: HOLIDAYS,
    }, MON_CLOSED_DAY);
    assert.equal(status.kind, 'closed_today');
  });

  await test('special holiday (Independence Day) wins over a working Saturday', () => {
    const status = resolveSalonStatus(base, SAT_HOLIDAY);
    assert.equal(status.kind, 'holiday');
    assert.match(salonStatusLabel(status, 'en'), /Holiday/);
    assert.match(salonStatusLabel(status, 'en'), /Independence Day/);
    assert.match(salonStatusLabel(status, 'hi'), /अवकाश/);
    assert.match(salonStatusLabel(status, 'hi'), /स्वतंत्रता दिवस/);
  });

  await test('before opening is Opens at [time]', () => {
    const status = resolveSalonStatus(base, THU_BEFORE);
    assert.equal(status.kind, 'opens_at');
    assert.equal(salonStatusLabel(status, 'en'), 'Opens at 10:00 AM');
    assert.equal(salonStatusLabel(status, 'hi'), '10:00 AM बजे खुलेगा');
  });

  await test('30-minute window is Closing Soon (Thu 19:40, close 20:00)', () => {
    const status = resolveSalonStatus(base, THU_SOON);
    assert.equal(status.kind, 'closing_soon');
    assert.equal(salonStatusLabel(status, 'en'), 'Closing Soon');
    assert.equal(salonStatusLabel(status, 'hi'), 'जल्द बंद होगा');
  });

  await test('after closing is Closed', () => {
    const status = resolveSalonStatus(base, THU_AFTER);
    assert.equal(status.kind, 'closed');
    assert.equal(salonStatusLabel(status, 'en'), 'Closed');
  });

  await test('12h openingHours strings still resolve Open Now', () => {
    const status = resolveSalonStatus({
      openingHours: weekHours({
        thursday: { open: true, startTime: '09:00 AM', endTime: '08:00 PM' },
      }),
      holidays: [],
    }, THU_OPEN);
    assert.equal(status.kind, 'open');
  });
}

section('Dated announcements (no DOM)');
{
  const data = richData('barber_mens_grooming');

  await test('active in-window announcement is live; expired and inactive are not', () => {
    assert.equal(announcementIsLive(data.announcements[0], THU_OPEN, 'barber_mens_grooming'), true);
    assert.equal(announcementIsLive(data.announcements[1], THU_OPEN, 'barber_mens_grooming'), false);
    assert.equal(announcementIsLive(data.announcements[2], THU_OPEN, 'barber_mens_grooming'), false);
    const picked = pickDatedAnnouncement(data, 'barber_mens_grooming', THU_OPEN);
    assert.equal(picked?.id, 'ann-live');
  });

  await test('expired announcement automatically stops displaying', () => {
    const visible = resolveVisibleAnnouncement(data, 'barber_mens_grooming', 'en', THU_OPEN, {
      announceDefault: 'DEFAULT COPY',
      announceBadge: 'This week',
    });
    assert.equal(visible.source, 'dated');
    assert.equal(visible.message, 'Rakhi week live offer');
    assert.doesNotMatch(visible.message, /EXPIRED/);
    assert.doesNotMatch(visible.message, /INACTIVE/);
  });

  await test('theme-scoped announcement only matches that theme', () => {
    const scoped = {
      ...data,
      announcements: [{
        id: 'ann-nail-only',
        kind: 'custom',
        status: 'active',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        themeId: 'nail_lash_studio',
        message: 'NAIL ONLY CHROME WEEK',
        badge: 'Edit',
      }],
    };
    assert.equal(pickDatedAnnouncement(scoped, 'nail_lash_studio', THU_OPEN)?.id, 'ann-nail-only');
    assert.equal(pickDatedAnnouncement(scoped, 'barber_mens_grooming', THU_OPEN), null);
    const barberFallback = resolveVisibleAnnouncement(scoped, 'barber_mens_grooming', 'en', THU_OPEN, {
      announceDefault: 'DEFAULT COPY',
      announceBadge: 'This week',
    });
    assert.notEqual(barberFallback.message, 'NAIL ONLY CHROME WEEK');
  });

  await test('important outranks festival when both are live', () => {
    const both = {
      announcements: [
        { id: 'f', kind: 'festival', status: 'active', startDate: '2026-08-01', endDate: '2026-08-20', message: 'FESTIVAL' },
        { id: 'i', kind: 'important', status: 'active', startDate: '2026-08-01', endDate: '2026-08-20', message: 'IMPORTANT' },
      ],
    };
    assert.equal(pickDatedAnnouncement(both, 'barber_mens_grooming', THU_OPEN)?.id, 'i');
  });

  await test('English / Hindi copy and CTA come from the dated row', () => {
    const en = resolveVisibleAnnouncement(data, 'barber_mens_grooming', 'en', THU_OPEN);
    const hi = resolveVisibleAnnouncement(data, 'barber_mens_grooming', 'hi', THU_OPEN);
    assert.equal(en.message, 'Rakhi week live offer');
    assert.equal(hi.message, 'राखी सप्ताह लाइव ऑफ़र');
    assert.equal(hi.badge, 'त्योहार');
    assert.equal(hi.ctaLabel, 'अभी बुक करें');
    assert.equal(en.ctaTarget, 'booking');
  });

  await test('when nothing dated is live, offer / package then default copy is used', () => {
    const empty = { ...data, announcements: data.announcements.filter((a) => a.id !== 'ann-live') };
    const offer = resolveVisibleAnnouncement(empty, 'barber_mens_grooming', 'en', THU_OPEN, {
      announceDefault: 'DEFAULT COPY',
      announceBadge: 'This week',
    });
    assert.equal(offer.source, 'offer');
    assert.equal(offer.message, 'Festive Combo');
    const bare = resolveVisibleAnnouncement({ ...empty, packages: [], offers: [] }, 'barber_mens_grooming', 'en', THU_OPEN, {
      announceDefault: 'DEFAULT COPY',
      announceBadge: 'This week',
    });
    assert.equal(bare.source, 'default');
    assert.equal(bare.message, 'DEFAULT COPY');
  });
}

/* ================= RENDERERS ============================================ */

for (const config of CASES) {
  for (const mode of ['desktop', 'mobile']) {
    section(`${config.label} — ${mode}`);
    cleanup();
    window.localStorage.clear();
    setSalonClockForTests(THU_OPEN);
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode }));

    await test('keeps the Phase 10.1 header and 10.4 footer', () => {
      assert.ok(utils.getByTestId('site-header'));
      assert.equal(utils.getByTestId('site-header').dataset.theme, config.id);
      assert.ok(utils.getByTestId('site-footer'));
      assert.equal(utils.getByTestId('site-footer').dataset.theme, config.id);
    });

    await test('announcement section always exists and is themed', () => {
      const bar = utils.getByTestId('site-announcement-bar');
      assert.equal(bar.getAttribute('data-site-section'), 'announcement');
      assert.equal(bar.id, 'section-announcement');
      assert.equal(bar.dataset.theme, config.id);
      assert.ok(utils.getByTestId('site-announcement-message').textContent.includes('Rakhi week live offer'));
      assert.ok(utils.getByTestId('site-announcement-badge'));
      assert.ok(utils.getByTestId('site-announcement-cta'));
      assert.doesNotMatch(bar.textContent, /EXPIRED WINTER NIGHTS MUST HIDE/);
      assert.doesNotMatch(bar.textContent, /INACTIVE RENOVATION MUST HIDE/);
    });

    await test('live status appears in the announcement area and the contact hours card', () => {
      const chips = utils.getAllByTestId('site-salon-status');
      const placements = chips.map((el) => el.dataset.placement);
      assert.ok(placements.includes('announcement'), `missing announcement status: ${placements.join(',')}`);
      assert.ok(placements.includes('contact'), `missing contact status: ${placements.join(',')}`);
      assert.ok(chips.every((el) => el.dataset.status === 'open'));
      assert.ok(chips[0].textContent.includes('Open Now'));
    });

    cleanup();
  }
}

section('Clock-driven UI (Barber desktop)');
{
  cleanup();
  window.localStorage.clear();

  await test('Closed Today on the weekly holiday', async () => {
    setSalonClockForTests(SUN_CLOSED);
    const utils = render(React.createElement(Barber, { data: richData('barber_mens_grooming'), mode: 'desktop' }));
    const chip = utils.getAllByTestId('site-salon-status')[0];
    assert.equal(chip.dataset.status, 'closed_today');
    assert.match(chip.textContent, /Closed Today/);
    cleanup();
  });

  await test('Holiday on Independence Day', async () => {
    setSalonClockForTests(SAT_HOLIDAY);
    const utils = render(React.createElement(Barber, { data: richData('barber_mens_grooming'), mode: 'desktop' }));
    const chip = utils.getAllByTestId('site-salon-status')[0];
    assert.equal(chip.dataset.status, 'holiday');
    assert.match(chip.textContent, /Independence Day/);
    cleanup();
  });

  await test('Opens at [time] before the shop unlocks', async () => {
    setSalonClockForTests(THU_BEFORE);
    const utils = render(React.createElement(Barber, { data: richData('barber_mens_grooming'), mode: 'desktop' }));
    const chip = utils.getAllByTestId('site-salon-status')[0];
    assert.equal(chip.dataset.status, 'opens_at');
    assert.match(chip.textContent, /Opens at 10:00 AM/);
    cleanup();
  });

  await test('Closing Soon in the last 30 minutes', async () => {
    setSalonClockForTests(THU_SOON);
    const utils = render(React.createElement(Barber, { data: richData('barber_mens_grooming'), mode: 'desktop' }));
    const chip = utils.getAllByTestId('site-salon-status')[0];
    assert.equal(chip.dataset.status, 'closing_soon');
    assert.match(chip.textContent, /Closing Soon/);
    cleanup();
  });

  await test('status updates automatically when the injected clock advances', async () => {
    setSalonClockForTests(THU_OPEN);
    const utils = render(React.createElement(Barber, { data: richData('barber_mens_grooming'), mode: 'desktop' }));
    assert.equal(utils.getAllByTestId('site-salon-status')[0].dataset.status, 'open');
    await act(async () => { setSalonClockForTests(THU_SOON); });
    assert.equal(utils.getAllByTestId('site-salon-status')[0].dataset.status, 'closing_soon');
    cleanup();
  });
}

section('English / Hindi + light / dark');
{
  cleanup();
  window.localStorage.clear();
  setSalonClockForTests(THU_OPEN);
  const utils = render(React.createElement(HairStudio, { data: richData('hair_studio_color_bar'), mode: 'desktop' }));

  await test('Hindi flips announcement copy and status label', async () => {
    assert.ok(utils.getByTestId('site-announcement-message').textContent.includes('Rakhi week live offer'));
    await act(async () => { fireEvent.click(utils.getByTestId('site-header-lang-hi')); });
    assert.ok(utils.getByTestId('site-announcement-message').textContent.includes('राखी सप्ताह लाइव ऑफ़र'));
    assert.ok(utils.getByTestId('site-announcement-badge').textContent.includes('त्योहार'));
    assert.ok(utils.getAllByTestId('site-salon-status')[0].textContent.includes('अभी खुला है'));
    await act(async () => { fireEvent.click(utils.getByTestId('site-header-lang-en')); });
    assert.ok(utils.getByTestId('site-announcement-message').textContent.includes('Rakhi week live offer'));
  });

  await test('dark mode restyles the hair-studio announcement strip', async () => {
    const bgOf = (el) => (el?.getAttribute('style') || '').match(/background-color:\s*([^;]+)/i)?.[1]?.trim() || null;
    const canon = (color) => {
      if (!color) return color;
      const probe = document.createElement('div');
      probe.style.backgroundColor = color;
      return probe.style.backgroundColor || color;
    };
    const lightBg = bgOf(utils.getByTestId('site-announcement-bar'));
    assert.ok(lightBg);
    await act(async () => { fireEvent.click(utils.getByTestId('site-header-dark-toggle')); });
    assert.equal(utils.getByTestId('site-header').dataset.appearance, 'dark');
    const darkToken = surfacesOf(HAIR_STUDIO_SURFACES, 'dark').paperDeep;
    const darkBg = bgOf(utils.getByTestId('site-announcement-bar'));
    assert.equal(darkBg, canon(darkToken), `expected paperDeep ${darkToken} (${canon(darkToken)}), got ${darkBg}`);
    assert.notEqual(darkBg, lightBg);
  });

  cleanup();
}

section('Theme-scoped announcement + expired hide (renderers)');
{
  const scoped = (id) => richData(id, {
    announcements: [{
      id: 'ann-nail-only',
      kind: 'custom',
      status: 'active',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      themeId: 'nail_lash_studio',
      message: 'NAIL ONLY CHROME WEEK',
      badge: 'Edit',
    }],
  });

  await test('nail-only announcement appears on Nail and not on Barber', () => {
    setSalonClockForTests(THU_OPEN);
    cleanup();
    const nail = render(React.createElement(NailLash, { data: scoped('nail_lash_studio'), mode: 'desktop' }));
    assert.ok(nail.getByTestId('site-announcement-message').textContent.includes('NAIL ONLY CHROME WEEK'));
    cleanup();
    const barber = render(React.createElement(Barber, { data: scoped('barber_mens_grooming'), mode: 'desktop' }));
    assert.doesNotMatch(barber.getByTestId('site-announcement-message').textContent, /NAIL ONLY CHROME WEEK/);
    cleanup();
  });

  await test('expired-only list falls back and never prints the expired copy', () => {
    const expired = richData('family_full_service', {
      announcements: [{
        id: 'ann-expired-only',
        kind: 'seasonal',
        status: 'active',
        startDate: '2026-01-01',
        endDate: '2026-01-15',
        message: 'EXPIRED WINTER NIGHTS MUST HIDE',
      }],
    });
    cleanup();
    const utils = render(React.createElement(Family, { data: expired, mode: 'desktop' }));
    const text = utils.getByTestId('site-announcement-message').textContent;
    assert.doesNotMatch(text, /EXPIRED WINTER NIGHTS MUST HIDE/);
    assert.ok(text.includes('Festive Combo') || text.length > 0);
    cleanup();
  });
}

section('Booking flow status chip');
{
  cleanup();
  window.localStorage.clear();
  setSalonClockForTests(THU_OPEN);
  const utils = render(React.createElement(BeautySpa, { data: richData('beauty_skin_spa'), mode: 'desktop' }));

  await test('opening the existing booking flow shows a status chip next to the salon name', async () => {
    assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    await act(async () => { fireEvent.click(utils.getByTestId('final-booking-cta')); });
    const flow = utils.getByTestId('site-booking-flow');
    const chip = flow.querySelector('[data-testid="site-salon-status"][data-placement="booking"]');
    assert.ok(chip, 'booking status chip missing');
    assert.equal(chip.dataset.status, 'open');
    assert.match(flow.textContent, /Back to Website/);
    const back = Array.from(flow.querySelectorAll('button')).find((b) => /Back to Website/i.test(b.textContent || ''));
    await act(async () => { fireEvent.click(back); });
    assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
  });

  cleanup();
}

section('Cross-theme announcement visuals');
{
  const signatures = [];
  for (const config of CASES) {
    cleanup();
    setSalonClockForTests(THU_OPEN);
    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode: 'desktop' }));
    const bar = utils.getByTestId('site-announcement-bar');
    signatures.push(`${bar.className}|${bar.getAttribute('style') || ''}`);
    cleanup();
  }
  await test('announcement bars differ pairwise across all five themes', () => {
    assert.equal(new Set(signatures).size, 5, `announcement signatures not distinct: ${signatures.join(' || ')}`);
  });
}

setSalonClockForTests(null);
setSiteLocale('en');
window.localStorage.clear();

console.log('\n────────────────────────────────────────');
console.log(`Phase 10.5 announcement & live status: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}`);
  process.exit(1);
}
console.log('All five themes verified across the Phase 10.5 checklist.');
