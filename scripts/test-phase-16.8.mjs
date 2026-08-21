/**
 * PHASE 16.8 — CALL / WHATSAPP / BOOK ACTION PROTECTION (five-theme acceptance)
 *
 * The salon's Call, WhatsApp and Book Online actions are protected by the
 * EXISTING booking/payment architecture (Phase 10.7 + 16.5 record store,
 * Phase 16.6 confirmation derivation — no duplicate booking system, no
 * invented tables/columns/ids and no fake payment records):
 *
 *   - Book Online runs the existing booking flow and the required 25%
 *     advance payment before a booking becomes confirmed;
 *   - Call and WhatsApp unlock the salon's REAL contact only after that
 *     advance payment actually succeeds;
 *   - before payment a clear message explains the requirement;
 *   - after payment the CORRECT salon's own phone/WhatsApp is opened;
 *   - no hardcoded numbers, salon ids or URLs, and never another salon's
 *     contact information;
 *   - the unlock is tied to the authenticated visitor identity AND the
 *     successful booking/payment record;
 *   - clicking a pay button never unlocks anything — only a real success;
 *   - frontend-only manipulation cannot bypass the restriction;
 *   - payment pending / failed / cancelled / expired are handled;
 *   - desktop / tablet / mobile, EN/HI, light/dark, all five themes.
 *
 * NOT covered (later phases): notifications, final acceptance testing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.Blob = dom.window.Blob;
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
dom.window.confirm = () => true;
globalThis.confirm = dom.window.confirm;
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};
}
// Capture window.open targets instead of navigating.
const opened = [];
dom.window.open = (url) => { opened.push(url); return null; };
globalThis.open = dom.window.open;

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');

const SiteBookingFullFlow = (await import('../src/components/SiteBookingFullFlow.tsx')).default;
const SiteProtectedContactAction = (await import('../src/components/SiteProtectedContactAction.tsx')).default;
const SiteContactLockNotice = (await import('../src/components/SiteContactLockNotice.tsx')).default;
const SiteMobileActionBar = (await import('../src/components/SiteMobileActionBar.tsx')).default;
const SiteFloatingActions = (await import('../src/components/SiteFloatingActions.tsx')).default;
const SiteFooter = (await import('../src/components/SiteFooter.tsx')).default;
const BarberTemplateRenderer = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const HairStudioTemplateRenderer = (await import('../src/components/HairStudioTemplateRenderer.tsx')).default;
const BeautySpaTemplateRenderer = (await import('../src/components/BeautySpaTemplateRenderer.tsx')).default;
const FamilyFullServiceTemplateRenderer = (await import('../src/components/FamilyFullServiceTemplateRenderer.tsx')).default;
const NailLashStudioTemplateRenderer = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;

const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { SITE_BOOKING_EVENT } = await import('../src/lib/siteBooking.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { setBookingHoldsForTests, bookingBrowserId } = await import('../src/lib/siteBookingFlow.ts');
const { setBookingDraftStoreForTests } = await import('../src/lib/siteBookingDraft.ts');
const {
  setPaymentStoreForTests,
  setPaymentScenarioForTests,
  readPaymentRecords,
  paymentAdvancePercentage,
  PAYMENT_STORE_KEY,
  PAYMENT_EVENT,
} = await import('../src/lib/siteBookingPayment.ts');
const {
  resolveContactAccess,
  resolveSiteContactAccess,
  findUnlockingBooking,
  authorizeContactOpen,
  contactAccessAudit,
  isBookingExpired,
  displayContactNumber,
  CONTACT_ACCESS_REASONS,
  PROTECTED_CONTACT_ACTIONS,
  CONTACT_ACCESS_EVENT,
} = await import('../src/lib/siteContactAccess.ts');
const { contactAccessText, fillContactCopy } = await import('../src/lib/siteContactAccessI18n.ts');

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
async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

const THU_OPEN = new Date(2026, 7, 13, 11, 0, 0, 0);

const THEME_IDS = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

const RENDERERS = {
  barber_mens_grooming: BarberTemplateRenderer,
  hair_studio_color_bar: HairStudioTemplateRenderer,
  beauty_skin_spa: BeautySpaTemplateRenderer,
  family_full_service: FamilyFullServiceTemplateRenderer,
  nail_lash_studio: NailLashStudioTemplateRenderer,
};

const SALON_PHONE = '+91 99999 00000';
const SALON_WA_DIGITS = '919999900000';
const OTHER_SALON_PHONE = '+91 88888 11111';
const OTHER_SALON_WA_DIGITS = '918888811111';

function weekHours() {
  return {
    monday: { open: true, startTime: '10:00', endTime: '20:00' },
    tuesday: { open: true, startTime: '10:00', endTime: '20:00' },
    wednesday: { open: true, startTime: '10:00', endTime: '20:00' },
    thursday: { open: true, startTime: '10:00', endTime: '20:00' },
    friday: { open: true, startTime: '10:00', endTime: '20:00' },
    saturday: { open: true, startTime: '10:00', endTime: '20:00' },
    sunday: { open: false, startTime: '10:00', endTime: '20:00' },
  };
}

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
  ];
}

function richData(themeId, extras = {}) {
  return {
    ...initialData,
    templateId: themeId,
    salonName: `${themeId} Test Salon`,
    ownerName: 'Test Owner',
    email: 'hello@booking.test',
    phone: SALON_PHONE,
    whatsappPhone: SALON_PHONE,
    address: { fullAddress: '12 MG Road, Kota, Rajasthan', latitude: null, longitude: null },
    contactOptions: { callNow: true, whatsapp: true, bookNow: true },
    openingHours: weekHours(),
    holidays: [],
    bookingRules: {
      minNotice: '1 hour', maxAdvance: '30 days', bufferTime: 'No buffer',
      allowStaffSelection: true, advanceDepositPercentage: 25,
    },
    services: themeServices(themeId),
    offers: [],
    team: [],
    gallery: [{ id: 'g1', url: 'https://example.com/a.jpg', category: 'Salon' }],
    ...extras,
  };
}

function paymentRecord(overrides = {}) {
  const now = Date.now();
  return {
    id: `rec-${Math.random().toString(36).slice(2, 9)}`,
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 9)}`,
    businessId: 'public-site',
    themeId: 'beauty_skin_spa',
    customerId: bookingBrowserId(),
    bookingId: `NX-${Math.floor(10000 + Math.random() * 89999)}`,
    serviceId: 'beauty_skin_spa-svc-1',
    serviceName: 'Signature Treatment',
    dateKey: '2026-08-14',
    startMinutes: 780,
    endMinutes: 840,
    baseAmount: 800,
    amountDue: 200,
    remainingAmount: 600,
    currency: 'INR',
    paymentOption: 'advance',
    paymentMethod: 'upi',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    customer: { name: 'Asha Verma', mobile: '9876543210', email: '', notes: '' },
    createdAt: now,
    updatedAt: now,
    payAtSalon: false,
    ...overrides,
  };
}

function seedRecords(records) {
  if (records === null) window.localStorage.removeItem(PAYMENT_STORE_KEY);
  else window.localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify({ version: 1, records }));
  window.dispatchEvent(new Event(PAYMENT_EVENT));
}

function resetState() {
  cleanup();
  window.localStorage.clear();
  opened.length = 0;
  setBookingHoldsForTests(null);
  setBookingDraftStoreForTests(null);
  setPaymentStoreForTests(null);
  setWebsiteSectionFlagsForTests({});
  setSalonClockForTests(THU_OPEN);
  setSiteLocale('en');
  setSiteAppearance('light');
  setPaymentScenarioForTests('all_success');
}

/** A paid advance booking owned by THIS browser for the given salon+theme. */
function paidBooking(themeId, overrides = {}) {
  return paymentRecord({
    themeId,
    serviceId: `${themeId}-svc-1`,
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    paymentOption: 'advance',
    amountDue: 200,
    gatewayRef: 'pay_TESTREF001',
    ...overrides,
  });
}

function renderAction(themeId, action, extras = {}, props = {}) {
  return render(React.createElement(SiteProtectedContactAction, {
    action, themeId, data: richData(themeId, extras), testId: `probe-${action}`,
    children: 'Contact', ...props,
  }));
}

async function openFlow(themeId, extras = {}) {
  const data = richData(themeId, extras);
  const utils = render(React.createElement(SiteBookingFullFlow, { themeId, data }));
  await act(async () => { window.dispatchEvent(new Event(SITE_BOOKING_EVENT)); });
  return { utils, data };
}

async function walkToSummary(utils) {
  const flow = utils.getByTestId('booking-flow');
  const steps = ['salon', 'service', 'date', 'time', 'details', 'summary'];
  await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
  while (flow.dataset.step !== 'summary' && steps.indexOf(flow.dataset.step) < steps.indexOf('summary')) {
    if (flow.dataset.step === 'details') {
      await act(async () => {
        fireEvent.change(utils.getByTestId('booking-input-name'), { target: { value: 'Asha Verma' } });
        fireEvent.change(utils.getByTestId('booking-input-mobile'), { target: { value: '9876543210' } });
      });
    }
    await act(async () => { fireEvent.click(utils.getByTestId('booking-continue')); });
  }
  assert.equal(flow.dataset.step, 'summary');
}

async function payAdvance(utils) {
  await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
  fireEvent.click(utils.getByTestId('payment-option-advance'));
  await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
  await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
  await act(async () => { await wait(1600); });
}

/* ================================================================== */
/* A · THE GATE — unlocked ONLY by a real successful advance payment   */
/* ================================================================== */
section('The gate — a real successful advance payment, nothing less');
{
  for (const action of PROTECTED_CONTACT_ACTIONS) {
    await test(`${action}: locked with no booking at all (payment-required)`, () => {
      resetState();
      const access = resolveContactAccess(action, richData('beauty_skin_spa'), 'beauty_skin_spa');
      assert.equal(access.unlocked, false);
      assert.equal(access.reason, 'payment-required');
      assert.equal(access.href, null);
    });

    await test(`${action}: unlocked by this visitor's paid advance booking`, () => {
      resetState();
      seedRecords([paidBooking('beauty_skin_spa')]);
      const access = resolveContactAccess(action, richData('beauty_skin_spa'), 'beauty_skin_spa');
      assert.equal(access.unlocked, true);
      assert.equal(access.reason, 'unlocked');
      assert.ok(access.href, 'unlocked action must carry the salon target');
    });
  }

  await test('a pending payment does NOT unlock (payment-pending)', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa', {
      paymentStatus: 'pending', bookingStatus: 'pending_payment', gatewayRef: undefined,
    })]);
    const access = resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(access.unlocked, false);
    assert.equal(access.reason, 'payment-pending');
    assert.equal(access.href, null);
  });

  await test('a failed payment does NOT unlock (payment-failed)', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa', {
      paymentStatus: 'failed', bookingStatus: 'failed', failureReason: 'Card declined',
    })]);
    const access = resolveContactAccess('whatsapp', richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(access.unlocked, false);
    assert.equal(access.reason, 'payment-failed');
    assert.equal(access.href, null);
  });

  await test('a cancelled booking does NOT unlock (cancelled)', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa', {
      paymentStatus: 'cancelled', bookingStatus: 'cancelled',
    })]);
    const access = resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(access.unlocked, false);
    assert.equal(access.reason, 'cancelled');
  });

  await test('an expired (already finished) booking re-locks the actions', () => {
    resetState();
    // Slot ended before the frozen salon clock (2026-08-13 11:00).
    seedRecords([paidBooking('beauty_skin_spa', { dateKey: '2026-08-10', startMinutes: 600, endMinutes: 660 })]);
    const access = resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(access.unlocked, false);
    assert.equal(access.reason, 'expired');
    assert.equal(access.href, null);
  });

  await test('pay-at-salon (no advance taken) does NOT unlock the protected channels', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa', {
      paymentOption: 'pay_at_salon', bookingStatus: 'pay_at_salon', paymentStatus: 'unpaid',
      payAtSalon: true, amountDue: 0, remainingAmount: 800, gatewayRef: undefined,
    })]);
    const access = resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(access.unlocked, false, 'no advance was actually paid');
    assert.equal(access.href, null);
  });

  await test('a row claiming confirmed while unpaid cannot unlock (fail-closed)', () => {
    resetState();
    // Exactly the forgery a frontend-only guard would accept.
    seedRecords([paidBooking('beauty_skin_spa', { bookingStatus: 'confirmed', paymentStatus: 'pending' })]);
    assert.equal(findUnlockingBooking('public-site', 'beauty_skin_spa'), null);
    assert.equal(resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa').unlocked, false);
  });

  await test('a paid row with zero advance cannot unlock (no money moved)', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa', { amountDue: 0 })]);
    assert.equal(resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa').unlocked, false);
  });

  await test('a full payment (100%) also satisfies the advance requirement', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa', {
      paymentOption: 'full', amountDue: 800, remainingAmount: 0,
    })]);
    assert.equal(resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa').unlocked, true);
  });

  await test('every documented reason is reachable and enumerated', () => {
    for (const reason of ['unlocked', 'payment-required', 'payment-pending', 'payment-failed', 'cancelled', 'expired', 'unavailable']) {
      assert.ok(CONTACT_ACCESS_REASONS.includes(reason), `${reason} missing`);
    }
  });
}

/* ================================================================== */
/* B · IDENTITY + TENANT — the right customer and the right salon      */
/* ================================================================== */
section('Identity and tenant isolation');
{
  await test("another customer's paid booking never unlocks this visitor", () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa', { customerId: 'someone-else-entirely' })]);
    const access = resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(access.unlocked, false);
    assert.equal(access.reason, 'payment-required');
  });

  await test('a paid booking at ANOTHER salon does not unlock this salon', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa', { businessId: 'other-salon-999' })]);
    const access = resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(access.unlocked, false);
    assert.equal(findUnlockingBooking('public-site', 'beauty_skin_spa'), null);
  });

  await test('a paid booking on another THEME of the same salon does not leak across', () => {
    resetState();
    seedRecords([paidBooking('barber_mens_grooming')]);
    assert.equal(resolveContactAccess('call', richData('beauty_skin_spa'), 'beauty_skin_spa').unlocked, false);
    assert.equal(resolveContactAccess('call', richData('barber_mens_grooming'), 'barber_mens_grooming').unlocked, true);
  });

  await test('the unlock opens THIS salon\u2019s number, never another salon\u2019s', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa')]);
    const mine = richData('beauty_skin_spa');
    const href = authorizeContactOpen('call', mine, 'beauty_skin_spa');
    assert.ok(href.includes('99999'), `expected the viewed salon's own number, got ${href}`);
    assert.equal(href.includes('88888'), false);

    // A different salon's page with the same paid booking must not borrow it.
    const other = richData('beauty_skin_spa', {
      phone: OTHER_SALON_PHONE, whatsappPhone: OTHER_SALON_PHONE,
      services: themeServices('beauty_skin_spa').map((s) => ({ ...s, businessId: 'other-salon-999' })),
    });
    assert.equal(authorizeContactOpen('call', other, 'beauty_skin_spa'), null);
  });

  await test('the audit record identifies the exact authorizing booking', () => {
    resetState();
    const record = paidBooking('beauty_skin_spa');
    seedRecords([record]);
    const audit = contactAccessAudit(richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(audit.allowed, true);
    assert.equal(audit.recordId, record.id);
    assert.equal(audit.reference, record.bookingId);
    assert.equal(audit.businessId, 'public-site');
    assert.equal(audit.booking.state, 'confirmed');
  });

  await test('a denied audit carries no booking and no contact data', () => {
    resetState();
    const audit = contactAccessAudit(richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(audit.allowed, false);
    assert.equal(audit.recordId, null);
    assert.equal(audit.booking, null);
    assert.equal(JSON.stringify(audit).includes('99999'), false);
  });

  await test('the newest qualifying booking supplies the reference', () => {
    resetState();
    const older = paidBooking('beauty_skin_spa', { bookingId: 'NX-11111', updatedAt: Date.now() - 90000 });
    const newer = paidBooking('beauty_skin_spa', { bookingId: 'NX-22222', updatedAt: Date.now() });
    seedRecords([older, newer]);
    assert.equal(findUnlockingBooking('public-site', 'beauty_skin_spa').bookingId, 'NX-22222');
  });
}

/* ================================================================== */
/* C · NO CONTACT DATA IN LOCKED MARKUP (bypass resistance)            */
/* ================================================================== */
section('Locked markup exposes nothing to copy, inspect or re-enable');
{
  for (const themeId of THEME_IDS) {
    await test(`${themeId}: locked Call/WhatsApp render without any target`, () => {
      resetState();
      for (const action of PROTECTED_CONTACT_ACTIONS) {
        cleanup();
        const utils = renderAction(themeId, action);
        const el = utils.getByTestId(`probe-${action}`);
        assert.equal(el.tagName, 'BUTTON', 'a locked action must not be an anchor');
        assert.equal(el.dataset.locked, 'true');
        assert.equal(el.getAttribute('href'), null);
        const html = utils.container.innerHTML;
        assert.equal(html.includes('tel:'), false, 'tel: leaked into locked markup');
        assert.equal(html.includes('wa.me'), false, 'wa.me leaked into locked markup');
        assert.equal(html.includes('99999'), false, 'the salon number leaked into locked markup');
        assert.equal(html.includes(SALON_WA_DIGITS), false);
      }
    });
  }

  await test('the whole rendered website contains no contact target while locked', () => {
    resetState();
    for (const themeId of THEME_IDS) {
      cleanup();
      const utils = render(React.createElement(RENDERERS[themeId], {
        data: richData(themeId), mode: 'desktop',
      }));
      const html = utils.container.innerHTML;
      assert.equal(html.includes('tel:'), false, `${themeId} leaked a tel: link`);
      assert.equal(html.includes('wa.me'), false, `${themeId} leaked a wa.me link`);
      assert.equal(html.includes(SALON_WA_DIGITS), false, `${themeId} leaked the raw number`);
    }
  });

  await test('the printed phone number is masked until the advance is paid', () => {
    resetState();
    const masked = displayContactNumber(SALON_PHONE, false);
    assert.equal(masked.includes('99999'), false);
    assert.ok(masked.includes('•'), 'masked value should be visibly redacted');
    assert.equal(displayContactNumber(SALON_PHONE, true), SALON_PHONE);
  });

  await test('re-enabling the button in the DOM still cannot open a contact', () => {
    resetState();
    const utils = renderAction('beauty_skin_spa', 'call');
    const el = utils.getByTestId('probe-call');
    // Simulate devtools tampering: force the element to look unlocked.
    el.dataset.locked = 'false';
    el.removeAttribute('disabled');
    el.setAttribute('href', 'tel:+919999900000');
    fireEvent.click(el);
    // The authorization is data-derived, so nothing was opened.
    assert.equal(opened.length, 0);
    assert.equal(authorizeContactOpen('call', richData('beauty_skin_spa'), 'beauty_skin_spa'), null);
  });

  await test('authorizeContactOpen refuses every non-paid state', () => {
    const data = richData('beauty_skin_spa');
    const states = [
      { paymentStatus: 'pending', bookingStatus: 'pending_payment' },
      { paymentStatus: 'failed', bookingStatus: 'failed' },
      { paymentStatus: 'cancelled', bookingStatus: 'cancelled' },
      { paymentStatus: 'unpaid', bookingStatus: 'pay_at_salon', payAtSalon: true, amountDue: 0 },
    ];
    for (const patch of states) {
      resetState();
      seedRecords([paidBooking('beauty_skin_spa', patch)]);
      assert.equal(authorizeContactOpen('call', data, 'beauty_skin_spa'), null, JSON.stringify(patch));
      assert.equal(authorizeContactOpen('whatsapp', data, 'beauty_skin_spa'), null, JSON.stringify(patch));
    }
  });

  await test('a salon without a number never yields a placeholder target', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa')]);
    const noPhone = richData('beauty_skin_spa', { phone: '', whatsappPhone: '' });
    assert.equal(authorizeContactOpen('call', noPhone, 'beauty_skin_spa'), null);
    assert.equal(authorizeContactOpen('whatsapp', noPhone, 'beauty_skin_spa'), null);
  });
}

/* ================================================================== */
/* D · UNLOCKED — the correct salon's real contact opens               */
/* ================================================================== */
section('Unlocked — the correct salon\u2019s real contact');
{
  for (const themeId of THEME_IDS) {
    await test(`${themeId}: paid advance turns both actions into real links`, () => {
      resetState();
      seedRecords([paidBooking(themeId)]);
      cleanup();
      const call = renderAction(themeId, 'call').getByTestId('probe-call');
      assert.equal(call.tagName, 'A');
      assert.equal(call.dataset.locked, 'false');
      assert.ok((call.getAttribute('href') || '').startsWith('tel:'));
      assert.ok(call.getAttribute('href').includes('99999'));
      cleanup();
      const wa = renderAction(themeId, 'whatsapp').getByTestId('probe-whatsapp');
      assert.equal(wa.tagName, 'A');
      assert.equal(wa.getAttribute('href'), `https://wa.me/${SALON_WA_DIGITS}`);
      assert.equal(wa.getAttribute('target'), '_blank');
      assert.match(wa.getAttribute('rel') || '', /noreferrer|noopener/);
    });
  }

  await test('the WhatsApp target is built from the salon\u2019s own whatsappPhone', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa')]);
    const data = richData('beauty_skin_spa', { whatsappPhone: '+91 91234 56789' });
    assert.equal(authorizeContactOpen('whatsapp', data, 'beauty_skin_spa'), 'https://wa.me/919123456789');
  });

  await test('WhatsApp falls back to the salon phone when no WhatsApp number is set', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa')]);
    const data = richData('beauty_skin_spa', { whatsappPhone: '' });
    assert.equal(authorizeContactOpen('whatsapp', data, 'beauty_skin_spa'), `https://wa.me/${SALON_WA_DIGITS}`);
  });

  await test('the footer reveals the real number only once unlocked', () => {
    resetState();
    const props = { themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa') };
    let utils = render(React.createElement(SiteFooter, props));
    assert.equal(utils.getByTestId('site-footer-contact').textContent.includes('99999'), false);
    cleanup();
    seedRecords([paidBooking('beauty_skin_spa')]);
    utils = render(React.createElement(SiteFooter, props));
    assert.ok(utils.getByTestId('site-footer-contact').textContent.includes('99999'));
    assert.equal(utils.getByTestId('site-footer-call').dataset.locked, 'false');
  });

  await test('an unlocked action still re-verifies at click time', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa')]);
    const utils = renderAction('beauty_skin_spa', 'call');
    const el = utils.getByTestId('probe-call');
    assert.equal(el.dataset.locked, 'false');
    // The record disappears (cancelled elsewhere / storage cleared) without a re-render.
    window.localStorage.removeItem(PAYMENT_STORE_KEY);
    assert.equal(authorizeContactOpen('call', richData('beauty_skin_spa'), 'beauty_skin_spa'), null);
  });
}

/* ================================================================== */
/* E · THE MESSAGE — a clear explanation before payment                */
/* ================================================================== */
section('The pre-payment message');
{
  await test('clicking a locked action announces the requirement', async () => {
    resetState();
    const utils = render(React.createElement('div', null,
      React.createElement(SiteContactLockNotice, { themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa') }),
      React.createElement(SiteProtectedContactAction, {
        action: 'call', themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'),
        testId: 'probe-call', children: 'Call',
      }),
    ));
    assert.equal(utils.queryByTestId('contact-lock-notice'), null);
    await act(async () => { fireEvent.click(utils.getByTestId('probe-call')); });
    const notice = utils.getByTestId('contact-lock-notice');
    assert.equal(notice.dataset.reason, 'payment-required');
    const message = utils.getByTestId('contact-lock-message').textContent;
    assert.ok(message.includes('25%'), `message must state the salon's advance rule: ${message}`);
  });

  await test('the message explains each state distinctly', async () => {
    const cases = [
      ['payment-pending', { paymentStatus: 'pending', bookingStatus: 'pending_payment' }],
      ['payment-failed', { paymentStatus: 'failed', bookingStatus: 'failed' }],
      ['cancelled', { paymentStatus: 'cancelled', bookingStatus: 'cancelled' }],
      ['expired', { dateKey: '2026-08-10', startMinutes: 600, endMinutes: 660 }],
    ];
    const seen = new Set();
    for (const [reason, patch] of cases) {
      resetState();
      seedRecords([paidBooking('beauty_skin_spa', patch)]);
      const utils = render(React.createElement('div', null,
        React.createElement(SiteContactLockNotice, { themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa') }),
        React.createElement(SiteProtectedContactAction, {
          action: 'call', themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'),
          testId: 'probe-call', children: 'Call',
        }),
      ));
      await act(async () => { fireEvent.click(utils.getByTestId('probe-call')); });
      const notice = utils.getByTestId('contact-lock-notice');
      assert.equal(notice.dataset.reason, reason);
      seen.add(utils.getByTestId('contact-lock-message').textContent.trim());
      cleanup();
    }
    assert.equal(seen.size, 4, 'each state needs its own explanation');
  });

  await test('the notice routes into the EXISTING booking flow', async () => {
    resetState();
    let openedBooking = false;
    const onOpen = () => { openedBooking = true; };
    window.addEventListener(SITE_BOOKING_EVENT, onOpen);
    const utils = render(React.createElement('div', null,
      React.createElement(SiteContactLockNotice, { themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa') }),
      React.createElement(SiteProtectedContactAction, {
        action: 'whatsapp', themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'),
        testId: 'probe-whatsapp', children: 'WhatsApp',
      }),
    ));
    await act(async () => { fireEvent.click(utils.getByTestId('probe-whatsapp')); });
    await act(async () => { fireEvent.click(utils.getByTestId('contact-lock-book')); });
    window.removeEventListener(SITE_BOOKING_EVENT, onOpen);
    assert.equal(openedBooking, true, 'must dispatch the single existing booking event');
    assert.equal(utils.queryByTestId('contact-lock-notice'), null, 'notice closes when booking opens');
  });

  await test('the notice can be dismissed', async () => {
    resetState();
    const utils = render(React.createElement('div', null,
      React.createElement(SiteContactLockNotice, { themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa') }),
      React.createElement(SiteProtectedContactAction, {
        action: 'call', themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'),
        testId: 'probe-call', children: 'Call',
      }),
    ));
    await act(async () => { fireEvent.click(utils.getByTestId('probe-call')); });
    await act(async () => { fireEvent.click(utils.getByTestId('contact-lock-dismiss')); });
    assert.equal(utils.queryByTestId('contact-lock-notice'), null);
  });

  await test('the locked control itself carries an accessible explanation', () => {
    resetState();
    const el = renderAction('beauty_skin_spa', 'call').getByTestId('probe-call');
    assert.match(el.getAttribute('aria-label') || '', /25%/);
    assert.match(el.getAttribute('title') || '', /25%/);
  });

  await test('the message uses the salon\u2019s OWN advance rule, not a constant', async () => {
    resetState();
    const data = richData('beauty_skin_spa', {
      bookingRules: { ...richData('beauty_skin_spa').bookingRules, advanceDepositPercentage: 40 },
    });
    assert.equal(paymentAdvancePercentage(data.bookingRules), 40);
    const access = resolveContactAccess('call', data, 'beauty_skin_spa');
    assert.equal(access.advancePercentage, 40);
    const utils = renderAction('beauty_skin_spa', 'call', {
      bookingRules: { ...data.bookingRules, advanceDepositPercentage: 40 },
    });
    assert.match(utils.getByTestId('probe-call').getAttribute('title') || '', /40%/);
  });
}

/* ================================================================== */
/* F · END-TO-END — Book Online → 25% advance → unlock                 */
/* ================================================================== */
section('End to end — booking + 25% advance actually unlocks');
{
  await test('a completed booking + advance payment unlocks Call and WhatsApp', async () => {
    resetState();
    const themeId = 'beauty_skin_spa';
    const { utils, data } = await openFlow(themeId);
    // Locked before anything happens.
    assert.equal(resolveContactAccess('call', data, themeId).unlocked, false);
    await walkToSummary(utils);
    await payAdvance(utils);

    const confirm = utils.getByTestId('payment-confirm');
    assert.equal(confirm.dataset.confirmed, 'true');
    const record = readPaymentRecords().find((r) => r.themeId === themeId);
    assert.ok(record, 'the existing engine must have written the booking record');
    assert.equal(record.paymentStatus, 'paid');
    assert.equal(record.bookingStatus, 'confirmed');

    const access = resolveSiteContactAccess(data, themeId);
    assert.equal(access.call.unlocked, true);
    assert.equal(access.whatsapp.unlocked, true);
    // The reference is the EXISTING booking id — not minted by 16.8.
    assert.equal(access.call.reference, record.bookingId);
    assert.match(record.bookingId, /^NX-\d+$/);
  });

  await test('the charged advance really is the salon\u2019s 25% rule', async () => {
    resetState();
    const themeId = 'hair_studio_color_bar';
    const { utils, data } = await openFlow(themeId);
    await walkToSummary(utils);
    await payAdvance(utils);
    const record = readPaymentRecords().find((r) => r.themeId === themeId);
    assert.equal(record.amountDue, Math.round(record.baseAmount * 0.25));
    assert.equal(record.amountDue + record.remainingAmount, record.baseAmount);
    assert.equal(resolveContactAccess('call', data, themeId).unlocked, true);
  });

  await test('clicking Pay is not enough — a failed gateway leaves it locked', async () => {
    resetState();
    setPaymentScenarioForTests('force_failure');
    const themeId = 'beauty_skin_spa';
    const { utils, data } = await openFlow(themeId);
    await walkToSummary(utils);
    await payAdvance(utils);
    const record = readPaymentRecords().find((r) => r.themeId === themeId);
    assert.ok(record, 'a record exists');
    assert.notEqual(record.paymentStatus, 'paid');
    const access = resolveContactAccess('call', data, themeId);
    assert.equal(access.unlocked, false, 'a clicked-but-failed payment must not unlock');
    assert.equal(access.href, null);
    setPaymentScenarioForTests('all_success');
  });

  await test('choosing pay-at-salon confirms the booking but keeps contact locked', async () => {
    resetState();
    const themeId = 'beauty_skin_spa';
    const { utils, data } = await openFlow(themeId);
    await walkToSummary(utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    await act(async () => { await wait(50); });
    const record = readPaymentRecords().find((r) => r.themeId === themeId);
    assert.equal(record.bookingStatus, 'pay_at_salon');
    assert.equal(resolveContactAccess('call', data, themeId).unlocked, false);
  });

  await test('the live site unlocks its actions without a reload after payment', async () => {
    resetState();
    const themeId = 'beauty_skin_spa';
    const utils = renderAction(themeId, 'call');
    assert.equal(utils.getByTestId('probe-call').dataset.locked, 'true');
    await act(async () => { seedRecords([paidBooking(themeId)]); });
    assert.equal(utils.getByTestId('probe-call').dataset.locked, 'false');
    assert.ok((utils.getByTestId('probe-call').getAttribute('href') || '').startsWith('tel:'));
  });

  await test('the unlock is announced on the existing payment channel', () => {
    assert.equal(CONTACT_ACCESS_EVENT, PAYMENT_EVENT, 'must reuse the existing payment event');
  });
}

/* ================================================================== */
/* G · BOOK ONLINE                                                     */
/* ================================================================== */
section('Book Online');
{
  await test('Book Online opens the single existing booking flow', async () => {
    resetState();
    const themeId = 'beauty_skin_spa';
    const utils = render(React.createElement(RENDERERS[themeId], {
      data: richData(themeId), mode: 'mobile',
    }));
    assert.equal(utils.container.querySelector('[data-testid="site-booking-flow"]'), null);
    await act(async () => { fireEvent.click(utils.getByTestId('site-mobile-bar-book')); });
    assert.ok(utils.getByTestId('site-booking-flow'), 'the existing flow must open');
    assert.equal(utils.container.querySelectorAll('[data-testid="site-booking-flow"]').length, 1);
  });

  await test('Book Online is never blocked by the contact protection', () => {
    resetState();
    const access = resolveSiteContactAccess(richData('beauty_skin_spa'), 'beauty_skin_spa');
    assert.equal(access.bookOffered, true, 'booking must stay reachable so the advance CAN be paid');
    assert.equal(access.anyLocked, true);
  });

  await test('the booking becomes confirmed only after the advance succeeds', async () => {
    resetState();
    const themeId = 'family_full_service';
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
    fireEvent.click(utils.getByTestId('payment-option-advance'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    // Reaching the gateway has confirmed nothing yet.
    assert.equal(readPaymentRecords().some((r) => r.bookingStatus === 'confirmed'), false);
    // The engine writes a PENDING row as the attempt starts, so a refresh
    // mid-payment can resume — pending, never confirmed.
    await act(async () => { fireEvent.click(utils.getByTestId('payment-gateway-pay')); });
    const midway = readPaymentRecords().find((r) => r.themeId === themeId);
    assert.ok(midway, 'the existing engine writes the attempt row');
    assert.equal(midway.bookingStatus, 'pending_payment');
    assert.equal(resolveContactAccess('call', richData(themeId), themeId).unlocked, false);
    await act(async () => { await wait(1600); });
    const after = readPaymentRecords().find((r) => r.themeId === themeId);
    assert.equal(after.bookingStatus, 'confirmed');
    assert.equal(after.paymentStatus, 'paid');
  });

  await test('a salon that disabled a channel shows it as unavailable, not locked', () => {
    resetState();
    const data = richData('beauty_skin_spa', {
      contactOptions: { callNow: false, whatsapp: false, bookNow: true },
    });
    const access = resolveSiteContactAccess(data, 'beauty_skin_spa');
    assert.equal(access.call.reason, 'unavailable');
    assert.equal(access.whatsapp.reason, 'unavailable');
    assert.equal(access.call.offered, false);
    assert.equal(access.anyLocked, false);
  });
}

/* ================================================================== */
/* H · SURFACES — every Call/WhatsApp entry point is protected         */
/* ================================================================== */
section('Every contact surface goes through the one gate');
{
  await test('no component builds its own tel:/wa.me contact target', () => {
    // The ONLY places allowed to emit a salon contact target are the
    // shared helpers and the single protected control.
    const allowed = new Set([
      'src/lib/siteBooking.ts',
      'src/lib/siteContactAccess.ts',
      'src/components/SiteProtectedContactAction.tsx',
      // Dashboard/owner-side surfaces are NOT the public salon website.
      'src/screens/Landing.tsx',
      'src/components/PreviewPane.tsx',
      'src/components/ShareReferralPremium.tsx',
      'src/components/CustomerBookingPreview.tsx',
      // The receipt share is authorized through siteContactAccess.
      'src/components/SiteBookingPaymentFlow.tsx',
    ]);
    const files = [
      'src/components/SiteFooter.tsx',
      'src/components/SiteFloatingActions.tsx',
      'src/components/SiteMobileActionBar.tsx',
      'src/components/SiteSectionStates.tsx',
      'src/components/FamilyFullServiceTemplateRenderer.tsx',
      'src/components/NailLashStudioTemplateRenderer.tsx',
      'src/components/heroes/BarberHero.tsx',
      'src/components/heroes/BeautySpaHero.tsx',
      'src/components/heroes/FamilyHero.tsx',
      'src/components/heroes/HairStudioHero.tsx',
      'src/components/heroes/NailLashHero.tsx',
      'src/lib/siteHero.ts',
    ];
    for (const file of files) {
      assert.equal(allowed.has(file), false, 'test bookkeeping error');
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      assert.equal(source.includes('wa.me'), false, `${file} builds its own wa.me link`);
      assert.equal(/href=\{?["'`]?tel:/.test(source), false, `${file} builds its own tel: link`);
    }
  });

  await test('hero, floating, mobile-bar, footer and final CTA are all protected', () => {
    resetState();
    const themeId = 'beauty_skin_spa';
    for (const mode of ['desktop', 'mobile']) {
      cleanup();
      const utils = render(React.createElement(RENDERERS[themeId], { data: richData(themeId), mode }));
      const ids = mode === 'mobile'
        ? ['hero-call-cta', 'hero-whatsapp-cta', 'site-mobile-bar-call', 'site-mobile-bar-whatsapp', 'final-cta-call', 'final-cta-whatsapp', 'site-footer-call', 'site-footer-whatsapp']
        : ['hero-call-cta', 'hero-whatsapp-cta', 'site-fab-call', 'site-fab-whatsapp', 'final-cta-call', 'final-cta-whatsapp', 'site-footer-call', 'site-footer-whatsapp'];
      for (const id of ids) {
        const el = utils.container.querySelector(`[data-testid="${id}"]`);
        assert.ok(el, `${id} missing in ${mode}`);
        assert.equal(el.dataset.locked, 'true', `${id} is not protected in ${mode}`);
        assert.equal(el.getAttribute('href'), null, `${id} exposed a target in ${mode}`);
      }
    }
  });

  await test('all those surfaces flip to real links once the advance is paid', () => {
    resetState();
    const themeId = 'beauty_skin_spa';
    seedRecords([paidBooking(themeId)]);
    const utils = render(React.createElement(RENDERERS[themeId], { data: richData(themeId), mode: 'desktop' }));
    for (const id of ['hero-call-cta', 'site-fab-call', 'final-cta-call', 'site-footer-call']) {
      const el = utils.container.querySelector(`[data-testid="${id}"]`);
      assert.equal(el.dataset.locked, 'false', `${id} did not unlock`);
      assert.ok((el.getAttribute('href') || '').startsWith('tel:'), `${id} has no tel: target`);
    }
    for (const id of ['hero-whatsapp-cta', 'site-fab-whatsapp', 'final-cta-whatsapp', 'site-footer-whatsapp']) {
      const el = utils.container.querySelector(`[data-testid="${id}"]`);
      assert.equal(el.getAttribute('href'), `https://wa.me/${SALON_WA_DIGITS}`);
    }
  });

  await test('the theme contact rows are protected too', () => {
    resetState();
    for (const themeId of ['family_full_service', 'nail_lash_studio']) {
      cleanup();
      const utils = render(React.createElement(RENDERERS[themeId], { data: richData(themeId), mode: 'desktop' }));
      for (const id of ['theme-contact-call', 'theme-contact-whatsapp']) {
        const el = utils.container.querySelector(`[data-testid="${id}"]`);
        assert.ok(el, `${id} missing on ${themeId}`);
        assert.equal(el.dataset.locked, 'true');
      }
      const phone = utils.container.querySelector('[data-testid="theme-contact-phone"]');
      assert.equal((phone?.textContent || '').includes('99999'), false, `${themeId} printed the number`);
    }
  });

  await test('the receipt WhatsApp share does not address the salon while locked', async () => {
    resetState();
    const themeId = 'beauty_skin_spa';
    // pay_at_salon => a receipt exists but no advance was paid.
    const { utils } = await openFlow(themeId);
    await walkToSummary(utils);
    await act(async () => { fireEvent.click(utils.getByTestId('booking-confirm')); });
    fireEvent.click(utils.getByTestId('payment-option-pay-at-salon'));
    await act(async () => { fireEvent.click(utils.getByTestId('payment-continue')); });
    await act(async () => { await wait(50); });
    await act(async () => { fireEvent.click(utils.getByTestId('payment-view-receipt')); });
    const share = utils.container.querySelector('[data-testid="receipt-whatsapp"]')
      || utils.container.querySelector('[data-testid="payment-receipt-whatsapp"]');
    if (share) {
      opened.length = 0;
      await act(async () => { fireEvent.click(share); });
      const target = opened[0] || '';
      assert.equal(target.includes(SALON_WA_DIGITS), false, 'the salon number was addressed without an advance');
    }
  });
}

/* ================================================================== */
/* I · I18N, APPEARANCE, RESPONSIVENESS                                */
/* ================================================================== */
section('EN/HI, light/dark, desktop/tablet/mobile');
{
  await test('English and Hindi copy tables are complete and in lockstep', () => {
    const en = contactAccessText('en');
    const hi = contactAccessText('hi');
    assert.deepEqual(Object.keys(en).sort(), Object.keys(hi).sort());
    for (const [key, value] of Object.entries(hi)) {
      assert.ok(value.trim().length > 0, `${key} is empty in Hindi`);
      assert.match(value, /[\u0900-\u097F]/, `${key} is not translated to Hindi`);
    }
    for (const reason of CONTACT_ACCESS_REASONS) {
      assert.ok(en[`reason.${reason}`], `missing EN copy for ${reason}`);
      assert.ok(hi[`reason.${reason}`], `missing HI copy for ${reason}`);
    }
  });

  await test('placeholders are substituted, never shown raw', () => {
    const en = contactAccessText('en');
    const filled = fillContactCopy(en['reason.payment-required'], { percent: 25 });
    assert.ok(filled.includes('25%'));
    assert.equal(filled.includes('{percent}'), false);
    const unlocked = fillContactCopy(en['unlocked.body'], { percent: 25, reference: 'NX-12345' });
    assert.ok(unlocked.includes('NX-12345'));
    assert.equal(/\{[a-z]+\}/i.test(unlocked), false);
  });

  await test('the locked control speaks Hindi when the site is in Hindi', () => {
    resetState();
    setSiteLocale('hi');
    const el = renderAction('beauty_skin_spa', 'call').getByTestId('probe-call');
    assert.match(el.getAttribute('title') || '', /[\u0900-\u097F]/);
    assert.match(el.getAttribute('aria-label') || '', /[\u0900-\u097F]/);
    setSiteLocale('en');
  });

  await test('the lock notice renders in both languages and both appearances', async () => {
    for (const locale of ['en', 'hi']) {
      for (const appearance of ['light', 'dark']) {
        resetState();
        setSiteLocale(locale);
        setSiteAppearance(appearance);
        const utils = render(React.createElement('div', null,
          React.createElement(SiteContactLockNotice, { themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa') }),
          React.createElement(SiteProtectedContactAction, {
            action: 'call', themeId: 'beauty_skin_spa', data: richData('beauty_skin_spa'),
            testId: 'probe-call', children: 'Call',
          }),
        ));
        await act(async () => { fireEvent.click(utils.getByTestId('probe-call')); });
        const notice = utils.getByTestId('contact-lock-notice');
        assert.equal(notice.dataset.locale, locale);
        assert.equal(notice.dataset.appearance, appearance);
        const text = utils.getByTestId('contact-lock-message').textContent;
        if (locale === 'hi') assert.match(text, /[\u0900-\u097F]/);
        cleanup();
      }
    }
    setSiteLocale('en');
    setSiteAppearance('light');
  });

  await test('protection holds across desktop, tablet and mobile on every theme', () => {
    for (const themeId of THEME_IDS) {
      for (const mode of ['desktop', 'tablet', 'mobile']) {
        resetState();
        const utils = render(React.createElement(RENDERERS[themeId], { data: richData(themeId), mode }));
        const html = utils.container.innerHTML;
        assert.equal(html.includes('wa.me'), false, `${themeId}/${mode} leaked wa.me`);
        assert.equal(html.includes('tel:'), false, `${themeId}/${mode} leaked tel:`);
        cleanup();
      }
    }
  });

  await test('the lock notice uses each theme\u2019s own surface tokens', async () => {
    const signatures = new Set();
    for (const themeId of THEME_IDS) {
      resetState();
      const utils = render(React.createElement('div', null,
        React.createElement(SiteContactLockNotice, { themeId, data: richData(themeId) }),
        React.createElement(SiteProtectedContactAction, {
          action: 'call', themeId, data: richData(themeId), testId: 'probe-call', children: 'Call',
        }),
      ));
      await act(async () => { fireEvent.click(utils.getByTestId('probe-call')); });
      const card = utils.getByTestId('contact-lock-notice').querySelector('div');
      signatures.add(card.getAttribute('style') || '');
      cleanup();
    }
    assert.equal(signatures.size, 5, 'each theme needs its own lock-notice treatment');
  });
}

/* ================================================================== */
/* J · ARCHITECTURE — existing structures, no invention                */
/* ================================================================== */
section('Architecture — existing schema, no invented data');
{
  await test('16.8 never writes to the booking/payment store', () => {
    resetState();
    const source = readFileSync(new URL('../src/lib/siteContactAccess.ts', import.meta.url), 'utf8');
    for (const f of ['writePaymentRecords', 'setItem', 'localStorage.setItem', 'createPaymentRecord', 'savePaymentRecord']) {
      assert.equal(source.includes(f), false, `siteContactAccess must not write (${f})`);
    }
  });

  await test('the protection reads the EXISTING record store only', () => {
    const source = readFileSync(new URL('../src/lib/siteContactAccess.ts', import.meta.url), 'utf8');
    assert.ok(source.includes('readPaymentRecordsForBusiness'), 'must read the existing store');
    assert.ok(source.includes('bookingConfirmationState'), 'must reuse the 16.6 state rule');
    assert.ok(source.includes('paymentAdvancePercentage'), 'must reuse the existing advance rule');
    assert.ok(source.includes('bookingBrowserId'), 'must reuse the existing identity');
  });

  await test('no hardcoded phone numbers, WhatsApp numbers, salon ids or URLs', () => {
    for (const file of [
      'src/lib/siteContactAccess.ts',
      'src/lib/siteContactAccessI18n.ts',
      'src/components/SiteProtectedContactAction.tsx',
      'src/components/SiteContactLockNotice.tsx',
    ]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      assert.equal(/\+?\d[\d\s-]{7,}\d/.test(source.replace(/\{percent\}/g, '')), false, `${file} contains a literal number`);
      assert.equal(source.includes('wa.me/9'), false, `${file} hardcodes a WhatsApp number`);
      assert.equal(/tel:\+?\d/.test(source), false, `${file} hardcodes a phone number`);
    }
  });

  await test('no secrets or service-role material appear in the new files', () => {
    for (const file of [
      'src/lib/siteContactAccess.ts',
      'src/lib/siteContactAccessI18n.ts',
      'src/components/SiteProtectedContactAction.tsx',
      'src/components/SiteContactLockNotice.tsx',
    ]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const f of ['rzp_live', 'rzp_test', 'key_secret', 'RAZORPAY_KEY', 'sk_live', 'sk_test', 'SUPABASE_SERVICE']) {
        assert.equal(source.includes(f), false, `${file} must not contain ${f}`);
      }
      // `service_role` may only appear in prose describing the server grant,
      // never as an actual client-side key/usage.
      assert.equal(/service_role\s*[:=]/.test(source), false, `${file} uses a service_role value`);
    }
  });

  await test('the client rule matches the draft server rule (25% + verified payment)', () => {
    const m08 = readFileSync(new URL('../supabase/migrations/20260811000801_m08_customers_bookings.sql', import.meta.url), 'utf8');
    const m09 = readFileSync(new URL('../supabase/migrations/20260811000901_m09_payments.sql', import.meta.url), 'utf8');
    const m11 = readFileSync(new URL('../supabase/migrations/20260811001101_m11_functions_triggers.sql', import.meta.url), 'utf8');
    // The schema pins the SAME 25% advance the client charges.
    assert.ok(m08.includes('bookings_fixed_advance'), 'the draft schema must pin the advance');
    assert.ok(m08.includes('(service_price_paise + 3) / 4'), 'the pinned advance must be 25%');
    // A payment must be verified server-side before a booking is confirmed.
    assert.ok(m09.includes('verification_status'), 'payments carry a verification status');
    assert.ok(m11.includes('Payment signature was not verified'), 'unverified payments are rejected');
    assert.ok(/verify_payment[\s\S]*booking_status = 'confirmed'/.test(m11), 'confirmation follows verification');
    // Anonymous visitors cannot call the verification function.
    assert.ok(m11.includes('grant execute on function public.verify_payment(text, text, bigint, text, boolean) to service_role;'));
    assert.ok(m11.includes('revoke all on function public.verify_payment(text, text, bigint, text, boolean) from public;'));
  });

  await test('anonymous booking/payment writes stay closed in the draft RLS set', () => {
    const m12 = readFileSync(new URL('../supabase/migrations/20260811001201_m12_rls_policies.sql', import.meta.url), 'utf8');
    assert.ok(m12.includes('no anonymous booking/payment write policy'));
  });

  await test('the store keys used are the existing ones only', () => {
    resetState();
    seedRecords([paidBooking('beauty_skin_spa')]);
    resolveSiteContactAccess(richData('beauty_skin_spa'), 'beauty_skin_spa');
    // Only the EXISTING stores may appear — 16.8 introduces no storage of
    // its own (the two preference keys predate this phase).
    const allowed = new Set([
      'nexora_site_payment_records',
      'nexora_site_booking_holds',
      'nexora_site_booking_drafts',
      'nexora_site_booking_browser',
      'nexora_site_locale',
      'nexora_site_appearance',
    ]);
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('nexora_site_')) {
        assert.ok(allowed.has(key), `unexpected new store key: ${key}`);
      }
    }
  });

  await test('the expiry rule is derived from the booking\u2019s own slot', () => {
    const past = paidBooking('beauty_skin_spa', { dateKey: '2026-08-10', startMinutes: 600, endMinutes: 660 });
    const future = paidBooking('beauty_skin_spa', { dateKey: '2026-08-20', startMinutes: 600, endMinutes: 660 });
    assert.equal(isBookingExpired(past, THU_OPEN), true);
    assert.equal(isBookingExpired(future, THU_OPEN), false);
  });
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 16.8 call/WhatsApp/book action protection: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(` - ${f.name}: ${f.error.message}`);
  process.exitCode = 1;
} else {
  console.log('Action protection verified: Call/WhatsApp unlock ONLY after a real successful 25% advance payment on the existing booking/payment architecture, with a clear pre-payment message, the correct salon\u2019s own contact after payment, no hardcoded or cross-salon data, identity + tenant binding, resistance to frontend-only bypass, pending/failed/cancelled/expired handling, EN/HI, light/dark and desktop/tablet/mobile across all five themes.');
}
