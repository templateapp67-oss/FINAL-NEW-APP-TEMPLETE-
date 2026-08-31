/**
 * White-label dynamic provisioning + template switching — SQL/RLS tests.
 *
 * Runs in PGlite. Verifies:
 *   - provision_owner_salon(name, slug, template_id) creates org + owner
 *     membership + salon + a PUBLISHED salon_public_websites row, all in one
 *     call, so the site is immediately live at /<slug> and <slug>.<base>.
 *   - Slugs are unique (another owner cannot claim an in-use slug).
 *   - set_owner_salon_template updates presentation ONLY (theme_id +
 *     template_key) and never deletes services/products/bookings.
 *   - RLS isolation: Owner A cannot read Owner B's published row through the
 *     owner-update path, while anon can read any PUBLISHED row.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

// Split a SQL migration into individual statements, respecting dollar-quoted
// bodies, string literals, identifiers, and comments. PGlite's multi-statement
// exec can silently drop DDL that lives inside PL/pgSQL DO blocks when they are
// part of a large batch; executing each top-level statement separately avoids
// that and matches how Supabase applies migrations.
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

// PGlite runs in autocommit and silently no-ops an explicit `begin;...commit;`
// wrapper. Strip transaction control and apply each statement individually.
const stripTxn = (sql) => sql.replace(/^\s*begin\s*;\s*/im, '').replace(/\s*commit\s*;\s*$/im, '');
const read = async (f) => stripTxn(await readFile(join(migrationDir, f), 'utf8'));

let passed = 0;
const ok = (label) => { passed++; console.log(`PASS ${label}`); };

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
const execMigration = async (sql) => {
  for (const stmt of splitStatements(sql)) {
    await db.exec(stmt);
  }
};

// Minimal canonical Design-B shape + helpers the migration depends on.
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  exception when others then raise notice 'role setup: %', sqlerrm; end $$;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create schema if not exists private;

  create table if not exists public.profiles (
    id uuid primary key, platform_role text not null default 'customer',
    full_name text, phone text,
    is_active boolean not null default true, updated_at timestamptz not null default now()
  );
  create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(), name text not null,
    status text not null default 'active', created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table if not exists public.organization_members (
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    role text not null default 'staff', is_active boolean not null default true,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    primary key (organization_id, user_id),
    constraint om_role_check check (role in ('owner','staff'))
  );
  create table if not exists public.themes (
    id uuid primary key default gen_random_uuid(), theme_id text not null unique,
    name text not null, slug text unique, is_active boolean not null default true
  );
  create table if not exists public.salons (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id),
    theme_id uuid references public.themes(id),
    name text not null, address text, city text,
    is_active boolean not null default true,
    deleted_at timestamptz, created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table if not exists public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id) on delete cascade,
    slug text not null, template_key text, config jsonb not null default '{}'::jsonb,
    is_published boolean not null default false, published_at timestamptz,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (salon_id), unique (slug)
  );
  -- Tenant data that must survive template switching.
  create table if not exists public.services (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    theme_id uuid references public.themes(id), name text not null,
    price_paise bigint not null default 0, duration_minutes integer,
    is_active boolean not null default true, deleted_at timestamptz
  );
  create table if not exists public.service_price_variants (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    theme_id uuid references public.themes(id), service_id uuid references public.services(id),
    name text not null, price_paise bigint not null, duration_minutes integer
  );
  create table if not exists public.products (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    name text not null, price_paise bigint not null default 0, stock_quantity integer not null default 0
  );
  create table if not exists public.business_locations (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    name text not null, address_line1 text not null, city text not null,
    latitude numeric, longitude numeric
  );
  create table if not exists public.bookings (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    customer_id uuid references public.profiles(id), customer_name text not null,
    total_paise bigint not null default 0, status text not null default 'confirmed'
  );
  create table if not exists public.payment_orders (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    booking_id uuid references public.bookings(id), amount_paise bigint not null,
    currency text not null default 'INR', status text not null
  );
  create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(), salon_id uuid references public.salons(id),
    booking_id uuid references public.bookings(id), payment_order_id uuid references public.payment_orders(id),
    amount_paise bigint not null, status text not null, provider_payment_id text
  );

  insert into public.themes (theme_id, name, slug) values
    ('barber_mens_grooming','Barber','barber_mens_grooming'),
    ('hair_studio_color_bar','Hair Studio','hair_studio_color_bar'),
    ('beauty_skin_spa','Beauty Spa','beauty_skin_spa'),
    ('family_full_service','Family','full_service_family_salon'),
    ('nail_lash_studio','Nail Lash','nail_lash_studio') on conflict do nothing;

  create or replace function private.is_active_admin() returns boolean language sql stable security definer set search_path='' as $$
    select exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.platform_role='admin') $$;
  create or replace function private.has_salon_role(p_salon_id uuid, p_roles text[] default array['owner','staff']) returns boolean language sql stable security definer set search_path='' as $$
    select private.is_active_admin() or exists (
      select 1 from public.salons s join public.organization_members om on om.organization_id=s.organization_id
      join public.profiles p on p.id=om.user_id
      where s.id=p_salon_id and s.deleted_at is null and s.is_active
        and om.user_id=auth.uid() and om.is_active and om.role=any(p_roles) and p.is_active) $$;
  create or replace function private.can_manage_salon_settings(p_salon_id uuid) returns boolean language sql stable security definer set search_path='' as $$
    select private.has_salon_role(p_salon_id, array['owner']) $$;
  create or replace function private.is_public_salon(p_salon_id uuid) returns boolean language sql stable security definer set search_path='' as $$
    select exists (select 1 from public.salons s where s.id=p_salon_id and s.is_active and s.deleted_at is null) $$;
  create or replace function public.owner_salon_ids() returns setof uuid language sql stable security definer set search_path='' as $$
    select s.id from public.salons s
    join public.organization_members om on om.organization_id=s.organization_id
    join public.profiles p on p.id=om.user_id
    where om.user_id=auth.uid() and om.is_active and om.role='owner' and p.is_active and s.is_active and s.deleted_at is null $$;
  grant execute on function public.owner_salon_ids() to authenticated;

  alter table public.salons enable row level security;
  alter table public.salon_public_websites enable row level security;
  alter table public.services enable row level security;
  create policy sal_owner on public.salons for all to authenticated using (private.can_manage_salon_settings(id)) with check (private.can_manage_salon_settings(id));
  create policy svc_owner on public.services for all to authenticated using (private.has_salon_role(salon_id)) with check (private.has_salon_role(salon_id));
  grant select,insert,update on public.salon_public_websites to authenticated;
  grant select on public.salon_public_websites to anon;
  grant select on public.salons to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);

await execMigration(await read('20260823000401_phase1_whitelabel_provisioning.sql'));
ok('white-label provisioning migration applies cleanly');

const verify = (await db.query('select check_name, ok from public.verify_phase1_whitelabel()')).rows;
assert.ok(verify.every((r) => r.ok === true), JSON.stringify(verify));
ok('verify_phase1_whitelabel() is green');

await execMigration(await read('20260824000501_m48_template_switch_isolation.sql'));
ok('M48 template-switch isolation migration applies cleanly');

// M66's public projection follows the canonical (Design-B / M38-reconciled)
// business_locations shape. This replay bootstraps the older Design-A table,
// so apply the same additive reconciliation columns the live M38 fix added
// before redefining the SQL function.
await execMigration(`
  alter table public.business_locations
    add column if not exists address_label text,
    add column if not exists approval_status text not null default 'approved';
`);
await execMigration(await read('20260831000101_m66_owner_photo_public_parity.sql'));
ok('M66 owner-photo public parity migration applies cleanly');

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  customerA: '00000000-0000-4000-8000-0000000000c1',
};
await db.query(`insert into auth.users (id,email) values ($1,'a@x'),($2,'b@x'),($3,'customer@x')`, [ids.ownerA, ids.ownerB, ids.customerA]);
await db.query(
  `insert into public.profiles (id,full_name,phone) values ($1,'Ananya Owner','+919900000001'),($2,'B Owner','+919900000002'),($3,'Neha Customer','+919900000003')`,
  [ids.ownerA, ids.ownerB, ids.customerA],
);

const setUser = (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
const asRole = async (role, uid, fn) => {
  await db.exec('reset role'); await setUser(uid); await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec('reset role'); await setUser(''); }
};

// 1. Provision A — site must be LIVE immediately.
let row;
await asRole('authenticated', ids.ownerA, async () => {
  const res = await db.query(
    `select * from public.provision_owner_salon('Nexora Demo Salon','nexora-demo-salon','beauty_skin_spa')`,
  );
  row = res.rows[0];
});
assert.equal(row.out_slug, 'nexora-demo-salon');
assert.equal(row.out_template_id, 'beauty_skin_spa');
assert.equal(row.out_is_published, true);
assert.equal(row.out_already_existed, false);
ok('provisioning creates a PUBLISHED website at the requested slug');

// salon + website + membership exist.
const counts = (await db.query(`
  select
    (select count(*)::int from public.organization_members where user_id=$1 and role='owner')::int as is_owner,
    (select count(*)::int from public.salon_public_websites where slug='nexora-demo-salon' and is_published)::int as live
`, [ids.ownerA])).rows[0];
assert.equal(counts.is_owner, 1);
assert.equal(counts.live, 1);
ok('owner membership + published salon_public_websites row exist');

// 2. Idempotent — second call returns the same salon, no duplicate org/slug.
let again;
await asRole('authenticated', ids.ownerA, async () => {
  const res = await db.query(
    `select * from public.provision_owner_salon('Different Name','nexora-demo-salon','nail_lash_studio')`,
  );
  again = res.rows[0];
});
assert.equal(again.out_salon_id, row.out_salon_id);
assert.equal(again.out_already_existed, true);
assert.equal(again.out_template_id, 'beauty_skin_spa'); // unchanged
const orgCount = (await db.query(`select count(*)::int n from public.organizations`)).rows[0].n;
assert.equal(orgCount, 1);
ok('re-provisioning is idempotent (no duplicate org/slug; template unchanged)');

// 3. Slug uniqueness — B cannot steal A's slug.
await asRole('authenticated', ids.ownerB, async () => {
  await assert.rejects(
    () => db.query(`select * from public.provision_owner_salon('Copy','nexora-demo-salon','barber_mens_grooming')`),
    /already in use|23505/i,
  );
});
ok('a second owner cannot claim an in-use slug');

// B can provision their own distinct slug.
await asRole('authenticated', ids.ownerB, async () => {
  await db.query(`select * from public.provision_owner_salon('Blade Barber','blade-barber','barber_mens_grooming')`);
});
ok('second owner provisions their own distinct live slug');

// 4. Critical sequence: Template 1 → 3 → 5 → 2. Capture every
//    protected business domain once, then compare it after EVERY switch.
const themeBefore = (await db.query(
  `select theme_id from public.salons where id=$1`, [row.out_salon_id],
)).rows[0].theme_id;
const beautyTheme = (await db.query(`select id from public.themes where theme_id='beauty_skin_spa'`)).rows[0].id;
assert.equal(themeBefore, beautyTheme);

await db.query(
  `update public.salons set address='12 Lake Road', city='Mumbai' where id=$1`,
  [row.out_salon_id],
);
await db.query(
  `insert into public.business_locations (salon_id,name,address_line1,city,latitude,longitude)
   values ($1,'Nexora Demo Salon — Bandra','12 Lake Road','Mumbai',19.0600,72.8300)`,
  [row.out_salon_id],
);
const serviceId = (await db.query(
  `insert into public.services (salon_id,theme_id,name,price_paise,duration_minutes)
   values ($1,$2,'Signature Facial',250000,60) returning id`,
  [row.out_salon_id, beautyTheme],
)).rows[0].id;
await db.query(
  `insert into public.service_price_variants (salon_id,theme_id,service_id,name,price_paise,duration_minutes)
   values ($1,$2,$3,'Premium',350000,90)`,
  [row.out_salon_id, beautyTheme, serviceId],
);
await db.query(
  `insert into public.products (salon_id,name,price_paise,stock_quantity)
   values ($1,'Vitamin C Serum',129900,14)`,
  [row.out_salon_id],
);
const bookingId = (await db.query(
  `insert into public.bookings (salon_id,customer_id,customer_name,total_paise,status)
   values ($1,$2,'Neha Customer',350000,'confirmed') returning id`,
  [row.out_salon_id, ids.customerA],
)).rows[0].id;
const paymentOrderId = (await db.query(
  `insert into public.payment_orders (salon_id,booking_id,amount_paise,currency,status)
   values ($1,$2,100000,'INR','paid') returning id`,
  [row.out_salon_id, bookingId],
)).rows[0].id;
await db.query(
  `insert into public.payments (salon_id,booking_id,payment_order_id,amount_paise,status,provider_payment_id)
   values ($1,$2,$3,100000,'captured','pay_preserved_001')`,
  [row.out_salon_id, bookingId, paymentOrderId],
);

const protectedSnapshot = async () => ({
  business: (await db.query(
    `select o.id,o.name,o.status from public.organizations o
     join public.salons s on s.organization_id=o.id where s.id=$1`,
    [row.out_salon_id],
  )).rows,
  businessNameAndAddress: (await db.query(
    `select id,organization_id,name,address,city,is_active,deleted_at,created_at,updated_at
     from public.salons where id=$1`,
    [row.out_salon_id],
  )).rows,
  websiteIdentityAndPublication: (await db.query(
    `select id,salon_id,slug,is_published,published_at,created_at,updated_at
     from public.salon_public_websites where salon_id=$1`,
    [row.out_salon_id],
  )).rows,
  owner: (await db.query(
    `select om.organization_id,om.user_id,om.role,om.is_active,p.full_name,p.phone,p.platform_role,p.is_active as profile_active
     from public.organization_members om join public.profiles p on p.id=om.user_id
     join public.salons s on s.organization_id=om.organization_id
     where s.id=$1 and om.role='owner' order by om.user_id`,
    [row.out_salon_id],
  )).rows,
  location: (await db.query(
    `select id,salon_id,name,address_line1,city,latitude,longitude from public.business_locations where salon_id=$1 order by id`,
    [row.out_salon_id],
  )).rows,
  services: (await db.query(
    `select id,salon_id,theme_id,name,price_paise,duration_minutes,is_active,deleted_at from public.services where salon_id=$1 order by id`,
    [row.out_salon_id],
  )).rows,
  pricing: (await db.query(
    `select id,salon_id,theme_id,service_id,name,price_paise,duration_minutes from public.service_price_variants where salon_id=$1 order by id`,
    [row.out_salon_id],
  )).rows,
  products: (await db.query(
    `select id,salon_id,name,price_paise,stock_quantity from public.products where salon_id=$1 order by id`,
    [row.out_salon_id],
  )).rows,
  customers: (await db.query(
    `select distinct p.id,p.full_name,p.phone,p.platform_role,p.is_active
     from public.profiles p join public.bookings b on b.customer_id=p.id
     where b.salon_id=$1 order by p.id`,
    [row.out_salon_id],
  )).rows,
  bookings: (await db.query(
    `select id,salon_id,customer_id,customer_name,total_paise,status from public.bookings where salon_id=$1 order by id`,
    [row.out_salon_id],
  )).rows,
  paymentOrders: (await db.query(
    `select id,salon_id,booking_id,amount_paise,currency,status from public.payment_orders where salon_id=$1 order by id`,
    [row.out_salon_id],
  )).rows,
  payments: (await db.query(
    `select id,salon_id,booking_id,payment_order_id,amount_paise,status,provider_payment_id from public.payments where salon_id=$1 order by id`,
    [row.out_salon_id],
  )).rows,
});

const beforeSwitches = await protectedSnapshot();
const switchSequence = [
  'barber_mens_grooming',   // Template 1
  'beauty_skin_spa',        // Template 3
  'nail_lash_studio',       // Template 5
  'hair_studio_color_bar',  // Template 2
];

for (const [index, templateId] of switchSequence.entries()) {
  let switched;
  await asRole('authenticated', ids.ownerA, async () => {
    const result = await db.query(`select * from public.set_owner_salon_template($1)`, [templateId]);
    switched = result.rows[0];
  });
  assert.equal(switched.out_template_id, templateId);

  const presentation = (await db.query(
    `select t.theme_id,w.template_key from public.salons s
     join public.themes t on t.id=s.theme_id
     join public.salon_public_websites w on w.salon_id=s.id
     where s.id=$1`,
    [row.out_salon_id],
  )).rows[0];
  assert.equal(presentation.theme_id, templateId);
  assert.equal(presentation.template_key, templateId);
  assert.deepEqual(
    await protectedSnapshot(),
    beforeSwitches,
    `protected data changed after switch ${index + 1} (${templateId})`,
  );
  ok(`Template ${[1, 3, 5, 2][index]} preserves business/name/owner/address/location/services/pricing/products/customers/bookings/payments`);
}

await asRole('authenticated', ids.ownerA, async () => {
  await db.query(
    `select * from public.set_owner_salon_visual_config('{"brandColor":"#123456","templateConfig":{"showOwnerPhoto":false},"templateConfigs":{"barber_mens_grooming":{"heroPosition":"Top"},"hair_studio_color_bar":{"showOwnerPhoto":false}}}'::jsonb)`,
  );
  // M66 parity: the owner-photo toggle is accepted for EVERY owner template
  // (barber and nail were rejected before M66).
  await db.query(
    `select * from public.set_owner_salon_visual_config('{"templateConfigs":{"barber_mens_grooming":{"showOwnerPhoto":true},"nail_lash_studio":{"showOwnerPhoto":true},"beauty_skin_spa":{"showOwnerPhoto":false},"family_full_service":{"showOwnerPhoto":true}}}'::jsonb)`,
  );
  await assert.rejects(
    () => db.query(`select * from public.set_owner_salon_visual_config('{"salonName":"Tampered"}'::jsonb)`),
    /non-presentation field|22023/i,
  );
  await assert.rejects(
    () => db.query(`select * from public.set_owner_salon_visual_config('{"templateConfig":{"salonName":"Tampered"}}'::jsonb)`),
    /non-visual field|22023/i,
  );
  await assert.rejects(
    () => db.query(`select * from public.set_owner_salon_visual_config('{"templateConfigs":{"unknown_template":{"appearance":"dark"}}}'::jsonb)`),
    /unknown template|invalid config|22023/i,
  );
  await assert.rejects(
    () => db.query(`select * from public.set_owner_salon_visual_config('{"templateConfigs":{"nail_lash_studio":{"galleryLayout":"masonry"}}}'::jsonb)`),
    /non-visual field|22023/i,
  );
  await assert.rejects(
    () => db.query(`select * from public.set_owner_salon_visual_config('{"templateConfigs":{"nail_lash_studio":{"heroPosition":"Top"}}}'::jsonb)`),
    /unsupported by its template|22023/i,
  );
  await assert.rejects(
    () => db.query(`select * from public.set_owner_salon_visual_config('{"templateConfigs":{"beauty_skin_spa":{"appearance":["dark"]}}}'::jsonb)`),
    /invalid visual value|22023/i,
  );
});
assert.deepEqual(await protectedSnapshot(), beforeSwitches);
ok('visual-config RPC accepts only presentation keys and preserves every protected domain');

// 5. RLS / public read: anon can read the PUBLISHED row (dynamic site render).
let anonRow;
await asRole('anon', '', async () => {
  const res = await db.query(
    `select slug, template_key from public.salon_public_websites where slug='nexora-demo-salon' and is_published=true`,
  );
  anonRow = res.rows[0];
});
assert.ok(anonRow, 'anon must be able to read a published website');
assert.equal(anonRow.template_key, 'hair_studio_color_bar');
ok('anonymous visitors can read published salon websites (dynamic /[slug] render)');

// Unauthenticated template switch is rejected. The function is granted to
// authenticated only, so anon is denied at the ACL check (42501) before the
// auth.uid() null-check (28000) is even reached; either is acceptable.
await asRole('anon', '', async () => {
  await assert.rejects(
    () => db.query(`select * from public.set_owner_salon_template('hair_studio_color_bar')`),
    /log in|28000|permission denied|42501/i,
  );
});
ok('anonymous users cannot change a template');

// B cannot switch A's template (their session resolves only B's salon).
await asRole('authenticated', ids.ownerB, async () => {
  await db.query(`select * from public.set_owner_salon_template('family_full_service')`);
});
const aThemeAfterB = (await db.query(`select template_key from public.salon_public_websites where salon_id=$1`, [row.out_salon_id])).rows[0].template_key;
assert.equal(aThemeAfterB, 'hair_studio_color_bar');
ok('owner B cannot change owner A template (RLS ownership boundary)');

console.log(`\nWhite-label provisioning: ${passed}/${passed} checks PASS`);
await db.close();
