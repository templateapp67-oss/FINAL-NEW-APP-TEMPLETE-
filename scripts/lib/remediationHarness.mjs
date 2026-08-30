/**
 * Shared PGlite harness for the 2026-08-28 remediation suites (M60/M61/M62).
 *
 * Replays the canonical Design-B chain (M28 → M62) over the same minimal
 * bootstrap used by the M55 regression, then provisions two fully isolated
 * tenants (owner/salon/service/booking/payment) for cross-tenant assertions.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('../..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

export async function designBChain(maxMigration = 62) {
  // Numeric selection (house rule): every _mNN_ file from 28 through
  // `maxMigration` (default 62 — the original remediation bound; the M65
  // home-service suite extends it to 65).
  const files = (await readdir(migrationDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  return files.filter((name) => {
    const match = /_m(\d{2})_/i.exec(name);
    return match && Number(match[1]) >= 28 && Number(match[1]) <= maxMigration;
  });
}

export const BOOTSTRAP_SQL = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text, phone text,
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
  create table storage.buckets (
    id text primary key, name text not null unique, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id), name text not null, owner_id text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  create table public.profiles (
    id uuid primary key references auth.users(id), full_name text not null default 'User',
    platform_role text not null default 'customer', is_active boolean not null default true,
    avatar_url text, phone text, email text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null);
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'owner', is_active boolean not null default true,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  create table public.salons (
    id uuid primary key default gen_random_uuid(), organization_id uuid not null,
    name text not null, slug text, address text, city text,
    is_active boolean not null default true, deleted_at timestamptz
  );
  create table public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null unique references public.salons(id) on delete cascade,
    slug text not null unique, template_key text not null default 'barber_mens_grooming',
    config jsonb not null default '{}'::jsonb, is_published boolean not null default false,
    published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  create table public.services (
    id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
    name text not null, description text, price_paise bigint not null, duration_minutes integer not null
  );
  create table public.staff (
    id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
    name text not null, role text, is_active boolean not null default true
  );
  create table public.salon_hours (
    id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
    day_of_week smallint not null check (day_of_week between 0 and 6), opens time, closes time,
    is_closed boolean not null default false, unique (salon_id, day_of_week)
  );
  create table public.bookings (
    id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
    customer_id uuid not null, appointment_start timestamptz not null,
    status text not null default 'pending', total_amount_paise bigint not null default 0,
    advance_amount_paise bigint not null default 0, created_at timestamptz not null default now()
  );
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;
`;

export const REMEDIATION_IDS = {
  ownerA: '00000000-0000-4000-8000-0000000060a1',
  ownerB: '00000000-0000-4000-8000-0000000060b1',
  customerA: '00000000-0000-4000-8000-0000000060c1',
  customerB: '00000000-0000-4000-8000-0000000060c2',
  serviceA: '10000000-0000-4000-8000-0000000060a1',
  serviceB: '10000000-0000-4000-8000-0000000060b1',
  bookingA: '20000000-0000-4000-8000-0000000060a1',
  bookingB: '20000000-0000-4000-8000-0000000060b1',
  orderA: '30000000-0000-4000-8000-0000000060a1',
  paymentA: '40000000-0000-4000-8000-0000000060a1',
};

/** Replay the Design-B chain and provision the two isolated demo tenants. */
export async function createRemediationDb({ maxMigration = 62 } = {}) {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db.exec(BOOTSTRAP_SQL);

  const chain = await designBChain(maxMigration);
  for (const file of chain) {
    try {
      await db.exec(await readFile(join(migrationDir, file), 'utf8'));
    } catch (error) {
      throw new Error(`remediation replay failed at ${file}: ${error.message}`, { cause: error });
    }
  }

  const ids = REMEDIATION_IDS;
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
  const asServiceRole = (callback) => asRole('service_role', '', callback);
  const expectSqlState = async (callback, expectedCode) => {
    let caught;
    try {
      await callback();
    } catch (error) {
      caught = error;
    }
    if (!caught) throw new Error(`expected SQLSTATE ${expectedCode}, but the call succeeded`);
    if (caught.code !== expectedCode) {
      throw new Error(`expected SQLSTATE ${expectedCode} but got ${caught.code}: ${caught.message}`);
    }
    return caught;
  };

  await db.query(
    `insert into auth.users (id,email,raw_user_meta_data) values
     ($1,'refund-owner-a@test.test','{"full_name":"Owner A"}'),
     ($2,'refund-owner-b@test.test','{"full_name":"Owner B"}'),
     ($3,'refund-customer-a@test.test','{"full_name":"Customer A"}'),
     ($4,'refund-customer-b@test.test','{"full_name":"Customer B"}')`,
    [ids.ownerA, ids.ownerB, ids.customerA, ids.customerB],
  );
  // M36 keeps profiles in sync with auth.users; enrich the customer rows with
  // contact PII instead of inserting duplicates.
  await db.query(
    `update public.profiles set phone='9000000001', email='customer-a@test.test' where id = $1`,
    [ids.customerA],
  );
  await db.query(
    `update public.profiles set phone='9000000002', email='customer-b@test.test' where id = $1`,
    [ids.customerB],
  );

  const provision = async (ownerId, name, slug) =>
    asRole('authenticated', ownerId, async () =>
      (await db.query(
        'select * from public.provision_owner_salon($1,$2,$3)',
        [name, slug, 'barber_mens_grooming'],
      )).rows[0],
    );

  const salonA = await provision(ids.ownerA, 'Refund Studio A', 'refund-studio-a');
  const salonB = await provision(ids.ownerB, 'Refund Studio B', 'refund-studio-b');

  const themeA = (await db.query(
    `select id from public.themes where theme_id='barber_mens_grooming'`,
  )).rows[0].id;

  await db.query(
    `insert into public.services (id,salon_id,theme_id,name,price_paise,duration_minutes,is_active)
     values ($1,$2,$3,'Haircut + Beard',100000,60,true),
            ($4,$5,$3,'Studio B Cut',80000,45,true)`,
    [ids.serviceA, salonA.out_salon_id, themeA, ids.serviceB, salonB.out_salon_id],
  );

  // tomorrow 10:00 UTC, one hour service
  const dayBase = new Date(Date.now() + 24 * 60 * 60 * 1000);
  dayBase.setUTCHours(10, 0, 0, 0);
  const at = (hours, minutes = 0) => new Date(dayBase.getTime() + (hours * 60 + minutes) * 60 * 1000);

  await db.query(
    `insert into public.bookings
       (id,salon_id,customer_id,appointment_start,appointment_end,status,payment_status,
        total_amount_paise,advance_amount_paise,currency)
     values ($1,$2,$3,$4,$5,'confirmed','paid',100000,100000,'INR'),
            ($6,$7,$8,$9,$10,'confirmed','unpaid',80000,0,'INR')`,
    [
      ids.bookingA, salonA.out_salon_id, ids.customerA, at(0).toISOString(), at(1).toISOString(),
      ids.bookingB, salonB.out_salon_id, ids.customerB, at(0).toISOString(),
      new Date(at(0).getTime() + 45 * 60 * 1000).toISOString(),
    ],
  );
  await db.query(
    `insert into public.booking_services
       (booking_id,salon_id,service_id,service_name_snapshot,price_paise,duration_minutes)
     values ($1,$2,$3,'Haircut + Beard',100000,60),
            ($4,$5,$6,'Studio B Cut',80000,45)`,
    [ids.bookingA, salonA.out_salon_id, ids.serviceA, ids.bookingB, salonB.out_salon_id, ids.serviceB],
  );

  // A captured provider payment for booking A (the refundable surface).
  await db.query(
    `insert into public.payment_orders (id,salon_id,booking_id,provider_order_id,amount_paise,status)
     values ($1,$2,$3,'order_test60A',100000,'paid')`,
    [ids.orderA, salonA.out_salon_id, ids.bookingA],
  );
  await db.query(
    `insert into public.payments (id,salon_id,booking_id,payment_order_id,provider_payment_id,amount_paise,status,verified_at)
     values ($1,$2,$3,$4,'pay_test60A',100000,'captured',now())`,
    [ids.paymentA, salonA.out_salon_id, ids.bookingA, ids.orderA],
  );

  return {
    db,
    ids,
    salonAId: salonA.out_salon_id,
    salonBId: salonB.out_salon_id,
    at,
    asRole,
    asServiceRole,
    expectSqlState,
  };
}
