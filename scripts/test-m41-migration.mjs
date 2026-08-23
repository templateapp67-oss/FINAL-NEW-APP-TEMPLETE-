/**
 * M41 — website guest bookings migration smoke test (PGlite).
 *
 * Replays the Design B tables M41 depends on (salons, salon_public_websites,
 * services, staff, canonical bookings) against PGlite with a stubbed
 * `auth.role()`, then applies the M41 migration twice (idempotency) and
 * verifies the guest booking pipeline:
 *   1. Migration applies cleanly and is idempotent.
 *   2. website_bookings has RLS enabled with NO client policies (deny-by-default).
 *   3. create_website_booking: service_role only, published-salon check,
 *      server-priced snapshot, phone validation, past-date rejection,
 *      stylist validation, end-time math, slot conflict (guest + canonical),
 *      NX- reference format.
 *   4. get_website_bookings read surface works.
 *   5. verify_m41_website_bookings() self-test passes.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');
const M41 = '20260823000101_m41_website_guest_bookings.sql';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

const db = new PGlite({ extensions: { pgcrypto } });

// ---- Design B base (only what M41 touches) + auth.role() stub ----------
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create or replace function auth.role() returns text
  language sql volatile
  as $$ select coalesce(nullif(current_setting('nexora.role', true), ''), 'anon') $$;

  create table public.salons (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    theme_id uuid,
    name text not null,
    address text,
    city text,
    is_active boolean not null default true,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null,
    slug text not null,
    template_key text,
    config jsonb not null default '{}',
    is_published boolean not null default false,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.services (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid,
    theme_id uuid,
    category_id uuid,
    name text not null,
    description text,
    price_paise bigint,
    duration_minutes integer,
    is_featured boolean,
    display_order integer,
    is_active boolean,
    deleted_at timestamptz,
    created_at timestamptz not null default now()
  );
  create table public.staff (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid,
    is_active boolean
  );
  create table public.bookings (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid,
    customer_id uuid,
    appointment_start timestamptz,
    appointment_end timestamptz,
    status text
  );
  create or replace function public.set_updated_at()
  returns trigger language plpgsql as $$
  begin
    new.updated_at = now();
    return new;
  end
  $$;

  insert into public.salons (id, organization_id, name)
    values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Royal Hair & Beauty Studio');
  insert into public.salon_public_websites (salon_id, slug, is_published, published_at)
    values ('11111111-1111-4111-8111-111111111111', 'royal-hair-studio', true, now());
  insert into public.services (id, salon_id, name, price_paise, duration_minutes, is_active, is_featured, display_order)
    values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Haircut & Blow-Dry Styling', 35000, 30, true, true, 1);
  insert into public.services (id, salon_id, name, price_paise, duration_minutes, is_active, is_featured, display_order)
    values ('33333333-3333-4333-8333-333333333334', '11111111-1111-4111-8111-111111111111', 'Nourishing Hair Spa', 90000, 45, true, false, 2);
  insert into public.staff (id, salon_id, is_active)
    values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', true);
`);

// ---- apply M41 twice (idempotency) -------------------------------------
const m41Sql = await readFile(join(migrationDir, M41), 'utf8');
await db.exec(m41Sql);
await db.exec(m41Sql);
console.log('M41 applied twice (idempotent) ✓');

await db.exec(`select set_config('nexora.role', 'service_role', false)`);
const q = async (sql, params) => {
  const { rows } = await db.query(sql, params || []);
  return rows;
};
// Functions take parameters by POSITION, so every call passes the full,
// canonically ordered argument list.
const BOOKING_FN_ORDER = [
  'p_salon_slug', 'p_service_id', 'p_staff_id', 'p_appointment_date',
  'p_start_time', 'p_customer_name', 'p_customer_phone', 'p_customer_email', 'p_note',
];
const callCreateBooking = (args) => db.query(
  'select * from public.create_website_booking($1,$2,$3,$4,$5,$6,$7,$8,$9)',
  BOOKING_FN_ORDER.map((key) => (args[key] === undefined ? null : args[key])),
).then((result) => result.rows);
const rpc = async (fn, args) => {
  const values = Object.values(args);
  const { rows } = await db.query(
    `select * from public.${fn}(${values.map((_, index) => `$${index + 1}`).join(',')})`,
    values,
  );
  return rows;
};

async function expectError(fn, code, messageFragment) {
  try {
    await fn();
    throw new Error(`expected error ${code}, none thrown`);
  } catch (error) {
    if (error.message === `expected error ${code}, none thrown`) throw error;
    assert.ok(String(error.message).includes(code) || String(error.code || '').includes(code),
      `expected SQLSTATE ${code}, got: ${error.message}`);
    if (messageFragment) assert.ok(error.message.includes(messageFragment), `message mismatch: ${error.message}`);
  }
}

const SALON_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_ID = '33333333-3333-4333-8333-333333333333';
const STAFF_ID = '44444444-4444-4444-8444-444444444444';
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

console.log('M41 — website guest bookings (PGlite)');

await test('RLS enabled, deny-by-default (no client policies)', async () => {
  const rls = await q(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.website_bookings'::regclass`);
  assert.equal(rls[0].relrowsecurity, true);
  const policies = await q(`select count(*)::int as n from pg_policies where tablename = 'website_bookings'`);
  assert.equal(policies[0].n, 0);
});

await test('rejects when not service_role', async () => {
  await db.exec(`select set_config('nexora.role', 'anon', false)`);
  await expectError(() => callCreateBooking({
    p_salon_slug: 'royal-hair-studio', p_service_id: SERVICE_ID, p_staff_id: null,
    p_appointment_date: FUTURE, p_start_time: '10:00', p_customer_name: 'A', p_customer_phone: '9876543210',
  }), '42501');
  await db.exec(`select set_config('nexora.role', 'service_role', false)`);
});

await test('rejects unpublished salon (P0002)', async () => {
  await db.exec(`update public.salon_public_websites set is_published = false where slug = 'royal-hair-studio'`);
  await expectError(() => callCreateBooking({
    p_salon_slug: 'royal-hair-studio', p_service_id: SERVICE_ID, p_staff_id: null,
    p_appointment_date: FUTURE, p_start_time: '10:00', p_customer_name: 'Aisha', p_customer_phone: '+91 98765 43210',
  }), 'P0002');
  await db.exec(`update public.salon_public_websites set is_published = true where slug = 'royal-hair-studio'`);
});

await test('rejects unknown service / bad phone / past date', async () => {
  const base = { p_salon_slug: 'royal-hair-studio', p_staff_id: null, p_start_time: '10:00', p_customer_name: 'Aisha' };
  await expectError(() => callCreateBooking({
    ...base, p_service_id: '99999999-9999-4999-8999-999999999999',
    p_appointment_date: FUTURE, p_customer_phone: '9876543210',
  }), 'P0002');
  await expectError(() => callCreateBooking({
    ...base, p_service_id: SERVICE_ID, p_appointment_date: FUTURE, p_customer_phone: '12345',
  }), '22023');
  await expectError(() => callCreateBooking({
    ...base, p_service_id: SERVICE_ID, p_appointment_date: '2020-01-01', p_customer_phone: '9876543210',
  }), '22023');
});

await test('rejects unknown stylist (P0002)', async () => {
  await expectError(() => callCreateBooking({
    p_salon_slug: 'royal-hair-studio', p_service_id: SERVICE_ID, p_staff_id: '55555555-5555-4555-8555-555555555555',
    p_appointment_date: FUTURE, p_start_time: '10:00', p_customer_name: 'Aisha', p_customer_phone: '9876543210',
  }), 'P0002');
});

let created;
await test('creates a guest booking with server-priced snapshot + NX- reference', async () => {
  const rows = await callCreateBooking({
    p_salon_slug: 'royal-hair-studio', p_service_id: SERVICE_ID, p_staff_id: STAFF_ID,
    p_appointment_date: FUTURE, p_start_time: '10:00', p_customer_name: 'Aisha Verma',
    p_customer_phone: '+91 98765 43210', p_customer_email: 'aisha@example.com', p_note: 'near the college',
  });
  assert.equal(rows.length, 1);
  created = rows[0];
  assert.match(created.booking_reference, /^NX-[0-9]{6}$/);
  assert.equal(created.service_name, 'Haircut & Blow-Dry Styling');
  assert.equal(Number(created.price_paise), 35000);
  assert.equal(Number(created.duration_minutes), 30);
  assert.equal(String(created.end_time).slice(0, 5), '10:30');
  assert.equal(created.status, 'pending');
  const stored = await q(`select customer_phone, customer_name, note, staff_id from public.website_bookings where id = $1`, [created.booking_id]);
  assert.equal(stored[0].customer_phone, '919876543210');
  assert.equal(stored[0].customer_name, 'Aisha Verma');
  assert.equal(stored[0].note, 'near the college');
});

await test('same slot conflicts (23P01)', async () => {
  await expectError(() => callCreateBooking({
    p_salon_slug: 'royal-hair-studio', p_service_id: SERVICE_ID, p_staff_id: null,
    p_appointment_date: FUTURE, p_start_time: '10:15', p_customer_name: 'B', p_customer_phone: '9876500000',
  }), '23P01');
});

await test('non-overlapping slot on the same day succeeds', async () => {
  const rows = await callCreateBooking({
    p_salon_slug: 'royal-hair-studio', p_service_id: SERVICE_ID, p_staff_id: null,
    p_appointment_date: FUTURE, p_start_time: '14:00', p_customer_name: 'B K', p_customer_phone: '9876500000',
  });
  assert.equal(rows.length, 1);
  assert.match(rows[0].booking_reference, /^NX-[0-9]{6}$/);
});

await test('canonical bookings also block slots (cross-system conflict)', async () => {
  // 12:30 UTC == 18:00 IST — canonical appointment stored as a true instant.
  await db.query(`insert into public.bookings (salon_id, appointment_start, appointment_end, status)
    values ($1, $2::date::timestamp + '12:30'::interval, $2::date::timestamp + '13:00'::interval, 'confirmed')`,
    [SALON_ID, FUTURE]);
  await expectError(() => callCreateBooking({
    p_salon_slug: 'royal-hair-studio', p_service_id: SERVICE_ID, p_staff_id: null,
    p_appointment_date: FUTURE, p_start_time: '18:00', p_customer_name: 'C', p_customer_phone: '9876511111',
  }), '23P01');
});

await test('late slot that overflows closing time is rejected', async () => {
  // 45-min service starting at 23:30 wraps past midnight → end <= start.
  const spaService = '33333333-3333-4333-8333-333333333334';
  await expectError(() => callCreateBooking({
    p_salon_slug: 'royal-hair-studio', p_service_id: spaService, p_staff_id: null,
    p_appointment_date: FUTURE, p_start_time: '23:30', p_customer_name: 'D', p_customer_phone: '9876522222',
  }), '22023');
});

await test('get_website_bookings lists the salon bookings', async () => {
  const rows = await rpc('get_website_bookings', { p_salon_id: SALON_ID });
  assert.ok(rows.length >= 2, `expected >= 2 rows, got ${rows.length}`);
  const refs = rows.map((row) => row.booking_reference);
  assert.ok(refs.includes(created.booking_reference));
});

await test('verify_m41_website_bookings() self-test passes', async () => {
  const rows = await q(`select * from public.verify_m41_website_bookings()`);
  const failedChecks = rows.filter((row) => row.passed === false);
  assert.equal(failedChecks.length, 0, JSON.stringify(failedChecks));
  for (const row of rows) console.log(`      - ${row.check_name}: ${row.passed}${row.detail ? ` (${row.detail})` : ''}`);
});

await db.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
