import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import {
  SERVICES_BY_THEME,
  SUGGESTED_SERVICE_ALIASES,
  SUGGESTED_SERVICE_NAMES,
  THEME_CATEGORIES,
  THEME_LABELS,
} from '../src/lib/themeServices.ts';
import { isHistoricalMigration } from './lib/migrationFiles.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationsDir = join(root, 'supabase', 'migrations');
const migrationFiles = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();

const historicalMigrationFiles = migrationFiles.filter(isHistoricalMigration);
const phase1aMigrationFiles = migrationFiles.filter((name) => name.includes('_phase1a_'));
const phase2MigrationFiles = migrationFiles.filter((name) => name.includes('_phase2_') && !name.includes('_phase2a_') && !name.includes('_phase2b_') && !name.includes('_phase2c_'));
const phase2aMigrationFiles = migrationFiles.filter((name) => name.includes('_phase2a_'));
const phase2bMigrationFiles = migrationFiles.filter((name) => name.includes('_phase2b_'));
const phase2cMigrationFiles = migrationFiles.filter((name) => name.includes('_phase2c_'));
const phase3aMigrationFiles = migrationFiles.filter((name) => name.includes('_phase3a_'));
const phase3bMigrationFiles = migrationFiles.filter((name) => name.includes('_phase3b_'));
assert.equal(historicalMigrationFiles.length, 27, 'expected the immutable M01-M27 history');
assert.deepEqual(phase1aMigrationFiles, [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
], 'expected the ordered Phase 1A shared-backend migration set');
assert.deepEqual(phase2MigrationFiles, [
  '20260821000501_m32_phase2_canonical_foundation.sql',
], 'expected the ordered Phase 2 canonical-foundation migration set');
assert.deepEqual(phase2aMigrationFiles, [
  '20260821000601_m33_phase2a_hardening.sql',
], 'expected the ordered Phase 2A hardening migration set');
assert.deepEqual(phase2bMigrationFiles, [
  '20260821000701_m34_phase2b_final_hardening.sql',
], 'expected the ordered Phase 2B final-hardening migration set');
assert.deepEqual(phase2cMigrationFiles, [
  '20260821000801_m35_phase2c_canonical_theme_slugs.sql',
], 'expected the ordered Phase 2C canonical-theme-slugs migration set');
assert.deepEqual(phase3aMigrationFiles, [
  '20260821000901_m36_phase3a_auth_profiles_roles.sql',
], 'expected the ordered Phase 3A auth-profiles-roles migration set');
assert.deepEqual(phase3bMigrationFiles, [
  '20260821001001_m37_phase3b_multitenant_rls.sql',
], 'expected the ordered Phase 3B multi-tenant-RLS migration set');
const m38MigrationFiles = migrationFiles.filter((name) => name.includes('_m38_') || name.includes('_reconciliation_'));
assert.deepEqual(m38MigrationFiles, [
  '20260822000101_m38_reconciliation_fix.sql',
], 'expected the M38 reconciliation fix (Design B; not part of the M01–M27 history)');
const m39MigrationFiles = migrationFiles.filter((name) => name.includes('_m39_') || name.includes('_owner_publish_'));
assert.deepEqual(m39MigrationFiles, [
  '20260822000201_m39_owner_publish_website.sql',
], 'expected the M39 owner self-publish RPC (Design B; not part of the M01–M27 history)');
const m40MigrationFiles = migrationFiles.filter((name) => name.includes('_m40_') || name.includes('_service_catalog_commerce_rpc'));
assert.deepEqual(m40MigrationFiles, [
  '20260822000301_m40_service_catalog_commerce_rpc.sql',
], 'expected the M40 service-catalog/commerce RPC set (Design B; not part of the M01–M27 history)');
const m48MigrationFiles = migrationFiles.filter((name) => name.includes('_m48_') || name.includes('_template_switch_isolation'));
assert.deepEqual(m48MigrationFiles, [
  '20260824000501_m48_template_switch_isolation.sql',
], 'expected the additive M48 template-switch isolation migration after M47');
const m50MigrationFiles = migrationFiles.filter((name) => name.includes('_m50_') || name.includes('_publish_readiness_validation'));
assert.deepEqual(m50MigrationFiles, [
  '20260825000101_m50_publish_readiness_validation.sql',
], 'expected the M50 publish-readiness validation migration (read gate, owner-only)');
const m51MigrationFiles = migrationFiles.filter((name) => name.includes('_m51_') || name.includes('_slug_collision_hardening'));
assert.deepEqual(m51MigrationFiles, [
  '20260825000201_m51_slug_collision_hardening.sql',
], 'expected the M51 slug collision hardening migration after M50');
const m51Source = await readFile(join(migrationsDir, m51MigrationFiles[0]), 'utf8');
assert.match(m51Source, /nexora_allocate_business_slug/);
assert.match(m51Source, /v_suffix - 1/, 'M51 must allocate base, base-1, base-2 deterministically');
assert.match(m51Source, /pg_advisory_xact_lock/, 'M51 allocator must be serialized per base slug');
assert.match(m51Source, /salon_public_websites_slug_ci_unique/, 'M51 must add the DB-wide CI unique slug index');
assert.match(m51Source, /unique_violation/, 'M51 provision/publish must retry on unique violation');
assert.match(m51Source, /salon_public_websites_slug_url_safe/, 'M51 must add the URL-safe slug character check');
const m52MigrationFiles = migrationFiles.filter((name) => name.includes('_m52_') || name.includes('_public_resolution_hardening'));
assert.deepEqual(m52MigrationFiles, [
  '20260825000301_m52_public_resolution_hardening.sql',
], 'expected the M52 public resolution hardening migration after M51');
const m52Source = await readFile(join(migrationsDir, m52MigrationFiles[0]), 'utf8');
assert.match(m52Source, /join public\.themes t on t\.theme_id = w\.template_key and t\.is_active = true/,
  'M52 must enforce the active template inside the public resolution');
assert.match(m52Source, /w\.is_published = true[\s\S]*s\.is_active = true[\s\S]*s\.deleted_at is null/,
  'M52 must keep published + active + not-deleted business gates');
assert.match(m52Source, /verify_m52_public_resolution_hardening/, 'M52 must add its own read-only verifier');
assert.doesNotMatch(m52Source, /grant select on table public\.salon_public_websites to anon/,
  'M52 must keep anon resolution RPC-only');
const m48Source = await readFile(join(migrationsDir, m48MigrationFiles[0]), 'utf8');
const m48SwitchBody = m48Source.slice(
  m48Source.indexOf('create or replace function public.set_owner_salon_template'),
  m48Source.indexOf('create or replace function public.set_owner_salon_visual_config'),
);
for (const protectedTable of ['organizations', 'organization_members', 'profiles', 'business_locations', 'services', 'service_price_variants', 'products', 'bookings', 'payment_orders', 'payments']) {
  assert.doesNotMatch(
    m48SwitchBody,
    new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${protectedTable}\\b`, 'i'),
    `M48 template switch must not write protected table ${protectedTable}`,
  );
}
// Live-applied Design-B helper migrations (SQL-editor / shared project). They
// are not part of the immutable M01–M27 replay history, just like M38/M39.
const liveHelperMigrationFiles = migrationFiles.filter(
  (name) => name.includes('setup_public_salon_v2') || name.includes('dynamic_multitenant'),
);
assert.deepEqual(liveHelperMigrationFiles, [
  '20260821203500_setup_public_salon_v2.sql',
  '20260821204000_dynamic_multitenant_salons.sql',
], 'expected the two live helper migrations (Design B; not part of the M01–M27 history)');

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

const bootstrapSupabaseSchemas = async () => {
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
      phone text,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
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
  `);
};

await bootstrapSupabaseSchemas();

for (let pass = 1; pass <= 2; pass += 1) {
  let applied = 0;
  for (const file of historicalMigrationFiles) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    try {
      await db.exec(sql);
      applied += 1;
    } catch (error) {
      throw new Error(`migration pass ${pass} failed at ${file}: ${error.message}`, { cause: error });
    }
  }
  console.log(`Historical migration pass ${pass}: ${applied}/${historicalMigrationFiles.length} applied cleanly`);
}

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  staffUserA: '00000000-0000-4000-8000-0000000000a2',
  businessA: '10000000-0000-4000-8000-0000000000a1',
  businessB: '10000000-0000-4000-8000-0000000000b1',
  serviceA: '20000000-0000-4000-8000-0000000000a1',
  serviceB: '20000000-0000-4000-8000-0000000000b1',
  staffA: '30000000-0000-4000-8000-0000000000a1',
  customerA: '40000000-0000-4000-8000-0000000000a1',
  customerB: '40000000-0000-4000-8000-0000000000b1',
  bookingA: '50000000-0000-4000-8000-0000000000a1',
  themeA: '60000000-0000-4000-8000-0000000000a1',
  themeB: '60000000-0000-4000-8000-0000000000b1',
  categoryA: '70000000-0000-4000-8000-0000000000a1',
  categoryB: '70000000-0000-4000-8000-0000000000b1',
  predefinedA: '80000000-0000-4000-8000-0000000000a1',
  predefinedB: '80000000-0000-4000-8000-0000000000b1',
  predefinedInactive: '80000000-0000-4000-8000-0000000000a2',
  savedPredefinedA: '90000000-0000-4000-8000-0000000000a1',
  savedManualA: '90000000-0000-4000-8000-0000000000a2',
};

await db.query(
  `insert into auth.users (id, email, phone, raw_user_meta_data) values
    ($1, 'owner-a@example.test', '+919000000001', '{"full_name":"Owner A"}'),
    ($2, 'owner-b@example.test', '+919000000002', '{"full_name":"Owner B"}'),
    ($3, 'staff-a@example.test', '+919000000003', '{"full_name":"Staff A"}')`,
  [ids.ownerA, ids.ownerB, ids.staffUserA],
);
await db.query(
  `insert into public.businesses (id, name, business_type, phone, whatsapp, email, created_by)
   values
    ($1, 'Jaipur Glow', 'beauty salon', '+911111111111', '+911111111111', 'hello@jaipur-glow.test', $2),
    ($3, 'Pink City Barber', 'barber', '+912222222222', '+912222222222', 'hello@pink-barber.test', $4)`,
  [ids.businessA, ids.ownerA, ids.businessB, ids.ownerB],
);
await db.query(
  `insert into public.services (id, business_id, name, price_paise, duration_minutes, short_description)
   values
    ($1, $2, 'Signature Facial', 120000, 60, 'Original service copy'),
    ($3, $4, 'Classic Cut', 50000, 30, 'Business B service')`,
  [ids.serviceA, ids.businessA, ids.serviceB, ids.businessB],
);
await db.query(
  `insert into public.staff_members (
     id, business_id, auth_user_id, full_name, primary_role, app_access_role,
     mobile, commission_percent, hide_mobile_public
   ) values ($1, $2, $3, 'Asha Artist', 'Senior beautician', 'service_provider', '+919999999999', 17.50, true)`,
  [ids.staffA, ids.businessA, ids.staffUserA],
);
await db.query(
  'insert into public.staff_services (staff_id, service_id) values ($1, $2)',
  [ids.staffA, ids.serviceA],
);
await db.query(
  `insert into public.business_hours (business_id, day_of_week, is_open, open_time, close_time)
   select business_id, day, true, '09:00', '18:00'
   from unnest(array[$1::uuid, $2::uuid]) business_id
   cross join generate_series(0, 6) day`,
  [ids.businessA, ids.businessB],
);
await db.query(
  `insert into public.staff_schedules (staff_id, day_of_week, is_working, start_time, end_time)
   select $1, day, true, '09:00', '18:00' from generate_series(0, 6) day`,
  [ids.staffA],
);
await db.query(
  `insert into public.customers (id, business_id, full_name, mobile) values
    ($1, $2, 'Customer A', '+918000000001'),
    ($3, $4, 'Customer B', '+918000000002')`,
  [ids.customerA, ids.businessA, ids.customerB, ids.businessB],
);
await db.query(
  `insert into public.bookings (
     id, business_id, customer_id, service_id, staff_id, booking_reference,
     appointment_date, start_time, end_time, service_name_snapshot,
     service_price_paise, duration_minutes, advance_paise, remaining_paise
   ) values (
     $1, $2, $3, $4, $5, 'NXR-A001', current_date + 1, '10:00', '11:00',
     'Signature Facial', 120000, 60, 30000, 90000
   )`,
  [ids.bookingA, ids.businessA, ids.customerA, ids.serviceA, ids.staffA],
);
await db.query(
  `insert into public.website_content (business_id, hero_heading, tagline)
   values ($1, 'Glow in Jaipur', 'Website tagline')
   on conflict (business_id) do update set hero_heading = excluded.hero_heading, tagline = excluded.tagline`,
  [ids.businessA],
);

const setRole = async (role, userId = '') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec(`set role ${role}`);
};
const resetRole = async () => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
};
const asRole = async (role, userId, callback) => {
  await setRole(role, userId);
  try {
    return await callback();
  } finally {
    await resetRole();
  }
};
const expectReject = async (callback, pattern) => {
  let error;
  try {
    await callback();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, 'expected operation to be rejected');
  assert.match(error.message, pattern);
};

let passed = 0;
const test = async (label, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${label}`);
};

await test('A — multi-business RLS isolation', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    const businesses = await db.query('select id from public.businesses order by id');
    const services = await db.query('select business_id from public.services order by id');
    assert.deepEqual(businesses.rows.map((row) => row.id), [ids.businessA]);
    assert.deepEqual(services.rows.map((row) => row.business_id), [ids.businessA]);
  });
});

await test('B — one service record feeds the published website', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    await db.query("select public.publish_business_website($1, 'jaipur-glow')", [ids.businessA]);
    await db.query(
      "update public.services set short_description = 'AI-reviewed single-source copy' where id = $1",
      [ids.serviceA],
    );
  });
  const { rows } = await db.query("select public.get_public_website_by_slug('jaipur-glow') as site");
  assert.equal(rows[0].site.services.length, 1);
  assert.equal(rows[0].site.services[0].id, ids.serviceA);
  assert.equal(rows[0].site.services[0].short_description, 'AI-reviewed single-source copy');
});

await test('C — one staff record feeds internal assignment and public-safe output', async () => {
  const assignment = await db.query(
    'select staff_id from public.staff_services where service_id = $1',
    [ids.serviceA],
  );
  const site = await db.query("select public.get_public_website_by_slug('jaipur-glow') as site");
  assert.equal(assignment.rows[0].staff_id, ids.staffA);
  assert.equal(site.rows[0].site.staff[0].id, ids.staffA);
  await asRole('authenticated', ids.staffUserA, async () => {
    const assigned = await db.query('select id from public.services order by id');
    assert.deepEqual(assigned.rows.map((row) => row.id), [ids.serviceA]);
    await expectReject(
      () => db.query("update public.staff_members set app_access_role = 'owner_admin' where id = $1", [ids.staffA]),
      /only an owner_admin/i,
    );
  });
  const membership = await db.query(
    'select access_role from public.business_members where business_id = $1 and user_id = $2',
    [ids.businessA, ids.staffUserA],
  );
  assert.equal(membership.rows[0].access_role, 'service_provider');
});

await test('D — published website reflects live normalized updates without republish', async () => {
  await db.query("update public.businesses set tagline = 'Live synchronized tagline' where id = $1", [ids.businessA]);
  const { rows } = await db.query("select public.get_public_website_by_slug('jaipur-glow') as site");
  assert.equal(rows[0].site.business.tagline, 'Live synchronized tagline');
});

await test('E — ₹1,200 enforces ₹300 advance and ₹900 remaining', async () => {
  const advance = await db.query('select public.calculate_advance_paise(120000) as value');
  const booking = await db.query(
    'select service_price_paise, advance_paise, remaining_paise from public.bookings where id = $1',
    [ids.bookingA],
  );
  assert.equal(Number(advance.rows[0].value), 30000);
  assert.deepEqual(
    booking.rows.map((row) => [Number(row.service_price_paise), Number(row.advance_paise), Number(row.remaining_paise)]),
    [[120000, 30000, 90000]],
  );
});

await test('F — unverified payment cannot confirm a booking', async () => {
  await db.query("select (public.create_payment_order($1, 'order_A001')).id", [ids.bookingA]);
  await expectReject(
    () => db.query("select public.verify_payment('order_A001', 'pay_A001', 30000, 'upi', false)"),
    /signature was not verified/i,
  );
  const { rows } = await db.query('select booking_status from public.bookings where id = $1', [ids.bookingA]);
  assert.equal(rows[0].booking_status, 'pending_payment');
});

await test('G — verified payment confirms exactly once', async () => {
  await db.query("select public.verify_payment('order_A001', 'pay_A001', 30000, 'upi', true)");
  await db.query("select public.verify_payment('order_A001', 'pay_A001', 30000, 'upi', true)");
  const payments = await db.query("select count(*)::int as count from public.payments where provider_payment_id = 'pay_A001'");
  const activity = await db.query(
    "select count(*)::int as count from public.business_activity where event_type = 'payment_verified' and metadata ->> 'booking_id' = $1",
    [ids.bookingA],
  );
  const booking = await db.query('select booking_status from public.bookings where id = $1', [ids.bookingA]);
  assert.equal(payments.rows[0].count, 1);
  assert.equal(activity.rows[0].count, 1);
  assert.equal(booking.rows[0].booking_status, 'confirmed');
});

await test('H — overview and revenue RPCs reflect the same booking/payment', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    const overview = await db.query('select public.get_dashboard_overview($1) as value', [ids.businessA]);
    const revenue = await db.query('select public.get_payments_revenue($1) as value', [ids.businessA]);
    assert.equal(Number(overview.rows[0].value.upcoming_bookings), 1);
    assert.equal(Number(revenue.rows[0].value.verified_advance_paise), 30000);
    assert.equal(Number(revenue.rows[0].value.booking_value_paise), 120000);
  });
});

await test('I — archived catalog item keeps immutable booking history', async () => {
  await db.query("update public.services set status = 'archived', name = 'Renamed after booking', price_paise = 150000 where id = $1", [ids.serviceA]);
  const booking = await db.query(
    'select service_name_snapshot, service_price_paise, advance_paise, remaining_paise from public.bookings where id = $1',
    [ids.bookingA],
  );
  assert.deepEqual(
    [booking.rows[0].service_name_snapshot, Number(booking.rows[0].service_price_paise), Number(booking.rows[0].advance_paise), Number(booking.rows[0].remaining_paise)],
    ['Signature Facial', 120000, 30000, 90000],
  );
});

await test('J — onboarding progress and JSON draft resume independently', async () => {
  await db.query(
    "update public.onboarding_progress set current_step = 9, last_completed_step = 8 where business_id = $1",
    [ids.businessA],
  );
  await db.query(
    `update public.business_draft_state set draft = '{"appearance":"dark","pendingStep":9}'::jsonb where business_id = $1`,
    [ids.businessA],
  );
  const { rows } = await db.query(
    `select op.current_step, op.last_completed_step, ds.draft
     from public.onboarding_progress op
     join public.business_draft_state ds using (business_id)
     where op.business_id = $1`,
    [ids.businessA],
  );
  assert.equal(rows[0].current_step, 9);
  assert.equal(rows[0].last_completed_step, 8);
  assert.equal(rows[0].draft.appearance, 'dark');
});

await test('K — slug loads only the published business', async () => {
  const published = await db.query("select public.get_public_website_by_slug('jaipur-glow') as site");
  const draft = await db.query("select public.get_public_website_by_slug('pink-city-barber') as site");
  assert.equal(published.rows[0].site.business.id, ids.businessA);
  assert.equal(draft.rows[0].site, null);
});

await test('L — anonymous access exposes only published/public-safe data', async () => {
  await db.query(
    `insert into storage.objects (bucket_id, name) values
      ('business-media', $1 || '/gallery/public-a.webp'),
      ('business-media', $2 || '/gallery/draft-b.webp')`,
    [ids.businessA, ids.businessB],
  );
  await asRole('anon', '', async () => {
    const { rows } = await db.query("select public.get_public_website_by_slug('jaipur-glow') as site");
    const serialized = JSON.stringify(rows[0].site);
    for (const privateField of [
      'commission_percent', 'app_access_role', 'access_role', 'created_by',
      'provider_payment_id', 'verification_status', 'staff_permissions',
    ]) {
      assert.equal(serialized.includes(privateField), false, `public payload leaked ${privateField}`);
    }
    assert.equal(Object.hasOwn(rows[0].site.staff[0], 'mobile'), false);

    const publicObjects = await db.query('select name from storage.objects order by name');
    assert.deepEqual(publicObjects.rows.map((row) => row.name), [`${ids.businessA}/gallery/public-a.webp`]);
    await db.query(
      `insert into public.website_events (business_id, event_type, visitor_token)
       values ($1, 'page_view', 'visitor-a')`,
      [ids.businessA],
    );
    await expectReject(
      () => db.query(
        `insert into public.website_events (business_id, event_type, visitor_token)
         values ($1, 'page_view', 'visitor-b')`,
        [ids.businessB],
      ),
      /row-level security/i,
    );
    await expectReject(() => db.query('select * from public.payments'), /permission denied/i);
  });
});

await test('M — theme catalog enforces valid same-theme relationships without touching business services', async () => {
  const catalogCounts = await db.query(`
    select
      (select count(*)::int from public.themes) as themes,
      (select count(*)::int from public.service_categories) as categories,
      (select count(*)::int from public.predefined_services) as predefined
  `);
  assert.deepEqual(catalogCounts.rows[0], { themes: 5, categories: 17, predefined: 78 });

  const themeRows = await db.query(
    `select id, theme_id from public.themes
     where theme_id in ('barber_mens_grooming', 'hair_studio_color_bar')`,
  );
  ids.themeA = themeRows.rows.find((row) => row.theme_id === 'barber_mens_grooming').id;
  ids.themeB = themeRows.rows.find((row) => row.theme_id === 'hair_studio_color_bar').id;

  const categoryRows = await db.query(
    `select id, theme_id, name from public.service_categories
     where (theme_id = $1 and name = 'Haircuts')
        or (theme_id = $2 and name = 'Styling & Cuts')`,
    [ids.themeA, ids.themeB],
  );
  ids.categoryA = categoryRows.rows.find((row) => row.theme_id === ids.themeA).id;
  ids.categoryB = categoryRows.rows.find((row) => row.theme_id === ids.themeB).id;

  const predefinedRow = await db.query(
    `select id from public.predefined_services
     where theme_id = $1 and category_id = $2 and name = 'Skin Fade'`,
    [ids.themeA, ids.categoryA],
  );
  ids.predefinedA = predefinedRow.rows[0].id;

  const businessServicesBefore = await db.query('select count(*)::int as count from public.services');

  await expectReject(
    () => db.query(
      `insert into public.service_categories (theme_id, name)
       values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Orphan Category')`,
    ),
    /foreign key|violates/i,
  );
  await expectReject(
    () => db.query(
      `insert into public.predefined_services (theme_id, category_id, name)
       values ($1, $2, 'Cross-theme Service')`,
      [ids.themeB, ids.categoryA],
    ),
    /foreign key|violates/i,
  );
  await expectReject(
    () => db.query(
      `insert into public.themes (theme_id, name)
       values ('barber_mens_grooming', 'Duplicate Stable ID')`,
    ),
    /unique|duplicate/i,
  );
  await expectReject(
    () => db.query(
      `insert into public.service_categories (theme_id, name)
       values ($1, 'Haircuts')`,
      [ids.themeA],
    ),
    /unique|duplicate/i,
  );
  await expectReject(
    () => db.query(
      `insert into public.predefined_services (theme_id, category_id, name)
       values ($1, $2, 'Skin Fade')`,
      [ids.themeA, ids.categoryA],
    ),
    /unique|duplicate/i,
  );
  await expectReject(
    () => db.query('delete from public.themes where id = $1', [ids.themeA]),
    /foreign key|violates/i,
  );

  await db.query(
    `update public.service_categories
     set sort_order = sort_order, updated_at = '2000-01-01T00:00:00Z'
     where id = $1`,
    [ids.categoryA],
  );
  const updatedCategory = await db.query(
    `select sort_order, updated_at > '2000-01-01T00:00:00Z'::timestamptz as timestamp_refreshed
     from public.service_categories where id = $1`,
    [ids.categoryA],
  );
  assert.deepEqual(updatedCategory.rows[0], { sort_order: 0, timestamp_refreshed: true });

  const businessServicesAfter = await db.query('select count(*)::int as count from public.services');
  assert.equal(businessServicesAfter.rows[0].count, businessServicesBefore.rows[0].count);
});

await test('N — clients read only the active theme catalog and cannot mutate it', async () => {
  await db.query('update public.themes set is_active = false where id = $1', [ids.themeB]);
  await db.query('update public.predefined_services set is_active = false where id = $1', [ids.predefinedA]);

  await asRole('anon', '', async () => {
    const themes = await db.query('select theme_id from public.themes order by sort_order');
    const categories = await db.query('select count(*)::int as count from public.service_categories');
    const services = await db.query('select count(*)::int as count from public.predefined_services');
    assert.deepEqual(
      themes.rows.map((row) => row.theme_id),
      ['barber_mens_grooming', 'beauty_skin_spa', 'family_full_service', 'nail_lash_studio'],
    );
    assert.equal(categories.rows[0].count, 14);
    assert.equal(services.rows[0].count, 60);
    await expectReject(
      () => db.query("insert into public.themes (theme_id, name) values ('client-write', 'Blocked')"),
      /permission denied/i,
    );
  });

  await db.query('update public.themes set is_active = true where id = $1', [ids.themeB]);
  await db.query('update public.predefined_services set is_active = true where id = $1', [ids.predefinedA]);
});

await test('O — saved services preserve custom rows and enforce exact catalog provenance', async () => {
  const legacyRows = await db.query(
    `select
       count(*)::int as total,
       count(*) filter (
         where theme_id is null
           and category_id is null
           and predefined_service_id is null
       )::int as safely_unlinked
     from public.services
     where id in ($1, $2)`,
    [ids.serviceA, ids.serviceB],
  );
  assert.deepEqual(legacyRows.rows[0], { total: 2, safely_unlinked: 2 });

  await db.query(
    `insert into public.services (
       id, business_id, theme_id, category_id, predefined_service_id,
       name, category, price_paise, duration_minutes, short_description,
       is_featured, status, display_order
     ) values (
       $1, $2, $3, $4, $5,
       'Saved Curated Service', 'Preserved display category', 175000, 75,
       'Owner-edited saved description', true, 'active', 4
     )`,
    [
      ids.savedPredefinedA, ids.businessA, ids.themeA, ids.categoryA,
      ids.predefinedA,
    ],
  );
  await db.query(
    `insert into public.services (
       id, business_id, name, category, price_paise, duration_minutes,
       short_description, status
     ) values (
       $1, $2, 'Manual Custom Service', 'Owner custom category', 99000, 45,
       'Custom service remains unlinked', 'inactive'
     )`,
    [ids.savedManualA, ids.businessA],
  );

  const saved = await db.query(
    `select business_id, theme_id, category_id, predefined_service_id,
            name, category, price_paise, duration_minutes, short_description,
            is_featured, status::text, display_order
     from public.services where id = $1`,
    [ids.savedPredefinedA],
  );
  assert.deepEqual(
    {
      ...saved.rows[0],
      price_paise: Number(saved.rows[0].price_paise),
    },
    {
      business_id: ids.businessA,
      theme_id: ids.themeA,
      category_id: ids.categoryA,
      predefined_service_id: ids.predefinedA,
      name: 'Saved Curated Service',
      category: 'Preserved display category',
      price_paise: 175000,
      duration_minutes: 75,
      short_description: 'Owner-edited saved description',
      is_featured: true,
      status: 'active',
      display_order: 4,
    },
  );

  const manual = await db.query(
    `select business_id, theme_id, category_id, predefined_service_id,
            name, category, price_paise, duration_minutes, short_description,
            status::text
     from public.services where id = $1`,
    [ids.savedManualA],
  );
  assert.deepEqual(
    {
      ...manual.rows[0],
      price_paise: Number(manual.rows[0].price_paise),
    },
    {
      business_id: ids.businessA,
      theme_id: null,
      category_id: null,
      predefined_service_id: null,
      name: 'Manual Custom Service',
      category: 'Owner custom category',
      price_paise: 99000,
      duration_minutes: 45,
      short_description: 'Custom service remains unlinked',
      status: 'inactive',
    },
  );

  await expectReject(
    () => db.query(
      `insert into public.services (
         business_id, theme_id, category_id, predefined_service_id,
         name, price_paise, duration_minutes
       ) values ($1, $2, $3, $4, 'Wrong Theme Link', 10000, 15)`,
      [ids.businessA, ids.themeB, ids.categoryB, ids.predefinedA],
    ),
    /foreign key|violates|belongs to another theme/i,
  );
  await expectReject(
    () => db.query(
      `insert into public.services (
         business_id, theme_id, category_id, predefined_service_id,
         name, price_paise, duration_minutes
       ) values ($1, $2, $3, $4, 'Wrong Category Link', 10000, 15)`,
      [ids.businessA, ids.themeA, ids.categoryB, ids.predefinedA],
    ),
    /foreign key|violates|does not belong to this theme/i,
  );
  await expectReject(
    () => db.query(
      `insert into public.services (
         business_id, predefined_service_id, name, price_paise, duration_minutes
       ) values ($1, $2, 'Incomplete Provenance', 10000, 15)`,
      [ids.businessA, ids.predefinedA],
    ),
    /check constraint|violates|must reference a theme/i,
  );
  await expectReject(
    () => db.query(
      `update public.services
       set theme_id = $1, category_id = $2
       where id = $3`,
      [ids.themeB, ids.categoryB, ids.savedPredefinedA],
    ),
    // M23 now blocks this earlier, and for ALL themes, via provenance immutability.
    /foreign key|violates|provenance is immutable/i,
  );
  await expectReject(
    () => db.query('delete from public.predefined_services where id = $1', [ids.predefinedA]),
    /foreign key|violates/i,
  );

  await asRole('authenticated', ids.ownerA, async () => {
    const rows = await db.query(
      'select id from public.services where id in ($1, $2) order by id',
      [ids.savedPredefinedA, ids.savedManualA],
    );
    assert.deepEqual(rows.rows.map((row) => row.id), [ids.savedPredefinedA, ids.savedManualA]);
  });
  await asRole('authenticated', ids.ownerB, async () => {
    const rows = await db.query(
      'select id from public.services where id in ($1, $2)',
      [ids.savedPredefinedA, ids.savedManualA],
    );
    assert.equal(rows.rows.length, 0);
  });
});

await test('P — five-theme seed exactly matches the Phase 2–6 application datasets', async () => {
  const seededThemeIds = [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
  ];

  const themes = await db.query(
    `select theme_id, name, description, target_audience, ui_config,
            sort_order, is_active
     from public.themes
     order by sort_order, theme_id`,
  );
  assert.deepEqual(themes.rows.map((row) => row.theme_id), seededThemeIds);
  themes.rows.forEach((row, sortOrder) => {
    assert.equal(row.name, THEME_LABELS[row.theme_id]);
    assert.equal(row.sort_order, sortOrder);
    assert.equal(row.is_active, true);
    assert.ok(row.description.length > 0);
    assert.ok(row.target_audience.length > 0);
    assert.equal(row.ui_config.tokens.id, row.theme_id);
  });

  let expectedCategoryCount = 0;
  let expectedServiceCount = 0;
  let expectedSuggestedCount = 0;

  for (const themeId of seededThemeIds) {
    const categories = await db.query(
      `select c.name, c.sort_order
       from public.service_categories c
       join public.themes t on t.id = c.theme_id
       where t.theme_id = $1
       order by c.sort_order, c.name`,
      [themeId],
    );
    const expectedCategories = THEME_CATEGORIES[themeId].map((name, sortOrder) => ({
      name,
      sort_order: sortOrder,
    }));
    assert.deepEqual(categories.rows, expectedCategories);
    expectedCategoryCount += expectedCategories.length;

    const aliases = SUGGESTED_SERVICE_ALIASES[themeId] ?? {};
    const suggestionByCanonicalName = new Map(
      SUGGESTED_SERVICE_NAMES[themeId].map((suggestedLabel, suggestedSortOrder) => [
        aliases[suggestedLabel] ?? suggestedLabel,
        { suggestedLabel, suggestedSortOrder },
      ]),
    );
    const expectedServices = SERVICES_BY_THEME[themeId].map((service, sortOrder) => {
      const suggestion = suggestionByCanonicalName.get(service.name);
      return {
        name: service.name,
        category: service.category,
        description: service.description,
        sort_order: sortOrder,
        is_suggested: Boolean(suggestion),
        suggested_label: suggestion?.suggestedLabel ?? null,
        suggested_sort_order: suggestion?.suggestedSortOrder ?? null,
        default_price_paise: service.price * 100,
        default_duration_minutes: service.duration,
        is_active: true,
      };
    });
    const services = await db.query(
      `select ps.name, c.name as category, ps.description, ps.sort_order,
              ps.is_suggested, ps.suggested_label,
              ps.suggested_sort_order, ps.default_price_paise,
              ps.default_duration_minutes, ps.is_active
       from public.predefined_services ps
       join public.themes t on t.id = ps.theme_id
       join public.service_categories c on c.id = ps.category_id
       where t.theme_id = $1
       order by ps.sort_order, ps.name`,
      [themeId],
    );
    assert.deepEqual(services.rows, expectedServices);
    expectedServiceCount += expectedServices.length;

    const suggestedLabels = services.rows
      .filter((service) => service.is_suggested)
      .sort((left, right) => left.suggested_sort_order - right.suggested_sort_order)
      .map((service) => service.suggested_label);
    assert.deepEqual(suggestedLabels, SUGGESTED_SERVICE_NAMES[themeId]);
    expectedSuggestedCount += suggestedLabels.length;
  }

  const totals = await db.query(`
    select
      (select count(*)::int from public.service_categories) as categories,
      (select count(*)::int from public.predefined_services) as predefined,
      (select count(*)::int from public.predefined_services where is_suggested) as suggested,
      (select count(distinct (theme_id, name))::int from public.service_categories) as unique_categories,
      (select count(distinct (theme_id, name))::int from public.predefined_services) as unique_predefined
  `);
  assert.deepEqual(totals.rows[0], {
    categories: expectedCategoryCount,
    predefined: expectedServiceCount,
    suggested: expectedSuggestedCount,
    unique_categories: expectedCategoryCount,
    unique_predefined: expectedServiceCount,
  });
  assert.deepEqual(
    { expectedCategoryCount, expectedServiceCount, expectedSuggestedCount },
    { expectedCategoryCount: 17, expectedServiceCount: 78, expectedSuggestedCount: 30 },
  );
});

await test('Q — theme catalog RPC database-filters each of the five UI catalogs', async () => {
  const seededThemeIds = [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
  ];
  const seenThemeDatabaseIds = new Set();

  for (const themeId of seededThemeIds) {
    const result = await db.query(
      'select public.get_theme_service_catalog($1) as catalog',
      [themeId],
    );
    const catalog = result.rows[0].catalog;
    assert.equal(catalog.theme.theme_id, themeId);
    assert.equal(seenThemeDatabaseIds.has(catalog.theme.id), false);
    seenThemeDatabaseIds.add(catalog.theme.id);

    const categoryIds = new Set(catalog.categories.map((category) => {
      assert.equal(category.theme_id, catalog.theme.id);
      return category.id;
    }));
    assert.deepEqual(
      catalog.categories.map((category) => category.name),
      THEME_CATEGORIES[themeId],
    );

    const expectedServices = SERVICES_BY_THEME[themeId];
    assert.deepEqual(
      catalog.predefined_services.map((service) => service.name),
      expectedServices.map((service) => service.name),
    );
    catalog.predefined_services.forEach((service, index) => {
      const expected = expectedServices[index];
      assert.equal(service.theme_id, catalog.theme.id);
      assert.equal(categoryIds.has(service.category_id), true);
      assert.equal(service.description, expected.description);
      assert.equal(Number(service.default_price_paise), expected.price * 100);
      assert.equal(service.default_duration_minutes, expected.duration);
    });

    const predefinedIds = new Set(catalog.predefined_services.map((service) => service.id));
    catalog.suggested_services.forEach((service) => {
      assert.equal(service.theme_id, catalog.theme.id);
      assert.equal(categoryIds.has(service.category_id), true);
      assert.equal(predefinedIds.has(service.id), true);
      assert.equal(service.is_suggested, true);
    });
    assert.deepEqual(
      catalog.suggested_services.map((service) => service.suggested_label),
      SUGGESTED_SERVICE_NAMES[themeId],
    );
  }

  const unsupported = await db.query(
    `select public.get_theme_service_catalog('hair') as original_theme,
            public.get_theme_service_catalog('not-a-theme') as missing_theme`,
  );
  assert.equal(unsupported.rows[0].original_theme, null);
  assert.equal(unsupported.rows[0].missing_theme, null);
});

await test('R — Add Selected saves all five themes once with tenant-safe exact provenance', async () => {
  const seededThemeIds = [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
  ];
  const suggestedIdsByTheme = new Map();

  for (const themeId of seededThemeIds) {
    const rows = await db.query(
      `select ps.id
       from public.predefined_services ps
       join public.themes t on t.id = ps.theme_id
       where t.theme_id = $1 and ps.is_active and ps.is_suggested
       order by ps.suggested_sort_order`,
      [themeId],
    );
    assert.equal(rows.rows.length, 6);
    suggestedIdsByTheme.set(themeId, rows.rows.map((row) => row.id));
  }

  const customBefore = await db.query(
    `select business_id, name, category, short_description, price_paise,
            duration_minutes, status::text, theme_id, category_id,
            predefined_service_id
     from public.services where id = $1`,
    [ids.savedManualA],
  );

  await asRole('authenticated', ids.ownerA, async () => {
    for (const themeId of seededThemeIds) {
      const selectedIds = suggestedIdsByTheme.get(themeId);
      const save = await db.query(
        `select public.save_predefined_services(
           $1,
           string_to_array($2, ',')::uuid[]
         ) as result`,
        [themeId, selectedIds.join(',')],
      );
      const result = save.rows[0].result;
      assert.equal(result.business_id, ids.businessA);
      assert.equal(result.theme_id, themeId);
      assert.equal(result.requested_count, 6);
      assert.equal(result.services.length, 6);
      assert.equal(result.inserted_count, themeId === 'barber_mens_grooming' ? 5 : 6);
      assert.equal(result.existing_count, themeId === 'barber_mens_grooming' ? 1 : 0);
      result.services.forEach((service) => {
        assert.equal(service.business_id, ids.businessA);
        assert.equal(service.theme_key, themeId);
        assert.equal(selectedIds.includes(service.predefined_service_id), true);
      });
    }

    const afterFirstSave = await db.query(
      `select count(*)::int as count
       from public.services
       where business_id = $1 and predefined_service_id is not null`,
      [ids.businessA],
    );
    assert.equal(afterFirstSave.rows[0].count, 30);

    // Repeating every Add Selected request returns the existing rows and inserts
    // nothing, even if the request itself repeats an ID.
    for (const themeId of seededThemeIds) {
      const selectedIds = suggestedIdsByTheme.get(themeId);
      const repeatedInput = [...selectedIds, selectedIds[0]];
      const repeat = await db.query(
        `select public.save_predefined_services(
           $1,
           string_to_array($2, ',')::uuid[]
         ) as result`,
        [themeId, repeatedInput.join(',')],
      );
      assert.equal(repeat.rows[0].result.requested_count, 6);
      assert.equal(repeat.rows[0].result.inserted_count, 0);
      assert.equal(repeat.rows[0].result.existing_count, 6);
      assert.equal(repeat.rows[0].result.services.length, 6);
    }

    const afterRepeat = await db.query(
      `select count(*)::int as count
       from public.services
       where business_id = $1 and predefined_service_id is not null`,
      [ids.businessA],
    );
    assert.equal(afterRepeat.rows[0].count, 30);

    const mismatches = await db.query(
      `select count(*)::int as count
       from public.services s
       join public.predefined_services ps on ps.id = s.predefined_service_id
       join public.service_categories c on c.id = ps.category_id
       where s.business_id = $1
         and s.id <> $2
         and (
           s.theme_id is distinct from ps.theme_id
           or s.category_id is distinct from ps.category_id
           or s.name is distinct from ps.name
           or s.category is distinct from c.name
           or s.short_description is distinct from ps.description
           or s.price_paise is distinct from ps.default_price_paise
           or s.duration_minutes is distinct from ps.default_duration_minutes
           or s.status <> 'active'
         )`,
      [ids.businessA, ids.savedPredefinedA],
    );
    assert.equal(mismatches.rows[0].count, 0);

    // Skin Fade existed before Session 2 with owner-edited fields. ON CONFLICT
    // must preserve it rather than overwrite/convert it.
    const preservedExisting = await db.query(
      `select name, category, short_description, price_paise,
              duration_minutes, status::text
       from public.services where id = $1`,
      [ids.savedPredefinedA],
    );
    assert.deepEqual(
      {
        ...preservedExisting.rows[0],
        price_paise: Number(preservedExisting.rows[0].price_paise),
      },
      {
        name: 'Saved Curated Service',
        category: 'Preserved display category',
        short_description: 'Owner-edited saved description',
        price_paise: 175000,
        duration_minutes: 75,
        status: 'active',
      },
    );

    await expectReject(
      () => db.query(
        `select public.save_predefined_services(
           'barber_mens_grooming',
           array[$1::uuid]
         )`,
        [suggestedIdsByTheme.get('hair_studio_color_bar')[0]],
      ),
      /do not belong to the active theme/i,
    );

    await expectReject(
      () => db.query(
        `insert into public.services (
           business_id, theme_id, category_id, predefined_service_id,
           name, price_paise, duration_minutes
         )
         select business_id, theme_id, category_id, predefined_service_id,
                'Duplicate direct insert', price_paise, duration_minutes
         from public.services where id = $1`,
        [ids.savedPredefinedA],
      ),
      /unique|duplicate/i,
    );
  });

  // The same predefined row can be saved by a different authenticated tenant,
  // and ownership is derived server-side from that user's membership.
  await asRole('authenticated', ids.ownerB, async () => {
    const selectedId = suggestedIdsByTheme.get('nail_lash_studio')[0];
    const save = await db.query(
      `select public.save_predefined_services(
         'nail_lash_studio', array[$1::uuid]
       ) as result`,
      [selectedId],
    );
    assert.equal(save.rows[0].result.business_id, ids.businessB);
    assert.equal(save.rows[0].result.inserted_count, 1);
  });

  await asRole('authenticated', '', async () => {
    await expectReject(
      () => db.query(
        `select public.save_predefined_services(
           'nail_lash_studio', array[$1::uuid]
         )`,
        [suggestedIdsByTheme.get('nail_lash_studio')[0]],
      ),
      /log in/i,
    );
  });

  const customAfter = await db.query(
    `select business_id, name, category, short_description, price_paise,
            duration_minutes, status::text, theme_id, category_id,
            predefined_service_id
     from public.services where id = $1`,
    [ids.savedManualA],
  );
  assert.deepEqual(customAfter.rows, customBefore.rows);
});

await test('S — refresh, management, theme switching, and tenant isolation remain safe', async () => {
  const seededThemeIds = [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
  ];
  const globalBefore = await db.query(`
    select
      (select count(*)::int from public.themes) as themes,
      (select count(*)::int from public.service_categories) as categories,
      (select count(*)::int from public.predefined_services) as predefined
  `);
  let managedServiceId;
  let managedPredefinedId;
  let relationshipBefore;

  await asRole('authenticated', ids.ownerA, async () => {
    // Existing → five database themes → Existing is represented by the five
    // exact scoped loads plus the unsupported original-theme NULL contract.
    for (const themeId of seededThemeIds) {
      const firstLoad = await db.query(
        'select public.get_saved_services_for_theme($1) as result',
        [themeId],
      );
      const secondLoad = await db.query(
        'select public.get_saved_services_for_theme($1) as result',
        [themeId],
      );
      assert.equal(firstLoad.rows[0].result.business_id, ids.businessA);
      assert.equal(firstLoad.rows[0].result.theme_id, themeId);
      assert.equal(firstLoad.rows[0].result.services.length, 6);
      assert.deepEqual(secondLoad.rows[0].result, firstLoad.rows[0].result);
      assert.equal(
        new Set(firstLoad.rows[0].result.services.map((service) => service.predefined_service_id)).size,
        6,
      );
      firstLoad.rows[0].result.services.forEach((service) => {
        assert.equal(service.business_id, ids.businessA);
        assert.equal(service.theme_key, themeId);
      });

      if (themeId === 'hair_studio_color_bar') {
        managedServiceId = firstLoad.rows[0].result.services[0].id;
        managedPredefinedId = firstLoad.rows[0].result.services[0].predefined_service_id;
      }
    }

    const before = await db.query(
      `select theme_id, category_id, predefined_service_id
       from public.services where id = $1`,
      [managedServiceId],
    );
    relationshipBefore = before.rows[0];

    const globalPredefinedBefore = await db.query(
      `select theme_id, category_id, name, description, is_active
       from public.predefined_services where id = $1`,
      [managedPredefinedId],
    );

    const edited = await db.query(
      `select public.update_saved_service(
         $1, 'Owner Edited Service', 'Owner edited description', 222200, 88
       ) as result`,
      [managedServiceId],
    );
    assert.equal(edited.rows[0].result.name, 'Owner Edited Service');
    assert.equal(edited.rows[0].result.description, 'Owner edited description');
    assert.equal(Number(edited.rows[0].result.price_paise), 222200);
    assert.equal(edited.rows[0].result.duration_minutes, 88);

    const relationAfterEdit = await db.query(
      `select theme_id, category_id, predefined_service_id
       from public.services where id = $1`,
      [managedServiceId],
    );
    assert.deepEqual(relationAfterEdit.rows[0], relationshipBefore);

    const globalPredefinedAfterEdit = await db.query(
      `select theme_id, category_id, name, description, is_active
       from public.predefined_services where id = $1`,
      [managedPredefinedId],
    );
    assert.deepEqual(globalPredefinedAfterEdit.rows, globalPredefinedBefore.rows);

    const deactivated = await db.query(
      'select public.set_saved_service_active($1, false) as result',
      [managedServiceId],
    );
    assert.equal(deactivated.rows[0].result.status, 'inactive');
    const globalStillActive = await db.query(
      'select is_active from public.predefined_services where id = $1',
      [managedPredefinedId],
    );
    assert.equal(globalStillActive.rows[0].is_active, true);

    const refreshAfterEdit = await db.query(
      `select public.get_saved_services_for_theme('hair_studio_color_bar') as result`,
    );
    const refreshed = refreshAfterEdit.rows[0].result.services.find(
      (service) => service.id === managedServiceId,
    );
    assert.equal(refreshed.name, 'Owner Edited Service');
    assert.equal(refreshed.status, 'inactive');
    assert.equal(refreshed.predefined_service_id, managedPredefinedId);
  });

  await asRole('authenticated', ids.ownerB, async () => {
    await expectReject(
      () => db.query(
        `select public.update_saved_service(
           $1, 'Cross Salon Edit', 'Blocked', 10000, 10
         )`,
        [managedServiceId],
      ),
      /not found for your salon/i,
    );
    await expectReject(
      () => db.query('select public.delete_saved_service($1)', [managedServiceId]),
      /not found for your salon/i,
    );

    const directUpdate = await db.query(
      `update public.services set name = 'Cross Salon Direct Edit'
       where id = $1 returning id`,
      [managedServiceId],
    );
    const directDelete = await db.query(
      'delete from public.services where id = $1 returning id',
      [managedServiceId],
    );
    assert.equal(directUpdate.rows.length, 0);
    assert.equal(directDelete.rows.length, 0);

    const ownNailServices = await db.query(
      `select public.get_saved_services_for_theme('nail_lash_studio') as result`,
    );
    assert.equal(ownNailServices.rows[0].result.business_id, ids.businessB);
    assert.equal(ownNailServices.rows[0].result.services.length, 1);

    await expectReject(
      () => db.query('delete from public.predefined_services where id = $1', [managedPredefinedId]),
      /permission denied/i,
    );
  });

  await asRole('authenticated', ids.ownerA, async () => {
    const deleted = await db.query(
      'select public.delete_saved_service($1) as id',
      [managedServiceId],
    );
    assert.equal(deleted.rows[0].id, managedServiceId);
    const afterDelete = await db.query(
      `select public.get_saved_services_for_theme('hair_studio_color_bar') as result`,
    );
    assert.equal(afterDelete.rows[0].result.services.length, 5);
  });

  const savedDeleted = await db.query(
    'select count(*)::int as count from public.services where id = $1',
    [managedServiceId],
  );
  const globalPredefinedPreserved = await db.query(
    'select count(*)::int as count from public.predefined_services where id = $1',
    [managedPredefinedId],
  );
  const globalAfter = await db.query(`
    select
      (select count(*)::int from public.themes) as themes,
      (select count(*)::int from public.service_categories) as categories,
      (select count(*)::int from public.predefined_services) as predefined
  `);
  assert.equal(savedDeleted.rows[0].count, 0);
  assert.equal(globalPredefinedPreserved.rows[0].count, 1);
  assert.deepEqual(globalAfter.rows, globalBefore.rows);
});

await test('T — Phase 8.1 full saved-service management across all five themes', async () => {
  const seededThemeIds = [
    'barber_mens_grooming',
    'hair_studio_color_bar',
    'beauty_skin_spa',
    'family_full_service',
    'nail_lash_studio',
  ];

  const globalBefore = await db.query(`
    select
      (select count(*)::int from public.themes) as themes,
      (select count(*)::int from public.service_categories) as categories,
      (select count(*)::int from public.predefined_services) as predefined,
      (select count(*)::int from public.predefined_services where is_active) as predefined_active
  `);
  const otherTenantBefore = await db.query(
    `select id, name, price_paise, duration_minutes, short_description, status::text,
            theme_id, category_id, predefined_service_id
     from public.services where business_id = $1 order by id`,
    [ids.businessB],
  );
  const legacyCustomBefore = await db.query(
    `select id, name, price_paise, duration_minutes, short_description, status::text,
            theme_id, category_id, predefined_service_id
     from public.services where id = $1`,
    [ids.savedManualA],
  );

  for (const themeId of seededThemeIds) {
    // An unsaved predefined row of this theme, used for the Add Service path.
    const candidate = await db.query(
      `select ps.id, ps.category_id, ps.name, ps.description,
              ps.default_price_paise, ps.default_duration_minutes, ps.theme_id
       from public.predefined_services ps
       join public.themes t on t.id = ps.theme_id
       where t.theme_id = $1
         and ps.is_active
         and not exists (
           select 1 from public.services s
           where s.business_id = $2 and s.predefined_service_id = ps.id
         )
       order by ps.sort_order, ps.id
       limit 1`,
      [themeId, ids.businessA],
    );
    assert.equal(candidate.rows.length, 1, `${themeId}: expected an unsaved predefined service`);
    const predefined = candidate.rows[0];

    let addedPredefinedId;
    let addedCustomId;

    await asRole('authenticated', ids.ownerA, async () => {
      // ---- ADD SERVICE (predefined-linked) --------------------------------
      const added = await db.query(
        `select public.create_saved_service(
           $1, $2, $3, $4, $5, $6, $7, 'active'
         ) as result`,
        [
          themeId, predefined.category_id, predefined.name,
          predefined.description ?? '', predefined.default_price_paise,
          predefined.default_duration_minutes, predefined.id,
        ],
      );
      const addedRow = added.rows[0].result;
      addedPredefinedId = addedRow.id;
      assert.equal(addedRow.business_id, ids.businessA);
      assert.equal(addedRow.theme_key, themeId);
      assert.equal(addedRow.theme_id, predefined.theme_id);
      assert.equal(addedRow.category_id, predefined.category_id);
      assert.equal(addedRow.predefined_service_id, predefined.id);
      assert.equal(addedRow.status, 'active');

      // ---- ADD SERVICE (Custom / Other → predefined_service_id NULL) ------
      const custom = await db.query(
        `select public.create_saved_service(
           $1, $2, $3, 'Owner-written custom description', 123400, 55, null, 'active'
         ) as result`,
        [themeId, predefined.category_id, `Custom Signature ${themeId}`],
      );
      const customRow = custom.rows[0].result;
      addedCustomId = customRow.id;
      assert.equal(customRow.predefined_service_id, null);
      assert.equal(customRow.theme_id, predefined.theme_id);
      assert.equal(customRow.category_id, predefined.category_id);
      assert.equal(customRow.theme_key, themeId);

      // ---- DUPLICATE PREVENTION -------------------------------------------
      await expectReject(
        () => db.query(
          `select public.create_saved_service(
             $1, $2, $3, '', $4, $5, $6, 'active'
           )`,
          [
            themeId, predefined.category_id, `${predefined.name} renamed`,
            predefined.default_price_paise, predefined.default_duration_minutes,
            predefined.id,
          ],
        ),
        /already saved/i,
      );
      await expectReject(
        () => db.query(
          `select public.create_saved_service(
             $1, $2, $3, 'Second copy', 100000, 30, null, 'active'
           )`,
          [themeId, predefined.category_id, `custom signature ${themeId}`.toUpperCase()],
        ),
        /already saved/i,
      );

      // ---- CROSS-THEME / CROSS-CATEGORY ADDS ARE REJECTED ------------------
      const foreign = await db.query(
        `select ps.id, ps.category_id
         from public.predefined_services ps
         join public.themes t on t.id = ps.theme_id
         where t.theme_id <> $1 and ps.is_active
         order by ps.id limit 1`,
        [themeId],
      );
      await expectReject(
        () => db.query(
          `select public.create_saved_service(
             $1, $2, 'Cross theme attempt', '', 10000, 15, $3, 'active'
           )`,
          [themeId, predefined.category_id, foreign.rows[0].id],
        ),
        /does not belong to this theme and category/i,
      );
      await expectReject(
        () => db.query(
          `select public.create_saved_service(
             $1, $2, 'Cross category attempt', '', 10000, 15, null, 'active'
           )`,
          [themeId, foreign.rows[0].category_id],
        ),
        /category does not belong to this theme/i,
      );

      const relationshipBefore = await db.query(
        `select business_id, theme_id, category_id, predefined_service_id
         from public.services where id = $1`,
        [addedPredefinedId],
      );

      // ---- UPDATE PRICE ONLY ----------------------------------------------
      const priced = await db.query(
        'select public.update_saved_service($1, null, null, 654300, null, null) as result',
        [addedPredefinedId],
      );
      assert.equal(Number(priced.rows[0].result.price_paise), 654300);
      assert.equal(priced.rows[0].result.name, predefined.name);
      assert.equal(priced.rows[0].result.duration_minutes, predefined.default_duration_minutes);
      assert.equal(priced.rows[0].result.predefined_service_id, predefined.id);

      // ---- UPDATE DURATION ONLY -------------------------------------------
      const timed = await db.query(
        'select public.update_saved_service($1, null, null, null, 95, null) as result',
        [addedPredefinedId],
      );
      assert.equal(timed.rows[0].result.duration_minutes, 95);
      assert.equal(Number(timed.rows[0].result.price_paise), 654300);

      // ---- UPDATE DESCRIPTION ONLY ----------------------------------------
      const described = await db.query(
        `select public.update_saved_service($1, null, 'Phase 8.1 owner description', null, null, null) as result`,
        [addedPredefinedId],
      );
      assert.equal(described.rows[0].result.description, 'Phase 8.1 owner description');
      assert.equal(described.rows[0].result.name, predefined.name);

      // ---- EDIT SERVICE (name + everything at once) ------------------------
      const edited = await db.query(
        `select public.update_saved_service(
           $1, $2, 'Fully edited description', 777700, 40, 'active'
         ) as result`,
        [addedPredefinedId, `Renamed ${predefined.name}`],
      );
      assert.equal(edited.rows[0].result.name, `Renamed ${predefined.name}`);
      assert.equal(Number(edited.rows[0].result.price_paise), 777700);
      assert.equal(edited.rows[0].result.duration_minutes, 40);

      // ---- DEACTIVATE / ACTIVATE ------------------------------------------
      const deactivated = await db.query(
        'select public.set_saved_service_active($1, false) as result',
        [addedPredefinedId],
      );
      assert.equal(deactivated.rows[0].result.status, 'inactive');
      const reactivated = await db.query(
        'select public.set_saved_service_active($1, true) as result',
        [addedPredefinedId],
      );
      assert.equal(reactivated.rows[0].result.status, 'active');

      // ---- CHANGE SERVICE STATUS ------------------------------------------
      for (const status of ['inactive', 'archived', 'active']) {
        const changed = await db.query(
          'select public.set_saved_service_status($1, $2) as result',
          [addedPredefinedId, status],
        );
        assert.equal(changed.rows[0].result.status, status);
      }
      await expectReject(
        () => db.query('select public.set_saved_service_status($1, $2)', [addedPredefinedId, 'deleted']),
        /status must be active, inactive, or archived/i,
      );

      // ---- RELATIONSHIP PRESERVED THROUGH EVERY EDIT -----------------------
      const relationshipAfter = await db.query(
        `select business_id, theme_id, category_id, predefined_service_id
         from public.services where id = $1`,
        [addedPredefinedId],
      );
      assert.deepEqual(relationshipAfter.rows, relationshipBefore.rows);

      // Custom rows keep NULL provenance through the same operations.
      await db.query(
        `select public.update_saved_service($1, 'Renamed custom', 'New custom copy', 222200, 25, 'inactive')`,
        [addedCustomId],
      );
      const customAfter = await db.query(
        `select theme_id, category_id, predefined_service_id, status::text
         from public.services where id = $1`,
        [addedCustomId],
      );
      assert.equal(customAfter.rows[0].predefined_service_id, null);
      assert.equal(customAfter.rows[0].theme_id, predefined.theme_id);
      assert.equal(customAfter.rows[0].category_id, predefined.category_id);
      assert.equal(customAfter.rows[0].status, 'inactive');

      // ---- VALIDATION ------------------------------------------------------
      await expectReject(
        () => db.query('select public.update_saved_service($1, null, null, -1, null, null)', [addedPredefinedId]),
        /price cannot be negative/i,
      );
      await expectReject(
        () => db.query('select public.update_saved_service($1, null, null, null, 0, null)', [addedPredefinedId]),
        /duration must be positive/i,
      );
      await expectReject(
        () => db.query(`select public.update_saved_service($1, '   ', null, null, null, null)`, [addedPredefinedId]),
        /name is required/i,
      );

      // ---- REFRESH SHOWS THE MANAGED STATE --------------------------------
      const refreshed = await db.query(
        'select public.get_saved_services_for_theme($1) as result',
        [themeId],
      );
      const rows = refreshed.rows[0].result.services;
      const refreshedPredefined = rows.find((row) => row.id === addedPredefinedId);
      const refreshedCustom = rows.find((row) => row.id === addedCustomId);
      assert.equal(refreshedPredefined.predefined_service_id, predefined.id);
      assert.equal(refreshedPredefined.name, `Renamed ${predefined.name}`);
      assert.equal(refreshedCustom.predefined_service_id, null);
      assert.equal(refreshedCustom.status, 'inactive');
    });

    // ---- CROSS-TENANT MANAGEMENT IS BLOCKED --------------------------------
    await asRole('authenticated', ids.ownerB, async () => {
      await expectReject(
        () => db.query(
          `select public.update_saved_service($1, 'Hijack', null, null, null, null)`,
          [addedPredefinedId],
        ),
        /not found for your salon/i,
      );
      await expectReject(
        () => db.query('select public.set_saved_service_status($1, $2)', [addedPredefinedId, 'archived']),
        /not found for your salon/i,
      );
      await expectReject(
        () => db.query('select public.delete_saved_service($1)', [addedCustomId]),
        /not found for your salon/i,
      );
    });

    // ---- DELETE removes only the salon's own saved rows --------------------
    await asRole('authenticated', ids.ownerA, async () => {
      const deletedPredefined = await db.query(
        'select public.delete_saved_service($1) as id',
        [addedPredefinedId],
      );
      const deletedCustom = await db.query(
        'select public.delete_saved_service($1) as id',
        [addedCustomId],
      );
      assert.equal(deletedPredefined.rows[0].id, addedPredefinedId);
      assert.equal(deletedCustom.rows[0].id, addedCustomId);
      await expectReject(
        () => db.query('select public.delete_saved_service($1)', [addedPredefinedId]),
        /not found for your salon/i,
      );
    });

    const gone = await db.query(
      'select count(*)::int as count from public.services where id in ($1, $2)',
      [addedPredefinedId, addedCustomId],
    );
    assert.equal(gone.rows[0].count, 0);

    // The global predefined row survives the tenant delete.
    const predefinedStillThere = await db.query(
      'select is_active from public.predefined_services where id = $1',
      [predefined.id],
    );
    assert.equal(predefinedStillThere.rows[0].is_active, true);
  }

  // A saved service used by a package cannot be silently deleted.
  await asRole('authenticated', ids.ownerA, async () => {
    const created = await db.query(
      `select public.create_saved_service(
         'barber_mens_grooming', $1, 'Package Linked Service', 'Linked', 100000, 30, null, 'active'
       ) as result`,
      [
        (await db.query(
          `select c.id from public.service_categories c
           join public.themes t on t.id = c.theme_id
           where t.theme_id = 'barber_mens_grooming' order by c.sort_order limit 1`,
        )).rows[0].id,
      ],
    );
    const linkedId = created.rows[0].result.id;
    const pkg = await db.query(
      `insert into public.packages (business_id, name, price_paise)
       values ($1, 'Phase 8.1 Combo', 150000) returning id`,
      [ids.businessA],
    );
    await db.query(
      'insert into public.package_services (package_id, service_id) values ($1, $2)',
      [pkg.rows[0].id, linkedId],
    );
    await expectReject(
      () => db.query('select public.delete_saved_service($1)', [linkedId]),
      /remove this service from its package/i,
    );
    await db.query('delete from public.package_services where service_id = $1', [linkedId]);
    await db.query('delete from public.packages where id = $1', [pkg.rows[0].id]);
    const deleted = await db.query('select public.delete_saved_service($1) as id', [linkedId]);
    assert.equal(deleted.rows[0].id, linkedId);
  });

  // Anonymous/logged-out callers get nothing.
  await asRole('authenticated', '', async () => {
    await expectReject(
      () => db.query(
        `select public.create_saved_service('barber_mens_grooming', gen_random_uuid(), 'X', '', 1, 1, null, 'active')`,
      ),
      /log in/i,
    );
    await expectReject(
      () => db.query('select public.delete_saved_service(gen_random_uuid())'),
      /log in/i,
    );
  });

  // Global catalog and other tenants are byte-for-byte untouched.
  const globalAfter = await db.query(`
    select
      (select count(*)::int from public.themes) as themes,
      (select count(*)::int from public.service_categories) as categories,
      (select count(*)::int from public.predefined_services) as predefined,
      (select count(*)::int from public.predefined_services where is_active) as predefined_active
  `);
  const otherTenantAfter = await db.query(
    `select id, name, price_paise, duration_minutes, short_description, status::text,
            theme_id, category_id, predefined_service_id
     from public.services where business_id = $1 order by id`,
    [ids.businessB],
  );
  const legacyCustomAfter = await db.query(
    `select id, name, price_paise, duration_minutes, short_description, status::text,
            theme_id, category_id, predefined_service_id
     from public.services where id = $1`,
    [ids.savedManualA],
  );
  assert.deepEqual(globalAfter.rows, globalBefore.rows);
  assert.deepEqual(otherTenantAfter.rows, otherTenantBefore.rows);
  assert.deepEqual(legacyCustomAfter.rows, legacyCustomBefore.rows);
});

await test('U — Phase 15.8 video likes: duplicates, tenancy and theme-aware weekly ranking', async () => {
  const videoShortA = 'a0000000-0000-4000-8000-0000000000a1';
  const videoLongA = 'a0000000-0000-4000-8000-0000000000a2';
  const videoOtherTheme = 'a0000000-0000-4000-8000-0000000000a3';
  const videoB = 'a0000000-0000-4000-8000-0000000000b1';

  await db.query(
    `insert into public.social_videos (id, business_id, platform, video_url, theme_key, video_kind, display_order)
     values
       ($1, $5, 'youtube', 'https://www.youtube.com/shorts/aaaaaaaaaaa', 'barber_mens_grooming', 'short', 0),
       ($2, $5, 'youtube', 'https://www.youtube.com/watch?v=bbbbbbbbbbb', 'barber_mens_grooming', 'long', 1),
       ($3, $5, 'youtube', 'https://www.youtube.com/shorts/ccccccccccc', 'nail_lash_studio', 'short', 2),
       ($4, $6, 'youtube', 'https://www.youtube.com/shorts/ddddddddddd', 'barber_mens_grooming', 'short', 0)`,
    [videoShortA, videoLongA, videoOtherTheme, videoB, ids.businessA, ids.businessB],
  );

  // Existing rows stay valid with NULL theme/kind (additive columns only).
  await db.query(
    `insert into public.social_videos (business_id, platform, video_url)
     values ($1, 'instagram', 'https://www.instagram.com/reel/AbCdEf12345/')`,
    [ids.businessA],
  );

  // A like can never point at a video of a different theme/business.
  await expectReject(
    () => db.query(
      `insert into public.social_video_likes (business_id, video_id, theme_key, visitor_token)
       values ($1, $2, 'nail_lash_studio', 'cross-theme')`,
      [ids.businessA, videoShortA],
    ),
    /social_video_likes_video_business_theme_fk|violates foreign key/i,
  );
  await expectReject(
    () => db.query(
      `insert into public.social_video_likes (business_id, video_id, theme_key, visitor_token)
       values ($1, $2, 'barber_mens_grooming', 'cross-tenant')`,
      [ids.businessB, videoShortA],
    ),
    /social_video_likes_video_business_theme_fk|violates foreign key/i,
  );

  // Exactly one identity per row.
  await expectReject(
    () => db.query(
      `insert into public.social_video_likes (business_id, video_id, theme_key, user_id, visitor_token)
       values ($1, $2, 'barber_mens_grooming', $3, 'both')`,
      [ids.businessA, videoShortA, ids.ownerB],
    ),
    /social_video_likes_identity_shape/i,
  );

  // Duplicate likes are impossible for both identity shapes.
  await db.query(
    `insert into public.social_video_likes (business_id, video_id, theme_key, user_id)
     values ($1, $2, 'barber_mens_grooming', $3)`,
    [ids.businessA, videoShortA, ids.ownerB],
  );
  await expectReject(
    () => db.query(
      `insert into public.social_video_likes (business_id, video_id, theme_key, user_id)
       values ($1, $2, 'barber_mens_grooming', $3)`,
      [ids.businessA, videoShortA, ids.ownerB],
    ),
    /uq_social_video_likes_user|duplicate key/i,
  );
  await db.query(
    `insert into public.social_video_likes (business_id, video_id, theme_key, visitor_token)
     values ($1, $2, 'barber_mens_grooming', 'visitor-1')`,
    [ids.businessA, videoShortA],
  );
  await expectReject(
    () => db.query(
      `insert into public.social_video_likes (business_id, video_id, theme_key, visitor_token)
       values ($1, $2, 'barber_mens_grooming', 'visitor-1')`,
      [ids.businessA, videoShortA],
    ),
    /uq_social_video_likes_visitor|duplicate key/i,
  );

  // One like on the Long video, and likes on the other theme / other tenant
  // that must never leak into this theme's ranking.
  await db.query(
    `insert into public.social_video_likes (business_id, video_id, theme_key, visitor_token)
     values ($1, $2, 'barber_mens_grooming', 'visitor-2')`,
    [ids.businessA, videoLongA],
  );
  await db.query(
    `insert into public.social_video_likes (business_id, video_id, theme_key, visitor_token)
     values ($1, $2, 'nail_lash_studio', 'visitor-3'),
            ($1, $2, 'nail_lash_studio', 'visitor-4'),
            ($1, $2, 'nail_lash_studio', 'visitor-5')`,
    [ids.businessA, videoOtherTheme],
  );
  await db.query(
    `insert into public.social_video_likes (business_id, video_id, theme_key, visitor_token)
     values ($1, $2, 'barber_mens_grooming', 'visitor-6'),
            ($1, $2, 'barber_mens_grooming', 'visitor-7'),
            ($1, $2, 'barber_mens_grooming', 'visitor-8'),
            ($1, $2, 'barber_mens_grooming', 'visitor-9')`,
    [ids.businessB, videoB],
  );

  // Weekly ranking: theme-aware, kind-aware, Shorts + Long both supported.
  const weekly = await db.query(
    'select * from public.get_weekly_top_videos($1, $2, null, 5)',
    [ids.businessA, 'barber_mens_grooming'],
  );
  assert.deepEqual(
    weekly.rows.map((row) => [row.rank, row.video_id, row.video_kind, row.weekly_likes]),
    [[1, videoShortA, 'short', 2], [2, videoLongA, 'long', 1]],
    'only this theme + this tenant rank, ordered by weekly likes',
  );
  assert.match(weekly.rows[0].week_key, /^\d{4}-W\d{2}$/);

  const longOnly = await db.query(
    "select video_id from public.get_weekly_top_videos($1, 'barber_mens_grooming', 'long', 5)",
    [ids.businessA],
  );
  assert.deepEqual(longOnly.rows.map((row) => row.video_id), [videoLongA]);

  const otherTheme = await db.query(
    "select video_id, weekly_likes from public.get_weekly_top_videos($1, 'nail_lash_studio', null, 5)",
    [ids.businessA],
  );
  assert.deepEqual(
    otherTheme.rows.map((row) => [row.video_id, row.weekly_likes]),
    [[videoOtherTheme, 3]],
    'the other theme ranks only its own video',
  );

  // Likes from a previous week never count toward the current week.
  await db.query(
    `insert into public.social_video_likes (business_id, video_id, theme_key, visitor_token, created_at)
     values ($1, $2, 'barber_mens_grooming', 'last-week', now() - interval '10 days')`,
    [ids.businessA, videoLongA],
  );
  const afterOld = await db.query(
    "select weekly_likes, total_likes from public.get_weekly_top_videos($1, 'barber_mens_grooming', 'long', 5)",
    [ids.businessA],
  );
  assert.equal(afterOld.rows[0].weekly_likes, 1, 'last week is excluded');
  assert.equal(afterOld.rows[0].total_likes, 2, 'all-time still counts it');

  // Toggle RPC: like → unlike from the same session, never a duplicate row.
  await asRole('authenticated', ids.ownerA, async () => {
    const first = await db.query('select public.toggle_social_video_like($1) as result', [videoLongA]);
    assert.equal(first.rows[0].result.liked, true);
    assert.equal(first.rows[0].result.weekly_likes, 2);
    const second = await db.query('select public.toggle_social_video_like($1) as result', [videoLongA]);
    assert.equal(second.rows[0].result.liked, false, 'a repeat like toggles off, never duplicates');
    assert.equal(second.rows[0].result.weekly_likes, 1);
  });

  // A caller with neither a user nor a visitor token cannot like anything.
  await asRole('anon', '', async () => {
    await expectReject(
      () => db.query('select public.toggle_social_video_like($1)', [videoLongA]),
      /session is required/i,
    );
  });

  // RLS: an authenticated caller sees only their OWN salon's like rows plus
  // their own personal likes — never another tenant's visitors.
  await asRole('authenticated', ids.ownerB, async () => {
    const visible = await db.query(
      'select business_id, user_id from public.social_video_likes order by business_id',
    );
    const foreign = visible.rows.filter(
      (row) => row.business_id !== ids.businessB && row.user_id !== ids.ownerB,
    );
    assert.equal(foreign.length, 0, 'no foreign-tenant like rows are readable');
    assert.equal(
      visible.rows.filter((row) => row.business_id === ids.businessB).length,
      4,
      'own salon rows are readable',
    );
  });

  // Direct writes cannot forge another identity.
  await asRole('authenticated', ids.ownerB, async () => {
    await expectReject(
      () => db.query(
        `insert into public.social_video_likes (business_id, video_id, theme_key, user_id)
         values ($1, $2, 'barber_mens_grooming', $3)`,
        [ids.businessB, videoB, ids.ownerA],
      ),
      /row-level security|violates/i,
    );
  });
});

assert.equal(passed, 21);
console.log(`Functional tests: ${passed}/21 passed`);
await db.close();
