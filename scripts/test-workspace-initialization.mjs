import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { extractRow, extractMembershipId } from '../src/lib/workspace.ts';
import { workspaceUserMessage, diagnosticFromError } from '../src/lib/workspaceDiagnostics.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

// ---------------------------------------------------------------------------
// 1. Client-Side Defensive Access Unit Tests
// ---------------------------------------------------------------------------

// A. extractRow
assert.equal(extractRow(null), null);
assert.equal(extractRow(undefined), null);
assert.equal(extractRow([]), null);
assert.deepEqual(extractRow([{ M_ID: 'mem-123' }]), { M_ID: 'mem-123' });
assert.deepEqual(extractRow({ M_ID: 'mem-123' }), { M_ID: 'mem-123' });
ok('extractRow safely normalizes null, undefined, empty array, single object, and row array');

// B. extractMembershipId
assert.equal(extractMembershipId(null), null);
assert.equal(extractMembershipId(undefined), null);
assert.equal(extractMembershipId({}), null);
assert.equal(extractMembershipId({ M_ID: 'mem-abc-1' }), 'mem-abc-1');
assert.equal(extractMembershipId({ m_id: 'mem-abc-2' }), 'mem-abc-2');
assert.equal(extractMembershipId({ id: 'mem-abc-3' }), 'mem-abc-3');
assert.equal(extractMembershipId({ membership_id: 'mem-abc-4' }), 'mem-abc-4');
ok('extractMembershipId safely extracts M_ID / m_id / id / membership_id with no TypeError');

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

// Create test user and workspace
const userA = '11111111-1111-4000-8000-111111111111';
const userB = '22222222-2222-4000-8000-222222222222';
const workspace1 = 'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa';

await db.exec(`
  insert into auth.users (id, email) values ('${userA}', 'userA@example.com'), ('${userB}', 'userB@example.com');
  insert into public.workspaces (id, name, owner_id) values ('${workspace1}', 'Acme Workspace', '${userA}');
`);

// Test A: Owner membership activation without invitation
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

await db.close();

console.log(`\nWorkspace Initialization & P0001 Fix: ${passed}/${passed} checks PASS`);
