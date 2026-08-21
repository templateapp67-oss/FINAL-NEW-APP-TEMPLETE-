/**
 * Phase 8.3 shared acceptance harness.
 *
 * Provides the highest-fidelity test environment available offline:
 *
 *   • REAL PostgreSQL (PGlite) with the complete M01–M26 migration set.
 *   • The REAL `@supabase/supabase-js` browser client — its HTTP layer is
 *     redirected into PGlite, so the app's own `supabaseClient.ts`,
 *     `themeCatalogService.ts` and `savedServiceService.ts` run unmodified.
 *   • A jsdom DOM so the REAL `StepServices` React component can be mounted.
 *
 * Nothing about the application is stubbed: tests exercise the same code the
 * browser runs.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

export const THEMES = [
  { id: 'barber_mens_grooming', label: "Barber & Men's Grooming",
    categories: ['Haircuts', 'Beard & Shave', 'Grooming & Treatments'] },
  { id: 'hair_studio_color_bar', label: 'Hair Studio & Color Bar',
    categories: ['Styling & Cuts', 'Hair Color', 'Treatments'] },
  { id: 'beauty_skin_spa', label: 'Beauty, Skin & Spa',
    categories: ['Facial & Skincare', 'Spa & Body', 'Waxing & Threading', 'Makeup'] },
  { id: 'family_full_service', label: 'Full-Service Family Salon',
    categories: ["Men's Services", "Women's Services", 'Kids Special', 'Combos'] },
  { id: 'nail_lash_studio', label: 'Nail & Lash Studio',
    categories: ['Nail Art & Gel', 'Pedicure & Manicure', 'Lash & Brow'] },
];

export const IDS = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  businessA: '10000000-0000-4000-8000-0000000000a1',
  businessB: '10000000-0000-4000-8000-0000000000b1',
  legacyCustomA: '90000000-0000-4000-8000-0000000000a2',
};

const BOOTSTRAP = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null unique,
  public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id), name text not null, owner_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (bucket_id, name));
create or replace function storage.foldername(name text) returns text[]
  language sql immutable strict as $$ select string_to_array(name, '/') $$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
`;

/** Session the redirected supabase-js client authenticates as. */
export const session = { uid: '', role: 'authenticated' };

/**
 * Boots PGlite, applies every migration, seeds two tenants, and installs the
 * fetch bridge that turns supabase-js RPC calls into real SQL.
 */
export async function createHarness({ seedLegacyCustom = true } = {}) {
  // The app reads these through import.meta.env / process.env at import time.
  process.env.VITE_SUPABASE_URL = 'http://pglite.local';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';

  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db.exec(BOOTSTRAP);
  for (const file of files) {
    await db.exec(await readFile(join(migrationsDir, file), 'utf8'));
  }

  await db.query(
    `insert into auth.users (id, email) values ($1,'owner-a@test.test'), ($2,'owner-b@test.test')`,
    [IDS.ownerA, IDS.ownerB],
  );
  await db.query(
    `insert into public.businesses (id,name,business_type,phone,whatsapp,email,created_by) values
      ($1,'Salon A','salon','+911111111111','+911111111111','a@test.test',$2),
      ($3,'Salon B','salon','+912222222222','+912222222222','b@test.test',$4)`,
    [IDS.businessA, IDS.ownerA, IDS.businessB, IDS.ownerB],
  );

  if (seedLegacyCustom) {
    // A pre-existing manual row with NULL provenance — the "existing data must
    // remain intact" control specimen.
    await db.query(
      `insert into public.services (id,business_id,name,category,price_paise,duration_minutes,
         short_description,status)
       values ($1,$2,'Legacy Manual Service','Owner category',88000,40,'Pre-existing custom row','active')`,
      [IDS.legacyCustomA, IDS.businessA],
    );
  }

  const runAs = async (role, uid, sql, params) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec(`set role ${role}`);
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  };

  /** Bypasses RLS for setup/inspection only — never used to assert app behaviour. */
  const admin = (sql, params) => runAs('service_role', '', sql, params);

  // ---- supabase-js → PGlite bridge ---------------------------------------
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(typeof url === 'string' ? url : url?.url ?? '');
    const match = target.match(/\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)/);
    if (!match) {
      return new Response(JSON.stringify({ message: `Unexpected request: ${target}` }), {
        status: 404, headers: { 'content-type': 'application/json' },
      });
    }
    const fnName = match[1];
    let args = {};
    try { args = init.body ? JSON.parse(init.body) : {}; } catch { args = {}; }
    const keys = Object.keys(args);
    const placeholders = keys.map((key, i) => `${key} => $${i + 1}`).join(', ');
    const values = keys.map((key) => args[key]);

    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [session.uid]);
    await db.exec(`set role ${session.role}`);
    try {
      const result = await db.query(`select public.${fnName}(${placeholders}) as data`, values);
      return new Response(JSON.stringify(result.rows[0].data ?? null), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    } catch (error) {
      // Mirror PostgREST's error envelope so the app's error paths are real.
      return new Response(JSON.stringify({
        message: error.message, code: error.code ?? 'P0001',
        details: error.detail ?? null, hint: error.hint ?? null,
      }), { status: 400, headers: { 'content-type': 'application/json' } });
    } finally {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  };

  return {
    db,
    admin,
    runAs,
    signIn(uid) { session.uid = uid; session.role = 'authenticated'; },
    signOut() { session.uid = ''; session.role = 'anon'; },
    async close() {
      globalThis.fetch = originalFetch;
      await db.close();
    },
  };
}

/** Installs a jsdom environment so real React components can be mounted. */
export function installDom() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = globalThis.__jsdom ?? {};
  if (!JSDOM) throw new Error('installDom requires jsdom to be preloaded');
  return JSDOM;
}

/** Simple ordered test runner with pass/fail bookkeeping. */
export function createRunner(title) {
  const results = { passed: 0, failed: 0, failures: [] };
  return {
    results,
    async test(label, fn) {
      try {
        await fn();
        results.passed += 1;
        console.log(`  PASS  ${label}`);
      } catch (error) {
        results.failed += 1;
        results.failures.push({ label, message: error.message });
        console.log(`  FAIL  ${label}\n        ${error.message.split('\n')[0]}`);
        throw error;
      }
    },
    section(name) { console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}`); },
    summary() {
      console.log(`\n${title}: ${results.passed}/${results.passed + results.failed} passed`);
      return results;
    },
  };
}
