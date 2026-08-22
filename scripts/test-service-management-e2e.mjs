/**
 * Phase 8.1 end-to-end service management test.
 *
 * Unlike the mock-client unit tests, this drives the REAL client service layer
 * (src/lib/savedServiceService.ts) against a REAL PostgreSQL instance (PGlite)
 * with the full M01–M22 migration set applied and the exact five-theme seed.
 *
 * A thin adapter maps supabase-js `.rpc(name, args)` onto SQL, so the exact
 * arguments the browser would send are executed by the real functions and the
 * real RLS/ownership rules.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { isHistoricalMigration } from './lib/migrationFiles.mjs';
import { fetchThemeServiceCatalog } from '../src/lib/themeCatalogService.ts';
import {
  createSavedServiceWithClient,
  deleteSavedServiceWithClient,
  loadSavedServicesForThemeWithClient,
  savePredefinedServicesWithClient,
  setSavedServiceActiveWithClient,
  setSavedServiceStatusWithClient,
  updateSavedServiceWithClient,
} from '../src/lib/savedServiceService.ts';

const THEMES = [
  { id: 'barber_mens_grooming', label: 'Barber' },
  { id: 'hair_studio_color_bar', label: 'Hair Studio' },
  { id: 'beauty_skin_spa', label: 'Beauty/Spa' },
  { id: 'family_full_service', label: 'Family' },
  { id: 'nail_lash_studio', label: 'Nail/Lash' },
];

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationsDir = join(root, 'supabase', 'migrations');
// Design-A history only (M01–M27). The Design-B chain (M28+) targets the
// salon-keyed canonical schema and its preflight rejects the business-keyed
// world this suite exercises — replaying it here would fail by design.
const migrationFiles = (await readdir(migrationsDir))
  .filter((n) => n.endsWith('.sql') && isHistoricalMigration(n))
  .sort();

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text, phone text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text not null unique, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null, owner_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);

for (const file of migrationFiles) {
  await db.exec(await readFile(join(migrationsDir, file), 'utf8'));
}

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  businessA: '10000000-0000-4000-8000-0000000000a1',
  businessB: '10000000-0000-4000-8000-0000000000b1',
  legacyCustomA: '90000000-0000-4000-8000-0000000000a2',
};

await db.query(
  `insert into auth.users (id, email) values ($1, 'owner-a@example.test'), ($2, 'owner-b@example.test')`,
  [ids.ownerA, ids.ownerB],
);
await db.query(
  `insert into public.businesses (id, name, business_type, phone, whatsapp, email, created_by) values
    ($1, 'Owner A Salon', 'salon', '+911111111111', '+911111111111', 'a@test.test', $2),
    ($3, 'Owner B Salon', 'salon', '+912222222222', '+912222222222', 'b@test.test', $4)`,
  [ids.businessA, ids.ownerA, ids.businessB, ids.ownerB],
);
// A pre-existing manual/legacy custom service with NULL provenance. It must
// survive every Phase 8.1 operation untouched.
await db.query(
  `insert into public.services (id, business_id, name, category, price_paise, duration_minutes,
     short_description, status)
   values ($1, $2, 'Legacy Manual Service', 'Owner category', 88000, 40, 'Pre-existing custom row', 'active')`,
  [ids.legacyCustomA, ids.businessA],
);

/** Signs in as a user for the duration of a callback. */
const currentUser = { id: '' };
const asUser = async (userId, run) => {
  const previous = currentUser.id;
  currentUser.id = userId;
  try {
    return await run();
  } finally {
    currentUser.id = previous;
  }
};

/**
 * Minimal supabase-js-compatible client backed by real PostgreSQL, executing
 * each RPC as the currently signed-in `authenticated` user (RLS enforced).
 */
const makeClient = () => ({
  rpc: async (name, args) => {
    const entries = Object.entries(args ?? {});
    const placeholders = entries.map(([key], i) => `${key} => $${i + 1}`).join(', ');
    const values = entries.map(([, value]) => value);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [currentUser.id]);
    await db.exec('set role authenticated');
    try {
      const result = await db.query(
        `select public.${name}(${placeholders}) as data`,
        values,
      );
      return { data: result.rows[0].data, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message } };
    } finally {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  },
});

const client = makeClient();

let passed = 0;
const test = async (label, run) => {
  await run();
  passed += 1;
  console.log(`PASS ${label}`);
};

const globalSnapshot = async () => {
  const result = await db.query(`
    select
      (select count(*)::int from public.themes) as themes,
      (select count(*)::int from public.service_categories) as categories,
      (select count(*)::int from public.predefined_services) as predefined,
      (select md5(string_agg(t.theme_id || t.name || t.is_active::text, '|' order by t.theme_id))
         from public.themes t) as theme_hash,
      (select md5(string_agg(c.id::text || c.name, '|' order by c.id))
         from public.service_categories c) as category_hash,
      (select md5(string_agg(p.id::text || p.name || coalesce(p.description, '') || p.is_active::text, '|' order by p.id))
         from public.predefined_services p) as predefined_hash
  `);
  return result.rows[0];
};

const beforeGlobal = await globalSnapshot();
const beforeLegacy = await db.query(
  `select name, category, price_paise, duration_minutes, short_description, status::text,
          theme_id, category_id, predefined_service_id
   from public.services where id = $1`,
  [ids.legacyCustomA],
);

// ---------------------------------------------------------------------------
// Per-theme full workflow
// ---------------------------------------------------------------------------
for (const theme of THEMES) {
  await test(`${theme.label} (${theme.id}) — full add/edit/status/delete workflow`, async () => {
    await asUser(ids.ownerA, async () => {
      // The UI reads its catalog through the same RPC boundary.
      const catalog = await fetchThemeServiceCatalog(client, theme.id);
      assert.equal(catalog.theme.themeId, theme.id);
      assert.ok(catalog.categories.length > 0);
      assert.ok(catalog.predefinedServices.length > 0);

      // --- Add Selected (suggested chips) --------------------------------
      const suggestedIds = catalog.suggestedServices.slice(0, 3).map((s) => s.id);
      const savedBatch = await savePredefinedServicesWithClient(client, theme.id, suggestedIds);
      assert.equal(savedBatch.insertedCount, suggestedIds.length);
      savedBatch.services.forEach((service) => {
        assert.equal(service.themeKey, theme.id);
        assert.ok(service.predefinedServiceId);
      });

      // --- ADD SERVICE (predefined-linked, not already saved) -------------
      const freshPredefined = catalog.predefinedServices.find(
        (service) => !suggestedIds.includes(service.id),
      );
      assert.ok(freshPredefined, `${theme.label}: expected a spare predefined service`);
      const addedLinked = await createSavedServiceWithClient(client, theme.id, {
        categoryId: freshPredefined.categoryId,
        name: freshPredefined.name,
        description: freshPredefined.description,
        price: freshPredefined.price,
        duration: freshPredefined.duration,
        predefinedServiceId: freshPredefined.id,
      });
      assert.equal(addedLinked.predefinedServiceId, freshPredefined.id);
      assert.equal(addedLinked.categoryId, freshPredefined.categoryId);
      assert.equal(addedLinked.themeKey, theme.id);
      assert.equal(addedLinked.status, 'active');

      // --- ADD SERVICE (Custom / Other → NULL provenance) -----------------
      const addedCustom = await createSavedServiceWithClient(client, theme.id, {
        categoryId: freshPredefined.categoryId,
        name: `${theme.label} House Special`,
        description: 'Our own signature treatment.',
        price: 1234.5,
        duration: 65,
      });
      assert.equal(addedCustom.predefinedServiceId, null,
        'Custom Service / Other must keep predefined_service_id NULL');
      assert.equal(addedCustom.price, 1234.5);
      assert.equal(addedCustom.duration, 65);

      // --- DUPLICATE PREVENTION -------------------------------------------
      await assert.rejects(
        () => createSavedServiceWithClient(client, theme.id, {
          categoryId: freshPredefined.categoryId,
          name: `${freshPredefined.name} (different label)`,
          description: '', price: 10, duration: 10,
          predefinedServiceId: freshPredefined.id,
        }),
        /already saved/i,
        'the same predefined service must not be saved twice',
      );
      await assert.rejects(
        () => createSavedServiceWithClient(client, theme.id, {
          categoryId: freshPredefined.categoryId,
          name: `${theme.label} HOUSE SPECIAL`,
          description: '', price: 10, duration: 10,
        }),
        /already saved/i,
        'a duplicate custom service name must be rejected',
      );
      // Re-running Add Selected inserts nothing new.
      const repeat = await savePredefinedServicesWithClient(client, theme.id, suggestedIds);
      assert.equal(repeat.insertedCount, 0);
      assert.equal(repeat.existingCount, suggestedIds.length);

      // --- Relationship baseline ------------------------------------------
      const relationOf = async (id) => (await db.query(
        `select business_id, theme_id, category_id, predefined_service_id
         from public.services where id = $1`, [id],
      )).rows[0];
      const linkedRelationBefore = await relationOf(addedLinked.id);
      const customRelationBefore = await relationOf(addedCustom.id);

      // --- UPDATE PRICE ----------------------------------------------------
      const priced = await updateSavedServiceWithClient(client, theme.id, addedLinked.id, { price: 2500 });
      assert.equal(priced.price, 2500);
      assert.equal(priced.name, freshPredefined.name);
      assert.equal(priced.duration, freshPredefined.duration);

      // --- UPDATE DURATION -------------------------------------------------
      const timed = await updateSavedServiceWithClient(client, theme.id, addedLinked.id, { duration: 105 });
      assert.equal(timed.duration, 105);
      assert.equal(timed.price, 2500, 'duration edit must not disturb price');

      // --- UPDATE DESCRIPTION ----------------------------------------------
      const described = await updateSavedServiceWithClient(client, theme.id, addedLinked.id, {
        description: 'Owner rewritten description.',
      });
      assert.equal(described.description, 'Owner rewritten description.');
      assert.equal(described.price, 2500);
      assert.equal(described.duration, 105);

      // --- EDIT SERVICE (all fields) ---------------------------------------
      const edited = await updateSavedServiceWithClient(client, theme.id, addedLinked.id, {
        name: `${freshPredefined.name} Deluxe`,
        description: 'Deluxe version.',
        price: 3100,
        duration: 90,
      });
      assert.equal(edited.name, `${freshPredefined.name} Deluxe`);

      // --- DEACTIVATE / ACTIVATE -------------------------------------------
      const off = await setSavedServiceActiveWithClient(client, theme.id, addedLinked.id, false);
      assert.equal(off.status, 'inactive');
      const on = await setSavedServiceActiveWithClient(client, theme.id, addedLinked.id, true);
      assert.equal(on.status, 'active');

      // --- CHANGE SERVICE STATUS -------------------------------------------
      for (const status of ['inactive', 'archived', 'active']) {
        const changed = await setSavedServiceStatusWithClient(client, theme.id, addedLinked.id, status);
        assert.equal(changed.status, status);
      }

      // --- RELATIONSHIPS SURVIVED EVERYTHING --------------------------------
      assert.deepEqual(await relationOf(addedLinked.id), linkedRelationBefore,
        'theme/category/predefined must not change on edit');
      assert.equal(edited.predefinedServiceId, freshPredefined.id);
      assert.equal(edited.categoryId, freshPredefined.categoryId);

      // Custom rows also keep their NULL provenance through the same edits.
      await updateSavedServiceWithClient(client, theme.id, addedCustom.id, { price: 777, duration: 20 });
      await setSavedServiceStatusWithClient(client, theme.id, addedCustom.id, 'inactive');
      const customAfter = await relationOf(addedCustom.id);
      assert.deepEqual(customAfter, customRelationBefore);
      assert.equal(customAfter.predefined_service_id, null,
        'a custom service must never be converted into a predefined service');

      // --- REFRESH ----------------------------------------------------------
      const reloaded = await loadSavedServicesForThemeWithClient(client, theme.id);
      const reloadedLinked = reloaded.find((s) => s.id === addedLinked.id);
      const reloadedCustom = reloaded.find((s) => s.id === addedCustom.id);
      assert.equal(reloadedLinked.name, `${freshPredefined.name} Deluxe`);
      assert.equal(reloadedLinked.predefinedServiceId, freshPredefined.id);
      assert.equal(reloadedCustom.predefinedServiceId, null);
      assert.equal(reloadedCustom.status, 'inactive');
      assert.equal(reloadedCustom.price, 777);
      // Reading twice never duplicates rows.
      const reloadedTwice = await loadSavedServicesForThemeWithClient(client, theme.id);
      assert.deepEqual(reloadedTwice, reloaded);

      // --- DELETE (salon row only) -------------------------------------------
      assert.equal(await deleteSavedServiceWithClient(client, addedLinked.id), addedLinked.id);
      assert.equal(await deleteSavedServiceWithClient(client, addedCustom.id), addedCustom.id);
      const afterDelete = await loadSavedServicesForThemeWithClient(client, theme.id);
      assert.equal(afterDelete.some((s) => s.id === addedLinked.id), false);
      assert.equal(afterDelete.some((s) => s.id === addedCustom.id), false);

      // The global predefined row is untouched and re-addable.
      const stillGlobal = await db.query(
        'select is_active from public.predefined_services where id = $1',
        [freshPredefined.id],
      );
      assert.equal(stillGlobal.rows[0].is_active, true);
      const readded = await createSavedServiceWithClient(client, theme.id, {
        categoryId: freshPredefined.categoryId,
        name: freshPredefined.name,
        description: freshPredefined.description,
        price: freshPredefined.price,
        duration: freshPredefined.duration,
        predefinedServiceId: freshPredefined.id,
      });
      assert.equal(readded.predefinedServiceId, freshPredefined.id);
    });
  });
}

await test('cross-tenant management is rejected for every theme', async () => {
  for (const theme of THEMES) {
    const ownerARow = await asUser(ids.ownerA, async () => {
      const rows = await loadSavedServicesForThemeWithClient(client, theme.id);
      assert.ok(rows.length > 0);
      return rows[0];
    });

    await asUser(ids.ownerB, async () => {
      await assert.rejects(
        () => updateSavedServiceWithClient(client, theme.id, ownerARow.id, { price: 1 }),
        /not found for your salon/i,
      );
      await assert.rejects(
        () => setSavedServiceStatusWithClient(client, theme.id, ownerARow.id, 'archived'),
        /not found for your salon/i,
      );
      await assert.rejects(
        () => deleteSavedServiceWithClient(client, ownerARow.id),
        /not found for your salon/i,
      );
    });

    // Owner A's data is unchanged after Owner B's attempts.
    await asUser(ids.ownerA, async () => {
      const rows = await loadSavedServicesForThemeWithClient(client, theme.id);
      assert.deepEqual(rows.find((row) => row.id === ownerARow.id), ownerARow);
    });
  }
});

await test('logged-out callers cannot read or manage any saved service', async () => {
  await asUser('', async () => {
    for (const method of [
      () => loadSavedServicesForThemeWithClient(client, THEMES[0].id),
      () => createSavedServiceWithClient(client, THEMES[0].id, {
        categoryId: '00000000-0000-4000-8000-000000000000',
        name: 'X', description: '', price: 1, duration: 1,
      }),
      () => deleteSavedServiceWithClient(client, '00000000-0000-4000-8000-000000000000'),
    ]) {
      await assert.rejects(method, /log in/i);
    }
  });
});

await test('global themes, categories and predefined services are never mutated', async () => {
  assert.deepEqual(await globalSnapshot(), beforeGlobal);
});

await test('pre-existing custom/legacy service rows are preserved untouched', async () => {
  const afterLegacy = await db.query(
    `select name, category, price_paise, duration_minutes, short_description, status::text,
            theme_id, category_id, predefined_service_id
     from public.services where id = $1`,
    [ids.legacyCustomA],
  );
  assert.deepEqual(afterLegacy.rows, beforeLegacy.rows);
  assert.equal(afterLegacy.rows[0].predefined_service_id, null);
});

console.log(`Service management E2E tests: ${passed}/${THEMES.length + 4} passed`);
assert.equal(passed, THEMES.length + 4);
await db.close();
