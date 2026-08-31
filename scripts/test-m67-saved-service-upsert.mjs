/**
 * M67 — saved-service upsert / revive-on-soft-delete migration test.
 *
 * Replays the canonical Design-B chain (M28–M67) on PGlite and verifies the
 * fix for the bug report "This service is already saved for your salon":
 *
 *   1. verify_m67_saved_service_upsert() is fully green.
 *   2. Adding a service that was ARCHIVED (soft-deleted, deleted_at IS NOT
 *      NULL) no longer errors — create_saved_service revives the same row
 *      in place (deleted_at = null, is_active = true, submitted values
 *      applied) instead of throwing "already saved".
 *   3. save_predefined_services ("Add Selected") revives archived rows too,
 *      counting them as existing and never leaving duplicate visible rows.
 *   4. Genuine duplicates are still rejected: a LIVE row for the same
 *      predefined link or the same normalized custom name keeps the readable
 *      "already saved" errors; custom names can never hijack a
 *      predefined-linked row.
 *   5. Revive is tenant-scoped: another owner's re-add touches only their own
 *      salon row; anon/guest writes stay rejected.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

const CHAIN = [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
  '20260821000501_m32_phase2_canonical_foundation.sql',
  '20260821000601_m33_phase2a_hardening.sql',
  '20260821000701_m34_phase2b_final_hardening.sql',
  '20260821000801_m35_phase2c_canonical_theme_slugs.sql',
  '20260821000901_m36_phase3a_auth_profiles_roles.sql',
  '20260821001001_m37_phase3b_multitenant_rls.sql',
  '20260822000101_m38_reconciliation_fix.sql',
  '20260822000201_m39_owner_publish_website.sql',
  '20260822000301_m40_service_catalog_commerce_rpc.sql',
  '20260831000201_m67_saved_service_upsert_revive.sql',
];

const sqlOf = async (file) => readFile(join(migrationDir, file), 'utf8');

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
};

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

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
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
  $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    owner_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;
`);

// Live-like canonical base tables required by the M28 fail-closed preflight.
await db.exec(`
  create table public.profiles (
    id uuid primary key references auth.users(id),
    full_name text not null default 'User',
    platform_role text not null default 'customer',
    is_active boolean not null default true,
    avatar_url text,
    phone text,
    email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null);
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    role text,
    status text default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.salons (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    name text not null,
    slug text,
    address text,
    city text,
    is_active boolean not null default true,
    deleted_at timestamptz
  );
  create table public.services (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null,
    name text not null,
    description text,
    price_paise bigint not null,
    duration_minutes integer not null
  );
  create table public.staff (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id),
    is_active boolean not null default true
  );
  create table public.salon_hours (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id)
  );
  create table public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null unique references public.salons(id),
    slug text not null unique,
    template_key text not null default 'modern-salon',
    config jsonb not null default '{}'::jsonb,
    is_published boolean not null default false,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.bookings (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null,
    customer_id uuid not null,
    appointment_start timestamptz not null,
    status text not null default 'pending',
    total_amount_paise bigint not null default 0,
    advance_amount_paise bigint not null default 0,
    created_at timestamptz not null default now()
  );
  grant select on public.profiles, public.salons, public.services, public.staff,
    public.salon_hours, public.bookings
    to authenticated, service_role;
`);

for (const file of CHAIN) {
  try {
    await db.exec(await sqlOf(file));
  } catch (error) {
    throw new Error(`${file} failed: ${error.message}`, { cause: error });
  }
}
ok('M28–M67 chain applies cleanly on the live-like base');

const verify = (await db.query('select check_name, ok, detail from public.verify_m67_saved_service_upsert()')).rows;
const failed = verify.filter((r) => r.ok !== true);
assert.deepEqual(failed, [], `verify_m67_saved_service_upsert() failed: ${JSON.stringify(failed)}`);
ok(`verify_m67_saved_service_upsert() is fully green (${verify.length} checks)`);

// --- Two owners, two salons, two orgs. ---
await db.query(
  `insert into auth.users (id, email, raw_user_meta_data) values
     ($1, 'a@test', '{"signup_role":"business_user"}'::jsonb),
     ($2, 'b@test', '{"signup_role":"business_user"}'::jsonb)`,
  [ids.ownerA, ids.ownerB],
);
await db.query(
  `insert into public.organizations (id, name) values ($1, 'Org A'), ($2, 'Org B')`,
  [ids.orgA, ids.orgB],
);
await db.query(
  `insert into public.organization_members (organization_id, user_id, role) values
     ($1, $2, 'owner'), ($3, $4, 'owner')`,
  [ids.orgA, ids.ownerA, ids.orgB, ids.ownerB],
);
await db.query(
  `insert into public.salons (id, organization_id, name) values ($1, $2, 'Glow Studio'), ($3, $4, 'Other Studio')`,
  [ids.salonA, ids.orgA, ids.salonB, ids.orgB],
);
ok('owner fixtures ready (2 owners, 2 salons)');

const setRole = async (role, userId = '') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  await db.exec(`set role ${role}`);
};
const resetRole = async () => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.query("select set_config('request.jwt.claim.role', '', false)");
};
const asRole = async (role, userId, callback) => {
  await setRole(role, userId);
  try {
    return await callback();
  } finally {
    await resetRole();
  }
};
const mustReject = async (label, sqlFn, pattern) => {
  let caught;
  try {
    await sqlFn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label}: expected an error`);
  assert.match(String(caught.message), pattern, label);
};

const catalog = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_theme_service_catalog('beauty_skin_spa') as payload`)
))).rows[0].payload;
const goldFacial = catalog.predefined_services.find((s) => s.name === 'Anti-Aging Gold Facial');
const facialCategory = catalog.categories.find((c) => c.name === 'Facial & Skincare');
assert.ok(goldFacial && facialCategory, 'seed rows expected');

// --- 1. Baseline: create + genuine duplicates are still rejected. ---
const created = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.create_saved_service(
       'beauty_skin_spa', $1, 'Anti-Aging Gold Facial', 'Luxury gold facial.', 240000, 60, $2, 'active'
     ) as payload`,
    [facialCategory.id, goldFacial.id],
  )
))).rows[0].payload;
assert.equal(created.status, 'active');

await asRole('authenticated', ids.ownerA, async () => {
  await mustReject('live predefined duplicate',
    () => db.query(
      `select public.create_saved_service('beauty_skin_spa', $1, 'Any other label', '', 1, 10, $2, 'active')`,
      [facialCategory.id, goldFacial.id],
    ),
    /already saved/i);
  await mustReject('live custom name duplicate',
    () => db.query(
      `select public.create_saved_service('beauty_skin_spa', $1, 'anti-aging gold facial', '', 1, 10, null, 'active')`,
      [facialCategory.id],
    ),
    /already saved/i);
});
ok('genuine duplicates (live predefined link / live custom name) are still rejected');

// --- 2. Re-add after archive: the RPC revives the same row. ---
const archived = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.set_saved_service_status($1, 'archived') as payload`, [created.id])
))).rows[0].payload;
assert.equal(archived.status, 'archived');

const revived = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.create_saved_service(
       'beauty_skin_spa', $1, 'Anti-Aging Gold Facial', 'Re-added.', 245000, 65, $2, 'active'
     ) as payload`,
    [facialCategory.id, goldFacial.id],
  )
))).rows[0].payload;
assert.equal(revived.id, created.id, 're-add must revive the archived row id, not insert a copy');
assert.equal(revived.status, 'active');
assert.equal(revived.price_paise, 245000);
assert.equal(revived.duration_minutes, 65);
assert.equal(revived.predefined_service_id, goldFacial.id);
const rowCount = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select count(*)::int as n from public.services
     where salon_id = $1 and predefined_service_id = $2`,
    [ids.salonA, goldFacial.id],
  )
))).rows[0].n;
assert.equal(rowCount, 1, 'revive must not leave duplicate rows');
ok('archived predefined service re-added: same row revived, no error, no duplicate');

// --- 3. Custom service re-add after archive revives the same row. ---
const custom = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.create_saved_service(
       'beauty_skin_spa', $1, 'Owner Custom Glow', '', 99000, 45, null, 'active'
     ) as payload`,
    [facialCategory.id],
  )
))).rows[0].payload;
assert.equal(custom.predefined_service_id, null);
await asRole('authenticated', ids.ownerA, async () => {
  await db.query(`select public.set_saved_service_status($1, 'archived')`, [custom.id]);
});
const revivedCustom = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.create_saved_service(
       'beauty_skin_spa', $1, 'owner custom glow', 'Re-added custom.', 100000, 50, null, 'active'
     ) as payload`,
    [facialCategory.id],
  )
))).rows[0].payload;
assert.equal(revivedCustom.id, custom.id, 'custom re-add must revive the archived row');
assert.equal(revivedCustom.status, 'active');
assert.equal(revivedCustom.predefined_service_id, null);
assert.equal(revivedCustom.price_paise, 100000);
ok('archived custom service re-added: same row revived, provenance stays NULL');

// --- 4. Custom name cannot hijack a live predefined-linked row. ---
await asRole('authenticated', ids.ownerA, async () => {
  await mustReject('custom name colliding with live predefined-linked row',
    () => db.query(
      `select public.create_saved_service(
         'beauty_skin_spa', $1, 'anti-aging gold facial', '', 1, 10, null, 'active'
       )`,
      [facialCategory.id],
    ),
    /already saved/i);
});
ok('custom names can never rewrite a predefined-linked row');

// --- 5. Add Selected (save_predefined_services) revives archived rows. ---
await asRole('authenticated', ids.ownerA, async () => {
  await db.query(`select public.set_saved_service_status($1, 'archived')`, [revived.id]);
});
const batch = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.save_predefined_services('beauty_skin_spa', array[$1::uuid]) as payload`,
    [goldFacial.id],
  )
))).rows[0].payload;
assert.equal(batch.inserted_count, 0, 'revived rows count as existing, not inserted');
assert.equal(batch.existing_count, 1);
assert.equal(batch.services.length, 1);
assert.equal(batch.services[0].id, revived.id, 'Add Selected must revive the archived row id');
assert.equal(batch.services[0].status, 'active');
const afterBatch = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select count(*)::int as n from public.services
     where salon_id = $1 and predefined_service_id = $2`,
    [ids.salonA, goldFacial.id],
  )
))).rows[0].n;
assert.equal(afterBatch, 1, 'Add Selected after archive must not duplicate rows');
ok('Add Selected revives archived suggested services (inserted 0, one row)');

// --- 6. Revive is tenant-scoped; re-add by another salon is its own row. ---
await asRole('authenticated', ids.ownerA, async () => {
  await db.query(`select public.set_saved_service_status($1, 'archived')`, [revived.id]);
});
const ownerBRow = (await asRole('authenticated', ids.ownerB, async () => (
  await db.query(
    `select public.create_saved_service(
       'beauty_skin_spa', $1, 'Anti-Aging Gold Facial', 'B copy.', 240000, 60, $2, 'active'
     ) as payload`,
    [facialCategory.id, goldFacial.id],
  )
))).rows[0].payload;
assert.equal(ownerBRow.business_id, ids.salonB, 'owner B gets their own salon row');
assert.notEqual(ownerBRow.id, revived.id);
const ownerARows = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select count(*)::int as n from public.services
     where salon_id = $1 and predefined_service_id = $2`,
    [ids.salonA, goldFacial.id],
  )
))).rows[0].n;
assert.equal(ownerARows, 1, 'owner A still has exactly one row (archived)');
const ownerARowStatus = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.nexora_saved_service_payload($1) as payload`, [revived.id])
))).rows[0].payload.status;
assert.equal(ownerARowStatus, 'archived', "owner B's re-add must not revive owner A's row");
ok('re-add is tenant-scoped: owner B gets their own row; owner A state untouched');

// --- 7. anon/guest writes stay rejected. ---
await asRole('anon', '', async () => {
  await mustReject('anon re-add',
    () => db.query(
      `select public.create_saved_service(
         'beauty_skin_spa', $1, 'Hack', '', 100, 10, null, 'active'
       )`,
      [facialCategory.id],
    ),
    /log in|permission denied/i);
});
ok('anonymous re-add attempts are still rejected');

// Cleanup rows added by this suite.
await asRole('authenticated', ids.ownerA, async () => {
  await db.query(`select public.delete_saved_service($1)`, [revivedCustom.id]);
});
await asRole('authenticated', ids.ownerB, async () => {
  await db.query(`select public.delete_saved_service($1)`, [ownerBRow.id]);
});

console.log(`\nM67 saved-service upsert suite: ${passed} passed`);
