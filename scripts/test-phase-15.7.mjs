/** PHASE 15.7 — original-platform player / redirect acceptance. */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
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
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } unobserve() {} disconnect() {} };
dom.window.IntersectionObserver = globalThis.IntersectionObserver;

const React = (await import('react')).default;
const { render, fireEvent, cleanup } = await import('@testing-library/react');
const SiteVideoGallery = (await import('../src/components/SiteVideoGallery.tsx')).default;
const { initialData } = await import('../src/types.ts');
const {
  validateOriginalVideoUrl,
  originalDestinationForVideo,
  openOriginalVideoDestination,
} = await import('../src/lib/originalVideoDestination.ts');
const { ownerVideoForTheme, videoItemsForTheme } = await import('../src/lib/siteVideoGallery.ts');
const { socialVideoFromPasteAndMetadata } = await import('../src/lib/videoUrlMetadata.ts');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (error) { console.error(`  ✗ ${name}\n    ${error.message}`); process.exitCode = 1; }
}

console.log('\n▸ Exact destination validation');
await test('YouTube watch URL is returned byte-for-byte after trim', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s';
  assert.deepEqual(validateOriginalVideoUrl(` ${url} `, 'youtube', 'dQw4w9WgXcQ'), { ok: true, url, platform: 'youtube', externalVideoId: 'dQw4w9WgXcQ' });
});
await test('YouTube Shorts and youtu.be are accepted without canonical rewrite', () => {
  for (const url of ['https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share', 'https://youtu.be/dQw4w9WgXcQ?t=8']) {
    const result = validateOriginalVideoUrl(url, 'youtube');
    assert.equal(result.ok, true); assert.equal(result.url, url);
  }
});
await test('channel/home URLs are rejected as not a video', () => {
  assert.equal(validateOriginalVideoUrl('https://www.youtube.com/@channel', 'youtube').ok, false);
});
await test('host spoofing, credentials, script and platform mismatch are rejected', () => {
  for (const [url, platform] of [
    ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['javascript:alert(1)', 'youtube'],
    ['https://www.instagram.com/reel/AbCdEf12345/', 'youtube'],
  ]) assert.equal(validateOriginalVideoUrl(url, platform).ok, false, url);
});
await test('external-id mismatch is rejected', () => {
  assert.equal(validateOriginalVideoUrl('https://youtu.be/dQw4w9WgXcQ', 'youtube', 'aaaaaaaaaaa').ok, false);
});

console.log('\n▸ Record preservation + isolation');
await test('new record stores untouched original separately from canonical compatibility URL', () => {
  const original = 'https://youtu.be/dQw4w9WgXcQ?t=12';
  const video = socialVideoFromPasteAndMetadata({ metadata: null, form: { title: 'Original', description: '', channelName: 'Source', thumbnailUrl: '', url: original, platform: 'youtube', externalVideoId: 'dQw4w9WgXcQ' }, videoKind: 'long', themeId: 'barber_mens_grooming' });
  assert.equal(video.originalPlatformUrl, original);
  assert.equal(originalDestinationForVideo(video).url, original);
});
await test('gallery item exposes exact original platform URL and correct source/type', () => {
  const original = 'https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share';
  const item = ownerVideoForTheme({ id: 'exact', title: 'Exact', platform: 'youtube', url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', originalPlatformUrl: original, thumbnailUrl: '', externalVideoId: 'dQw4w9WgXcQ', channelName: 'Original source', videoKind: 'short', themeId: 'barber_mens_grooming' }, 'barber_mens_grooming');
  assert.equal(item.originalPlatformUrl, original); assert.equal(item.kind, 'short'); assert.equal(item.channelName, 'Original source');
});
await test('foreign-theme video is never projected into another theme', () => {
  const data = { socialVideos: [{ id: 'foreign', title: 'Foreign', platform: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', originalPlatformUrl: 'https://youtu.be/dQw4w9WgXcQ', thumbnailUrl: '', externalVideoId: 'dQw4w9WgXcQ', themeId: 'nail_lash_studio', videoKind: 'long' }] };
  assert.equal(videoItemsForTheme('barber_mens_grooming', data).some((v) => v.id === 'foreign'), false);
});

console.log('\n▸ Responsive card/player interaction');
await test('view-original control opens the exact validated original URL', () => {
  cleanup();
  const data = structuredClone(initialData);
  const original = 'https://youtu.be/dQw4w9WgXcQ?t=27';
  data.socialVideos = [{ id: 'click-me', title: 'Original clip', platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', originalPlatformUrl: original, thumbnailUrl: '', externalVideoId: 'dQw4w9WgXcQ', channelName: 'Original channel', videoKind: 'long', themeId: 'barber_mens_grooming' }];
  let opened = null;
  dom.window.open = (...args) => { opened = args; return null; };
  const ui = render(React.createElement(SiteVideoGallery, { themeId: 'barber_mens_grooming', data, mode: 'mobile' }));
  const card = ui.container.querySelector('[data-social-id="click-me"]');
  assert.ok(card);
  // Cards play on click; the dedicated View-Original control opens the exact
  // validated original platform URL in a new tab.
  const viewBtn = card.querySelector('[data-testid="site-social-view"]');
  assert.ok(viewBtn, 'view-original control missing');
  fireEvent.click(viewBtn);
  assert.deepEqual(opened, [original, '_blank', 'noopener,noreferrer']);
  assert.match(card.textContent, /Original clip/); assert.match(card.textContent, /Original channel/); assert.match(card.textContent, /Long/);
});
await test('Play lazily mounts the original video embed plus exact external destination', () => {
  const play = document.querySelector('[data-social-id="click-me"] [data-testid="site-social-play"]');
  fireEvent.click(play);
  assert.ok(document.querySelector('[data-testid="site-video-player-loading"]'));
  const link = document.querySelector('[data-testid="site-video-original-destination"]');
  assert.equal(link.getAttribute('href'), 'https://youtu.be/dQw4w9WgXcQ?t=27');
  assert.ok(document.querySelector('[data-testid="site-social-embed"] iframe'));
});
await test('unsafe destination is never opened', () => {
  let calls = 0; dom.window.open = () => { calls++; };
  assert.equal(openOriginalVideoDestination('javascript:alert(1)', 'youtube'), false);
  assert.equal(calls, 0);
});

console.log(`\n${passed}/11 tests passed`);
if (process.exitCode) process.exit(1);
