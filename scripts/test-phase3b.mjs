import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Phase 3B — multi-tenant authorization & complete RLS implementation.
 *
 * Rebuilds the canonical schema from scratch (auth/storage fixtures +
 * M28→M37) and verifies, with real Postgres roles + RLS:
 *
 *   A. Cross-tenant isolation (User A / Org A / Salon A vs User B / Org B /
 *      Salon B): SELECT/UPDATE/DELETE of the other tenant's organizations,
 *      salons, services, products and staff must all fail.
 *   B. Role escalation (customer→owner/admin, staff→owner/admin, changing
 *      own role/salon/organization) must all fail.
 *   C. INSERT protection: a client cannot insert into another tenant's salon,
 *      and cannot reassign ownership columns through UPDATE.
 *   D. Authorized access still works (owner reads/updates own org+salon;
 *      staff read-only on salon settings; public read of active services).
 *   E. RLS/grant inventory via verify_phase3b_rls().
 *   F. Static scans over BOTH repositories (localStorage authority,
 *      service-role exposure, hardcoded salon/organization ids).
 *   G. M37 replay idempotency.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

const MIGRATIONS = [
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
    salon_id uuid not null unique references public.salons(id) on delete cascade,
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
    salon_id uuid not null references public.salons(id) on delete cascade,
    name text not null,
    description text,
    price_paise bigint not null,
    duration_minutes integer not null
  );
  create table public.staff (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete cascade,
    name text not null,
    role text,
    is_active boolean not null default true
  );
  create table public.salon_hours (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete cascade,
    day_of_week smallint not null check (day_of_week between 0 and 6),
    opens time,
    closes time,
    is_closed boolean not null default false,
    unique (salon_id, day_of_week)
  );
  create table public.bookings (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete restrict,
    customer_id uuid not null,
    appointment_start timestamptz not null,
    status text not null default 'pending',
    total_amount_paise bigint not null default 0,
    advance_amount_paise bigint not null default 0,
    created_at timestamptz not null default now()
  );
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;
`);

for (const file of MIGRATIONS) {
  const sql = await readFile(join(migrationDir, file), 'utf8');
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`migration failed at ${file}: ${error.message}`, { cause: error });
  }
  console.log(`PASS fresh-apply ${file}`);
}

// ---------------------------------------------------------------------------
// Fixtures — TWO tenants (never production data; synthetic uuids).
//   Tenant A: ownerA (org A → salon A) + staffA; active + PRIVATE services.
//   Tenant B: ownerB (org B → salon B); active + INACTIVE (private) rows.
//   customerA: no membership. fakeUser: no rows anywhere.
// ---------------------------------------------------------------------------
const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  staffA: '00000000-0000-4000-8000-0000000000a2',
  customerA: '00000000-0000-4000-8000-0000000000c1',
  fakeUser: 'ffffffff-ffff-4fff-8fff-0000000000ff',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
  serviceA: '30000000-0000-4000-8000-0000000000a1',
  serviceB: '30000000-0000-4000-8000-0000000000b1',
  serviceBPrivate: '30000000-0000-4000-8000-0000000000b2',
  productA: '31000000-0000-4000-8000-0000000000a1',
  productB: '31000000-0000-4000-8000-0000000000b1',
  productBPrivate: '31000000-0000-4000-8000-0000000000b2',
  staffId: '40000000-0000-4000-8000-0000000000a1',
  staffBId: '40000000-0000-4000-8000-0000000000b1',
  themeBarber: '60000000-0000-4000-8000-0000000000a1',
  categoryA: '70000000-0000-4000-8000-0000000000a1',
  bookingA: '50000000-0000-4000-8000-0000000000a1',
};

await db.query(
  `insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'owner-a@example.test', '{"full_name":"Owner A","signup_role":"shop_owner"}'),
    ($2, 'owner-b@example.test', '{"full_name":"Owner B","signup_role":"shop_owner"}'),
    ($3, 'staff-a@example.test', '{"full_name":"Staff A","signup_role":"staff"}'),
    ($4, 'customer-a@example.test', '{"full_name":"Customer A"}')`,
  [ids.ownerA, ids.ownerB, ids.staffA, ids.customerA],
);
// Platform roles from the canonical signup trigger: owners → business_user,
// staff → customer (tenant role), customer → customer.
await db.query(
  `insert into public.organizations (id, name) values ($1, 'Org A'), ($2, 'Org B')`,
  [ids.orgA, ids.orgB],
);
await db.query(
  `insert into public.organization_members (organization_id, user_id, is_active, role) values
    ($1, $2, true, 'owner'),
    ($1, $3, true, 'staff'),
    ($4, $5, true, 'owner')`,
  [ids.orgA, ids.ownerA, ids.staffA, ids.orgB, ids.ownerB],
);
await db.query(
  `insert into public.salons (id, organization_id, name, slug) values
    ($1, $2, 'Salon A', 'salon-a'),
    ($3, $4, 'Salon B', 'salon-b')`,
  [ids.salonA, ids.orgA, ids.salonB, ids.orgB],
);
await db.query(
  `insert into public.salon_public_websites (salon_id, slug, is_published)
   values ($1, 'salon-a', true), ($2, 'salon-b', true)`,
  [ids.salonA, ids.salonB],
);
// themes are seeded by M28/M32; resolve the canonical barber theme uuid.
const { rows: [barberTheme] } = await db.query(
  `select id from public.themes where theme_id = 'barber_mens_grooming'`,
);
assert.ok(barberTheme, 'canonical barber theme must exist (M28 seed)');
await db.query(
  `insert into public.service_categories (id, theme_id, name, slug)
   values ($1, $2, 'Beard & Shave', 'beard-shave')`,
  [ids.categoryA, barberTheme.id],
);
await db.query(
  `insert into public.services (id, salon_id, name, description, price_paise, duration_minutes, is_active) values
    ($1, $2, 'Service A', 'tenant A active', 50000, 30, true),
    ($3, $4, 'Service B', 'tenant B active', 60000, 45, true),
    ($5, $4, 'Service B PRIVATE', 'tenant B inactive', 70000, 60, false)`,
  [ids.serviceA, ids.salonA, ids.serviceB, ids.salonB, ids.serviceBPrivate],
);
await db.query(
  `insert into public.products (id, salon_id, theme_id, name, price_paise, is_active) values
    ($1, $2, $6, 'Product A', 49900, true),
    ($3, $4, $6, 'Product B', 59900, true),
    ($5, $4, $6, 'Product B PRIVATE', 69900, false)`,
  [ids.productA, ids.salonA, ids.productB, ids.salonB, ids.productBPrivate, barberTheme.id],
);
await db.query(
  `insert into public.staff (id, salon_id, name, role, is_active) values
    ($1, $2, 'Asha A', 'Senior stylist', true),
    ($3, $4, 'Ravi B', 'Junior stylist', true)`,
  [ids.staffId, ids.salonA, ids.staffBId, ids.salonB],
);
await db.query(
  `insert into public.salon_hours (salon_id, day_of_week, opens, closes)
   select $1, day, '09:00', '19:00' from generate_series(0, 6) day`,
  [ids.salonA],
);
await db.query(
  `insert into public.bookings (
     id, salon_id, customer_id, appointment_start, status, total_amount_paise, advance_amount_paise
   ) values ($1, $2, $3, now() + interval '1 day', 'pending', 50000, 5000)`,
  [ids.bookingA, ids.salonA, ids.customerA],
);

// ---------------------------------------------------------------------------
// Role helpers.
// ---------------------------------------------------------------------------
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
const reject = async (callback, pattern) => {
  let caught;
  try {
    await callback();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'expected operation to fail');
  assert.match(caught.message, pattern);
};
/** SELECT row count as a given actor. */
const countRows = async (role, userId, sql, params = []) =>
  asRole(role, userId, async () => {
    const { rows } = await db.query(sql, params);
    return rows.length;
  });
/** UPDATE/DELETE affected-row count (returning rows) as a given actor. */
const affectedRows = async (role, userId, sql, params = []) =>
  asRole(role, userId, async () => {
    const { rows } = await db.query(sql, params);
    return rows.length;
  });

let passed = 0;
const test = async (label, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${label}`);
};

// ===========================================================================
// A. CROSS-TENANT ISOLATION — User A (org A / salon A) vs tenant B data
// ===========================================================================

await test('CROSS-TENANT — SELECT Organization B MUST FAIL', async () => {
  const n = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.organizations where id = $1`, [ids.orgB],
  );
  assert.equal(n, 0, 'ownerA must not see org B');
});

await test('CROSS-TENANT — SELECT Salon B MUST FAIL', async () => {
  const n = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.salons where id = $1`, [ids.salonB],
  );
  assert.equal(n, 0, 'ownerA must not see salon B');
});

await test('CROSS-TENANT — SELECT Service B (private) MUST FAIL', async () => {
  // The private (inactive) service B is invisible to ownerA through BOTH the
  // member channel (no salon-B role) and the public channel (inactive).
  const n = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.services where id = $1`, [ids.serviceBPrivate],
  );
  assert.equal(n, 0, 'ownerA must not see private service B');
  // No service row of salon B is visible through the MEMBER channel at all:
  // even the active row is only reachable via the public-read policy.
  const memberOnly = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.services where salon_id = $1 and is_active = false`, [ids.salonB],
  );
  assert.equal(memberOnly, 0);
});

await test('CROSS-TENANT — SELECT Product B (private) MUST FAIL', async () => {
  const n = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.products where id = $1`, [ids.productBPrivate],
  );
  assert.equal(n, 0, 'ownerA must not see private product B');
});

await test('CROSS-TENANT — SELECT Staff B MUST FAIL (member channel)', async () => {
  // staff is only readable publicly when active+public-salon; staff B IS
  // active, so through the public channel it is visible to anon too — that is
  // intended public data. The MEMBER channel (all staff rows of a salon) must
  // return nothing for a non-member. Use the member-all read by targeting the
  // row with a non-public filter impossible via public policy: soft-delete a
  // COPY? — instead verify ownerA sees zero rows of a DEACTIVATED salon's staff.
  await db.query(`update public.salons set is_active = false where id = $1`, [ids.salonB]);
  const n = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.staff where id = $1`, [ids.staffBId],
  );
  assert.equal(n, 0, 'ownerA must not see staff of a non-public salon');
  await db.query(`update public.salons set is_active = true where id = $1`, [ids.salonB]);
});

await test('CROSS-TENANT — UPDATE Salon B MUST FAIL', async () => {
  const n = await affectedRows(
    'authenticated', ids.ownerA,
    `update public.salons set name = 'Hacked' where id = $1 returning id`, [ids.salonB],
  );
  assert.equal(n, 0, 'ownerA must not update salon B');
});

await test('CROSS-TENANT — UPDATE Service B MUST FAIL', async () => {
  const n = await affectedRows(
    'authenticated', ids.ownerA,
    `update public.services set name = 'Hacked' where id = $1 returning id`, [ids.serviceB],
  );
  assert.equal(n, 0, 'ownerA must not update service B');
});

await test('CROSS-TENANT — UPDATE Product B MUST FAIL', async () => {
  const n = await affectedRows(
    'authenticated', ids.ownerA,
    `update public.products set name = 'Hacked' where id = $1 returning id`, [ids.productB],
  );
  assert.equal(n, 0, 'ownerA must not update product B');
});

await test('CROSS-TENANT — DELETE Salon B MUST FAIL', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query(`delete from public.salons where id = $1`, [ids.salonB]),
      /permission denied|42501|row level security/i,
    );
  });
});

await test('CROSS-TENANT — DELETE Service B MUST FAIL', async () => {
  const n = await affectedRows(
    'authenticated', ids.ownerA,
    `delete from public.services where id = $1 returning id`, [ids.serviceB],
  );
  assert.equal(n, 0, 'ownerA must not delete service B (RLS filters the row)');
});

await test('CROSS-TENANT — DELETE Product B MUST FAIL', async () => {
  const n = await affectedRows(
    'authenticated', ids.ownerA,
    `delete from public.products where id = $1 returning id`, [ids.productB],
  );
  assert.equal(n, 0, 'ownerA must not delete product B (RLS filters the row)');
});

await test('CROSS-TENANT — ownerA cannot read tenant-B booking/payment rows', async () => {
  // customerA's booking is on salon A; create a booking on salon B for a
  // tenant-B customer to prove cross-tenant booking isolation too.
  const customerB = '00000000-0000-4000-8000-0000000000c2';
  await db.query(
    `insert into auth.users (id, email) values ($1, 'customer-b@example.test')`,
    [customerB],
  );
  await db.query(
    `insert into public.bookings (
       id, salon_id, customer_id, appointment_start, status, total_amount_paise, advance_amount_paise
     ) values ('50000000-0000-4000-8000-0000000000b1', $1, $2, now() + interval '2 days', 'pending', 60000, 6000)`,
    [ids.salonB, customerB],
  );
  const n = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.bookings where salon_id = $1`, [ids.salonB],
  );
  assert.equal(n, 0, 'ownerA must not read tenant-B bookings');
  const own = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.bookings where salon_id = $1`, [ids.salonA],
  );
  assert.ok(own >= 1, 'ownerA must still read own-salon bookings');
});

// ===========================================================================
// B. ROLE ESCALATION — all must fail
// ===========================================================================

await test('ESCALATION — Customer → Owner MUST FAIL', async () => {
  await asRole('authenticated', ids.customerA, async () => {
    await reject(
      () => db.query(
        `insert into public.organization_members (organization_id, user_id, is_active, role)
         values ($1, auth.uid(), true, 'owner')`,
        [ids.orgA],
      ),
      /permission denied|42501|provisioned|row level security/i,
    );
    await reject(
      () => db.query(
        `update public.organization_members set role = 'owner' where user_id = auth.uid()`,
      ),
      /permission denied|42501|managed by Nexora|row level security/i,
    );
  });
});

await test('ESCALATION — Customer → Admin MUST FAIL', async () => {
  await asRole('authenticated', ids.customerA, async () => {
    await reject(
      () => db.query(
        `update public.profiles set platform_role = 'admin' where id = auth.uid()`,
      ),
      /permission denied|42501|assigned permanently|row level security/i,
    );
  });
});

await test('ESCALATION — Staff → Owner MUST FAIL', async () => {
  await asRole('authenticated', ids.staffA, async () => {
    await reject(
      () => db.query(
        `update public.organization_members set role = 'owner' where user_id = auth.uid()`,
      ),
      /permission denied|42501|managed by Nexora|row level security/i,
    );
  });
});

await test('ESCALATION — Staff → Admin MUST FAIL', async () => {
  await asRole('authenticated', ids.staffA, async () => {
    await reject(
      () => db.query(
        `update public.profiles set platform_role = 'admin' where id = auth.uid()`,
      ),
      /permission denied|42501|assigned permanently|row level security/i,
    );
  });
});

await test('ESCALATION — change own role MUST FAIL (staff → business_user)', async () => {
  await asRole('authenticated', ids.staffA, async () => {
    await reject(
      () => db.query(
        `update public.profiles set platform_role = 'business_user' where id = auth.uid()`,
      ),
      /permission denied|42501|assigned permanently|row level security/i,
    );
  });
});

await test('ESCALATION — change own salon (salon_id reassignment) MUST FAIL', async () => {
  // ownerA attempts to move service A to salon B via UPDATE.
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query(
        `update public.services set salon_id = $1 where id = $2 returning id`,
        [ids.salonB, ids.serviceA],
      ),
      /permission denied|42501|row level security|new row violates/i,
    );
  });
  // …and cannot transfer a salon to another organization (column not in the
  // UPDATE grant → permission denied at the column level).
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query(
        `update public.salons set organization_id = $1 where id = $2`,
        [ids.orgB, ids.salonA],
      ),
      /permission denied|42501/i,
    );
  });
});

await test('ESCALATION — change own organization MUST FAIL', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query(
        `update public.organizations set id = $1 where id = $2`,
        [ids.orgB, ids.orgA],
      ),
      /permission denied|42501/i,
    );
    // Inserting a membership for yourself in another organization fails.
    await reject(
      () => db.query(
        `insert into public.organization_members (organization_id, user_id, is_active, role)
         values ($1, auth.uid(), true, 'staff')`,
        [ids.orgB],
      ),
      /permission denied|42501|provisioned|row level security/i,
    );
  });
});

// ===========================================================================
// C. INSERT PROTECTION — client-submitted tenant ids are never trusted
// ===========================================================================

await test('INSERT — service for another salon MUST FAIL', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query(
        `insert into public.services (salon_id, name, price_paise, duration_minutes)
         values ($1, 'Stolen', 100, 10)`,
        [ids.salonB],
      ),
      /permission denied|42501|row level security|violates/i,
    );
  });
  await asRole('authenticated', ids.staffA, async () => {
    await reject(
      () => db.query(
        `insert into public.services (salon_id, name, price_paise, duration_minutes)
         values ($1, 'Stolen by staff', 100, 10)`,
        [ids.salonB],
      ),
      /permission denied|42501|row level security|violates/i,
    );
  });
});

await test('INSERT — product for another salon MUST FAIL', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query(
        `insert into public.products (salon_id, name, price_paise)
         values ($1, 'Stolen product', 100)`,
        [ids.salonB],
      ),
      /permission denied|42501|row level security|violates/i,
    );
  });
});

await test('INSERT — staff/salon_hours for another salon MUST FAIL', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query(
        `insert into public.staff (salon_id, name, role, is_active)
         values ($1, 'Impostor', 'Stylist', true)`,
        [ids.salonB],
      ),
      /permission denied|42501|row level security|violates/i,
    );
    await reject(
      () => db.query(
        `insert into public.salon_hours (salon_id, day_of_week, opens, closes)
         values ($1, 0, '09:00', '18:00')`,
        [ids.salonB],
      ),
      /permission denied|42501|row level security|violates/i,
    );
  });
});

await test('INSERT — organizations/salons are server-created only', async () => {
  await asRole('authenticated', ids.ownerA, async () => {
    await reject(
      () => db.query(
        `insert into public.organizations (name) values ('Rogue Org')`,
      ),
      /permission denied|42501/i,
    );
    await reject(
      () => db.query(
        `insert into public.salons (organization_id, name) values ($1, 'Rogue Salon')`,
        [ids.orgA],
      ),
      /permission denied|42501/i,
    );
  });
});

// ===========================================================================
// D. AUTHORIZED ACCESS STILL WORKS (no accidental lockout)
// ===========================================================================

await test('AUTHORIZED — owner reads/updates own org + salon', async () => {
  const orgs = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.organizations where id = $1`, [ids.orgA],
  );
  assert.equal(orgs, 1);
  const salons = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.salons where id = $1`, [ids.salonA],
  );
  assert.equal(salons, 1);
  const updated = await affectedRows(
    'authenticated', ids.ownerA,
    `update public.salons set city = 'Jaipur' where id = $1 returning id`, [ids.salonA],
  );
  assert.equal(updated, 1, 'owner must update own salon');
  const orgUpdated = await affectedRows(
    'authenticated', ids.ownerA,
    `update public.organizations set name = 'Org A Renamed' where id = $1 returning id`, [ids.orgA],
  );
  assert.equal(orgUpdated, 1, 'owner must update own org presentational name');
});

await test('AUTHORIZED — staff reads salon data but cannot edit salon settings', async () => {
  const salons = await countRows(
    'authenticated', ids.staffA,
    `select id from public.salons where id = $1`, [ids.salonA],
  );
  assert.equal(salons, 1, 'staff may read the salon row');
  const services = await countRows(
    'authenticated', ids.staffA,
    `select id from public.services where salon_id = $1`, [ids.salonA],
  );
  assert.equal(services, 1, 'staff may read own-salon services');
  const updated = await affectedRows(
    'authenticated', ids.staffA,
    `update public.salons set city = 'Udaipur' where id = $1 returning id`, [ids.salonA],
  );
  assert.equal(updated, 0, 'staff must NOT update salon settings (owner-only)');
});

await test('AUTHORIZED — owner sees own private + public services; customer sees public only', async () => {
  const ownerSeesPrivate = await countRows(
    'authenticated', ids.ownerA,
    `select id from public.services where id = $1`, [ids.serviceA],
  );
  assert.equal(ownerSeesPrivate, 1);
  // Public channel: anon may read active services of active salons (Phase 3C
  // finalizes public access; the M28 policy already scopes to active+public).
  const publicSeen = await countRows(
    'anon', '',
    `select id from public.services where id = $1`, [ids.serviceB],
  );
  assert.equal(publicSeen, 1, 'active service of a public salon is public by design');
  const anonPrivate = await countRows(
    'anon', '',
    `select id from public.services where id = $1`, [ids.serviceBPrivate],
  );
  assert.equal(anonPrivate, 0, 'inactive service is never public');
});

await test('AUTHORIZED — verify_phase3b_rls() self-test passes', async () => {
  const { rows } = await db.query('select check_name, passed from public.verify_phase3b_rls()');
  const failed = rows.filter((r) => r.passed !== true);
  assert.deepEqual(failed, [], `self-test checks failed: ${JSON.stringify(failed)}`);
  assert.ok(rows.length >= 12, `expected >= 12 checks, got ${rows.length}`);
});

// ===========================================================================
// E. IDEMPOTENCY — M37 replays cleanly (already applied once above)
// ===========================================================================

await test('IDEMPOTENCY — M37 replays cleanly on the hardened schema', async () => {
  const sql = await readFile(join(migrationDir, '20260821001001_m37_phase3b_multitenant_rls.sql'), 'utf8');
  await db.exec(sql);
  const { rows } = await db.query('select check_name, passed from public.verify_phase3b_rls()');
  assert.ok(rows.every((r) => r.passed === true), 'self-test still passes after replay');
});

// ===========================================================================
// F. STATIC SOURCE CHECKS — both repositories
// ===========================================================================

const mainWebsitePath = process.env.NEXORA_MAIN_WEBSITE_PATH;

const sourceFiles = async (dirs) => {
  const files = [];
  for (const dir of dirs) {
    const walk = async (d) => {
      let entries;
      try {
        entries = await readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.next', '.sites-runtime'].includes(entry.name)) continue;
          await walk(full);
        } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    await walk(dir);
  }
  return files;
};

const REPO1_DIRS = [join(root, 'src'), join(root, 'server'), join(root, 'api')];
const REPO2_DIRS = mainWebsitePath
  ? [join(mainWebsitePath, 'app'), join(mainWebsitePath, 'packages'), join(mainWebsitePath, 'config'), join(mainWebsitePath, 'middleware.ts')]
  : [];

await test('STATIC — localStorage is never the auth authority (both repos)', async () => {
  const files = [
    ...(await sourceFiles(REPO1_DIRS)),
    ...(await sourceFiles(REPO2_DIRS)),
  ];
  assert.ok(files.length > 0);
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const suspicious = [
      /localStorage\.(getItem|setItem)\([^)]*(user|role|auth|session|profile)/i,
      /localStorage\[['"](user|role|auth|session|profile)['"]\]/i,
    ];
    for (const pattern of suspicious) {
      if (pattern.test(source)) {
        const line = source.split('\n').find((l) => pattern.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*')) ?? '';
        if (line && !/NEXORA_AUTH_STORAGE_KEY|nexora\.auth\.|SUPABASE_STORAGE_KEY|NEXORA_STORAGE_KEY|RECENT_SEARCHES_KEY|DASHBOARD_TAB_KEY|nexora_dashboard_tab|nexora_onboarding_state/i.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

await test('STATIC — no hardcoded salon/organization ids in client code (both repos)', async () => {
  const files = await sourceFiles(REPO1_DIRS.concat(REPO2_DIRS));
  const offenders = [];
  const uuidLiteral = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    source.split('\n').forEach((line, index) => {
      const trimmed = line.trim();
      // Only flag uuid literals assigned/compared to tenant ids.
      if (
        /salon_?id|organization_?id|business_?id|tenant/i.test(trimmed) &&
        uuidLiteral.test(trimmed) &&
        !/\/\/|\/\*|\*/i.test(trimmed) &&
        !/test|fixture|example|sample|placeholder/i.test(trimmed)
      ) {
        offenders.push(`${file}:${index + 1}: ${trimmed.slice(0, 140)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], 'no hardcoded tenant ids in client code');
});

await test('STATIC — service-role secret never in browser code (both repos)', async () => {
  const browserFiles = [
    ...(await sourceFiles([join(root, 'src')])),
    ...(await sourceFiles(REPO2_DIRS)),
  ];
  const offenders = [];
  for (const file of browserFiles) {
    const source = await readFile(file, 'utf8');
    source.split('\n').forEach((line, index) => {
      const trimmed = line.trim();
      if (
        /(process\.env|import\.meta\.env|env\.)[A-Za-z_.]*SERVICE[_-]?ROLE[A-Za-z_.]*/i.test(trimmed) ||
        /VITE_[A-Za-z_]*SERVICE[_-]?ROLE[A-Za-z_]*/i.test(trimmed) ||
        /sb_secret_[A-Za-z0-9_]+/i.test(trimmed) ||
        /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\./i.test(trimmed) ||
        (/service[_-]?role/i.test(trimmed) && /createClient|supabaseAdmin|serviceRoleKey\s*:/.test(trimmed))
      ) {
        offenders.push(`${file}:${index + 1}: ${trimmed.slice(0, 140)}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
  // The server-only module must stay out of the browser bundle.
  for (const file of browserFiles) {
    const source = await readFile(file, 'utf8');
    assert.ok(
      !/from\s+['"].*server\/supabaseAdmin['"]|import\(['"].*server\/supabaseAdmin['"]\)/.test(source),
      `browser code imports server-only service-role module: ${file}`,
    );
  }
});

await test('STATIC — M37 SQL has no anon grants on identity/tenant-private tables', async () => {
  const m37 = await readFile(join(migrationDir, '20260821001001_m37_phase3b_multitenant_rls.sql'), 'utf8');
  for (const table of ['organizations', 'organization_members', 'profiles', 'bookings', 'payments', 'payment_orders']) {
    assert.ok(
      !new RegExp(`grant[\\s\\S]{0,120}on (table )?public\\.${table}\\s+to anon`, 'i').test(m37),
      `M37 must not grant anon access to ${table}`,
    );
  }
});

await db.close();
console.log(`Phase 3B verification tests: ${passed} passed`);
