/**
 * PHASE 15.8 — Likes + Weekly Most-Liked acceptance suite.
 *
 * Verifies:
 *   1. Every video (Short and Long, owner and theme showcase) renders a Like
 *      button + like count, on all five themes.
 *   2. Duplicate likes from the same user/session are impossible; identity
 *      comes from the EXISTING auth session, falling back to the existing
 *      per-browser id for signed-out visitors.
 *   3. Current-week calculation (Monday → Sunday, salon clock) and ISO week key.
 *   4. Weekly Top Videos ranking: highest weekly likes, Shorts + Long, and
 *      strict theme isolation (never mixed across themes or tenants).
 *   5. Counts + ranking update after a successful like.
 *   6. Loading / error / empty states.
 *   7. Enforcement in the data layer, not just the UI.
 *   8. Phase 15.1–15.7 behaviour preserved.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }]); }
  unobserve() {}
  disconnect() {}
};
dom.window.IntersectionObserver = globalThis.IntersectionObserver;

const React = (await import('react')).default;
const { render, fireEvent, cleanup, act } = await import('@testing-library/react');
const SiteVideoGallery = (await import('../src/components/SiteVideoGallery.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSalonClockForTests } = await import('../src/lib/salonStatus.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');
const { videoItemsForTheme, videoKindCountsForTheme } = await import('../src/lib/siteVideoGallery.ts');
const {
  formatLikeCount,
  hasActorLikedVideo,
  isInCurrentWeek,
  setVideoLikeStorageFailureForTests,
  setVideoLikeStoreForTests,
  startOfWeek,
  endOfWeek,
  toggleVideoLike,
  videoLikeActor,
  videoLikeBusinessId,
  videoLikeCount,
  weekKeyOf,
  weeklyTopVideoIds,
  weeklyTopVideos,
  weeklyVideoLikeCount,
  VIDEO_LIKE_RATE_MAX,
} = await import('../src/lib/videoLikes.ts');

const THEMES = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

let passed = 0;
let failed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    failures.push({ name, error });
    console.error(`  ✗ ${name}\n    ${error.message}`);
  }
}

function freshStore() {
  setVideoLikeStoreForTests({ version: 1, likes: [], attempts: [] });
}

function salonData() {
  return structuredClone(initialData);
}

const BUSINESS = 'public-site';

/* ------------------------------------------------------------------ */
console.log('\n▸ Like button + like count on every video');
/* ------------------------------------------------------------------ */

await test('every theme renders a Like button + count on all 5 Shorts and 5 Long videos', () => {
  for (const themeId of THEMES) {
    cleanup();
    freshStore();
    const data = salonData();
    const counts = videoKindCountsForTheme(themeId, data);
    assert.equal(counts.short, 5, `${themeId} shorts preserved`);
    assert.equal(counts.long, 5, `${themeId} longs preserved`);

    const ui = render(React.createElement(SiteVideoGallery, { themeId, data, mode: 'desktop' }));
    const cards = ui.container.querySelectorAll('[data-testid="site-social-item"]');
    assert.equal(cards.length, 10, `${themeId} renders 10 cards`);
    for (const card of cards) {
      const button = card.querySelector('[data-testid="site-video-like"]');
      const count = card.querySelector('[data-testid="site-video-like-count"]');
      assert.ok(button, `${themeId}/${card.getAttribute('data-social-id')} has a Like button`);
      assert.ok(count, 'has a like count');
      assert.equal(count.getAttribute('data-count'), '0');
      assert.equal(button.getAttribute('aria-pressed'), 'false');
    }
  }
  cleanup();
});

await test('like counts are shown for Shorts and Long videos alike', () => {
  cleanup();
  freshStore();
  const themeId = 'barber_mens_grooming';
  const data = salonData();
  const items = videoItemsForTheme(themeId, data);
  const actor = { id: 'user:acceptance', kind: 'user' };
  const short = items.find((i) => i.kind === 'short');
  const long = items.find((i) => i.kind === 'long');
  toggleVideoLike({ businessId: BUSINESS, themeId, videoId: short.id, data, actor });
  toggleVideoLike({ businessId: BUSINESS, themeId, videoId: long.id, data, actor });

  const ui = render(React.createElement(SiteVideoGallery, { themeId, data, mode: 'desktop' }));
  for (const id of [short.id, long.id]) {
    const card = ui.container.querySelector(`[data-social-id="${id}"]`);
    assert.equal(card.getAttribute('data-like-count'), '1');
    assert.equal(
      card.querySelector('[data-testid="site-video-like-count"]').getAttribute('data-count'),
      '1',
    );
  }
  cleanup();
});

await test('formatLikeCount renders human counts without inventing data', () => {
  assert.equal(formatLikeCount(0), '0');
  assert.equal(formatLikeCount(7), '7');
  assert.equal(formatLikeCount(999), '999');
  assert.equal(formatLikeCount(1200), '1.2K');
  assert.equal(formatLikeCount(2_400_000), '2.4M');
});

/* ------------------------------------------------------------------ */
console.log('\n▸ Session identity + duplicate protection');
/* ------------------------------------------------------------------ */

await test('actor identity comes from the existing session, never a client value', () => {
  const signedIn = videoLikeActor('11111111-2222-4333-8444-555555555555');
  assert.deepEqual(signedIn, { id: 'user:11111111-2222-4333-8444-555555555555', kind: 'user' });
  const anonymous = videoLikeActor(null);
  assert.equal(anonymous.kind, 'session');
  assert.match(anonymous.id, /^session:/);
  // The signed-out identity reuses the EXISTING per-browser id, so it is
  // stable across calls and cannot be chosen by the visitor.
  assert.equal(videoLikeActor(undefined).id, anonymous.id);
  assert.notEqual(signedIn.id, anonymous.id);
});

await test('a repeated like from the same user/session never creates a duplicate', () => {
  freshStore();
  const themeId = 'hair_studio_color_bar';
  const data = salonData();
  const videoId = videoItemsForTheme(themeId, data)[0].id;
  const actor = videoLikeActor('user-dupe');

  const first = toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor });
  assert.equal(first.ok, true);
  assert.equal(first.liked, true);
  assert.equal(first.total, 1);

  // Same identity again → toggle off, not a second row.
  const second = toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor });
  assert.equal(second.liked, false);
  assert.equal(second.total, 0);

  // ...and re-liking still tops out at exactly one.
  toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor });
  toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor });
  toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor });
  assert.equal(videoLikeCount(BUSINESS, themeId, videoId), 1);
  assert.equal(hasActorLikedVideo(BUSINESS, themeId, videoId, actor), true);
});

await test('different users each contribute exactly one like', () => {
  freshStore();
  const themeId = 'beauty_skin_spa';
  const data = salonData();
  const videoId = videoItemsForTheme(themeId, data)[0].id;
  for (const id of ['u1', 'u2', 'u3']) {
    const actor = videoLikeActor(id);
    toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor });
    toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor });
    toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor });
  }
  assert.equal(videoLikeCount(BUSINESS, themeId, videoId), 3);
});

await test('a per-actor rate limit blocks like flooding', () => {
  freshStore();
  const themeId = 'barber_mens_grooming';
  const data = salonData();
  const items = videoItemsForTheme(themeId, data);
  const actor = videoLikeActor('flooder');
  let blocked = null;
  for (let i = 0; i < VIDEO_LIKE_RATE_MAX + 5; i++) {
    const result = toggleVideoLike({
      businessId: BUSINESS,
      themeId,
      videoId: items[i % items.length].id,
      data,
      actor,
    });
    if (!result.ok && result.error === 'rate-limited') { blocked = result; break; }
  }
  assert.ok(blocked, 'rate limit triggers');
  assert.equal(blocked.ok, false);
});

/* ------------------------------------------------------------------ */
console.log('\n▸ Current-week calculation');
/* ------------------------------------------------------------------ */

await test('the week runs Monday 00:00 → Sunday 23:59 on the salon clock', () => {
  const wednesday = new Date(2026, 7, 12, 15, 30); // Wed 12 Aug 2026
  const start = startOfWeek(wednesday);
  const end = endOfWeek(wednesday);
  assert.equal(start.getDay(), 1, 'week starts Monday');
  assert.equal(start.getDate(), 10);
  assert.equal(start.getHours(), 0);
  assert.equal(end.getDay(), 1, 'exclusive end is next Monday');
  assert.equal(end.getDate(), 17);

  // A Sunday belongs to the week that started the previous Monday.
  const sunday = new Date(2026, 7, 16, 23, 59);
  assert.equal(startOfWeek(sunday).getDate(), 10);
  // The following Monday starts a new week.
  assert.equal(startOfWeek(new Date(2026, 7, 17, 0, 1)).getDate(), 17);
});

await test('week keys are ISO weeks and roll over without a timer', () => {
  const wednesday = new Date(2026, 7, 12, 12, 0);
  const key = weekKeyOf(wednesday);
  assert.match(key, /^\d{4}-W\d{2}$/);
  assert.equal(weekKeyOf(new Date(2026, 7, 16, 22, 0)), key, 'same week on Sunday');
  assert.notEqual(weekKeyOf(new Date(2026, 7, 17, 9, 0)), key, 'new week on Monday');
  assert.equal(isInCurrentWeek(new Date(2026, 7, 14).getTime(), wednesday), true);
  assert.equal(isInCurrentWeek(new Date(2026, 7, 3).getTime(), wednesday), false);
});

await test('likes from an earlier week do not count toward the current week', () => {
  freshStore();
  const themeId = 'family_full_service';
  const data = salonData();
  const videoId = videoItemsForTheme(themeId, data)[0].id;
  const thisWeek = new Date(2026, 7, 12, 10, 0);
  const lastWeek = new Date(2026, 7, 5, 10, 0);

  toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor: videoLikeActor('old'), now: lastWeek });
  toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor: videoLikeActor('new'), now: thisWeek });

  assert.equal(videoLikeCount(BUSINESS, themeId, videoId), 2, 'all-time keeps both');
  assert.equal(weeklyVideoLikeCount(BUSINESS, themeId, videoId, thisWeek), 1, 'this week counts one');
  assert.equal(
    weeklyTopVideos(BUSINESS, themeId, data, { now: thisWeek })[0].weeklyLikes,
    1,
  );
});

/* ------------------------------------------------------------------ */
console.log('\n▸ Weekly Top Videos ranking');
/* ------------------------------------------------------------------ */

await test('ranking orders by weekly likes and supports Shorts + Long together', () => {
  freshStore();
  const themeId = 'barber_mens_grooming';
  const data = salonData();
  const now = new Date(2026, 7, 12, 10, 0);
  const items = videoItemsForTheme(themeId, data);
  const shorts = items.filter((i) => i.kind === 'short');
  const longs = items.filter((i) => i.kind === 'long');

  const like = (videoId, voters) => {
    for (let i = 0; i < voters; i++) {
      toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor: videoLikeActor(`v${videoId}-${i}`), now });
    }
  };
  like(longs[0].id, 4);
  like(shorts[0].id, 3);
  like(shorts[1].id, 2);

  const top = weeklyTopVideos(BUSINESS, themeId, data, { now });
  assert.deepEqual(
    top.map((entry) => [entry.rank, entry.item.id, entry.weeklyLikes]),
    [[1, longs[0].id, 4], [2, shorts[0].id, 3], [3, shorts[1].id, 2]],
  );
  assert.deepEqual(top.map((e) => e.item.kind), ['long', 'short', 'short'], 'both kinds rank together');

  // Per-kind ranking is also supported.
  assert.deepEqual(weeklyTopVideoIds(BUSINESS, themeId, data, { kind: 'short', now }), [shorts[0].id, shorts[1].id]);
  assert.deepEqual(weeklyTopVideoIds(BUSINESS, themeId, data, { kind: 'long', now }), [longs[0].id]);
});

await test('a theme never ranks another theme\'s video or borrows its likes', () => {
  freshStore();
  const data = salonData();
  const now = new Date(2026, 7, 12, 10, 0);
  const perTheme = {};
  for (const themeId of THEMES) {
    perTheme[themeId] = videoItemsForTheme(themeId, data).map((i) => i.id);
  }
  // Heavily like the nail theme only.
  const nailTop = perTheme.nail_lash_studio[0];
  for (let i = 0; i < 9; i++) {
    toggleVideoLike({
      businessId: BUSINESS,
      themeId: 'nail_lash_studio',
      videoId: nailTop,
      data,
      actor: videoLikeActor(`nail-${i}`),
      now,
    });
  }
  // One like on the barber theme.
  const barberTop = perTheme.barber_mens_grooming[0];
  toggleVideoLike({
    businessId: BUSINESS,
    themeId: 'barber_mens_grooming',
    videoId: barberTop,
    data,
    actor: videoLikeActor('barber-1'),
    now,
  });

  for (const themeId of THEMES) {
    const ranked = weeklyTopVideos(BUSINESS, themeId, data, { now });
    for (const entry of ranked) {
      assert.ok(perTheme[themeId].includes(entry.item.id), `${themeId} ranks only its own videos`);
      assert.equal(entry.item.themeId, themeId, 'ranked item is theme-scoped');
    }
  }
  assert.deepEqual(weeklyTopVideoIds(BUSINESS, 'nail_lash_studio', data, { now }), [nailTop]);
  assert.deepEqual(weeklyTopVideoIds(BUSINESS, 'barber_mens_grooming', data, { now }), [barberTop]);
  assert.equal(weeklyTopVideos(BUSINESS, 'beauty_skin_spa', data, { now }).length, 0);
  assert.equal(weeklyVideoLikeCount(BUSINESS, 'barber_mens_grooming', nailTop, now), 0,
    'the nail video has no likes under the barber theme');
});

await test('another business\'s likes never enter this salon\'s ranking', () => {
  freshStore();
  const themeId = 'hair_studio_color_bar';
  const data = salonData();
  const now = new Date(2026, 7, 12, 10, 0);
  const videoId = videoItemsForTheme(themeId, data)[0].id;
  for (let i = 0; i < 6; i++) {
    toggleVideoLike({ businessId: 'other-salon', themeId, videoId, data, actor: videoLikeActor(`o-${i}`), now });
  }
  assert.equal(weeklyVideoLikeCount(BUSINESS, themeId, videoId, now), 0);
  assert.equal(weeklyTopVideos(BUSINESS, themeId, data, { now }).length, 0);
  assert.equal(weeklyVideoLikeCount('other-salon', themeId, videoId, now), 6);
});

await test('zero-like videos are never ranked (no invented ordering)', () => {
  freshStore();
  const themeId = 'beauty_skin_spa';
  const data = salonData();
  assert.deepEqual(weeklyTopVideos(BUSINESS, themeId, data), []);
});

/* ------------------------------------------------------------------ */
console.log('\n▸ UI updates after a successful like');
/* ------------------------------------------------------------------ */

await test('clicking Like updates the count, the button state and the weekly ranking', async () => {
  cleanup();
  freshStore();
  setSalonClockForTests(new Date(2026, 7, 12, 10, 0));
  const themeId = 'barber_mens_grooming';
  const data = salonData();
  const target = videoItemsForTheme(themeId, data).find((i) => i.kind === 'long');

  const ui = render(React.createElement(SiteVideoGallery, { themeId, data, mode: 'desktop' }));
  const card = () => ui.container.querySelector(`[data-social-id="${target.id}"]`);
  assert.equal(card().getAttribute('data-like-count'), '0');
  assert.ok(ui.container.querySelector('[data-testid="site-video-weekly-empty"]'), 'weekly starts empty');

  await act(async () => {
    fireEvent.click(card().querySelector('[data-testid="site-video-like"]'));
  });

  assert.equal(card().getAttribute('data-like-count'), '1', 'count increments');
  assert.equal(card().getAttribute('data-liked'), 'true');
  assert.equal(
    card().querySelector('[data-testid="site-video-like"]').getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    card().querySelector('[data-testid="site-video-like-count"]').textContent,
    '1',
  );

  const weeklyItems = ui.container.querySelectorAll('[data-testid="site-video-weekly-item"]');
  assert.equal(weeklyItems.length, 1, 'ranking updates after the like');
  assert.equal(weeklyItems[0].getAttribute('data-video-id'), target.id);
  assert.equal(weeklyItems[0].getAttribute('data-rank'), '1');
  assert.equal(weeklyItems[0].getAttribute('data-weekly-likes'), '1');
  assert.equal(weeklyItems[0].getAttribute('data-video-kind'), 'long');
  assert.ok(!ui.container.querySelector('[data-testid="site-video-weekly-empty"]'));

  // Clicking again from the same session removes the like — never a duplicate.
  await act(async () => {
    fireEvent.click(card().querySelector('[data-testid="site-video-like"]'));
  });
  assert.equal(card().getAttribute('data-like-count'), '0');
  assert.ok(ui.container.querySelector('[data-testid="site-video-weekly-empty"]'));
  cleanup();
  setSalonClockForTests(null);
});

await test('the weekly block is theme-scoped in the rendered UI', async () => {
  cleanup();
  freshStore();
  setSalonClockForTests(new Date(2026, 7, 12, 10, 0));
  const data = salonData();
  const nailId = videoItemsForTheme('nail_lash_studio', data)[0].id;
  toggleVideoLike({
    businessId: videoLikeBusinessId(data),
    themeId: 'nail_lash_studio',
    videoId: nailId,
    data,
    actor: videoLikeActor('nail-fan'),
  });

  const nailUi = render(React.createElement(SiteVideoGallery, { themeId: 'nail_lash_studio', data, mode: 'desktop' }));
  const nailRanked = nailUi.container.querySelectorAll('[data-testid="site-video-weekly-item"]');
  assert.equal(nailRanked.length, 1);
  assert.equal(nailRanked[0].getAttribute('data-video-id'), nailId);
  cleanup();

  for (const themeId of THEMES.filter((t) => t !== 'nail_lash_studio')) {
    const ui = render(React.createElement(SiteVideoGallery, { themeId, data, mode: 'desktop' }));
    const block = ui.container.querySelector('[data-testid="site-video-weekly-top"]');
    assert.equal(block.getAttribute('data-theme'), themeId);
    assert.ok(
      ui.container.querySelector('[data-testid="site-video-weekly-empty"]'),
      `${themeId} does not borrow the nail theme's ranking`,
    );
    assert.equal(ui.container.querySelectorAll('[data-testid="site-video-weekly-item"]').length, 0);
    cleanup();
  }
  setSalonClockForTests(null);
});

/* ------------------------------------------------------------------ */
console.log('\n▸ Loading / error / empty states');
/* ------------------------------------------------------------------ */

await test('the weekly block exposes loading, error and empty states', async () => {
  cleanup();
  freshStore();
  const data = salonData();

  // Empty — no likes yet this week.
  let ui = render(React.createElement(SiteVideoGallery, { themeId: 'barber_mens_grooming', data, mode: 'desktop' }));
  assert.equal(
    ui.container.querySelector('[data-testid="site-video-weekly-top"]').getAttribute('data-weekly-state'),
    'ready',
  );
  assert.ok(ui.container.querySelector('[data-testid="site-video-weekly-empty"]'));
  cleanup();

  // Error — the section-level error state is honoured by the weekly block.
  setWebsiteSectionFlagsForTests({ videos: 'error' });
  ui = render(React.createElement(SiteVideoGallery, { themeId: 'barber_mens_grooming', data, mode: 'desktop' }));
  assert.ok(ui.container.querySelector('[data-testid="section-state-error"]'), 'section error preserved');
  cleanup();

  // Loading — the existing section skeleton still renders.
  setWebsiteSectionFlagsForTests({ videos: 'loading' });
  ui = render(React.createElement(SiteVideoGallery, { themeId: 'barber_mens_grooming', data, mode: 'desktop' }));
  assert.ok(ui.container.querySelector('[data-testid="site-video-gallery-loading"]'));
  cleanup();
  setWebsiteSectionFlagsForTests({});
});

await test('a failed like write surfaces an error state and does not change the count', async () => {
  cleanup();
  freshStore();
  const themeId = 'family_full_service';
  const data = salonData();
  const target = videoItemsForTheme(themeId, data)[0];
  setVideoLikeStorageFailureForTests(true);

  const ui = render(React.createElement(SiteVideoGallery, { themeId, data, mode: 'desktop' }));
  const card = () => ui.container.querySelector(`[data-social-id="${target.id}"]`);
  await act(async () => {
    fireEvent.click(card().querySelector('[data-testid="site-video-like"]'));
  });

  const error = card().querySelector('[data-testid="site-video-like-error"]');
  assert.ok(error, 'error state is shown');
  assert.equal(error.getAttribute('data-error'), 'storage');
  assert.equal(error.getAttribute('role'), 'alert');
  assert.ok(error.textContent.trim().length > 0);
  assert.equal(card().getAttribute('data-like-count'), '0', 'count is unchanged on failure');
  assert.equal(videoLikeCount(BUSINESS, themeId, target.id), 0);

  setVideoLikeStorageFailureForTests(false);
  cleanup();
});

/* ------------------------------------------------------------------ */
console.log('\n▸ Data-layer enforcement (not UI-only)');
/* ------------------------------------------------------------------ */

await test('an unknown, hidden or foreign-theme video can never be liked', () => {
  freshStore();
  const data = salonData();
  const actor = videoLikeActor('attacker');

  const unknown = toggleVideoLike({
    businessId: BUSINESS,
    themeId: 'barber_mens_grooming',
    videoId: 'does-not-exist',
    data,
    actor,
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error, 'unknown-video');

  // A video belonging to another theme is not likeable under this theme.
  const nailId = videoItemsForTheme('nail_lash_studio', data)[0].id;
  const foreign = toggleVideoLike({
    businessId: BUSINESS,
    themeId: 'barber_mens_grooming',
    videoId: nailId,
    data,
    actor,
  });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.error, 'unknown-video');

  // A rejected / unpublished owner video is not customer-visible → not likeable.
  const hidden = {
    id: 'hidden-video',
    title: 'Hidden',
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    originalPlatformUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thumbnailUrl: '',
    externalVideoId: 'dQw4w9WgXcQ',
    themeId: 'barber_mens_grooming',
    videoKind: 'long',
    moderation: 'rejected',
    status: 'inactive',
  };
  const hiddenData = { ...data, socialVideos: [...(data.socialVideos || []), hidden] };
  const blocked = toggleVideoLike({
    businessId: BUSINESS,
    themeId: 'barber_mens_grooming',
    videoId: 'hidden-video',
    data: hiddenData,
    actor,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'unknown-video');
  assert.equal(videoLikeCount(BUSINESS, 'barber_mens_grooming', 'hidden-video'), 0);
});

await test('an invalid theme id is refused by the data layer', () => {
  freshStore();
  const data = salonData();
  const result = toggleVideoLike({
    businessId: BUSINESS,
    themeId: 'not_a_theme',
    videoId: 'anything',
    data,
    actor: videoLikeActor('x'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'foreign-theme');
});

await test('the draft migration enforces the same rules in the database', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260815000101_m27_social_video_likes_weekly.sql', import.meta.url),
    'utf8',
  );
  // Reuses the existing tables — no parallel video/user/salon model.
  assert.match(sql, /references public\.businesses\(id\)/);
  assert.match(sql, /references public\.social_videos\(id\)/);
  assert.match(sql, /references auth\.users\(id\)/);
  assert.doesNotMatch(sql, /create table if not exists public\.(videos|users|salons)\b/);
  // Duplicate protection + theme/tenant integrity + RLS.
  assert.match(sql, /create unique index if not exists uq_social_video_likes_user/);
  assert.match(sql, /create unique index if not exists uq_social_video_likes_visitor/);
  assert.match(sql, /social_video_likes_video_business_theme_fk/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\)/);
  // Weekly, theme-aware, kind-aware ranking RPC.
  assert.match(sql, /create or replace function public\.get_weekly_top_videos/);
  assert.match(sql, /p_theme_key/);
  assert.match(sql, /p_kind/);
  assert.match(sql, /interval '7 days'/);
  // Nothing is executed by the app.
  assert.match(sql, /NOT applied to any database/);
});

/* ------------------------------------------------------------------ */
console.log('\n▸ Phase 15.1–15.7 preserved');
/* ------------------------------------------------------------------ */

await test('cards keep their 15.3/15.7 contract: kind badge, filters, play and exact destination', () => {
  cleanup();
  freshStore();
  const themeId = 'barber_mens_grooming';
  const data = salonData();
  const ui = render(React.createElement(SiteVideoGallery, { themeId, data, mode: 'desktop' }));

  assert.ok(ui.container.querySelector('[data-testid="site-social-feed"]'));
  assert.ok(ui.container.querySelector('[data-testid="site-video-kind-filter"]'));
  assert.ok(ui.container.querySelector('[data-testid="site-video-filter-short"]'));
  assert.ok(ui.container.querySelector('[data-testid="site-video-filter-long"]'));
  const card = ui.container.querySelector('[data-testid="site-social-item"]');
  assert.ok(card.querySelector('[data-testid="site-video-kind-badge"]'));
  assert.ok(card.querySelector('[data-testid="site-social-view"]'));
  assert.ok(card.querySelector('[data-testid="site-social-play"]'));
  assert.match(card.getAttribute('data-original-platform-url'), /^https:\/\//);

  // The Like button must not hijack the card's open-original behaviour.
  let opened = null;
  dom.window.open = (...args) => { opened = args; return null; };
  fireEvent.click(card.querySelector('[data-testid="site-video-like"]'));
  assert.equal(opened, null, 'liking does not open the external destination');
  fireEvent.click(card);
  assert.deepEqual(opened, [card.getAttribute('data-original-platform-url'), '_blank', 'noopener,noreferrer']);
  cleanup();
});

await test('the 5 Shorts + 5 Long contract and theme isolation still hold on every theme', () => {
  freshStore();
  const data = salonData();
  const seen = new Map();
  for (const themeId of THEMES) {
    const counts = videoKindCountsForTheme(themeId, data);
    assert.equal(counts.short, 5);
    assert.equal(counts.long, 5);
    for (const item of videoItemsForTheme(themeId, data)) {
      assert.equal(seen.has(item.id), false, `${item.id} is unique to ${themeId}`);
      seen.set(item.id, themeId);
    }
  }
});

await test('likes are additive: no video record field is rewritten', () => {
  freshStore();
  const themeId = 'barber_mens_grooming';
  const data = salonData();
  const before = JSON.stringify(data.socialVideos || []);
  const videoId = videoItemsForTheme(themeId, data)[0].id;
  toggleVideoLike({ businessId: BUSINESS, themeId, videoId, data, actor: videoLikeActor('a') });
  assert.equal(JSON.stringify(data.socialVideos || []), before, 'salon payload untouched');
});

/* ------------------------------------------------------------------ */
console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`PHASE 15.8 — likes + weekly most-liked: ${passed} passed, ${failed} failed`);
console.log(`════════════════════════════════════════════════════════════`);

if (failed > 0) {
  console.error('\nFailing tests:');
  for (const f of failures) console.error(`  - ${f.name}`);
  process.exit(1);
}
