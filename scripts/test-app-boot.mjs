#!/usr/bin/env node
/**
 * WHITE-SCREEN GUARD — full application boot in jsdom.
 *
 * Imports and runs the REAL `src/main.tsx` entry exactly like the browser
 * does (same module graph, same RootRouter, same AuthModalProvider). If ANY
 * module-scope or first-render exception exists, this boot crashes and the
 * test fails — the exact failure users see as a white screen in preview.
 *
 * Asserts that real UI (the wizard TopBar) lands in the DOM.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { register } from 'node:module';

// Stub .css imports (Vite handles them in the browser; node cannot).
register(new URL('./lib/css-stub-loader.mjs', import.meta.url));

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true },
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.localStorage = dom.window.localStorage;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});
dom.window.matchMedia = globalThis.matchMedia;
// Not a component test — a real boot. Avoid React act() noise.
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const errors = [];
process.on('unhandledRejection', (reason) => { errors.push(`unhandledRejection: ${reason}`); });

console.log('🧪 Booting the full application (src/main.tsx) in jsdom...\n');

try {
  await import('../src/main.tsx');
} catch (err) {
  console.error('❌ FAIL — application boot threw an exception:');
  console.error(err);
  process.exit(1);
}

// Let RootRouter's async resolveRoute + React render settle.
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));
await settle();
await settle();
await settle();

const root = dom.window.document.getElementById('root');
const html = root?.innerHTML ?? '';
const text = dom.window.document.body.textContent ?? '';

let failed = false;
if (html.trim().length === 0) {
  console.error('❌ FAIL — #root is empty after boot (WHITE SCREEN).');
  failed = true;
} else {
  console.log(`✅ PASS — #root rendered ${html.length} bytes of UI after boot.`);
}

// The '/' route is the wizard — its TopBar must be present.
if (dom.window.document.querySelector('[data-testid="topbar-login-btn"]') || /Nexora|Salon|Builder/i.test(text)) {
  console.log('✅ PASS — recognizable application UI is visible (not a blank page).');
} else {
  console.error('❌ FAIL — no recognizable app UI found after boot.');
  console.error('   body text sample:', JSON.stringify(text.slice(0, 300)));
  failed = true;
}

if (errors.length > 0) {
  console.error('❌ FAIL — background errors during boot:');
  for (const e of errors) console.error('   ' + e);
  failed = true;
} else {
  console.log('✅ PASS — no unhandled background errors during boot.');
}

console.log('');
process.exit(failed ? 1 : 0);
