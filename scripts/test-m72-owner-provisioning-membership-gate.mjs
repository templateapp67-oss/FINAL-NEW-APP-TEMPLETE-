import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationPath = join(
  root,
  'supabase',
  'migrations',
  '20260902000301_m72_owner_provisioning_trusted_membership.sql',
);
const migrationSql = await readFile(migrationPath, 'utf8');
let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema auth;
  create schema private;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated, service_role;

  create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null
  );
  create table public.organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null,
    role text not null,
    status text not null default 'invited',
    invited_by uuid,
    joined_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, user_id)
  );

  create or replace function private.protect_organization_membership_fields()
  returns trigger language plpgsql security definer set search_path='' as $$
  declare
    via_trusted_rpc boolean := coalesce(current_setting('app.membership_rpc_trusted', true), '') = 'true';
  begin
    if via_trusted_rpc then return new; end if;
    if tg_op='INSERT' and (
      new.status <> 'invited'
      or new.joined_at is not null
      or new.invited_by is distinct from auth.uid()
    ) then
      raise exception 'new memberships must be server-activated invitations' using errcode='P0001';
    end if;
    if tg_op='UPDATE' and (
      new.status is distinct from old.status
      or new.joined_at is distinct from old.joined_at
    ) then
      raise exception 'membership status and joined_at require admin/server access' using errcode='P0001';
    end if;
    return new;
  end $$;
  create trigger organization_members_protect_fields
    before insert or update on public.organization_members
    for each row execute function private.protect_organization_membership_fields();
  grant insert, update, select on public.organization_members to authenticated;

  -- Reproduce M54 before M72: compatible columns, but no trusted gate.
  create or replace function private.nexora_upsert_owner_membership(p_organization_id uuid, p_user_id uuid)
  returns void language plpgsql security definer set search_path='' as $$
  begin
    insert into public.organization_members(organization_id,user_id,role,status)
    values (p_organization_id,p_user_id,'owner','active')
    on conflict (organization_id,user_id)
    do update set role='owner',status='active';
  end $$;
  revoke all on function private.nexora_upsert_owner_membership(uuid,uuid) from public,anon,authenticated;

  create or replace function public.provision_owner_salon(
    p_salon_name text,
    p_slug text,
    p_template_id text default 'barber_mens_grooming'
  ) returns table(out_salon_id uuid,out_organization_id uuid,out_slug text,out_template_id text,out_is_published boolean,out_already_existed boolean)
  language plpgsql security definer set search_path='' as $$
  declare
    v_user_id uuid := auth.uid();
    v_org_id uuid;
  begin
    if v_user_id is null then raise exception 'not authenticated' using errcode='28000'; end if;
    perform pg_advisory_xact_lock(hashtext('nexora-owner-provision:'||v_user_id::text));
    select organization_id into v_org_id from public.organization_members where user_id=v_user_id and role='owner';
    if v_org_id is null then
      insert into public.organizations(name) values (p_salon_name) returning id into v_org_id;
      perform private.nexora_upsert_owner_membership(v_org_id,v_user_id);
    end if;
    return query values (v_org_id,v_org_id,p_slug,p_template_id,false,found);
  end $$;
  revoke all on function public.provision_owner_salon(text,text,text) from public,anon;
  grant execute on function public.provision_owner_salon(text,text,text) to authenticated;

  -- Live drift also contained this unsafe legacy overload.
  create or replace function public.provision_owner_salon(p_user_id uuid,p_salon_name text default null)
  returns jsonb language sql security definer set search_path='' as $$
    select jsonb_build_object('user_id',p_user_id,'name',p_salon_name)
  $$;
  grant execute on function public.provision_owner_salon(uuid,text) to authenticated;
`);

const actor = '11111111-1111-4000-8000-111111111111';
const setActor = (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
const asRole = async (role, sql, params = []) => {
  await db.exec('reset role');
  await setActor(role === 'anon' ? '' : actor);
  await db.exec(`set role ${role}`);
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); await setActor(''); }
};

let reproduced = false;
try {
  await asRole(
    'authenticated',
    `select * from public.provision_owner_salon('Before M72','before-m72','barber_mens_grooming')`,
  );
} catch (error) {
  reproduced = error.code === 'P0001' && /server-activated invitations/i.test(error.message);
}
assert.equal(reproduced, true);
ok('live P0001 is reproduced before M72');

await db.exec(migrationSql);
ok('M72 applies cleanly against the exact live guard contract');

const first = (await asRole(
  'authenticated',
  `select * from public.provision_owner_salon('After M72','after-m72','barber_mens_grooming')`,
)).rows[0];
assert.ok(first.out_organization_id);
const membership = (await db.query(
  `select role,status from public.organization_members where user_id=$1`,
  [actor],
)).rows[0];
assert.deepEqual(membership, { role: 'owner', status: 'active' });
ok('authenticated owner provisions an active owner membership through the trusted RPC gate');

const second = (await asRole(
  'authenticated',
  `select * from public.provision_owner_salon('Retry','retry','beauty_skin_spa')`,
)).rows[0];
assert.equal(second.out_organization_id, first.out_organization_id);
const retryCounts = (await db.query(`
  select
    (select count(*) from public.organization_members where user_id=$1) as memberships,
    (select count(*) from public.organizations o join public.organization_members m on m.organization_id=o.id where m.user_id=$1) as organizations
`, [actor])).rows[0];
assert.equal(Number(retryCounts.memberships), 1);
assert.equal(Number(retryCounts.organizations), 1);
ok('retry is idempotent and creates no duplicate membership or organization');

const foreignActor = '22222222-2222-4000-8000-222222222222';
let directActiveBlocked = false;
await setActor(foreignActor);
await db.exec('set role authenticated');
try {
  await db.query(
    `insert into public.organization_members(organization_id,user_id,role,status,invited_by)
     values($1,$2,'owner','active',$2)`,
    [first.out_organization_id, foreignActor],
  );
} catch (error) {
  directActiveBlocked = error.code === 'P0001';
} finally {
  await db.exec('reset role');
  await setActor('');
}
assert.equal(directActiveBlocked, true);
ok('trusted flag is restored: normal direct active membership insert still raises P0001');

let legacyBlocked = false;
try {
  await asRole(
    'authenticated',
    `select public.provision_owner_salon($1::uuid,'Foreign User')`,
    [foreignActor],
  );
} catch { legacyBlocked = true; }
assert.equal(legacyBlocked, true);
ok('browser cannot call the legacy overload with another user id');

let anonBlocked = false;
try {
  await asRole(
    'anon',
    `select * from public.provision_owner_salon('Anon','anon','barber_mens_grooming')`,
  );
} catch { anonBlocked = true; }
assert.equal(anonBlocked, true);
ok('anonymous provisioning remains denied');

const verifier = (await db.query(
  `select * from public.verify_m72_owner_provisioning_membership_gate()`,
)).rows;
assert.ok(verifier.length >= 6);
assert.deepEqual(verifier.filter((row) => row.ok !== true), []);
ok(`M72 verifier reports ${verifier.length}/${verifier.length} checks green`);

const clientSource = await readFile(join(root, 'src', 'lib', 'ownerProvisioning.ts'), 'utf8');
assert.doesNotMatch(clientSource, /p_user_id\s*:/);
assert.match(clientSource, /p_salon_name:\s*name/);
ok('frontend calls only session-owned provisioning signatures');

assert.doesNotMatch(migrationSql, /disable\s+trigger/i);
assert.doesNotMatch(migrationSql, /drop\s+(table|trigger)/i);
assert.doesNotMatch(migrationSql, /disable\s+row\s+level\s+security/i);
ok('migration preserves the invitation trigger, RLS and all existing data');

await db.close();
console.log(`\nM72 permanent owner provisioning fix: ${passed}/${passed} checks PASS`);
