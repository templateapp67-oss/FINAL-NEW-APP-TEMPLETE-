/**
 * PHASE 15.6 — Owner/Admin video management acceptance suite.
 *
 * Verifies (all five themes where applicable):
 *   1. Actor resolution reuses the EXISTING auth + salon-ownership logic
 *      (session → organization_members owner → salons). No invented ids.
 *   2. Owner: add (existing flow), replace, edit metadata, manage ONLY their
 *      own salon's videos; can edit protected showcase (mock) records via
 *      materialised overrides; can never permanently delete them.
 *   3. Admin: add / edit / replace / delete / approve / manage protected
 *      records (per-salon disable + restore).
 *   4. Salon + theme + Shorts/Long linkage is kept on every write; theme
 *      isolation of showcase records; per-salon tombstones never mutate the
 *      shared catalog.
 *   5. Data-layer enforcement: helpers refuse denied actors (not just UI).
 *   6. Phase 15.1–15.5 preserved: 5+5 fill, grandfathered videos public,
 *      protected mocks never deletable by owners.
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
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }]); }
  unobserve() {}
  disconnect() {}
};
dom.window.IntersectionObserver = globalThis.IntersectionObserver;

const React = (await import('react')).default;
const { render, cleanup, fireEvent, act, waitFor } = await import('@testing-library/react');

const StepSocials = (await import('../src/screens/StepSocials.tsx')).default;
const VideoManagementPanel = (await import('../src/components/VideoManagementPanel.tsx')).default;

const { initialData } = await import('../src/types.ts');
const {
  videoItemsForTheme,
  videoKindCountsForTheme,
} = await import('../src/lib/siteVideoGallery.ts');
const {
  themeVideoCatalog,
  isProtectedThemeMockVideo,
  isThemeMockVideoId,
  filterDeletableOwnerVideos,
  isDisabledThemeMockId,
} = await import('../src/lib/siteVideoCatalog.ts');
const {
  resolveVideoActor,
  hasAdminSessionClaim,
  canManageOwnSalonVideos,
  canAddVideo,
  canDeleteVideo,
  canApproveVideos,
  canManageThemeMockRecords,
  videoEditDeniedMessage,
  editManagedVideoMetadata,
  replaceManagedVideoUrl,
  buildVideoReplaceFields,
  deleteManagedVideoRecord,
  disableThemeMockForSalon,
  restoreThemeMockForSalon,
  moderateManagedVideo,
  setManagedVideoActive,
  managedVideoRowsForSalon,
  disabledThemeMocksForSalon,
} = await import('../src/lib/videoManagement.ts');
const {
  effectiveVideoModeration,
  isCustomerVisibleSocialVideo,
  validateSocialVideoForPublish,
} = await import('../src/lib/videoModeration.ts');
const { youtubeCanonicalUrl } = await import('../src/lib/videoUrlMetadata.ts');

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
    // Bound the message — asserting on DOM nodes can otherwise serialise the
    // whole jsdom tree into the AssertionError.
    const message = String(error && error.message ? error.message : error).slice(0, 600);
    console.error(`  ✗ ${name}\n    ${message.split('\n').join('\n    ')}`);
  }
}

function section(title) {
  console.log(`\n▸ ${title}`);
}

/* ------------------------------------------------------------ */
/* Fixtures                                                      */
/* ------------------------------------------------------------ */

const YT_A = 'dQw4w9WgXcQ'; // = barber mock s1 ext id
const YT_NEW = 'abcDEF12345';
const YT_NEW2 = 'xyzUVW67890';

const originalFetch = globalThis.fetch;
let fetchImpl = null;

function mockFetch(impl) {
  fetchImpl = impl;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (fetchImpl) return fetchImpl(url, init);
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  fetchImpl = null;
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function oembedPayload(overrides = {}) {
  return {
    platform: 'youtube',
    externalVideoId: YT_NEW,
    url: youtubeCanonicalUrl(YT_NEW),
    title: 'NEW_OWNER_VIDEO_TITLE',
    description: 'NEW_OWNER_VIDEO_DESC',
    channelName: 'NEW_OWNER_CHANNEL',
    thumbnailUrl: `https://i.ytimg.com/vi/${YT_NEW}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${YT_NEW}`,
    source: 'oembed',
    ...overrides,
  };
}

function salonData(themeId = 'barber_mens_grooming', extras = {}) {
  const base = structuredClone(initialData);
  return {
    ...base,
    templateId: themeId,
    socialVideos: [],
    ...extras,
  };
}

function ownerVideo(overrides = {}) {
  return {
    id: 'owner-v-1',
    title: 'Owner fade reel',
    platform: 'youtube',
    url: youtubeCanonicalUrl(YT_NEW2),
    thumbnailUrl: `https://img.youtube.com/vi/${YT_NEW2}/hqdefault.jpg`,
    externalVideoId: YT_NEW2,
    themeId: 'barber_mens_grooming',
    videoKind: 'long',
    description: 'Owner description',
    channelName: 'Owner Channel',
    ...overrides,
  };
}

const OWNER_AUTH = { permission: 'authorized', role: 'owner' };
const OWNER_DRAFT = { permission: 'not-configured', role: 'owner' };
const ADMIN = { permission: 'authorized', role: 'admin' };
const DENIED = { permission: 'permission-denied', role: 'owner' };
const SIGNED_OUT = { permission: 'not-authenticated', role: 'owner' };

/* ------------------------------------------------------------------ */
/* 1. Actor resolution + capability matrix                             */
/* ------------------------------------------------------------------ */

section('Actor resolution — existing auth + ownership logic only');

await test('owner resolution maps onto owner-tier capabilities', () => {
  const actor = resolveVideoActor({
    supabaseConfigured: true,
    userPresent: true,
    isAdmin: hasAdminSessionClaim({ app_metadata: {} }),
    resolution: { status: 'resolved', salonId: 'salon-x' },
  });
  assert.deepEqual(actor, { permission: 'authorized', role: 'owner' });
  assert.equal(canManageOwnSalonVideos(actor), true);
  assert.equal(canAddVideo(actor), true);
  assert.equal(canDeleteVideo(actor, ownerVideo()), true);
  assert.equal(canDeleteVideo(actor, { id: 'theme:barber:s1' }), false, 'owner must not delete protected');
  assert.equal(canApproveVideos(actor), false, 'owner must not approve');
  assert.equal(canManageThemeMockRecords(actor), false, 'owner must not manage mock records');
});

await test('offline draft is owner-tier (same as 14.6/14.7), can edit but never delete mocks or approve', () => {
  const draft = resolveVideoActor({
    supabaseConfigured: false,
    userPresent: false,
    isAdmin: true, // unverifiable offline → must NOT elevate
    resolution: null,
  });
  assert.deepEqual(draft, { permission: 'not-configured', role: 'owner' });
  assert.equal(canManageOwnSalonVideos(draft), true);
  assert.equal(canDeleteVideo(draft, { id: 'theme:barber:s1' }), false);
  assert.equal(canApproveVideos(draft), false);
  assert.equal(videoEditDeniedMessage(draft.permission), null);
});

await test('denied / signed-out / foreign-owner sessions get no capabilities', () => {
  for (const status of ['not-authenticated', 'no-membership', 'ambiguous', 'permission-denied', 'error']) {
    const actor = resolveVideoActor({
      supabaseConfigured: true,
      userPresent: status !== 'not-authenticated',
      isAdmin: false,
      resolution: { status },
    });
    assert.equal(canManageOwnSalonVideos(actor), false, status);
    assert.equal(canApproveVideos(actor), false, status);
    assert.ok(videoEditDeniedMessage(actor.permission), `message for ${status}`);
  }
  assert.equal(videoEditDeniedMessage('authorized'), null);
});

await test('admin claim authorizes platform tier even without salon membership', () => {
  for (const claim of ['admin', 'platform_admin', 'super_admin', 'administrator']) {
    assert.equal(hasAdminSessionClaim({ app_metadata: { role: claim } }), true, claim);
  }
  assert.equal(hasAdminSessionClaim({ app_metadata: { roles: ['editor', 'admin'] } }), true, 'roles array');
  assert.equal(hasAdminSessionClaim({ user_metadata: { account_role: 'admin' } }), true, 'user_metadata claim');
  const actor = resolveVideoActor({
    supabaseConfigured: true,
    userPresent: true,
    isAdmin: true,
    resolution: { status: 'no-membership' },
  });
  assert.deepEqual(actor, { permission: 'authorized', role: 'admin' });
  assert.equal(canApproveVideos(actor), true);
  assert.equal(canManageThemeMockRecords(actor), true);
  assert.equal(canDeleteVideo(actor, { id: 'theme:barber:s1' }), true, 'admin may delete protected');
});

await test('salon-level roles are NOT platform admin (owner_admin stays owner-tier)', () => {
  for (const claim of ['owner_admin', 'manager', 'owner', 'service_provider']) {
    assert.equal(hasAdminSessionClaim({ app_metadata: { role: claim } }), false, claim);
  }
  assert.equal(hasAdminSessionClaim(null), false);
  assert.equal(hasAdminSessionClaim(undefined), false);
  assert.equal(hasAdminSessionClaim({}), false);
});

await test('signed-out session maps to not-authenticated even with admin claim input', () => {
  const actor = resolveVideoActor({
    supabaseConfigured: true,
    userPresent: false,
    isAdmin: true,
    resolution: null,
  });
  assert.equal(actor.permission, 'not-authenticated');
  assert.equal(actor.role, 'owner');
});

/* ------------------------------------------------------------------ */
/* 2. Metadata edit                                                    */
/* ------------------------------------------------------------------ */

section('Owner/admin metadata edit — in place for owner rows');

await test('owner video edit applies in place and keeps salon + theme + kind links', () => {
  const list = [ownerVideo()];
  const frozen = structuredClone(list);
  const result = editManagedVideoMetadata(
    list,
    { kind: 'owner', id: 'owner-v-1' },
    {
      title: 'Edited title',
      description: 'Edited description',
      channelName: 'Edited channel',
      themeId: 'nail_lash_studio',
      videoKind: 'short',
    },
    OWNER_AUTH,
  );
  assert.equal(result.ok, true);
  assert.equal(result.videos.length, 1);
  const updated = result.videos[0];
  assert.equal(updated.id, 'owner-v-1');
  assert.equal(updated.title, 'Edited title');
  assert.equal(updated.description, 'Edited description');
  assert.equal(updated.channelName, 'Edited channel');
  assert.equal(updated.themeId, 'nail_lash_studio', 'theme re-link is allowed for owner rows');
  assert.equal(updated.videoKind, 'short');
  assert.deepEqual(list, frozen, 'input list must not be mutated');
});

await test('invalid edits are refused (title/theme/kind/thumbnail) and nothing changes', () => {
  const list = [ownerVideo()];
  for (const edits of [
    { title: '   ' },
    { themeId: 'not-a-theme' },
    { videoKind: 'reel' },
    { thumbnailUrl: 'javascript:alert(1)' },
  ]) {
    const result = editManagedVideoMetadata(list, { kind: 'owner', id: 'owner-v-1' }, edits, OWNER_AUTH);
    assert.equal(result.ok, false, JSON.stringify(edits));
  }
  // Safe custom thumbnail accepted.
  const ok = editManagedVideoMetadata(
    list,
    { kind: 'owner', id: 'owner-v-1' },
    { thumbnailUrl: 'https://img.youtube.com/vi/abcDEF12345/hqdefault.jpg' },
    OWNER_AUTH,
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.videos[0].thumbnailUrl.includes('img.youtube.com'), true);
});

await test('owner CAN edit a protected showcase video — materialised as an owner override', () => {
  const mock = themeVideoCatalog('barber_mens_grooming')[0];
  assert.ok(isProtectedThemeMockVideo(mock));
  const result = editManagedVideoMetadata(
    [],
    { kind: 'mock', mock },
    { title: 'My customised fade short', description: 'Own desc' },
    OWNER_AUTH,
    { newId: 'v-over-1', now: '2026-08-15T00:00:00.000Z' },
  );
  assert.equal(result.ok, true);
  assert.equal(result.materializedOverride, true);
  const override = result.video;
  assert.equal(override.id, 'v-over-1');
  assert.equal(override.replacesMockId, mock.id);
  assert.equal(override.themeId, mock.themeId, 'override stays pinned to the mock theme');
  assert.equal(override.videoKind, mock.videoKind, 'override keeps the mock kind by default');
  assert.equal(override.title, 'My customised fade short');
  assert.equal(override.url, mock.url, 'same clip, own metadata');
  assert.equal(override.moderation, 'approved');
  assert.equal(isProtectedThemeMockVideo(override), false, 'override is an ordinary owner row');
  // The protected catalog itself is untouched.
  const catalogAfter = themeVideoCatalog('barber_mens_grooming')[0];
  assert.equal(catalogAfter.title, mock.title);
  assert.ok(isProtectedThemeMockVideo(catalogAfter));
});

await test('showcase edits stay pinned to the mock theme; denied actors refused; input untouched', () => {
  const mock = themeVideoCatalog('nail_lash_studio')[0];
  const pinned = editManagedVideoMetadata(
    [],
    { kind: 'mock', mock },
    { themeId: 'barber_mens_grooming' },
    OWNER_AUTH,
    { newId: 'v-x' },
  );
  assert.equal(pinned.ok, false, 'mock theme is locked');
  const deniedMeta = editManagedVideoMetadata([], { kind: 'mock', mock }, { title: 'X' }, DENIED, { newId: 'v-x' });
  assert.equal(deniedMeta.ok, false);
  const target = { kind: 'owner', id: 'owner-v-1' };
  const deniedOwner = editManagedVideoMetadata([ownerVideo()], target, { title: 'X' }, SIGNED_OUT);
  assert.equal(deniedOwner.ok, false);
});

/* ------------------------------------------------------------------ */
/* 3. Replace video                                                    */
/* ------------------------------------------------------------------ */

section('Replace video — owner rows in place, showcase materialised');

await test('replaceFields derive kind, canonical URL, external id and thumbnail', () => {
  const short = buildVideoReplaceFields(`https://www.youtube.com/shorts/${YT_NEW}`, null);
  assert.equal(short.ok, true);
  assert.equal(short.fields.videoKind, 'short');
  assert.ok(short.fields.url.includes('/shorts/'));
  assert.equal(short.fields.externalVideoId, YT_NEW);
  assert.ok(short.fields.thumbnailUrl.includes(`img.youtube.com/vi/${YT_NEW}/`));

  const long = buildVideoReplaceFields(`https://youtu.be/${YT_NEW}`, null);
  assert.equal(long.ok, true);
  assert.equal(long.fields.videoKind, 'long');
  assert.ok(long.fields.url.includes('watch?v='));

  // Explicit kind override wins over URL inference.
  const forced = buildVideoReplaceFields(`https://www.youtube.com/watch?v=${YT_NEW}`, null, 'short');
  assert.equal(forced.ok, true);
  assert.equal(forced.fields.videoKind, 'short');
});

await test('replace refuses invalid / unsupported links and leaves data untouched', () => {
  const list = [ownerVideo()];
  for (const url of ['not a url', 'https://youtube.com/@channel', 'https://instagram.com/reel/abc123/', 'javascript:alert(1)']) {
    const result = replaceManagedVideoUrl(list, { kind: 'owner', id: 'owner-v-1' }, url, null, OWNER_AUTH);
    assert.equal(result.ok, false, url);
    assert.deepEqual(result.ok === false ? list.length : 0, 1);
  }
  const deniedReplace = replaceManagedVideoUrl(list, { kind: 'owner', id: 'owner-v-1' }, `https://www.youtube.com/watch?v=${YT_NEW}`, null, DENIED);
  assert.equal(deniedReplace.ok, false);
});

await test('owner-row replace updates URL/ext-id/kind and keeps manual metadata without a fetch', () => {
  const list = [ownerVideo({ title: 'Keep my title' })];
  const result = replaceManagedVideoUrl(
    list,
    { kind: 'owner', id: 'owner-v-1' },
    `https://www.youtube.com/shorts/${YT_NEW}`,
    null,
    OWNER_DRAFT,
  );
  assert.equal(result.ok, true);
  const replaced = result.videos[0];
  assert.equal(replaced.id, 'owner-v-1', 'same salon row, replaced in place');
  assert.equal(replaced.externalVideoId, YT_NEW);
  assert.equal(replaced.videoKind, 'short');
  assert.ok(replaced.url.includes('/shorts/'));
  assert.equal(replaced.title, 'Keep my title', 'no fetch → owner metadata kept');
  assert.ok(replaced.thumbnailUrl.includes(YT_NEW), 'derived thumb replaces stale one');
});

await test('replacing a showcase record materialises an override; original stays protected', () => {
  const mock = themeVideoCatalog('barber_mens_grooming').find((v) => v.videoKind === 'long');
  const meta = {
    platform: 'youtube',
    externalVideoId: YT_NEW,
    url: youtubeCanonicalUrl(YT_NEW),
    title: 'Fetched replacement title',
    description: 'Fetched replacement desc',
    channelName: 'Fetched channel',
    thumbnailUrl: `https://i.ytimg.com/vi/${YT_NEW}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${YT_NEW}`,
    source: 'oembed',
  };
  const result = replaceManagedVideoUrl([], { kind: 'mock', mock }, youtubeCanonicalUrl(YT_NEW), meta, OWNER_AUTH, {
    newId: 'v-over-replace',
  });
  assert.equal(result.ok, true);
  assert.equal(result.materializedOverride, true);
  const override = result.video;
  assert.equal(override.id, 'v-over-replace');
  assert.equal(override.replacesMockId, mock.id);
  assert.equal(override.externalVideoId, YT_NEW);
  assert.equal(override.title, 'Fetched replacement title', 'fresh platform metadata adopted');
  assert.equal(override.channelName, 'Fetched channel');
  assert.equal(override.themeId, mock.themeId);
  // Original protected record intact in the shared catalog.
  assert.ok(themeVideoCatalog('barber_mens_grooming').some((v) => v.id === mock.id && v.externalVideoId === mock.externalVideoId));
});

/* ------------------------------------------------------------------ */
/* 4. Delete + per-salon tombstones                                    */
/* ------------------------------------------------------------------ */

section('Delete rules + admin showcase remove/restore');

await test('owner-tier delete: own rows deletable, showcase records refused everywhere', () => {
  const own = deleteManagedVideoRecord([ownerVideo()], 'owner-v-1', OWNER_AUTH);
  assert.equal(own.ok, true);
  assert.equal(own.videos.length, 0);

  // Protected id not even in the list → still refused for owners.
  for (const actor of [OWNER_AUTH, OWNER_DRAFT]) {
    const blocked = deleteManagedVideoRecord([ownerVideo()], 'theme:barber:s1', actor);
    assert.equal(blocked.ok === false && /showcase/i.test(blocked.error), true);
  }

  // A protected row parked in owner storage stays protected for owners.
  const parkedMock = themeVideoCatalog('barber_mens_grooming')[0];
  const inList = deleteManagedVideoRecord([parkedMock], parkedMock.id, OWNER_AUTH);
  assert.equal(inList.ok, false);
  // 15.5 quick-list guard intact.
  const after = filterDeletableOwnerVideos([parkedMock, ownerVideo()], parkedMock.id);
  assert.equal(after.length, 2);

  const missing = deleteManagedVideoRecord([ownerVideo()], 'nope', OWNER_AUTH);
  assert.equal(missing.ok === false && /could not be found/i.test(missing.error), true);
});

await test('admin disable removes the showcase record for THIS salon only (+drops its overrides)', () => {
  const mock = themeVideoCatalog('nail_lash_studio')[0];
  const data = salonData('nail_lash_studio', {
    socialVideos: [
      { ...mock, id: 'v-over-custom', replacesMockId: mock.id, dateAdded: 'Today' },
      ownerVideo({ themeId: 'nail_lash_studio' }),
    ],
  });

  // Owner tier refused at the data layer.
  const refused = disableThemeMockForSalon(data, mock.id, OWNER_AUTH);
  assert.equal(refused.ok, false);
  // Non-showcase id refused.
  const bad = disableThemeMockForSalon(data, 'owner-v-1', ADMIN);
  assert.equal(bad.ok, false);

  const done = disableThemeMockForSalon(data, mock.id, ADMIN);
  assert.equal(done.ok, true);
  assert.ok(done.data.disabledThemeVideoIds.includes(mock.id));
  assert.equal(done.data.socialVideos.some((v) => v.replacesMockId === mock.id), false, 'overrides of it are dropped');
  assert.equal(done.data.socialVideos.some((v) => v.id === 'owner-v-1'), true, 'unrelated owner rows kept');
  // The shared catalog never changes (other salons/themes unaffected).
  assert.ok(themeVideoCatalog('nail_lash_studio').some((v) => v.id === mock.id));
  assert.equal(isDisabledThemeMockId(done.data.disabledThemeVideoIds, mock.id), true);
});

await test('restore brings the showcase record back for the salon', () => {
  const mock = themeVideoCatalog('beauty_skin_spa')[3];
  const data = salonData('beauty_skin_spa', { disabledThemeVideoIds: [mock.id] });
  const refused = restoreThemeMockForSalon(data, mock.id, OWNER_DRAFT);
  assert.equal(refused.ok, false, 'restore is admin-only');
  const done = restoreThemeMockForSalon(data, mock.id, ADMIN);
  assert.equal(done.ok, true);
  assert.deepEqual(done.data.disabledThemeVideoIds, []);
});

await test('gallery fill honours tombstones: disabled mock is not refilled, restore returns 5+5', () => {
  const theme = 'family_full_service';
  const mock = themeVideoCatalog(theme)[0]; // first short
  const data = salonData(theme, { disabledThemeVideoIds: [mock.id] });
  const counts = videoKindCountsForTheme(theme, data);
  assert.deepEqual(counts, { short: 4, long: 5, total: 9 }, 'tombstoned mock is not replaced by another');
  assert.equal(videoItemsForTheme(theme, data).some((i) => i.id === mock.id), false);
  // Other themes unaffected.
  assert.deepEqual(videoKindCountsForTheme('barber_mens_grooming', data), { short: 5, long: 5, total: 10 });
  const restored = restoreThemeMockForSalon(data, mock.id, ADMIN);
  assert.deepEqual(videoKindCountsForTheme(theme, restored.ok ? restored.data : data), { short: 5, long: 5, total: 10 });
});

/* ------------------------------------------------------------------ */
/* 5. Moderation + visibility                                          */
/* ------------------------------------------------------------------ */

section('Admin approve/manage + customer visibility');

await test('moderation transitions: approve / reject (reason+inactive) / pending', () => {
  const list = [ownerVideo({ moderation: 'pending' })];
  const approved = moderateManagedVideo(list, 'owner-v-1', 'approve', ADMIN, { now: '2026-08-15T01:00:00.000Z' });
  assert.equal(approved.ok, true);
  assert.equal(approved.video.moderation, 'approved');
  assert.equal(approved.video.rejectionReason, undefined);

  const rejected = moderateManagedVideo(list, 'owner-v-1', 'reject', ADMIN, {
    reason: 'Wrong salon content',
    now: '2026-08-15T02:00:00.000Z',
  });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.video.moderation, 'rejected');
  assert.equal(rejected.video.rejectionReason, 'Wrong salon content');
  assert.equal(rejected.video.status, 'inactive', 'rejection unpublishes');
  assert.equal(rejected.video.reviewedAt, '2026-08-15T02:00:00.000Z');

  const pending = moderateManagedVideo(list, 'owner-v-1', 'pending', ADMIN);
  assert.equal(pending.ok && pending.video.moderation === 'pending', true);

  // Owner tier / signed-out sessions refused at the data layer.
  assert.equal(moderateManagedVideo(list, 'owner-v-1', 'approve', OWNER_AUTH).ok, false);
  assert.equal(moderateManagedVideo(list, 'owner-v-1', 'reject', SIGNED_OUT).ok, false);
});

await test('approve runs the publish gate — broken videos are never approved', () => {
  const broken = ownerVideo({ url: 'not-a-url', moderation: 'pending' });
  assert.ok(validateSocialVideoForPublish(broken).length > 0);
  const refused = moderateManagedVideo([broken], 'owner-v-1', 'approve', ADMIN);
  assert.equal(refused.ok, false);
  assert.equal(effectiveVideoModeration(undefined), 'approved', 'grandfathered');
  assert.equal(isCustomerVisibleSocialVideo(ownerVideo()), true, 'grandfathered visible');
});

await test('pending/rejected/unpublished owner videos are hidden; fill keeps 5+5', () => {
  const theme = 'barber_mens_grooming';
  const base = salonData(theme);
  for (const state of [
    { moderation: 'pending' },
    { moderation: 'rejected', status: 'inactive' },
    { status: 'inactive' },
  ]) {
    const data = { ...base, socialVideos: [ownerVideo(state)] };
    const items = videoItemsForTheme(theme, data);
    assert.equal(items.some((i) => i.id === 'owner-v-1'), false, JSON.stringify(state));
    assert.deepEqual(videoKindCountsForTheme(theme, data), { short: 5, long: 5, total: 10 });
  }
  // Grandfathered (no moderation fields) owner video still shows — 15.1–15.5 preserved.
  const visible = videoItemsForTheme(theme, { ...base, socialVideos: [ownerVideo()] });
  assert.equal(visible.some((i) => i.id === 'owner-v-1' && i.origin === 'owner'), true);
  assert.deepEqual(videoKindCountsForTheme(theme, { ...base, socialVideos: [ownerVideo()] }).total, 10);
});

await test('unpublish/republish gate: reactivation requires approved moderation', () => {
  const list = [ownerVideo()];
  const off = setManagedVideoActive(list, 'owner-v-1', false, OWNER_AUTH);
  assert.equal(off.ok, true);
  assert.equal(off.video.status, 'inactive');
  assert.equal(isCustomerVisibleSocialVideo(off.video), false);
  const on = setManagedVideoActive(off.videos, 'owner-v-1', true, OWNER_DRAFT);
  assert.equal(on.ok === true && on.video.status === 'active', true);

  const rejectedList = [ownerVideo({ moderation: 'rejected', status: 'inactive' })];
  const blockedOn = setManagedVideoActive(rejectedList, 'owner-v-1', true, ADMIN);
  assert.equal(blockedOn.ok, false, 'rejected video cannot be reactivated directly');
  assert.equal(setManagedVideoActive(list, 'owner-v-1', false, SIGNED_OUT).ok, false);

  // Theme isolation intact: the foreign-theme video never renders here.
  const foreign = videoItemsForTheme('nail_lash_studio', {
    socialVideos: [ownerVideo({ themeId: 'barber_mens_grooming' })],
  });
  assert.equal(foreign.some((i) => i.id === 'owner-v-1'), false);
});

/* ------------------------------------------------------------------ */
/* 6. Management projection                                            */
/* ------------------------------------------------------------------ */

section('Management projection — salon effective set');

await test('panel projection lists owner rows + un-shadowed showcase records for the active theme', () => {
  const theme = 'barber_mens_grooming';
  const rows = managedVideoRowsForSalon({ socialVideos: [] }, theme);
  assert.equal(rows.length, 10);
  assert.ok(rows.every((r) => r.origin === 'theme' && r.isProtected));
  assert.equal(rows.filter((r) => r.kind === 'short').length, 5);

  // Owner override (same ext id) shadows its showcase record in the projection.
  const mock = themeVideoCatalog(theme)[0];
  const override = { ...mock, id: 'v-over-9', replacesMockId: mock.id, dateAdded: 'Today' };
  const rows2 = managedVideoRowsForSalon({ socialVideos: [override] }, theme);
  assert.equal(rows2.length, 10, 'override replaces the showcase row, no duplicate');
  assert.equal(rows2.filter((r) => r.video.externalVideoId === mock.externalVideoId).length, 1);
  const overrideRow = rows2.find((r) => r.key === 'v-over-9');
  assert.equal(overrideRow.origin, 'owner');
  assert.equal(overrideRow.isOverride, true);
});

await test('projection never includes another salon or theme content; hidden states still listed', () => {
  const theme = 'hair_studio_color_bar';
  const rows = managedVideoRowsForSalon(
    {
      socialVideos: [
        ownerVideo({ themeId: 'barber_mens_grooming' }), // foreign-theme row stays visible to the owner
        ownerVideo({ id: 'owner-v-2', themeId: theme, moderation: 'pending', url: youtubeCanonicalUrl(YT_A), externalVideoId: YT_A }),
      ],
    },
    theme,
  );
  const other = rows.find((r) => r.key === 'owner-v-1');
  assert.equal(other.themeId, 'barber_mens_grooming', 'foreign-theme owner row shown with its own theme label');
  const pending = rows.find((r) => r.key === 'owner-v-2');
  assert.equal(pending.moderation, 'pending');
  assert.equal(pending.customerVisible, false);
  assert.ok(
    rows.filter((r) => r.origin === 'theme').every((r) => r.video.themeId === theme),
    'only this theme showcase records',
  );
});

/* ------------------------------------------------------------------ */
/* 7. UI — panel inside Step 07                                        */
/* ------------------------------------------------------------------ */

section('UI — VideoManagementPanel (owner draft tier)');

function panelHarness({ data, actor, themeId = 'barber_mens_grooming' }) {
  const ref = { current: data };
  function Harness(props) {
    const [d, setD] = React.useState(props.initial);
    ref.current = d;
    return React.createElement(VideoManagementPanel, {
      data: d,
      setData: setD,
      onSave: () => {},
      actor,
      themeId,
      onShowFeedback: () => {},
    });
  }
  const utils = render(React.createElement(Harness, { initial: data }));
  return { utils, getData: () => ref.current };
}

await test('owner tier: showcase rows listed, protected, no admin affordances', () => {
  const { utils } = panelHarness({ data: salonData('barber_mens_grooming'), actor: OWNER_DRAFT });
  const items = utils.container.querySelectorAll('[data-testid="video-management-item"]');
  assert.equal(items.length, 10, '10 showcase rows for the active theme');
  assert.equal(utils.getByTestId('video-management-actor').getAttribute('data-role'), 'owner');
  // Owners can manage (edit/replace) showcase records…
  assert.ok(utils.getByTestId('video-management-manage-theme:barber:s1'));
  // …but never delete them: no Remove affordance, explicit Protected marker.
  assert.equal(utils.queryByTestId('video-management-disable-theme:barber:s1'), null);
  assert.ok(utils.getByTestId('video-management-protected-theme:barber:s1'));
  // No approve / reject controls anywhere in owner tier.
  assert.equal(utils.container.querySelectorAll('[data-testid^="video-management-approve-"]').length, 0);
  assert.equal(utils.container.querySelectorAll('[data-testid^="video-management-reject-"]').length, 0);
  cleanup();
});

await test('owner edits a showcase video via the modal → override saved, public gallery uses it', async () => {
  const { utils, getData } = panelHarness({ data: salonData('barber_mens_grooming'), actor: OWNER_DRAFT });
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-management-manage-theme:barber:s1'));
  });
  assert.ok(utils.getByTestId('video-manage-modal'));
  assert.ok(utils.getByTestId('video-manage-mock-note'));
  assert.ok(utils.getByTestId('video-edit-theme-locked'), 'mock theme stays locked');
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-edit-title'), { target: { value: 'OUR FADE MASTERPIECE' } });
  });
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-manage-save'));
  });

  const saved = getData().socialVideos;
  assert.equal(saved.length, 1);
  const override = saved[0];
  assert.equal(override.replacesMockId, 'theme:barber:s1');
  assert.equal(override.title, 'OUR FADE MASTERPIECE');
  assert.equal(override.themeId, 'barber_mens_grooming');
  assert.equal(override.videoKind, 'short');
  assert.equal(isThemeMockVideoId(override.id), false, 'fresh owner id, not a protected id');

  // Public gallery: owner version renders, the original mock is shadowed, 5+5 holds.
  const items = videoItemsForTheme('barber_mens_grooming', getData());
  const own = items.find((i) => i.id === override.id);
  assert.ok(own && own.origin === 'owner' && own.title === 'OUR FADE MASTERPIECE');
  assert.equal(items.some((i) => i.id === 'theme:barber:s1'), false);
  assert.deepEqual(videoKindCountsForTheme('barber_mens_grooming', getData()), { short: 5, long: 5, total: 10 });
  // Another theme's gallery is untouched.
  assert.deepEqual(videoKindCountsForTheme('beauty_skin_spa', getData()), { short: 5, long: 5, total: 10 });
  cleanup();
});

await test('owner edits their own video: metadata + theme re-link happen in place', async () => {
  const data = salonData('barber_mens_grooming', { socialVideos: [ownerVideo()] });
  const { utils, getData } = panelHarness({ data, actor: OWNER_DRAFT });
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-management-manage-owner-v-1'));
  });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-edit-title'), { target: { value: 'Renamed by owner' } });
    fireEvent.change(utils.getByTestId('video-edit-kind'), { target: { value: 'short' } });
    fireEvent.change(utils.getByTestId('video-edit-theme'), { target: { value: 'nail_lash_studio' } });
  });
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-manage-save'));
  });
  const saved = getData().socialVideos[0];
  assert.equal(saved.id, 'owner-v-1');
  assert.equal(saved.title, 'Renamed by owner');
  assert.equal(saved.videoKind, 'short');
  assert.equal(saved.themeId, 'nail_lash_studio');
  // It now belongs to the nail theme gallery (correct salon + theme + kind link).
  assert.equal(videoItemsForTheme('barber_mens_grooming', getData()).some((i) => i.id === 'owner-v-1'), false);
  assert.equal(videoItemsForTheme('nail_lash_studio', getData()).some((i) => i.id === 'owner-v-1' && i.kind === 'short'), true);
  cleanup();
});

await test('owner replaces the link via the modal: auto-fetch fills metadata, kind re-derived', async () => {
  mockFetch(async (url) => {
    assert.ok(String(url).includes('/api/video-metadata'), 'reuse the Phase 15.2 route');
    return jsonResponse(oembedPayload());
  });
  const data = salonData('barber_mens_grooming', { socialVideos: [ownerVideo()] });
  const { utils, getData } = panelHarness({ data, actor: OWNER_DRAFT });
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-management-manage-owner-v-1'));
  });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-replace-url-input'), {
      target: { value: `https://www.youtube.com/shorts/${YT_NEW}` },
    });
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  await waitFor(() => assert.ok(utils.queryByTestId('video-replace-success')), { timeout: 3000 });

  await act(async () => {
    fireEvent.click(utils.getByTestId('video-manage-save'));
  });
  const saved = getData().socialVideos[0];
  assert.equal(saved.id, 'owner-v-1', 'replace is in place for owner rows');
  assert.equal(saved.externalVideoId, YT_NEW);
  assert.ok(saved.url.includes('/shorts/'), 'shorts URL retained');
  assert.equal(saved.videoKind, 'short', 'kind re-derived from the pasted shorts URL');
  assert.equal(saved.title, 'NEW_OWNER_VIDEO_TITLE', 'fetched title adopted');
  assert.equal(saved.channelName, 'NEW_OWNER_CHANNEL');
  assert.ok(saved.thumbnailUrl.includes(YT_NEW));
  cleanup();
  restoreFetch();
});

await test('replace modal surfaces a clear error for invalid links and refuses to save', async () => {
  const data = salonData('barber_mens_grooming', { socialVideos: [ownerVideo()] });
  const { utils, getData } = panelHarness({ data, actor: OWNER_DRAFT });
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-management-manage-owner-v-1'));
  });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-replace-url-input'), {
      target: { value: 'https://www.youtube.com/@somechannel' },
    });
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  await waitFor(() => assert.ok(utils.queryByTestId('video-replace-error')), { timeout: 3000 });
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-manage-save'));
  });
  assert.ok(utils.getByTestId('video-manage-error'));
  assert.equal(getData().socialVideos[0].externalVideoId, YT_NEW2, 'unchanged');
  cleanup();
});

await test('owner deletes their own video from the panel; showcase rows offer no delete', async () => {
  const data = salonData('barber_mens_grooming', { socialVideos: [ownerVideo()] });
  const { utils, getData } = panelHarness({ data, actor: OWNER_DRAFT });
  assert.ok(utils.getByTestId('video-management-delete-owner-v-1'));
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-management-delete-owner-v-1'));
  });
  assert.equal(getData().socialVideos.length, 0);
  // Deleting the override restores the 5+5 protected defaults publicly.
  assert.deepEqual(videoKindCountsForTheme('barber_mens_grooming', getData()), { short: 5, long: 5, total: 10 });
  cleanup();
});

section('UI — admin tier (approve / manage protected records)');

await test('admin approves, rejects (with reason) and marks pending from the panel', async () => {
  const data = salonData('barber_mens_grooming', {
    socialVideos: [ownerVideo({ moderation: 'pending' })],
  });
  const { utils, getData } = panelHarness({ data, actor: ADMIN });
  assert.equal(utils.getByTestId('video-management-actor').getAttribute('data-role'), 'admin');

  await act(async () => {
    fireEvent.click(utils.getByTestId('video-management-approve-owner-v-1'));
  });
  assert.equal(getData().socialVideos[0].moderation, 'approved');

  await act(async () => {
    fireEvent.click(utils.getByTestId('video-management-reject-owner-v-1'));
  });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-management-reject-input'), { target: { value: 'Off-brand content' } });
    fireEvent.click(utils.getByTestId('video-management-reject-confirm'));
  });
  const rejected = getData().socialVideos[0];
  assert.equal(rejected.moderation, 'rejected');
  assert.equal(rejected.rejectionReason, 'Off-brand content');
  assert.equal(rejected.status, 'inactive');
  // Hidden from customers now.
  assert.equal(videoItemsForTheme('barber_mens_grooming', getData()).some((i) => i.id === 'owner-v-1'), false);
  assert.ok(utils.getByTestId('video-management-reason').textContent.includes('Off-brand content'));
  cleanup();
});

await test('admin removes + restores a showcase record (per-salon tombstone)', async () => {
  const data = salonData('nail_lash_studio');
  const { utils, getData } = panelHarness({ data, actor: ADMIN, themeId: 'nail_lash_studio' });
  assert.ok(utils.getByTestId('video-management-disable-theme:nail:s1'));
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-management-disable-theme:nail:s1'));
  });
  assert.deepEqual(getData().disabledThemeVideoIds, ['theme:nail:s1']);
  // Row disappears from the manage list and from the public gallery (kind drops to 4).
  assert.equal(
    utils.container.querySelector('[data-testid="video-management-item"][data-item-id="theme:nail:s1"]'),
    null,
  );
  assert.equal(videoKindCountsForTheme('nail_lash_studio', getData()).short, 4);
  // Removed section shows it with a restore affordance.
  assert.ok(utils.getByTestId('video-management-removed'));
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-management-restore-theme:nail:s1'));
  });
  assert.deepEqual(getData().disabledThemeVideoIds, []);
  assert.equal(videoKindCountsForTheme('nail_lash_studio', getData()).short, 5);
  cleanup();
});

section('UI — locked when unauthorized + Step 07 integration');

await test('denied session: locked notice, no manage affordances, helpers still refuse', () => {
  const data = salonData('barber_mens_grooming', { socialVideos: [ownerVideo()] });
  const { utils } = panelHarness({ data, actor: DENIED });
  assert.ok(utils.getByTestId('video-management-locked'));
  assert.equal(utils.container.querySelectorAll('[data-testid^="video-management-manage-"]').length, 0);
  assert.equal(utils.container.querySelectorAll('[data-testid^="video-management-delete-"]').length, 0);
  // Data-layer enforcement independent of the buttons.
  const result = deleteManagedVideoRecord(data.socialVideos, 'owner-v-1', DENIED);
  assert.equal(result.ok, false);
  const edit = editManagedVideoMetadata(data.socialVideos, { kind: 'owner', id: 'owner-v-1' }, { title: 'X' }, DENIED);
  assert.equal(edit.ok, false);
  cleanup();
});

await test('Step 07 mounts the management panel and keeps the 15.4 add flow working', async () => {
  mockFetch(async () => jsonResponse(oembedPayload()));
  let latest = salonData('nail_lash_studio');
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => { latest = d; },
      onNext: () => {},
      onPrev: () => {},
      onSave: () => {},
    }),
  );
  assert.ok(utils.getByTestId('video-management-panel'), 'panel mounted in Step 07');
  assert.equal(utils.getByTestId('video-management-actor').getAttribute('data-role'), 'owner');
  const panelItems = utils.container.querySelectorAll('[data-testid="video-management-item"]');
  assert.equal(panelItems.length, 10, 'showcase records manageable for the nail theme');

  // Existing paste-add flow still works (Phase 15.2/15.4 preserved).
  await act(async () => {
    fireEvent.click(utils.getByTestId('add-social-video-open'));
  });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), {
      target: { value: youtubeCanonicalUrl(YT_NEW) },
    });
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  await waitFor(() => assert.ok(utils.queryByTestId('video-meta-preview')), { timeout: 3000 });
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-add-submit'));
  });
  assert.equal(latest.socialVideos.length, 1);
  assert.equal(latest.socialVideos[0].title, 'NEW_OWNER_VIDEO_TITLE');
  assert.equal(latest.socialVideos[0].themeId, 'nail_lash_studio', 'salon theme linkage kept');
  assert.equal(latest.socialVideos[0].likesCount, undefined, 'no likes (out of scope)');
  cleanup();
  restoreFetch();
});

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

console.log(`\n════════════════════════════════════════════════════════════`);
console.log(`PHASE 15.6 — video management: ${passed} passed, ${failed} failed`);
console.log(`════════════════════════════════════════════════════════════`);

if (failed > 0) {
  console.error('\nFailing tests:');
  for (const f of failures) {
    console.error(`  - ${f.name}`);
  }
  process.exit(1);
}

process.exit(0);
