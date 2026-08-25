/**
 * Requirement 8 — public website resolution chain.
 *
 * A customer visiting `final-new-app-templete.vercel.app/<business-name>` must resolve
 *   Hostname/Slug → Published Business → Active Template
 *   → Template Configuration → Public Business Data
 * for the CORRECT business and nothing else.
 *
 * Rules asserted here (against a real PostgreSQL PGlite + M38→M52):
 *   * hostname → slug on the client (extractSubdomainSlug) and server
 *     (resolveHostSlug) agree;
 *   * `get_public_salon_website(p_slug)` is the only anonymous read surface —
 *     slug-only, never a business/salon id;
 *   * two published businesses with different templates resolve to their own
 *     salon_id / business_name / template_key / public config (no crossover);
 *   * the ACTIVE TEMPLATE is enforced inside the database: deactivating the
 *     theme (or corrupting template_key) resolves to ZERO rows — never a
 *     default template and never a fallback business;
 *   * missing / unpublished / inactive / deleted businesses resolve to zero
 *     rows (404), and the client renders "Salon not found" — the app never
 *     substitutes the brand's default business when resolution fails;
 *   * no hardcoded salon/business id anywhere in the client resolution path.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import {
  extractSubdomainSlug,
  getBrandBaseHost,
  normalizeRouteSlug,
} from '../src/lib/salonRouting.ts';
import { resolveHostSlug, rewriteHostPath } from '../server/hostRouting.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');
const read = async (f) => readFile(join(migrationDir, f), 'utf8');
const readRoot = async (f) => readFile(join(root, f), 'utf8');

function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  const n = sql.length;
  const push = () => {
    const t = buf.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (t) out.push(buf.trim());
    buf = '';
  };
  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') { buf += sql[i]; i++; }
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      buf += c + sql[i + 1]; i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) { buf += sql[i]; i++; }
      if (i < n) { buf += sql[i] + sql[i + 1]; i += 2; }
      continue;
    }
    if (c === '$') {
      let j = i + 1; let tag = '$';
      while (j < n && /[A-Za-z0-9_]/.test(sql[j])) { tag += sql[j]; j++; }
      if (j < n && sql[j] === '$') {
        tag += '$';
        const end = sql.indexOf(tag, j + 1);
        if (end === -1) { buf += sql.slice(i); break; }
        buf += sql.slice(i, end + tag.length);
        i = end + tag.length;
        continue;
      }
    }
    if (c === "'" || c === '"') {
      const q = c; buf += c; i++;
      while (i < n) {
        if (sql[i] === '\\') { buf += sql[i]; if (i + 1 < n) buf += sql[i + 1]; i += 2; continue; }
        if (sql[i] === q) {
          if (sql[i + 1] === q) { buf += q + q; i += 2; continue; }
          buf += q; i++; break;
        }
        buf += sql[i]; i++;
      }
      continue;
    }
    if (c === ';') { push(); i++; continue; }
    buf += c; i++;
  }
  push();
  return out;
}

const stripTxn = (sql) => sql.replace(/^\s*begin\s*;\s*/im, '').replace(/\s*commit\s*;\s*$/im, '');
const execMigration = async (db, file) => {
  const sql = stripTxn(await read(file));
  for (const stmt of splitStatements(sql)) {
    await db.exec(stmt);
  }
};

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

// ---- Real PostgreSQL (PGlite) + canonical auth/storage bootstrap ----------
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
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
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text not null unique, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null, owner_id text,
    created_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;

  create table if not exists public.business_locations (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null,
    address_label text,
    approval_status text not null default 'approved',
    created_at timestamptz not null default now()
  );
  create table if not exists public.themes (
    id uuid primary key default gen_random_uuid(),
    theme_id text not null unique,
    name text not null,
    slug text,
    is_active boolean not null default true
  );
  insert into public.themes (theme_id, name, slug) values
    ('barber_mens_grooming', 'Barber & Men''s Grooming', 'barber_mens_grooming'),
    ('hair_studio_color_bar', 'Hair Studio & Color Bar', 'hair_studio_color_bar'),
    ('beauty_skin_spa', 'Beauty, Skin & Spa', 'beauty_skin_spa'),
    ('family_full_service', 'Full-Service Family Salon', 'family_full_service'),
    ('nail_lash_studio', 'Nail & Lash Studio', 'nail_lash_studio')
  on conflict (theme_id) do nothing;
`);

await execMigration(db, '20260822000101_m38_reconciliation_fix.sql');
await execMigration(db, '20260822000201_m39_owner_publish_website.sql');
await execMigration(db, '20260824000101_m44_business_publishing.sql');
await execMigration(db, '20260824000201_m45_business_slug_hardening.sql');
// M46's SQL projection is validated at creation: create the services table
// (Design-A M04 shape, not part of the Design-B replay) before M46 applies.
await db.exec(`
  create table if not exists public.services (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid references public.salons(id),
    theme_id uuid references public.themes(id),
    category_id uuid,
    name text not null,
    description text,
    price_paise bigint not null default 0,
    duration_minutes integer not null default 30,
    is_featured boolean not null default false,
    display_order integer not null default 0,
    is_active boolean not null default true,
    deleted_at timestamptz
  );
`);
await execMigration(db, '20260824000301_m46_public_access_security.sql');
await execMigration(db, '20260825000101_m50_publish_readiness_validation.sql');
await execMigration(db, '20260825000201_m51_slug_collision_hardening.sql');
await execMigration(db, '20260825000301_m52_public_resolution_hardening.sql');

const selfChecks = [
  (await db.query('select check_name, ok from public.verify_m45_business_slug_hardening()')).rows,
  (await db.query('select check_name, ok from public.verify_m51_slug_collision_hardening()')).rows,
  (await db.query('select check_name, ok from public.verify_m52_public_resolution_hardening()')).rows,
];
assert.ok(selfChecks.every((rows) => rows.every((r) => r.ok === true)), JSON.stringify(selfChecks));
ok('M38 → M52 apply cleanly; M45 + M51 + M52 verifiers are green');

// ---- Hostname/Slug resolution, client and server agree --------------------
assert.equal(getBrandBaseHost(), 'final-new-app-templete.vercel.app');
// Live Vercel deployment: the apex host never yields a slug — business
// sites resolve through `/<slug>` path form. Wildcard subdomain routing
// still works on custom white-label domains.
assert.equal(extractSubdomainSlug('final-new-app-templete.vercel.app'), '');
assert.equal(extractSubdomainSlug('/NEXORA-SALON/'.replace('/','')), '');
assert.equal(resolveHostSlug('final-new-app-templete.vercel.app'), '');
assert.equal(resolveHostSlug('nexora-salon.salonhub.example', 'salonhub.example'), 'nexora-salon');
assert.equal(resolveHostSlug('nexora-salon.final-new-app-templete.vercel.app'), '');
assert.equal(rewriteHostPath('nexora-salon.salonhub.example', '/', 'salonhub.example'), '/nexora-salon');
assert.equal(rewriteHostPath('final-new-app-templete.vercel.app', '/nexora-salon'), '/nexora-salon');
assert.equal(normalizeRouteSlug('/NEXORA-SALON/'), 'nexora-salon');
ok('hostname → slug: Vercel base uses path form; client + server agree on custom domains');

// ---- Tenant bootstrap: two published businesses, different templates ------
const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
  ownerC: '00000000-0000-4000-8000-0000000000c1',
  orgC: '10000000-0000-4000-8000-0000000000c1',
  salonC: '20000000-0000-4000-8000-0000000000c1',
  serviceA1: '30000000-0000-4000-8000-0000000000a1',
  serviceB1: '30000000-0000-4000-8000-0000000000b1',
};

const setUser = (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
const asRole = async (role, uid, fn) => {
  await db.exec('reset role');
  await setUser(uid);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await setUser('');
  }
};

for (const key of ['ownerA', 'ownerB', 'ownerC']) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ids[key], `${key}@test.test`]);
  await db.query(`insert into public.profiles (id, platform_role) values ($1, 'business_user')`, [ids[key]]);
}

const makeBusiness = async (key, salonName, slug, templateKey, brandColor, heroLayout) => {
  const orgId = ids[`org${key.at(-1).toUpperCase()}`];
  const salonId = ids[`salon${key.at(-1).toUpperCase()}`];
  const ownerId = ids[`owner${key.at(-1).toUpperCase()}`];
  await db.query(
    `insert into public.organizations (id, name, status) values ($1, $2, 'active')`,
    [orgId, salonName],
  );
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role, is_active)
     values ($1, $2, 'owner', true)`,
    [orgId, ownerId],
  );
  await db.query(
    `insert into public.salons (id, organization_id, name, is_active)
     values ($1, $2, $3, true)`,
    [salonId, orgId, salonName],
  );
  await asRole('authenticated', ownerId, () =>
    db.query(
      `select * from public.publish_owner_salon_website(
         'client-ignored', $1::text,
         jsonb_build_object(
           'salonName', $2::text,
           'tagline', $3::text,
           'brandColor', $4::text,
           'templateConfig', jsonb_build_object('heroLayout', $5::text)
         )::jsonb,
         $6::uuid)`,
      [templateKey, salonName, `${salonName} — public tagline`, brandColor, heroLayout, salonId],
    ));
  return { orgId, salonId, ownerId };
};

const bizA = await makeBusiness('A', 'Nexora Salon', 'nexora-salon', 'barber_mens_grooming', '#7c3aed', 'split');
const bizB = await makeBusiness('B', 'Blush Beauty Bar', 'blush-beauty-bar', 'beauty_skin_spa', '#0f766e', 'center');
const bizC = await makeBusiness('C', 'Hidden Draft Co.', 'hidden-draft-co', 'hair_studio_color_bar', '#b45309', 'split');
// C stays unpublished (draft only).
await asRole('authenticated', bizC.ownerId, () =>
  db.query(`select * from public.unpublish_owner_salon_website($1::uuid)`, [bizC.salonId]));

// Services store per business; public services RPC must return the right set.
await db.query(
  `insert into public.services (id, salon_id, name, theme_id, price_paise, duration_minutes, is_active)
   values
     ($1, $2, 'Skin Fade', (select id from public.themes where theme_id = 'barber_mens_grooming'), 45000, 45, true),
     ($3, $4, 'Glow Facial', (select id from public.themes where theme_id = 'beauty_skin_spa'), 120000, 60, true)`,
  [ids.serviceA1, bizA.salonId, ids.serviceB1, bizB.salonId],
);

const publicWebsite = (slug) => asRole('anon', '', () =>
  db.query(`select * from public.get_public_salon_website($1)`, [slug]).then((r) => r.rows));
const publicServices = (slug) => asRole('anon', '', () =>
  db.query(`select * from public.get_public_salon_services($1)`, [slug]).then((r) => r.rows));

// ---- Published Business → Active Template → Config → Data -----------------
const rowA = await publicWebsite('nexora-salon');
assert.equal(rowA.length, 1, 'Nexora Salon must resolve to exactly one business');
assert.equal(rowA[0].salon_id, bizA.salonId, 'must be Business A, never a default');
assert.equal(rowA[0].business_name, 'Nexora Salon');
assert.equal(rowA[0].template_key, 'barber_mens_grooming', 'Business A renders its own active template');
assert.equal(rowA[0].public_config.brandColor, '#7c3aed');
assert.equal(rowA[0].public_config.templateConfig.heroLayout, 'split');
assert.equal(rowA[0].tagline ?? rowA[0].public_config.tagline, 'Nexora Salon — public tagline');

const rowB = await publicWebsite('blush-beauty-bar');
assert.equal(rowB.length, 1);
assert.equal(rowB[0].salon_id, bizB.salonId, 'Business B must not return Business A data');
assert.equal(rowB[0].business_name, 'Blush Beauty Bar');
assert.equal(rowB[0].template_key, 'beauty_skin_spa');
assert.equal(rowB[0].public_config.brandColor, '#0f766e');
assert.equal(rowB[0].public_config.templateConfig.heroLayout, 'center');
ok('each published slug resolves to its own business, template and config (no crossover)');

const servicesA = await publicServices('nexora-salon');
assert.equal(servicesA.length, 1);
assert.equal(servicesA[0].name, 'Skin Fade');
assert.equal(servicesA[0].theme_key, 'barber_mens_grooming');
const servicesB = await publicServices('blush-beauty-bar');
assert.equal(servicesB.length, 1);
assert.equal(servicesB[0].name, 'Glow Facial');
assert.equal(servicesB[0].theme_key, 'beauty_skin_spa');
ok('public services are resolved per business via the slug projection');

// ---- Resolution failure must never yield a default business ---------------
for (const missing of ['no-such-business', 'Nexora', 'nexora-salon-99', 'admin', '']) {
  assert.equal((await publicWebsite(missing)).length, 0, `'${missing}' must resolve to zero rows`);
}
assert.equal((await publicWebsite('hidden-draft-co')).length, 0, 'unpublished business must not resolve');
assert.equal((await publicWebsite('NEXORA-SALON')).length, 1,
  'case/whitespace variants still resolve to the same business (normalized slug)');
ok('unknown, invalid and unpublished slugs resolve to zero rows — no default business');

await db.query(`update public.salons set is_active = false where id = $1`, [bizB.salonId]);
assert.equal((await publicWebsite('blush-beauty-bar')).length, 0, 'inactive business must fail closed');
await db.query(`update public.salons set is_active = true where id = $1`, [bizB.salonId]);
assert.equal((await publicWebsite('blush-beauty-bar')).length, 1);
await db.query(`update public.salons set deleted_at = now() where id = $1`, [bizB.salonId]);
assert.equal((await publicWebsite('blush-beauty-bar')).length, 0, 'deleted business must fail closed');
await db.query(`update public.salons set deleted_at = null where id = $1`, [bizB.salonId]);
ok('inactive and deleted businesses fail closed and return after reactivation');

// ---- Active Template is enforced in the database ---------------------------
await db.query(
  `update public.themes set is_active = false
   where theme_id = (select template_key from public.salon_public_websites where salon_id = $1)`,
  [bizA.salonId],
);
assert.equal((await publicWebsite('nexora-salon')).length, 0,
  'deactivating the template must fail the whole chain closed (no default template)');
assert.equal((await publicServices('nexora-salon')).length, 0);
await db.query(
  `update public.themes set is_active = true
   where theme_id = (select template_key from public.salon_public_websites where salon_id = $1)`,
  [bizA.salonId],
);
assert.equal((await publicWebsite('nexora-salon')).length, 1);
assert.equal((await publicWebsite('nexora-salon'))[0].template_key, 'barber_mens_grooming');

await db.query(
  `update public.salon_public_websites set template_key = 'bogus_theme' where salon_id = $1`,
  [bizA.salonId],
);
assert.equal((await publicWebsite('nexora-salon')).length, 0,
  'an unknown template_key must never fall back to a default template');
await db.query(
  `update public.salon_public_websites set template_key = 'barber_mens_grooming' where salon_id = $1`,
  [bizA.salonId],
);
assert.equal((await publicWebsite('nexora-salon')).length, 1);
ok('active template enforced: deactivated/unknown themes resolve to zero rows, never a default');

// ---- Client rules: slug-only, no hardcoded id, no fallback business -------
const [main, publicView, m52] = await Promise.all([
  readRoot('src/main.tsx'),
  readRoot('src/components/PublicSalonView.tsx'),
  read('20260825000301_m52_public_resolution_hardening.sql'),
]);
assert.match(main, /const normalizedPath = subdomainSlug \|\| normalizeRouteSlug\(pathname\)/);
assert.match(main, /\.rpc\('get_public_salon_website', \{ p_slug: normalizedPath \}\)/);
assert.match(main, /setRoute\('not_found'\)/);
assert.match(publicView, /\.rpc\('get_public_salon_website', \{ p_slug: slug \}\)/);
assert.match(publicView, /\.rpc\('get_public_salon_services', \{ p_slug: slug \}\)/);
assert.match(publicView, /applyPublicTemplateConfiguration\([\s\S]*, config, website\.template_key\)/);
assert.doesNotMatch(main, /['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i);
assert.doesNotMatch(publicView, /['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i);
// The brand fallback may exist ONLY in the unconfigured (offline demo)
// initializer. On a configured deployment a failed resolution is
// not-found/error, never a default business.
const fallbackUsages = publicView.match(/buildBrandFallbackSalonData/g) || [];
assert.equal(fallbackUsages.length, 2, 'brand fallback = import + offline initializer only');
assert.match(publicView, /isSupabaseConfigured\s*\?\s*\{ status: 'loading'[\s\S]{0,200}buildBrandFallbackSalonData\(slug\)/);
assert.match(publicView, /setState\(data\s*\?\s*\{ status: 'ready', data \}\s*:\s*\{ status: 'not-found'/);
assert.match(publicView, /setState\(\{ status: 'error', data: emptyPublicData\(slug\) \}\)/);
assert.doesNotMatch(publicView, /if \(matchesBrandFallbackSlug\(slug\)\) \{/);
ok('client resolves only by slug, no hardcoded business id, and never falls back to a default business');

assert.match(m52, /join public\.themes t on t\.theme_id = w\.template_key and t\.is_active = true/);
assert.match(m52, /w\.is_published = true/);
assert.match(m52, /s\.is_active = true/);
assert.match(m52, /s\.deleted_at is null/);
assert.match(m52, /grant execute on function public\.get_public_salon_website\(text\)[\s\S]*to anon/);
assert.doesNotMatch(m52, /grant select on table public\.salon_public_websites to anon/);
ok('M52 database chain: slug-only + published + active + deleted + ACTIVE template, anon RPC only');

console.log(`\nPublic resolution chain: ${passed}/${passed} checks PASS`);
