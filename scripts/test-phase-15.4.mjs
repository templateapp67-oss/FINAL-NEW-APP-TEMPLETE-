/**
 * PHASE 15.4 — Auto Thumbnail + Title + Description
 *
 * Builds on Phase 15.2 `fetchVideoMetadata` (no second/fake fetch system).
 * Verifies:
 *   1. Paste YouTube URL → auto-populate thumb, title, description, channel, URL.
 *   2. Merge policy never overwrites manual edits or valid platform metadata.
 *   3. Partial / failed metadata shows a clear notice or error.
 *   4. Broken-thumbnail fallback (owner list + form + public gallery).
 *   5. Metadata stays linked to salon theme + short/long kind.
 *   6. No cross-theme metadata copy; no new DB fields/API keys.
 *   7. Phase 15.1–15.3 contracts still hold.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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

const {
  fetchVideoMetadata,
  mergePlatformMetadataIntoForm,
  platformMetadataIsComplete,
  partialMetadataNotice,
  socialVideoFromPasteAndMetadata,
  derivedYoutubeMetadata,
  youtubeCanonicalUrl,
} = await import('../src/lib/videoUrlMetadata.ts');
const { videoItemsForTheme, resolveVideoKind } = await import('../src/lib/siteVideoGallery.ts');
const StepSocials = (await import('../src/screens/StepSocials.tsx')).default;
const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { setSiteLocale, setSiteAppearance } = await import('../src/lib/siteNavigation.ts');
const { setWebsiteSectionFlagsForTests } = await import('../src/lib/siteStructure.ts');

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
    console.error(`  ✗ ${name}\n    ${String(error && error.message ? error.message : error).split('\n').join('\n    ')}`);
  }
}

function section(title) {
  console.log(`\n▸ ${title}`);
}

const YT_ID = 'dQw4w9WgXcQ';
const YT_ID_B = 'jNQXAC9IVRw';

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
    externalVideoId: YT_ID,
    url: youtubeCanonicalUrl(YT_ID),
    title: 'AUTO_TITLE_SKIN_FADE',
    description: 'AUTO_DESC_BARBER_WORK',
    channelName: 'AUTO_CHANNEL_ROYAL',
    thumbnailUrl: `https://i.ytimg.com/vi/${YT_ID}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${YT_ID}`,
    source: 'oembed',
    ...overrides,
  };
}

function salonBase(themeId = 'barber_mens_grooming') {
  return {
    ...structuredClone(initialData),
    templateId: themeId,
    socialVideos: [],
  };
}

function reset() {
  cleanup();
  setSiteLocale('en');
  setSiteAppearance('light');
  setWebsiteSectionFlagsForTests({});
}

/* ------------------------------------------------------------------ */
/* 1. Merge policy (pure)                                              */
/* ------------------------------------------------------------------ */

section('Merge policy — never overwrite valid metadata unnecessarily');

await test('empty form accepts all platform fields', () => {
  const merged = mergePlatformMetadataIntoForm(
    { title: '', description: '', channelName: '', thumbnailUrl: '', url: '', platform: 'youtube', externalVideoId: null },
    oembedPayload(),
  );
  assert.equal(merged.title, 'AUTO_TITLE_SKIN_FADE');
  assert.equal(merged.description, 'AUTO_DESC_BARBER_WORK');
  assert.equal(merged.channelName, 'AUTO_CHANNEL_ROYAL');
  assert.ok(merged.thumbnailUrl.includes(YT_ID));
  assert.equal(merged.url, youtubeCanonicalUrl(YT_ID));
  assert.equal(merged.externalVideoId, YT_ID);
});

await test('manual title is preserved when platform returns a different title', () => {
  const merged = mergePlatformMetadataIntoForm(
    {
      title: 'My custom salon title',
      description: '',
      channelName: '',
      thumbnailUrl: '',
      url: youtubeCanonicalUrl(YT_ID),
      platform: 'youtube',
      externalVideoId: YT_ID,
    },
    oembedPayload(),
    { titleManual: true },
  );
  assert.equal(merged.title, 'My custom salon title');
  assert.equal(merged.description, 'AUTO_DESC_BARBER_WORK');
  assert.equal(merged.channelName, 'AUTO_CHANNEL_ROYAL');
});

await test('previous auto-fill can refresh to richer oEmbed without clobbering manual', () => {
  const derived = derivedYoutubeMetadata(YT_ID);
  const first = mergePlatformMetadataIntoForm(
    { title: '', description: '', channelName: '', thumbnailUrl: '', url: '', platform: 'youtube', externalVideoId: null },
    derived,
  );
  assert.equal(first.title, '');
  assert.ok(first.thumbnailUrl.includes(YT_ID));

  const richer = oembedPayload({ source: 'oembed' });
  const second = mergePlatformMetadataIntoForm(first, richer, {}, derived);
  assert.equal(second.title, 'AUTO_TITLE_SKIN_FADE');
  assert.equal(second.channelName, 'AUTO_CHANNEL_ROYAL');
  // Thumb may refresh to i.ytimg form from oEmbed.
  assert.ok(second.thumbnailUrl.includes(YT_ID));
});

await test('divergent non-manual value is kept (treated as owner-owned)', () => {
  const merged = mergePlatformMetadataIntoForm(
    {
      title: 'Owner kept this',
      description: 'Owner desc',
      channelName: '',
      thumbnailUrl: '',
      url: youtubeCanonicalUrl(YT_ID),
      platform: 'youtube',
      externalVideoId: YT_ID,
    },
    oembedPayload(),
    {},
    null, // no previous snapshot → do not clobber
  );
  assert.equal(merged.title, 'Owner kept this');
  assert.equal(merged.description, 'Owner desc');
  assert.equal(merged.channelName, 'AUTO_CHANNEL_ROYAL');
});

await test('platformMetadataIsComplete + partialMetadataNotice', () => {
  assert.equal(platformMetadataIsComplete(oembedPayload()), true);
  assert.equal(platformMetadataIsComplete(derivedYoutubeMetadata(YT_ID)), false);
  assert.ok(partialMetadataNotice(derivedYoutubeMetadata(YT_ID)));
  assert.equal(partialMetadataNotice(oembedPayload()), null);
});

/* ------------------------------------------------------------------ */
/* 2. socialVideoFromPasteAndMetadata binding                          */
/* ------------------------------------------------------------------ */

section('Saved SocialVideo binds salon theme + kind + metadata');

await test('paste + metadata produces complete SocialVideo with short kind retained', () => {
  const meta = oembedPayload();
  const video = socialVideoFromPasteAndMetadata({
    metadata: meta,
    form: {
      title: meta.title,
      description: meta.description,
      channelName: meta.channelName,
      thumbnailUrl: meta.thumbnailUrl,
      url: meta.url,
      platform: 'youtube',
      externalVideoId: YT_ID,
    },
    videoKind: 'short',
    themeId: 'barber_mens_grooming',
    id: 'v-paste-1',
  });
  assert.equal(video.title, 'AUTO_TITLE_SKIN_FADE');
  assert.equal(video.description, 'AUTO_DESC_BARBER_WORK');
  assert.equal(video.channelName, 'AUTO_CHANNEL_ROYAL');
  assert.ok(video.thumbnailUrl.includes(YT_ID));
  assert.equal(video.externalVideoId, YT_ID);
  assert.equal(video.themeId, 'barber_mens_grooming');
  assert.equal(video.videoKind, 'short');
  // Shorts URL retained even if form had watch URL.
  assert.ok(video.url.includes('/shorts/'));
  assert.equal(video.likesCount, undefined);
});

await test('long kind keeps watch URL', () => {
  const meta = oembedPayload({ externalVideoId: YT_ID_B, url: youtubeCanonicalUrl(YT_ID_B), thumbnailUrl: `https://i.ytimg.com/vi/${YT_ID_B}/hqdefault.jpg` });
  const video = socialVideoFromPasteAndMetadata({
    metadata: meta,
    form: {
      title: 'Long cut',
      description: 'desc',
      channelName: 'Shop',
      thumbnailUrl: meta.thumbnailUrl,
      url: meta.url,
      platform: 'youtube',
      externalVideoId: YT_ID_B,
    },
    videoKind: 'long',
    themeId: 'hair_studio_color_bar',
  });
  assert.equal(video.videoKind, 'long');
  assert.ok(video.url.includes('watch?v='));
  assert.equal(video.themeId, 'hair_studio_color_bar');
});

await test('gallery resolves auto-filled owner video with description + kind, no cross-theme leak', () => {
  const video = socialVideoFromPasteAndMetadata({
    metadata: oembedPayload(),
    form: {
      title: 'BOUND_FADE',
      description: 'BOUND_DESC',
      channelName: 'BOUND_CHANNEL',
      thumbnailUrl: `https://i.ytimg.com/vi/${YT_ID}/hqdefault.jpg`,
      url: `https://www.youtube.com/shorts/${YT_ID}`,
      platform: 'youtube',
      externalVideoId: YT_ID,
    },
    videoKind: 'short',
    themeId: 'barber_mens_grooming',
    id: 'v-bound-1',
  });
  const items = videoItemsForTheme('barber_mens_grooming', { socialVideos: [video] });
  const found = items.find((i) => i.id === 'v-bound-1');
  assert.ok(found);
  assert.equal(found.title, 'BOUND_FADE');
  assert.equal(found.description, 'BOUND_DESC');
  assert.equal(found.channelName, 'BOUND_CHANNEL');
  assert.equal(found.kind, 'short');
  assert.equal(found.origin, 'owner');
  assert.ok(found.thumbnailUrl.includes(YT_ID));

  const spa = videoItemsForTheme('beauty_skin_spa', { socialVideos: [video] });
  assert.equal(spa.some((i) => i.id === 'v-bound-1'), false);
  assert.equal(spa.some((i) => i.title === 'BOUND_FADE'), false);
});

/* ------------------------------------------------------------------ */
/* 3. Owner UI — paste only                                            */
/* ------------------------------------------------------------------ */

section('Owner UI — paste URL auto-fills all metadata fields');

await test('pasting YouTube URL fills title, thumb, description, channel; save needs only URL', async () => {
  mockFetch(async (url) => {
    assert.ok(String(url).includes('/api/video-metadata'), 'must use Phase 15.2 route');
    return jsonResponse(oembedPayload());
  });

  let latest = salonBase('barber_mens_grooming');
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => { latest = d; },
      onNext: () => {},
      onPrev: () => {},
    }),
  );

  await act(async () => {
    fireEvent.click(utils.getByTestId('add-social-video-open'));
  });
  assert.ok(utils.getByTestId('video-paste-form'));

  // Title starts empty — owner does not type it.
  assert.equal(utils.getByTestId('video-title-input').value, '');

  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), {
      target: { value: `https://youtu.be/${YT_ID}` },
    });
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700));
  });

  await waitFor(() => {
    assert.ok(utils.queryByTestId('video-meta-success') || utils.queryByTestId('video-meta-preview'));
  }, { timeout: 3000 });

  assert.equal(utils.getByTestId('video-title-input').value, 'AUTO_TITLE_SKIN_FADE');
  assert.equal(utils.getByTestId('video-channel-field').value, 'AUTO_CHANNEL_ROYAL');
  assert.equal(utils.getByTestId('video-description-field').value, 'AUTO_DESC_BARBER_WORK');
  const thumb = utils.queryByTestId('video-thumb-selected') || utils.queryByTestId('video-meta-thumb');
  assert.ok(thumb);
  assert.ok(thumb.getAttribute('src')?.includes(YT_ID));
  assert.ok(utils.getByTestId('video-meta-preview'));

  // Save without any further typing.
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-add-submit'));
  });

  assert.equal(latest.socialVideos?.length, 1);
  const saved = latest.socialVideos[0];
  assert.equal(saved.title, 'AUTO_TITLE_SKIN_FADE');
  assert.equal(saved.description, 'AUTO_DESC_BARBER_WORK');
  assert.equal(saved.channelName, 'AUTO_CHANNEL_ROYAL');
  assert.ok(saved.thumbnailUrl.includes(YT_ID));
  assert.equal(saved.externalVideoId, YT_ID);
  assert.equal(saved.themeId, 'barber_mens_grooming');
  assert.ok(saved.url.includes(YT_ID));
  // No invented likes.
  assert.equal(saved.likesCount, undefined);

  cleanup();
  restoreFetch();
});

await test('shorts paste retains short kind after metadata canonicalisation', async () => {
  mockFetch(async () => jsonResponse(oembedPayload()));
  let latest = salonBase('nail_lash_studio');
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => { latest = d; },
      onNext: () => {},
      onPrev: () => {},
    }),
  );
  await act(async () => {
    fireEvent.click(utils.getByTestId('add-social-video-open'));
  });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), {
      target: { value: `https://www.youtube.com/shorts/${YT_ID}` },
    });
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  await waitFor(() => assert.ok(utils.queryByTestId('video-meta-preview')), { timeout: 3000 });

  const kindEl = utils.getByTestId('video-detected-kind');
  assert.ok(/short/i.test(kindEl.textContent || ''));

  await act(async () => {
    fireEvent.click(utils.getByTestId('video-add-submit'));
  });
  assert.equal(latest.socialVideos[0].videoKind, 'short');
  assert.ok(latest.socialVideos[0].url.includes('/shorts/'));
  assert.equal(latest.socialVideos[0].themeId, 'nail_lash_studio');
  cleanup();
  restoreFetch();
});

await test('manual title edit is not overwritten by a later metadata refresh', async () => {
  let call = 0;
  mockFetch(async () => {
    call += 1;
    if (call === 1) {
      return jsonResponse(oembedPayload({ title: 'FIRST_TITLE', description: 'D1', channelName: 'C1' }));
    }
    return jsonResponse(oembedPayload({
      externalVideoId: YT_ID_B,
      url: youtubeCanonicalUrl(YT_ID_B),
      title: 'SECOND_TITLE',
      description: 'D2',
      channelName: 'C2',
      thumbnailUrl: `https://i.ytimg.com/vi/${YT_ID_B}/hqdefault.jpg`,
    }));
  });

  let latest = salonBase();
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => { latest = d; },
      onNext: () => {},
      onPrev: () => {},
    }),
  );
  await act(async () => { fireEvent.click(utils.getByTestId('add-social-video-open')); });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), {
      target: { value: `https://www.youtube.com/watch?v=${YT_ID}` },
    });
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  await waitFor(() => assert.equal(utils.getByTestId('video-title-input').value, 'FIRST_TITLE'), { timeout: 3000 });

  // Owner edits the title.
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-title-input'), {
      target: { value: 'OWNER_CUSTOM_TITLE' },
    });
  });

  // Paste a different URL → new metadata must not clobber the manual title.
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), {
      target: { value: `https://www.youtube.com/watch?v=${YT_ID_B}` },
    });
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  await waitFor(() => assert.ok(utils.queryByTestId('video-meta-preview')), { timeout: 3000 });

  assert.equal(utils.getByTestId('video-title-input').value, 'OWNER_CUSTOM_TITLE');
  // Non-manual fields can still refresh.
  assert.equal(utils.getByTestId('video-channel-field').value, 'C2');

  cleanup();
  restoreFetch();
});

await test('invalid URL shows clear error; nothing is saved', async () => {
  mockFetch(async () => jsonResponse({}));
  let latest = salonBase();
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => { latest = d; },
      onNext: () => {},
      onPrev: () => {},
    }),
  );
  await act(async () => { fireEvent.click(utils.getByTestId('add-social-video-open')); });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), {
      target: { value: 'https://example.com/not-video' },
    });
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
  const err = utils.getByTestId('video-meta-error');
  assert.ok((err.textContent || '').length > 10);
  await act(async () => { fireEvent.click(utils.getByTestId('video-add-submit')); });
  assert.equal((latest.socialVideos || []).length, 0);
  cleanup();
  restoreFetch();
});

await test('partial metadata (derived thumb only) shows notice and requires title', async () => {
  mockFetch(async () =>
    jsonResponse({
      platform: 'youtube',
      externalVideoId: YT_ID,
      url: youtubeCanonicalUrl(YT_ID),
      title: '',
      description: '',
      channelName: '',
      thumbnailUrl: `https://img.youtube.com/vi/${YT_ID}/hqdefault.jpg`,
      embedUrl: `https://www.youtube.com/embed/${YT_ID}`,
      source: 'derived',
    }),
  );
  let latest = salonBase();
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => { latest = d; },
      onNext: () => {},
      onPrev: () => {},
    }),
  );
  await act(async () => { fireEvent.click(utils.getByTestId('add-social-video-open')); });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), {
      target: { value: `https://www.youtube.com/watch?v=${YT_ID}` },
    });
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
  await waitFor(() => assert.ok(utils.queryByTestId('video-meta-notice')), { timeout: 3000 });

  // Submit without title → refused.
  await act(async () => { fireEvent.click(utils.getByTestId('video-add-submit')); });
  assert.equal((latest.socialVideos || []).length, 0);

  // Owner adds title → saves with derived thumb.
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-title-input'), {
      target: { value: 'Manual title for partial' },
    });
  });
  await act(async () => { fireEvent.click(utils.getByTestId('video-add-submit')); });
  assert.equal(latest.socialVideos.length, 1);
  assert.equal(latest.socialVideos[0].title, 'Manual title for partial');
  assert.ok(latest.socialVideos[0].thumbnailUrl.includes(YT_ID));
  cleanup();
  restoreFetch();
});

/* ------------------------------------------------------------------ */
/* 4. Broken thumbnail fallback                                        */
/* ------------------------------------------------------------------ */

section('Broken-thumbnail fallback');

await test('owner list shows fallback when thumbnail fails to load', async () => {
  const data = salonBase();
  data.socialVideos = [{
    id: 'broken-1',
    title: 'Broken thumb video',
    platform: 'youtube',
    url: youtubeCanonicalUrl(YT_ID),
    thumbnailUrl: 'https://img.youtube.com/vi/zzzzzzzzzzz/hqdefault.jpg',
    externalVideoId: YT_ID,
    themeId: 'barber_mens_grooming',
    videoKind: 'long',
    channelName: 'Shop',
    description: 'Has description',
  }];
  const utils = render(
    React.createElement(StepSocials, {
      data,
      setData: () => {},
      onNext: () => {},
      onPrev: () => {},
    }),
  );
  const thumb = utils.getByTestId('owner-video-thumb');
  await act(async () => {
    fireEvent.error(thumb);
  });
  assert.ok(utils.getByTestId('owner-video-thumb-fallback'));
  assert.ok(utils.container.textContent.includes('Broken thumb video'));
  assert.ok(utils.container.textContent.includes('Has description'));
  cleanup();
});

await test('public gallery shows description + channel; broken owner thumb falls back', async () => {
  reset();
  // Valid YouTube id → derived thumb is present; description/channel still render.
  const data = {
    ...salonBase(),
    socialVideos: [{
      id: 'pub-meta',
      title: 'Public with meta',
      platform: 'youtube',
      url: youtubeCanonicalUrl(YT_ID),
      thumbnailUrl: `https://img.youtube.com/vi/${YT_ID}/hqdefault.jpg`,
      externalVideoId: YT_ID,
      themeId: 'barber_mens_grooming',
      videoKind: 'long',
      description: 'Public desc',
      channelName: 'Public Channel',
    }],
  };
  const utils = render(React.createElement(Barber, { data, mode: 'desktop' }));
  const card = utils.container.querySelector('[data-social-id="pub-meta"]');
  assert.ok(card, 'owner card missing');
  assert.ok(card.textContent.includes('Public with meta'));
  assert.ok(card.textContent.includes('Public Channel'));
  assert.ok(card.querySelector('[data-testid="site-video-card-description"]')?.textContent.includes('Public desc'));
  cleanup();

  // Owner list: broken image → fallback, never a broken <img>.
  const ownerData = {
    ...salonBase(),
    socialVideos: [{
      id: 'bad-thumb-card',
      title: 'Bad thumb',
      platform: 'youtube',
      url: youtubeCanonicalUrl(YT_ID),
      thumbnailUrl: 'https://invalid.example/missing.jpg',
      themeId: 'barber_mens_grooming',
      videoKind: 'long',
      description: 'Owner desc stays visible',
    }],
  };
  const form2 = render(
    React.createElement(StepSocials, {
      data: ownerData,
      setData: () => {},
      onNext: () => {},
      onPrev: () => {},
    }),
  );
  const t = form2.getByTestId('owner-video-thumb');
  await act(async () => { fireEvent.error(t); });
  assert.ok(form2.getByTestId('owner-video-thumb-fallback'));
  assert.ok(form2.container.textContent.includes('Owner desc stays visible'));
  cleanup();
});

/* ------------------------------------------------------------------ */
/* 5. Security / schema / no second system                             */
/* ------------------------------------------------------------------ */

section('Security & single fetch system');

await test('no second fetch system — only /api/video-metadata is used', () => {
  const step = fs.readFileSync(path.join(root, 'src/screens/StepSocials.tsx'), 'utf8');
  const meta = fs.readFileSync(path.join(root, 'src/lib/videoUrlMetadata.ts'), 'utf8');
  assert.ok(step.includes('fetchVideoMetadata'));
  assert.ok(step.includes('mergePlatformMetadataIntoForm'));
  assert.equal(/youtube\.googleapis\.com|YOUTUBE_API_KEY|service_role/.test(step), false);
  assert.equal(/youtube\.googleapis\.com|YOUTUBE_API_KEY|service_role/.test(meta), false);
  // Only one fetch path in videoUrlMetadata.
  const fetchRoutes = meta.match(/\/api\/video-metadata/g) || [];
  assert.ok(fetchRoutes.length >= 1);
  assert.equal((meta.match(/fetch\(/g) || []).length, 1, 'exactly one fetch() in videoUrlMetadata');
});

await test('no new migration for 15.4', () => {
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
  assert.equal(migrations.filter((f) => /15\.4|auto.?thumb|video_meta/i.test(f)).length, 0);
});

await test('fetchVideoMetadata is still the Phase 15.2 entry point (integration smoke)', async () => {
  mockFetch(async () => jsonResponse(oembedPayload()));
  const result = await fetchVideoMetadata(`https://youtu.be/${YT_ID}`);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.metadata.title, 'AUTO_TITLE_SKIN_FADE');
    assert.equal(result.metadata.description, 'AUTO_DESC_BARBER_WORK');
    assert.equal(result.metadata.channelName, 'AUTO_CHANNEL_ROYAL');
    assert.ok(result.metadata.thumbnailUrl.includes(YT_ID));
  }
  restoreFetch();
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) {
    console.error(`  ✗ ${f.name}: ${f.error && f.error.message ? f.error.message : f.error}`);
  }
  process.exit(1);
}
process.exit(0);
