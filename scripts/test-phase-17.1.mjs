/**
 * PHASE 17.1 — SALON OWNER DASHBOARD · FOUNDATION acceptance.
 *
 * Verifies ONLY what 17.1 promises:
 *   - Ownership resolves through the EXISTING organization model
 *     (organization_members role='owner' → salons.organization_id) and never
 *     through `job_salon_members`.
 *   - The owner sees only their OWN salon; no salon id can be injected.
 *   - The dashboard structure exists for Overview, Today's Appointments,
 *     Upcoming Appointments, Customers, Revenue/Payments, Calendar and
 *     Notifications, with working navigation (sidebar / rail / pills / drawer).
 *   - Loading, empty, error(+retry) and unauthorized states.
 *   - English/Hindi and Light/Dark.
 *   - No invented salon ids, bookings, customers, amounts or counts.
 *   - Phase 10–16 surfaces are untouched.
 *
 * NOT covered here (later phases): appointment lists, customer management,
 * revenue calculations, calendar logic, notifications.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  matches: false, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');

const OwnerDashboard = (await import('../src/components/OwnerDashboard.tsx')).default;
const {
  OWNER_DASHBOARD_SECTION_IDS,
  OWNER_DASHBOARD_SECTIONS,
  OWNER_DASHBOARD_SECTION_KEY,
  OWNER_SALON_SUMMARY_COLUMNS,
  DEFAULT_OWNER_DASHBOARD_SECTION,
  isOwnerDashboardSection,
  normalizeOwnerDashboardSection,
  ownerDashboardSection,
  mapOwnerSalonResolution,
  ownerDashboardCanView,
  ownerDashboardDeniedKey,
  ownerDashboardCanRetry,
  mapOwnerSalonRow,
  ownerSalonDisplayName,
  ownerSalonLocationLine,
  readStoredOwnerDashboardSection,
  persistOwnerDashboardSection,
  loadOwnerDashboardContext,
} = await import('../src/lib/ownerDashboard.ts');
const { ownerDashboardText, ownerDashboardTranslator } = await import('../src/lib/ownerDashboardI18n.ts');
const { setSiteAppearance, setSiteLocale } = await import('../src/lib/siteNavigation.ts');
const { OWNER_SALON_IDS_FN, ORG_MEMBERS_TABLE, SALON_TABLE_NAME } = await import('../src/lib/ownerSalon.ts');
const { setSupabaseConfiguredForTests } = await import('../src/lib/bookingManagement.ts');

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
    console.error(`  ✗ ${name}\n    ${String(error.message).split('\n').join('\n    ')}`);
  }
}
function section(title) {
  console.log(`\n■ ${title}`);
}

const OWNER_DASHBOARD_SRC = fs.readFileSync('src/components/OwnerDashboard.tsx', 'utf8');
const OWNER_DASHBOARD_LIB = fs.readFileSync('src/lib/ownerDashboard.ts', 'utf8');
const OWNER_DASHBOARD_I18N = fs.readFileSync('src/lib/ownerDashboardI18n.ts', 'utf8');
const OWNER_SALON_SRC = fs.readFileSync('src/lib/ownerSalon.ts', 'utf8');
const APP_SRC = fs.readFileSync('src/App.tsx', 'utf8');
const TOPBAR_SRC = fs.readFileSync('src/components/TopBar.tsx', 'utf8');
const LANDING_SRC = fs.readFileSync('src/screens/Landing.tsx', 'utf8');

const SALON = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Resolved Salon',
  slug: 'resolved-salon',
  address: '12 MG Road',
  city: 'Kota',
  isActive: true,
};

function contextLoader(context, { delay = 0 } = {}) {
  return () =>
    new Promise((resolve) => {
      if (delay === 0) resolve(context);
      else setTimeout(() => resolve(context), delay);
    });
}

async function renderDashboard(loader) {
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerDashboard, { loadContext: loader }));
  });
  await act(async () => { await Promise.resolve(); });
  return utils;
}

function resetState() {
  cleanup();
  window.localStorage.clear();
  // Online mode: the Phase 17.1 dev preview otherwise fabricates bookings for
  // an unconfigured Supabase, hiding the real empty/foreign-tenant behavior
  // the later suites assert on.
  setSupabaseConfiguredForTests(true);
  setSiteLocale('en');
  setSiteAppearance('light');
}

/* ================================================================== */
section('1 · Ownership model — existing organization_members → salons');

await test('ownerSalon.ts documents the auth.users → organization_members → salons chain', () => {
  assert.match(OWNER_SALON_SRC, /organization_members/);
  assert.match(OWNER_SALON_SRC, /salons\.organization_id/);
  assert.equal(ORG_MEMBERS_TABLE, 'organization_members');
  assert.equal(SALON_TABLE_NAME, 'salons');
  // M28/M38 canonicalize the ownership helper as public.owner_salon_ids()
  // (with public.nexora_owner_salon_ids() as a delegating alias).
  assert.equal(OWNER_SALON_IDS_FN, 'owner_salon_ids');
});

await test('the dashboard reuses resolveOwnerSalonId and defines no second ownership rule', () => {
  assert.match(OWNER_DASHBOARD_LIB, /resolveOwnerSalonId/);
  assert.ok(!/\.from\(\s*['"]organization_members['"]/.test(OWNER_DASHBOARD_LIB),
    'dashboard must not re-implement the membership query');
});

await test('job_salon_members is never used for ownership anywhere in the dashboard', () => {
  // It may only ever appear inside a comment explaining why it is excluded.
  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [label, src] of [
    ['ownerDashboard.ts', OWNER_DASHBOARD_LIB],
    ['OwnerDashboard.tsx', OWNER_DASHBOARD_SRC],
    ['ownerSalon.ts', OWNER_SALON_SRC],
  ]) {
    assert.ok(!stripComments(src).includes('job_salon_members'),
      `${label} must not reference job_salon_members in executable code`);
  }
  for (const src of [OWNER_DASHBOARD_LIB, OWNER_DASHBOARD_SRC, OWNER_SALON_SRC]) {
    assert.ok(!src.includes(".from('job_salon_members')"), 'job_salon_members must never be queried');
    assert.ok(!src.includes('.rpc(\'job_salon_members'), 'no job_salon_members rpc');
  }
});

await test('no salon id is hardcoded or accepted as input by the dashboard', () => {
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(OWNER_DASHBOARD_LIB),
    'no uuid literal in the data layer');
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(OWNER_DASHBOARD_SRC),
    'no uuid literal in the component');
  assert.ok(!/salonId\s*:/.test(OWNER_DASHBOARD_SRC.split('interface Props')[1].split('}')[0] || ''),
    'the component must not take a salonId prop');
});

await test('App.tsx mounts OwnerDashboard without passing any salon identity', () => {
  assert.match(APP_SRC, /<OwnerDashboard\s*\/>/);
});

await test('salon read uses only existing, verified public.salons columns', () => {
  // `organization_id` joined the projection in 17.2 (existing tenant column,
  // already used by the ownership chain) — still no invented column.
  assert.equal(
    OWNER_SALON_SUMMARY_COLUMNS,
    'id, organization_id, name, slug, address, city, is_active',
  );
  for (const bad of ['location_latitude', 'location_longitude', 'revenue', 'appointments_count']) {
    assert.ok(!OWNER_SALON_SUMMARY_COLUMNS.includes(bad), `${bad} must not be requested`);
  }
});

await test('no migration or DDL is introduced by phase 17.1', () => {
  for (const src of [OWNER_DASHBOARD_LIB, OWNER_DASHBOARD_SRC]) {
    assert.ok(!/create\s+table|alter\s+table|drop\s+table/i.test(src));
  }
  const migrations = fs.readdirSync('supabase/migrations');
  // M28 is the pre-existing Phase 1a foundation (canonical salons ownership),
  // not a migration introduced by Phase 17.1 — only flag phase-named files.
  assert.ok(!migrations.some((f) => /17[._-]1/i.test(f)), 'no new migration file');
});

/* ================================================================== */
section('2 · Access states map from the existing resolution');

const RESOLUTION_CASES = [
  ['resolved', 'authorized', true, null],
  ['not-configured', 'not-configured', false, 'denied.notConfigured'],
  ['not-authenticated', 'not-authenticated', false, 'denied.login'],
  ['no-membership', 'no-ownership', false, 'denied.noSalon'],
  ['ambiguous', 'ambiguous', false, 'denied.ambiguous'],
  ['permission-denied', 'permission-denied', false, 'denied.permission'],
  ['error', 'error', false, 'denied.error'],
];

for (const [status, access, canView, deniedKey] of RESOLUTION_CASES) {
  await test(`resolution '${status}' → access '${access}'`, () => {
    const mapped = mapOwnerSalonResolution({ status });
    assert.equal(mapped, access);
    assert.equal(ownerDashboardCanView(mapped), canView);
    assert.equal(ownerDashboardDeniedKey(mapped), deniedKey);
  });
}

await test('a missing resolution is an error, never an authorization', () => {
  assert.equal(mapOwnerSalonResolution(null), 'error');
  assert.equal(ownerDashboardCanView('error'), false);
  assert.equal(ownerDashboardCanView('loading'), false);
});

await test('retry is offered only for transient failures', () => {
  assert.equal(ownerDashboardCanRetry('error'), true);
  assert.equal(ownerDashboardCanRetry('permission-denied'), true);
  assert.equal(ownerDashboardCanRetry('not-authenticated'), false);
  assert.equal(ownerDashboardCanRetry('no-ownership'), false);
  assert.equal(ownerDashboardCanRetry('ambiguous'), false);
});

await test('loadOwnerDashboardContext refuses a fake salon when Supabase is unconfigured', async () => {
  setSupabaseConfiguredForTests(null);
  const context = await loadOwnerDashboardContext();
  assert.equal(context.access, 'not-configured');
  assert.equal(context.salon, null);
  setSupabaseConfiguredForTests(true);
});

/* ================================================================== */
section('3 · Section registry (structure only)');

await test('all seven required sections exist in canonical order', () => {
  assert.deepEqual([...OWNER_DASHBOARD_SECTION_IDS], [
    'overview', 'today', 'upcoming', 'customers', 'revenue', 'calendar', 'notifications',
  ]);
  assert.equal(OWNER_DASHBOARD_SECTIONS.length, 7);
  assert.deepEqual(OWNER_DASHBOARD_SECTIONS.map((s) => s.id), [...OWNER_DASHBOARD_SECTION_IDS]);
});

await test('every section carries label/title/description i18n keys that resolve', () => {
  for (const s of OWNER_DASHBOARD_SECTIONS) {
    for (const key of [s.labelKey, s.titleKey, s.descriptionKey]) {
      const en = ownerDashboardText('en', key);
      const hi = ownerDashboardText('hi', key);
      assert.ok(en && en !== key, `EN copy missing for ${key}`);
      assert.ok(hi && hi !== key, `HI copy missing for ${key}`);
    }
  }
});

await test('section normalization rejects unknown values', () => {
  assert.equal(isOwnerDashboardSection('revenue'), true);
  assert.equal(isOwnerDashboardSection('payments'), false);
  assert.equal(normalizeOwnerDashboardSection('nope'), DEFAULT_OWNER_DASHBOARD_SECTION);
  assert.equal(normalizeOwnerDashboardSection(undefined), 'overview');
  assert.equal(ownerDashboardSection('calendar').id, 'calendar');
  assert.equal(ownerDashboardSection('bogus').id, 'overview');
});

await test('the remembered section is a UI preference only, never identity', () => {
  window.localStorage.clear();
  assert.equal(readStoredOwnerDashboardSection(), 'overview');
  persistOwnerDashboardSection('customers');
  assert.equal(window.localStorage.getItem(OWNER_DASHBOARD_SECTION_KEY), 'customers');
  assert.equal(readStoredOwnerDashboardSection(), 'customers');
  window.localStorage.setItem(OWNER_DASHBOARD_SECTION_KEY, 'other-salon');
  assert.equal(readStoredOwnerDashboardSection(), 'overview');
  window.localStorage.clear();
});

await test('17.1 implements no appointment / customer / revenue / calendar logic', () => {
  const combined = OWNER_DASHBOARD_LIB + OWNER_DASHBOARD_SRC;
  for (const forbidden of [
    'readSalonBookings', 'bookingMoney', 'totalRevenue', 'reduce((sum',
    'appointments.filter', 'customers.map(',
  ]) {
    assert.ok(!combined.includes(forbidden), `${forbidden} belongs to a later phase`);
  }
});

/* ================================================================== */
section('4 · Rendering: authorized owner sees only their own salon');

await test('salon row mapping trims and never fabricates values', () => {
  const mapped = mapOwnerSalonRow({
    id: 'x', name: '  Glow Studio  ', slug: '', address: null, city: 'Kota', is_active: false,
  });
  assert.equal(mapped.name, 'Glow Studio');
  assert.equal(mapped.slug, null);
  assert.equal(mapped.address, null);
  assert.equal(mapped.city, 'Kota');
  assert.equal(mapped.isActive, false);
  assert.equal(ownerSalonDisplayName(null), null);
  assert.equal(ownerSalonLocationLine(mapped), 'Kota');
  assert.equal(ownerSalonLocationLine({ ...mapped, city: null }), null);
});

await test('authorized: header shows the resolved salon name and location', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-access'), 'authorized');
  assert.equal(utils.getByTestId('owner-dashboard-salon-name').textContent, 'Resolved Salon');
  assert.equal(utils.getByTestId('owner-dashboard-salon-location').textContent, '12 MG Road, Kota');
  cleanup();
});

await test('authorized: overview shows real salon fields only, with no invented data', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  const card = utils.getByTestId('owner-dashboard-salon-card').textContent;
  assert.ok(card.includes('Resolved Salon'));
  assert.ok(card.includes('resolved-salon'));
  assert.ok(!/₹|\d+\s*(bookings|customers|appointments)/i.test(card), 'no fabricated business facts');
  cleanup();
});

await test('missing salon fields render "Not added yet" instead of placeholders', async () => {
  resetState();
  const bare = { id: 'b', name: null, slug: null, address: null, city: null, isActive: false };
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: bare }));
  const card = utils.getByTestId('owner-dashboard-salon-card').textContent;
  assert.ok(card.includes('Not added yet'));
  assert.equal(utils.getByTestId('owner-dashboard-salon-name').textContent, 'Your salon');
  cleanup();
});

await test('unauthorized viewers receive no salon data at all', async () => {
  resetState();
  for (const access of ['not-authenticated', 'no-ownership', 'ambiguous', 'permission-denied']) {
    const utils = await renderDashboard(contextLoader({ access, salon: null }));
    const text = utils.getByTestId('owner-dashboard').textContent;
    assert.ok(!text.includes('Resolved Salon'), `${access} must not leak a salon name`);
    assert.ok(!text.includes('resolved-salon'));
    assert.ok(utils.queryByTestId('owner-dashboard-salon-card') === null);
    cleanup();
  }
});

/* ================================================================== */
section('5 · Navigation across all seven sections');

await test('desktop sidebar exposes every section and switches content', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  for (const id of OWNER_DASHBOARD_SECTION_IDS) {
    assert.ok(utils.getByTestId(`owner-nav-${id}`), `sidebar missing ${id}`);
  }
  // All seven dashboard sections now have their phased implementations.
  const IMPLEMENTED = ['overview', 'today', 'upcoming', 'customers', 'revenue', 'calendar', 'notifications'];
  for (const id of OWNER_DASHBOARD_SECTION_IDS.filter((s) => !IMPLEMENTED.includes(s))) {
    await act(async () => { fireEvent.click(utils.getByTestId(`owner-nav-${id}`)); });
    assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-section'), id);
    assert.ok(utils.getByTestId(`owner-dashboard-placeholder-${id}`), `${id} body missing`);
  }
  for (const id of ['today', 'upcoming', 'customers', 'revenue', 'calendar', 'notifications']) {
    await act(async () => { fireEvent.click(utils.getByTestId(`owner-nav-${id}`)); });
    assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-section'), id);
  }
  await act(async () => { fireEvent.click(utils.getByTestId('owner-nav-overview')); });
  assert.ok(utils.getByTestId('owner-dashboard-overview'));
  cleanup();
});

await test('tablet icon rail exposes every section with accessible labels', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  for (const s of OWNER_DASHBOARD_SECTIONS) {
    const button = utils.getByTestId(`owner-rail-${s.id}`);
    assert.equal(button.getAttribute('title'), ownerDashboardText('en', s.labelKey));
    assert.ok(button.textContent.includes(ownerDashboardText('en', s.labelKey)), 'sr-only label present');
  }
  cleanup();
});

await test('mobile pills switch sections', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  await act(async () => { fireEvent.click(utils.getByTestId('owner-pill-revenue')); });
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-section'), 'revenue');
  cleanup();
});

await test('mobile drawer opens, navigates and closes', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  assert.equal(utils.queryByTestId('owner-dashboard-drawer'), null);
  await act(async () => { fireEvent.click(utils.getByTestId('owner-dashboard-menu-button')); });
  assert.ok(utils.getByTestId('owner-dashboard-drawer'));
  await act(async () => { fireEvent.click(utils.getByTestId('owner-drawer-customers')); });
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-section'), 'customers');
  assert.equal(utils.queryByTestId('owner-dashboard-drawer'), null, 'drawer closes after navigation');
  cleanup();
});

await test('overview section cards jump to their section', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  await act(async () => { fireEvent.click(utils.getByTestId('owner-dashboard-card-calendar')); });
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-section'), 'calendar');
  cleanup();
});

await test('the active section is marked for assistive tech', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  assert.equal(utils.getByTestId('owner-nav-overview').getAttribute('aria-current'), 'page');
  assert.equal(utils.getByTestId('owner-nav-today').getAttribute('aria-current'), null);
  cleanup();
});

await test('the chosen section survives a remount', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  await act(async () => { fireEvent.click(utils.getByTestId('owner-nav-upcoming')); });
  cleanup();
  const again = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  assert.equal(again.getByTestId('owner-dashboard').getAttribute('data-section'), 'upcoming');
  cleanup();
  window.localStorage.clear();
});

/* ================================================================== */
section('6 · Loading / error / empty / unauthorized states');

await test('loading state renders skeletons while the session resolves', async () => {
  resetState();
  let utils;
  await act(async () => {
    utils = render(React.createElement(OwnerDashboard, {
      loadContext: contextLoader({ access: 'authorized', salon: SALON }, { delay: 40 }),
    }));
  });
  assert.ok(utils.getByTestId('owner-dashboard-loading'));
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-access'), 'loading');
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  assert.equal(utils.queryByTestId('owner-dashboard-loading'), null);
  cleanup();
});

await test('error state offers retry and recovers', async () => {
  resetState();
  let calls = 0;
  const loader = () => {
    calls += 1;
    return Promise.resolve(calls === 1 ? { access: 'error', salon: null } : { access: 'authorized', salon: SALON });
  };
  const utils = await renderDashboard(loader);
  assert.ok(utils.getByTestId('owner-dashboard-denied'));
  await act(async () => { fireEvent.click(utils.getByTestId('owner-dashboard-denied-retry')); });
  await act(async () => { await Promise.resolve(); });
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-access'), 'authorized');
  cleanup();
});

await test('a rejected loader degrades to the error state, never a crash', async () => {
  resetState();
  const utils = await renderDashboard(() => Promise.reject(new Error('network')));
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-access'), 'error');
  assert.ok(utils.getByTestId('owner-dashboard-denied'));
  cleanup();
});

await test('authorized-but-missing-salon renders the error card with retry', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: null }));
  assert.ok(utils.getByTestId('owner-dashboard-error'));
  assert.ok(utils.getByTestId('owner-dashboard-retry'));
  cleanup();
});

await test('unauthorized states show a refusal card with the right message', async () => {
  resetState();
  const expectations = [
    ['not-authenticated', 'denied.login'],
    ['no-ownership', 'denied.noSalon'],
    ['ambiguous', 'denied.ambiguous'],
    ['permission-denied', 'denied.permission'],
    ['not-configured', 'denied.notConfigured'],
  ];
  for (const [access, key] of expectations) {
    const utils = await renderDashboard(contextLoader({ access, salon: null }));
    const card = utils.getByTestId('owner-dashboard-denied');
    assert.equal(card.getAttribute('role'), 'alert');
    assert.ok(card.textContent.includes(ownerDashboardText('en', key)), `${access} message`);
    cleanup();
  }
});

await test('refusals never expose SQL, table names or database internals', () => {
  for (const key of ['denied.login', 'denied.noSalon', 'denied.ambiguous', 'denied.permission', 'denied.notConfigured', 'denied.error']) {
    for (const locale of ['en', 'hi']) {
      const text = ownerDashboardText(locale, key);
      assert.ok(!/select |organization_members|salons\.|42501|PGRST/i.test(text), `${key}/${locale} leaks internals`);
    }
  }
});

await test('an empty-state component exists for later data sections', () => {
  assert.match(OWNER_DASHBOARD_SRC, /owner-dashboard-empty/);
  assert.ok(ownerDashboardText('en', 'state.empty.title'));
  assert.ok(ownerDashboardText('hi', 'state.empty.body'));
});

/* ================================================================== */
section('7 · English / Hindi');

await test('every EN key has a Hindi translation and vice versa', () => {
  const enKeys = [...OWNER_DASHBOARD_I18N.matchAll(/^\s{2}'([\w.]+)':/gm)].map((m) => m[1]);
  const unique = [...new Set(enKeys)];
  assert.ok(unique.length >= 40, `expected a full copy table, got ${unique.length}`);
  for (const key of unique) {
    const en = ownerDashboardText('en', key);
    const hi = ownerDashboardText('hi', key);
    assert.ok(en && en !== key, `missing EN for ${key}`);
    assert.ok(hi && hi !== key, `missing HI for ${key}`);
  }
});

await test('Hindi copy is actually Devanagari for user-facing section labels', () => {
  for (const s of OWNER_DASHBOARD_SECTIONS) {
    const hi = ownerDashboardText('hi', s.labelKey);
    assert.match(hi, /[\u0900-\u097F]/, `${s.labelKey} is not translated`);
  }
});

await test('switching to Hindi repaints the dashboard chrome', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  assert.ok(utils.getByTestId('owner-nav-today').textContent.includes("Today's Appointments"));
  await act(async () => { fireEvent.click(utils.getByTestId('owner-dashboard-locale-hi')); });
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-locale'), 'hi');
  assert.ok(utils.getByTestId('owner-nav-today').textContent.includes('आज की अपॉइंटमेंट'));
  setSiteLocale('en');
  cleanup();
});

await test('Hindi refusal copy renders for unauthorized owners', async () => {
  resetState();
  setSiteLocale('hi');
  const utils = await renderDashboard(contextLoader({ access: 'no-ownership', salon: null }));
  assert.ok(utils.getByTestId('owner-dashboard-denied').textContent.includes(ownerDashboardText('hi', 'denied.noSalon')));
  setSiteLocale('en');
  cleanup();
});

await test('the translator helper falls back to English, never to a raw key', () => {
  const t = ownerDashboardTranslator('hi');
  assert.equal(t('shell.title'), ownerDashboardText('hi', 'shell.title'));
  assert.equal(ownerDashboardText('hi', 'totally.unknown'), 'totally.unknown');
});

/* ================================================================== */
section('8 · Light / Dark mode');

await test('dark mode changes the dashboard surface colours', async () => {
  resetState();
  const lightUtils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  const lightBg = lightUtils.getByTestId('owner-dashboard').style.backgroundColor;
  const lightHeader = lightUtils.getByTestId('owner-dashboard-header').style.backgroundColor;
  cleanup();

  setSiteAppearance('dark');
  const darkUtils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  assert.equal(darkUtils.getByTestId('owner-dashboard').getAttribute('data-appearance'), 'dark');
  assert.notEqual(darkUtils.getByTestId('owner-dashboard').style.backgroundColor, lightBg);
  assert.notEqual(darkUtils.getByTestId('owner-dashboard-header').style.backgroundColor, lightHeader);
  setSiteAppearance('light');
  cleanup();
});

await test('the appearance toggle flips the mode in place', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-appearance'), 'light');
  await act(async () => { fireEvent.click(utils.getByTestId('owner-dashboard-appearance-toggle')); });
  assert.equal(utils.getByTestId('owner-dashboard').getAttribute('data-appearance'), 'dark');
  setSiteAppearance('light');
  cleanup();
});

await test('dark mode also applies to the unauthorized card', async () => {
  resetState();
  const light = await renderDashboard(contextLoader({ access: 'no-ownership', salon: null }));
  const lightBg = light.getByTestId('owner-dashboard-denied').style.backgroundColor;
  cleanup();
  setSiteAppearance('dark');
  const dark = await renderDashboard(contextLoader({ access: 'no-ownership', salon: null }));
  assert.notEqual(dark.getByTestId('owner-dashboard-denied').style.backgroundColor, lightBg);
  setSiteAppearance('light');
  cleanup();
});

/* ================================================================== */
section('9 · Responsive: desktop / tablet / mobile');

await test('desktop sidebar, tablet rail and mobile chrome all exist', async () => {
  resetState();
  const utils = await renderDashboard(contextLoader({ access: 'authorized', salon: SALON }));
  const sidebar = utils.getByTestId('owner-dashboard-sidebar');
  const cls = sidebar.className;
  assert.ok(cls.includes('hidden') && cls.includes('md:flex'), 'sidebar hidden on mobile');
  assert.ok(cls.includes('md:w-16') && cls.includes('lg:w-60'), 'tablet rail + desktop sidebar widths');
  assert.ok(utils.getByTestId('owner-dashboard-mobile-pills').className.includes('md:hidden'));
  assert.ok(utils.getByTestId('owner-dashboard-menu-button').className.includes('md:hidden'));
  cleanup();
});

await test('content column scrolls independently and stays within a max width', () => {
  assert.match(OWNER_DASHBOARD_SRC, /overflow-y-auto/);
  assert.match(OWNER_DASHBOARD_SRC, /max-w-6xl/);
  assert.match(OWNER_DASHBOARD_SRC, /grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3/);
});

/* ================================================================== */
section('10 · No duplicate dashboard system · Phases 10–16 preserved');

await test('exactly one owner dashboard shell exists', () => {
  const dashboardFiles = fs.readdirSync('src/components')
    .filter((f) => /dashboard/i.test(f));
  assert.ok(dashboardFiles.includes('OwnerDashboard.tsx'));
  assert.ok(dashboardFiles.includes('OwnerDashboardFilters.tsx'), '17.9 shared filter child missing');
  assert.equal(dashboardFiles.filter((f) => f === 'OwnerDashboard.tsx').length, 1);
});

await test('the existing post-launch dashboard (screens 18–25) is untouched', () => {
  for (const tab of ['overview', 'website', 'bookings', 'payments', 'share', 'settings', 'referral', 'branding']) {
    assert.ok(LANDING_SRC.includes(`'${tab}'`), `dashboard tab ${tab} missing from Landing`);
  }
  assert.match(LANDING_SRC, /BookingManagementPanel/);
  assert.match(APP_SRC, /forcedActiveTab=\{dashboardTab as any\}/);
});

await test('phase 14.6 / 15.6 / 16.7 owner panels still mount through the same chain', () => {
  assert.match(fs.readFileSync('src/screens/StepPhotos.tsx', 'utf8'), /GalleryModerationPanel/);
  assert.match(fs.readFileSync('src/screens/StepSocials.tsx', 'utf8'), /VideoManagementPanel/);
  assert.match(LANDING_SRC, /resolveOwnerSalonId/);
});

await test('the owner dashboard is reachable through the existing app chrome', () => {
  assert.match(APP_SRC, /activeModule === 'owner-dashboard'/);
  assert.match(TOPBAR_SRC, /26 — Salon Owner Dashboard/);
  assert.match(TOPBAR_SRC, /topbar-owner-dashboard-btn/);
});

await test('the app still binds 0.0.0.0 with open CORS and permissive hosts', () => {
  const vite = fs.readFileSync('vite.config.ts', 'utf8');
  assert.match(vite, /host: '0\.0\.0\.0'/);
  assert.match(vite, /allowedHosts: true/);
  assert.match(vite, /cors: true/);
});

/* ================================================================== */
console.log('\n────────────────────────────────────────');
console.log(`Phase 17.1 owner dashboard foundation: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('Foundation verified: existing organization_members → salons ownership (no job_salon_members), own-salon-only data, 7-section structure + navigation, loading/empty/error/unauthorized states, EN/HI, light/dark, desktop/tablet/mobile, no duplicate dashboard, no schema changes.');
}
