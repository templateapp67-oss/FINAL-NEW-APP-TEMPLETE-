/**
 * Requirement 7 — business name change after publishing.
 *
 * Implemented strategy (reported): IMMUTABLE SLUG AFTER PUBLICATION.
 *
 *   * The first `publish_owner_salon_website` call (M39/M44/M45/M51) sets
 *     `salon_public_websites.published_at`; from that moment the published
 *     slug is permanently locked: the RPC keeps `v_slug := v_existing.slug`
 *     on every later publish, regardless of the (possibly renamed) business
 *     name in the draft config.
 *   * An unpublish only flips `is_published`; `published_at` and the slug
 *     survive, so `unpublish → rename → republish` keeps the same URL.
 *   * The business-name change is applied to the SAME public URL: the publish
 *     RPC updates `salons.name` (and the org name) from the draft config, and
 *     `get_public_salon_website` reads `business_name` from `salons.name` —
 *     so a shared/old bookmark still resolves to the same site, now showing
 *     the new name. Nothing silently changes or breaks the old URL.
 *   * A rename BEFORE the first publish is allowed to pick a new slug: no
 *     public link existed yet, so no old URL needs preserving.
 *   * There is no per-business alias/redirect table and no second URL system:
 *     the slug never changes after publication, so no rewrite is required.
 *
 * Verified here against a real PostgreSQL (PGlite) with the canonical
 * M38 → M39 → M44 → M45 → M50 → M51 migrations, plus static guards that the
 * UI never advertises a different URL after a rename.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { publicWebsiteUrl } from '../src/lib/publicWebsiteUrl.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');
const read = async (f) => readFile(join(migrationDir, f), 'utf8');
const readRoot = async (f) => readFile(join(root, f), 'utf8');

// Same statement splitter + txn stripper used by the Phase 2 suites.
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

  -- Tables referenced by the M44 publish paths before M38 defines the rest.
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
await execMigration(db, '20260825000101_m50_publish_readiness_validation.sql');
await execMigration(db, '20260825000201_m51_slug_collision_hardening.sql');
const selfChecks = (await db.query(
  'select check_name, ok from public.verify_m45_business_slug_hardening()',
)).rows.concat(
  (await db.query('select check_name, ok from public.verify_m51_slug_collision_hardening()')).rows,
);
assert.ok(selfChecks.every((r) => r.ok === true), JSON.stringify(selfChecks));
ok('M38 → M51 apply cleanly; M45 + M51 verifiers are green');

// ---- Strategy is structurally server-side and immutable -------------------
const publishDef = (await db.query(
  `select pg_get_functiondef('public.publish_owner_salon_website(text,text,jsonb,uuid)'::regprocedure) as d`,
)).rows[0].d;
const unpublishDef = (await db.query(
  `select pg_get_functiondef('public.unpublish_owner_salon_website(uuid)'::regprocedure) as d`,
)).rows[0].d;
assert.match(publishDef, /v_existing\.published_at is not null/);
assert.match(publishDef, /v_slug := v_existing\.slug/);
assert.match(publishDef, /published_at = coalesce\(w\.published_at, now\(\)\)/);
assert.doesNotMatch(unpublishDef, /set slug/);
assert.doesNotMatch(unpublishDef, /set name/);
ok('publish RPC locks the first slug via published_at; unpublish never touches slug/name');

// ---- Two independent owner tenants ----------------------------------------
const tenant = (prefix, name) => ({
  ownerId: `00000000-0000-4000-8000-0000000000${prefix}1`,
  orgId: `10000000-0000-4000-8000-0000000000${prefix}1`,
  salonId: `20000000-0000-4000-8000-0000000000${prefix}1`,
  name,
});
const tenants = {
  published: tenant('a', 'Nexora Salon'),
  firstPublish: tenant('b', 'Old Name Salon'),
};
for (const t of Object.values(tenants)) {
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [t.ownerId, `${t.ownerId}@test.test`]);
  await db.query(`insert into public.profiles (id, platform_role) values ($1, 'business_user')`, [t.ownerId]);
  await db.query(
    `insert into public.organizations (id, name, status) values ($1, $2, 'active')`,
    [t.orgId, t.name],
  );
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role, is_active)
     values ($1, $2, 'owner', true)`,
    [t.orgId, t.ownerId],
  );
  await db.query(
    `insert into public.salons (id, organization_id, name, is_active) values ($1, $2, $3, true)`,
    [t.salonId, t.orgId, t.name],
  );
}

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

const publish = (t, salonName, template = 'barber_mens_grooming') => asRole('authenticated', t.ownerId, () =>
  db.query(
    `select * from public.publish_owner_salon_website(
       'client-ignored', $1::text,
       jsonb_build_object('salonName', $2::text, 'tagline', 'Same site, new name')::jsonb,
       $3::uuid)`,
    [template, salonName, t.salonId],
  ).then((r) => r.rows[0]));

const publicRow = (slug) => asRole('anon', '', () =>
  db.query(`select * from public.get_public_salon_website($1)`, [slug]).then((r) => r.rows));

const salonNameOf = (t) => db.query(
  `select name, slug from public.salons where id = $1`, [t.salonId],
).then((r) => r.rows[0]);

// ---- Case A: publish → rename → republish keeps the SAME public URL -------
const t = tenants.published;
const first = await publish(t, 'Nexora Salon');
assert.deepEqual(
  { slug: first.slug, published: first.is_published },
  { slug: 'nexora-salon', published: true },
);
const firstUrl = publicWebsiteUrl(first.slug);
assert.equal(firstUrl, 'https://nexora-salon.nexora.site');
ok('first publish of "Nexora Salon" → nexora-salon → https://nexora-salon.nexora.site');

// Rename once and republish: same slug, same URL, new public name.
const renamedOnce = await publish(t, 'Nexora Studio');
assert.equal(renamedOnce.slug, 'nexora-salon', 'rename must never change the published slug');
assert.equal(publicWebsiteUrl(renamedOnce.slug), firstUrl, 'public URL must be byte-identical');
const salonOnce = await salonNameOf(t);
assert.equal(salonOnce.name, 'Nexora Studio');
assert.equal(salonOnce.slug, 'nexora-salon');
const publicOnce = await publicRow('nexora-salon');
assert.equal(publicOnce.length, 1, 'the old/shared bookmark must still resolve');
assert.equal(publicOnce[0].business_name, 'Nexora Studio');
ok('rename → republish: same URL, public site now shows the new business name');

// Rename again (twice more) — the only public URL never moves.
for (const nextName of ['Nexora Hair Co.', 'Nexora & Sons']) {
  const again = await publish(t, nextName);
  assert.equal(again.slug, 'nexora-salon', 'repeated renames must keep the first slug');
  assert.equal(publicWebsiteUrl(again.slug), firstUrl);
  const pub = await publicRow('nexora-salon');
  assert.equal(pub.length, 1);
  assert.equal(pub[0].business_name, nextName, 'public site reflects the current business name');
}
const finalPreview = await publicRow('nexora-salon');
assert.equal(finalPreview.length, 1);
ok('repeated business-name changes all apply under the same immutable public URL');

// ---- Unpublish → rename → republish: URL reservation survives -------------
await asRole('authenticated', t.ownerId, () =>
  db.query(`select * from public.unpublish_owner_salon_website($1::uuid)`, [t.salonId]));
assert.equal((await publicRow('nexora-salon')).length, 0, 'unpublish hides the site (URL kept)');
const backLive = await publish(t, 'Nexora Again Since 2026');
assert.equal(backLive.slug, 'nexora-salon', 'republish after unpublish must restore the same URL');
assert.equal((await publicRow('nexora-salon'))[0].business_name, 'Nexora Again Since 2026');
ok('unpublish → rename → republish keeps the first public URL (published_at survives)');

// ---- Case B: rename BEFORE the first publish picks a fresh URL ------------
const fresh = tenants.firstPublish;
// Never published (no website row → no public link to break).
const renamedFirst = await publish(fresh, 'New Name Salon');
assert.equal(renamedFirst.slug, 'new-name-salon');
assert.equal(publicWebsiteUrl(renamedFirst.slug), 'https://new-name-salon.nexora.site');
assert.equal((await publicRow('new-name-salon'))[0].business_name, 'New Name Salon');
assert.equal((await publicRow('old-name-salon')).length, 0);
ok('rename before the FIRST publish safely allocates the new name — no old link exists');

// ---- Static guards: nothing else writes the slug or the URL ----------------
const [service, setup, success, migrations, app] = await Promise.all([
  readRoot('src/lib/salonWebsiteService.ts'),
  readRoot('src/screens/StepPublishSetup.tsx'),
  readRoot('src/screens/StepPublishSuccess.tsx'),
  read('20260824000501_m48_template_switch_isolation.sql'),
  readRoot('src/App.tsx'),
]);
assert.match(service, /\.update\(\{ config \}\)/);
assert.doesNotMatch(service, /\.update\(\{[^}]*slug/i, 'draft save must never update the slug column');
assert.match(setup, /publishState === 'published' && data\.websiteSlug\) return data\.websiteSlug/);
assert.match(success, /const url = data\.publishedUrl \|\| ''/);
assert.match(app, /websiteSlug: draft\?\.slug \|\| provisioned\.slug \|\| ''/);
for (const bodyCut of ['set_owner_salon_template', 'set_owner_salon_visual_config']) {
  const start = migrations.indexOf(`create or replace function public.${bodyCut}`);
  const next = migrations.indexOf('\ncreate or replace function', start + 10);
  const body = next === -1 ? migrations.slice(start) : migrations.slice(start, next);
  assert.doesNotMatch(body, /set\s+slug|slug\s*=\s*[^t]/, `${bodyCut} must never write the slug`);
  assert.doesNotMatch(body, /set\s+name\b/, `${bodyCut} must never write the business name`);
}
ok('client + M48 guards: draft save, template switch and visual config never touch slug/name');

console.log(`\nBusiness name change after publishing: ${passed}/${passed} checks PASS`);
