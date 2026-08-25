import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { setupApiRoutes } from '../api-routes.ts';
import { validateServerSupabaseProject } from '../server/supabaseAdmin.ts';

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const vercel = JSON.parse(await read('vercel.json'));
assert.deepEqual(vercel.routes[0], { handle: 'filesystem' });
assert.deepEqual(vercel.routes.at(-1), { src: '/.*', dest: '/index.html' });
assert.equal('rewrites' in vercel, false);
ok('Vercel resolves serverless functions/static files before the SPA fallback');

const [apiIndex, apiCatchall] = await Promise.all([
  read('api/index.ts'),
  read('api/[[...path]].ts'),
]);
assert.doesNotMatch(apiIndex, /from ['"]\.\.\/server['"]/);
assert.match(apiIndex, /from ['"]\.\/\[\[\.\.\.path\]\]['"]/);
assert.doesNotMatch(apiCatchall, /listen\s*\(|createViteServer|express\.static/);
assert.match(apiCatchall, /setupApiRoutes\(app\)/);
ok('both Vercel API entrypoints are pure and share one route registrar');

const app = express();
setupApiRoutes(app);
const server = await new Promise((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get('content-type') || '', /application\/json/);
  const healthBody = await health.json();
  assert.equal(healthBody.status, 'ok');

  const missing = await fetch(`${base}/api/does-not-exist`);
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type') || '', /application\/json/);
  assert.deepEqual(await missing.json(), { error: 'Not found' });
  ok('production-shaped API health and unknown routes return JSON, never index.html');
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

const canonicalUrl = 'https://qwaehqsmodekbgvnaavz.supabase.co';
const jwt = (payload) => [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify(payload)).toString('base64url'),
  'signature',
].join('.');
assert.doesNotThrow(() => validateServerSupabaseProject(canonicalUrl, 'sb_secret_opaque'));
assert.doesNotThrow(() => validateServerSupabaseProject(canonicalUrl, jwt({
  ref: 'qwaehqsmodekbgvnaavz',
  role: 'service_role',
  iss: canonicalUrl,
})));
assert.throws(
  () => validateServerSupabaseProject('https://aaaaaaaaaaaaaaaaaaaa.supabase.co', 'sb_secret_opaque'),
  /not the canonical Nexora project/,
);
assert.throws(
  () => validateServerSupabaseProject(canonicalUrl, jwt({ ref: 'aaaaaaaaaaaaaaaaaaaa', role: 'service_role' })),
  /different projects/,
);
assert.throws(
  () => validateServerSupabaseProject(canonicalUrl, jwt({ ref: 'qwaehqsmodekbgvnaavz', role: 'anon' })),
  /not a service-role credential/,
);
ok('trusted server fails closed on URL/key project mismatch and wrong JWT role without exposing secrets');

console.log(`\nRuntime boundaries: ${passed}/${passed} checks PASS`);
