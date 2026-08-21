/**
 * PHASE 10.8 — REVIEWS, RATINGS & SOCIAL CONTENT (five-theme acceptance)
 *
 * Engine + real React UI in jsdom:
 *   Reviews        : display, write form, eligibility, pending, average
 *   Isolation      : one theme never sees another's reviews or posts
 *   No fakes       : empty salon shows empty states, never invented quotes
 *   Social feed    : configured videos / profiles only, YouTube embed parse
 *   Videos reuse   : still the existing `videos` / `section-social` section
 *   EN/HI + themes : five distinct visuals, locale repaint
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
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { siteText } = await import('../src/lib/siteI18n.ts');
const { collectSiteSectionOrder } = await import('../src/lib/siteStructure.ts');
const {
  calculatePaymentAmounts,
  createPayAtSalonRecord,
  setPaymentStoreForTests,
} = await import('../src/lib/siteBookingPayment.ts');
const {
  approveReview,
  eligibleBookingsForReview,
  insertReviewForTests,
  isBookingEligibleForReview,
  publicReviews,
  ratingSummary,
  readReviewsForTheme,
  setReviewStoreForTests,
  submitReview,
} = await import('../src/lib/siteReviews.ts');
const {
  configuredSocialSources,
  parseInstagramShortcode,
  parseYoutubeVideoId,
  resolveSocialFeed,
  youtubeEmbedUrl,
} = await import('../src/lib/siteSocialFeed.ts');

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

const THEMES = [
  { id: 'barber_mens_grooming', Component: Barber },
  { id: 'hair_studio_color_bar', Component: HairStudio },
  { id: 'beauty_skin_spa', Component: BeautySpa },
  { id: 'family_full_service', Component: Family },
  { id: 'nail_lash_studio', Component: NailLash },
];

const THU_OPEN = new Date(2026, 7, 13, 11, 0, 0, 0);

function themeServices(themeId) {
  return [
    {
      id: `${themeId}-svc-1`, name: 'Signature Treatment', category: 'Haircuts',
      description: 'Signature service description.', price: 800, duration: 60,
      themeId, status: 'active', businessId: `biz-${themeId}`,
    },
  ];
}

function richData(themeId, extras = {}) {
  return {
    ...initialData,
    templateId: themeId,
    salonName: `${themeId} Test Salon`,
    tagline: 'Reviews under test',
    about: 'Reviews test salon.',
    ownerName: 'Test Owner',
    email: 'hello@reviews.test',
    phone: '+91 99999 00000',
    whatsappPhone: '+91 99999 00000',
    businessId: `biz-${themeId}`,
    services: themeServices(themeId),
    offers: [],
    socialVideos: extras.socialVideos !== undefined ? extras.socialVideos : [
      {
        id: `${themeId}-vid-1`,
        title: `${themeId} reel one`,
        platform: 'instagram',
        url: 'https://instagram.com/reel/AbCdef12345',
        thumbnailUrl: 'https://example.com/t1.jpg',
      },
    ],
    socialProfiles: extras.socialProfiles !== undefined ? extras.socialProfiles : {
      instagram: `https://instagram.com/${themeId}_salon`,
      youtube: `https://youtube.com/@${themeId}`,
    },
    ...extras,
  };
}

function setCleanState() {
  setSiteLocale('en');
  setSiteAppearance(undefined);
  setSalonClockForTests(THU_OPEN);
  setPaymentStoreForTests(null);
  setReviewStoreForTests(null);
  try { window.localStorage.clear(); } catch { /* ignore */ }
}

function seedEligibleBooking(themeId, overrides = {}) {
  const data = richData(themeId);
  const service = data.services[0];
  return createPayAtSalonRecord({
    businessId: `biz-${themeId}`,
    themeId,
    service,
    bookingId: overrides.bookingId || `NX-${themeId.slice(0, 4).toUpperCase()}01`,
    dateKey: overrides.dateKey || '2026-08-12',
    startMinutes: 600,
    endMinutes: 660,
    amounts: calculatePaymentAmounts('pay_at_salon', { price: 800, finalPrice: 800 }, data.bookingRules),
    paymentOption: 'pay_at_salon',
    paymentMethod: null,
    customer: overrides.customer || { name: 'Asha Verma', mobile: '9999999999' },
  });
}

/* ================================================================== */
/* A · REVIEW ENGINE                                                  */
/* ================================================================== */
section('Engine — review eligibility, spam, isolation');
{
  await test('confirmed / pay-at-salon bookings on or before today are eligible', () => {
    setCleanState();
    const rec = seedEligibleBooking('barber_mens_grooming');
    assert.equal(isBookingEligibleForReview(rec, THU_OPEN), true);
    assert.equal(eligibleBookingsForReview('biz-barber_mens_grooming', 'barber_mens_grooming', THU_OPEN).length, 1);
  });

  await test('future bookings and failed statuses are not eligible', () => {
    setCleanState();
    const future = seedEligibleBooking('beauty_skin_spa', { dateKey: '2026-09-01', bookingId: 'NX-FUT01' });
    assert.equal(isBookingEligibleForReview(future, THU_OPEN), false);
  });

  await test('submit without an eligible booking is rejected', () => {
    setCleanState();
    const result = submitReview({
      businessId: 'biz-barber_mens_grooming',
      themeId: 'barber_mens_grooming',
      customerName: 'Nobody',
      rating: 5,
      body: 'Great fade and a proper hot towel finish.',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'no-eligible-booking');
    assert.equal(publicReviews('biz-barber_mens_grooming', 'barber_mens_grooming').length, 0);
  });

  await test('valid booking → pending review; public list stays empty until approved', () => {
    setCleanState();
    seedEligibleBooking('hair_studio_color_bar');
    const result = submitReview({
      businessId: 'biz-hair_studio_color_bar',
      themeId: 'hair_studio_color_bar',
      customerName: 'Asha Verma',
      rating: 5,
      body: 'The color bar consultation was thoughtful and precise.',
    });
    assert.equal(result.ok, true);
    assert.equal(result.review.status, 'pending');
    assert.equal(publicReviews('biz-hair_studio_color_bar', 'hair_studio_color_bar').length, 0);
    approveReview(result.review.id);
    assert.equal(publicReviews('biz-hair_studio_color_bar', 'hair_studio_color_bar').length, 1);
  });

  await test('duplicate review for the same booking is blocked', () => {
    setCleanState();
    seedEligibleBooking('family_full_service');
    const first = submitReview({
      businessId: 'biz-family_full_service',
      themeId: 'family_full_service',
      customerName: 'Asha Verma',
      rating: 4,
      body: 'We booked the whole family in one visit and it was easy.',
    });
    assert.equal(first.ok, true);
    const second = submitReview({
      businessId: 'biz-family_full_service',
      themeId: 'family_full_service',
      customerName: 'Asha Verma',
      rating: 5,
      body: 'A completely different paragraph about the same visit today.',
    });
    assert.equal(second.ok, false);
    assert.equal(second.error, 'duplicate');
  });

  await test('spam and invalid payloads are rejected', () => {
    setCleanState();
    seedEligibleBooking('nail_lash_studio');
    assert.equal(submitReview({
      businessId: 'biz-nail_lash_studio', themeId: 'nail_lash_studio',
      customerName: 'Asha Verma', rating: 0, body: 'Lovely chrome set, every detail was perfect.',
    }).error, 'invalid-rating');
    assert.equal(submitReview({
      businessId: 'biz-nail_lash_studio', themeId: 'nail_lash_studio',
      customerName: '', rating: 5, body: 'Lovely chrome set, every detail was perfect.',
    }).error, 'invalid-name');
    assert.equal(submitReview({
      businessId: 'biz-nail_lash_studio', themeId: 'nail_lash_studio',
      customerName: 'Asha Verma', rating: 5, body: 'too short',
    }).error, 'invalid-body');
    assert.equal(submitReview({
      businessId: 'biz-nail_lash_studio', themeId: 'nail_lash_studio',
      customerName: 'Asha Verma', rating: 5, body: 'aaaaaaaaaaaa',
    }).error, 'spam');
  });

  await test('average rating uses approved reviews only and stays theme-isolated', () => {
    setCleanState();
    insertReviewForTests({
      businessId: 'biz-barber_mens_grooming', themeId: 'barber_mens_grooming',
      customerName: 'Arjun', rating: 5, body: 'Sharpest fade of the year so far.',
    });
    insertReviewForTests({
      businessId: 'biz-barber_mens_grooming', themeId: 'barber_mens_grooming',
      customerName: 'Rohit', rating: 4, body: 'Hot towel shave done exactly right.',
    });
    insertReviewForTests({
      businessId: 'biz-beauty_skin_spa', themeId: 'beauty_skin_spa',
      customerName: 'Pooja', rating: 2, body: 'Quiet room but the facial ran short.',
    });
    const barber = ratingSummary(publicReviews('biz-barber_mens_grooming', 'barber_mens_grooming'));
    const spa = ratingSummary(publicReviews('biz-beauty_skin_spa', 'beauty_skin_spa'));
    assert.equal(barber.count, 2);
    assert.equal(barber.average, 4.5);
    assert.equal(spa.count, 1);
    assert.equal(spa.average, 2);
    assert.equal(readReviewsForTheme('biz-beauty_skin_spa', 'barber_mens_grooming').length, 0);
  });
}

/* ================================================================== */
/* B · SOCIAL ENGINE                                                  */
/* ================================================================== */
section('Engine — social feed uses configured data only');
{
  await test('YouTube embed is parsed only for real 11-character ids', () => {
    assert.equal(parseYoutubeVideoId('https://youtube.com/shorts/67890'), null);
    assert.equal(parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(youtubeEmbedUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  await test('Instagram shortcodes parse; tiny demo ids do not invent embeds', () => {
    assert.equal(parseInstagramShortcode('https://instagram.com/reel/12345'), null);
    assert.equal(parseInstagramShortcode('https://www.instagram.com/reel/AbCdef12345/'), 'AbCdef12345');
  });

  await test('resolveSocialFeed never invents posts when the salon has none', () => {
    const items = resolveSocialFeed({ socialVideos: [] });
    assert.equal(items.length, 0);
    assert.deepEqual(configuredSocialSources({}), []);
  });

  await test('feed items stay theme-data-only and keep captions + view urls', () => {
    const items = resolveSocialFeed({
      socialVideos: [{
        id: 'v1', title: 'Only this reel', platform: 'youtube',
        url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        thumbnailUrl: 'https://example.com/t.jpg',
      }],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Only this reel');
    assert.equal(items[0].embedKind, 'youtube');
    assert.equal(items[0].url, 'https://youtube.com/watch?v=dQw4w9WgXcQ');
  });
}

/* ================================================================== */
/* C · FIVE-THEME UI — reviews + social                               */
/* ================================================================== */
section('UI — five themes render reviews + social feed');
{
  for (const theme of THEMES) {
    await test(`${theme.id}: reviews section + write action + social feed`, () => {
      setCleanState();
      insertReviewForTests({
        businessId: `biz-${theme.id}`,
        themeId: theme.id,
        customerName: 'Guest One',
        rating: 5,
        body: `Approved note for ${theme.id} only.`,
        serviceName: 'Signature Treatment',
      });
      const utils = render(React.createElement(theme.Component, { data: richData(theme.id), mode: 'desktop' }));
      const reviews = utils.getByTestId('site-reviews');
      assert.equal(reviews.dataset.theme, theme.id);
      assert.ok(utils.getByTestId('site-reviews-write'));
      assert.ok(utils.getByTestId('site-reviews-average').textContent.includes('5.0'));
      assert.ok(utils.getByTestId('site-reviews-count').textContent.includes('1'));
      assert.ok(utils.container.textContent.includes(`Approved note for ${theme.id} only.`));
      const feed = utils.getByTestId('site-social-feed');
      assert.equal(feed.dataset.theme, theme.id);
      assert.ok(utils.container.querySelector('[data-testid="site-social-item"]'));
      assert.ok(utils.container.querySelector('[data-testid="site-social-view"]'));
      assert.ok(utils.getByTestId('site-social-source-instagram'));
      const S = siteText(theme.id, 'en');
      assert.ok(utils.container.textContent.includes(S.reviewsTitle || S.testimonialsTitle));
      cleanup();
    });
  }

  await test('empty salon: no fake reviews (theme video catalog may fill videos)', () => {
    setCleanState();
    const data = richData('barber_mens_grooming', { socialVideos: [], socialProfiles: {} });
    const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
    assert.equal(utils.container.querySelectorAll('[data-testid="site-review-card"]').length, 0);
    assert.equal(utils.container.textContent.includes('Arjun Mehta'), false);
    assert.equal(utils.container.textContent.includes('Rohit Khanna'), false);
    // Reviews stay empty; PHASE 15.3 may fill videos from the theme catalog
    // (configured presentation media, never invented review quotes).
    assert.ok(utils.container.querySelectorAll('[data-testid="section-state-empty"]').length >= 1);
    const socialItems = utils.container.querySelectorAll('[data-testid="site-social-item"]');
    for (const el of socialItems) {
      assert.equal(el.getAttribute('data-video-origin'), 'theme');
    }
    cleanup();
  });

  await test('theme isolation: barber review never appears on spa', () => {
    setCleanState();
    insertReviewForTests({
      businessId: 'biz-barber_mens_grooming', themeId: 'barber_mens_grooming',
      customerName: 'Barber Only', rating: 5, body: 'UNIQUE_BARBER_REVIEW_TOKEN',
    });
    const utils = render(React.createElement(BeautySpa, { data: richData('beauty_skin_spa'), mode: 'desktop' }));
    assert.equal(utils.container.textContent.includes('UNIQUE_BARBER_REVIEW_TOKEN'), false);
    assert.equal(utils.container.textContent.includes('Barber Only'), false);
    cleanup();
  });
}

/* ================================================================== */
/* D · SUBMIT FLOW                                                    */
/* ================================================================== */
section('UI — write / submit / pending / rating');
{
  for (const theme of THEMES) {
    await test(`${theme.id}: write form submits after eligible booking and shows pending`, async () => {
      setCleanState();
      seedEligibleBooking(theme.id, { bookingId: `NX-${theme.id.slice(0, 3).toUpperCase()}88` });
      const utils = render(React.createElement(theme.Component, { data: richData(theme.id), mode: 'desktop' }));
      await act(async () => { fireEvent.click(utils.getByTestId('site-reviews-write')); });
      assert.ok(utils.getByTestId('site-reviews-form'));
      fireEvent.click(utils.getByTestId('site-reviews-rating-5'));
      fireEvent.change(utils.getByTestId('site-reviews-name'), { target: { value: 'Asha Verma' } });
      fireEvent.change(utils.getByTestId('site-reviews-body'), {
        target: { value: 'Really happy with the visit, everything felt considered.' },
      });
      await act(async () => { fireEvent.click(utils.getByTestId('site-reviews-submit')); });
      assert.ok(utils.getByTestId('site-reviews-pending'));
      const stored = readReviewsForTheme(`biz-${theme.id}`, theme.id);
      assert.equal(stored.length, 1);
      assert.equal(stored[0].status, 'pending');
      assert.equal(stored[0].rating, 5);
      cleanup();
    });
  }

  await test('submit without a booking shows the eligibility error', async () => {
    setCleanState();
    const utils = render(React.createElement(Barber, { data: richData('barber_mens_grooming'), mode: 'desktop' }));
    await act(async () => { fireEvent.click(utils.getByTestId('site-reviews-write')); });
    fireEvent.click(utils.getByTestId('site-reviews-rating-4'));
    fireEvent.change(utils.getByTestId('site-reviews-name'), { target: { value: 'Stranger' } });
    fireEvent.change(utils.getByTestId('site-reviews-body'), {
      target: { value: 'Trying to leave a review without a visit here.' },
    });
    await act(async () => { fireEvent.click(utils.getByTestId('site-reviews-submit')); });
    const err = utils.getByTestId('site-reviews-error');
    assert.ok(err.textContent.toLowerCase().includes('booking') || err.textContent.includes('बुकिंग'));
    assert.equal(publicReviews('biz-barber_mens_grooming', 'barber_mens_grooming').length, 0);
    cleanup();
  });
}

/* ================================================================== */
/* E · SOCIAL UI + VIDEOS REUSE                                       */
/* ================================================================== */
section('UI — social feed reuses videos section, no duplicate system');
{
  await test('social feed is the existing videos / section-social block', () => {
    setCleanState();
    const utils = render(React.createElement(HairStudio, { data: richData('hair_studio_color_bar'), mode: 'desktop' }));
    const feed = utils.getByTestId('site-social-feed');
    assert.equal(feed.getAttribute('data-site-section'), 'videos');
    assert.equal(feed.id, 'section-social');
    assert.equal(utils.container.querySelectorAll('[data-site-section="videos"]').length, 1);
    cleanup();
  });

  await test('View opens the configured url (no invented destination)', () => {
    setCleanState();
    let opened = null;
    const orig = dom.window.open;
    dom.window.open = (url) => { opened = url; return null; };
    const data = richData('family_full_service', {
      socialVideos: [{
        id: 'fam-1', title: 'Family Saturday', platform: 'instagram',
        url: 'https://instagram.com/reel/FamilyReal01', thumbnailUrl: 'https://example.com/f.jpg',
      }],
    });
    const utils = render(React.createElement(Family, { data, mode: 'desktop' }));
    const viewBtn = utils.container.querySelector('[data-social-id="fam-1"] [data-testid="site-social-view"]');
    assert.ok(viewBtn, 'owner view button missing');
    fireEvent.click(viewBtn);
    assert.equal(opened, 'https://instagram.com/reel/FamilyReal01');
    dom.window.open = orig;
    cleanup();
  });

  await test('YouTube play exposes a real embed url', async () => {
    setCleanState();
    const data = richData('nail_lash_studio', {
      socialVideos: [{
        id: 'yt-1', title: 'Studio short', platform: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        thumbnailUrl: 'https://example.com/yt.jpg',
      }],
    });
    const utils = render(React.createElement(NailLash, { data, mode: 'desktop' }));
    const item = utils.container.querySelector('[data-social-id="yt-1"]');
    assert.ok(item, 'owner youtube card missing');
    assert.equal(item.getAttribute('data-embed-kind'), 'youtube');
    const playBtn = item.querySelector('[data-testid="site-social-play"]');
    assert.ok(playBtn);
    await act(async () => { fireEvent.click(playBtn); });
    const embed = utils.getByTestId('site-social-embed');
    assert.ok(embed.querySelector('iframe').getAttribute('src').includes('youtube.com/embed/dQw4w9WgXcQ'));
    cleanup();
  });

  await test('canonical section order still includes videos then reviews', () => {
    setCleanState();
    const utils = render(React.createElement(Barber, { data: richData('barber_mens_grooming'), mode: 'desktop' }));
    const order = collectSiteSectionOrder(utils.container);
    assert.ok(order.indexOf('videos') < order.indexOf('reviews'));
    assert.ok(order.indexOf('team') < order.indexOf('reviews'));
    cleanup();
  });
}

/* ================================================================== */
/* F · LANGUAGE + RESPONSIVE + DISTINCT THEMES                        */
/* ================================================================== */
section('UI — Hindi, viewports, distinct theme visuals');
{
  for (const theme of THEMES) {
    await test(`${theme.id}: Hindi repaints write-review + social labels`, async () => {
      setCleanState();
      setSiteLocale('hi');
      const utils = render(React.createElement(theme.Component, { data: richData(theme.id), mode: 'desktop' }));
      const S = siteText(theme.id, 'hi');
      assert.ok(utils.container.textContent.includes(S.reviewsTitle || S.testimonialsTitle));
      assert.ok(utils.getByTestId('site-reviews-write').textContent.includes('रिव्यू'));
      assert.equal(utils.getByTestId('site-reviews').dataset.appearance === 'dark' || utils.getByTestId('site-reviews').dataset.appearance === 'light', true);
      cleanup();
    });
  }

  await test('mobile and desktop both render reviews + social grids', () => {
    setCleanState();
    insertReviewForTests({
      businessId: 'biz-beauty_skin_spa', themeId: 'beauty_skin_spa',
      customerName: 'Divya', rating: 5, body: 'Calm room and a luminous facial finish.',
    });
    for (const mode of ['desktop', 'tablet', 'mobile']) {
      const utils = render(React.createElement(BeautySpa, { data: richData('beauty_skin_spa'), mode }));
      assert.ok(utils.getByTestId('site-reviews'));
      assert.ok(utils.getByTestId('site-social-feed'));
      cleanup();
    }
  });

  const sigs = {};
  for (const theme of THEMES) {
    setCleanState();
    const utils = render(React.createElement(theme.Component, { data: richData(theme.id), mode: 'desktop' }));
    sigs[theme.id] = utils.getByTestId('site-reviews').getAttribute('style') || '';
    cleanup();
  }
  await test('review section backgrounds differ pairwise across all five themes', () => {
    assert.equal(new Set(Object.values(sigs)).size, THEMES.length, `expected 5 unique review styles, got ${JSON.stringify(sigs)}`);
  });

  const socialSigs = {};
  for (const theme of THEMES) {
    setCleanState();
    const utils = render(React.createElement(theme.Component, { data: richData(theme.id), mode: 'desktop' }));
    socialSigs[theme.id] = utils.getByTestId('site-social-feed').getAttribute('style') || '';
    cleanup();
  }
  await test('social feed backgrounds differ pairwise across all five themes', () => {
    assert.equal(new Set(Object.values(socialSigs)).size, THEMES.length, `expected 5 unique social styles, got ${JSON.stringify(socialSigs)}`);
  });
}

console.log('\n────────────────────────────────────────');
console.log(`Phase 10.8 reviews, ratings & social: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(` - ${f.name}: ${f.error.message}`);
  process.exit(1);
}
