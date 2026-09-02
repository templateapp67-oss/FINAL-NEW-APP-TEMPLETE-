/**
 * PHASE 2 — Database & Content Auto-Initialization (M71).
 *
 * Verifies against a real PostgreSQL (PGlite) + the full migration chain:
 *   1. `seed_demo_salon_content('nexora-demo-salon')` auto-seeds sample
 *      content for a salon with none: 6 active services, 2 combo packages,
 *      7 business hours, 4 video feeds, 6 gallery media — each keyed to the
 *      tenant (adaptive salon_id/business_id).
 *   2. Re-running is IDEMPOTENT — nothing is duplicated.
 *   3. A salon that already has some content is NOT overwritten ("if not
 *      present").
 *   4. RLS is enabled on the seeded content tables; guests (anon) can read
 *      active public content.
 *   5. Razorpay 25% advance is enforced: authoritative booking RPC exists and
 *      `booking_settings.advance_percent = 25` CHECK is present.
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
const stripTxn = (sql) => sql.replace(/^\s*begin\s*;\s*/im, '').replace(/\s*commit\s*;\s*$/im, '');

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, phone text, raw_user_meta_data jsonb not null default '{}'::jsonb, aud text, role text, created_at timestamptz default now());
`);
const files = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  try { await db.exec(stripTxn(await readFile(join(migrationDir, file), 'utf8'))); }
  catch { /* preflight-gated migrations skipped by design */ }
}

const q = async (sql, params) => (await db.query(sql, params)).rows;
// Fixtures + seeding run as the table owner (postgres superuser) — the same
// privilege a migration-time seed has. RLS role checks are exercised only for
// the anon read assertion below.
const asOwner = async (sql, params) => (await db.query(sql, params)).rows;
// Adaptive tenant helpers: live column + value for a table & salon.
const tenantCol = async (table) => (await q(`select private.phase2_tenant_column($1) as c`, [table]))[0].c;
const tenantVal = async (salon, table) => (await q(`select private.phase2_tenant_value($1::uuid, $2) as v`, [salon, table]))[0].v;
const countFor = async (salon, table) => {
  const c = await tenantCol(table);
  const v = await tenantVal(salon, table);
  return (await q(`select count(*)::int as n from public.${table} where ${c} = $1`, [v]))[0].n;
};
const hoursTable = () =>
  q(`select case when to_regclass('public.business_hours') is not null then 'business_hours' else 'salon_hours' end as t`).then((r) => r[0].t);

// ---- Fixtures ----
const orgA = '11111111-1111-4111-8111-111111111111';
const salDemo = '22222222-2222-4222-8222-222222222222';
const salFilled = '33333333-3333-4333-8333-333333333333';
const bizFilled = '44444444-4444-4444-8444-444444444444';
const profile = '55555555-5555-4555-8555-555555555555';

await asOwner(`insert into public.organizations (id, name) values ($1, 'Demo Org')`, [orgA]);
await asOwner(
  `insert into public.salons (id, organization_id, slug, name, is_active) values
   ($1, $3, 'nexora-demo-salon', 'Nexora Demo Salon', true),
   ($2, $3, 'filled-salon', 'Filled Salon', true)`,
  [salDemo, salFilled, orgA],
);
// profiles.id references auth.users(id) — create the user first, then the
// profile (required by businesses.created_by FK).
await asOwner(`insert into auth.users (id, email, phone) values ($1, 'owner@demo.test', '+910000000000')`, [profile]);
await asOwner(`insert into public.profiles (id, full_name, mobile, email) values ($1, 'Demo Owner', '+910000000000', 'owner@demo.test')`, [profile]);
// Demo business (name matches the demo salon) + a "filled" business.
await asOwner(
  `insert into public.businesses (id, name, business_type, phone, created_by) values
   ($1, 'Nexora Demo Salon', 'salon', '+91 9000000000', $3),
   ($2, 'Filled Salon', 'salon', '+91 9111111111', $3)`,
  [salDemo, bizFilled, profile],
);
ok('fixtures ready');

const HT = await hoursTable();

// ---------- 1. Seed the demo salon ----------
let r = await asOwner(`select public.seed_demo_salon_content('nexora-demo-salon') as out`);
const summary = r[0].out;
assert.equal(summary.salon_id, salDemo, 'seeder addressed the demo salon');
assert.equal(summary.seeded.services, 6, `services seeded: ${JSON.stringify(summary)}`);
assert.equal(summary.seeded.packages, 2, 'packages seeded');
assert.equal(summary.seeded.social_videos, 4, 'video feeds seeded');
assert.equal(summary.seeded.business_media, 6, 'gallery media seeded');
assert.equal(summary.seeded.business_hours ?? summary.seeded.salon_hours, 7, 'hours seeded');
ok('seed_demo_salon_content seeded services/packages/hours/videos/media');

assert.equal(await countFor(salDemo, 'services'), 6, 'services count');
assert.equal(await countFor(salDemo, 'packages'), 2, 'packages count');
assert.equal(await countFor(salDemo, 'social_videos'), 4, 'videos count');
assert.equal(await countFor(salDemo, HT), 7, 'hours count');
assert.equal(await countFor(salDemo, 'business_media'), 6, 'media count');
ok('exact seeded counts confirmed against the live tenant');

const tcolSvc = await tenantCol('services');
const tvalSvc = await tenantVal(salDemo, 'services');
const actN = (await q(`select count(*)::int as n from public.services where ${tcolSvc} = $1 and status = 'active'`, [tvalSvc]))[0].n;
assert.equal(actN, 6, 'all seeded services are active');
ok('seeded services are all status=active');

// ---------- 2. Idempotency ----------
await asOwner(`select public.seed_demo_salon_content('nexora-demo-salon') as out`);
assert.equal(await countFor(salDemo, 'services'), 6, 'services not duplicated');
assert.equal(await countFor(salDemo, 'packages'), 2, 'packages not duplicated');
assert.equal(await countFor(salDemo, 'social_videos'), 4, 'videos not duplicated');
assert.equal(await countFor(salDemo, HT), 7, 'hours not duplicated');
assert.equal(await countFor(salDemo, 'business_media'), 6, 'media not duplicated');
ok('idempotent: re-running seeds nothing new');

// ---------- 3. Existing content is respected ----------
const filledTenantCol = await tenantCol('services');
const filledTenant = filledTenantCol === 'salon_id' ? salFilled : bizFilled;
await asOwner(
  `insert into public.services (${filledTenantCol}, name, category, price_paise, duration_minutes, status, display_order)
   values ($1, 'Owner Service', 'Cut', 10000, 30, 'active', 1)`,
  [filledTenant],
);
await asOwner(`select public.auto_seed_salon_content($1::uuid) as out`, [salFilled]);
const filledSvc = (await q(`select count(*)::int as n from public.services where ${filledTenantCol} = $1`, [filledTenant]))[0].n;
assert.equal(filledSvc, 1, 'existing owner service preserved (no overwrite, no dup)');
ok('auto-seed respects existing content (no overwrite)');

// ---------- 4. RLS enabled + anon read ----------
const rlsOn = (await q(`
  select bool_and(relrowsecurity) as on
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relname in ('services','packages','${HT}','social_videos','business_media') and c.relkind='r'
`))[0].on;
assert.equal(rlsOn, true, 'RLS enabled on all seeded content tables');
ok('RLS enabled on services/packages/hours/videos/media');

await db.exec('set role anon');
const anonSees = (await db.query(`select count(*)::int as n from public.services where status = 'active'`)).rows[0].n;
await db.exec('reset role');
assert.ok(anonSees >= 6, `anon can read public services (saw ${anonSees})`);
ok('guests (anon) can read active public services');

// ---------- 5. Payment gateway (25% advance) ----------
const verify = await q(`select check_name, ok from public.verify_phase2_auto_init()`);
const byName = Object.fromEntries(verify.map((v) => [v.check_name, v.ok]));
assert.equal(byName['create_authoritative_customer_booking (25% advance)'], true, '25% advance RPC exists');
assert.equal(byName['booking_settings.advance_percent = 25 CHECK'], true, '25% advance CHECK exists');
assert.equal(byName['RLS enabled on services/packages/hours/videos/media'], true, 'RLS verified');
assert.equal(byName['auto_seed_salon_content + seed_demo_salon_content'], true, 'seeder verified');
ok('verify_phase2_auto_init: 25% advance + RLS + seeder all ok');

// The 25% advance is configured via the immutable booking_settings CHECK:
// `booking_settings_fixed_advance check (advance_percent = 25.00)`.
const cdef = (await q(`select pg_get_constraintdef(c.oid) as d from pg_constraint c
  where c.conrelid='public.booking_settings'::regclass and c.conname='booking_settings_fixed_advance'`))[0];
assert.ok(cdef && /advance_percent\s*=\s*25/i.test(cdef.d), `25% CHECK present: ${cdef?.d}`);
ok('Razorpay 25% advance locked at 25.00 by booking_settings CHECK');

// ---------- 6. AUTOMATIC backfill: a demo salon present before M71 applies ----------
{
  const db2 = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db2.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, phone text, raw_user_meta_data jsonb not null default '{}'::jsonb, aud text, role text, created_at timestamptz default now());
  `);
  // Apply every migration EXCEPT M71, then create a demo salon, then apply M71
  // so its automatic backfill must seed the salon with no manual call.
  const m71File = files.find((f) => f.includes('m71'));
  for (const file of files) {
    if (file === m71File) continue;
    try { await db2.exec(stripTxn(await readFile(join(migrationDir, file), 'utf8'))); } catch {}
  }
  await db2.query(`insert into public.organizations (id, name) values ($1, 'Org')`, [orgA]);
  await db2.query(`insert into public.salons (id, organization_id, slug, name, is_active) values ($1, $2, 'nexora-demo-salon', 'Nexora Demo Salon', true)`, [salDemo, orgA]);
  await db2.query(`insert into auth.users (id, email, phone) values ($1, 'o@t.test', '+910000000000')`, [profile]);
  await db2.query(`insert into public.profiles (id, full_name, mobile, email) values ($1, 'Demo Owner', '+910000000000', 'o@t.test')`, [profile]);
  await db2.query(`insert into public.businesses (id, name, business_type, phone, created_by) values ($1, 'Nexora Demo Salon', 'salon', '+91 9000000000', $2)`, [salDemo, profile]);
  // Apply M71 last.
  await db2.exec(stripTxn(await readFile(join(migrationDir, m71File), 'utf8')));
  const tcol = (await db2.query(`select private.phase2_tenant_column('services') as c`)).rows[0].c;
  const tval = (await db2.query(`select private.phase2_tenant_value($1::uuid, 'services') as v`, [salDemo])).rows[0].v;
  const autoSvc = (await db2.query(`select count(*)::int as n from public.services where ${tcol} = $1`, [tval])).rows[0].n;
  const autoVids = (await db2.query(`select count(*)::int as n from public.social_videos where ${tcol} = $1`, [tval])).rows[0].n;
  assert.equal(autoSvc, 6, `automatic backfill seeded services (got ${autoSvc})`);
  assert.equal(autoVids, 4, 'automatic backfill seeded video feeds');
  ok('M71 automatically seeded an existing demo salon on apply (no manual call)');
  await db2.close();
}

console.log(`\n────────────────────────────────────────`);
console.log(`Phase 2 auto-initialization: ${passed} checks passed`);
process.exit(0);
