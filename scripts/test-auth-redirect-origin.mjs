/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auth redirect-origin hardening.
 *
 * Every signup-confirmation, OAuth and password-recovery link is built from
 * `getAuthRedirectOrigin()`. If that resolves to a placeholder or an
 * unowned host, users click a link in their inbox and land nowhere — the
 * onboarding flow breaks after the account already exists.
 *
 * Run: npx tsx scripts/test-auth-redirect-origin.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PLACEHOLDER = 'https://your-app.example.com';
const CANONICAL = 'https://final-new-app-templete.vercel.app';

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
    console.log(`      ${err.message.split('\n')[0]}`);
  }
}

/**
 * `authRedirect.ts` reads the env once per call through getEnv(), which falls
 * back to process.env when import.meta.env is absent (i.e. under tsx/node).
 * A fresh module instance per case keeps the cases independent.
 */
async function originWith(value, runtimeOrigin) {
  if (value === undefined) delete process.env.VITE_AUTH_REDIRECT_ORIGIN;
  else process.env.VITE_AUTH_REDIRECT_ORIGIN = value;
  const mod = await import(`../src/lib/authRedirect.ts?v=${encodeURIComponent(String(value))}`);
  return mod.getAuthRedirectOrigin(runtimeOrigin);
}

console.log('\nAuth redirect origin');

await test('the .env.example placeholder never becomes a redirect target', async () => {
  // This is the documented first-run state: .env.example copied to .env.
  const out = await originWith(PLACEHOLDER, 'https://real-deploy.example.org');
  assert.notEqual(out, PLACEHOLDER, 'placeholder origin leaked into auth email links');
});

await test('any example.com / example.org / example.net host is rejected', async () => {
  for (const host of [
    'https://your-app.example.com',
    'https://app.example.org',
    'http://demo.example.net',
    'https://example.com',
  ]) {
    const out = await originWith(host, undefined);
    assert.notEqual(out, new URL(host).origin, `${host} was accepted as a redirect origin`);
  }
});

await test('a genuine deployment origin is honoured', async () => {
  const out = await originWith('https://salons.mycompany.com', undefined);
  assert.equal(out, 'https://salons.mycompany.com');
});

await test('with no override, a real runtime origin wins', async () => {
  const out = await originWith(undefined, 'https://salons.mycompany.com');
  assert.equal(out, 'https://salons.mycompany.com');
});

await test('localhost and preview hosts fall back to the canonical origin', async () => {
  for (const runtime of [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://abc-123.e2b.app',
  ]) {
    const out = await originWith(undefined, runtime);
    assert.equal(out, CANONICAL, `${runtime} should fall back to canonical, got ${out}`);
  }
});

await test('non-http schemes are rejected', async () => {
  for (const bad of ['ftp://example.com', 'javascript:alert(1)', 'not a url', '']) {
    const out = await originWith(bad, undefined);
    assert.equal(out, CANONICAL, `${JSON.stringify(bad)} should fall back, got ${out}`);
  }
});

await test('signup links carry an owner continuation of /builder, customers of /', async () => {
  delete process.env.VITE_AUTH_REDIRECT_ORIGIN;
  const { signupConfirmationRedirect } = await import('../src/lib/authRedirect.ts?v=signup');
  const owner = new URL(signupConfirmationRedirect(undefined, 'owner'));
  const customer = new URL(signupConfirmationRedirect(undefined, 'customer'));
  assert.equal(owner.searchParams.get('intent'), 'owner');
  assert.equal(owner.searchParams.get('next'), '/builder');
  assert.equal(customer.searchParams.get('next'), '/');
  assert.equal(owner.pathname, '/auth/callback');
});

await test('.env.example still documents the variable', async () => {
  const env = readFileSync('.env.example', 'utf8');
  assert.match(env, /VITE_AUTH_REDIRECT_ORIGIN=/);
});

console.log(`\nAuth redirect origin: ${passed}/${passed + failures.length} checks PASS`);
if (failures.length) {
  console.log(`FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
