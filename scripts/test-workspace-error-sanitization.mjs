/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Requirement: transient/network failures during provisioning must be caught
 * by workspaceDiagnostics and surfaced as sanitized copy. No raw SQL, no
 * Postgres error codes, no internal guard text may reach the UI.
 *
 * Run: npx tsx scripts/test-workspace-error-sanitization.mjs
 */

import assert from 'node:assert/strict';

const {
  diagnosticFromError,
  workspaceUserMessage,
  isMissingAuthSessionDiagnostic,
  WorkspaceInitializationError,
} = await import('../src/lib/workspaceDiagnostics.ts');

let passed = 0;
const failures = [];
async function test(name, run) {
  try {
    await run();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message.split('\n').slice(0, 3).join(' | ')}`);
  }
}

/** Postgres / PostgREST codes that must never be shown to a user. */
const FORBIDDEN_CODES = [
  'P0001', 'P0003', 'PGRST116', 'PGRST202', 'PGRST301',
  '42501', '42883', '428C9', '23502', '28000', '23505',
];

/** Exact strings the product has forbidden in user-facing copy. */
const FORBIDDEN_STRINGS = [
  'new memberships must be server-activated invitations',
  'permission denied for table',
  'null value in column',
  'violates row-level security',
];

/** Errors shaped the way supabase-js / the browser actually produce them. */
const REALISTIC_ERRORS = [
  { label: 'network drop (browser fetch)', error: new TypeError('Failed to fetch') },
  { label: 'network drop (supabase-js)', error: Object.assign(new Error('Failed to send a request to the server'), { code: 'FetchError' }) },
  { label: 'timeout', error: Object.assign(new Error('The request timed out after 30000ms'), {}) },
  { label: 'offline', error: Object.assign(new Error('NetworkError when attempting to fetch resource'), {}) },
  { label: 'membership guard (P0001)', error: Object.assign(new Error('new memberships must be server-activated invitations'), { code: 'P0001' }) },
  { label: 'RLS denial', error: Object.assign(new Error('permission denied for table profiles'), { code: '42501' }) },
  { label: 'missing RPC', error: Object.assign(new Error('Could not find the function public.bootstrap_shop_owner(text) in the schema cache'), { code: 'PGRST202' }) },
  { label: 'generated column', error: Object.assign(new Error('null value in column "is_active" violates generated-column rule'), { code: '428C9' }) },
  { label: 'not authenticated', error: Object.assign(new Error('No authenticated Supabase session.'), { code: '28000' }) },
  { label: 'multiple salons', error: Object.assign(new Error('Multiple salons resolved for this account'), { code: 'P0003' }) },
  { label: 'row shape', error: Object.assign(new Error('JSON object requested, multiple (or no) rows returned'), { code: 'PGRST116' }) },
  { label: 'unknown internal error', error: Object.assign(new Error('ERROR:  duplicate key value violates unique constraint "salons_slug_key"'), { code: '23505' }) },
  { label: 'empty error object', error: {} },
  { label: 'null error', error: null },
  { label: 'string error', error: 'something exploded' },
];

console.log('\nWorkspace error sanitization');

await test('no realistic provisioning error leaks a raw SQL/PostgREST code', async () => {
  for (const { label, error } of REALISTIC_ERRORS) {
    const d = diagnosticFromError({ operation: 'workspace.provision', stage: 'provision', error });
    const msg = workspaceUserMessage(d);
    for (const code of FORBIDDEN_CODES) {
      assert.ok(
        !msg.toUpperCase().includes(code),
        `${label}: user message leaked code ${code} -> "${msg}"`,
      );
    }
  }
});

await test('no realistic error leaks internal guard text or SQL fragments', async () => {
  for (const { label, error } of REALISTIC_ERRORS) {
    const d = diagnosticFromError({ operation: 'workspace.provision', stage: 'provision', error });
    const msg = workspaceUserMessage(d);
    const lower = msg.toLowerCase();
    for (const forbidden of FORBIDDEN_STRINGS) {
      assert.ok(
        !lower.includes(forbidden.toLowerCase()),
        `${label}: leaked forbidden string "${forbidden}" -> "${msg}"`,
      );
    }
    // Raw SQL diagnostics never belong in user copy.
    assert.ok(!/violates unique constraint|constraint "|DETAIL:|HINT:|SQLSTATE/i.test(msg),
      `${label}: raw SQL detail leaked -> "${msg}"`);
  }
});

await test('every error produces a non-empty, sentence-like user message', async () => {
  for (const { label, error } of REALISTIC_ERRORS) {
    const d = diagnosticFromError({ operation: 'workspace.provision', stage: 'provision', error });
    const msg = workspaceUserMessage(d);
    assert.ok(typeof msg === 'string' && msg.length > 12, `${label}: message too short -> "${msg}"`);
    assert.ok(/[.!?]$/.test(msg.trim()), `${label}: message does not end as a sentence -> "${msg}"`);
  }
});

await test('network / timeout failures are reported as retryable, not terminal', async () => {
  const networkish = REALISTIC_ERRORS.filter(({ label }) =>
    ['network drop (browser fetch)', 'timeout', 'offline'].includes(label));
  assert.ok(networkish.length >= 3, 'expected at least 3 network-shaped cases');
  for (const { label, error } of networkish) {
    const d = diagnosticFromError({ operation: 'workspace.provision', stage: 'provision', error });
    const msg = workspaceUserMessage(d).toLowerCase();
    assert.ok(
      /connection|try again|could not reach/.test(msg),
      `${label}: not phrased as retryable -> "${msg}"`,
    );
    assert.ok(!/retrying will not help/.test(msg),
      `${label}: a transient failure was reported as non-retryable -> "${msg}"`);
  }
});

await test('deterministic failures are NOT offered as retryable', async () => {
  const deterministic = REALISTIC_ERRORS.filter(({ label }) =>
    ['membership guard (P0001)', 'RLS denial', 'missing RPC', 'generated column'].includes(label));
  for (const { label, error } of deterministic) {
    const d = diagnosticFromError({ operation: 'workspace.provision', stage: 'provision', error });
    const msg = workspaceUserMessage(d).toLowerCase();
    assert.ok(/contact support/.test(msg), `${label}: should direct to support -> "${msg}"`);
  }
});

await test('the P0001 membership guard never surfaces its raw text', async () => {
  const error = Object.assign(
    new Error('new memberships must be server-activated invitations'),
    { code: 'P0001' },
  );
  const d = diagnosticFromError({ operation: 'workspace.provision', stage: 'provision', error });
  const msg = workspaceUserMessage(d);
  assert.ok(!/server-activated|invitation/i.test(msg), `raw guard text leaked -> "${msg}"`);
  assert.match(msg, /contact support/i);
});

await test('expired / invalid sessions are detected for redirect', async () => {
  const sessionCases = [
    { code: '28000', message: 'No authenticated Supabase session.' },
    { code: 'AUTH_SESSION_INVALID', message: 'session invalid' },
    { code: 'AUTH_USER_MISSING', message: 'auth user missing' },
    { code: 'AUTH_SESSION_USER_MISMATCH', message: 'session user mismatch' },
    { code: '', message: 'Auth session missing after site data was cleared' },
    { code: '', message: 'Refresh token not found' },
    { code: '', message: 'Invalid JWT' },
  ];
  for (const c of sessionCases) {
    const d = diagnosticFromError({
      operation: 'workspace.hydration',
      stage: 'auth-session',
      error: c,
    });
    assert.ok(
      isMissingAuthSessionDiagnostic(d),
      `session-loss case not detected: ${JSON.stringify(c)}`,
    );
  }
});

await test('generic network failure is NOT misclassified as session loss', async () => {
  // A dropped connection must stay retryable, never force a logout redirect.
  for (const error of [new TypeError('Failed to fetch'), new Error('NetworkError when attempting to fetch resource')]) {
    const d = diagnosticFromError({ operation: 'workspace.provision', stage: 'auth-session', error });
    assert.equal(isMissingAuthSessionDiagnostic(d), false,
      `network failure misclassified as session loss: ${error.message}`);
  }
});

await test('credentials are redacted before diagnostics are logged', async () => {
  const error = Object.assign(new Error(
    'failed with access_token=eyJhbGciOi.abc.def password=hunter2 Authorization: Bearer eyJhbGciOi.secret',
  ), { code: 'P0001', details: 'service_role=sk_live_1234567890' });
  const d = diagnosticFromError({ operation: 'workspace.provision', stage: 'provision', error });
  const blob = `${d.message} ${d.details ?? ''}`;
  assert.ok(!blob.includes('hunter2'), 'password leaked');
  assert.ok(!blob.includes('sk_live_1234567890'), 'service role key leaked');
  assert.ok(!blob.includes('eyJhbGciOi.secret'), 'bearer token leaked');
  assert.match(blob, /\[redacted\]/);
});

await test('WorkspaceInitializationError carries the diagnostic to the UI layer', async () => {
  const error = Object.assign(new Error('boom'), { code: 'P0001' });
  const d = diagnosticFromError({ operation: 'workspace.provision', stage: 'provision', error });
  const thrown = new WorkspaceInitializationError(d);
  assert.ok(thrown instanceof Error);
  assert.equal(thrown.diagnostic.code, 'P0001');
  assert.ok(typeof workspaceUserMessage(thrown.diagnostic) === 'string');
});

console.log(`\nWorkspace error sanitization: ${passed}/${passed + failures.length} checks PASS`);
if (failures.length) {
  console.log(`FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
