/**
 * M41 — website guest booking wiring (legacy public templates, e.g. /nexora-demo-salon)
 *
 * Mounts the REAL legacy TemplateRenderer in jsdom with the brand-fallback
 * salon (Nexora Demo Salon) and a mocked database API, then verifies:
 *   1. On component load, services/experts/slots are fetched from
 *      GET /api/salons/:slug/booking-context (database API).
 *   2. "Call Now" renders href="tel:+919876543210" and "WhatsApp" renders
 *      href="https://wa.me/919876543210?text=<pre-filled message>" (direct
 *      actions; the message is white-label overridable via websiteCopy).
 *   3. Book Slot / Book Bundle / Book with Stylist / Book Appointment Now /
 *      Book Online each open the shared BookingModal.
 *   4. The modal pre-fills Service Name, Price and Duration from the clicked
 *      button (service card, package card, stylist card).
 *   5. Submitting POSTs the guest payload (salonSlug, serviceId, staffId,
 *      date, time, customerName, customerPhone) to /api/bookings and shows
 *      the server-returned booking reference on the success screen.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/nexora-demo-salon',
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

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent, waitFor } = await import('@testing-library/react');

const { buildBrandFallbackSalonData } = await import('../src/lib/salonRouting.ts');
const { initialData } = await import('../src/types.ts');
const TemplateRenderer = (await import('../src/components/TemplateRenderer.tsx')).default;

/* ------------------------------------------------------------------ */
/* Mocked database API                                                 */
/* ------------------------------------------------------------------ */
const SALON = buildBrandFallbackSalonData('nexora-demo-salon');

function isoPlusDays(offset) {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const days = [];
for (let offset = 0; offset < 14; offset += 1) {
  const date = isoPlusDays(offset);
  const dayName = DAY_NAMES[new Date(`${date}T12:00:00`).getDay()];
  const open = SALON.openingHours[dayName].open;
  const totalSlots = open ? 20 : 0;
  days.push({ date, open, totalSlots, freeSlots: open ? 18 : 0 });
}
const slotGrid = [];
for (let t = 10 * 60; t + 30 <= 20 * 60; t += 30) {
  slotGrid.push({ time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, available: true });
}

const contextPayload = {
  salon: { id: 'salon-uuid-1', slug: 'nexora-demo-salon', name: SALON.salonName, phone: SALON.phone },
  services: SALON.services.map((service) => ({
    id: service.id, name: service.name, price: service.price, duration: service.duration, featured: service.featured,
  })),
  experts: SALON.team.map((member) => ({ id: member.id, name: member.name, role: member.role })),
  hours: SALON.openingHours,
  days,
  slots: null,
};

const firstService = contextPayload.services[0];
const bookingResult = {
  bookingId: 'b0000000-0000-4000-8000-000000000001',
  bookingReference: 'NX-123456',
  serviceName: firstService.name,
  amount: firstService.price,
  currency: 'INR',
  durationMinutes: firstService.duration,
  appointmentDate: isoPlusDays(1),
  startTime: '10:00',
  endTime: '10:30',
  status: 'pending',
};

const fetchCalls = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  fetchCalls.push({ url, init });
  if (url.startsWith('/api/salons/')) {
    const payload = url.includes('date=') ? { ...contextPayload, slots: slotGrid } : contextPayload;
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url === '/api/bookings' && init?.method === 'POST') {
    return new Response(JSON.stringify(bookingResult), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('not found', { status: 404 });
};

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

function buttonByText(container, label) {
  const match = Array.from(container.querySelectorAll('button, a')).find((el) =>
    el.textContent.trim().replace(/\s+/g, ' ') === label || el.textContent.trim().startsWith(label));
  assert.ok(match, `Button/anchor "${label}" not found`);
  return match;
}

async function openModal(label) {
  fireEvent.click(buttonByText(document.body, label));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, `Dialog did not open for "${label}"`);
  return dialog;
}

function closeDialog() {
  const close = document.querySelector('[role="dialog"] button[aria-label="Close booking form"]');
  assert.ok(close, 'Close button not found');
  fireEvent.click(close);
}

/* ------------------------------------------------------------------ */
/* 1. Component load: database API fetch + direct actions              */
/* ------------------------------------------------------------------ */
console.log('M41 — website guest booking wiring (legacy templates)');
const { container, unmount } = render(React.createElement(TemplateRenderer, { data: SALON, mode: 'desktop' }));
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

await test('component load fetches booking context from the database API', async () => {
  const contextCall = fetchCalls.find((call) => call.url.startsWith('/api/salons/nexora-demo-salon/booking-context'));
  assert.ok(contextCall, 'No /api/salons/:slug/booking-context request on load');
});

await test('"Call Now" renders tel:+919876543210', async () => {
  const call = buttonByText(container, 'Call Now');
  assert.equal(call.tagName, 'A');
  assert.equal(call.getAttribute('href'), 'tel:+919876543210');
});

await test('"WhatsApp" renders https://wa.me/919876543210 with a pre-filled message', async () => {
  const wa = buttonByText(container, 'WhatsApp');
  assert.equal(wa.tagName, 'A');
  const href = wa.getAttribute('href');
  assert.ok(href.startsWith('https://wa.me/919876543210'), `WhatsApp base number wrong: ${href}`);
  const parsed = new URL(href);
  assert.ok(parsed.searchParams.has('text'), 'WhatsApp message pre-fill missing');
  const message = parsed.searchParams.get('text');
  assert.ok(message.includes('Nexora Demo Salon'), `WhatsApp pre-fill should name the salon: ${message}`);
});

/* ------------------------------------------------------------------ */
/* 2. Book Slot → prefilled service (name, price, duration)            */
/* ------------------------------------------------------------------ */
await test('Book Slot opens the modal prefilled with Service Name, Price, Duration', async () => {
  const dialog = await openModal('Book Slot');
  assert.ok(dialog.textContent.includes('Book an Appointment'));
  assert.ok(dialog.textContent.includes(firstService.name), 'Service name not prefilled');
  assert.ok(dialog.textContent.includes(`₹${firstService.price}`), 'Price not prefilled');
  assert.ok(dialog.textContent.includes(`${firstService.duration} min`), 'Duration not prefilled');
  closeDialog();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
});

/* ------------------------------------------------------------------ */
/* 3. Book Bundle → prefilled bundle (name, price, duration)           */
/* ------------------------------------------------------------------ */
const firstPackage = SALON.packages[0];
await test('Book Bundle opens the modal prefilled with the bundle', async () => {
  const dialog = await openModal('Book Bundle');
  assert.ok(dialog.textContent.includes(firstPackage.name), 'Bundle name not prefilled');
  assert.ok(dialog.textContent.includes(`₹${firstPackage.price.toLocaleString('en-IN')}`), 'Bundle price not prefilled');
  const note = dialog.querySelector('textarea');
  assert.ok(note && note.value.includes('Requested bundle'), 'Bundle note not auto-filled');
  closeDialog();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
});

/* ------------------------------------------------------------------ */
/* 4. Book with Stylist → stylist preselected                           */
/* ------------------------------------------------------------------ */
const firstStylist = SALON.team[0];
await test('Book with {Stylist} opens the modal with the stylist preselected', async () => {
  const dialog = await openModal(`Book with ${firstStylist.name.split(' ')[0]}`);
  const selects = Array.from(dialog.querySelectorAll('select'));
  const stylistSelect = selects.find((select) => select.options.length > 1 && Array.from(select.options).some((option) => option.textContent.includes(firstStylist.name)));
  assert.ok(stylistSelect, 'Stylist select not found');
  assert.equal(stylistSelect.value, firstStylist.id, 'Stylist not preselected');
  closeDialog();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
});

/* ------------------------------------------------------------------ */
/* 5. Hero "Book Appointment Now" + "Book Online" open the modal        */
/* ------------------------------------------------------------------ */
await test('Hero "Book Appointment Now" and "Book Online" open the modal', async () => {
  const hero = await openModal('Book Appointment Now');
  assert.ok(hero.textContent.includes('Book an Appointment'));
  closeDialog();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });

  const online = await openModal('Book Online');
  assert.ok(online.textContent.includes('Book an Appointment'));
  closeDialog();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
});

/* ------------------------------------------------------------------ */
/* 6. Full flow: date → slot → details → POST /api/bookings → confirm  */
/* ------------------------------------------------------------------ */
await test('full booking flow POSTs the guest payload and shows the reference', async () => {
  const dialog = await openModal('Book Slot');
  const chosenDate = contextPayload.days.find((day) => day.open && day.freeSlots > 0).date;

  // Pick the first available day (the modal also auto-selects it).
  const dayButtons = Array.from(dialog.querySelectorAll('button')).filter((button) =>
    typeof button.className === 'string' && button.className.includes('w-14'));
  const dayButton = dayButtons.find((button) => !button.disabled);
  assert.ok(dayButton, 'No selectable date found in the strip');
  fireEvent.click(dayButton);

  // Wait for the per-day slot grid, then pick the first slot.
  await waitFor(() => {
    const slots = Array.from(dialog.querySelectorAll('button')).filter((button) =>
      /\d{1,2}:\d{2} (AM|PM)/.test(button.textContent));
    assert.ok(slots.length > 0, 'slot grid missing');
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  const slotButtons = Array.from(dialog.querySelectorAll('button')).filter((button) => /\d{1,2}:\d{2} (AM|PM)/.test(button.textContent));
  assert.ok(slotButtons.length > 0, 'No time slots rendered');
  const firstSlot = slotButtons.find((button) => !button.disabled);
  assert.ok(firstSlot, 'No selectable slot');
  fireEvent.click(firstSlot);

  // Customer details.
  const inputs = dialog.querySelectorAll('input[type="text"], input[type="tel"]');
  fireEvent.change(inputs[0], { target: { value: 'Aisha Verma' } });
  fireEvent.change(inputs[1], { target: { value: '+91 98765 43210' } });

  const before = fetchCalls.filter((call) => call.url === '/api/bookings').length;
  fireEvent.click(buttonByText(dialog, 'Confirm Booking'));

  await waitFor(async () => {
    const posts = fetchCalls.filter((call) => call.url === '/api/bookings' && call.init?.method === 'POST');
    assert.ok(posts.length > before, 'POST /api/bookings was not sent');
    const body = JSON.parse(posts[posts.length - 1].init.body);
    assert.equal(body.salonSlug, 'nexora-demo-salon');
    assert.equal(body.serviceId, firstService.id);
    assert.equal(body.date, chosenDate);
    assert.equal(body.time, slotGrid[0].time);
    assert.equal(body.customerName, 'Aisha Verma');
    assert.equal(body.customerPhone, '+91 98765 43210');
    assert.ok(body.staffId === undefined || body.staffId === null);
  });

  await waitFor(() => {
    assert.ok(dialog.textContent.includes('Booking received!'), 'Success screen missing');
    assert.ok(dialog.textContent.includes(bookingResult.bookingReference), 'Booking reference missing');
  });
});

cleanup();
unmount();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
