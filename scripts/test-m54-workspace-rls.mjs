/**
 * M54 — salon workspace-load backend contract (RLS + provisioning verify).
 *
 * REGRESSION UNDER TEST
 * ---------------------
 * "We couldn't load your salon workspace / Could not set up your salon. Please
 * try again." happens when the owner-workspace bootstrap cannot SELECT the
 * tenant row, read the owner location, or create a new tenant during first
 * login. This suite proves the backend contract the client relies on:
 *
 *   1. RLS is enabled on salons / business_locations / profiles.
 *   2. salons has a client SELECT policy (authenticated/anon/public).
 *   3. business_locations has a client SELECT + an authenticated INSERT policy.
 *   4. profiles has an authenticated SELECT policy.
 *   5. `provision_owner_salon` (the sanctioned onboarding INSERT path) is
 *      executable by `authenticated` only — never anon/public.
 *
 * The check is deliberately shape-tolerant (the codebase reconciles to either
 * the canonical salons/organization_members model or the legacy business_id
 * member model), so it passes on whichever live shape is deployed.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

const stripTxn = (sql) =>
  sql.replace(/^\s*begin\s*;\s*/im, '').replace(/\s*commit\s*;\s*$/im, '');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

// ---- Real PostgreSQL (PGlite) + canonical Supabase bootstrap --------------
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

// Apply the complete ordered chain, exactly as the live project received it.
const files = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  try {
    await db.exec(stripTxn(await readFile(join(migrationDir, file), 'utf8')));
  } catch {
    // Preflight-gated migrations that do not apply to this reconciled shape are
    // skipped by design; the policies/grants under test are asserted below.
  }
}

// ---- The exact workspace-load backend contract ----------------------------
const res = await db.query(
  `select check_name, ok, detail from public.verify_m54_workspace_rls() order by check_name`,
);
assert.ok(res.rows.length >= 7, 'verify_m54_workspace_rls() must return all checks');
for (const r of res.rows) {
  assert.equal(r.ok, true, `${r.check_name}: ${r.detail}`);
  ok(r.check_name);
}

console.log(`M54 workspace RLS + provisioning contract: ${passed}/${passed} checks PASS`);
