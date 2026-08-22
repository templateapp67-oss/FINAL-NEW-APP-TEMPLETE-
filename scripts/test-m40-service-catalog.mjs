/**
 * M40 service catalog + saved-service + commerce RPC smoke tests.
 *
 * Replays the canonical Design-B chain (M28–M40) on PGlite and verifies the
 * exact Step-5 flows that were failing on the deployed app:
 *   1. get_theme_service_catalog('beauty_skin_spa') returns the seeded
 *      'Anti-Aging Gold Facial' (₹2400, 60 min, Facial & Skincare).
 *   2. create_saved_service with the UI payload (Anti-Aging Gold Facial,
 *      ₹2400 / 240000 paise, 60 min, predefined provenance) succeeds as the
 *      authenticated salon owner — no more "Unable to add this service."
 *   3. get_theme_commerce returns the owner's pricing/promotions payload —
 *      no more "Unable to load pricing and promotions."
 *   4. update / status / badge / variant / bundle / offer / translation /
 *      search / safety-lock / delete all behave.
 *   5. Cross-tenant isolation + unauthenticated rejection.
 *   6. verify_m40_service_catalog() is fully green.
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

const M40 = '20260822000301_m40_service_catalog_commerce_rpc.sql';
const CHAIN = [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
  '20260821000501_m32_phase2_canonical_foundation.sql',
  '20260821000601_m33_phase2a_hardening.sql',
  '20260821000701_m34_phase2b_final_hardening.sql',
  '20260821000801_m35_phase2c_canonical_theme_slugs.sql',
  '20260821000901_m36_phase3a_auth_profiles_roles.sql',
  '20260821001001_m37_phase3b_multitenant_rls.sql',
  '20260822000101_m38_reconciliation_fix.sql',
  '20260822000201_m39_owner_publish_website.sql',
  M40,
];

const sqlOf = async (file) => readFile(join(migrationDir, file), 'utf8');

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  orgA: '10000000-0000-4000-8000-0000000000a1',
  orgB: '10000000-0000-4000-8000-0000000000b1',
  salonA: '20000000-0000-4000-8000-0000000000a1',
  salonB: '20000000-0000-4000-8000-0000000000b1',
};

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

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
  create or replace function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
  $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    owner_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select on auth.users to authenticated, service_role;
`);

// Live-like canonical base tables required by the M28 fail-closed preflight.
await db.exec(`
  create table public.profiles (
    id uuid primary key references auth.users(id),
    full_name text not null default 'User',
    platform_role text not null default 'customer',
    is_active boolean not null default true,
    avatar_url text,
    phone text,
    email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null);
  create table public.organization_members (
    organization_id uuid not null references public.organizations(id),
    user_id uuid not null references auth.users(id),
    role text,
    status text default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.salons (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    name text not null,
    slug text,
    address text,
    city text,
    is_active boolean not null default true,
    deleted_at timestamptz
  );
  create table public.services (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null,
    name text not null,
    description text,
    price_paise bigint not null,
    duration_minutes integer not null
  );
  create table public.staff (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id),
    is_active boolean not null default true
  );
  create table public.salon_hours (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null references public.salons(id)
  );
  create table public.salon_public_websites (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null unique references public.salons(id),
    slug text not null unique,
    template_key text not null default 'modern-salon',
    config jsonb not null default '{}'::jsonb,
    is_published boolean not null default false,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.bookings (
    id uuid primary key default gen_random_uuid(),
    salon_id uuid not null,
    customer_id uuid not null,
    appointment_start timestamptz not null,
    status text not null default 'pending',
    total_amount_paise bigint not null default 0,
    advance_amount_paise bigint not null default 0,
    created_at timestamptz not null default now()
  );
  grant select on public.profiles, public.salons, public.services, public.staff,
    public.salon_hours, public.bookings
    to authenticated, service_role;
`);

for (const file of CHAIN) {
  try {
    await db.exec(await sqlOf(file));
  } catch (error) {
    throw new Error(`${file} failed: ${error.message}`, { cause: error });
  }
}
ok('M28–M40 chain applies cleanly on the live-like base');

const verify = (await db.query('select check_name, ok, detail from public.verify_m40_service_catalog()')).rows;
const failed = verify.filter((r) => r.ok !== true);
assert.deepEqual(failed, [], `verify_m40_service_catalog() failed: ${JSON.stringify(failed)}`);
ok(`verify_m40_service_catalog() is fully green (${verify.length} checks)`);

// --- Two owners, two salons, two orgs. ---
await db.query(
  `insert into auth.users (id, email, raw_user_meta_data) values
     ($1, 'a@test', '{"signup_role":"business_user"}'::jsonb),
     ($2, 'b@test', '{"signup_role":"business_user"}'::jsonb)`,
  [ids.ownerA, ids.ownerB],
);
await db.query(
  `insert into public.organizations (id, name) values ($1, 'Org A'), ($2, 'Org B')`,
  [ids.orgA, ids.orgB],
);
await db.query(
  `insert into public.organization_members (organization_id, user_id, role) values
     ($1, $2, 'owner'), ($3, $4, 'owner')`,
  [ids.orgA, ids.ownerA, ids.orgB, ids.ownerB],
);
await db.query(
  `insert into public.salons (id, organization_id, name) values ($1, $2, 'Glow Studio'), ($3, $4, 'Other Studio')`,
  [ids.salonA, ids.orgA, ids.salonB, ids.orgB],
);
ok('owner fixtures ready (2 owners, 2 salons)');

const setRole = async (role, userId = '') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  await db.exec(`set role ${role}`);
};
const resetRole = async () => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.query("select set_config('request.jwt.claim.role', '', false)");
};
const asRole = async (role, userId, callback) => {
  await setRole(role, userId);
  try {
    return await callback();
  } finally {
    await resetRole();
  }
};

// --- 1. Catalog load: Anti-Aging Gold Facial must be present. ---
const catalog = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_theme_service_catalog('beauty_skin_spa') as payload`)
))).rows[0].payload;
assert.equal(catalog.theme.theme_id, 'beauty_skin_spa');
const goldFacial = catalog.predefined_services.find((s) => s.name === 'Anti-Aging Gold Facial');
assert.ok(goldFacial, 'Anti-Aging Gold Facial is missing from the seeded catalog');
assert.equal(goldFacial.default_price_paise, 240000);
assert.equal(goldFacial.default_duration_minutes, 60);
const facialCategory = catalog.categories.find((c) => c.name === 'Facial & Skincare');
assert.ok(facialCategory, 'Facial & Skincare category missing');
assert.equal(goldFacial.category_id, facialCategory.id);
ok('get_theme_service_catalog: Anti-Aging Gold Facial (₹2400, 60 min, Facial & Skincare)');

// --- 2. Create the service exactly as the Add Service form submits it. ---
const created = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.create_saved_service(
       'beauty_skin_spa', $1, 'Anti-Aging Gold Facial',
       'Luxurious 24K gold facial that firms, brightens and reduces the appearance of fine lines.',
       240000, 60, $2, 'active'
     ) as payload`,
    [facialCategory.id, goldFacial.id],
  )
))).rows[0].payload;
assert.equal(created.name, 'Anti-Aging Gold Facial');
assert.equal(created.category, 'Facial & Skincare');
assert.equal(created.price_paise, 240000);
assert.equal(created.duration_minutes, 60);
assert.equal(created.status, 'active');
assert.equal(created.predefined_service_id, goldFacial.id);
assert.equal(created.business_id, ids.salonA);
ok('create_saved_service: Anti-Aging Gold Facial saved (predefined provenance, ₹2400, 60 min)');

// Duplicate must be rejected with the readable message.
await asRole('authenticated', ids.ownerA, async () => {
  let caught;
  try {
    await db.query(
      `select public.create_saved_service('beauty_skin_spa', $1, 'Anti-Aging Gold Facial', '', 240000, 60, $2, 'active')`,
      [facialCategory.id, goldFacial.id],
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'duplicate create should have been rejected');
  assert.match(String(caught.message), /already saved/i);
});
ok('create_saved_service: duplicate predefined service rejected with readable message');

// --- 3. Pricing & promotions load (the other reported error). ---
const commerce = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_theme_commerce('beauty_skin_spa') as payload`)
))).rows[0].payload;
assert.equal(commerce.business_id, ids.salonA);
assert.equal(commerce.theme_id, 'beauty_skin_spa');
assert.deepEqual(commerce.variants, []);
assert.deepEqual(commerce.bundles, []);
assert.deepEqual(commerce.offers, []);
assert.equal(commerce.service_badges.length, 0);
ok('get_theme_commerce: empty pricing/promotions payload for the owner salon');

// --- 4. Saved services list. ---
const saved = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_saved_services_for_theme('beauty_skin_spa') as payload`)
))).rows[0].payload;
assert.equal(saved.business_id, ids.salonA);
assert.equal(saved.services.length, 1);
assert.equal(saved.services[0].name, 'Anti-Aging Gold Facial');
ok('get_saved_services_for_theme: owner sees their 1 saved service');

// --- 5. Edit: price + duration + status + badge. ---
const updated = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.update_saved_service($1, null, null, 250000, 75, null) as payload`,
    [created.id],
  )
))).rows[0].payload;
assert.equal(updated.price_paise, 250000);
assert.equal(updated.duration_minutes, 75);
assert.equal(updated.name, 'Anti-Aging Gold Facial');
assert.equal(updated.predefined_service_id, goldFacial.id, 'provenance must survive an edit');
ok('update_saved_service: price 2400→2500, duration 60→75, provenance intact');

const inactive = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.set_saved_service_status($1, 'inactive') as payload`, [created.id])
))).rows[0].payload;
assert.equal(inactive.status, 'inactive');
ok('set_saved_service_status: inactive');

const active = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.set_saved_service_active($1, true) as payload`, [created.id])
))).rows[0].payload;
assert.equal(active.status, 'active');
ok('set_saved_service_active: reactivated');

await asRole('authenticated', ids.ownerA, async () => {
  await db.query(`select public.set_saved_service_badge($1, '24K Gold')`, [created.id]);
});
const commerceWithBadge = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_theme_commerce('beauty_skin_spa') as payload`)
))).rows[0].payload;
assert.equal(commerceWithBadge.service_badges.length, 1);
assert.equal(commerceWithBadge.service_badges[0].promotional_badge, '24K Gold');
ok('set_saved_service_badge + get_theme_commerce service_badges');

// --- 6. Variable pricing variant. ---
const variantId = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.upsert_service_price_variant('beauty_skin_spa', $1, null, '30-min Express', 120000, 30, 'active') as id`,
    [created.id],
  )
))).rows[0].id;
assert.ok(variantId);
const commerceWithVariant = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_theme_commerce('beauty_skin_spa') as payload`)
))).rows[0].payload;
assert.equal(commerceWithVariant.variants.length, 1);
assert.equal(commerceWithVariant.variants[0].name, '30-min Express');
assert.equal(commerceWithVariant.variants[0].price_paise, 120000);
ok('upsert_service_price_variant + get_theme_commerce variants');

// --- 7. Add a second service, then a bundle + an offer. ---
const second = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.create_saved_service(
       'beauty_skin_spa', $1, 'De-Tan Brightening',
       'Brightening de-tan treatment to reverse sun damage.',
       160000, 45, $2, 'active'
     ) as payload`,
    [facialCategory.id, catalog.predefined_services.find((s) => s.name === 'De-Tan Brightening').id],
  )
))).rows[0].payload;

const bundleId = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.create_service_bundle(
       'beauty_skin_spa', $1, 'Glow Duo', 'Gold + De-Tan combo.',
       array[$2, $3]::uuid[], 'percentage', 15.0, null, 'Best Seller', 'active'
     ) as id`,
    [facialCategory.id, created.id, second.id],
  )
))).rows[0].id;
assert.ok(bundleId);

const offerId = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.create_service_offer(
       'beauty_skin_spa', 'bundle', null, null, null, $1,
       'Summer Special', '20% OFF', 'percentage', 20.0, null,
       current_date, current_date + 30, 'active'
     ) as id`,
    [bundleId],
  )
))).rows[0].id;
assert.ok(offerId);

const commerceFull = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_theme_commerce('beauty_skin_spa') as payload`)
))).rows[0].payload;
assert.equal(commerceFull.bundles.length, 1);
assert.equal(commerceFull.bundles[0].name, 'Glow Duo');
assert.equal(commerceFull.bundles[0].included_services.length, 2);
assert.equal(commerceFull.offers.length, 1);
assert.equal(commerceFull.offers[0].effective_status, 'active');
ok('create_service_bundle + create_service_offer reflected in get_theme_commerce');

// --- 8. Translation + search + safety lock. ---
const translation = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(
    `select public.upsert_saved_service_translation('beauty_skin_spa', $1, 'hi', 'एंटी-एजिंग गोल्ड फेशियल', 'गोल्ड फेशियल') as payload`,
    [created.id],
  )
))).rows[0].payload;
assert.equal(translation.locale, 'hi');
ok('upsert_saved_service_translation: Hindi copy saved');

const search = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.search_theme_services('beauty_skin_spa', 'gold') as payload`)
))).rows[0].payload;
assert.ok(search.results.some((r) => r.name === 'Anti-Aging Gold Facial'));
ok('search_theme_services: "gold" finds the gold facial');

const lock = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_service_safety_lock($1) as payload`, [created.id])
))).rows[0].payload;
assert.equal(lock.can_delete, false, 'service inside a bundle cannot be deleted');
ok('get_service_safety_lock: package link blocks delete');

const audit = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_theme_service_audit('beauty_skin_spa') as payload`)
))).rows[0].payload;
assert.ok(audit.entries.length >= 1);
ok('get_theme_service_audit: activity trail recorded');

// --- 9. Cross-tenant isolation. ---
const otherTenantSaved = (await asRole('authenticated', ids.ownerB, async () => (
  await db.query(`select public.get_saved_services_for_theme('beauty_skin_spa') as payload`)
))).rows[0].payload;
assert.equal(otherTenantSaved.services.length, 0);
ok('cross-tenant: owner B sees none of owner A services');

await asRole('authenticated', ids.ownerB, async () => {
  let caught;
  try {
    await db.query(`select public.update_saved_service($1, null, null, 1, null, null)`, [created.id]);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'cross-tenant edit should fail');
  assert.match(String(caught.message), /not found/i);
});
ok('cross-tenant: owner B cannot edit owner A service');

// --- 10. Unauthenticated rejection. ---
await asRole('anon', '', async () => {
  let caught;
  try {
    await db.query(
      `select public.create_saved_service('beauty_skin_spa', $1, 'Hack', '', 100, 10, null, 'active')`,
      [facialCategory.id],
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'unauthenticated create should fail');
  assert.match(
    String(caught.message),
    /log in|permission denied/i,
    'anon must be rejected (friendly guard when anon can execute, permission denial otherwise)',
  );
});
ok('unauthenticated create_saved_service rejected (no anon/guest writes)');

// --- 11. Cleanup: delete the bundle offer + bundle, then the services. ---
await asRole('authenticated', ids.ownerA, async () => {
  await db.query(`select public.delete_service_offer($1)`, [offerId]);
  await db.query(`select public.set_service_bundle_status($1, 'archived')`, [bundleId]);
  await db.query(`select public.delete_service_price_variant($1)`, [variantId]);
  // The safety lock intentionally blocks deleting a service while its
  // package link exists; clear the bundle links (owner RLS) first.
  await db.query(`delete from public.package_services where package_id = $1`, [bundleId]);
  await db.query(`select public.delete_saved_service($1)`, [second.id]);
  await db.query(`select public.delete_saved_service($1)`, [created.id]);
});
const finalSaved = (await asRole('authenticated', ids.ownerA, async () => (
  await db.query(`select public.get_saved_services_for_theme('beauty_skin_spa') as payload`)
))).rows[0].payload;
assert.equal(finalSaved.services.length, 0);
ok('delete paths: offer, bundle status, variant, services all clean');

console.log(`\nM40 service catalog suite: ${passed} passed`);
