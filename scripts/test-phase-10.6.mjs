/**
 * PHASE 10.6 — BOOK APPOINTMENT ENTRY FLOW (five-theme acceptance)
 *
 * Pure engine logic PLUS real five-theme React UI in jsdom:
 *
 *   Service (active theme only, category → service isolated)
 *   Date (opening hours + holidays + booking window)
 *   Time slots (only available shown, past/taken disabled)
 *   Customer details (name, mobile, optional email/notes, validation)
 *   Booking summary (before confirmation; NO payment / NO final confirm)
 *
 * Also: double-booking prevention via slot holds, EN/HI via the existing
 * language system, light/dark via the existing surfaces, per-theme visuals,
 * selection preserved while moving between steps, and the existing
 * SiteBookingHost wiring on every theme (one booking architecture).
 *
 * Phase 10.1–10.5 files/behaviour are untouched by this suite; it only
 * exercises the new entry flow plus the pre-existing open/close events.
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
const BeautySpa = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const Family = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const HairStudio = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;
const SiteBookingFlow = (await import('../src/components/SiteBookingFlow.tsx')).default;
const { initialData } = await import('../src/types.ts');
const {
  setSalonClockForTests,
  salonNow,
} = await import('../src/lib/salonStatus.ts');
const {
  setSiteAppearance,
  setSiteLocale,
} = await import('../src/lib/siteNavigation.ts');
const {
  SITE_BOOKING_EVENT,
  SITE_BOOKING_CLOSE_EVENT,
} = await import('../src/lib/siteBooking.ts');
const { bookingFlowText } = await import('../src/lib/siteBookingI18n.ts');
const {
  bookingServicesForTheme,
  bookingServicesByCategory,
  parsedBookingRules,
  parseDurationToMinutes,
  bookingSlotIntervalMinutes,
  bookingDayInfo,
  bookingDayList,
  bookingWindowDateKeys,
  bookingSlotsForDay,
  bookingSlotIsStillAvailable,
  reserveBookingSlot,
  releaseBookingSlot,
  activeBookingHolds,
  setBookingHoldsForTests,
  validateBookingCustomer,
} = await import('../src/lib/siteBookingFlow.ts');

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

/** Thursday 2026-08-13 11:00 IST — an open, non-holiday day. */
const THU_OPEN = at(2026, 8, 13, 11, 0);
/** Friday 2026-08-14 — open day right after today. */
const FRI = at(2026, 8, 14, 11, 0);
/** Thursday 2026-08-13 21:00 — after the 20:00 close. */
const THU_AFTER_CLOSE = at(2026, 8, 13, 21, 0);

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

const THEMES = [
  { id: 'barber_mens_grooming', Component: Barber },
  { id: 'hair_studio_color_bar', Component: HairStudio },
  { id: 'beauty_skin_spa', Component: BeautySpa },
  { id: 'family_full_service', Component: Family },
  { id: 'nail_lash_studio', Component: NailLash },
];

/** Three active theme services + one foreign-theme + one inactive. */
function themeServices(themeId) {
  return [
    {
      id: `${themeId}-svc-1`, name: 'Signature Treatment', category: 'Haircuts',
      description: 'Signature service description.', price: 800, duration: 60,
      themeId, status: 'active',
    },
    {
      id: `${themeId}-svc-2`, name: 'Deep Ritual', category: 'Grooming & Treatments',
      description: 'Ritual service description.', price: 1500, duration: 90,
      themeId, status: 'active',
    },
    {
      id: `${themeId}-svc-3`, name: 'Express Refresh', category: 'Haircuts',
      description: 'Express service description.', price: 400, duration: 30,
      themeId, status: 'active',
    },
    {
      id: `foreign-${themeId}`, name: 'Foreign Theme Service', category: 'Foreign',
      description: 'Must never appear.', price: 9999, duration: 60,
      themeId: 'some_other_theme', status: 'active',
    },
    {
      id: `${themeId}-svc-inactive`, name: 'Hidden Service', category: 'Haircuts',
      description: 'Inactive row.', price: 100, duration: 30,
      themeId, status: 'inactive',
    },
  ];
}

function richData(themeId, extras = {}) {
  return {
    ...initialData,
    templateId: themeId,
    salonName: `${themeId} Test Salon`,
    tagline: 'Booking entry flow under test',
    about: 'Booking entry flow test salon.',
    ownerName: 'Test Owner',
    email: 'hello@booking.test',
    phone: '+91 99999 00000',
    whatsappPhone: '+91 99999 00000',
    contactOptions: { callNow: true, whatsapp: true, bookNow: true },
    openingHours: weekHours(),
    holidays: HOLIDAYS,
    bookingRules: {
      minNotice: '1 hour',
      maxAdvance: '30 days',
      bufferTime: 'No buffer',
      allowStaffSelection: true,
      advanceDepositPercentage: 25,
    },
    services: themeServices(themeId),
    offers: [],
    ...extras,
  };
}

/** Renders the entry flow for one theme with a clean environment. */
function renderFlow(themeId, extras = {}) {
  const toasts = [];
  const utils = render(
    React.createElement(SiteBookingFlow, {
      themeId,
      data: richData(themeId, extras.data || {}),
      onBackToWebsite: () => {},
      // PHASE 16.9 — typed notices; the harness keeps the message text.
      onShowToast: (msg) => toasts.push(typeof msg === 'string' ? msg : msg.message),
    }),
  );
  return { utils, toasts };
}

/** Walks service (default) → date → time → details → summary. */
async function walkToStep(target, utils) {
  const flow = utils.getByTestId('booking-flow');
  // PHASE 16.1 — the flow gained a leading `salon` confirmation step.
  const steps = ['salon', 'service', 'date', 'time', 'details', 'summary'];
  while (flow.dataset.step !== target && steps.indexOf(flow.dataset.step) < steps.indexOf(target)) {
    const btn = utils.getByTestId('booking-continue');
    assert.equal(btn.disabled, false, `Continue disabled on ${flow.dataset.step}`);
    await act(async () => { fireEvent.click(btn); });
  }
  assert.equal(flow.dataset.step, target, `expected step ${target}, got ${flow.dataset.step}`);
}

/* ================================================================== */
/* A · ENGINE — active-theme services & booking rules                  */
/* ================================================================== */
section('Engine — active theme service list & booking rules');
{
  for (const theme of THEMES) {
    await test(`${theme.id}: service list is theme-isolated, active-only, order-preserved`, () => {
      const list = bookingServicesForTheme(richData(theme.id), theme.id);
      assert.deepEqual(list.map((s) => s.id), [
        `${theme.id}-svc-1`,
        `${theme.id}-svc-2`,
        `${theme.id}-svc-3`,
      ]);
      assert.ok(!list.some((s) => s.themeId && s.themeId !== theme.id));
      assert.ok(!list.some((s) => s.status === 'inactive'));
    });

    await test(`${theme.id}: category grouping keeps category → service mapping`, () => {
      const groups = bookingServicesByCategory(bookingServicesForTheme(richData(theme.id), theme.id));
      assert.deepEqual(groups.map((g) => g.category), ['Haircuts', 'Grooming & Treatments']);
      assert.deepEqual(groups[0].services.map((s) => s.id), [`${theme.id}-svc-1`, `${theme.id}-svc-3`]);
      assert.deepEqual(groups[1].services.map((s) => s.id), [`${theme.id}-svc-2`]);
    });
  }

  await test('parsedBookingRules falls back to safe defaults', () => {
    const rules = parsedBookingRules({ bookingRules: undefined });
    assert.deepEqual(rules, { minNoticeMinutes: 60, maxAdvanceDays: 30, bufferMinutes: 0 });
  });

  await test('parsedBookingRules reads minNotice / maxAdvance / buffer', () => {
    const rules = parsedBookingRules({
      bookingRules: { minNotice: '2 hours', maxAdvance: '7 days', bufferTime: '15 minutes' },
    });
    assert.deepEqual(rules, { minNoticeMinutes: 120, maxAdvanceDays: 7, bufferMinutes: 15 });
  });

  await test('parseDurationToMinutes handles hour/day/buffer shapes', () => {
    assert.equal(parseDurationToMinutes('1 hour'), 60);
    assert.equal(parseDurationToMinutes('30 days'), 30 * 24 * 60);
    assert.equal(parseDurationToMinutes('45 min'), 45);
    assert.equal(parseDurationToMinutes('No buffer'), 0);
    assert.equal(parseDurationToMinutes(''), null);
  });

  await test('slot interval: 30-min grid, buffer added, capped at 120', () => {
    const data = { bookingRules: { bufferTime: 'No buffer' } };
    assert.equal(bookingSlotIntervalMinutes({ duration: 30 }, data), 30);
    assert.equal(bookingSlotIntervalMinutes({ duration: 45 }, data), 60);
    assert.equal(bookingSlotIntervalMinutes({ duration: 60 }, data), 60);
    assert.equal(bookingSlotIntervalMinutes({ duration: 200 }, data), 120);
    const buffered = { bookingRules: { bufferTime: '15 minutes' } };
    assert.equal(bookingSlotIntervalMinutes({ duration: 60 }, buffered), 90);
  });
}

/* ================================================================== */
/* B · ENGINE — dates respect hours, holidays & the booking window     */
/* ================================================================== */
section('Engine — date picker respects opening hours & holidays');
{
  const data = richData('barber_mens_grooming');

  await test('holiday day is not selectable and carries the holiday name', () => {
    const info = bookingDayInfo(data, at(2026, 8, 15, 11, 0), THU_OPEN);
    assert.equal(info.selectable, false);
    assert.equal(info.reason, 'holiday');
    assert.equal(info.holiday.name, 'Independence Day');
  });

  await test('weekly closed Sunday is not selectable', () => {
    const info = bookingDayInfo(data, at(2026, 8, 16, 11, 0), THU_OPEN);
    assert.equal(info.selectable, false);
    assert.equal(info.reason, 'closed');
  });

  await test('today during opening hours is selectable', () => {
    const info = bookingDayInfo(data, at(2026, 8, 13, 11, 0), THU_OPEN);
    assert.equal(info.selectable, true);
    assert.equal(info.isToday, true);
    assert.equal(info.openLabel, '10:00 AM');
    assert.equal(info.closeLabel, '08:00 PM');
  });

  await test('today after closing time is not selectable', () => {
    const info = bookingDayInfo(data, at(2026, 8, 13, 21, 0), THU_AFTER_CLOSE);
    assert.equal(info.selectable, false);
    assert.equal(info.reason, 'past');
  });

  await test('dates beyond maxAdvance are outside the window', () => {
    const short = richData('barber_mens_grooming', {
      bookingRules: { minNotice: '1 hour', maxAdvance: '3 days', bufferTime: 'No buffer' },
    });
    const info = bookingDayInfo(short, at(2026, 8, 20, 11, 0), THU_OPEN);
    assert.equal(info.selectable, false);
    assert.equal(info.reason, 'outside-window');
    assert.equal(bookingWindowDateKeys(short, THU_OPEN).has('2026-08-13'), true);
    assert.equal(bookingWindowDateKeys(short, THU_OPEN).has('2026-08-15'), true);
    assert.equal(bookingWindowDateKeys(short, THU_OPEN).has('2026-08-16'), false);
  });

  await test('day list renders today first and stays local (no UTC shift)', () => {
    const days = bookingDayList(data, 14, THU_OPEN);
    assert.equal(days.length, 14);
    assert.equal(days[0].dateKey, '2026-08-13');
    assert.equal(days[1].dateKey, '2026-08-14');
  });
}

/* ================================================================== */
/* C · ENGINE — slots only available within hours; past disabled       */
/* ================================================================== */
section('Engine — time slots respect hours, notice & service duration');
{
  const data = richData('barber_mens_grooming');
  const svc60 = { id: 'barber_mens_grooming-svc-1', duration: 60 };

  await test('closed / holiday days produce no slots', () => {
    assert.equal(bookingSlotsForDay(data, 'barber_mens_grooming', svc60, at(2026, 8, 16, 11, 0), THU_OPEN).length, 0);
    assert.equal(bookingSlotsForDay(data, 'barber_mens_grooming', svc60, at(2026, 8, 15, 11, 0), THU_OPEN).length, 0);
  });

  await test('slots never start before open or run past close', () => {
    const slots = bookingSlotsForDay(data, 'barber_mens_grooming', svc60, at(2026, 8, 14, 11, 0), THU_OPEN);
    assert.equal(slots.length, 10);
    for (const slot of slots) {
      assert.ok(slot.minutes >= 600, `slot starts before opening: ${slot.startLabel}`);
      assert.ok(slot.minutes + 60 <= 1200, `slot runs past closing: ${slot.startLabel}`);
    }
    assert.equal(slots[0].startLabel, '10:00 AM');
    assert.equal(slots[slots.length - 1].startLabel, '07:00 PM');
    assert.ok(slots.every((s) => s.state === 'available'));
  });

  await test('today: started + minimum-notice slots are past, the rest available', () => {
    const slots = bookingSlotsForDay(data, 'barber_mens_grooming', svc60, at(2026, 8, 13, 11, 0), THU_OPEN);
    assert.equal(slots[0].minutes, 600);
    assert.equal(slots[0].state, 'past');
    assert.equal(slots[1].minutes, 660);
    assert.equal(slots[1].state, 'past');
    assert.equal(slots[2].minutes, 720);
    assert.equal(slots[2].state, 'available');
    assert.ok(slots.slice(2).every((s) => s.state === 'available'));
  });

  await test('today after close: no slots remain', () => {
    const slots = bookingSlotsForDay(data, 'barber_mens_grooming', svc60, at(2026, 8, 13, 21, 0), THU_AFTER_CLOSE);
    assert.equal(slots.length, 0);
  });

  await test('longer service consumes the closing boundary', () => {
    const slots = bookingSlotsForDay(data, 'barber_mens_grooming', { id: 'long', duration: 180 }, at(2026, 8, 14, 11, 0), THU_OPEN);
    assert.ok(slots.every((s) => s.minutes + 180 <= 1200));
    assert.equal(slots[slots.length - 1].minutes, 960); // 04:00 PM
  });
}

/* ================================================================== */
/* D · ENGINE — holds prevent double-booking                           */
/* ================================================================== */
section('Engine — double-booking prevention');
{
  const data = richData('barber_mens_grooming');
  const themeId = 'barber_mens_grooming';
  const svc = { id: 'svc-a', duration: 60 };
  const foreign = (start, end, key) => ({
    key: key || `f-${start}`,
    browserId: 'other-browser',
    themeId,
    serviceId: svc.id,
    dateKey: '2026-08-14',
    startMinutes: start,
    endMinutes: end,
    expiresAt: Date.now() + 600_000,
  });

  await test('reserving a free slot succeeds and records a hold', () => {
    setBookingHoldsForTests(null);
    window.localStorage.clear();
    const result = reserveBookingSlot(themeId, svc, '2026-08-14', 600);
    assert.equal(result.ok, true);
    assert.ok(result.hold);
    assert.equal(activeBookingHolds().length, 1);
    releaseBookingSlot(result.hold.key);
    assert.equal(activeBookingHolds().length, 0);
  });

  await test('an overlapping foreign hold blocks the slot', () => {
    setBookingHoldsForTests([foreign(630, 690)]);
    const result = reserveBookingSlot(themeId, svc, '2026-08-14', 600);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'taken');
  });

  await test('a foreign hold on the exact slot blocks it', () => {
    setBookingHoldsForTests([foreign(600, 660)]);
    const result = reserveBookingSlot(themeId, svc, '2026-08-14', 600);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'taken');
  });

  await test('same browser re-reserving its own slot refreshes (idempotent)', () => {
    setBookingHoldsForTests(null);
    window.localStorage.clear();
    const first = reserveBookingSlot(themeId, svc, '2026-08-14', 720);
    assert.equal(first.ok, true);
    const second = reserveBookingSlot(themeId, svc, '2026-08-14', 720);
    assert.equal(second.ok, true);
    assert.equal(second.hold.key, first.hold.key);
    assert.equal(activeBookingHolds().length, 1);
    releaseBookingSlot(first.hold.key);
  });

  await test('expired holds no longer block a slot', () => {
    setBookingHoldsForTests([{ ...foreign(600, 660), expiresAt: Date.now() - 1000 }]);
    const result = reserveBookingSlot(themeId, svc, '2026-08-14', 600);
    assert.equal(result.ok, true);
    releaseBookingSlot(result.hold.key);
  });

  await test('holds on other themes/days/services never conflict', () => {
    setBookingHoldsForTests(null);
    window.localStorage.clear();
    const other = {
      key: 'o-1', browserId: 'other-browser', themeId: 'hair_studio_color_bar',
      serviceId: 'svc-a', dateKey: '2026-08-14', startMinutes: 600, endMinutes: 660,
      expiresAt: Date.now() + 600_000,
    };
    setBookingHoldsForTests([other]);
    const result = reserveBookingSlot(themeId, svc, '2026-08-14', 600);
    assert.equal(result.ok, true, 'different theme must not conflict');
    releaseBookingSlot(result.hold.key);
    setBookingHoldsForTests([{ ...other, themeId, dateKey: '2026-08-13' }]);
    const otherDay = reserveBookingSlot(themeId, svc, '2026-08-14', 600);
    assert.equal(otherDay.ok, true, 'different day must not conflict');
    releaseBookingSlot(otherDay.hold.key);
  });

  await test('taken slot surfaces as taken in the slot grid', () => {
    setBookingHoldsForTests([foreign(720, 780)]);
    const slots = bookingSlotsForDay(data, themeId, svc, at(2026, 8, 14, 11, 0), THU_OPEN);
    const taken = slots.find((s) => s.minutes === 720);
    assert.equal(taken.state, 'taken');
    assert.ok(slots.filter((s) => s.minutes !== 720).every((s) => s.state === 'available'));
    setBookingHoldsForTests(null);
    window.localStorage.clear();
  });

  await test('slot still available check respects holds', () => {
    setBookingHoldsForTests([foreign(720, 780)]);
    assert.equal(bookingSlotIsStillAvailable(data, themeId, svc, at(2026, 8, 14, 11, 0), 720, THU_OPEN), false);
    assert.equal(bookingSlotIsStillAvailable(data, themeId, svc, at(2026, 8, 14, 11, 0), 600, THU_OPEN), true);
    setBookingHoldsForTests(null);
    window.localStorage.clear();
  });
}

/* ================================================================== */
/* E · ENGINE — customer detail validation                             */
/* ================================================================== */
section('Engine — customer details validation');
{
  await test('name and mobile are required, email/notes optional', () => {
    assert.deepEqual(validateBookingCustomer({ name: '', mobile: '', email: '', notes: '' }), {
      name: true,
      mobile: true,
    });
    assert.deepEqual(validateBookingCustomer({ name: 'Asha Verma', mobile: '+91 98765 43210', email: '', notes: 'Window seat' }), {});
  });

  await test('mobile accepts 10–13 digits and rejects junk', () => {
    assert.ok(!validateBookingCustomer({ name: 'Asha Verma', mobile: '9876543210', email: '' }).mobile);
    assert.ok(!validateBookingCustomer({ name: 'Asha Verma', mobile: '+91 98765 43210', email: '' }).mobile);
    assert.ok(validateBookingCustomer({ name: 'Asha Verma', mobile: '12345', email: '' }).mobile);
    assert.ok(validateBookingCustomer({ name: 'Asha Verma', mobile: 'abcdefghij', email: '' }).mobile);
  });

  await test('email is validated only when provided', () => {
    assert.ok(!validateBookingCustomer({ name: 'Asha Verma', mobile: '9876543210', email: '' }).email);
    assert.ok(!validateBookingCustomer({ name: 'Asha Verma', mobile: '9876543210', email: 'a@b.co' }).email);
    assert.ok(validateBookingCustomer({ name: 'Asha Verma', mobile: '9876543210', email: 'not-an-email' }).email);
  });
}

/* ================================================================== */
/* F · UI — full Service → Date → Time → Details → Summary per theme   */
/* ================================================================== */
section('UI — five-theme entry-flow journey');
{
  for (const theme of THEMES) {
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
    setSiteLocale('en');
    setSalonClockForTests(THU_OPEN);

    const { utils, toasts } = renderFlow(theme.id);

    await test(`${theme.id}: flow mounts with themed frame + six steps (salon first)`, () => {
      const flow = utils.getByTestId('booking-flow');
      assert.equal(flow.dataset.theme, theme.id);
      // PHASE 16.1 — a plain open starts on the salon confirmation step.
      assert.equal(flow.dataset.step, 'salon');
      assert.equal(flow.dataset.locale, 'en');
      assert.equal(utils.getByTestId('booking-stepper').querySelectorAll('[data-testid^="booking-step-"]').length, 6);
      assert.ok(utils.getByTestId('booking-close'));
      // The salon card confirms the ACTIVE salon — never a foreign one.
      const salonCard = utils.getByTestId('booking-salon-card');
      assert.equal(salonCard.dataset.themeId, theme.id);
      assert.ok(salonCard.textContent.includes(`${theme.id} Test Salon`), 'salon name missing on the salon step');
      assert.ok(utils.getByTestId('booking-salon-ready'));
    });

    await test(`${theme.id}: continue moves salon → service`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
      assert.equal(utils.getByTestId('booking-flow').dataset.step, 'service');
    });

    await test(`${theme.id}: only ACTIVE-theme services list, with price + duration`, () => {
      assert.ok(utils.getByTestId(`booking-service-${theme.id}-svc-1`));
      assert.ok(utils.getByTestId(`booking-service-${theme.id}-svc-2`));
      assert.ok(utils.getByTestId(`booking-service-${theme.id}-svc-3`));
      assert.equal(utils.queryByTestId(`booking-service-foreign-${theme.id}`), null, 'foreign theme service leaked in');
      assert.equal(utils.queryByTestId(`booking-service-${theme.id}-svc-inactive`), null, 'inactive service leaked in');
      const flowText = utils.getByTestId('booking-flow').textContent;
      assert.ok(flowText.includes('₹800'), 'price missing');
      assert.ok(flowText.includes('60 min'), 'duration missing');
      assert.ok(flowText.includes('₹1,500'));
      assert.ok(flowText.includes('90 min'));
    });

    await test(`${theme.id}: category filter stays inside the active theme`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('booking-category-Grooming & Treatments')); });
      assert.equal(utils.getByTestId('booking-flow').querySelector('[data-testid^="booking-service-"]'), utils.getByTestId(`booking-service-${theme.id}-svc-2`));
      assert.equal(utils.queryByTestId(`booking-service-${theme.id}-svc-1`), null);
      await act(async () => { fireEvent.click(utils.getByTestId('booking-category-all')); });
      assert.ok(utils.getByTestId(`booking-service-${theme.id}-svc-1`));
    });

    await test(`${theme.id}: date step disables holiday & closed days, enables open days`, async () => {
      await walkToStep('date', utils);
      const holiday = utils.getByTestId('booking-date-2026-08-15');
      assert.equal(holiday.dataset.dateSelectable, 'false');
      assert.equal(holiday.dataset.dateReason, 'holiday');
      assert.ok(holiday.textContent.includes('Independence Day'));
      assert.equal(utils.getByTestId('booking-date-2026-08-16').dataset.dateSelectable, 'false');
      assert.equal(utils.getByTestId('booking-date-2026-08-13').dataset.dateSelectable, 'true');
      assert.equal(utils.getByTestId('booking-date-2026-08-14').dataset.dateSelectable, 'true');
    });

    await test(`${theme.id}: picking Friday 14 Aug → time step shows only open-hour slots`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
      assert.equal(utils.getByTestId('booking-date-2026-08-14').dataset.selected, 'true');
      await walkToStep('time', utils);
      const slots = utils.getByTestId('booking-flow').querySelectorAll('[data-testid^="booking-slot-"]');
      assert.equal(slots.length, 10);
      for (const node of slots) {
        const minutes = Number(node.dataset.testid.replace('booking-slot-', ''));
        assert.ok(minutes >= 600 && minutes + 60 <= 1200, `slot outside opening hours: ${minutes}`);
      }
      // entering the time step auto-held the first available slot
      assert.equal(utils.getByTestId('booking-slot-600').dataset.slotState, 'held');
      assert.equal(utils.getByTestId('booking-slot-600').dataset.selected, 'true');
    });

    await test(`${theme.id}: choosing 01:00 PM → details step validates name + mobile`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('booking-slot-780')); });
      assert.equal(utils.getByTestId('booking-slot-780').dataset.selected, 'true');
      assert.equal(utils.getByTestId('booking-slot-780').dataset.slotState, 'held');
      await walkToStep('details', utils);
      assert.equal(utils.getByTestId('booking-continue').disabled, true, 'details continue must be gated');
      await act(async () => {
        fireEvent.change(utils.getByTestId('booking-input-name'), { target: { value: 'Asha Verma' } });
      });
      await act(async () => {
        fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '+91 98765 43210' } });
      });
      assert.equal(utils.getByTestId('booking-continue').disabled, false);
      // email + notes stay optional
      await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
      assert.equal(utils.getByTestId('booking-flow').dataset.step, 'summary');
    });

    await test(`${theme.id}: summary shows service, date, time, customer & price before confirmation`, () => {
      const text = utils.getByTestId('booking-flow').textContent;
      assert.ok(text.includes('Signature Treatment'), 'service name missing');
      assert.ok(text.includes('Friday'), 'date missing');
      assert.ok(text.includes('01:00 PM'), 'time missing');
      assert.ok(text.includes('Asha Verma'), 'customer name missing');
      assert.ok(text.includes('98765 43210'), 'mobile missing');
      assert.ok(text.includes('₹800'), 'price missing');
      assert.ok(text.includes('Haircuts'), 'category missing');
      assert.ok(text.includes('60 min'), 'duration missing');
      assert.ok(utils.getByTestId('booking-confirm'), 'confirm control missing');
      assert.ok(text.includes('Payment & final confirmation unlock in the next phase.'));
    });

    await test(`${theme.id}: confirm stops at the summary (no payment / no receipt yet)`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
      assert.equal(utils.getByTestId('booking-flow').dataset.step, 'summary', 'must not advance past the summary');
      assert.equal(toasts.length, 1);
      assert.ok(toasts[0].includes('next phase'));
    });

    await test(`${theme.id}: selection survives moving back and forward through steps`, async () => {
      await act(async () => { fireEvent.click(utils.getByTestId('booking-step-service')); });
      assert.equal(utils.getByTestId('booking-flow').dataset.step, 'service');
      assert.equal(utils.getByTestId(`booking-service-${theme.id}-svc-1`).dataset.selected, 'true');
      await walkToStep('date', utils);
      assert.equal(utils.getByTestId('booking-date-2026-08-14').dataset.selected, 'true', 'date selection lost');
      await walkToStep('time', utils);
      assert.equal(utils.getByTestId('booking-slot-780').dataset.selected, 'true', 'time selection lost');
      await walkToStep('summary', utils);
      const text = utils.getByTestId('booking-flow').textContent;
      assert.ok(text.includes('Signature Treatment'), 'service selection lost');
      assert.ok(text.includes('Friday'), 'date selection lost');
      assert.ok(text.includes('01:00 PM'), 'time selection lost');
      assert.ok(text.includes('Asha Verma'), 'customer details lost');
    });

    await test(`${theme.id}: mobile-first structure (single column, sticky action bar)`, () => {
      const body = utils.getByTestId('booking-body');
      const bar = utils.getByTestId('booking-back').closest('.booking-action-bar')
        ?? utils.getByTestId('booking-back').parentElement;
      assert.ok(body.className.includes('grid-cols-1'), 'must start single-column (mobile first)');
      assert.ok(body.className.includes('lg:grid-cols-12'), 'desktop summary column missing');
      assert.ok(bar.className.includes('border-t'), 'sticky bottom action bar missing');
      assert.ok(utils.queryByTestId('booking-continue') || utils.queryByTestId('booking-confirm'));
    });

    cleanup();
    setBookingHoldsForTests(null);
    window.localStorage.clear();
  }
}

/* ================================================================== */
/* G · UI — past slots disabled today; foreign holds disable slots     */
/* ================================================================== */
section('UI — unavailable / past slots disabled, double-booking blocked');
{
  cleanup();
  setSalonClockForTests(THU_OPEN);
  setSiteLocale('en');
  const { utils } = renderFlow('barber_mens_grooming');

  await test('today: past + minimum-notice slots are disabled, next one auto-picked', async () => {
    await walkToStep('time', utils);
    const at10 = utils.getByTestId('booking-slot-600');
    const at11 = utils.getByTestId('booking-slot-660');
    const at12 = utils.getByTestId('booking-slot-720');
    assert.equal(at10.dataset.slotState, 'past');
    assert.equal(at10.disabled, true);
    assert.equal(at11.dataset.slotState, 'past');
    assert.equal(at11.disabled, true);
    assert.equal(at12.dataset.slotState, 'held');
    assert.equal(at12.disabled, false);
    assert.equal(at12.dataset.selected, 'true', 'first available slot should be auto-selected');
  });

  await test('foreign hold makes the slot taken + disabled in the UI', async () => {
    setBookingHoldsForTests([{
      key: 'foreign-hold', browserId: 'someone-else', themeId: 'barber_mens_grooming',
      serviceId: 'barber_mens_grooming-svc-1', dateKey: '2026-08-14',
      startMinutes: 720, endMinutes: 780, expiresAt: Date.now() + 600_000,
    }]);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-step-date')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-date-2026-08-14')); });
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    const blocked = utils.getByTestId('booking-slot-720');
    assert.equal(blocked.dataset.slotState, 'taken');
    assert.equal(blocked.disabled, true);
    const fallback = utils.getByTestId('booking-slot-600');
    assert.equal(fallback.dataset.selected, 'true', 'auto-pick must skip the taken slot');
    assert.notEqual(fallback.dataset.slotState, 'taken');
    setBookingHoldsForTests(null);
    window.localStorage.clear();
    cleanup();
  });
}

/* ================================================================== */
/* H · UI — English/Hindi + light/dark through the EXISTING systems    */
/* ================================================================== */
section('UI — language & dark mode reuse the global systems');
{
  cleanup();
  window.localStorage.clear();
  setSiteLocale('hi');
  setSalonClockForTests(THU_OPEN);
  const { utils } = renderFlow('beauty_skin_spa');

  await test('Hindi locale repaints the whole flow through the global system', async () => {
    const flow = utils.getByTestId('booking-flow');
    assert.equal(flow.dataset.locale, 'hi');
    // PHASE 16.1 — salon step first: confirm its Hindi copy, then continue.
    assert.ok(flow.textContent.includes('अपना सैलून पक्का करें'), 'Hindi salon title missing');
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
    const text = flow.textContent;
    assert.ok(text.includes('सेवा चुनें'), 'Hindi service title missing');
    assert.ok(text.includes('तारीख़'), 'Hindi date step label missing');
    assert.ok(text.includes('सारांश'), 'Hindi summary step label missing');
    assert.ok(text.includes('आगे बढ़ें'), 'Hindi continue missing');
    assert.ok(!text.includes('Select a service'), 'English must not leak in Hindi mode');
    assert.equal(bookingFlowText('hi')['confirm'], 'बुकिंग पक्की करें');
    assert.equal(bookingFlowText('hi')['summary.confirmNote'], 'भुगतान और अंतिम पुष्टि अगले चरण में उपलब्ध होंगे।');
    assert.equal(bookingFlowText('en')['confirm'], 'Confirm Booking');
  });
  cleanup();

  await test('dark mode flips per-theme booking surfaces', () => {
    setSiteLocale('en');
    setSiteAppearance('dark');
    const darkUtils = render(React.createElement(SiteBookingFlow, {
      themeId: 'beauty_skin_spa',
      data: richData('beauty_skin_spa'),
      onBackToWebsite: () => {},
    }));
    assert.equal(darkUtils.getByTestId('booking-flow').dataset.appearance, 'dark');
    cleanup();
    setSiteAppearance('light');
    const lightUtils = render(React.createElement(SiteBookingFlow, {
      themeId: 'beauty_skin_spa',
      data: richData('beauty_skin_spa'),
      onBackToWebsite: () => {},
    }));
    assert.equal(lightUtils.getByTestId('booking-flow').dataset.appearance, 'light');
    cleanup();
  });

  await test('barber theme defaults to its native dark design', () => {
    window.localStorage.clear();
    const utilsBarber = render(React.createElement(SiteBookingFlow, {
      themeId: 'barber_mens_grooming',
      data: richData('barber_mens_grooming'),
      onBackToWebsite: () => {},
    }));
    assert.equal(utilsBarber.getByTestId('booking-flow').dataset.appearance, 'dark');
    cleanup();
  });
}

/* ================================================================== */
/* I · UI — per-theme visual identity (five distinct designs)          */
/* ================================================================== */
section('UI — theme-specific visuals for all five themes');
{
  await test('flow card designs differ pairwise across the five themes', async () => {
    const signatures = [];
    for (const theme of THEMES) {
      cleanup();
      window.localStorage.clear();
      setSalonClockForTests(THU_OPEN);
      setSiteLocale('en');
      const { utils } = renderFlow(theme.id);
      const flow = utils.getByTestId('booking-flow');
      // PHASE 16.1 — pass the salon confirmation step to reach the service cards.
      await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
      const firstCard = flow.querySelector('[data-testid^="booking-service-"]');
      const stepChip = utils.getByTestId('booking-step-service');
      signatures.push(`${flow.style.backgroundColor}|${firstCard.className}|${stepChip.className}|${utils.getByTestId('booking-continue').className}`);
      cleanup();
    }
    assert.equal(new Set(signatures).size, 5, `booking designs not distinct: ${signatures.join(' || ')}`);
  });
}

/* ================================================================== */
/* J · HOST — one booking architecture, wired on every renderer        */
/* ================================================================== */
section('Host — existing open/close events mount the flow on every theme');
{
  for (const theme of THEMES) {
    cleanup();
    window.localStorage.clear();
    setBookingHoldsForTests(null);
    setSalonClockForTests(THU_OPEN);
    setSiteLocale('en');
    const utils = render(React.createElement(theme.Component, { data: richData(theme.id), mode: 'desktop' }));

    await test(`${theme.id}: final Book Appointment opens the themed entry flow`, async () => {
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
      await act(async () => { fireEvent.click(utils.getByTestId('final-booking-cta')); });
      const host = utils.getByTestId('site-booking-flow');
      const flow = utils.getByTestId('booking-flow');
      assert.equal(flow.dataset.theme, theme.id, 'flow must inherit the renderer theme');
      const back = utils.getByTestId('booking-close');
      await act(async () => { fireEvent.click(back); });
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    });

    await test(`${theme.id}: nexora:open-booking / close events still drive the host`, async () => {
      await act(async () => {
        window.dispatchEvent(new Event(SITE_BOOKING_EVENT));
      });
      assert.ok(utils.getByTestId('site-booking-flow'));
      await act(async () => {
        window.dispatchEvent(new Event(SITE_BOOKING_CLOSE_EVENT));
      });
      assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    });

    cleanup();
  }
}

setBookingHoldsForTests(null);
setSalonClockForTests(null);
setSiteLocale('en');
window.localStorage.clear();

console.log('\n────────────────────────────────────────');
console.log(`Phase 10.6 Book Appointment entry flow: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}`);
  process.exit(1);
}
console.log('All five themes verified across the Phase 10.6 checklist.');
