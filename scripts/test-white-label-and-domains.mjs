/**
 * WHITE-LABEL SAAS TRANSFORMATION — regression coverage.
 *
 * Covers the three modules added on top of the builder fixes:
 *   1. Custom domain (CNAME) mapping + anonymous, verification-gated routing.
 *   2. Testimonials inside the unified draft schema + public rendering.
 *   3. Full white-label branding isolation (per-tenant, database-backed).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

/* ================================================================== */
/* 1. CUSTOM DOMAIN — helpers                                          */
/* ================================================================== */
const {
  normalizeCustomDomain,
  isValidCustomDomain,
  isReservedHost,
  validateCustomDomain,
  looksLikeCustomDomainHost,
  dnsInstructions,
  customDomainStatusLabel,
} = await import('../src/lib/customDomain.ts');

assert.equal(normalizeCustomDomain('  HTTPS://WWW.Example.com/about?x=1 '), 'www.example.com');
assert.equal(normalizeCustomDomain('example.com:8443'), 'example.com');
assert.equal(normalizeCustomDomain('user@example.com'), 'example.com');
assert.equal(normalizeCustomDomain('example.com.'), 'example.com');
assert.equal(normalizeCustomDomain(''), null);
assert.equal(normalizeCustomDomain(null), null);
ok('domain input is normalised (scheme, path, port, credentials, trailing dot stripped)');

assert.equal(isValidCustomDomain('artsbyuma.com'), true);
assert.equal(isValidCustomDomain('www.artsbyuma.com'), true);
assert.equal(isValidCustomDomain('salon.example.co.uk'), true);
assert.equal(isValidCustomDomain('localhost'), false, 'single-label hosts are not connectable');
assert.equal(isValidCustomDomain('127.0.0.1'), false, 'IP literals are not connectable');
// A pasted URL is normalised to a bare host rather than rejected, but the
// STORED value never keeps the scheme (that is the security property).
assert.equal(normalizeCustomDomain('http://evil.com'), 'evil.com');
assert.equal(normalizeCustomDomain('https://evil.com/path?x=1#f'), 'evil.com');
assert.equal(isValidCustomDomain('-bad-.com'), false);
ok('domain validation accepts real hostnames and rejects IP literals and single labels');

assert.equal(isReservedHost('foo.vercel.app'), true, 'a platform host must never be claimable');
assert.equal(isReservedHost('foo.e2b.app'), true, 'preview hosts must never be claimable');
assert.equal(isReservedHost('final-new-app-templete.vercel.app'), true);
assert.equal(isReservedHost('artsbyuma.com'), false);
ok('platform and preview hosts can never be claimed as a tenant custom domain');

assert.deepEqual(validateCustomDomain('www.artsbyuma.com'), []);
assert.equal(validateCustomDomain('').length, 0, 'empty is "not set", not an error');
assert.equal(validateCustomDomain('nope')[0].code, 'invalid');
assert.equal(validateCustomDomain('foo.e2b.app')[0].code, 'reserved');
assert.equal(validateCustomDomain('x'.repeat(300))[0].code, 'too-long');
ok('validation reports a specific, actionable reason for every rejection');

assert.equal(looksLikeCustomDomainHost('www.artsbyuma.com'), true);
assert.equal(looksLikeCustomDomainHost('final-new-app-templete.vercel.app'), false);
assert.equal(looksLikeCustomDomainHost('localhost'), false);
assert.equal(looksLikeCustomDomainHost('127.0.0.1'), false);
ok('the router only treats a genuine foreign hostname as a custom domain');

const apex = dnsInstructions('artsbyuma.com', 'platform.example.com');
assert.equal(apex.type, 'A', 'a bare domain needs an A record, not a CNAME');
assert.equal(apex.host, '@');
const sub = dnsInstructions('www.artsbyuma.com', 'platform.example.com');
assert.equal(sub.type, 'CNAME');
assert.equal(sub.host, 'www.artsbyuma.com');
ok('DNS instructions adapt to apex vs subdomain');

assert.equal(customDomainStatusLabel('verified'), 'Connected');
assert.equal(customDomainStatusLabel('pending'), 'Waiting for DNS');
assert.equal(customDomainStatusLabel(undefined), 'Not connected');
ok('domain status renders owner-facing copy');

/* ================================================================== */
/* 2. CUSTOM DOMAIN — database contract (M69)                          */
/* ================================================================== */
const m69 = await read('supabase/migrations/20260901000201_m69_custom_domain_white_label.sql');

assert.match(m69, /alter table public\.salon_public_websites[\s\S]*?add column if not exists custom_domain text/);
assert.match(m69, /custom_domain_status public\.nexora_domain_status/);
assert.match(m69, /custom_domain_verified_at timestamptz/);
ok('the tenant website row carries the custom domain + verification columns');

assert.match(m69, /salon_public_websites_custom_domain_format/);
assert.match(m69, /create unique index if not exists salon_public_websites_custom_domain_uidx/);
assert.match(m69, /lower\(btrim\(custom_domain\)\)/);
ok('one domain belongs to one tenant, case-insensitively (unique index + format guard)');

assert.match(m69, /create or replace function public\.resolve_public_salon_by_domain/);
assert.match(m69, /custom_domain_status = 'verified'/);
assert.match(m69, /w\.is_published = true/);
assert.match(m69, /limit 1/);
ok('an unverified or unpublished domain resolves to nothing');

assert.match(
  m69,
  /grant execute on function public\.resolve_public_salon_by_domain\(text\)\s*\n\s*to anon, authenticated, service_role;/,
);
ok('the resolver is safe for anonymous visitors');

assert.match(m69, /create or replace function public\.set_owner_custom_domain/);
assert.match(m69, /v_salon := private\.owned_publish_salon_id/);
assert.match(
  m69,
  /revoke all on function public\.set_owner_custom_domain\(text, uuid\) from public, anon;/,
);
ok('an owner can only set a domain on a salon they actually own');

assert.match(m69, /custom_domain_status = case/);
assert.match(m69, /'pending'::public\.nexora_domain_status/,
  'a changed domain must drop back to pending');
assert.match(m69, /custom_domain_verified_at = case[\s\S]{0,240}?null[\s\S]{0,80}?end/,
  'a pending domain must lose its verified timestamp');
// ...but re-saving the SAME verified domain must NOT demote it.
assert.match(m69, /when w\.custom_domain = v_domain and w\.custom_domain_status = 'verified'/);
ok('changing a domain resets it to pending — a new host must be re-verified');

assert.match(
  m69,
  /revoke all on function public\.mark_custom_domain_status\(uuid, text\) from public, anon, authenticated;/,
);
assert.match(m69, /grant execute on function public\.mark_custom_domain_status\(uuid, text\) to service_role;/);
ok('only the server (service_role) can mark a domain verified — never the browser');

assert.match(m69, /'whiteLabel'/);
assert.match(m69, /nexora_public_testimonials/);
ok('M69 also projects whiteLabel and testimonials onto the public website');

/* ================================================================== */
/* 3. CUSTOM DOMAIN — server verification                              */
/* ================================================================== */
const dns = await read('server/dnsVerification.ts');
assert.match(dns, /nexora-verify=/);
assert.match(dns, /resolveCname/);
assert.match(dns, /resolve4/);
assert.match(dns, /resolveTxt/);
assert.match(dns, /DNS_TIMEOUT_MS/);
assert.match(dns, /nexora-verify=/, 'the TXT ownership proof must be defined server-side');
ok('DNS verification runs server-side and accepts CNAME, A or TXT proof');
assert.match(dns, /from '\.\.\/src\/lib\/customDomain'/);
assert.match(dns, /isReservedHost/);
ok('the probe refuses platform-reserved hosts before any lookup');

const routes = await read('api-routes.ts');
assert.match(routes, /app\.get\('\/api\/public\/resolve-domain'/);
assert.match(routes, /app\.post\('\/api\/owner\/custom-domain'/);
assert.match(routes, /app\.post\('\/api\/owner\/custom-domain\/verify'/);
assert.match(routes, /authorizeOwnerSalon/);
ok('the API exposes an anonymous resolver and two owner-guarded endpoints');

assert.match(routes, /resolve_public_salon_by_domain/);
assert.match(routes, /set_owner_custom_domain/);
assert.match(routes, /clear_owner_custom_domain/);
assert.match(routes, /mark_custom_domain_status/);
ok('every endpoint goes through the owner-scoped RPCs, never a raw table write');

const router = await read('src/main.tsx');
assert.match(router, /resolveCustomDomainSalon/);
assert.match(router, /looksLikeCustomDomainHost/);
assert.match(router, /customDomainSlug \|\| normalizedPath/);
ok('the root router resolves a custom-domain host to the tenant slug');

const routing = await read('src/lib/customDomainRouting.ts');
assert.match(routing, /const sessionMappings = new Map/);
assert.doesNotMatch(routing, /localStorage/i);
ok('the host→slug mapping is in-memory only — a writable cache cannot spoof it');

/* ================================================================== */
/* 4. TESTIMONIALS — unified schema + validation                       */
/* ================================================================== */
const { UNIFIED_DRAFT_FIELDS, DRAFT_EXCLUDED_FIELDS } = await import('../src/lib/unifiedSalonDraft.ts');
assert.ok(UNIFIED_DRAFT_FIELDS.includes('testimonials'), 'testimonials are not in the unified draft');
assert.ok(UNIFIED_DRAFT_FIELDS.includes('whiteLabel'), 'whiteLabel is not in the unified draft');
ok('testimonials and whiteLabel are part of the single unified draft schema');

const {
  normalizeTestimonials,
  normalizeTestimonial,
  validateTestimonial,
  testimonialAverage,
} = await import('../src/lib/testimonials.ts');

assert.equal(normalizeTestimonials(null).length, 0);
assert.equal(normalizeTestimonials('nope').length, 0);
assert.equal(normalizeTestimonials([{ name: '', body: '' }]).length, 0, 'empty rows are dropped');
assert.equal(normalizeTestimonials([{ name: 'Uma', body: 'Loved the balayage!' }]).length, 1);
ok('untrusted testimonial rows are normalised and unusable rows dropped');

const clamped = normalizeTestimonial({ name: 'Uma', body: 'Great', rating: 99 });
assert.equal(clamped.rating, 5, 'rating is clamped to 5');
assert.equal(normalizeTestimonial({ name: 'Uma', body: 'x', rating: -3 }).rating, 1);
assert.equal(normalizeTestimonial({ name: 'Uma', body: 'x', rating: 'nonsense' }).rating, 5);
ok('star ratings are clamped and coerced safely');

const hostile = normalizeTestimonials([{ name: '<script>alert(1)</script>', body: 'hi there friend' }]);
assert.equal(hostile.length, 1);
assert.doesNotMatch(hostile[0].name, /</, 'markup characters are stripped from testimonials');
ok('a hostile testimonial row is sanitised before it can render');

assert.equal(normalizeTestimonials(Array.from({ length: 60 }, () => ({ name: 'A', body: 'B' }))).length <= 24, true);
ok('the testimonial list is capped so one tenant cannot bloat the config');

assert.equal(validateTestimonial({ name: 'Uma', body: 'Absolutely wonderful service' }).length, 0);
assert.ok(validateTestimonial({ name: 'U', body: 'Absolutely wonderful' }).length > 0);
assert.ok(validateTestimonial({ name: 'Uma', body: 'short' }).length > 0);
assert.ok(validateTestimonial({ name: 'Uma', body: 'Loved every minute of it', rating: 9 }).length > 0);
ok('the owner editor validates name, body and rating with specific messages');

assert.equal(testimonialAverage([{ rating: 5 }, { rating: 4 }]), 4.5);
assert.equal(testimonialAverage([]), 0);
ok('the average rating is computed safely (no divide-by-zero)');

const reviews = await read('src/components/SiteReviews.tsx');
assert.match(reviews, /ownerTestimonials/);
assert.match(reviews, /site-owner-testimonial-card/);
ok('owner testimonials render on the public site');

const team = await read('src/screens/StepTeam.tsx');
assert.match(team, /<TestimonialsEditor/);
ok('the builder exposes a testimonials editor');

const editor = await read('src/components/TestimonialsEditor.tsx');
assert.match(editor, /onChange: \(next: Testimonial\[\]\) => void/);
assert.match(editor, /validateTestimonial/);
assert.match(editor, /testimonial-error/);
ok('the editor validates before committing and surfaces errors');

/* ================================================================== */
/* 5. WHITE-LABEL BRANDING ISOLATION                                   */
/* ================================================================== */
const {
  resolvePoweredBy,
  resolveWhiteLabel,
  normalizeWhiteLabel,
  sanitizeBrandingText,
  sanitizeAccentColor,
} = await import('../src/lib/whiteLabel.ts');

assert.equal(resolvePoweredBy(undefined).show, true, 'the badge shows by default');
assert.equal(resolvePoweredBy({ whiteLabel: { hidePoweredBy: true } }).show, false);
assert.equal(resolvePoweredBy({ whiteLabel: { hidePoweredBy: true } }).text, '');
ok('a tenant that hides the badge renders nothing at all');

assert.equal(
  resolvePoweredBy({ whiteLabel: { hidePoweredBy: false, poweredByText: 'Made with love' } }, 'Platform default').text,
  'Made with love',
);
assert.equal(resolvePoweredBy(undefined, 'Platform default').text, 'Platform default');
ok('a tenant override wins; the platform default is the fallback');

assert.equal(sanitizeBrandingText('<script>x</script>hello').includes('<'), false);
assert.equal(sanitizeBrandingText('x'.repeat(500)).length, 80);
assert.equal(sanitizeAccentColor('#AC0053'), '#ac0053');
assert.equal(sanitizeAccentColor('javascript:alert(1)'), null);
assert.equal(sanitizeAccentColor('#gggggg'), null);
ok('badge copy and accent colors are sanitised (no markup, valid hex only)');

const wl = resolveWhiteLabel({ whiteLabel: { hidePoweredBy: false, accentColor: '#123456', appearance: 'dark' } });
assert.equal(wl.accentColor, '#123456');
assert.equal(wl.appearance, 'dark');
assert.equal(resolveWhiteLabel({}).accentColor, null);
ok('tenant accent color and appearance flow through one resolver');

assert.deepEqual(normalizeWhiteLabel(null), { hidePoweredBy: false });
assert.deepEqual(normalizeWhiteLabel({ hidePoweredBy: 'yes' }), { hidePoweredBy: false },
  'a non-boolean toggle cannot enable white-label mode');
assert.deepEqual(normalizeWhiteLabel({ hidePoweredBy: true, accentColor: 'javascript:x' }), { hidePoweredBy: true });
ok('white-label input is normalised before it reaches the database');

// The actual bug: both footers rendered the badge unconditionally.
const templateRenderer = await read('src/components/TemplateRenderer.tsx');
assert.match(templateRenderer, /resolveWhiteLabel/);
assert.match(templateRenderer, /\{poweredBy\.show && \(/);
assert.doesNotMatch(
  templateRenderer,
  /\{DEFAULT_BRAND_CONFIG\.platform\.poweredByText\}/,
  'the template footer still renders the platform badge unconditionally',
);
ok('the template footer honours the tenant white-label setting');

const siteFooter = await read('src/components/SiteFooter.tsx');
assert.match(siteFooter, /resolvePoweredBy/);
assert.match(siteFooter, /poweredBy\.show \? \(/);
assert.doesNotMatch(siteFooter, /\{S\['common\.poweredBy'\]\}/,
  'the site footer still renders the platform badge unconditionally');
ok('the site footer honours the tenant white-label setting');

const branding = await read('src/components/BrandingWhiteLabel.tsx');
assert.match(branding, /data-testid="white-label-toggle"/);
assert.match(branding, /setData\?\.\(\(prev\) => \(\{[\s\S]{0,200}whiteLabel: normalizeWhiteLabel/);
ok('the white-label toggle persists per tenant (database-backed), not browser-global');

// Dynamic theming per tenant config.
assert.match(templateRenderer, /whiteLabel\.accentColor \|\| data\.brandColor/);
assert.match(templateRenderer, /whiteLabel\.appearance \|\| data\.websiteAppearance/);
ok('dynamic accent color and theme switching are driven by the tenant config');

/* ================================================================== */
/* 6. Draft integrity is preserved                                     */
/* ================================================================== */
const unified = await read('src/lib/unifiedSalonDraft.ts');
assert.ok(!UNIFIED_DRAFT_FIELDS.includes('customDomain'), 'a domain must not be a draft field');
assert.ok(!UNIFIED_DRAFT_FIELDS.includes('customDomainStatus'));
assert.ok(DRAFT_EXCLUDED_FIELDS.includes('customDomain'), 'the domain must be explicitly excluded');
assert.ok(DRAFT_EXCLUDED_FIELDS.includes('customDomainStatus'));
assert.ok(DRAFT_EXCLUDED_FIELDS.includes('salonId'), 'identity must stay excluded');
assert.ok(DRAFT_EXCLUDED_FIELDS.includes('publishState'));
ok('domain and identity stay database-owned and out of the browser cache');

const types = await read('src/types.ts');
assert.match(types, /export interface WhiteLabelSettings/);
assert.match(types, /export interface Testimonial/);
assert.match(types, /whiteLabel\?: WhiteLabelSettings/);
assert.match(types, /testimonials\?: Testimonial\[\]/);
assert.match(types, /customDomain\?: string \| null/);
ok('the unified data model declares white-label, testimonials and custom domain');

console.log(`\nWhite-label SaaS transformation: ${passed}/${passed} checks PASS`);
