/**
 * STEP 5 (PHOTO GALLERY) SAVE-FAILURE REGRESSION — payload limits & error copy.
 *
 * Reproduces the "Save failed — check connection" report:
 *   1. `/api/owner/save-website-draft` must accept draft configs LARGER than
 *      the old global 256kb express.json limit (gallery drafts embed Base64
 *      image fallbacks when Supabase Storage is unreachable — a 5 MB image is
 *      ~6.8 MB Base64). A 1 MB body must get PAST the parser (i.e. fail on
 *      auth — 401/500 — never on 413).
 *   2. Bodies beyond the 10 MB draft budget must return DESCRIPTIVE JSON
 *      (code: 'payload-too-large'), not Express's HTML error page.
 *   3. Other routes keep the tight 256kb budget and also fail with JSON.
 *   4. The client-side classifier maps every failure class (session expiry,
 *      permission, payload, CORS/origin, outage) to an actionable message.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { setupApiRoutes } from '../api-routes.ts';

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const app = express();
setupApiRoutes(app);
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

const post = (path, bytes, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ salonId: 'x'.repeat(8), config: { blob: 'a'.repeat(bytes) } }),
  });

// 1. A ~1 MB draft body passes the parser (fails later on auth, never 413).
{
  const resp = await post('/api/owner/save-website-draft', 1024 * 1024, { Authorization: 'Bearer invalid' });
  assert.notEqual(resp.status, 413, `1 MB draft body must not be rejected by the parser (got ${resp.status})`);
  ok(`1 MB draft body clears the body parser (HTTP ${resp.status} from auth, not 413)`);
}

// 2. A body beyond the 10 MB draft budget fails with descriptive JSON.
{
  const resp = await post('/api/owner/save-website-draft', 11 * 1024 * 1024);
  assert.equal(resp.status, 413);
  const body = await resp.json();
  assert.equal(body.code, 'payload-too-large');
  assert.match(body.error, /gallery photos|too large/i);
  ok('oversized draft body returns descriptive JSON 413 (code: payload-too-large)');
}

// 3. Other routes keep the tight 256kb budget — and still fail with JSON.
{
  const resp = await post('/api/generate-bio', 512 * 1024);
  assert.equal(resp.status, 413);
  const body = await resp.json();
  assert.equal(body.code, 'payload-too-large');
  ok('non-draft routes keep the 256kb budget with a JSON 413');
}

server.close();

// 4. Client-side classifier — every failure class gets an actionable message.
const website = await readFile(new URL('../src/lib/salonWebsiteService.ts', import.meta.url), 'utf8');
assert.ok(website.includes('export function describeDraftSaveFailure'), 'classifier exists');
assert.ok(website.includes('export function getLastDraftSaveErrorMessage'), 'last-error accessor exists');
assert.ok(website.includes('Your session has expired'), 'session-expiry copy');
assert.ok(website.includes('does not have permission'), 'permission copy');
assert.ok(website.includes('too large to send'), 'payload copy');
assert.ok(website.includes('ALLOWED_API_ORIGINS'), 'CORS/origin copy');
assert.ok(website.includes('temporarily unavailable'), 'outage copy');
ok('draft-save failures are classified into actionable messages');

const setup = await readFile(new URL('../src/lib/ownerBusinessSetup.ts', import.meta.url), 'utf8');
assert.ok(setup.includes('getLastDraftSaveErrorMessage()'), 'persistOwnerBusinessSetup propagates the specific reason');
assert.ok(setup.includes("return { error: 'Unable to save your website details. Please try again.' };"),
  'generic copy stays as the last resort');
ok('persistOwnerBusinessSetup surfaces the specific failure reason');

const topBar = await readFile(new URL('../src/components/TopBar.tsx', import.meta.url), 'utf8');
assert.ok(topBar.includes('saveError'), 'TopBar accepts the specific reason');
assert.ok(topBar.includes('Save failed — check connection'), 'generic indicator stays as fallback');
ok('TopBar shows the specific failure reason when available');

console.log(`\nStep-5 save-failure wiring: ${passed}/${passed} checks PASS`);
