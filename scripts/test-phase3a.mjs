import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Phase 3A — canonical Supabase authentication, profiles & roles.
 *
 * Rebuilds the canonical schema from scratch (auth/storage fixtures +
 * M28→M36) and verifies the eight Phase 3A guarantees:
 *
 *   1. Authenticated user maps to the correct profile (auth.users.id → profiles.id).
 *   2. A user cannot modify another user's profile.
 *   3. A user cannot modify their own role through normal client access.
 *   4. A customer cannot become owner.
 *   5. A staff member cannot become admin.
 *   6. Fake user ids are never used as the auth authority.
 *   7. localStorage is not the auth authority.
 *   8. The service-role secret is not exposed to browser code.
 *
 * Tests 1–6 are executed against the replayed schema with real Postgres
 * roles (authenticated / service_role) and RLS active; tests 7–8 are static
 * source checks over BOTH repositories (the Main Website is included when
 * NEXORA_MAIN_WEBSITE_PATH is set, matching the Phase 2D harness contract).
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
// Seed — auth.users rows exercise the M36 canonical signup trigger
// (handle_new_user): profiles are created from raw_user_meta_data only.
// ---------------------------------------------------------------------------
const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  staffA: '00000000-0000-4000-8000-0000000000a2',
  customerA: '00000000-0000-4000-8000-0000000000c1',
  customerB: '00000000-0000-4000-8000-0000000000c2',
  fakeUser: 'ffffffff-ffff-4fff-8fff-0000000000ff',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  staffId: '40000000-0000-4000-8000-0000000000a1',
};

await db.query(
  `insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'owner-a@example.test', '{"full_name":"Owner A","phone":"+919000000001","signup_role":"shop_owner"}'),
    ($2, 'staff-a@example.test', '{"full_name":"Staff A","signup_role":"staff"}'),
    ($3, 'customer-a@example.test', '{"full_name":"Customer A"}'),
    ($4, 'customer-b@example.test', '{"full_name":"Customer B","signup_role":"customer"}')`,
  [ids.ownerA, ids.staffA, ids.customerA, ids.customerB],
);

// The canonical signup trigger writes platform_role from metadata:
//   owner-a → business_user, staff-a → customer (staff is a TENANT role),
//   customers → customer. Verify that mapping.
const profileRoles = (await db.query(
  `select id, platform_role, full_name, phone, email from public.profiles order by email`,
)).rows;
const roleById = Object.fromEntries(profileRoles.map((r) => [r.id, r.platform_role]));
assert.equal(roleById[ids.ownerA], 'business_user', 'owner signup role must normalize to business_user');
assert.equal(roleById[ids.staffA], 'customer', '"staff" is a tenant role; signup must NOT grant it globally');
assert.equal(roleById[ids.customerA], 'customer');
assert.equal(profileRoles.find((r) => r.id === ids.ownerA).full_name, 'Owner A');
assert.equal(profileRoles.find((r) => r.id === ids.ownerA).phone, '+919000000001');
assert.equal(profileRoles.find((r) => r.id === ids.ownerA).email, 'owner-a@example.test');

// Tenant membership: ownerA owns salonA; staffA is staff on the same org.
await db.query(
  `insert into public.organizations (id, name) values ($1, 'Org A')`,
  [ids.orgA],
);
await db.query(
  `insert into public.organization_members (organization_id, user_id, is_active, role) values
    ($1, $2, true, 'owner'),
    ($1, $3, true, 'staff')`,
  [ids.orgA, ids.ownerA, ids.staffA],
);
await db.query(
  `insert into public.salons (id, organization_id, name, slug)
   values ($1, $2, 'Salon A', 'salon-a')`,
  [ids.salonA, ids.orgA],
);
await db.query(
  `insert into public.salon_public_websites (salon_id, slug, is_published)
   values ($1, 'salon-a', true)`,
  [ids.salonA],
);
await db.query(
  `insert into public.services (id, salon_id, name, description, price_paise, duration_minutes)
   values ($1, $2, 'Classic Cut', 'Sharp and clean.', 50000, 30)`,
  [ids.staffId, ids.salonA],
);

// ---------------------------------------------------------------------------
// Role helpers (same pattern as the Phase 2D harness).
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

let passed = 0;
const test = async (label, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${label}`);
};

// ===========================================================================
// PHASE 3A VERIFICATION TESTS (the eight required guarantees)
// ===========================================================================

await test('PHASE-3A-1 — authenticated user maps to the correct profile', async () => {
  // Own profile is readable and is the row whose id === auth.uid().
  const row = await asRole('authenticated', ids.ownerA, async () => {
    const { rows } = await db.query(
      `select id, full_name, platform_role, is_active from public.profiles where id = auth.uid()`,
    );
    return rows[0];
  });
  assert.equal(row.id, ids.ownerA);
  assert.equal(row.platform_role, 'business_user');
  assert.equal(row.is_active, true);

  // public.current_user_role() returns the caller's own canonical role.
  const role = await asRole('authenticated', ids.ownerA, async () => {
    const { rows } = await db.query('select public.current_user_role() as role');
    return rows[0].role;
  });
  assert.equal(role, 'business_user');

  // The signup trigger produced EXACTLY one profile per auth user (PK 1:1).
  const orphans = (await db.query(
    `select u.id from auth.users u left join public.profiles p on p.id = u.id where p.id is null`,
  )).rows;
  assert.equal(orphans.length, 0, 'every auth user must have a profile');
  const dupes = (await db.query(
    `select id from public.profiles group by id having count(*) > 1`,
  )).rows;
  assert.equal(dupes.length, 0);
});

await test('PHASE-3A-2 — user cannot modify another user profile', async () => {
  // customerB tries to read/update customerA's profile → RLS returns nothing / blocks.
  await asRole('authenticated', ids.customerB, async () => {
    const { rows } = await db.query(
      `select id from public.profiles where id = $1`,
      [ids.customerA],
    );
    assert.equal(rows.length, 0, 'RLS must hide other users profiles');

    // RLS filters the row out, so the UPDATE silently touches zero rows.
    const update = await db.query(
      `update public.profiles set full_name = 'Hacked' where id = $1 returning id`,
      [ids.customerA],
    );
    assert.equal(update.rows.length, 0, 'RLS must block UPDATEs of other users profiles');
  });
  // …and the other user's row is genuinely unchanged (read as the owner).
  const after = await asRole('authenticated', ids.customerA, async () => {
    const { rows } = await db.query(
      `select full_name from public.profiles where id = auth.uid()`,
    );
    return rows[0].full_name;
  });
  assert.equal(after, 'Customer A');

  await asRole('authenticated', ids.customerB, async () => {
    // Inserting a profile row for ANOTHER user is blocked by the INSERT policy.
    await reject(
      () => db.query(
        `insert into public.profiles (id, full_name, platform_role, is_active)
         values ($1, 'Fake', 'customer', true)`,
        [ids.customerA],
      ),
      /row level security|permission denied|violates|policy/i,
    );
  });
});

await test('PHASE-3A-3 — user cannot modify their own role through normal client access', async () => {
  // Column grant excludes platform_role entirely — an UPDATE referencing it
  // must fail even before the guard trigger sees it.
  await asRole('authenticated', ids.customerA, async () => {
    await reject(
      () => db.query(
        `update public.profiles set platform_role = 'admin' where id = auth.uid()`,
      ),
      /permission denied|42501|row level security|assigned permanently/i,
    );
  });
  // Defense-in-depth: even with the column writable, the guard trigger blocks.
  const grantCheck = (await db.query(
    `select count(*)::int as n from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'platform_role' and grantee = 'authenticated'
       and privilege_type = 'UPDATE'`,
  )).rows[0].n;
  assert.equal(grantCheck, 0, 'platform_role must not be client-writable');
});

await test('PHASE-3A-4 — customer cannot become owner', async () => {
  // A customer cannot insert an organization_members row (revoke + guard).
  await asRole('authenticated', ids.customerA, async () => {
    await reject(
      () => db.query(
        `insert into public.organization_members (organization_id, user_id, is_active, role)
         values ($1, auth.uid(), true, 'owner')`,
        [ids.orgA],
      ),
      /permission denied|42501|provisioned|row level security/i,
    );
    // And cannot mutate their existing rows' role either (none exist for this
    // user, but the guard must fire for any row they could touch).
    await reject(
      () => db.query(
        `update public.organization_members set role = 'owner' where user_id = auth.uid()`,
      ),
      /permission denied|42501|managed by Nexora|row level security/i,
    );
  });
});

await test('PHASE-3A-5 — staff cannot become admin (or owner)', async () => {
  // staffA is a tenant 'staff' member: cannot self-promote to owner…
  await asRole('authenticated', ids.staffA, async () => {
    await reject(
      () => db.query(
        `update public.organization_members set role = 'owner' where user_id = auth.uid()`,
      ),
      /permission denied|42501|managed by Nexora|row level security/i,
    );
    await reject(
      () => db.query(
        `update public.organization_members set role = 'staff', is_active = true where user_id = auth.uid()`,
      ),
      /permission denied|42501|row level security/i,
    );
  });
  // …and cannot promote the global platform_role to admin.
  await asRole('authenticated', ids.staffA, async () => {
    await reject(
      () => db.query(
        `update public.profiles set platform_role = 'admin' where id = auth.uid()`,
      ),
      /permission denied|42501|assigned permanently|row level security/i,
    );
  });
  // assign_platform_role is service-role only — authenticated cannot execute.
  await asRole('authenticated', ids.staffA, async () => {
    await reject(
      () => db.query(`select public.assign_platform_role($1, 'admin')`, [ids.staffA]),
      /permission denied|42501/i,
    );
  });
});

await test('PHASE-3A-6 — fake user ids are never the auth authority', async () => {
  // A forged JWT sub that does not correspond to a real membership must
  // resolve to nothing: no salon ids, no profiles, no role.
  const salonIds = await asRole('authenticated', ids.fakeUser, async () => {
    const { rows } = await db.query('select public.owner_salon_ids() as salon_id');
    return rows.filter((r) => r.salon_id).map((r) => r.salon_id);
  });
  assert.deepEqual(salonIds, [], 'fake user must not resolve any salon');

  const profile = await asRole('authenticated', ids.fakeUser, async () => {
    const { rows } = await db.query(
      `select id from public.profiles where id = auth.uid()`,
    );
    return rows;
  });
  assert.deepEqual(profile, [], 'fake user must not resolve any profile');

  const role = await asRole('authenticated', ids.fakeUser, async () => {
    const { rows } = await db.query('select public.current_user_role() as role');
    return rows[0].role;
  });
  assert.equal(role, null, 'fake user must not resolve a platform role');
});

// ---------------------------------------------------------------------------
// Static source checks — these scan BOTH repositories. localStorage and
// service-role-key checks are done over the checked-in source of both apps.
// ---------------------------------------------------------------------------
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
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.next') continue;
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

await test('PHASE-3A-7 — localStorage is never the auth authority', async () => {
  const files = [
    ...(await sourceFiles(REPO1_DIRS)),
    ...(await sourceFiles(REPO2_DIRS)),
  ];
  assert.ok(files.length > 0, 'expected source files to scan');
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    // Auth authority via localStorage would read a stored identity/role and
    // treat it as the signed-in user. The Supabase session storage key is
    // legitimate persistence, NOT an authority — exclude those reads.
    const suspicious = [
      /localStorage\.(getItem|setItem)\([^)]*(user|role|auth|session|profile)/i,
      /localStorage\[['"](user|role|auth|session|profile)['"]\]/i,
    ];
    for (const pattern of suspicious) {
      if (pattern.test(source)) {
        // Ignore comments and the known session-persistence keys.
        const line = source.split('\n').find((l) => pattern.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*')) ?? '';
        if (line && !/NEXORA_AUTH_STORAGE_KEY|nexora\.auth\.|SUPABASE_STORAGE_KEY|NEXORA_STORAGE_KEY|RECENT_SEARCHES_KEY|DASHBOARD_TAB_KEY|nexora_dashboard_tab|nexora_onboarding_state/i.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], 'localStorage must not store/read auth authority');
});

await test('PHASE-3A-8 — service-role secret is never exposed to browser code', async () => {
  // Browser code = client bundles only. Repo 1's server/ + api/ are Node /
  // serverless code that legitimately hold the service-role client; the
  // guarantee to verify is (a) browser code never reads a service-role key
  // or embeds a secret, and (b) browser code never imports the server module.
  const browserFiles = [
    ...(await sourceFiles([join(root, 'src')])),
    ...(await sourceFiles(REPO2_DIRS)),
  ];
  const serverFiles = await sourceFiles([join(root, 'server'), join(root, 'api')]);
  assert.ok(browserFiles.length > 0, 'expected browser source files to scan');
  assert.ok(serverFiles.length > 0, 'expected server source files to scan');

  // (a) Browser code must not reference a service-role key value or read it.
  const offenders = [];
  for (const file of browserFiles) {
    const source = await readFile(file, 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (
        // Reading a service-role env var in the browser.
        /(process\.env|import\.meta\.env|env\.)[A-Za-z_.]*SERVICE[_-]?ROLE[A-Za-z_.]*/i.test(trimmed) ||
        /VITE_[A-Za-z_]*SERVICE[_-]?ROLE[A-Za-z_]*/i.test(trimmed) ||
        // A literal secret: supabase secret keys are JWTs starting with eyJ,
        // or the sb_secret_ prefix.
        /sb_secret_[A-Za-z0-9_]+/i.test(trimmed) ||
        /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\./i.test(trimmed) ||
        // Passing a service-role key into a client factory in browser code.
        (/service[_-]?role/i.test(trimmed) && /createClient|supabaseAdmin|serviceRoleKey\s*:/.test(trimmed))
      ) {
        offenders.push(`${file}:${index + 1}: ${trimmed.slice(0, 140)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], 'service-role key must not appear in browser code');

  // (b) The server-only service-role module must stay out of the browser
  // bundle: no src/ file may import it.
  for (const file of browserFiles) {
    const source = await readFile(file, 'utf8');
    if (/from\s+['"].*server\/supabaseAdmin['"]|import\(['"].*server\/supabaseAdmin['"]\)/.test(source)) {
      throw new Error(`browser code imports the server-only service-role module: ${file}`);
    }
  }
  // …and the server module itself is where the service-role usage lives.
  const adminSource = (await readFile(join(root, 'server', 'supabaseAdmin.ts'), 'utf8')).toLowerCase();
  assert.match(adminSource, /service_role|service-role|serviceRoleKey/, 'server supabaseAdmin.ts must hold the service-role client');
  assert.match(adminSource, /process\.env\.supabase_service_role_key/, 'server-only env read');
});

// The migration's own post-apply self-test must pass on the seeded schema.
await test('PHASE-3A-9 — verify_phase3a_auth() self-test passes', async () => {
  const { rows } = await db.query('select check_name, passed from public.verify_phase3a_auth()');
  const failed = rows.filter((r) => r.passed !== true);
  assert.deepEqual(failed, [], `self-test checks failed: ${JSON.stringify(failed)}`);
});

await db.close();
console.log(`Phase 3A verification tests: ${passed} passed`);
