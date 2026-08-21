import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');
const migrationFiles = [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
];
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
  $$;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    owner_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;

  create table public.profiles (
    id uuid primary key references auth.users(id),
    platform_role text not null default 'customer',
    is_active boolean not null default true
  );
  create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null
  );
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    is_active boolean not null default true
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

  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;
  grant select on public.profiles, public.organizations, public.organization_members,
    public.salons, public.salon_public_websites, public.services, public.staff,
    public.salon_hours, public.bookings to anon, authenticated, service_role;
  grant insert, update, delete on public.bookings to authenticated, service_role;
`);

for (const file of migrationFiles) {
  const sql = await readFile(join(migrationDir, file), 'utf8');
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`Phase 1A migration failed at ${file}: ${error.message}`, { cause: error });
  }
  console.log(`PASS apply ${file}`);
}

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  customerA: '00000000-0000-4000-8000-0000000000c1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
  serviceA: '30000000-0000-4000-8000-0000000000a1',
  serviceB: '30000000-0000-4000-8000-0000000000b1',
  staffA: '40000000-0000-4000-8000-0000000000a1',
};
await db.query(`insert into auth.users (id, email) values
  ($1, 'owner-a@example.test'), ($2, 'owner-b@example.test'), ($3, 'customer@example.test')`,
  [ids.ownerA, ids.ownerB, ids.customerA]);
await db.query(`update public.profiles set platform_role = case
  when id in ($1, $2) then 'business_user' else 'customer' end
  where id in ($1, $2, $3)`, [ids.ownerA, ids.ownerB, ids.customerA]);
assert.equal((await db.query('select count(*)::int as count from public.profiles')).rows[0].count, 3);
console.log('PASS auth.users creates one canonical profile when no existing trigger is installed');
await db.query(`insert into public.organizations (id, name) values ($1, 'A'), ($2, 'B')`, [ids.orgA, ids.orgB]);
await db.query(`insert into public.organization_members (organization_id, user_id, is_active, role)
  values ($1, $2, true, 'owner'), ($3, $4, true, 'owner')`, [ids.orgA, ids.ownerA, ids.orgB, ids.ownerB]);
await db.query(`insert into public.salons (id, organization_id, name, slug)
  values ($1, $2, 'Salon A', 'salon-a'), ($3, $4, 'Salon B', 'salon-b')`,
  [ids.salonA, ids.orgA, ids.salonB, ids.orgB]);
await db.query(`insert into public.salon_public_websites (salon_id, slug, is_published)
  values ($1, 'salon-a', true), ($2, 'salon-b', true)`, [ids.salonA, ids.salonB]);
await db.query(`insert into public.services (id, salon_id, name, price_paise, duration_minutes)
  values ($1, $2, 'Cut', 50000, 30), ($3, $4, 'Other', 90000, 45)`, 
  [ids.serviceA, ids.salonA, ids.serviceB, ids.salonB]);
await db.query(`insert into public.staff (id, salon_id) values ($1, $2)`, [ids.staffA, ids.salonA]);

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
  try { return await callback(); } finally { await resetRole(); }
};
const reject = async (callback, pattern) => {
  let caught;
  try { await callback(); } catch (error) { caught = error; }
  assert.ok(caught, 'expected operation to fail');
  assert.match(caught.message, pattern);
};

await asRole('anon', '', async () => {
  const catalogue = await db.query('select id, name, slug, address, city from public.public_salon_catalog order by id');
  assert.deepEqual(catalogue.rows.map((row) => row.id), [ids.salonA, ids.salonB]);
  await reject(() => db.query('select * from public.salons'), /permission denied/i);
});
console.log('PASS public salon projection exposes safe columns and blocks root-table reads');

await asRole('authenticated', ids.ownerA, async () => {
  const salons = await db.query('select public.owner_salon_ids() as id');
  assert.deepEqual(salons.rows.map((row) => row.id), [ids.salonA]);
});
console.log('PASS canonical owner resolver is tenant scoped');

const start = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
let bookingId;
await asRole('service_role', '', async () => {
  const created = await db.query(
    `select * from public.create_authoritative_customer_booking(
      $1, $2, array[$3::uuid], $4, $5, 'booking-request-0001', repeat('a', 64)
    )`,
    [ids.customerA, ids.salonA, ids.serviceA, ids.staffA, start],
  );
  assert.equal(Number(created.rows[0].amount_paise), 50000);
  bookingId = created.rows[0].booking_id;
  const repeated = await db.query(
    `select * from public.create_authoritative_customer_booking(
      $1, $2, array[$3::uuid], $4, $5, 'booking-request-0001', repeat('a', 64)
    )`,
    [ids.customerA, ids.salonA, ids.serviceA, ids.staffA, start],
  );
  assert.equal(repeated.rows[0].booking_id, bookingId);
});
console.log('PASS authoritative booking quote and idempotency');

await asRole('authenticated', ids.customerA, async () => {
  await reject(
    () => db.query(`insert into public.bookings (
      salon_id, customer_id, appointment_start, status, total_amount_paise
    ) values ($1, $2, $3, 'pending', 1)`, [ids.salonA, ids.customerA, start]),
    /authoritative booking API/i,
  );
});
console.log('PASS browser cannot forge a customer booking amount');

await asRole('service_role', '', async () => {
  const quote = await db.query('select * from public.get_booking_payment_quote($1, $2)', [ids.customerA, bookingId]);
  assert.equal(Number(quote.rows[0].amount_paise), 50000);
  await reject(
    () => db.query(`select * from public.record_razorpay_order(
      $1, $2, 'order_bad_amount', 1, 'INR', null
    )`, [ids.customerA, bookingId]),
    /amount|quote|match/i,
  );
  const order = await db.query(`select * from public.record_razorpay_order(
    $1, $2, 'order_phase1a_001', 50000, 'INR', null
  )`, [ids.customerA, bookingId]);
  assert.equal(Number(order.rows[0].amount_paise), 50000);
  const payment = await db.query(`select public.confirm_verified_razorpay_payment(
    $1, 'order_phase1a_001', 'pay_phase1a_001', repeat('b', 64), 'upi'
  ) as id`, [ids.customerA]);
  const repeated = await db.query(`select public.confirm_verified_razorpay_payment(
    $1, 'order_phase1a_001', 'pay_phase1a_001', repeat('b', 64), 'upi'
  ) as id`, [ids.customerA]);
  assert.equal(repeated.rows[0].id, payment.rows[0].id);
});
console.log('PASS payment amount validation and duplicate confirmation idempotency');

await asRole('service_role', '', async () => {
  const first = await db.query(`select public.ingest_verified_payment_webhook(
    'razorpay', 'payment.captured', '{"event":"payment.captured"}'::jsonb,
    repeat('c', 64), 'event-phase1a-001'
  ) as id`);
  const duplicate = await db.query(`select public.ingest_verified_payment_webhook(
    'razorpay', 'payment.captured', '{"event":"payment.captured"}'::jsonb,
    repeat('c', 64), 'event-phase1a-001'
  ) as id`);
  assert.equal(duplicate.rows[0].id, first.rows[0].id);
  assert.equal((await db.query('select public.process_payment_webhook($1) as ok', [first.rows[0].id])).rows[0].ok, true);
  await reject(
    () => db.query(`update public.payment_webhook_events set payload='{}'::jsonb where id=$1`, [first.rows[0].id]),
    /immutable/i,
  );
});
console.log('PASS webhook ingress is idempotent, processable, and evidence-immutable');

await db.query(`insert into public.business_locations (
  salon_id, latitude, longitude, address_label, approval_status, submitted_by
) values ($1, 26.9124, 75.7873, 'Jaipur', 'pending', $2)`, [ids.salonA, ids.ownerA]);
await asRole('anon', '', async () => {
  const pending = await db.query('select salon_id from public.business_locations');
  assert.equal(pending.rows.length, 0);
});
await db.query(`update public.business_locations set approval_status='approved', approved_by=$1, approved_at=now()
  where salon_id=$2`, [ids.ownerA, ids.salonA]);
await asRole('anon', '', async () => {
  const approved = await db.query('select salon_id from public.business_locations');
  assert.deepEqual(approved.rows.map((row) => row.salon_id), [ids.salonA]);
});
console.log('PASS pending locations stay private and approved locations are public');

await asRole('authenticated', ids.ownerA, async () => {
  await db.query(`insert into storage.objects (bucket_id, name)
    values ('salon-media', $1)`, [`salon/${ids.salonA}/gallery/a.webp`]);
  await reject(
    () => db.query(`insert into storage.objects (bucket_id, name)
      values ('salon-media', $1)`, [`salon/${ids.salonB}/gallery/b.webp`]),
    /row-level security/i,
  );
});
console.log('PASS storage object paths enforce salon tenant isolation');

await db.close();
console.log('Phase 1A foundation tests: 11/11 passed');
