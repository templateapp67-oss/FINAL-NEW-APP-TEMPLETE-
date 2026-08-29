import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { workspaceUserMessage, diagnosticFromError } from '../src/lib/workspaceDiagnostics.ts';
import { sanitizeProvisionError } from '../src/lib/ownerProvisioning.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

// ---------------------------------------------------------------------------
// 1. Sanitization unit tests
// ---------------------------------------------------------------------------
// The extractRow / extractMembershipId unit tests that used to live here were
// removed together with src/lib/workspace.ts: that module was the only client
// of the M58 parallel membership path and is no longer part of the product.
// Workspace setup is standardized on public.provision_owner_salon (M54).

// C. workspaceUserMessage for P0001
const diagP0001Invite = diagnosticFromError({
  operation: 'membership.activate',
  stage: 'provision',
  error: { code: 'P0001', message: 'Invalid or expired invitation' },
});
assert.equal(
  workspaceUserMessage(diagP0001Invite),
  'The workspace invitation is invalid, expired, or requires server activation.',
);

const diagP0001AlreadyMember = diagnosticFromError({
  operation: 'membership.activate',
  stage: 'provision',
  error: { code: 'P0001', message: 'User is already a member of this workspace' },
});
assert.equal(
  workspaceUserMessage(diagP0001AlreadyMember),
  'You are already a member of this workspace.',
);
ok('workspaceDiagnostics maps P0001 invitation and membership errors cleanly');

// D. The live membership guard message must never reach the owner UI, and must
//    not be misreported as an invitation problem (an owner self-provisioning a
//    salon was never sent an invitation).
const RAW_GUARD_MESSAGE = 'new memberships require server-activated invitations';

const diagGuard = diagnosticFromError({
  operation: 'workspace.provision',
  stage: 'provision',
  error: { code: 'P0001', message: RAW_GUARD_MESSAGE },
});
const guardCopy = workspaceUserMessage(diagGuard);
assert.ok(!guardCopy.includes('server-activated invitations'),
  `raw guard text leaked to UI: ${guardCopy}`);
assert.ok(!guardCopy.includes('new memberships'),
  `raw guard text leaked to UI: ${guardCopy}`);
assert.match(guardCopy, /contact support/i);
assert.ok(!/invitation/i.test(guardCopy),
  `owner must not be told about an invitation they never had: ${guardCopy}`);
ok('workspaceUserMessage never echoes the raw membership-guard P0001 text');

// E. The owner provisioning sanitizer must do the same.
const provisionCopy = sanitizeProvisionError(RAW_GUARD_MESSAGE, 'P0001');
assert.ok(!provisionCopy.includes('server-activated invitations'),
  `raw guard text leaked from provisioning sanitizer: ${provisionCopy}`);
assert.ok(!provisionCopy.includes('new memberships'),
  `raw guard text leaked from provisioning sanitizer: ${provisionCopy}`);
assert.match(provisionCopy, /contact support/i);
assert.ok(!/invitation/i.test(provisionCopy),
  `owner must not be told about an invitation they never had: ${provisionCopy}`);
ok('sanitizeProvisionError never echoes the raw membership-guard P0001 text');

// F. Other P0001 shapes keep their existing friendly copy.
assert.match(sanitizeProvisionError('Invalid or expired invitation', 'P0001'), /invitation/i);
assert.match(sanitizeProvisionError('Please log in', '28000'), /log in/i);
assert.match(sanitizeProvisionError('Multiple salons are linked', 'P0003'), /multiple salons/i);
ok('other provisioning error classes keep their existing sanitized copy');

// ---------------------------------------------------------------------------
// 2. Database & SQL Verification via PGlite
// ---------------------------------------------------------------------------

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

// Bootstrap auth schema
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

  grant usage on schema public, auth to anon, authenticated, service_role;
`);

// Apply M58 migration
const m58Sql = await readFile(
  join(root, 'supabase', 'migrations', '20260827000101_m58_workspace_membership_activation_p0001_fix.sql'),
  'utf8',
);
await db.exec(m58Sql);
ok('M58 migration applies cleanly');

// Apply M63: closes the M58 activation bypass. Every authorization assertion
// below runs against the M63 definition, not the original M58 body.
const m63Sql = await readFile(
  join(root, 'supabase', 'migrations', '20260829000101_m63_owner_provisioning_invitation_guard_fix.sql'),
  'utf8',
);
await db.exec(m63Sql);
ok('M63 migration applies cleanly over M58');

// Apply M64: retires the M58 surface for browser callers.
const m64Sql = await readFile(
  join(root, 'supabase', 'migrations', '20260829000201_m64_deprecate_m58_workspace_membership.sql'),
  'utf8',
);
await db.exec(m64Sql);
ok('M64 migration applies cleanly over M63');

// Identity/role context exactly as Supabase presents it to a browser JWT.
// M59 takes identity from auth.uid() and trust from the role claim, so tests
// must set both instead of relying on a superuser session.
async function asAuthenticatedUser(userId) {
  await db.exec(`
    select set_config('request.jwt.claim.sub', '${userId}', false);
    select set_config('request.jwt.claim.role', 'authenticated', false);
  `);
}
async function asServiceRole(userId) {
  await db.exec(`
    select set_config('request.jwt.claim.sub', '', false);
    select set_config('request.jwt.claim.role', 'service_role', false);
  `);
  return userId;
}

// Create test user and workspace
const userA = '11111111-1111-4000-8000-111111111111';
const userB = '22222222-2222-4000-8000-222222222222';
const workspace1 = 'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa';

await db.exec(`
  insert into auth.users (id, email) values ('${userA}', 'userA@example.com'), ('${userB}', 'userB@example.com');
  insert into public.workspaces (id, name, owner_id) values ('${workspace1}', 'Acme Workspace', '${userA}');
`);

// Test A: Owner membership activation without invitation
await asAuthenticatedUser(userA);
const ownerRes = await db.query(
  `select public.activate_workspace_membership($1, $2, null) as res`,
  [workspace1, userA],
);
const ownerData = ownerRes.rows[0].res;
assert.ok(ownerData.M_ID, 'M_ID should be returned');
assert.equal(ownerData.workspace_id, workspace1);
assert.equal(ownerData.user_id, userA);
assert.equal(ownerData.role, 'owner');
assert.equal(ownerData.already_existed, false);
ok('activate_workspace_membership successfully creates owner membership with guaranteed M_ID');

// Test B: Idempotent repeat call returns existing M_ID
await asAuthenticatedUser(userA);
const ownerResRepeat = await db.query(
  `select public.activate_workspace_membership($1, $2, null) as res`,
  [workspace1, userA],
);
const ownerDataRepeat = ownerResRepeat.rows[0].res;
assert.equal(ownerDataRepeat.M_ID, ownerData.M_ID, 'Same M_ID must be returned');
assert.equal(ownerDataRepeat.already_existed, true);
ok('activate_workspace_membership is idempotent and does not create duplicate rows');

// Test C: Invalid invitation token throws P0001
let p0001Caught = false;
try {
  await asAuthenticatedUser(userB);
  await db.query(
    `select public.activate_workspace_membership($1, $2, 'invalid_token_xyz') as res`,
    [workspace1, userB],
  );
} catch (err) {
  p0001Caught = true;
  assert.match(err.message, /Invalid or expired invitation/i);
}
assert.ok(p0001Caught, 'Invalid invitation token must raise P0001 exception');
ok('activate_workspace_membership rejects invalid invite token with P0001');

// Test D: Valid invitation token is accepted and membership created
const tokenVal = 'inv_tok_secret_123';
await db.exec(`
  insert into public.invitations (workspace_id, token, role)
  values ('${workspace1}', '${tokenVal}', 'admin');
`);

await asAuthenticatedUser(userB);
const memberRes = await db.query(
  `select public.activate_workspace_membership($1, $2, $3) as res`,
  [workspace1, userB, tokenVal],
);
const memberData = memberRes.rows[0].res;
assert.ok(memberData.M_ID, 'Member M_ID should be returned');
assert.equal(memberData.role, 'admin');
assert.equal(memberData.user_id, userB);

// Check invitation is marked accepted
const invCheck = await db.query(`select accepted_at, accepted_by from public.invitations where token = $1`, [tokenVal]);
assert.ok(invCheck.rows[0].accepted_at != null);
assert.equal(invCheck.rows[0].accepted_by, userB);
ok('activate_workspace_membership accepts invitation, binds accepted_by, and sets assigned role');

// Test E: Reusing accepted invitation fails with P0001
let usedCaught = false;
try {
  const userC = '33333333-3333-4000-8000-333333333333';
  await db.exec(`insert into auth.users (id, email) values ('${userC}', 'userC@example.com');`);
  await asAuthenticatedUser(userC);
  await db.query(
    `select public.activate_workspace_membership($1, $2, $3) as res`,
    [workspace1, userC, tokenVal],
  );
} catch (err) {
  usedCaught = true;
  assert.match(err.message, /Invalid or expired invitation/i);
}
assert.ok(usedCaught, 'Already accepted invitation cannot be reused');
ok('Already accepted invitation cannot be reused (raises P0001)');

// ---------------------------------------------------------------------------
// 3. M59 — the M58 authorization bypass must stay closed
// ---------------------------------------------------------------------------

// Test F: an unrelated authenticated user cannot self-insert into a workspace
// they neither own nor were invited to. Under M58 this succeeded and returned
// an active 'member' row; M59 must refuse it.
const intruder = '44444444-4444-4000-8000-444444444444';
await db.exec(`insert into auth.users (id, email) values ('${intruder}','intruder@example.com');`);
await asAuthenticatedUser(intruder);

let unauthorizedCaught = false;
try {
  await db.query(
    `select public.activate_workspace_membership($1, null, null) as res`,
    [workspace1],
  );
} catch (err) {
  unauthorizedCaught = true;
  assert.match(err.message, /not authorized/i);
}
assert.ok(unauthorizedCaught, 'Unrelated user must be refused without an invitation');

const intruderRows = await db.query(
  `select count(*)::int as n from public.memberships where user_id = $1`,
  [intruder],
);
assert.equal(intruderRows.rows[0].n, 0, 'no membership row may be created for the intruder');
ok('M59: unrelated authenticated user cannot self-join a foreign workspace (was the M58 bypass)');

// Test G: an authenticated caller cannot impersonate someone else via p_user_id.
await asAuthenticatedUser(intruder);
let impersonationCaught = false;
try {
  await db.query(
    `select public.activate_workspace_membership($1, $2, null) as res`,
    [workspace1, userA],
  );
} catch (err) {
  impersonationCaught = true;
}
assert.ok(impersonationCaught, 'p_user_id must not override auth.uid() for a browser caller');

const victimRows = await db.query(
  `select count(*)::int as n from public.memberships where workspace_id = $1`,
  [workspace1],
);
assert.equal(victimRows.rows[0].n, 2, 'only the legitimate owner and invited member exist');
ok('M59: p_user_id cannot be used by an authenticated caller to impersonate another user');

// Test H: with no session at all the call is rejected rather than silently
// acting on p_user_id.
await db.exec(`
  select set_config('request.jwt.claim.sub', '', false);
  select set_config('request.jwt.claim.role', 'authenticated', false);
`);
let anonymousCaught = false;
try {
  await db.query(
    `select public.activate_workspace_membership($1, $2, null) as res`,
    [workspace1, userA],
  );
} catch (err) {
  anonymousCaught = true;
  assert.match(err.message, /Not authenticated/i);
}
assert.ok(anonymousCaught, 'an unauthenticated caller must be rejected');
ok('M59: activation requires an authenticated session');

// Test I: the service-role path still works, because server-side callers are a
// legitimate basis for activation.
await asServiceRole(intruder);
const serviceRes = await db.query(
  `select public.activate_workspace_membership($1, $2, null) as res`,
  [workspace1, intruder],
);
assert.ok(serviceRes.rows[0].res.M_ID, 'service-role activation returns an M_ID');
ok('M63: service-role callers can still activate memberships');

// ---------------------------------------------------------------------------
// 4. M64 — the M58 surface is retired for browser callers
// ---------------------------------------------------------------------------

// Privilege check first, then the enforced behaviour.
const privs = await db.query(`
  select
    has_function_privilege('authenticated',
      'public.activate_workspace_membership(uuid,uuid,text)', 'EXECUTE') as auth_exec,
    has_function_privilege('service_role',
      'public.activate_workspace_membership(uuid,uuid,text)', 'EXECUTE') as svc_exec,
    has_table_privilege('authenticated', 'public.workspaces', 'INSERT')  as ws_insert,
    has_table_privilege('authenticated', 'public.memberships', 'INSERT') as mem_insert
`);
assert.equal(privs.rows[0].auth_exec, false, 'authenticated must not execute the deprecated RPC');
assert.equal(privs.rows[0].svc_exec, true, 'service_role must retain access');
assert.equal(privs.rows[0].ws_insert, false, 'workspaces must not be client-writable');
assert.equal(privs.rows[0].mem_insert, false, 'memberships must not be client-writable');
ok('M64: deprecated RPC revoked from authenticated, retained for service_role, M58 tables server-only');

// Prove the grant is actually enforced, not merely reported: run the call as
// the `authenticated` role rather than as a superuser with a JWT claim set.
await db.exec('set role authenticated');
let execDenied = false;
try {
  await db.query(
    `select public.activate_workspace_membership($1, $2, null) as res`,
    [workspace1, intruder],
  );
} catch (err) {
  execDenied = true;
  assert.equal(err.code, '42501', `expected 42501, got ${err.code}: ${err.message}`);
  assert.match(err.message, /permission denied for function/i);
}
assert.ok(execDenied, 'an authenticated caller must be denied EXECUTE outright');
await db.exec('reset role');
ok('M64: an authenticated caller is denied EXECUTE at the grant layer (defence in depth over M63)');

// The canonical path must remain open — deprecating M58 must not break
// provisioning, which has always used provision_owner_salon. That function
// comes from M54, which this M58-only harness does not apply, so guard the
// lookup: has_function_privilege() raises on an absent function.
const canon = await db.query(`
  select
    to_regprocedure('public.provision_owner_salon(text,text,text)') is not null as present,
    case when to_regprocedure('public.provision_owner_salon(text,text,text)') is null then null
         else has_function_privilege('authenticated',
                'public.provision_owner_salon(text,text,text)', 'EXECUTE') end as exec_ok`);
if (canon.rows[0].present) {
  assert.equal(canon.rows[0].exec_ok, true, 'provision_owner_salon must stay executable');
  console.log('      (provision_owner_salon present and executable by authenticated)');
} else {
  console.log('      (provision_owner_salon not installed in this M58-only harness; covered by test:m63)');
}

// M64 ships its own verifier; every check must be green.
const verifier = await db.query('select * from public.verify_m64_m58_deprecation()');
const failed = verifier.rows.filter((r) => !r.ok);
for (const r of verifier.rows) {
  if (!r.ok) console.log(`      FAIL ${r.check_name} :: ${r.detail}`);
}
assert.equal(failed.length, 0, `M64 verifier failures: ${JSON.stringify(failed)}`);
ok(`M64: verify_m64_m58_deprecation() all ${verifier.rows.length} checks green`);

// M64 must be a safe no-op when M58 was never applied. Bootstrap the standard
// Supabase roles first — a real project always has them, and M64's REVOKE
// statements name them.
const db2 = new PGlite({ extensions: { pgcrypto } });
await db2.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists public;
`);
await db2.exec(m64Sql.replace(/^begin;/im, '').replace(/commit;/im, ''));
// Re-running must also be clean (idempotency).
await db2.exec(m64Sql.replace(/^begin;/im, '').replace(/commit;/im, ''));
ok('M64 is idempotent and a safe no-op on a project where M58 was never applied');
await db2.close();

await db.close();

console.log(`\nWorkspace provisioning standardization: ${passed}/${passed} checks PASS`);
