/**
 * PHASE 8.3 — FINAL 5-THEME ACCEPTANCE TEST (UI layer)
 *
 * Mounts the REAL `StepServices` React component in jsdom, wired to the REAL
 * supabase-js client over REAL PostgreSQL (M01–M24). Interactions are genuine
 * DOM clicks and typing — nothing about the component is mocked or stubbed.
 *
 * Verifies, per theme: correct UI, correct categories/suggested chips rendered,
 * zero-typing selection, name + description auto-fill, Select All, Add
 * Selected, and the Custom Service / Other flow. Then walks the full
 * Existing → 5 → 5 → Existing switch sequence asserting the rendered DOM never
 * shows another theme's data or stale state.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ---- DOM bootstrap (must happen before React/component imports) -----------
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
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createHarness, createRunner, IDS, THEMES } = await import('./lib/acceptance-harness.mjs');
const harness = await createHarness({ seedLegacyCustom: false });
const runner = createRunner('Phase 8.3 UI acceptance');

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent, within } = await import('@testing-library/react');
const StepServices = (await import('../src/screens/StepServices.tsx')).default;
const { initialData } = await import('../src/types.ts');
const { SUGGESTED_SERVICE_NAMES, THEME_CATEGORIES } = await import('../src/lib/themeServices.ts');

harness.signIn(IDS.ownerA);

/** Lets pending promises + state updates flush inside act(). */
const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 12)); });
  }
};

/** Mounts StepServices for a theme and returns live handles. */
const mountFor = async (themeId, seedServices = []) => {
  cleanup();
  const state = {
    data: { ...initialData, templateId: themeId, services: seedServices, packages: [] },
  };
  const Harness = () => {
    const [data, setData] = React.useState(state.data);
    state.data = data;
    state.setData = setData;
    return React.createElement(StepServices, {
      data, setData, onNext() {}, onPrev() {}, onSave() {},
    });
  };
  let utils;
  await act(async () => { utils = render(React.createElement(Harness)); });
  await settle();
  return { ...utils, state };
};

const bodyText = () => document.body.textContent ?? '';

/** The "MY SERVICES (n)" list section. */
const servicesSection = () => {
  const heading = [...document.querySelectorAll('h3')]
    .find((el) => /MY SERVICES/.test(el.textContent ?? ''));
  return heading?.parentElement ?? null;
};

/** Suggested chips are buttons inside the "Suggested for …" card. */
const suggestedChips = () => {
  const heading = [...document.querySelectorAll('h3')]
    .find((el) => /^Suggested for /.test(el.textContent ?? ''));
  const card = heading?.closest('div.bg-white');
  if (!card) return [];
  const addSelected = [...card.querySelectorAll('button')]
    .find((b) => /Add Selected/.test(b.textContent ?? ''));
  return [...card.querySelectorAll('button')].filter((button) => {
    const text = (button.textContent ?? '').trim();
    if (!text || button === addSelected) return false;
    if (/^(All|Select All|Deselect All)$/.test(text)) return false;
    // Category filter chips are rounded-full with text-xs; service chips text-sm.
    return button.className.includes('rounded-full') && button.className.includes('text-sm');
  });
};

const categoryFilterButtons = () => {
  const heading = [...document.querySelectorAll('h3')]
    .find((el) => /^Suggested for /.test(el.textContent ?? ''));
  const card = heading?.closest('div.bg-white');
  if (!card) return [];
  return [...card.querySelectorAll('button')].filter((button) =>
    button.className.includes('rounded-full') && button.className.includes('text-xs'));
};

const findButton = (pattern, root = document.body) =>
  [...root.querySelectorAll('button')].find((b) => pattern.test((b.textContent ?? '').trim()));

// ===========================================================================
// PART 1 — PER-THEME UI
// ===========================================================================
for (const theme of THEMES) {
  runner.section(`UI: ${theme.label}`);

  await runner.test(`${theme.label} — renders correct UI shell, categories and chips`, async () => {
    await mountFor(theme.id);

    // Screen identity.
    assert.ok(/What services do you offer\?/.test(bodyText()), 'missing screen heading');
    assert.ok(bodyText().includes(`Suggested for ${theme.label}`),
      `header must name the theme; got: ${bodyText().slice(0, 200)}`);

    // Category filter chips = this theme's categories (plus "All").
    const filters = categoryFilterButtons().map((b) => b.textContent.trim());
    assert.deepEqual(filters, ['All', ...theme.categories],
      `category filters wrong: ${JSON.stringify(filters)}`);

    // Suggested chips = exactly this theme's six labels.
    const chips = suggestedChips().map((b) => b.textContent.trim());
    assert.equal(chips.length, 6, `expected 6 chips, got ${chips.length}: ${JSON.stringify(chips)}`);
    assert.deepEqual(chips, SUGGESTED_SERVICE_NAMES[theme.id]);

    // No other theme's categories are rendered anywhere on screen.
    for (const other of THEMES.filter((t) => t.id !== theme.id)) {
      for (const category of other.categories) {
        if (theme.categories.includes(category)) continue;
        assert.equal(filters.includes(category), false,
          `foreign category "${category}" rendered`);
      }
    }

    // Empty-state copy is visible when the salon has no saved services.
    assert.ok(/No services yet/.test(bodyText()), 'empty state not shown');
    assert.ok(/MY SERVICES \(0\)/.test(bodyText()));
  });

  await runner.test(`${theme.label} — Select All + Add Selected saves via the real UI`, async () => {
    await mountFor(theme.id);

    const selectAll = findButton(/^Select All$/);
    assert.ok(selectAll, 'Select All button missing');
    await act(async () => { fireEvent.click(selectAll); });
    await settle(2);

    // The button flips to Deselect All and Add Selected reports the count.
    assert.ok(findButton(/^Deselect All$/), 'Select All did not toggle');
    const addSelected = findButton(/Add Selected \(6\)/);
    assert.ok(addSelected, `Add Selected should show 6; body: ${bodyText().match(/Add Selected \(\d+\)/)}`);

    await act(async () => { fireEvent.click(addSelected); });
    await settle(8);

    // All six now render in MY SERVICES, and the DB agrees.
    assert.ok(/MY SERVICES \(6\)/.test(bodyText()),
      `list did not update: ${bodyText().match(/MY SERVICES \(\d+\)/)}`);
    const rows = await harness.admin(
      `select count(*)::int c from public.services s
       join public.themes t on t.id = s.theme_id
       where s.business_id=$1 and t.theme_id=$2 and s.predefined_service_id is not null`,
      [IDS.businessA, theme.id]);
    assert.equal(rows.rows[0].c, 6);
    assert.equal(/No services yet/.test(bodyText()), false, 'empty state still visible');
  });

  await runner.test(`${theme.label} — zero-typing: chip → name + description auto-fill`, async () => {
    await mountFor(theme.id);

    // Open the Add Service form.
    const addService = findButton(/^Add Service$/);
    assert.ok(addService, 'Add Service button missing');
    await act(async () => { fireEvent.click(addService); });
    await settle(2);

    // Focus the combobox — the predefined list opens with ZERO typing.
    const nameInput = document.querySelector('input[placeholder^="Search "]');
    assert.ok(nameInput, 'service-name combobox missing');
    await act(async () => { fireEvent.focus(nameInput); });
    await settle(2);

    // Pick the first predefined option by clicking it — still no typing.
    const option = [...document.querySelectorAll('button')].find((button) =>
      button.className.includes('hover:bg-[#fff1f4]')
      && !/Other \/ Custom Service|Choose from predefined/.test(button.textContent ?? ''));
    assert.ok(option, 'no predefined option rendered in the dropdown');
    const optionName = option.querySelector('span')?.textContent?.trim();
    await act(async () => { fireEvent.click(option); });
    await settle(2);

    // Name auto-filled to the canonical catalogue name.
    assert.equal(nameInput.value, optionName, 'name did not auto-fill');

    // Description auto-filled from the catalogue (not blank, not generic).
    const description = document.querySelector('textarea');
    assert.ok(description, 'description field missing');
    assert.ok(description.value.trim().length > 0, 'description did not auto-fill');

    // Price + duration auto-filled with real values.
    const numbers = [...document.querySelectorAll('input[type="number"]')]
      .map((input) => Number(input.value));
    assert.ok(numbers.length >= 2);
    numbers.slice(0, 2).forEach((value) => assert.ok(value > 0, 'price/duration not auto-filled'));
  });

  await runner.test(`${theme.label} — Custom Service / Other saves with NULL provenance`, async () => {
    await mountFor(theme.id);
    await act(async () => { fireEvent.click(findButton(/^Add Service$/)); });
    await settle(2);

    const nameInput = document.querySelector('input[placeholder^="Search "]');
    await act(async () => { fireEvent.focus(nameInput); });
    await settle(2);

    const otherButton = findButton(/Other \/ Custom Service/);
    assert.ok(otherButton, '"Other / Custom Service" option missing');
    await act(async () => { fireEvent.click(otherButton); });
    await settle(2);

    // The form switches to custom mode.
    assert.ok(/Custom/.test(bodyText()), 'custom mode indicator missing');
    const customInput = document.querySelector('input[placeholder="Type your custom service name"]');
    assert.ok(customInput, 'custom name input missing');

    const customName = `UI Custom ${theme.id}`;
    await act(async () => { fireEvent.change(customInput, { target: { value: customName } }); });
    await settle(2);

    const save = findButton(/^Save Service$/);
    assert.ok(save, 'Save Service button missing');
    await act(async () => { fireEvent.click(save); });
    await settle(8);

    const row = await harness.admin(
      `select s.predefined_service_id, s.category_id, t.theme_id as theme_key
       from public.services s join public.themes t on t.id=s.theme_id
       where s.business_id=$1 and s.name=$2`, [IDS.businessA, customName]);
    assert.equal(row.rows.length, 1, 'custom service was not saved');
    assert.equal(row.rows[0].predefined_service_id, null,
      'Custom / Other must keep predefined_service_id NULL');
    assert.equal(row.rows[0].theme_key, theme.id);
    assert.ok(row.rows[0].category_id, 'custom service must still record its category');
    assert.ok(bodyText().includes(customName), 'custom service not rendered in the list');
  });

  await runner.test(`${theme.label} — saved rows render with price, duration and actions`, async () => {
    await mountFor(theme.id);
    const section = servicesSection();
    assert.ok(section, 'MY SERVICES section missing');
    const text = section.textContent ?? '';
    assert.ok(/₹[\d,]+/.test(text), 'price not rendered');
    assert.ok(/\d+ min/.test(text), 'duration not rendered');
    assert.ok(/25% advance at booking/.test(text), 'booking policy line missing');
    // Management affordances exist for saved rows.
    const titles = [...section.querySelectorAll('button')].map((b) => b.getAttribute('title'));
    assert.ok(titles.includes('Edit Service'), 'Edit action missing');
    assert.ok(titles.includes('Delete Service'), 'Delete action missing');
    assert.ok(titles.some((t) => t && /Deactivate Service|Activate Service/.test(t)),
      'Activate/Deactivate action missing');
  });
}

// ===========================================================================
// PART 2 — THEME SWITCHING IN THE RENDERED UI
// ===========================================================================
runner.section('UI THEME SWITCHING (Existing → 5 → 5 → Existing)');

const SWITCH_SEQUENCE = [
  'hair',
  'barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa',
  'family_full_service', 'nail_lash_studio',
  'barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa',
  'family_full_service', 'nail_lash_studio',
  'hair',
];

await runner.test('every switch renders only the new theme (no stale UI state)', async () => {
  let previous = null;

  for (const [index, themeId] of SWITCH_SEQUENCE.entries()) {
    const step = `step ${index + 1} (${themeId})`;
    const theme = THEMES.find((t) => t.id === themeId);
    const expectedCategories = theme ? theme.categories : THEME_CATEGORIES.hair;
    const expectedChips = SUGGESTED_SERVICE_NAMES[themeId];

    // Remount as the app does on a theme change (fresh component state).
    await mountFor(themeId);

    const filters = categoryFilterButtons().map((b) => b.textContent.trim());
    assert.deepEqual(filters, ['All', ...expectedCategories], `${step}: wrong categories`);

    const chips = suggestedChips().map((b) => b.textContent.trim());
    assert.deepEqual(chips, expectedChips, `${step}: wrong suggested chips`);

    // No selection carried over: Add Selected is back to (0) and disabled.
    const addSelected = findButton(/Add Selected \(\d+\)/);
    assert.ok(/Add Selected \(0\)/.test(addSelected.textContent),
      `${step}: a previous selection persisted — ${addSelected.textContent}`);
    assert.equal(addSelected.disabled, true, `${step}: Add Selected should be disabled`);

    // Filter chip resets to "All".
    const allChip = categoryFilterButtons()[0];
    assert.ok(allChip.className.includes('bg-[#ffd9e1]'),
      `${step}: category filter did not reset to All`);

    // The Add Service form is closed after a switch.
    assert.equal(document.querySelector('input[placeholder^="Search "]'), null,
      `${step}: add-service form stayed open`);

    // Nothing from the previous theme is on screen.
    if (previous && previous.themeId !== themeId) {
      for (const category of previous.categories) {
        if (expectedCategories.includes(category)) continue;
        assert.equal(filters.includes(category), false,
          `${step}: stale category "${category}" from ${previous.themeId}`);
      }
      for (const chip of previous.chips) {
        if (expectedChips.includes(chip)) continue;
        assert.equal(chips.includes(chip), false,
          `${step}: stale chip "${chip}" from ${previous.themeId}`);
      }
    }

    // The saved list only ever shows this theme's rows.
    if (theme) {
      const dbRows = await harness.admin(
        `select s.name from public.services s
         join public.themes t on t.id=s.theme_id
         where s.business_id=$1 and t.theme_id=$2`, [IDS.businessA, themeId]);
      const listed = servicesSection()?.textContent ?? '';
      const shown = (listed.match(/MY SERVICES \((\d+)\)/) ?? [])[1];
      assert.equal(Number(shown), dbRows.rows.length,
        `${step}: list count ${shown} != database ${dbRows.rows.length}`);
    } else {
      // Existing theme has no database services and starts clean.
      assert.ok(/MY SERVICES \(0\)/.test(bodyText()), `${step}: Existing theme should start empty`);
    }

    previous = { themeId, categories: expectedCategories, chips: expectedChips };
  }
});

await runner.test('Existing theme keeps its local (non-database) behaviour', async () => {
  const local = [{
    id: 'local-1', name: 'Existing Local Service', category: 'Haircut',
    description: 'Held in memory only.', price: 500, duration: 40,
  }];
  await mountFor('hair', local);

  // Local rows render immediately — the DB guard must not hide them.
  assert.ok(bodyText().includes('Existing Local Service'),
    'Existing theme lost its local service');
  assert.ok(/MY SERVICES \(1\)/.test(bodyText()));

  // Its own suggested chips are shown, not a database theme's.
  const chips = suggestedChips().map((b) => b.textContent.trim());
  assert.deepEqual(chips, SUGGESTED_SERVICE_NAMES.hair);

  // Nothing was written to the database for this theme.
  const rows = await harness.admin(
    `select count(*)::int c from public.services where business_id=$1 and name=$2`,
    [IDS.businessA, 'Existing Local Service']);
  assert.equal(rows.rows[0].c, 0, 'Existing theme must not persist to the database');
});

await runner.test('a returning visit re-hydrates saved services from the database', async () => {
  // Simulate refresh: mount with EMPTY local state and stale rows from another theme.
  const stale = [{
    id: 'stale-1', name: 'STALE FROM ANOTHER THEME', category: 'Nope',
    description: 'should never render', price: 1, duration: 1,
  }];
  await mountFor('barber_mens_grooming', stale);

  // The stale localStorage-style row is cleared, never rendered.
  assert.equal(bodyText().includes('STALE FROM ANOTHER THEME'), false,
    'a stale local row survived the database hydrate');

  const dbRows = await harness.admin(
    `select count(*)::int c from public.services s
     join public.themes t on t.id=s.theme_id
     where s.business_id=$1 and t.theme_id='barber_mens_grooming'`, [IDS.businessA]);
  assert.ok(/MY SERVICES \((\d+)\)/.test(bodyText()));
  const shown = Number(bodyText().match(/MY SERVICES \((\d+)\)/)[1]);
  assert.equal(shown, dbRows.rows[0].c, 'refresh did not restore the saved services');
  assert.ok(shown > 0, 'expected saved services to exist after earlier tests');
});

cleanup();
const results = runner.summary();
await harness.close();
dom.window.close();

// jsdom + the `motion` animation loop and PGlite's worker MessagePort keep
// handles referenced after the suite finishes, so Node will not exit on its
// own. Everything above has already completed and been asserted, so exit
// explicitly with the real result code.
process.exit(results.failed > 0 ? 1 : 0);
