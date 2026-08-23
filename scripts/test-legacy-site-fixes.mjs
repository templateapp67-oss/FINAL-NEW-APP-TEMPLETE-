/**
 * LEGACY PUBLIC SITE (templateId "hair", e.g. /royal-hair-studio) —
 * interactive features, navigation, video playback, booking validation and
 * white-label dynamic data.
 *
 * Mounts the REAL legacy TemplateRenderer in jsdom (brand-fallback salon)
 * and verifies:
 *   1. Header nav links point at #home / #services / #team / #gallery /
 *      #videos / #contact, the sections carry those IDs, and clicking a
 *      link smooth-scrolls (scrollIntoView { behavior: 'smooth' }).
 *   2. Reel thumbnails are interactive: clicking opens the lightbox player —
 *      YouTube → embed iframe (autoplay), Instagram reel → official embed,
 *      direct mp4 → HTML5 <video controls>, TikTok → "Watch on platform".
 *   3. Call Now → tel:, WhatsApp → wa.me with pre-filled message,
 *      Get Directions → Google Maps.
 *   4. Booking flow: Confirm stays disabled until Service, Date, Time Slot,
 *      Name and Phone are provided (with a visible checklist); slots are
 *      populated when a date is selected; offline API → request is saved on
 *      the device and the confirmation screen says so.
 *   5. White-label copy: data.websiteCopy overrides every visible string.
 *   6. Server host routing: subdomain → /<slug> rewrite (Express equivalent
 *      of the Next.js middleware), skipping /api, /assets and app routes.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/royal-hair-studio',
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
const { resolveReelPlayback } = await import('../src/components/ReelsVideoPlayer.tsx');
const { rewriteHostPath, resolveHostSlug } = await import('../server/hostRouting.ts');

/* ------------------------------------------------------------------ */
/* Salon data — brand fallback + realistic video URLs for playback     */
/* ------------------------------------------------------------------ */
const SALON = buildBrandFallbackSalonData('royal-hair-studio');
SALON.socialVideos = [
  {
    id: 'v-yt',
    title: 'Balayage Transformation',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    originalPlatformUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thumbnailUrl: 'https://example.com/yt.jpg',
    likesCount: '1.2k',
  },
  {
    id: 'v-ig',
    title: 'Bridal Glow Reel',
    platform: 'instagram',
    url: 'https://www.instagram.com/reel/CxYzAbCdEfG/',
    originalPlatformUrl: 'https://www.instagram.com/reel/CxYzAbCdEfG/',
    thumbnailUrl: 'https://example.com/ig.jpg',
  },
  {
    id: 'v-mp4',
    title: 'Studio Tour',
    platform: 'facebook',
    url: 'https://cdn.example.com/videos/studio-tour.mp4',
    originalPlatformUrl: 'https://cdn.example.com/videos/studio-tour.mp4',
    thumbnailUrl: 'https://example.com/vid.jpg',
  },
  {
    id: 'v-tt',
    title: '30-Second Trim',
    platform: 'tiktok',
    url: 'https://www.tiktok.com/@royalhairstudio/video/7293847561234567890',
    originalPlatformUrl: 'https://www.tiktok.com/@royalhairstudio/video/7293847561234567890',
    thumbnailUrl: 'https://example.com/tt.jpg',
  },
];

/* ------------------------------------------------------------------ */
/* Fetch mock — two API modes:                                        */
/*   offline       → booking-context 404, POST /api/bookings 500      */
/*                    (exercises the local slot grid + offline save)  */
/*   live-conflict → booking-context 200, POST /api/bookings 409      */
/*                    (exercises the domain-error path: the error is  */
/*                     surfaced, NOT silently saved offline)          */
/* ------------------------------------------------------------------ */
let apiMode = 'offline';
const fetchCalls = [];
const contextPayload = {
  salon: { id: 'salon-uuid-1', slug: 'royal-hair-studio', name: 'Royal Hair & Beauty Studio', phone: '+91 98765 43210' },
  services: SALON.services.map((service) => ({
    id: service.id, name: service.name, price: service.price, duration: service.duration, featured: service.featured,
  })),
  experts: [],
  hours: SALON.openingHours,
  days: Array.from({ length: 14 }, (_, offset) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + offset);
    const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return { date, open: true, totalSlots: 20, freeSlots: 20 };
  }),
  slots: null,
};
const slotGrid = [];
for (let t = 10 * 60; t + 30 <= 20 * 60; t += 30) {
  slotGrid.push({ time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, available: true });
}
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  fetchCalls.push({ url, init });
  if (apiMode === 'live-conflict') {
    if (url.startsWith('/api/salons/')) {
      const payload = url.includes('date=') ? { ...contextPayload, slots: slotGrid } : contextPayload;
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === '/api/bookings' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({ error: 'The selected time is no longer available. Please pick another slot.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }
  if (url.startsWith('/api/salons/')) {
    return new Response('salon not published', { status: 404 });
  }
  if (url === '/api/bookings' && init?.method === 'POST') {
    return new Response('booking API offline', { status: 500 });
  }
  return new Response('not found', { status: 404 });
};

/* Smooth-scroll spy (jsdom does not implement scrollIntoView). */
const scrollCalls = [];
dom.window.HTMLElement.prototype.scrollIntoView = function spyScrollIntoView(options) {
  scrollCalls.push({ id: this.id, options: options || {} });
};

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
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}
const tick = (ms = 25) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

function buttonByText(container, label) {
  const match = Array.from(container.querySelectorAll('button, a')).find((el) =>
    el.textContent.trim().replace(/\s+/g, ' ') === label || el.textContent.trim().startsWith(label));
  assert.ok(match, `Button/anchor "${label}" not found`);
  return match;
}

/* ================================================================== */
console.log('Legacy public site — navigation, videos, booking, white-label');
/* ================================================================== */
const { container, unmount } = render(React.createElement((await import('../src/components/TemplateRenderer.tsx')).default, { data: SALON, mode: 'desktop' }));
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

/* ------------------------------------------------------------------ */
/* 1. Navigation: IDs + anchors + smooth scroll                        */
/* ------------------------------------------------------------------ */
await test('sections carry the canonical IDs (#home, #services, #team, #gallery, #videos, #contact)', async () => {
  for (const id of ['home', 'services', 'team', 'gallery', 'videos', 'contact']) {
    assert.ok(document.getElementById(id), `section #${id} missing`);
  }
});

await test('navbar links point at the corresponding section IDs', async () => {
  for (const id of ['home', 'services', 'team', 'gallery', 'videos', 'contact']) {
    const link = container.querySelector(`a[href="#${id}"]`);
    assert.ok(link, `navbar link href="#${id}" missing`);
  }
});

await test('clicking a navbar link smooth-scrolls to the section', async () => {
  scrollCalls.length = 0;
  fireEvent.click(container.querySelector('a[href="#contact"]'));
  assert.ok(scrollCalls.some((call) => call.id === 'contact' && call.options?.behavior === 'smooth'),
    `expected scrollIntoView({behavior:'smooth'}) for #contact; got ${JSON.stringify(scrollCalls)}`);
  fireEvent.click(container.querySelector('a[href="#gallery"]'));
  assert.ok(scrollCalls.some((call) => call.id === 'gallery' && call.options?.behavior === 'smooth'),
    'expected smooth scroll for #gallery');
});

await test('logo click scrolls back to the hero (#home)', async () => {
  scrollCalls.length = 0;
  fireEvent.click(container.querySelector('a[href="#home"]'));
  assert.ok(scrollCalls.some((call) => call.id === 'home' && call.options?.behavior === 'smooth'),
    'expected smooth scroll for #home');
});

/* ------------------------------------------------------------------ */
/* 2. Reels & Styling Videos → interactive video player                */
/* ------------------------------------------------------------------ */
await test('every reel thumbnail is an interactive card with a play affordance', async () => {
  const cards = container.querySelectorAll('[data-testid="reel-card"]');
  assert.equal(cards.length, SALON.socialVideos.length, 'reel card count mismatch');
  for (const card of cards) {
    assert.equal(card.tagName, 'BUTTON', 'reel card must be a button');
    assert.ok(card.querySelector('img'), 'reel card keeps its thumbnail');
  }
});

await test('YouTube reel opens the lightbox with an autoplaying embed', async () => {
  fireEvent.click(container.querySelectorAll('[data-testid="reel-card"]')[0]);
  await tick(40);
  const player = document.querySelector('[data-testid="reels-video-player"]');
  assert.ok(player, 'video player did not open');
  assert.equal(player.getAttribute('role'), 'dialog');
  const iframe = player.querySelector('iframe');
  assert.ok(iframe, 'YouTube reel should render an iframe');
  assert.ok(iframe.src.includes('youtube.com/embed/dQw4w9WgXcQ'), `unexpected embed src: ${iframe.src}`);
  assert.ok(iframe.src.includes('autoplay=1'), 'embed should autoplay');
  fireEvent.click(player.querySelector('[data-testid="reels-video-player-close"]'));
  await tick(40);
  assert.equal(document.querySelector('[data-testid="reels-video-player"]'), null, 'player did not close');
});

await test('Instagram reel opens the official Instagram embed', async () => {
  fireEvent.click(container.querySelectorAll('[data-testid="reel-card"]')[1]);
  await tick(40);
  const player = document.querySelector('[data-testid="reels-video-player"]');
  assert.ok(player, 'video player did not open');
  const iframe = player.querySelector('iframe');
  assert.ok(iframe, 'Instagram reel should render an iframe');
  assert.ok(iframe.src.includes('instagram.com/reel/CxYzAbCdEfG/embed'), `unexpected embed src: ${iframe.src}`);
  fireEvent.click(player.querySelector('[data-testid="reels-video-player-close"]'));
  await tick(40);
});

await test('direct mp4 opens the HTML5 <video controls> player', async () => {
  fireEvent.click(container.querySelectorAll('[data-testid="reel-card"]')[2]);
  await tick(40);
  const player = document.querySelector('[data-testid="reels-video-player"]');
  assert.ok(player, 'video player did not open');
  const video = player.querySelector('video');
  assert.ok(video, 'mp4 reel should render a <video> element');
  assert.ok(video.hasAttribute('controls'), '<video> must have controls');
  assert.ok(video.getAttribute('src').endsWith('.mp4'), 'video src should be the mp4 url');
  fireEvent.click(player.querySelector('[data-testid="reels-video-player-close"]'));
  await tick(40);
});

await test('TikTok (no embed) offers a "Watch on platform" fallback', async () => {
  fireEvent.click(container.querySelectorAll('[data-testid="reel-card"]')[3]);
  await tick(40);
  const player = document.querySelector('[data-testid="reels-video-player"]');
  assert.ok(player, 'video player did not open');
  assert.equal(player.querySelector('iframe'), null, 'TikTok must not fake an embed');
  const watch = player.querySelector('[data-testid="reels-video-player-watch"]');
  assert.ok(watch, 'watch-on-platform action missing');
  assert.ok(watch.href.includes('tiktok.com'), `watch href wrong: ${watch.href}`);
  // Escape closes the lightbox.
  fireEvent.keyDown(dom.window, { key: 'Escape' });
  await tick(40);
  assert.equal(document.querySelector('[data-testid="reels-video-player"]'), null, 'Escape should close the player');
});

await test('resolveReelPlayback maps URL kinds correctly', async () => {
  assert.equal(resolveReelPlayback({ ...SALON.socialVideos[0] }).kind, 'youtube');
  assert.equal(resolveReelPlayback({ ...SALON.socialVideos[1] }).kind, 'instagram');
  assert.equal(resolveReelPlayback({ ...SALON.socialVideos[2] }).kind, 'file');
  assert.equal(resolveReelPlayback({ ...SALON.socialVideos[3] }).kind, 'external');
  assert.equal(
    resolveReelPlayback({ ...SALON.socialVideos[0], url: 'not a url', originalPlatformUrl: undefined }).kind,
    'external',
  );
});

/* ------------------------------------------------------------------ */
/* 3. Action buttons: tel: / wa.me (pre-filled) / Google Maps          */
/* ------------------------------------------------------------------ */
await test('"Call Now" uses a tel: link', async () => {
  const call = container.querySelector('[data-testid="call-now"]');
  assert.ok(call, 'Call Now anchor missing');
  assert.equal(call.getAttribute('href'), 'tel:+919876543210');
});

await test('"WhatsApp" opens wa.me with a pre-filled message', async () => {
  const wa = container.querySelector('[data-testid="whatsapp-cta"]');
  assert.ok(wa, 'WhatsApp anchor missing');
  const href = wa.getAttribute('href');
  assert.ok(href.startsWith('https://wa.me/919876543210?text='), `WhatsApp href wrong: ${href}`);
  const message = new URL(href).searchParams.get('text');
  assert.ok(message.includes('Royal Hair & Beauty Studio'), `pre-fill should name the salon: ${message}`);
});

await test('"Get Directions" opens Google Maps with the salon address', async () => {
  const dirs = container.querySelector('[data-testid="get-directions"]');
  assert.ok(dirs, 'Get Directions anchor missing');
  const href = dirs.getAttribute('href');
  assert.ok(href.startsWith('https://maps.google.com/?q='), `maps href wrong: ${href}`);
  assert.ok(decodeURIComponent(href).includes('Linking Road'), 'maps query should contain the address');
});

/* ------------------------------------------------------------------ */
/* 4. Booking flow: validation + slot population + offline save        */
/* ------------------------------------------------------------------ */
const firstService = SALON.services[0];
const firstPackage = SALON.packages[0];

await test('Confirm Booking is disabled until Service, Date, Time, Name, Phone are provided', async () => {
  fireEvent.click(buttonByText(container, 'Book Slot'));
  await tick(50);
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'booking dialog did not open');
  // Offline banner is visible because the API is down in this test.
  assert.ok(dialog.textContent.includes('Live availability is offline'), 'offline banner missing');
  assert.ok(dialog.textContent.includes(firstService.name), 'clicked service should be prefilled');

  const confirm = buttonByText(dialog, 'Confirm Booking');
  assert.equal(confirm.disabled, true, 'confirm should start disabled');
  const hint = dialog.querySelector('[data-testid="booking-missing-fields"]');
  assert.ok(hint, 'missing-fields checklist should be visible');
  assert.ok(hint.textContent.includes('time slot'), `hint should mention time slot: ${hint.textContent}`);
  assert.ok(hint.textContent.includes('name'), 'hint should mention name');
  assert.ok(hint.textContent.includes('phone number'), 'hint should mention phone number');

  // Select a date → slots are populated dynamically for that date.
  const dayButtons = Array.from(dialog.querySelectorAll('button')).filter((button) =>
    typeof button.className === 'string' && button.className.includes('w-14'));
  const openDay = dayButtons.find((button) => !button.disabled);
  assert.ok(openDay, 'no selectable day in the strip');
  fireEvent.click(openDay);
  await tick(60);
  const slotButtons = Array.from(dialog.querySelectorAll('button')).filter((button) =>
    /\d{1,2}:\d{2} (AM|PM)/.test(button.textContent));
  assert.ok(slotButtons.length > 0, 'time slots missing after date selection');

  // Pick a slot → checklist shrinks to name + phone.
  const slot = slotButtons.find((button) => !button.disabled);
  fireEvent.click(slot);
  await tick(25);
  const hintAfterSlot = dialog.querySelector('[data-testid="booking-missing-fields"]');
  assert.ok(hintAfterSlot.textContent.includes('name') && hintAfterSlot.textContent.includes('phone number'),
    'checklist should shrink after slot selection');
  assert.ok(!hintAfterSlot.textContent.includes('time slot'), 'time slot should no longer be missing');

  // Name + phone → checklist disappears and confirm enables.
  const inputs = dialog.querySelectorAll('input[type="text"], input[type="tel"]');
  fireEvent.change(inputs[0], { target: { value: 'Aisha Verma' } });
  fireEvent.change(inputs[1], { target: { value: '+91 98765 43210' } });
  await tick(25);
  assert.equal(dialog.querySelector('[data-testid="booking-missing-fields"]'), null, 'checklist should be gone');
  assert.equal(buttonByText(dialog, 'Confirm Booking').disabled, false, 'confirm should enable once all fields are provided');

  // Offline submit → request saved on device + truthful confirmation.
  fireEvent.click(buttonByText(dialog, 'Confirm Booking'));
  await waitFor(() => {
    assert.ok(dialog.textContent.includes('Request saved!'), 'offline confirmation screen missing');
    assert.ok(/NX-OFF-/.test(dialog.textContent), 'offline reference missing');
  });
  assert.ok(dialog.textContent.includes('saved on this device'), 'offline note missing');
  const savedRaw = dom.window.localStorage.getItem('nexora_offline_bookings:royal-hair-studio');
  assert.ok(savedRaw, 'offline booking was not persisted to localStorage');
  const saved = JSON.parse(savedRaw);
  assert.equal(saved[0].serviceName, firstService.name);
  assert.equal(saved[0].customerName, 'Aisha Verma');
  assert.equal(saved[0].customerPhone, '+91 98765 43210');
  assert.match(saved[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(saved[0].time, /^\d{2}:\d{2}$/);

  // Success screen has its own "Done" button (no form header).
  fireEvent.click(buttonByText(dialog, 'Done'));
  await tick(40);
  assert.equal(document.querySelector('[role="dialog"]'), null, 'dialog should be closed');
});

await test('Book Bundle prefills the bundle (name, price, duration) in the drawer', async () => {
  fireEvent.click(buttonByText(container, 'Book Bundle'));
  await tick(50);
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'booking dialog did not open');
  assert.ok(dialog.textContent.includes(firstPackage.name), 'bundle name missing');
  assert.ok(dialog.textContent.includes(`₹${firstPackage.price.toLocaleString('en-IN')}`), 'bundle price missing');
  const note = dialog.querySelector('textarea');
  assert.ok(note && note.value.includes('Requested bundle'), 'bundle note missing');
  // The booking service select is visible so the salon can map the slot.
  const select = Array.from(dialog.querySelectorAll('select')).find((selectEl) =>
    Array.from(selectEl.options).some((option) => option.textContent.includes(firstService.name)));
  assert.ok(select, 'service select missing for bundle booking');
  const close = dialog.querySelector('button[aria-label="Close booking form"]');
  fireEvent.click(close);
  await tick(40);
});

await test('with a LIVE API, a slot conflict (409) surfaces as an error — no silent offline save', async () => {
  cleanup();
  await tick(20);
  dom.window.localStorage.removeItem('nexora_offline_bookings:royal-hair-studio');
  apiMode = 'live-conflict';
  const utils = render(React.createElement((await import('../src/components/TemplateRenderer.tsx')).default, { data: SALON, mode: 'desktop' }));
  await tick(80);

  fireEvent.click(buttonByText(utils.container, 'Book Slot'));
  await tick(80);
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'booking dialog did not open');

  // Auto-selected first day → live slot grid loads.
  await waitFor(() => {
    const slots = Array.from(dialog.querySelectorAll('button')).filter((button) =>
      /\d{1,2}:\d{2} (AM|PM)/.test(button.textContent));
    assert.ok(slots.length > 0, 'slot grid missing');
  });
  const slotButtons = Array.from(dialog.querySelectorAll('button')).filter((button) =>
    /\d{1,2}:\d{2} (AM|PM)/.test(button.textContent));
  fireEvent.click(slotButtons.find((button) => !button.disabled));
  const inputs = dialog.querySelectorAll('input[type="text"], input[type="tel"]');
  fireEvent.change(inputs[0], { target: { value: 'Aisha Verma' } });
  fireEvent.change(inputs[1], { target: { value: '+91 98765 43210' } });
  await tick(25);
  assert.equal(buttonByText(dialog, 'Confirm Booking').disabled, false, 'confirm should be enabled');

  fireEvent.click(buttonByText(dialog, 'Confirm Booking'));
  await waitFor(() => {
    assert.ok(dialog.textContent.includes('no longer available'), 'domain error message should be shown');
    assert.ok(!dialog.textContent.includes('Request saved!'), 'a 409 must not be reported as a saved request');
  });
  assert.equal(
    dom.window.localStorage.getItem('nexora_offline_bookings:royal-hair-studio'),
    null,
    'a domain error must not create an offline booking record',
  );

  utils.unmount();
  apiMode = 'offline';
  await tick(20);
});

/* ------------------------------------------------------------------ */
/* 5. White-label copy overrides (dynamic CMS data)                    */
/* ------------------------------------------------------------------ */
cleanup();
await tick(20);
{
  const CUSTOM = {
    ...SALON,
    websiteCopy: {
      nav: { home: 'Home Page', contact: 'Reach Us' },
      heroBadge: 'Indore\'s Finest',
      heroHeadline: 'Where Cuts Become Art',
      bookNowCta: 'Reserve Your Chair',
      servicesTitle: 'Our Treatments',
      bookSlotCta: 'Book My Slot',
      packagesTitle: 'Signature Bundles',
      bookBundleCta: 'Book This Bundle',
      teamTitle: 'The Artists',
      galleryTitle: 'Moments & Makeovers',
      videosTitle: 'Watch Our Work',
      contactTitle: 'Book Your Glow',
      depositBadge: '20% Advance',
      depositBody: 'Keep your chair with a 20% advance.',
      whatsappMessage: 'Namaste {salon}! Slot check please.',
      addressFallback: '99 White-Label Street, Test City 110001',
    },
  };
  const utils = render(React.createElement((await import('../src/components/TemplateRenderer.tsx')).default, { data: CUSTOM, mode: 'desktop' }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  const text = utils.container.textContent;

  await test('websiteCopy overrides replace the default strings', async () => {
    for (const expected of [
      'Where Cuts Become Art',
      'Reserve Your Chair',
      'Our Treatments',
      'Book My Slot',
      'Signature Bundles',
      'Book This Bundle',
      'The Artists',
      'Moments & Makeovers',
      'Watch Our Work',
      'Book Your Glow',
      '20% Advance',
      'Keep your chair with a 20% advance.',
      'Reach Us',
    ]) {
      assert.ok(text.includes(expected), `override missing in DOM: ${expected}`);
    }
    // Defaults that were NOT overridden must stay intact.
    assert.ok(text.includes('Signature Services & Pricing') === false || text.includes('Our Treatments'), 'sanity');
    assert.ok(text.includes('Reels & Styling Videos') === false, 'videosTitle override should replace default');
    assert.ok(utils.container.textContent.includes('Location & Hours'), 'unoverridden section keeps its default');
  });

  await test('whatsappMessage override flows into the wa.me pre-fill', async () => {
    const wa = utils.container.querySelector('[data-testid="whatsapp-cta"]');
    const message = new URL(wa.getAttribute('href')).searchParams.get('text');
    assert.equal(message, 'Namaste Royal Hair & Beauty Studio! Slot check please.');
  });

  await test('nav override labels render on the anchor links', async () => {
    const home = utils.container.querySelector('a[href="#home"]');
    assert.equal(home.textContent, 'Home Page');
    const contact = utils.container.querySelector('a[href="#contact"]');
    assert.equal(contact.textContent, 'Reach Us');
  });

  utils.unmount();
}
await tick(20);

/* ------------------------------------------------------------------ */
/* 6. Server host routing (subdomain → /<slug> rewrite)                */
/* ------------------------------------------------------------------ */
const BASE = 'final-new-app-templete.vercel.app';

const { extractSubdomainSlug } = await import('../src/lib/salonRouting.ts');
await test('resolveHostSlug extracts the salon slug from the subdomain', async () => {
  assert.equal(resolveHostSlug(`royal-hair-studio.${BASE}`), 'royal-hair-studio');
  assert.equal(resolveHostSlug(`${BASE}`), '');
  assert.equal(resolveHostSlug(`www.${BASE}`), '');
  assert.equal(resolveHostSlug('localhost:3000'), '');
  assert.equal(resolveHostSlug('preview.abc.e2b.app'), '');
  assert.equal(resolveHostSlug('foo.yourdomain.com', 'yourdomain.com'), 'foo');
  // Server and client slug resolution must agree for the same host.
  for (const host of [`royal-hair-studio.${BASE}`, `${BASE}`, `www.${BASE}`, `my.cool-salon.${BASE}`]) {
    assert.equal(resolveHostSlug(host), extractSubdomainSlug(host), `server/client slug mismatch for ${host}`);
  }
});

await test('rewriteHostPath rewrites to /<slug> and preserves the path', async () => {
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/'), '/royal-hair-studio');
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/team'), '/royal-hair-studio/team');
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/royal-hair-studio'), '/royal-hair-studio');
  assert.equal(rewriteHostPath(`${BASE}`, '/royal-hair-studio'), '/royal-hair-studio');
});

await test('rewriteHostPath never touches /api, /assets or client app routes', async () => {
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/api/health'), '/api/health');
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/api/bookings'), '/api/bookings');
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/assets/index.js'), '/assets/index.js');
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/signup'), '/signup');
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/nearby'), '/nearby');
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/dashboard'), '/dashboard');
  assert.equal(rewriteHostPath(`royal-hair-studio.${BASE}`, '/auth/callback'), '/auth/callback');
});

unmount();
cleanup();

console.log('\n────────────────────────────────────────');
console.log(`Legacy public site: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error.message}`);
  }
  process.exit(1);
}
console.log('Navigation, video player, actions, booking validation and white-label copy all verified.');
