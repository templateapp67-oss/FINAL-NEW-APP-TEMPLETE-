// Empirical test of the `profiles` RLS + column-privilege contract.
//
// Applies the ACTUAL policy and grant statements from M12 (§profiles), M36
// (§8 narrow column grants + policies) and M37 (conditional
// allow_recently_viewed grant) to PGlite, then exercises them as the
// `authenticated` role — the role a browser JWT actually gets.
//
// Documents what the architecture really is, including where it differs from
// the commonly assumed description.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;

  create schema if not exists auth;
  create schema if not exists private;
  create table auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  -- profiles with the real column set: M11/live base + M36 additions
  -- + the M37 optional preference column.
  create table public.profiles (
    id uuid primary key references auth.users(id),
    full_name text,
    mobile text,
    email text,
    avatar_url text,
    phone text,
    last_seen_at timestamptz,
    platform_role text not null default 'customer',
    is_active boolean not null default false,
    loyalty_points integer not null default 0,
    wallet_balance_paise bigint not null default 0,
    role_assigned_at timestamptz not null default now(),
    role_assigned_by uuid references auth.users(id),
    allow_recently_viewed boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- Faithful stand-in for M36's helper chain.
  create or replace function private.current_platform_role() returns text
  language sql stable security definer set search_path = pg_catalog, public as $$
    select p.platform_role from public.profiles p where p.id = auth.uid() $$;
  create or replace function private.is_admin() returns boolean
  language sql stable security definer set search_path = pg_catalog, public as $$
    select coalesce(private.current_platform_role() = 'admin', false) $$;

  grant usage on schema public, auth, private to anon, authenticated, service_role;
  grant execute on function private.current_platform_role() to authenticated, service_role;
  grant execute on function private.is_admin() to authenticated, service_role;
`);

// --- M36 lines 206-207: RLS enabled AND forced (applies even to the owner) ---
await db.exec(`
  alter table public.profiles enable row level security;
  alter table public.profiles force row level security;
`);

// --- M12 §"Identity and tenant root" (verbatim) ---
await db.exec(`
  create policy profiles_select_self on public.profiles for select to authenticated
    using (id = auth.uid());
  create policy profiles_update_self on public.profiles for update to authenticated
    using (id = auth.uid()) with check (id = auth.uid());
`);

// --- M36 §policies (verbatim) ---
await db.exec(`
  create policy profiles_select_own on public.profiles for select to authenticated
    using (auth.uid() = id);
  create policy profiles_insert_own on public.profiles for insert to authenticated
    with check (auth.uid() = id);
  create policy profiles_update_own on public.profiles for update to authenticated
    using (auth.uid() = id) with check (auth.uid() = id);
  create policy profiles_select_admin on public.profiles for select to authenticated
    using (private.is_admin());
  create policy profiles_update_admin on public.profiles for update to authenticated
    using (private.is_admin()) with check (private.is_admin());
`);

// --- M36 §8 narrow column grants (verbatim) ---
await db.exec(`
  revoke all    on table public.profiles from anon;
  revoke update on table public.profiles from authenticated;
  grant  select on table public.profiles to authenticated;
  grant  insert on table public.profiles to authenticated;
  grant  update (full_name, avatar_url, phone, last_seen_at, updated_at)
                on table public.profiles to authenticated;
`);

// --- M37 §9 conditional preference grant ---
await db.exec(`grant update (allow_recently_viewed) on table public.profiles to authenticated;`);

// --- M36 line 248 ---
await db.exec(`revoke delete on table public.profiles from anon, authenticated;`);

// --- M36 §triggers: the two row-level guards (verbatim logic) ---
// Neither is SECURITY DEFINER, so current_user is the real caller and the
// service_role/postgres trust test behaves as it does in production.
await db.exec(`
  create or replace function public.guard_profile_platform_role()
  returns trigger language plpgsql set search_path = pg_catalog as $$
  declare
    jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
    trusted  boolean;
  begin
    trusted := jwt_role = 'service_role'
               or current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin');
    if not trusted then
      if tg_op = 'INSERT' and new.platform_role <> 'customer' then
        raise exception 'profiles.platform_role is assigned permanently by Nexora'
          using errcode = '42501';
      end if;
      if tg_op = 'UPDATE' and new.platform_role is distinct from old.platform_role then
        raise exception 'profiles.platform_role is assigned permanently by Nexora'
          using errcode = '42501';
      end if;
      if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active
         and not private.is_admin() then
        raise exception 'profiles.is_active is managed by Nexora'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end; $$;

  create or replace function public.guard_profile_financial_fields()
  returns trigger language plpgsql set search_path = pg_catalog as $$
  declare
    jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
    trusted  boolean;
  begin
    trusted := jwt_role = 'service_role'
               or current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin');
    if not trusted and tg_op = 'UPDATE' then
      if new.wallet_balance_paise is distinct from old.wallet_balance_paise
         or new.loyalty_points is distinct from old.loyalty_points then
        raise exception 'Wallet and loyalty balances are maintained by the Nexora server ledger'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end; $$;

  create trigger trg_profiles_platform_role_guard
    before insert or update on public.profiles
    for each row execute function public.guard_profile_platform_role();
  create trigger trg_profiles_financial_guard
    before update on public.profiles
    for each row execute function public.guard_profile_financial_fields();
`);

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const USER_A = '11111111-1111-4000-8000-111111111111';
const USER_B = '22222222-2222-4000-8000-222222222222';
await db.exec(`
  insert into auth.users (id, email) values
    ('${USER_A}','a@example.com'), ('${USER_B}','b@example.com');
  insert into public.profiles (id, full_name, platform_role, is_active, email) values
    ('${USER_A}','User A','customer', true, 'a@example.com'),
    ('${USER_B}','User B','business_user', true, 'b@example.com');
`);

async function asUser(id) {
  await db.exec(`
    select set_config('request.jwt.claim.sub', '${id}', false);
    select set_config('request.jwt.claim.role', 'authenticated', false);
  `);
  await db.exec('set role authenticated');
}
async function asSuperuser() { await db.exec('reset role'); }

async function attempt(sql) {
  try { await db.exec(sql); return { ok: true }; }
  catch (err) { return { ok: false, code: err.code, message: String(err.message).split('\n')[0] }; }
}

// ---------------------------------------------------------------------------
// 1. READ SCOPE — the most commonly mis-stated rule.
// ---------------------------------------------------------------------------
await asUser(USER_A);
const own = await db.query('select id, full_name from public.profiles where id = $1', [USER_A]);
assert.equal(own.rows.length, 1, 'user must be able to read their own profile');
ok('SELECT own profile row: allowed');

// Every policy on profiles is scoped to auth.uid() = id OR private.is_admin().
// There is NO system-wide read policy, so a normal user cannot enumerate others.
const others = await db.query('select id from public.profiles');
assert.equal(others.rows.length, 1, 'a non-admin must see exactly one row (their own)');
assert.equal(others.rows[0].id, USER_A);
ok('SELECT all profiles: returns ONLY own row — read is self-scoped, not system-wide');

const targeted = await db.query('select id from public.profiles where id = $1', [USER_B]);
assert.equal(targeted.rows.length, 0, 'targeted read of another user must be filtered out');
ok('SELECT another user by id: filtered to zero rows (RLS, not an error)');

// ---------------------------------------------------------------------------
// 2. INSERT
// ---------------------------------------------------------------------------
const USER_C = '33333333-3333-4000-8000-333333333333';
await asSuperuser();
await db.exec(`insert into auth.users (id, email) values ('${USER_C}','c@example.com')`);
await asUser(USER_C);
const ins = await attempt(
  `insert into public.profiles (id, full_name, email) values ('${USER_C}','User C','c@example.com')`,
);
assert.ok(ins.ok, `own-row insert must succeed: ${ins.message}`);
ok('INSERT own profile row: allowed');

// with check (auth.uid() = id) must reject inserting a row for someone else.
const USER_D = '44444444-4444-4000-8000-444444444444';
await asSuperuser();
await db.exec(`insert into auth.users (id, email) values ('${USER_D}','d@example.com')`);
await asUser(USER_C);
const insOther = await attempt(
  `insert into public.profiles (id, full_name) values ('${USER_D}','Impostor')`,
);
assert.ok(!insOther.ok, 'inserting a row for another user id must be rejected');
ok('INSERT row for another user id: rejected by WITH CHECK');

// ---------------------------------------------------------------------------
// 2b. INSERT-time escalation.
//
// The table-wide INSERT grant (M36 §8) covers platform_role and is_active, and
// profiles_insert_own only constrains id = auth.uid(). Without the guard
// trigger a user whose row does not yet exist could create it with
// platform_role = 'admin', which private.is_admin() would then honour and
// which would unlock profiles_select_admin / profiles_update_admin over every
// profile in the system. The guard trigger is what closes this.
// ---------------------------------------------------------------------------
const USER_E = '55555555-5555-4000-8000-555555555555';
await asSuperuser();
await db.exec(`insert into auth.users (id, email) values ('${USER_E}','e@example.com')`);
await asUser(USER_E);

const selfAdmin = await attempt(
  `insert into public.profiles (id, full_name, platform_role, is_active)
   values ('${USER_E}','Self Admin','admin', true)`,
);
assert.ok(!selfAdmin.ok, 'self-insert with platform_role=admin MUST be rejected');
assert.equal(selfAdmin.code, '42501', `expected 42501, got ${selfAdmin.code}: ${selfAdmin.message}`);
assert.match(selfAdmin.message, /platform_role is assigned permanently/);
ok('INSERT own row with platform_role=admin: rejected 42501 by guard_profile_platform_role');

const selfBiz = await attempt(
  `insert into public.profiles (id, full_name, platform_role, is_active)
   values ('${USER_E}','Self Biz','business_user', true)`,
);
assert.ok(!selfBiz.ok, 'self-insert with platform_role=business_user MUST be rejected');
assert.equal(selfBiz.code, '42501');
ok('INSERT own row with platform_role=business_user: rejected 42501');

// The legitimate signup insert (platform_role defaults to customer) still works.
const selfCustomer = await attempt(
  `insert into public.profiles (id, full_name) values ('${USER_E}','User E')`,
);
assert.ok(selfCustomer.ok, `default-role insert must succeed: ${selfCustomer.message}`);
await asSuperuser();
const eRole = await db.query('select platform_role from public.profiles where id = $1', [USER_E]);
assert.equal(eRole.rows[0].platform_role, 'customer');
ok('INSERT own row with default platform_role=customer: allowed (the real signup path)');

// And the escalation, had it landed, would indeed have unlocked admin scope —
// proving the guard is load-bearing rather than redundant.
await asSuperuser();
await db.exec(`update public.profiles set platform_role = 'admin' where id = '${USER_E}'`);
await asUser(USER_E);
const asAdmin = await db.query('select count(*)::int as n from public.profiles');
assert.ok(asAdmin.rows[0].n > 1,
  'sanity: an admin-scoped user CAN see all profiles, so blocking admin self-assignment matters');
ok(`Sanity: a platform_role=admin profile sees ${asAdmin.rows[0].n} profiles — the guard is load-bearing`);
await asSuperuser();
await db.exec(`update public.profiles set platform_role = 'customer' where id = '${USER_E}'`);

// ---------------------------------------------------------------------------
// 3. COLUMN-LEVEL ISOLATION — client-editable columns
// ---------------------------------------------------------------------------
await asUser(USER_A);
for (const col of ['full_name', 'avatar_url', 'phone', 'last_seen_at', 'updated_at', 'allow_recently_viewed']) {
  const value = col === 'last_seen_at' || col === 'updated_at' ? 'now()'
    : col === 'allow_recently_viewed' ? 'false'
    : `'x-${col}'`;
  const r = await attempt(`update public.profiles set ${col} = ${value} where id = '${USER_A}'`);
  assert.ok(r.ok, `${col} should be client-editable but got ${r.code} ${r.message}`);
}
ok('UPDATE full_name, avatar_url, phone, last_seen_at, updated_at, allow_recently_viewed: all allowed (6 columns)');

// ---------------------------------------------------------------------------
// 4. SYSTEM-PROTECTED columns — must fail with 42501
// ---------------------------------------------------------------------------
const protectedCols = [
  'platform_role',
  'is_active',
  'wallet_balance_paise',
  'loyalty_points',
  'role_assigned_at',
  'role_assigned_by',
  'email',
];
const codes = {};
for (const col of protectedCols) {
  const value = col === 'is_active' || col === 'allow_recently_viewed' ? 'true'
    : col === 'wallet_balance_paise' || col === 'loyalty_points' ? '999999'
    : col === 'role_assigned_at' ? 'now()'
    : col === 'role_assigned_by' ? `null`
    : `'business_user'`;
  const r = await attempt(`update public.profiles set ${col} = ${value} where id = '${USER_A}'`);
  assert.ok(!r.ok, `${col} must NOT be client-updatable`);
  codes[col] = r.code;
  assert.equal(r.code, '42501', `${col} must fail with 42501, got ${r.code} (${r.message})`);
}
ok(`UPDATE platform_role, is_active, wallet_balance_paise, loyalty_points, role_assigned_at, role_assigned_by, email: all rejected with 42501`);

// The specific escalation named in the spec.
await asUser(USER_A);
const escalate = await attempt(
  `update public.profiles set platform_role = 'business_user', is_active = true where id = '${USER_A}'`,
);
assert.equal(escalate.code, '42501');
await asSuperuser();
const after = await db.query('select platform_role, is_active from public.profiles where id = $1', [USER_A]);
assert.equal(after.rows[0].platform_role, 'customer', 'role must be unchanged');
assert.equal(after.rows[0].is_active, true);
ok('Self-promotion customer -> business_user: rejected 42501, role unchanged');

// ---------------------------------------------------------------------------
// 5. DELETE revoked
// ---------------------------------------------------------------------------
await asUser(USER_A);
const del = await attempt(`delete from public.profiles where id = '${USER_A}'`);
assert.ok(!del.ok, 'delete must be denied');
ok('DELETE own row: denied (M36 revokes DELETE)');

// ---------------------------------------------------------------------------
// 6. Row-scope: cannot update someone else's row even on an allowed column
// ---------------------------------------------------------------------------
await asUser(USER_A);
const cross = await db.query(
  `with u as (update public.profiles set full_name = 'hijacked' where id = '${USER_B}' returning id)
   select count(*)::int as n from u`,
);
assert.equal(cross.rows[0].n, 0, 'cross-user update must affect zero rows');
ok('UPDATE another user row on an allowed column: affects 0 rows (RLS row scope)');

// ---------------------------------------------------------------------------
// 7. The sanctioned backend path still works (SECURITY DEFINER)
// ---------------------------------------------------------------------------
await asSuperuser();
await db.exec(`
  create or replace function public.provision_like_rpc(p_user uuid) returns void
  language plpgsql security definer set search_path = pg_catalog, public as $$
  begin
    update public.profiles
       set platform_role = 'business_user', is_active = true, updated_at = now()
     where id = p_user;
  end; $$;
  grant execute on function public.provision_like_rpc(uuid) to authenticated;
`);
await asUser(USER_A);
const rpc = await attempt(`select public.provision_like_rpc('${USER_A}')`);
assert.ok(rpc.ok, `SECURITY DEFINER path must succeed: ${rpc.message}`);
await asSuperuser();
const promoted = await db.query('select platform_role from public.profiles where id = $1', [USER_A]);
assert.equal(promoted.rows[0].platform_role, 'business_user', 'backend path must be able to promote');
ok('SECURITY DEFINER RPC can update platform_role on the user\'s behalf (the sanctioned path)');

// ---------------------------------------------------------------------------
// 8. Effective policy inventory
// ---------------------------------------------------------------------------
const pols = await db.query(`
  select policyname, cmd from pg_policies
   where schemaname='public' and tablename='profiles' order by cmd, policyname`);
console.log('\n--- effective profiles policies ---');
for (const p of pols.rows) console.log(`  ${p.cmd.padEnd(7)} ${p.policyname}`);
const forced = await db.query(
  `select relrowsecurity, relforcerowsecurity from pg_class where relname='profiles'`);
console.log(`  rls_enabled=${forced.rows[0].relrowsecurity} forced=${forced.rows[0].relforcerowsecurity}`);

const grants = await db.query(`
  select privilege_type, column_name from information_schema.column_privileges
   where table_schema='public' and table_name='profiles' and grantee='authenticated'
   order by privilege_type, column_name`);
console.log('\n--- authenticated column privileges ---');
for (const g of grants.rows) console.log(`  ${g.privilege_type.padEnd(7)} ${g.column_name}`);

await db.close();
console.log(`\nprofiles RLS + column isolation: ${passed}/${passed} checks PASS`);
