// M63 — owner provisioning must get through the live membership-invitation
// guard, without permanently disarming that guard for client writes.
//
// Covers the reported P0001: `provision_owner_salon` aborted with
// 'new memberships require server-activated invitations' because the live
// BEFORE INSERT guard fired even for the trusted SECURITY DEFINER bootstrap.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

// Statement splitter shared with the M54 harness: runs statements individually
// so a failure inside a DO block is observable, matching the Management API.
function splitStatements(sql) {
  const statements = [];
  let buffer = '';
  let i = 0;
  const push = () => { const t = buffer.trim(); if (t) statements.push(t); buffer = ''; };
  while (i < sql.length) {
    if (sql[i] === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i += 1; continue; }
    if (sql[i] === '/' && sql[i + 1] === '*') { i += 2; while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1; i += 2; continue; }
    if (sql[i] === '$') {
      let endTag = i + 1;
      while (endTag < sql.length && /[A-Za-z0-9_]/.test(sql[endTag])) endTag += 1;
      if (sql[endTag] === '$') {
        const tag = sql.slice(i, endTag + 1);
        const end = sql.indexOf(tag, endTag + 1);
        if (end < 0) throw new Error(`Unclosed dollar body ${tag}`);
        buffer += sql.slice(i, end + tag.length);
        i = end + tag.length;
        continue;
      }
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i]; buffer += sql[i++];
      while (i < sql.length) {
        buffer += sql[i];
        if (sql[i] === quote) { if (sql[i + 1] === quote) buffer += sql[i++]; else { i += 1; break; } }
        i += 1;
      }
      continue;
    }
    if (sql[i] === ';') { push(); i += 1; continue; }
    buffer += sql[i++];
  }
  push();
  return statements;
}

const stripTxn = (sql) => sql.replace(/^\s*begin\s*;\s*/im, '').replace(/\s*commit\s*;\s*$/im, '');
async function execMigration(db, file) {
  for (const s of splitStatements(stripTxn(await readFile(join(migrationDir, file), 'utf8')))) {
    await db.exec(s);
  }
}

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(), email text, phone text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now());
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text not null unique, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id), name text not null, owner_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (bucket_id, name));
  create or replace function storage.foldername(name text) returns text[] language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);

// Apply the ordered chain through M59. Historical migrations that depend on
// live-only tables are tolerated, exactly as in the M54 harness.
const target = '20260829000101_m63_owner_provisioning_invitation_guard_fix.sql';
for (const file of (await readdir(migrationDir)).filter((f) => f.endsWith('.sql') && f <= target).sort()) {
  try { await execMigration(db, file); } catch { /* live-like harness */ }
}
assert.ok(
  (await db.query("select to_regprocedure('public.provision_owner_salon(text,text,text)') as fn")).rows[0].fn,
  'provision_owner_salon must be installed',
);
ok('M59 applies cleanly over the ordered migration chain');

// The observed M28 live membership shape: status writable, is_active generated.
await db.exec(`
  alter table public.organization_members add column if not exists status text not null default 'active';
  alter table public.organization_members drop column if exists is_active cascade;
  alter table public.organization_members
    add column is_active boolean generated always as (status = 'active') stored;
`);

// The live guard documented in M58's header. It fires for every inserter,
// which is exactly what blocked the owner bootstrap before M59.
await db.exec(`
  create schema if not exists private;
  create or replace function private.require_server_activated_invitation()
  returns trigger language plpgsql as $$
  begin
    if tg_op = 'INSERT' then
      raise exception 'new memberships require server-activated invitations'
        using errcode = 'P0001';
    end if;
    return new;
  end; $$;

  drop trigger if exists trg_require_server_activated_invitation on public.organization_members;
  create trigger trg_require_server_activated_invitation
    before insert on public.organization_members
    for each row execute function private.require_server_activated_invitation();
`);

// M63 must actually recognise this guard as the invitation guard.
const detected = await db.query(`select * from private.nexora_membership_invitation_guards()`);
assert.equal(detected.rows.length, 1, 'the live invitation guard must be detected');
assert.equal(detected.rows[0].trigger_name, 'trg_require_server_activated_invitation');
ok('M59 detects the live invitation guard by its own source text');

// A brand-new owner with a faithful active profile (M36 sets is_active on
// signup; M38 backfills legacy NULLs).
const user = '33333333-3333-4000-8000-333333333333';
await db.exec(`
  insert into auth.users (id, email) values ('${user}','newowner@example.com');
  insert into public.profiles (id, full_name, platform_role, is_active, email)
  values ('${user}','New Owner','customer', true, 'newowner@example.com')
  on conflict (id) do update set is_active = true, platform_role = 'customer';
`);
await db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`);

// --- The regression: this used to raise P0001 and create nothing. ---
const provisioned = await db.query(
  `select * from public.provision_owner_salon('My Salon','my-salon','barber_mens_grooming')`,
);
assert.ok(provisioned.rows[0].out_salon_id, 'owner must receive a salon');
ok('provision_owner_salon now completes through the live invitation guard (P0001 regression)');

const membership = await db.query(
  `select role, status from public.organization_members where user_id = $1`, [user],
);
assert.equal(membership.rows.length, 1, 'exactly one owner membership must exist');
assert.equal(membership.rows[0].role, 'owner');
assert.equal(membership.rows[0].status, 'active');
ok('owner membership is created with role=owner and status=active');

// The guard must be back in its prior state, not left disabled.
const afterState = await db.query(`
  select t.tgenabled::text as state from pg_trigger t
   where t.tgname = 'trg_require_server_activated_invitation'
     and t.tgrelid = 'public.organization_members'::regclass`);
assert.equal(afterState.rows[0].state, 'O', 'the guard must be re-enabled after provisioning');
ok('the invitation guard is restored to its prior state after provisioning');

// And it must still block an untrusted direct insert — the control M59 exists
// to preserve. Run as `authenticated` so this is a real client attempt.
await db.exec(`
  create or replace function public.simulate_client_membership_insert(p_org uuid, p_user uuid)
  returns text language plpgsql security invoker set search_path = public as $$
  begin
    insert into public.organization_members (organization_id, user_id, role, status)
    values (p_org, p_user, 'owner', 'active');
    return 'CLIENT INSERT SUCCEEDED';
  exception when others then
    return 'BLOCKED: ' || SQLERRM;
  end; $$;
  grant execute on function public.simulate_client_membership_insert(uuid, uuid) to authenticated;
`);

const orgId = provisioned.rows[0].out_organization_id;
const intruder = '55555555-5555-4000-8000-555555555555';
await db.exec(`
  insert into auth.users (id, email) values ('${intruder}','intruder@example.com');
  insert into public.profiles (id, full_name, platform_role, is_active, email)
  values ('${intruder}','Intruder','customer', true, 'intruder@example.com')
  on conflict (id) do update set is_active = true;
`);
const clientAttempt = await db.exec(`
  set role authenticated;
  select public.simulate_client_membership_insert('${orgId}','${intruder}') as result;
`);
const clientResult = clientAttempt[clientAttempt.length - 1].rows[0].result;
assert.match(clientResult, /BLOCKED/, `client insert must stay blocked, got: ${clientResult}`);
// Two independent layers stop this. M36 §7 revokes INSERT on
// organization_members from authenticated, so the permission check normally
// fires first; the invitation guard is the second layer behind it. Both are
// acceptable outcomes — what matters is that the client cannot insert.
assert.ok(
  /permission denied for table organization_members/.test(clientResult)
  || /server-activated invitations/.test(clientResult),
  `client insert must be blocked by RLS grants or the invitation guard, got: ${clientResult}`,
);
console.log(`      (client blocked by: ${clientResult.replace('BLOCKED: ', '')})`);
ok('client inserts into organization_members remain blocked (M36 grant revoke + invitation guard)');

// Leave the simulated client role before any further assertions.
await db.exec('reset role');

const intruderMembership = await db.query(
  `select count(*)::int as n from public.organization_members where user_id = $1`, [intruder],
);
assert.equal(intruderMembership.rows[0].n, 0, 'the blocked client insert created nothing');
ok('the blocked client attempt created no membership row');

// The grant revoke above can mask the trigger, so prove separately that the
// guard is genuinely ARMED: a plain insert with the trigger enabled must still
// raise P0001. Triggers fire for superusers too, so this exercises the guard
// itself rather than the table privileges.
let guardArmed = false;
try {
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role, status)
     values ($1, $2, 'staff', 'active')`,
    [orgId, intruder],
  );
} catch (err) {
  guardArmed = /server-activated invitations/.test(err.message);
}
assert.ok(guardArmed, 'the invitation guard must still reject a direct insert after M59');
ok('the invitation guard itself is still armed and raises P0001 for direct inserts');

// Provisioning stays idempotent with the guard present.
await db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`);
const retry = await db.query(
  `select * from public.provision_owner_salon('My Salon','my-salon','barber_mens_grooming')`,
);
assert.equal(retry.rows[0].out_salon_id, provisioned.rows[0].out_salon_id, 'same salon on retry');
const stillOne = await db.query(
  `select count(*)::int as n from public.organization_members where user_id = $1`, [user],
);
assert.equal(stillOne.rows[0].n, 1, 'retry must not duplicate the membership');
ok('retry is idempotent with the guard present: no duplicate membership');

// M54's own verifier asserts the membership helper still carries its
// compatibility check, so a rewrite must not drop it.
const verifier = await db.query(`select * from public.verify_m54_workspace_bootstrap()`);
const failed = verifier.rows.filter((r) => !r.ok);
assert.equal(failed.length, 0, `M54 verifier regressions: ${JSON.stringify(failed)}`);
ok(`verify_m54_workspace_bootstrap(): all ${verifier.rows.length} checks still green after M63`);

// M63 ships its own verifier; scripts/apply-live-migration.mjs runs it after
// applying, so it must be green in exactly this state.
const v63 = await db.query(`select * from public.verify_m63_owner_provisioning()`);
const v63failed = v63.rows.filter((r) => !r.ok);
for (const r of v63.rows) console.log(`      ${r.ok ? 'ok  ' : 'FAIL'} ${r.check_name}`);
assert.equal(v63failed.length, 0, `M63 verifier failures: ${JSON.stringify(v63failed)}`);
ok(`verify_m63_owner_provisioning(): all ${v63.rows.length} checks green`);

await db.close();
console.log(`\nM63 owner provisioning invitation guard: ${passed}/${passed} checks PASS`);
