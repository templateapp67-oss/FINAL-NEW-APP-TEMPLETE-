/**
 * M63 — server remediation contract regression.
 *
 * Source-level assertions (house style) that the new refund/reschedule/privacy
 * routes, webhook reconciliation, observability middleware, SEO routes and
 * deep health stay wired into the shared API surface used by BOTH the Express
 * server and the Vercel serverless function.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const paymentRoutes = await read('../server/paymentRoutes.ts');
const bookingRoutes = await read('../server/bookingRoutes.ts');
const privacyRoutes = await read('../server/privacyRoutes.ts');
const observability = await read('../server/observability.ts');
const seoRoutes = await read('../server/seoRoutes.ts');
const razorpay = await read('../server/razorpay.ts');
const apiRoutes = await read('../api-routes.ts');
const vercel = JSON.parse(await read('../vercel.json'));
const hostRouting = await read('../server/hostRouting.ts');

// Refunds
assert.match(paymentRoutes, /app\.post\('\/api\/payments\/refund'/, 'refund route registered');
assert.match(paymentRoutes, /create_payment_refund_for_actor/, 'refund route uses the actor-bound RPC');
assert.match(paymentRoutes, /p_actor_user_id: user\.id/, 'actor comes from the session only');
assert.match(paymentRoutes, /mark_payment_refund_result/, 'settlement is marked through the ledger RPC');
assert.match(paymentRoutes, /NEXORA_ALLOW_LOCAL_REFUNDS/, 'mock-mode refunds require explicit opt-in');
assert.match(paymentRoutes, /refund\.processed[\s\S]*refund\.failed/, 'webhook reconciles refund events');
assert.match(paymentRoutes, /app\.get\('\/api\/payments\/refunds'/, 'refund ledger read route');
assert.match(razorpay, /createRazorpayRefund/, 'provider refund API client exists');
assert.match(razorpay, /v1\/payments\/\$\{encodeURIComponent\(input\.providerPaymentId\)\}\/refund/, 'provider refund endpoint called');
ok('refund API: actor-bound creation, provider execution, webhook reconciliation, ledger read');

// Reschedule
assert.match(bookingRoutes, /app\.post\('\/api\/customer\/bookings\/:id\/reschedule'/, 'reschedule route');
assert.match(bookingRoutes, /reschedule_customer_booking_for_actor/, 'uses the atomic M61 RPC');
assert.match(bookingRoutes, /'23P01'\) return sendError\(response, 409/, 'slot conflicts map to 409');
assert.match(bookingRoutes, /paymentStatus/, 'response keeps payment linkage visible');
ok('reschedule API: atomic slot swap mapped to HTTP semantics');

// Privacy
assert.match(privacyRoutes, /app\.get\('\/api\/account\/export'/, 'export route');
assert.match(privacyRoutes, /app\.post\('\/api\/account\/delete'/, 'deletion route');
assert.match(privacyRoutes, /export_user_data_for_actor/, 'export RPC');
assert.match(privacyRoutes, /anonymize_user_data_for_actor/, 'anonymize RPC');
assert.match(privacyRoutes, /auth\.admin\.deleteUser/, 'identity deletion via admin API');
assert.match(privacyRoutes, /"confirm", "DELETE"|confirm.*DELETE/, 'explicit confirmation required');
assert.doesNotMatch(privacyRoutes, /body\?*\.\s*(userId|user_id|targetUserId)/, 'no client-supplied subject');
assert.match(apiRoutes, /setupPrivacyRoutes\(app\)/, 'privacy routes registered');
ok('privacy API: export + confirmed erasure, subject derived from the session');

// Observability + headers
assert.match(apiRoutes, /observabilityMiddleware\(\)/, 'observability middleware wired');
assert.match(observability, /x-request-id/, 'request id correlation');
assert.match(observability, /kind: 'http_request'/, 'structured JSON log lines');
assert.match(observability, /X-Content-Type-Options/, 'nosniff header');
assert.match(observability, /NEXORA_CSP_REPORT_ONLY/, 'CSP report-only default');
assert.match(observability, /NODE_ENV === 'production' \|\| process\.env\.NEXORA_SECURITY_HEADERS/, 'framing headers gated off for previews');
ok('observability: request ids, structured logs, gated security headers');

// SEO + deep health
assert.match(apiRoutes, /setupSeoRoutes\(app\)/, 'SEO routes registered');
assert.match(seoRoutes, /app\.get\('\/robots\.txt'/, 'robots route');
assert.match(seoRoutes, /app\.get\('\/sitemap\.xml'/, 'sitemap route');
assert.match(seoRoutes, /is_published', true/, 'sitemap lists only published sites');
assert.match(seoRoutes, /'\/dashboard',/, 'private surfaces disallowed');
assert.match(seoRoutes, /app\.get\('\/api\/health\/deep'/, 'deep health route');
assert.match(seoRoutes, /verify_m54_workspace_bootstrap/, 'deep health probes the migration surface');
assert.match(hostRouting, /'\/robots\.txt'/, 'host rewrite never touches robots.txt');
assert.match(hostRouting, /'\/sitemap\.xml'/, 'host rewrite never touches sitemap.xml');
ok('SEO: robots.txt + sitemap.xml from published slugs; deep health with dependency checks');

// Edge headers
const allHeaders = Object.fromEntries(
  vercel.headers[0].headers.map((h) => [h.key, h.value]),
);
assert.equal(allHeaders['X-Content-Type-Options'], 'nosniff');
assert.match(allHeaders['Strict-Transport-Security'], /max-age=31536000/);
assert.equal(vercel.headers[1].headers.length, 2, 'framing headers separated from the API header set');
ok('vercel.json: baseline security headers at the edge');

console.log(`\nM63 server remediation contracts: ${passed}/${passed} checks PASS`);
