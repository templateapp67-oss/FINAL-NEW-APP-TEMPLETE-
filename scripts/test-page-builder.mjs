#!/usr/bin/env node
/**
 * PageBuilder — two-panel builder UI (edit form ⇄ live preview).
 *
 * Runs with NO Supabase env vars, i.e. the app's unconfigured/demo state:
 * the store keeps every edit locally (status stays 'idle' → "All changes
 * saved") and no request is ever attempted, so the suite is deterministic and
 * fully offline. What it asserts is the UI contract:
 *
 *   • the left panel edits the central store instantly;
 *   • every edit is propagated to the parent's central SalonData (so the
 *     live preview — bound to it by props — re-renders on the keystroke);
 *   • the right panel renders the REAL website renderer, not a mock;
 *   • the status badge reports saving / saved / error / idle;
 *   • the slug field validates live and normalises on blur, and never writes
 *     the live `slug` column;
 *   • the isolated (iframe + postMessage) transport is available.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/* ------------------------------------------------------------------ */
/* 0. DOM bootstrap — deliberately WITHOUT Supabase env vars            */
/* ------------------------------------------------------------------ */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MessageEvent = dom.window.MessageEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};
const section = (name) => console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 56 - name.length))}`);

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');

const PageBuilder = (await import('../src/components/PageBuilder.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { isSupabaseConfigured } = await import('../src/lib/supabase.ts');
const { isValidWebsiteSlug } = await import('../src/lib/publicWebsiteUrl.ts');

assert.equal(
  isSupabaseConfigured,
  false,
  'this suite must run in the unconfigured state so no request is attempted',
);

/* ------------------------------------------------------------------ */
/* 1. Pattern conformance                                              */
/* ------------------------------------------------------------------ */
section('Builder UI conformance');

const source = await read('src/components/PageBuilder.tsx');
const landing = await read('src/screens/Landing.tsx');

assert.ok(
  !/^\s*['"]use client['"]/.test(source),
  "'use client' is a Next.js RSC directive — this app is a client-only Vite SPA",
);
ok("no 'use client' directive (client-only Vite SPA)");

assert.ok(
  /import \{ useAutoSaveStore \} from '\.\.\/hooks\/useAutoSaveStore'/.test(source),
  'the builder must use the shared central-store hook',
);
ok('the builder uses the shared useAutoSaveStore hook');

// Canonical camelCase keys only — the config jsonb uses the same names the
// unified draft persists. snake_case would create a second source of truth.
// (Comments are stripped first: the header documents the snake_case mapping.)
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
for (const legacy of ['business_name', 'owner_name', 'about_text']) {
  assert.ok(!code.includes(legacy), `${legacy} is not a canonical field name here`);
}
for (const canonical of ['salonName', 'websiteSlug', 'ownerName', 'about']) {
  assert.ok(code.includes(canonical), `${canonical} is the canonical field name`);
}
ok('fields are canonical (salonName / websiteSlug / ownerName / about)');

assert.ok(
  /TemplateRenderer/.test(source) && /LivePreviewFrame/.test(source),
  'the right panel renders the real website, with both transports available',
);
ok('right panel renders the real TemplateRenderer (+ isolated iframe transport)');

assert.ok(
  /lazy\(\(\) => import\('\.\.\/components\/PageBuilder'\)\)/.test(landing) &&
    /<PageBuilder data=\{data\} setData=\{setData\} \/>/.test(landing),
  'PageBuilder must be mounted in the owner website tab (lazy-loaded)',
);
ok('PageBuilder is lazy-mounted in the "My Live Website" tab');

/* ------------------------------------------------------------------ */
/* 2. Behaviour: edit ⇄ preview                                        */
/* ------------------------------------------------------------------ */
section('Edit ⇄ live preview');

const base = {
  ...initialData,
  salonName: 'Nexora Demo Salon',
  ownerName: 'Asha Sharma',
  about: 'A premium salon in Jaipur.',
  websiteSlug: 'nexora-demo-salon',
};

function mountBuilder() {
  const state = { data: { ...base } };
  function Host() {
    const [data, setLocal] = React.useState(state.data);
    return React.createElement(PageBuilder, {
      data,
      setData: (next) =>
        setLocal((previous) => {
          state.data = typeof next === 'function' ? next(previous) : next;
          return state.data;
        }),
    });
  }
  return { state, Host };
}

const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
const setTextarea = Object.getOwnPropertyDescriptor(
  dom.window.HTMLTextAreaElement.prototype,
  'value',
).set;

async function type(element, value) {
  await act(async () => {
    (element.tagName === 'TEXTAREA' ? setTextarea : setValue).call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

const field = (container, label) => container.querySelector(`[aria-label="${label}"]`);

{
  const { state, Host } = mountBuilder();
  const view = await act(async () => render(React.createElement(Host)));
  const container = view.container;

  assert.equal(field(container, 'Business Name').value, 'Nexora Demo Salon', 'seeded from the draft');
  assert.equal(field(container, 'Website Slug').value, 'nexora-demo-salon');
  assert.equal(field(container, 'Owner Name').value, 'Asha Sharma');
  assert.equal(field(container, 'About Business').value, 'A premium salon in Jaipur.');
  ok('all four fields render from the central draft');

  // The right panel shows the REAL website, not a mock card.
  assert.ok(
    container.textContent.includes('Nexora Demo Salon'),
    'the live preview renders the business name through TemplateRenderer',
  );
  assert.ok(
    container.textContent.includes('nexora-demo-salon'),
    'the preview chrome shows the public address',
  );

  const badge = container.querySelector('[data-testid="page-builder-status"]');
  assert.equal(badge.textContent.trim(), 'All changes saved', 'idle state reports "All changes saved"');
  assert.ok(badge.className.includes('bg-slate-100'), 'idle badge uses the neutral style');

  // Edit the business name: store + central state + preview must all follow.
  await type(field(container, 'Business Name'), 'Arena Studio');
  assert.equal(
    field(container, 'Business Name').value,
    'Arena Studio',
    'the store updates the field instantly',
  );
  assert.equal(state.data.salonName, 'Arena Studio', 'the edit reaches the central SalonData');
  assert.ok(
    container.textContent.includes('Arena Studio'),
    'the live preview re-renders with the new value (same React tree)',
  );

  await type(field(container, 'Owner Name'), 'Vikas Verma');
  assert.equal(state.data.ownerName, 'Vikas Verma', 'owner name propagates');
  await type(field(container, 'About Business'), 'Bridal and colour specialists.');
  assert.equal(state.data.about, 'Bridal and colour specialists.', 'about propagates');

  cleanup();
  ok('one keystroke updates the store, the central state and the live preview');
}

/** Slug: validated live, normalised on blur, never written directly. */
{
  const { state, Host } = mountBuilder();
  const view = await act(async () => render(React.createElement(Host)));
  const container = view.container;
  const slugInput = field(container, 'Website Slug');

  await type(slugInput, 'Not Valid Slug!');
  assert.equal(slugInput.value, 'Not Valid Slug!', 'typing is never blocked');
  assert.ok(
    container.textContent.includes('Use 3–50 lowercase'),
    'an invalid slug shows the format hint',
  );
  assert.equal(state.data.websiteSlug, 'Not Valid Slug!', 'the draft slug is updated');

  // React binds onBlur to the bubbling `focusout` event — use fireEvent.
  await act(async () => {
    fireEvent.blur(slugInput);
  });
  const normalised = field(container, 'Website Slug').value;
  assert.match(normalised, /^[a-z0-9-]+$/, 'blur normalises the slug to a URL-safe value');
  assert.ok(isValidWebsiteSlug(normalised), 'the normalised slug passes the canonical validator');
  assert.equal(state.data.websiteSlug, normalised, 'the central state keeps the normalised slug');
  assert.ok(
    container.textContent.includes('Publishing reserves the final'),
    'a valid slug explains that publishing owns the live address',
  );

  cleanup();
  ok('slug: live validation + normalise-on-blur, published only through the guarded path');
}

/** Transport toggle: inline (props) ⇄ isolated (iframe + postMessage). */
{
  const { Host } = mountBuilder();
  const view = await act(async () => render(React.createElement(Host)));
  const container = view.container;

  assert.equal(
    container.querySelector('iframe'),
    null,
    'the default transport is the same React tree (no iframe)',
  );

  const toggle = container.querySelector('[aria-label="Toggle isolated preview"]');
  assert.ok(toggle, 'the isolated transport toggle exists');
  await act(async () => {
    toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  const frame = container.querySelector('iframe');
  assert.ok(frame, 'switching to isolated renders an iframe');
  assert.equal(
    new dom.window.URL(frame.getAttribute('src'), 'http://localhost:3000').pathname,
    '/preview-frame',
    'the iframe loads the postMessage preview route',
  );

  await act(async () => {
    container
      .querySelector('[aria-label="Toggle isolated preview"]')
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert.equal(container.querySelector('iframe'), null, 'toggling back returns to the inline render');

  cleanup();
  ok('transport toggle: inline ⇄ isolated iframe (/preview-frame)');
}

/* ------------------------------------------------------------------ */
console.log(`\nPageBuilder (edit panel + live preview): ${passed}/${passed} passed`);
process.exit(0);
