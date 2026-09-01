#!/usr/bin/env node
/**
 * CENTRAL STATE + DEBOUNCED AUTO-SAVE STORE — regression coverage.
 *
 * Covers the documented `useAutoSaveStore` pattern as implemented for this
 * repository (docs/service-autosave-live-preview.md, section 2):
 *
 *   • the store OWNS the central state and updates it instantly;
 *   • every change is saved in the background after a 600 ms debounce;
 *   • the target is the canonical `salon_public_websites.config` jsonb,
 *     MERGED with the existing draft (never replaced);
 *   • the salon id is resolved from the session and verified;
 *   • hydration (load) is never an edit, so it never writes.
 *
 * Runs the REAL React hook in jsdom; only the Supabase transport is a
 * recording stub, so the SQL boundary is asserted exactly.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/* ------------------------------------------------------------------ */
/* 0. DOM + env bootstrap (before any app import)                      */
/* ------------------------------------------------------------------ */
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

const { useAutoSaveStore } = await import('../src/hooks/useAutoSaveStore.ts');
const {
  STORE_AUTOSAVE_DEBOUNCE_MS,
  STORE_SETTINGS_TABLE,
  STORE_UPSERT_CONFLICT,
  isStoreSettingsFailure,
  mergeStoreConfig,
  readStoreSettingsWithClient,
  saveStoreSettingsWithClient,
  storeSettingsErrorMessage,
  toJsonPatch,
} = await import('../src/lib/storeSettings.ts');

const SALON_ID = '10000000-0000-4000-8000-0000000000a1';
const OTHER_SALON_ID = '10000000-0000-4000-8000-0000000000b1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* 1. Pattern conformance (the documented snippet, adapted)            */
/* ------------------------------------------------------------------ */
section('Pattern conformance');

/** Source with comments removed, so documentation is never mistaken for code. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const hookSource = stripComments(await read('src/hooks/useAutoSaveStore.ts'));
const libSource = stripComments(await read('src/lib/storeSettings.ts'));

assert.ok(
  !/from ['"]lodash/.test(hookSource) && !/from ['"]lodash/.test(libSource),
  'no lodash: the debounce already lives in src/hooks/useDebounce.ts',
);
ok('no lodash dependency is introduced');

assert.ok(
  !/auth-helpers-nextjs|createClientComponentClient/.test(hookSource + libSource),
  'Next.js-only Supabase helper packages must not be used here',
);
assert.ok(
  /from '\.\.\/lib\/supabase'/.test(hookSource),
  'the hook reads the shared client from src/lib/supabase.ts',
);
ok('single shared Supabase client (no @supabase/auth-helpers-nextjs)');

assert.equal(STORE_AUTOSAVE_DEBOUNCE_MS, 600, 'the documented 600 ms debounce window');
assert.equal(STORE_SETTINGS_TABLE, 'salon_public_websites', 'canonical settings row');
assert.equal(STORE_UPSERT_CONFLICT, 'salon_id', 'one settings row per salon');
ok('600 ms debounce · canonical salon_public_websites row');

assert.ok(
  !/updated_at\s*:/.test(libSource),
  '`updated_at` is database-maintained: the column grant does not expose it to browser writes',
);
assert.ok(
  /create table if not exists public\.store_settings/.test(
    await read('supabase/migrations/20260811000401_m04_services_packages.sql'),
  ) === false,
  'no duplicate store_settings table may be introduced',
);
ok('no updated_at column write · no duplicate store_settings table');

/* ------------------------------------------------------------------ */
/* 2. Merge + validation units                                         */
/* ------------------------------------------------------------------ */
section('Config merge · JSON safety');

assert.deepEqual(toJsonPatch({ minNotice: '2 hours' }), { minNotice: '2 hours' });
assert.throws(() => toJsonPatch({ bad: () => 1 }), /JSON-serializable/);
assert.throws(() => toJsonPatch([]), /must be an object/);
assert.throws(() => toJsonPatch(null), /must be an object/);
ok('only JSON-serializable settings can reach the jsonb column');

assert.deepEqual(
  mergeStoreConfig({ whiteLabel: { hidePoweredBy: true } }, { bookingRules: { minNotice: '1 hour' } }),
  { whiteLabel: { hidePoweredBy: true }, bookingRules: { minNotice: '1 hour' } },
  'an existing draft key survives a top-level merge',
);
assert.deepEqual(
  mergeStoreConfig(
    { whiteLabel: { hidePoweredBy: true }, bookingRules: { minNotice: '1 hour', bufferTime: 'No buffer' } },
    { minNotice: '2 hours' },
    'bookingRules',
  ),
  {
    whiteLabel: { hidePoweredBy: true },
    bookingRules: { minNotice: '2 hours', bufferTime: 'No buffer' },
  },
  'a namespaced patch merges INSIDE its key and never clobbers neighbours',
);
assert.deepEqual(mergeStoreConfig(null, { a: 1 }, 'bookingRules'), { bookingRules: { a: 1 } });
ok('settings are merged into the draft config, never replaced');

assert.match(storeSettingsErrorMessage({ message: 'new row violates row-level security policy' }), /permission/i);
assert.match(storeSettingsErrorMessage({ message: 'Failed to fetch' }), /Network error/);
assert.match(storeSettingsErrorMessage(undefined), /Unable to save/);
ok('errors are translated into owner-safe messages');

/* ------------------------------------------------------------------ */
/* 3. Hook behaviour (real React hook, real debounce)                  */
/* ------------------------------------------------------------------ */
section('useAutoSaveStore behaviour');

/** Records every call the persistence layer makes at the SQL boundary. */
function createFakeClient({ owned = [SALON_ID], config = null, update, upsert } = {}) {
  const calls = { rpc: [], reads: [], updates: [], upserts: [] };
  const client = {
    rpc: async (name) => {
      calls.rpc.push(name);
      if (name === 'owner_salon_ids') return { data: owned, error: null };
      return { data: null, error: { message: `unknown function ${name}` } };
    },
    from: (table) => ({
      select: () => ({
        eq: (column, value) => ({
          maybeSingle: async () => {
            calls.reads.push({ table, column, value });
            return config === null
              ? { data: null, error: null }
              : { data: { config }, error: null };
          },
        }),
      }),
      update: (row) => {
        const entry = { table, row };
        calls.updates.push(entry);
        return {
          eq: async (column, value) => {
            entry.where = { column, value };
            return update ? update(row) : { error: null };
          },
        };
      },
      upsert: async (row, options) => {
        const entry = { table, row, options };
        calls.upserts.push(entry);
        return upsert ? upsert(row) : { error: null };
      },
    }),
  };
  return { client, calls };
}

function createHarness() {
  const api = { current: null };
  function Probe({ initial, options, storeId }) {
    // `storeId` (when provided) exercises the documented POSITIONAL call style:
    // useAutoSaveStore(initialData, storeId).
    api.current = useAutoSaveStore(initial, storeId === undefined ? options : storeId);
    return null;
  }
  return { api, Probe };
}

async function mount(Probe, props) {
  let view;
  await act(async () => {
    view = render(React.createElement(Probe, props));
  });
  return view;
}

const INITIAL = { minNotice: '1 hour', allowStaffSelection: true };

/** 1. Mounting the store never writes. */
{
  const { client, calls } = createFakeClient({ config: { bookingRules: INITIAL } });
  const { api, Probe } = createHarness();
  await mount(Probe, { initial: { ...INITIAL }, options: { client, configKey: 'bookingRules' } });
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 250); });
  assert.equal(calls.updates.length, 0, 'mounting must not write');
  assert.equal(calls.upserts.length, 0);
  assert.equal(api.current.status, 'idle');
  cleanup();
  ok('hydration does not trigger a write (status idle)');
}

/** 2. updateField: instant state, instant "saving", one debounced write. */
{
  const { client, calls } = createFakeClient({
    config: { whiteLabel: { hidePoweredBy: true }, bookingRules: INITIAL },
  });
  const { api, Probe } = createHarness();
  await mount(Probe, { initial: { ...INITIAL }, options: { client, configKey: 'bookingRules' } });

  await act(async () => {
    api.current.updateField('minNotice', '2 hours');
  });

  // Instant feedback: the state AND the status update on the keystroke.
  assert.equal(api.current.data.minNotice, '2 hours', 'the central state updates instantly');
  assert.equal(api.current.status, 'saving', 'status flips to saving immediately');
  assert.equal(calls.updates.length, 0, 'no request before the debounce elapses');

  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 350); });

  assert.equal(calls.updates.length, 1, 'exactly one write after the debounce');
  const [{ table, row, where }] = calls.updates;
  assert.equal(table, 'salon_public_websites');
  assert.deepEqual(where, { column: 'salon_id', value: SALON_ID }, 'scoped to the session salon');
  assert.deepEqual(
    row.config.bookingRules,
    { minNotice: '2 hours', allowStaffSelection: true },
    'the patch is merged inside its namespace',
  );
  assert.deepEqual(row.config.whiteLabel, { hidePoweredBy: true }, 'the rest of the draft survives');
  assert.equal(api.current.status, 'saved');
  assert.ok(api.current.lastSavedAt > 0);
  assert.ok(calls.rpc.includes('owner_salon_ids'), 'ownership is verified server-side');
  cleanup();
  ok('updateField → instant state + status saving → one merged write → saved');
}

/** 3. A burst of edits coalesces into the LAST value. */
{
  const { client, calls } = createFakeClient({ config: { bookingRules: INITIAL } });
  const { api, Probe } = createHarness();
  await mount(Probe, { initial: { ...INITIAL }, options: { client, configKey: 'bookingRules' } });

  for (const value of ['2 h', '3 h', '4 hours']) {
    await act(async () => {
      api.current.updateField('minNotice', value);
      await sleep(120);
    });
  }
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 350); });

  assert.equal(calls.updates.length, 1, 'three keystrokes collapse into one write');
  assert.equal(calls.updates[0].row.config.bookingRules.minNotice, '4 hours', 'the newest value wins');
  assert.equal(api.current.status, 'saved');
  cleanup();
  ok('debounce coalesces a burst into one write (latest value)');
}

/** 4. saveNow() bypasses the debounce; enabled:false pauses saving. */
{
  const { client, calls } = createFakeClient({ config: { bookingRules: INITIAL } });
  const { api, Probe } = createHarness();
  await mount(Probe, { initial: { ...INITIAL }, options: { client, configKey: 'bookingRules' } });
  await act(async () => {
    api.current.updateField('minNotice', '30 minutes');
    await api.current.saveNow();
  });
  assert.equal(calls.updates.length, 1, 'saveNow writes immediately');
  assert.equal(api.current.status, 'saved');
  cleanup();
}
{
  const { client, calls } = createFakeClient({ config: { bookingRules: INITIAL } });
  const { api, Probe } = createHarness();
  await mount(Probe, {
    initial: { ...INITIAL },
    options: { client, configKey: 'bookingRules', enabled: false },
  });
  await act(async () => {
    api.current.updateField('minNotice', '30 minutes');
  });
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 300); });
  assert.equal(calls.updates.length, 0, 'enabled:false pauses the autosave');
  assert.equal(api.current.data.minNotice, '30 minutes', 'the local state still updates');
  cleanup();
  ok('saveNow() flushes immediately · enabled:false pauses saving');
}

/** 5. hydrate() loads external state without writing. */
{
  const { client, calls } = createFakeClient({ config: { bookingRules: INITIAL } });
  const { api, Probe } = createHarness();
  await mount(Probe, { initial: { ...INITIAL }, options: { client, configKey: 'bookingRules' } });

  await act(async () => {
    api.current.hydrate({ minNotice: '45 minutes', allowStaffSelection: false });
  });
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 300); });
  assert.equal(calls.updates.length, 0, 'hydration is never an edit');
  assert.equal(api.current.data.minNotice, '45 minutes', 'the store adopts the loaded state');
  assert.equal(api.current.status, 'idle');

  await act(async () => {
    api.current.updateField('minNotice', '1 day');
  });
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 350); });
  assert.equal(calls.updates.length, 1, 'an edit after hydration does save');
  assert.equal(calls.updates[0].row.config.bookingRules.minNotice, '1 day');
  cleanup();
  ok('hydrate() loads state silently; only real edits save');
}

/** 6. Persistence failures surface as status 'error' and can be retried. */
{
  const { client, calls } = createFakeClient({
    config: { bookingRules: INITIAL },
    update: () => ({ error: { message: 'Failed to fetch' } }),
  });
  const { api, Probe } = createHarness();
  await mount(Probe, {
    initial: { ...INITIAL },
    options: { client, configKey: 'bookingRules', retryAttempts: 0 },
  });
  await act(async () => {
    api.current.updateField('minNotice', '2 hours');
  });
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 400); });
  assert.equal(api.current.status, 'error');
  assert.match(api.current.error, /Network error/);
  assert.ok(calls.updates.length >= 1, 'the write was attempted');

  const before = calls.updates.length;
  await act(async () => { await api.current.retry(); });
  assert.ok(calls.updates.length > before, 'retry() re-attempts the write');
  assert.equal(api.current.status, 'error', 'still failing');
  cleanup();
  ok('failed write → status error, retry() re-attempts');
}

/** 7. Non-serializable settings cannot reach the database. */
{
  const { client, calls } = createFakeClient({ config: { bookingRules: INITIAL } });
  const { api, Probe } = createHarness();
  await mount(Probe, {
    initial: { ...INITIAL },
    options: { client, configKey: 'bookingRules', retryAttempts: 0 },
  });
  await act(async () => {
    api.current.updateField('minNotice', () => 'nope');
  });
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 400); });
  assert.equal(calls.updates.length, 0, 'nothing is sent for an unusable payload');
  assert.equal(api.current.status, 'error');
  assert.match(api.current.error, /JSON-serializable/);
  cleanup();
  ok('a non-serializable value is rejected before any SQL is sent');
}

/** 8. Tenant guard: a foreign store id is refused. */
{
  const { client, calls } = createFakeClient({ owned: [SALON_ID], config: { bookingRules: INITIAL } });
  const { api, Probe } = createHarness();
  await mount(Probe, {
    initial: { ...INITIAL },
    options: { client, storeId: OTHER_SALON_ID, configKey: 'bookingRules', retryAttempts: 0 },
  });
  await act(async () => {
    api.current.updateField('minNotice', '2 hours');
  });
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 400); });
  assert.equal(calls.updates.length, 0, 'no write for a salon the session does not own');
  assert.equal(api.current.error, 'You do not have access to this salon.');
  assert.equal(api.current.status, 'error');
  cleanup();
  ok('cross-tenant store id is refused before any SQL is sent');
}

/** 9. Missing settings row: refused without a slug, created as a DRAFT with one. */
{
  const { client, calls } = createFakeClient({ config: null });
  const { api, Probe } = createHarness();
  await mount(Probe, {
    initial: { ...INITIAL },
    options: { client, configKey: 'bookingRules', retryAttempts: 0 },
  });
  await act(async () => { api.current.updateField('minNotice', '2 hours'); });
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 400); });
  assert.equal(calls.upserts.length, 0);
  assert.equal(api.current.error, 'Your salon website is not set up yet.');
  cleanup();
}
{
  const { client, calls } = createFakeClient({ config: null });
  const { api, Probe } = createHarness();
  await mount(Probe, {
    initial: { ...INITIAL },
    options: { client, configKey: 'bookingRules', slug: 'demo-salon' },
  });
  await act(async () => { api.current.updateField('minNotice', '2 hours'); });
  await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 400); });
  assert.equal(calls.upserts.length, 1, 'the missing row is created');
  const [{ row, options }] = calls.upserts;
  assert.equal(options.onConflict, 'salon_id');
  assert.equal(row.is_published, false, 'a created row is always a DRAFT');
  assert.equal(row.published_at, null);
  assert.equal(row.slug, 'demo-salon');
  assert.equal(row.config.bookingRules.minNotice, '2 hours');
  assert.equal(api.current.status, 'saved');
  cleanup();
  ok('missing row: refused without slug · created as a draft with one');
}

/** 10. `load` hydrates the store from the database on mount. */
{
  const stored = { minNotice: '3 hours', allowStaffSelection: false };
  const { client, calls } = createFakeClient({ config: { bookingRules: stored } });
  const { api, Probe } = createHarness();
  await mount(Probe, {
    initial: { ...INITIAL },
    options: { client, configKey: 'bookingRules', load: true },
  });
  await act(async () => { await sleep(150); });
  assert.equal(api.current.data.minNotice, '3 hours', 'stored settings are adopted');
  assert.equal(api.current.data.allowStaffSelection, false);
  assert.equal(calls.updates.length, 0, 'loading never writes');
  cleanup();
  ok('load:true hydrates from the canonical config without writing');
}

/** 11. The documented positional call style: useAutoSaveStore(initialData, storeId).
 *
 *  This one cannot inject a client (that is the point of the positional form),
 *  so the SHARED Supabase client is driven through a fetch bridge instead —
 *  the real HTTP layer, no network.
 */
{
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(typeof url === 'string' ? url : (url && url.url) || '');
    const headers = init.headers || {};
    const wantsObject = JSON.stringify(headers).includes('pgrst.object');
    if (target.includes('/rest/v1/rpc/owner_salon_ids')) {
      return new Response(JSON.stringify([SALON_ID]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (target.includes('/rest/v1/salon_public_websites')) {
      requests.push({ target, method: (init.method || 'GET').toUpperCase(), body: init.body });
      if ((init.method || 'GET').toUpperCase() === 'PATCH') {
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify(
          wantsObject
            ? { config: { bookingRules: INITIAL } }
            : [{ config: { bookingRules: INITIAL } }],
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const { api, Probe } = createHarness();
    // No `options` at all — only the positional store id, exactly as documented.
    await mount(Probe, { initial: { ...INITIAL }, storeId: SALON_ID });
    await act(async () => {
      api.current.updateField('minNotice', '2 hours');
    });
    await act(async () => { await sleep(STORE_AUTOSAVE_DEBOUNCE_MS + 450); });

    const patches = requests.filter((entry) => entry.method === 'PATCH');
    assert.ok(patches.length >= 1, 'the positional store id form saves');
    const last = patches[patches.length - 1];
    assert.ok(
      last.target.includes(`salon_id=eq.${SALON_ID}`),
      'the write is scoped to the positional salon id',
    );
    // No configKey here (the positional form passes none), so the patch merges
    // at the TOP level of the config and existing keys must survive.
    assert.equal(JSON.parse(last.body).config.minNotice, '2 hours', 'the edited field is written');
    assert.deepEqual(
      JSON.parse(last.body).config.bookingRules,
      INITIAL,
      'the rest of the config survives a top-level merge',
    );
    assert.equal(api.current.status, 'saved');
    cleanup();
    ok('documented call style useAutoSaveStore(initialData, storeId) works end-to-end');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** 12. The persistence layer itself: read + save with an injected client. */
{
  const { client, calls } = createFakeClient({ config: { bookingRules: { minNotice: '90 minutes' } } });
  const slice = await readStoreSettingsWithClient(client, { configKey: 'bookingRules' });
  assert.deepEqual(slice, { minNotice: '90 minutes' }, 'read returns the namespaced slice');

  const outcome = await saveStoreSettingsWithClient(client, { minNotice: '2 hours' }, {
    configKey: 'bookingRules',
  });
  assert.ok(!isStoreSettingsFailure(outcome), 'a valid save succeeds');
  assert.equal(outcome.storeId, SALON_ID);
  assert.equal(outcome.created, false);
  assert.equal(calls.updates.length, 1);
  cleanup();
  ok('readStoreSettings / saveStoreSettings work against the canonical row');
}

/* ------------------------------------------------------------------ */
/* 4. Wiring: the owner Settings panel                                  */
/* ------------------------------------------------------------------ */
section('Settings panel wiring');

const SettingsPanel = (await import('../src/components/dashboard/SettingsPanel.tsx')).default;
const { initialData } = await import('../src/types.ts');

{
  let central = { ...initialData };
  function Host() {
    const [data, setLocal] = React.useState(central);
    return React.createElement(SettingsPanel, {
      data,
      setData: (next) =>
        setLocal((previous) => {
          central = typeof next === 'function' ? next(previous) : next;
          return central;
        }),
      onNotify: () => {},
    });
  }

  const view = await act(async () => render(React.createElement(Host)));
  const input = view.container.querySelector('input[type="text"]');
  assert.ok(input, 'the booking-rules field renders');
  assert.equal(input.value, initialData.bookingRules.minNotice, 'seeded from the draft');

  // Type into the field. The debounce is 600 ms and we unmount immediately
  // after asserting, so no request is ever sent (the pending timer is
  // cancelled on unmount) — this test stays fully offline.
  const setValue = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value',
  ).set;
  await act(async () => {
    setValue.call(input, '2 hours');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });

  assert.equal(
    view.container.querySelector('input[type="text"]').value,
    '2 hours',
    'the store updates the field instantly',
  );
  assert.equal(
    central.bookingRules?.minNotice,
    '2 hours',
    'the edit is mirrored into the central edit state (live preview follows)',
  );
  assert.match(view.container.textContent, /Autosave on|Saving…|Saved ✓|Save failed/);
  cleanup();
  ok('settings panel: instant field + central-state propagation through the store');
}

/* ------------------------------------------------------------------ */
console.log(`\nCentral state + debounced auto-save store: ${passed}/${passed} passed`);
process.exit(0);
