/**
 * PHASE 15.2 — YouTube / Platform URL Auto-Fetch
 *
 * Verifies:
 *   1. Valid YouTube URLs extract the 11-char Video ID (watch, youtu.be,
 *      shorts, embed, music, m.youtube).
 *   2. Metadata auto-fill: thumbnail, title, description, channel, original URL.
 *   3. Invalid / non-YouTube URLs surface a clear error (no silent fail).
 *   4. No API keys or service-role secrets in frontend modules.
 *   5. Server route shape is safe (public oEmbed only; no key required).
 *   6. Extensible platform detection (instagram/facebook/tiktok reserved).
 *   7. SocialVideo draft maps onto existing fields (externalVideoId ↔
 *      social_videos.external_video_id) — no invented tables.
 *   8. Phase 15.1 gallery still resolves auto-filled videos.
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
  parseVideoUrl,
  detectVideoPlatform,
  isYoutubeHost,
  derivedYoutubeMetadata,
  fetchVideoMetadata,
  socialVideoDraftFromMetadata,
  youtubeCanonicalUrl,
  videoMetadataErrorMessage,
} = await import('../src/lib/videoUrlMetadata.ts');

const { parseYoutubeVideoId: parseYtShared } = await import('../src/lib/siteSocialFeed.ts');
const { videoItemsForTheme } = await import('../src/lib/siteVideoGallery.ts');
const StepSocials = (await import('../src/screens/StepSocials.tsx')).default;
const { initialData } = await import('../src/types.ts');

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

/* ------------------------------------------------------------------ */
/* Mock fetch for /api/video-metadata                                  */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* 1. Video ID extraction                                              */
/* ------------------------------------------------------------------ */

section('YouTube Video ID extraction');

await test('extracts id from watch, youtu.be, shorts, embed, live, music, m.', () => {
  const cases = [
    [`https://www.youtube.com/watch?v=${YT_ID}`, YT_ID],
    [`https://youtube.com/watch?v=${YT_ID}&t=30s`, YT_ID],
    [`https://youtu.be/${YT_ID}`, YT_ID],
    [`https://youtu.be/${YT_ID}?t=10`, YT_ID],
    [`https://www.youtube.com/shorts/${YT_ID}`, YT_ID],
    [`https://youtube.com/embed/${YT_ID}`, YT_ID],
    [`https://www.youtube.com/live/${YT_ID}`, YT_ID],
    [`https://m.youtube.com/watch?v=${YT_ID}`, YT_ID],
    [`https://music.youtube.com/watch?v=${YT_ID}`, YT_ID],
    [`//www.youtube.com/watch?v=${YT_ID}`, YT_ID],
  ];
  for (const [url, expected] of cases) {
    const parsed = parseVideoUrl(url);
    assert.equal(parsed.ok, true, `should parse ${url}`);
    if (parsed.ok) {
      assert.equal(parsed.externalVideoId, expected, url);
      assert.equal(parsed.platform, 'youtube');
      assert.equal(parsed.canonicalUrl, youtubeCanonicalUrl(expected));
    }
    // Shared parser stays in lock-step.
    const normalised = url.startsWith('//') ? `https:${url}` : url;
    assert.equal(parseYtShared(normalised), expected, `shared parser: ${url}`);
  }
});

await test('rejects invalid / non-video YouTube URLs with clear codes', () => {
  const bad = [
    ['', 'empty'],
    ['not a url', 'invalid_url'],
    ['https://example.com/watch?v=abc', 'unsupported_platform'],
    ['https://www.youtube.com/watch?v=short', 'invalid_youtube'],
    ['https://www.youtube.com/@SomeChannel', 'not_a_video'],
    ['https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx', 'not_a_video'],
    ['https://www.youtube.com/', 'not_a_video'],
    ['javascript:alert(1)', 'invalid_url'],
  ];
  for (const [url, code] of bad) {
    const parsed = parseVideoUrl(url);
    assert.equal(parsed.ok, false, `expected fail for ${url}`);
    if (!parsed.ok) {
      assert.equal(parsed.code, code, `${url} → ${parsed.code} (want ${code}): ${parsed.message}`);
      assert.ok(parsed.message && parsed.message.length > 10, 'message must be human-readable');
    }
  }
});

await test('detectVideoPlatform + isYoutubeHost are extensible markers', () => {
  assert.equal(detectVideoPlatform(`https://youtu.be/${YT_ID}`), 'youtube');
  assert.equal(detectVideoPlatform('https://www.instagram.com/reel/AbCdef12345/'), 'instagram');
  assert.equal(detectVideoPlatform('https://www.tiktok.com/@x/video/1'), 'tiktok');
  assert.equal(detectVideoPlatform('https://www.facebook.com/watch/?v=1'), 'facebook');
  assert.equal(detectVideoPlatform('https://vimeo.com/123'), null);
  assert.equal(isYoutubeHost('youtube.com'), true);
  assert.equal(isYoutubeHost('youtu.be'), true);
  assert.equal(isYoutubeHost('instagram.com'), false);
});

await test('non-YouTube known platforms return unsupported_platform (extensible later)', () => {
  const ig = parseVideoUrl('https://www.instagram.com/reel/AbCdef12345/');
  assert.equal(ig.ok, false);
  if (!ig.ok) {
    assert.equal(ig.code, 'unsupported_platform');
    assert.ok(ig.message.toLowerCase().includes('youtube') || ig.message.toLowerCase().includes('supported'));
  }
  const tt = parseVideoUrl('https://www.tiktok.com/@x/video/123');
  assert.equal(tt.ok, false);
  if (!tt.ok) assert.equal(tt.code, 'unsupported_platform');
});

/* ------------------------------------------------------------------ */
/* 2. Derived + fetched metadata                                       */
/* ------------------------------------------------------------------ */

section('Metadata auto-fill (thumbnail, title, description, channel, URL)');

await test('derivedYoutubeMetadata supplies public thumbnail + embed without network', () => {
  const meta = derivedYoutubeMetadata(YT_ID);
  assert.equal(meta.platform, 'youtube');
  assert.equal(meta.externalVideoId, YT_ID);
  assert.equal(meta.url, youtubeCanonicalUrl(YT_ID));
  assert.ok(meta.thumbnailUrl.includes(`img.youtube.com/vi/${YT_ID}`));
  assert.ok(meta.embedUrl.includes(`/embed/${YT_ID}`));
  assert.equal(meta.source, 'derived');
  assert.equal(meta.title, '');
  assert.equal(meta.channelName, '');
});

await test('fetchVideoMetadata auto-fills all fields from server oEmbed payload', async () => {
  mockFetch(async (url, init) => {
    assert.ok(url.includes('/api/video-metadata'), `route: ${url}`);
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(init.body);
    assert.ok(body.url.includes(YT_ID));
    // No API key headers from the client.
    const headers = init.headers || {};
    const headerBlob = JSON.stringify(headers).toLowerCase();
    assert.equal(headerBlob.includes('service_role'), false);
    assert.equal(headerBlob.includes('gemini'), false);
    assert.equal(headerBlob.includes('youtube-api-key'), false);
    return jsonResponse({
      platform: 'youtube',
      externalVideoId: YT_ID,
      url: youtubeCanonicalUrl(YT_ID),
      title: 'Never Gonna Give You Up',
      description: 'Official Rick Astley video',
      channelName: 'Rick Astley',
      thumbnailUrl: `https://i.ytimg.com/vi/${YT_ID}/hqdefault.jpg`,
      embedUrl: `https://www.youtube.com/embed/${YT_ID}`,
      source: 'oembed',
    });
  });

  const result = await fetchVideoMetadata(`https://youtu.be/${YT_ID}`);
  assert.equal(result.ok, true);
  if (result.ok) {
    const m = result.metadata;
    assert.equal(m.externalVideoId, YT_ID);
    assert.equal(m.title, 'Never Gonna Give You Up');
    assert.equal(m.description, 'Official Rick Astley video');
    assert.equal(m.channelName, 'Rick Astley');
    assert.ok(m.thumbnailUrl.includes(YT_ID) || m.thumbnailUrl.includes('ytimg'));
    assert.equal(m.url, youtubeCanonicalUrl(YT_ID));
    assert.equal(m.platform, 'youtube');
    assert.equal(m.source, 'oembed');
  }
  restoreFetch();
});

await test('fetchVideoMetadata surfaces server validation errors clearly', async () => {
  mockFetch(async () =>
    jsonResponse(
      { code: 'invalid_youtube', error: 'That is not a valid YouTube video link.' },
      400,
    ),
  );
  // Client-side parse catches this before fetch for truly bad ids — use a
  // URL the client accepts but the server rejects (shouldn't happen, but
  // exercise the branch with a forced server error on a valid id path by
  // mocking after parse).
  const result = await fetchVideoMetadata(`https://www.youtube.com/watch?v=${YT_ID}`);
  // With our mock always 400, result is error.
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'invalid_youtube');
    assert.ok(result.message.length > 5);
  }
  restoreFetch();
});

await test('fetchVideoMetadata rejects unsupported platforms without calling inventing data', async () => {
  let called = false;
  mockFetch(async () => {
    called = true;
    return jsonResponse({});
  });
  const result = await fetchVideoMetadata('https://www.instagram.com/reel/AbCdef12345/');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unsupported_platform');
  assert.equal(called, false, 'should fail client-side before network');
  restoreFetch();
});

await test('network failure after valid YouTube parse still returns derived thumbnail', async () => {
  mockFetch(async () => {
    throw new Error('network down');
  });
  const result = await fetchVideoMetadata(`https://www.youtube.com/watch?v=${YT_ID}`);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.metadata.externalVideoId, YT_ID);
    assert.ok(result.metadata.thumbnailUrl.includes(YT_ID));
    assert.equal(result.metadata.source, 'derived');
  }
  restoreFetch();
});

await test('socialVideoDraftFromMetadata maps onto existing SocialVideo + externalVideoId', () => {
  const meta = {
    platform: 'youtube',
    externalVideoId: YT_ID,
    url: youtubeCanonicalUrl(YT_ID),
    title: 'Fade masterclass',
    description: 'How we cut a skin fade',
    channelName: 'Royal Barber',
    thumbnailUrl: `https://img.youtube.com/vi/${YT_ID}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${YT_ID}`,
    source: 'oembed',
  };
  const draft = socialVideoDraftFromMetadata(meta, { themeId: 'barber_mens_grooming' });
  assert.equal(draft.platform, 'youtube');
  assert.equal(draft.externalVideoId, YT_ID);
  assert.equal(draft.title, 'Fade masterclass');
  assert.equal(draft.description, 'How we cut a skin fade');
  assert.equal(draft.channelName, 'Royal Barber');
  assert.equal(draft.url, youtubeCanonicalUrl(YT_ID));
  assert.ok(draft.thumbnailUrl);
  assert.equal(draft.themeId, 'barber_mens_grooming');
  // No likes invented.
  assert.equal('likesCount' in draft, false);
});

/* ------------------------------------------------------------------ */
/* 3. Security — no secrets in frontend                                */
/* ------------------------------------------------------------------ */

section('Security — no API keys / service-role in frontend');

await test('frontend video modules contain no API keys or service_role', () => {
  const files = [
    'src/lib/videoUrlMetadata.ts',
    'src/lib/siteVideoGallery.ts',
    'src/lib/siteSocialFeed.ts',
    'src/screens/StepSocials.tsx',
    'src/components/SiteVideoGallery.tsx',
  ];
  const banned = [
    /service_role/i,
    /YOUTUBE_API_KEY/i,
    /AIza[0-9A-Za-z_-]{20,}/, // Google API key shape
    /GEMINI_API_KEY/,
    /sk_live_/,
    /youtube\.googleapis\.com\/youtube\/v3/,
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const re of banned) {
      assert.equal(re.test(src), false, `${rel} matched ${re}`);
    }
  }
});

await test('server route uses public oEmbed only (no Data API key required)', () => {
  const src = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  assert.ok(src.includes('/api/video-metadata'), 'route missing');
  assert.ok(src.includes('youtube.com/oembed'), 'must use public oEmbed');
  assert.equal(src.includes('youtube/v3'), false, 'must not call YouTube Data API v3');
  assert.equal(/YOUTUBE_API_KEY|GOOGLE_API_KEY/.test(src), false);
  // service_role must never appear in the video-metadata handler path.
  assert.equal(src.includes('service_role'), false);
});

await test('error messages are human-readable for every code', () => {
  for (const code of [
    'empty',
    'invalid_url',
    'unsupported_platform',
    'invalid_youtube',
    'not_a_video',
    'fetch_failed',
    'not_found',
    'rate_limited',
    'network',
  ]) {
    const msg = videoMetadataErrorMessage(code);
    assert.ok(msg && msg.length > 8, code);
  }
});

/* ------------------------------------------------------------------ */
/* 4. StepSocials UI — paste → auto-fill                               */
/* ------------------------------------------------------------------ */

section('Owner UI — paste YouTube URL auto-fills the form');

function salonBase() {
  return {
    ...structuredClone(initialData),
    socialVideos: [],
  };
}

await test('pasting a YouTube URL auto-fills title, thumbnail, channel, description, platform', async () => {
  mockFetch(async (url) => {
    if (!String(url).includes('/api/video-metadata')) {
      return jsonResponse({});
    }
    return jsonResponse({
      platform: 'youtube',
      externalVideoId: YT_ID,
      url: youtubeCanonicalUrl(YT_ID),
      title: 'AUTO_TITLE_SKIN_FADE',
      description: 'AUTO_DESC_BARBER_WORK',
      channelName: 'AUTO_CHANNEL_ROYAL',
      thumbnailUrl: `https://i.ytimg.com/vi/${YT_ID}/hqdefault.jpg`,
      embedUrl: `https://www.youtube.com/embed/${YT_ID}`,
      source: 'oembed',
    });
  });

  let latest = salonBase();
  const setData = (d) => {
    latest = d;
  };

  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData,
      onNext: () => {},
      onPrev: () => {},
    }),
  );

  await act(async () => {
    fireEvent.click(utils.getByTestId('add-social-video-open'));
  });
  assert.ok(utils.getByTestId('add-social-video-modal'));

  const input = utils.getByTestId('video-url-input');
  await act(async () => {
    fireEvent.change(input, { target: { value: `https://youtu.be/${YT_ID}` } });
  });

  // Debounce + fetch
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700));
  });

  await waitFor(() => {
    assert.ok(utils.queryByTestId('video-meta-success') || utils.queryByTestId('video-meta-preview'));
  }, { timeout: 3000 });

  // Title auto-filled
  const titleInput = utils.getByTestId('video-title-input');
  assert.equal(titleInput.value, 'AUTO_TITLE_SKIN_FADE');

  // Preview card shows channel + id
  assert.ok(utils.getByTestId('video-meta-preview'));
  assert.ok(utils.getByTestId('video-meta-channel').textContent.includes('AUTO_CHANNEL_ROYAL'));
  assert.ok(utils.getByTestId('video-meta-id').textContent.includes(YT_ID));
  assert.ok(utils.getByTestId('video-description-field').textContent.includes('AUTO_DESC_BARBER_WORK'));

  // Thumbnail from YouTube
  const thumb = utils.getByTestId('video-thumb-selected');
  assert.ok(thumb.getAttribute('src')?.includes(YT_ID));

  // Submit saves the auto-filled SocialVideo (no manual title entry needed)
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-add-submit'));
  });

  assert.equal(latest.socialVideos?.length, 1);
  const saved = latest.socialVideos[0];
  assert.equal(saved.title, 'AUTO_TITLE_SKIN_FADE');
  assert.equal(saved.platform, 'youtube');
  assert.equal(saved.externalVideoId, YT_ID);
  assert.equal(saved.channelName, 'AUTO_CHANNEL_ROYAL');
  assert.equal(saved.description, 'AUTO_DESC_BARBER_WORK');
  assert.ok(saved.thumbnailUrl.includes(YT_ID) || saved.thumbnailUrl.includes('ytimg'));
  assert.ok(saved.url.includes(YT_ID));
  // No invented likes from auto-fetch path
  assert.equal(saved.likesCount === undefined || saved.likesCount === null, true);

  cleanup();
  restoreFetch();
});

await test('invalid URL shows a clear error and does not add a video', async () => {
  mockFetch(async () => jsonResponse({}));
  let latest = salonBase();
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => {
        latest = d;
      },
      onNext: () => {},
      onPrev: () => {},
    }),
  );

  await act(async () => {
    fireEvent.click(utils.getByTestId('add-social-video-open'));
  });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), {
      target: { value: 'https://example.com/not-a-video' },
    });
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600));
  });

  const err = utils.getByTestId('video-meta-error');
  assert.ok(err.textContent && err.textContent.length > 10);
  assert.equal(utils.queryByTestId('video-meta-preview'), null);

  // Submit should refuse
  await act(async () => {
    fireEvent.click(utils.getByTestId('video-add-submit'));
  });
  assert.equal((latest.socialVideos || []).length, 0);

  cleanup();
  restoreFetch();
});

await test('channel URL (not a video) shows not-a-video error', async () => {
  let latest = salonBase();
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => {
        latest = d;
      },
      onNext: () => {},
      onPrev: () => {},
    }),
  );
  await act(async () => {
    fireEvent.click(utils.getByTestId('add-social-video-open'));
  });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), {
      target: { value: 'https://www.youtube.com/@RoyalBarberChannel' },
    });
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600));
  });
  const err = utils.getByTestId('video-meta-error');
  assert.ok(
    /channel|profile|not a single video|not a valid/i.test(err.textContent || ''),
    `unexpected message: ${err.textContent}`,
  );
  cleanup();
});

/* ------------------------------------------------------------------ */
/* 5. Phase 15.1 gallery still consumes auto-filled videos             */
/* ------------------------------------------------------------------ */

section('Phase 15.1 gallery compatibility');

await test('auto-filled SocialVideo appears in the theme video gallery', () => {
  const draft = socialVideoDraftFromMetadata({
    platform: 'youtube',
    externalVideoId: YT_ID,
    url: youtubeCanonicalUrl(YT_ID),
    title: 'Gallery Bound Fade',
    description: 'desc',
    channelName: 'Shop',
    thumbnailUrl: `https://img.youtube.com/vi/${YT_ID}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${YT_ID}`,
    source: 'oembed',
  }, { id: 'v-auto-1', themeId: 'barber_mens_grooming' });

  const items = videoItemsForTheme('barber_mens_grooming', {
    socialVideos: [draft],
  });
  // PHASE 15.3 — owner video + catalog fill → 10 total; the auto-filled
  // draft must still be present and correctly resolved.
  assert.ok(items.length >= 1);
  const found = items.find((i) => i.id === 'v-auto-1' || i.title === 'Gallery Bound Fade');
  assert.ok(found, 'auto-filled draft missing from gallery');
  assert.equal(found.platform, 'youtube');
  assert.ok(found.thumbnailUrl.includes(YT_ID));
  assert.ok(found.embedUrl?.includes(YT_ID));
  assert.equal(found.origin, 'owner');

  // Foreign theme does not receive the scoped owner video (catalog fill may
  // still supply spa's own 10 theme cards).
  const spa = videoItemsForTheme('beauty_skin_spa', { socialVideos: [draft] });
  assert.equal(spa.some((i) => i.title === 'Gallery Bound Fade'), false);
  assert.equal(spa.some((i) => i.id === 'v-auto-1'), false);
});

await test('no new database migration was invented for 15.2', () => {
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
  const phase15 = migrations.filter((f) => /15\.2|video_metadata|video_meta/i.test(f));
  assert.equal(phase15.length, 0, `unexpected migrations: ${phase15.join(',')}`);
  // social_videos still the only video table reference in M06.
  const m06 = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260811000601_m06_media_social_location_settings.sql'),
    'utf8',
  );
  assert.ok(m06.includes('social_videos'));
  assert.ok(m06.includes('external_video_id'));
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
