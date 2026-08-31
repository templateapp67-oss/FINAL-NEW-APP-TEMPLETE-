/**
 * REGRESSION — YouTube add-video metadata failure fallback.
 *
 * Covers the reported issue: "Thumbnail loaded. Title and channel were not
 * available — add a title to save, or try again." previously left the form
 * blocked. Verifies:
 *   1. Title / Channel inputs are editable (disabled=false, readOnly=false)
 *      when oEmbed metadata returns empty/fails; manual text is never
 *      overwritten by in-flight background fetches (stale-closure guard).
 *   2. Thumbnail always auto-fills from the regex-extracted VIDEO_ID
 *      (img.youtube.com/vi/{VIDEO_ID}/hqdefault.jpg) for shorts / youtu.be /
 *      watch / embed / live URLs — regardless of metadata success.
 *   3. "Add Video" is enabled iff valid videoId + non-empty title, regardless
 *      of fetch loading/error states.
 *   4. Title-required notices clear as soon as the Title input has text.
 *   5. Client-side oEmbed/CORS-proxy fallback (youtube.com/oembed →
 *      noembed.com) auto-fills Title & Channel when the server route degrades.
 */
import assert from 'node:assert/strict';
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

const { fetchVideoMetadata, youtubeCanonicalUrl } = await import('../src/lib/videoUrlMetadata.ts');
const { fetchYoutubeOembedFromBrowser } = await import('../src/lib/videoMetadataClientFallback.ts');
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

/** Server response when its outbound oEmbed call failed (the reported bug). */
function derivedServerPayload() {
  return {
    platform: 'youtube',
    externalVideoId: YT_ID,
    url: youtubeCanonicalUrl(YT_ID),
    title: '',
    description: '',
    channelName: '',
    thumbnailUrl: `https://img.youtube.com/vi/${YT_ID}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${YT_ID}`,
    source: 'derived',
  };
}

function salonBase() {
  return { ...structuredClone(initialData), templateId: 'barber_mens_grooming', socialVideos: [] };
}

async function openModalWithUrl(utils, url) {
  await act(async () => { fireEvent.click(utils.getByTestId('add-social-video-open')); });
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-url-input'), { target: { value: url } });
  });
  // debounce (450ms) + fetch settle
  await act(async () => { await new Promise((r) => setTimeout(r, 800)); });
}

/* ------------------------------------------------------------------ */
section('Client-side oEmbed / CORS-proxy fallback (pure)');

await test('noembed proxy fills title+channel when direct oEmbed is CORS-blocked', async () => {
  mockFetch(async (url) => {
    if (url.includes('youtube.com/oembed')) throw new Error('CORS blocked');
    if (url.includes('noembed.com')) {
      return jsonResponse({
        title: 'FALLBACK_TITLE',
        author_name: 'FALLBACK_CHANNEL',
        thumbnail_url: `https://i.ytimg.com/vi/${YT_ID}/hqdefault.jpg`,
      });
    }
    throw new Error(`unexpected ${url}`);
  });
  const result = await fetchYoutubeOembedFromBrowser(YT_ID);
  restoreFetch();
  assert.ok(result);
  assert.equal(result.title, 'FALLBACK_TITLE');
  assert.equal(result.channelName, 'FALLBACK_CHANNEL');
});

await test('fallback returns null (never invents data) when every source fails', async () => {
  mockFetch(async () => { throw new Error('offline'); });
  const result = await fetchYoutubeOembedFromBrowser(YT_ID);
  restoreFetch();
  assert.equal(result, null);
});

await test('fetchVideoMetadata enriches a derived server response via browser fallback', async () => {
  mockFetch(async (url) => {
    if (url.includes('/api/video-metadata')) return jsonResponse(derivedServerPayload());
    if (url.includes('youtube.com/oembed')) throw new Error('CORS blocked');
    if (url.includes('noembed.com')) {
      return jsonResponse({ title: 'RECOVERED_TITLE', author_name: 'RECOVERED_CHANNEL' });
    }
    throw new Error(`unexpected ${url}`);
  });
  const result = await fetchVideoMetadata(`https://youtube.com/shorts/${YT_ID}`);
  restoreFetch();
  assert.equal(result.ok, true);
  assert.equal(result.metadata.title, 'RECOVERED_TITLE');
  assert.equal(result.metadata.channelName, 'RECOVERED_CHANNEL');
  assert.equal(result.metadata.source, 'oembed');
  assert.ok(result.metadata.thumbnailUrl.includes(YT_ID));
});

await test('fetchVideoMetadata enriches even when the server request itself throws', async () => {
  mockFetch(async (url) => {
    if (url.includes('/api/video-metadata')) throw new Error('server down');
    if (url.includes('noembed.com')) {
      return jsonResponse({ title: 'RECOVERED_AFTER_OUTAGE', author_name: 'CH' });
    }
    throw new Error('CORS blocked');
  });
  const result = await fetchVideoMetadata(`https://youtu.be/${YT_ID}`);
  restoreFetch();
  assert.equal(result.ok, true);
  assert.equal(result.metadata.title, 'RECOVERED_AFTER_OUTAGE');
});

/* ------------------------------------------------------------------ */
section('UI — total metadata failure still allows manual add');

await test('shorts URL: thumbnail auto-fills, inputs editable, typing clears notice, Add enables, video saves', async () => {
  // EVERYTHING fails: server route AND both browser fallbacks.
  mockFetch(async () => { throw new Error('offline'); });
  let latest = salonBase();
  const utils = render(
    React.createElement(StepSocials, {
      data: latest,
      setData: (d) => { latest = d; },
      onNext: () => {},
      onPrev: () => {},
    }),
  );
  await openModalWithUrl(utils, `https://youtube.com/shorts/${YT_ID}`);

  // 2. Thumbnail derived from VIDEO_ID regardless of metadata failure.
  const thumb = utils.getByTestId('video-thumb-selected');
  assert.equal(thumb.getAttribute('src'), `https://img.youtube.com/vi/${YT_ID}/hqdefault.jpg`);

  // Title-required notice is shown.
  await waitFor(() => assert.ok(utils.queryByTestId('video-meta-notice')), { timeout: 3000 });

  // 1. Inputs are editable — never disabled/readOnly.
  const titleInput = utils.getByTestId('video-title-input');
  const channelInput = utils.getByTestId('video-channel-field');
  assert.equal(titleInput.disabled, false);
  assert.equal(titleInput.readOnly, false);
  assert.equal(channelInput.disabled, false);
  assert.equal(channelInput.readOnly, false);
  assert.equal(titleInput.getAttribute('name'), 'title');
  assert.equal(channelInput.getAttribute('name'), 'channel');

  // 3. Submit disabled while title empty…
  const submit = utils.getByTestId('video-add-submit');
  assert.equal(submit.disabled, true);

  // …type a manual title:
  await act(async () => {
    fireEvent.change(titleInput, { target: { value: 'My manual Short title' } });
  });
  await act(async () => {
    fireEvent.change(channelInput, { target: { value: 'My Channel' } });
  });

  // 4. Notice cleared as soon as title has text.
  assert.equal(utils.queryByTestId('video-meta-notice'), null);

  // 3. Submit now enabled (valid videoId + non-empty title).
  assert.equal(submit.disabled, false);

  // Save works — video persisted with manual title + derived thumbnail.
  await act(async () => { fireEvent.click(submit); });
  assert.equal(latest.socialVideos.length, 1);
  const saved = latest.socialVideos[0];
  assert.equal(saved.title, 'My manual Short title');
  assert.equal(saved.channelName, 'My Channel');
  assert.equal(saved.externalVideoId, YT_ID);
  assert.ok(saved.thumbnailUrl.includes(`${YT_ID}/hqdefault.jpg`));
  assert.equal(saved.videoKind, 'short');
  restoreFetch();
  cleanup();
});

await test('watch / youtu.be / embed / live URLs all derive the thumbnail on failure', async () => {
  mockFetch(async () => { throw new Error('offline'); });
  const urls = [
    `https://www.youtube.com/watch?v=${YT_ID}`,
    `https://youtu.be/${YT_ID}`,
    `https://www.youtube.com/embed/${YT_ID}`,
    `https://www.youtube.com/live/${YT_ID}`,
  ];
  for (const url of urls) {
    let latest = salonBase();
    const utils = render(
      React.createElement(StepSocials, {
        data: latest,
        setData: (d) => { latest = d; },
        onNext: () => {},
        onPrev: () => {},
      }),
    );
    await openModalWithUrl(utils, url);
    const thumb = utils.getByTestId('video-thumb-selected');
    assert.equal(
      thumb.getAttribute('src'),
      `https://img.youtube.com/vi/${YT_ID}/hqdefault.jpg`,
      `thumbnail missing for ${url}`,
    );
    cleanup();
  }
  restoreFetch();
});

/* ------------------------------------------------------------------ */
section('UI — stale-closure guard');

await test('title typed while metadata fetch is in flight is never overwritten', async () => {
  // Server responds slowly with an EMPTY-title payload; fallbacks fail.
  mockFetch(async (url) => {
    if (url.includes('/api/video-metadata')) {
      await new Promise((r) => setTimeout(r, 500));
      return jsonResponse(derivedServerPayload());
    }
    throw new Error('offline');
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
      target: { value: `https://youtube.com/shorts/${YT_ID}` },
    });
  });
  // Type the title IMMEDIATELY — debounce (450ms) + slow fetch still pending.
  await act(async () => {
    fireEvent.change(utils.getByTestId('video-title-input'), {
      target: { value: 'Typed during fetch' },
    });
  });
  // Let debounce + slow fetch + merge finish.
  await act(async () => { await new Promise((r) => setTimeout(r, 1400)); });
  assert.equal(
    utils.getByTestId('video-title-input').value,
    'Typed during fetch',
    'manual title must survive the background merge',
  );
  // And the button is enabled (valid id + non-empty title).
  assert.equal(utils.getByTestId('video-add-submit').disabled, false);
  restoreFetch();
  cleanup();
});

/* ------------------------------------------------------------------ */
section('UI — browser fallback auto-fills the form');

await test('derived server payload + working noembed → title/channel auto-fill, Add enabled with no typing', async () => {
  mockFetch(async (url) => {
    if (url.includes('/api/video-metadata')) return jsonResponse(derivedServerPayload());
    if (url.includes('noembed.com')) {
      return jsonResponse({ title: 'AUTO_RECOVERED_TITLE', author_name: 'AUTO_RECOVERED_CHANNEL' });
    }
    throw new Error('CORS blocked');
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
  await openModalWithUrl(utils, `https://youtube.com/shorts/${YT_ID}`);
  await waitFor(
    () => assert.equal(utils.getByTestId('video-title-input').value, 'AUTO_RECOVERED_TITLE'),
    { timeout: 3000 },
  );
  assert.equal(utils.getByTestId('video-channel-field').value, 'AUTO_RECOVERED_CHANNEL');
  // No title-required notice, submit enabled without any manual typing.
  assert.equal(utils.queryByTestId('video-meta-notice'), null);
  assert.equal(utils.getByTestId('video-add-submit').disabled, false);
  restoreFetch();
  cleanup();
});

/* ------------------------------------------------------------------ */
console.log(`\n${passed}/${passed + failed} tests passed`);
if (failed > 0) {
  process.exitCode = 1;
}
