#!/usr/bin/env node
/**
 * SERVICE AUTOSAVE + LIVE PREVIEW BRIDGE — regression coverage.
 *
 * Covers the two contracts documented in docs/service-autosave-live-preview.md:
 *
 *   A. `useAutoSaveService` — a debounced (800 ms) Supabase autosave for one
 *      canonical `services` row, with 'idle' → 'saving' → 'saved' | 'error'
 *      status, write coalescing, tenant verification, validation mirroring the
 *      database constraints, and immutable provenance.
 *   B. `previewBridge` — the live-preview transport: same-React-tree props for
 *      the inline canvas, origin-validated `postMessage` for the iframe frame.
 *
 * Everything runs for real: jsdom + the actual React hook + the actual
 * persistence module. Only the Supabase transport is a recording stub, so the
 * SQL boundary (row shape, conflict target, ownership RPC) is asserted exactly.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/* ------------------------------------------------------------------ */
/* 0. DOM + env bootstrap (before any app import)                      */
/* ------------------------------------------------------------------ */
// The shared Supabase client reads env at import time; configure it so the
// hook's `isSupabaseConfigured` gate is open (the row write itself goes
// through an injected client — no network is ever touched).
process.env.VITE_SUPABASE_URL = 'https://qwaehqsmodekbgvnaavz.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';

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
const { render, cleanup, act } = await import('@testing-library/react');

const { useAutoSaveService } = await import('../src/hooks/useAutoSaveService.ts');
const {
  SERVICE_AUTOSAVE_DEBOUNCE_MS,
  SERVICE_TABLE,
  SERVICE_UPSERT_CONFLICT,
  buildServiceRow,
  isUuid,
  serviceDraftFingerprint,
  serviceToAutosaveDraft,
  validateServiceDraft,
} = await import('../src/lib/serviceAutosave.ts');
const {
  isPreviewEnvelope,
  sanitizePreviewState,
  allowedPreviewOrigins,
  createPreviewMessage,
  postPreviewMessage,
  usePreviewClient,
  usePreviewHost,
  PREVIEW_FRAME_ROUTE,
  PREVIEW_PROTOCOL,
} = await import('../src/lib/previewBridge.ts');

const SALON_ID = '10000000-0000-4000-8000-0000000000a1';
const OTHER_SALON_ID = '10000000-0000-4000-8000-0000000000b1';
const SERVICE_ID = '20000000-0000-4000-8000-0000000000c1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* 1. Pattern conformance (the documented snippet, adapted)            */
/* ------------------------------------------------------------------ */
section('Pattern conformance');

/** Source with comments removed, so documentation of a forbidden pattern is
 *  never mistaken for the pattern itself. */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const hookSource = stripComments(await read('src/hooks/useAutoSaveService.ts'));
const libSource = stripComments(await read('src/lib/serviceAutosave.ts'));
const mainSource = await read('src/main.tsx');

assert.ok(
  !/from ['"]lodash/.test(hookSource) && !/from ['"]lodash/.test(libSource),
  'no lodash: the debounce already lives in src/hooks/useDebounce.ts',
);
ok('no lodash dependency is introduced');

assert.ok(
  !/createClient\(/.test(hookSource) && !/createClient\(/.test(libSource),
  'a second Supabase client must never be created — src/lib/supabase.ts is the only one',
);
assert.ok(
  /from '\.\.\/lib\/supabase'/.test(hookSource),
  'the hook reads the shared client from src/lib/supabase.ts',
);
ok('single shared Supabase client (no createClient, no NEXT_PUBLIC_* env read)');

assert.ok(
  !/process\.env\.NEXT_PUBLIC_/.test(hookSource) && !/process\.env\.NEXT_PUBLIC_/.test(libSource),
  'Next.js-only env reads must not exist in this Vite app',
);
ok('no Next.js App Router env access');

assert.ok(
  libSource.includes(`const SERVICE_TABLE = '${SERVICE_TABLE}'`) && /upsert\(/.test(libSource),
  'the autosave must upsert into the canonical services table',
);
assert.ok(
  /updated_at: new Date\(\)\.toISOString\(\)/.test(libSource),
  'every write must stamp updated_at',
);
ok('upsert targets the canonical `services` table with updated_at');

assert.equal(SERVICE_AUTOSAVE_DEBOUNCE_MS, 800, 'the documented 800 ms debounce window');
assert.equal(SERVICE_UPSERT_CONFLICT, 'id,salon_id', 'conflict target is the tenant-scoped key');
ok('800 ms debounce · conflict target id,salon_id');

const previewFrameIndex = mainSource.indexOf("pathname === '/preview-frame'");
assert.ok(previewFrameIndex > -1, 'the /preview-frame route must be registered');
assert.ok(
  previewFrameIndex < mainSource.indexOf('await resolvePublicSalonWebsiteResult('),
  'the preview frame route must be matched BEFORE salon-slug resolution',
);
assert.ok(PREVIEW_FRAME_ROUTE === '/preview-frame', 'route constant matches main.tsx');
ok('/preview-frame route is matched before slug resolution');

/* ------------------------------------------------------------------ */
/* 2. Draft mapping, validation and fingerprinting                    */
/* ------------------------------------------------------------------ */
section('Draft mapping · validation · fingerprint');

const service = {
  id: SERVICE_ID,
  name: 'Hair Colour',
  category: 'Hair Color',
  description: 'Full colour',
  price: 500,
  duration: 45,
  featured: true,
  promotionalBadge: 'Best Seller',
  businessId: SALON_ID,
  themeId: '30000000-0000-4000-8000-0000000000d1',
  categoryId: '30000000-0000-4000-8000-0000000000d2',
  predefinedServiceId: null,
};

const draft = serviceToAutosaveDraft(service);
assert.equal(draft.salonId, SALON_ID, 'Service.businessId is the canonical salon id');
assert.equal(draft.price, 500, 'price stays in rupees in the draft');
ok('Service → draft maps businessId to the canonical salon id');

const updateRow = buildServiceRow(draft, SALON_ID, { includeProvenance: false });
assert.equal(updateRow.price_paise, 50000, 'rupees are converted to integer paise');
assert.equal(updateRow.duration_minutes, 45);
assert.equal(updateRow.salon_id, SALON_ID);
assert.equal(updateRow.name, 'Hair Colour');
assert.equal(updateRow.short_description, 'Full colour');
assert.equal(updateRow.is_featured, true);
assert.equal(updateRow.promotional_badge, 'Best Seller');
assert.ok(!Number.isNaN(Date.parse(updateRow.updated_at)), 'updated_at is an ISO timestamp');
ok('row shape: price in paise, ISO updated_at, mutable fields only');

// Provenance is insert-only — an autosave of an existing row must never
// rewrite theme/category/predefined links (a Custom NULL stays NULL).
assert.equal(updateRow.id, SERVICE_ID, 'an existing row upserts by id');
assert.ok(!('theme_id' in updateRow), 'theme_id is never rewritten by an autosave');
assert.ok(!('category_id' in updateRow), 'category_id is never rewritten by an autosave');
assert.ok(!('predefined_service_id' in updateRow), 'provenance is immutable');
ok('provenance columns are immutable on update');

const insertRow = buildServiceRow({ ...draft, id: null }, SALON_ID, { includeProvenance: true });
assert.ok(!('id' in insertRow), 'a new row lets the database generate the id');
assert.equal(insertRow.theme_id, service.themeId, 'provenance is written on insert');
assert.equal(insertRow.category_id, service.categoryId);
assert.equal(insertRow.is_active, true);
assert.equal(insertRow.deleted_at, null);
assert.equal(insertRow.display_order, 0);
ok('provenance + is_active + display_order are written on insert only');

assert.equal(validateServiceDraft(draft), null, 'a valid draft passes');
assert.equal(validateServiceDraft({ ...draft, name: '   ' }), 'Service name is required.');
assert.equal(
  validateServiceDraft({ ...draft, price: -1 }),
  'Service price cannot be negative.',
);
assert.equal(validateServiceDraft({ ...draft, duration: 0 }), 'Service duration must be positive.');
assert.equal(
  validateServiceDraft({ ...draft, id: 'local-row' }),
  'This service has not been saved yet, so it cannot be autosaved.',
);
assert.equal(validateServiceDraft(null), 'Nothing to save yet.');
ok('validation mirrors the DB/check guards (name, price, duration, id)');

assert.equal(
  serviceDraftFingerprint(draft),
  serviceDraftFingerprint({ ...draft }),
  'identical content produces an identical signature',
);
assert.notEqual(
  serviceDraftFingerprint(draft),
  serviceDraftFingerprint({ ...draft, name: 'Hair Colour Deluxe' }),
  'a real change changes the signature',
);
assert.equal(serviceDraftFingerprint(null), '');
assert.ok(isUuid(SERVICE_ID) && !isUuid('local-row'), 'isUuid distinguishes DB rows');
ok('fingerprint suppresses no-op writes');

/* ------------------------------------------------------------------ */
/* 3. Hook behaviour (real React hook, real debounce)                 */
/* ------------------------------------------------------------------ */
section('useAutoSaveService behaviour');

/** Records every call the persistence layer makes at the SQL boundary. */
function createFakeClient({ owned = [SALON_ID], upsert, insert } = {}) {
  const calls = { rpc: [], upserts: [], inserts: [] };
  const finish = (result) => ({
    select: () => ({ maybeSingle: async () => result }),
  });
  const client = {
    rpc: async (name) => {
      calls.rpc.push(name);
      if (name === 'owner_salon_ids') return { data: owned, error: null };
      return { data: null, error: { message: `unknown function ${name}` } };
    },
    from: (table) => ({
      upsert: (row, options) => {
        calls.upserts.push({ table, row, options });
        return finish(upsert ? upsert(row) : { data: { id: row.id ?? 'new-id' }, error: null });
      },
      insert: (row) => {
        calls.inserts.push({ table, row });
        return finish(insert ? insert(row) : { data: { id: 'new-id' }, error: null });
      },
    }),
  };
  return { client, calls };
}

function createHarness() {
  const api = { current: null };
  function Probe({ service: value, options }) {
    api.current = useAutoSaveService(value, options);
    return null;
  }
  return { api, Probe };
}

async function mount(Probe, initialProps) {
  let result;
  await act(async () => {
    result = render(React.createElement(Probe, initialProps));
  });
  return result;
}

/** 1. Hydration must never write. */
{
  const { client, calls } = createFakeClient();
  const { api, Probe } = createHarness();
  await mount(Probe, {
    service: { ...draft },
    options: { client, salonId: SALON_ID },
  });
  await act(async () => { await sleep(SERVICE_AUTOSAVE_DEBOUNCE_MS + 250); });
  assert.equal(calls.upserts.length, 0, 'opening the editor must not write');
  assert.equal(api.current.status, 'idle', 'nothing edited yet → idle');
  cleanup();
  ok('hydration does not trigger a write (status idle)');
}

/** 2. One edit → exactly one upsert with the correct row. */
{
  const { client, calls } = createFakeClient();
  const { api, Probe } = createHarness();
  const view = await mount(Probe, { service: { ...draft }, options: { client, salonId: SALON_ID } });

  await act(async () => {
    view.rerender(
      React.createElement(Probe, {
        service: { ...draft, name: 'Hair Colour Deluxe', price: 650 },
        options: { client, salonId: SALON_ID },
      }),
    );
  });
  await act(async () => { await sleep(SERVICE_AUTOSAVE_DEBOUNCE_MS + 350); });

  assert.equal(calls.upserts.length, 1, 'exactly one write per edit burst');
  const [{ table, row, options }] = calls.upserts;
  assert.equal(table, 'services');
  assert.equal(options.onConflict, 'id,salon_id', 'tenant-scoped conflict target');
  assert.equal(row.name, 'Hair Colour Deluxe');
  assert.equal(row.price_paise, 65000, 'rupees → paise at the SQL boundary');
  assert.equal(row.salon_id, SALON_ID);
  assert.equal(row.id, SERVICE_ID);
  assert.equal(api.current.status, 'saved', 'status reports the confirmed write');
  assert.ok(api.current.lastSavedAt > 0, 'lastSavedAt is stamped');
  assert.ok(calls.rpc.includes('owner_salon_ids'), 'ownership is verified server-side');
  cleanup();
  ok('one edit → one tenant-scoped upsert → status saved');
}

/** 3. A burst of edits coalesces into the LAST value only. */
{
  const { client, calls } = createFakeClient();
  const { api, Probe } = createHarness();
  const view = await mount(Probe, { service: { ...draft }, options: { client, salonId: SALON_ID } });

  for (const name of ['A', 'AB', 'ABC']) {
    await act(async () => {
      view.rerender(
        React.createElement(Probe, {
          service: { ...draft, name },
          options: { client, salonId: SALON_ID },
        }),
      );
      await sleep(120);
    });
  }
  await act(async () => { await sleep(SERVICE_AUTOSAVE_DEBOUNCE_MS + 350); });

  assert.equal(calls.upserts.length, 1, 'three keystrokes collapse into one write');
  assert.equal(calls.upserts[0].row.name, 'ABC', 'the newest value wins');
  assert.equal(api.current.status, 'saved');
  cleanup();
  ok('debounce coalesces a burst into one write (latest value)');
}

/** 4. saveNow() bypasses the debounce. */
{
  const { client, calls } = createFakeClient();
  const { api, Probe } = createHarness();
  await mount(Probe, { service: { ...draft }, options: { client, salonId: SALON_ID } });
  await act(async () => {
    await api.current.saveNow();
  });
  assert.equal(calls.upserts.length, 1, 'saveNow writes immediately');
  assert.equal(api.current.status, 'saved');
  cleanup();
  ok('saveNow() flushes immediately (used by explicit actions)');
}

/** 5. Failures surface as status 'error' with a readable message. */
{
  const { client, calls } = createFakeClient({
    upsert: () => ({ data: null, error: { message: 'Failed to fetch' } }),
  });
  const { api, Probe } = createHarness();
  const view = await mount(Probe, { service: { ...draft }, options: { client, salonId: SALON_ID } });
  await act(async () => {
    view.rerender(
      React.createElement(Probe, {
        service: { ...draft, name: 'Offline Edit' },
        options: { client, salonId: SALON_ID, retryAttempts: 0 },
      }),
    );
  });
  await act(async () => { await sleep(SERVICE_AUTOSAVE_DEBOUNCE_MS + 400); });
  assert.equal(api.current.status, 'error', 'a failed write reports error');
  assert.match(api.current.error, /Network error/, 'network failures are described in plain words');
  assert.ok(calls.upserts.length >= 1, 'the write was attempted');
  cleanup();
  ok('failed write → status error with a human-readable message');
}

/** 6. Tenant guard: a salon the session does not own is refused. */
{
  const { client, calls } = createFakeClient({ owned: [SALON_ID] });
  const { api, Probe } = createHarness();
  const view = await mount(Probe, {
    service: { ...draft, salonId: OTHER_SALON_ID },
    options: { client },
  });
  await act(async () => {
    view.rerender(
      React.createElement(Probe, {
        service: { ...draft, salonId: OTHER_SALON_ID, name: 'Cross tenant' },
        options: { client, retryAttempts: 0 },
      }),
    );
  });
  await act(async () => { await sleep(SERVICE_AUTOSAVE_DEBOUNCE_MS + 400); });
  assert.equal(calls.upserts.length, 0, 'no write is ever attempted for a foreign salon');
  assert.equal(api.current.status, 'error');
  assert.equal(api.current.error, 'You do not have access to this salon.');
  cleanup();
  ok('cross-tenant draft is refused before any SQL is sent');
}

/** 7. A not-yet-saved service never hits the table (create path owns it). */
{
  const { client, calls } = createFakeClient();
  const { api, Probe } = createHarness();
  const unsaved = { ...draft, id: 'local-row-1', salonId: null };
  const view = await mount(Probe, { service: unsaved, options: { client } });
  await act(async () => {
    view.rerender(
      React.createElement(Probe, {
        service: { ...unsaved, name: 'Brand New' },
        options: { client },
      }),
    );
  });
  await act(async () => { await sleep(SERVICE_AUTOSAVE_DEBOUNCE_MS + 350); });
  assert.equal(calls.upserts.length, 0);
  assert.equal(calls.inserts.length, 0, 'autosave never creates a row by default');
  assert.equal(api.current.status, 'idle', 'the hook stays disabled');
  cleanup();
  ok('unsaved (non-DB) service is never autosaved by default');
}

/** 8. allowInsert opts into creating a row with full provenance. */
{
  const { client, calls } = createFakeClient();
  const { api, Probe } = createHarness();
  const unsaved = { ...draft, id: null, salonId: SALON_ID };
  const view = await mount(Probe, { service: unsaved, options: { client, allowInsert: true } });
  await act(async () => {
    view.rerender(
      React.createElement(Probe, {
        service: { ...unsaved, name: 'New Row' },
        options: { client, allowInsert: true },
      }),
    );
  });
  await act(async () => { await sleep(SERVICE_AUTOSAVE_DEBOUNCE_MS + 350); });
  assert.equal(calls.inserts.length, 1, 'insert is used when no row exists');
  assert.equal(calls.inserts[0].table, 'services');
  assert.equal(calls.inserts[0].row.is_active, true);
  assert.equal(calls.inserts[0].row.deleted_at, null);
  assert.equal(calls.inserts[0].row.theme_id, service.themeId);
  assert.equal(api.current.status, 'saved');
  cleanup();
  ok('allowInsert creates a row with provenance, is_active and deleted_at');
}

/** 9. `enabled: false` disables the hook completely. */
{
  const { client, calls } = createFakeClient();
  const { api, Probe } = createHarness();
  const view = await mount(Probe, { service: { ...draft }, options: { client, enabled: false } });
  await act(async () => {
    view.rerender(
      React.createElement(Probe, {
        service: { ...draft, name: 'Paused' },
        options: { client, enabled: false },
      }),
    );
  });
  await act(async () => { await sleep(SERVICE_AUTOSAVE_DEBOUNCE_MS + 300); });
  assert.equal(calls.upserts.length, 0);
  assert.equal(api.current.status, 'idle');
  cleanup();
  ok('enabled:false pauses autosave (used during an explicit save)');
}

/* ------------------------------------------------------------------ */
/* 4. Live preview bridge                                              */
/* ------------------------------------------------------------------ */
section('Live preview bridge');

assert.ok(isPreviewEnvelope(createPreviewMessage('state', { revision: 1 })), 'own envelope');
assert.ok(!isPreviewEnvelope({ type: 'state' }), 'a foreign message is not our protocol');
assert.ok(!isPreviewEnvelope(null) && !isPreviewEnvelope('state'), 'junk is rejected');
ok('protocol marker identifies Nexora preview messages only');

const previewState = { templateId: 'hair', services: [], salonName: 'Test Salon' };
assert.equal(sanitizePreviewState(previewState), previewState, 'a website draft is accepted');
assert.equal(sanitizePreviewState({ templateId: 'hair' }), null, 'no services → rejected');
assert.equal(sanitizePreviewState([]), null, 'arrays are rejected');
assert.equal(sanitizePreviewState(null), null);
ok('inbound payloads are shape-checked before rendering');

assert.deepEqual(allowedPreviewOrigins(), ['http://localhost:3000'], 'same-origin by default');
assert.deepEqual(
  allowedPreviewOrigins(['https://app.example.com']).sort(),
  ['http://localhost:3000', 'https://app.example.com'],
  'explicit hosts can be trusted',
);
ok('origin allow-list defaults to this app only');

{
  const sent = [];
  const target = { postMessage: (message, origin) => sent.push({ message, origin }) };
  const delivered = postPreviewMessage(
    target,
    createPreviewMessage('state', { revision: 1, state: previewState }),
  );
  assert.equal(delivered, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].origin, 'http://localhost:3000', 'an explicit origin is always sent');
  assert.notEqual(sent[0].origin, '*', 'state is never broadcast to any origin');
  assert.equal(postPreviewMessage(null, createPreviewMessage('ready')), false, 'no target → no-op');
  ok('postMessage always targets an explicit origin (never "*")');
}

/** Child side: handshake + validated inbound state. */
{
  const received = [];
  const posted = [];
  const fakeParent = {
    postMessage: (message, origin) => posted.push({ message, origin }),
  };
  const originalParent = Object.getOwnPropertyDescriptor(dom.window, 'parent');
  Object.defineProperty(dom.window, 'parent', { value: fakeParent, configurable: true });

  function Frame() {
    usePreviewClient({ onState: (state, revision) => received.push({ state, revision }) });
    return null;
  }
  await act(async () => { render(React.createElement(Frame)); });

  assert.ok(
    posted.some((entry) => entry.message.type === 'ready' && entry.message.protocol === PREVIEW_PROTOCOL),
    'the frame announces itself so the editor pushes the current state',
  );

  const dispatch = async (data, origin) => {
    await act(async () => {
      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', { data, origin, source: fakeParent }),
      );
    });
  };

  await dispatch(createPreviewMessage('state', { revision: 7, state: previewState }), 'https://evil.example');
  assert.equal(received.length, 0, 'a foreign origin is dropped');

  await dispatch(
    createPreviewMessage('state', { revision: 7, state: previewState }),
    'http://localhost:3000',
  );
  assert.equal(received.length, 1, 'an allowed origin is applied');
  assert.equal(received[0].revision, 7);
  assert.equal(received[0].state, previewState);
  assert.ok(
    posted.some((entry) => entry.message.type === 'ack' && entry.message.revision === 7),
    'the frame acknowledges the applied revision',
  );

  await dispatch(createPreviewMessage('state', { revision: 8, state: { templateId: 'hair' } }), 'http://localhost:3000');
  assert.equal(received.length, 1, 'a malformed payload is never rendered');
  assert.ok(
    posted.some((entry) => entry.message.type === 'error'),
    'a malformed payload is reported back to the editor',
  );

  cleanup();
  if (originalParent) Object.defineProperty(dom.window, 'parent', originalParent);
  ok('frame side: ready handshake, origin allow-list, ack + error reporting');
}

/** Host side: streams state to the frame and re-sends on ready. */
{
  const pushed = [];
  const frameWindow = {
    postMessage: (message, origin) => pushed.push({ message, origin }),
  };
  const frame = {
    contentWindow: frameWindow,
    addEventListener() {},
    removeEventListener() {},
  };

  function Editor({ data: value }) {
    const targetRef = React.useRef(null);
    targetRef.current = frame;
    usePreviewHost({ state: value, targetRef });
    return null;
  }
  const view = await act(async () => render(React.createElement(Editor, { data: previewState })));

  const ready = () =>
    act(async () => {
      dom.window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          data: createPreviewMessage('ready'),
          origin: 'http://localhost:3000',
          source: frameWindow,
        }),
      );
    });

  await ready();
  const afterReady = pushed.filter((entry) => entry.message.type === 'state');
  assert.equal(afterReady.length, 1, 'the current state is pushed as soon as the frame is ready');
  assert.equal(afterReady[0].message.revision, 1);
  assert.equal(afterReady[0].message.state, previewState);
  assert.equal(afterReady[0].origin, 'http://localhost:3000', 'state goes to an explicit origin');

  await act(async () => {
    view.rerender(React.createElement(Editor, { data: { ...previewState, salonName: 'Edited' } }));
  });
  await act(async () => { await sleep(200); });
  const stateMessages = pushed.filter((entry) => entry.message.type === 'state');
  assert.equal(stateMessages.length, 2, 'an edit streams a new state into the frame');
  assert.equal(stateMessages[1].message.state.salonName, 'Edited');
  assert.ok(stateMessages[1].message.revision > stateMessages[0].message.revision, 'revisions increase');

  // A message from another window cannot trigger a re-handshake.
  await act(async () => {
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        data: createPreviewMessage('ready'),
        origin: 'http://localhost:3000',
        source: { postMessage() {} },
      }),
    );
  });
  assert.equal(
    pushed.filter((entry) => entry.message.type === 'state').length,
    2,
    'a foreign window cannot inject a handshake',
  );

  cleanup();
  ok('host side: streams edits to the frame, re-sends on ready, rejects foreign sources');
}

/* ------------------------------------------------------------------ */
/* 5. End-to-end: the frame route renders the streamed state            */
/* ------------------------------------------------------------------ */
section('PreviewFrameSurface (the /preview-frame route)');

const PreviewFrameSurface = (await import('../src/components/PreviewFrameSurface.tsx')).default;
const { initialData } = await import('../src/types.ts');

assert.ok(
  /import PreviewFrameSurface from '\.\/components\/PreviewFrameSurface\.tsx'/.test(mainSource),
  'main.tsx must render the frame surface',
);
assert.ok(
  /case 'preview_frame':[\s\S]{0,160}<PreviewFrameSurface \/>/.test(mainSource),
  'the preview_frame route renders <PreviewFrameSurface />',
);
ok('the /preview-frame route renders PreviewFrameSurface');

{
  const view = await act(async () => render(React.createElement(PreviewFrameSurface)));
  assert.ok(
    view.container.textContent.includes('Waiting for the editor'),
    'before the handshake the frame shows a neutral waiting state',
  );

  await act(async () => {
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        data: createPreviewMessage('state', {
          revision: 1,
          state: { ...initialData, services: [] },
        }),
        origin: 'http://localhost:3000',
      }),
    );
  });
  await act(async () => { await sleep(300); });

  assert.ok(
    !view.container.textContent.includes('Waiting for the editor'),
    'the streamed state replaces the waiting state',
  );
  assert.ok(
    view.container.innerHTML.length > 1000,
    'the real website renderer runs inside the frame',
  );
  cleanup();
  ok('frame renders the real site from a streamed state (end-to-end)');
}

/* ------------------------------------------------------------------ */
console.log(`\nService autosave + live preview bridge: ${passed}/${passed} passed`);
// The shared Supabase client schedules a refresh timer; exit explicitly so the
// suite never hangs on an open handle.
process.exit(0);
