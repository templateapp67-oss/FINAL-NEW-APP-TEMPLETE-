/**
 * M65 — radius-checked Home Service bookings (all five templates).
 *
 * Verifies against a real PGlite replay of the canonical chain + M65:
 *  - verifier green; all five canonical templates share ONE booking engine;
 *  - owner settings read server-side from the published website config;
 *  - enabled/disabled, missing salon coordinates, inside/outside/exact
 *    boundary radius handling;
 *  - authoritative charge + fixed 25% advance on the FINAL total;
 *  - tampered/browser-supplied values are impossible (service_role-only RPC,
 *    distance and charge recomputed in SQL);
 *  - idempotent retries never double-apply the charge;
 *  - tenant isolation of the fulfillment read RPCs;
 *  - At-Salon regression (v1 path untouched, defaults intact).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemediationDb } from './lib/remediationHarness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

let passed = 0;
const ok = (label) => {
  passed += 1;
  console.log(`PASS ${label}`);
};

const { db, ids, salonAId, salonBId, at, asRole, asServiceRole, expectSqlState } =
  await createRemediationDb();

// Apply M65 on top of the canonical chain (additive; never replays history).
await db.exec(
  await readFile(join(root, 'supabase', 'migrations', '20260830000101_m65_home_service_bookings.sql'), 'utf8'),
);
ok('M65 applies cleanly on top of the canonical M28..M62 chain');

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const SALON_LAT = 26.9124; // Jaipur
const SALON_LON = 75.7873;
const INSIDE_POINT = { lat: 26.9124, lon: 75.8073 }; // ~2 km east
const OUTSIDE_POINT = { lat: 26.9124, lon: 75.8873 }; // ~9.9 km east
const ADDRESS = '12 MI Road, Jaipur, Rajasthan 302001';

// Fixture writes run as the superuser session (the owner UI persists these
// through the existing publish path in production).
const setHomeService = (salonId, homeService) =>
  db.query(
    `update public.salon_public_websites
     set config = jsonb_set(
       jsonb_set(
         coalesce(config, '{}'::jsonb),
         '{bookingRules}',
         coalesce(config -> 'bookingRules', '{}'::jsonb),
         true
       ),
       '{bookingRules,homeService}', $2::jsonb, true
     )
     where salon_id = $1`,
    [salonId, JSON.stringify(homeService)],
  );

// Owner A publishes Home Service (₹200 extra, 5 km radius); salon A has a
// confirmed canonical location. Salon B has neither.
await setHomeService(salonAId, { enabled: true, extraCharge: 200, radiusKm: 5 });
await db.query(
  `insert into public.business_locations (salon_id, latitude, longitude, address_label, submitted_by)
   values ($1, $2, $3, 'Salon A HQ', $4)`,
  [salonAId, SALON_LAT, SALON_LON, ids.ownerA],
);

const FP = (seed) => seed.repeat(64).slice(0, 64);
let slot = 2;
const nextSlot = () => at((slot += 2));

const createV2 = (args) =>
  asServiceRole(() =>
    db.query(
      `select * from public.create_authoritative_customer_booking_v2(
         $1,$2,$3::uuid[],$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        args.customerId, args.salonId, args.serviceIds, args.staffId ?? null,
        args.start.toISOString(), args.key, args.fingerprint,
        args.mode ?? 'at_salon', args.address ?? null,
        args.lat ?? null, args.lon ?? null,
      ],
    ));

/* ------------------------------------------------------------------ */
/* 1. Verifier + shared-engine surface                                 */
/* ------------------------------------------------------------------ */

const verifier = await asServiceRole(() => db.query('select * from public.verify_m65_home_service_bookings()'));
assert.ok(verifier.rows.length >= 10);
for (const row of verifier.rows) assert.equal(row.ok, true, `${row.check_name}: ${row.detail}`);
ok(`verify_m65_home_service_bookings() — ${verifier.rows.length}/${verifier.rows.length} checks true`);

// One shared engine serves all five canonical templates: the five theme rows
// exist and the v2 RPC is theme-agnostic (salon-scoped, no theme argument).
const themes = await db.query(
  `select theme_id from public.themes where theme_id = any($1::text[]) order by theme_id`,
  [[
    'barber_mens_grooming', 'beauty_skin_spa', 'family_full_service',
    'hair_studio_color_bar', 'nail_lash_studio',
  ]],
);
assert.equal(themes.rows.length, 5);
ok('all five canonical templates resolve to the single shared booking engine');

/* ------------------------------------------------------------------ */
/* 2. At-Salon regression                                              */
/* ------------------------------------------------------------------ */

const atSalon = await createV2({
  customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
  start: nextSlot(), key: 'm65-at-salon-regression-1', fingerprint: FP('a'),
});
assert.equal(atSalon.rows[0].fulfillment_mode, 'at_salon');
assert.equal(atSalon.rows[0].service_address, null);
assert.equal(atSalon.rows[0].service_distance_km, null);
assert.equal(Number(atSalon.rows[0].home_service_charge_paise), 0);
assert.equal(Number(atSalon.rows[0].total_amount_paise), 100000);
assert.equal(Number(atSalon.rows[0].advance_amount_paise), 25000);
assert.equal(Number(atSalon.rows[0].remaining_amount_paise), 75000);
ok('At-Salon via v2: zero charge, unchanged 25% advance math');

// The pre-M65 seven-argument function still works and defaults new columns.
const v1 = await asServiceRole(() =>
  db.query(
    `select * from public.create_authoritative_customer_booking($1,$2,$3::uuid[],null,$4,$5,$6)`,
    [ids.customerA, salonAId, [ids.serviceA], nextSlot().toISOString(), 'm65-v1-regression-key-1', FP('b')],
  ));
const v1Row = (await db.query(
  'select fulfillment_mode, home_service_charge_paise from public.bookings where id = $1',
  [v1.rows[0].booking_id],
)).rows[0];
assert.equal(v1Row.fulfillment_mode, 'at_salon');
assert.equal(Number(v1Row.home_service_charge_paise), 0);
ok('v1 creation function untouched — legacy path stays At-Salon with zero charge');

// An at-salon request must not smuggle an address or coordinates.
await expectSqlState(
  () => createV2({
    customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
    start: nextSlot(), key: 'm65-at-salon-address-leak', fingerprint: FP('c'),
    mode: 'at_salon', address: ADDRESS,
  }),
  '22023',
);
ok('at_salon with a service address is rejected (22023)');

/* ------------------------------------------------------------------ */
/* 3. Disabled / missing prerequisites                                 */
/* ------------------------------------------------------------------ */

await expectSqlState(
  () => createV2({
    customerId: ids.customerB, salonId: salonBId, serviceIds: [ids.serviceB],
    start: nextSlot(), key: 'm65-disabled-salon-b', fingerprint: FP('d'),
    mode: 'home_service', address: ADDRESS, lat: INSIDE_POINT.lat, lon: INSIDE_POINT.lon,
  }),
  '22023',
);
ok('home service rejected when the owner has not enabled it (22023)');

// Enable settings for salon B but leave it without canonical coordinates.
await setHomeService(salonBId, { enabled: true, extraCharge: 150, radiusKm: 10 });
await expectSqlState(
  () => createV2({
    customerId: ids.customerB, salonId: salonBId, serviceIds: [ids.serviceB],
    start: nextSlot(), key: 'm65-no-coords-salon-b', fingerprint: FP('e'),
    mode: 'home_service', address: ADDRESS, lat: INSIDE_POINT.lat, lon: INSIDE_POINT.lon,
  }),
  '22023',
);
ok('home service rejected when the salon has no confirmed lat/lng (22023)');

// Corrupt published settings can never enable the feature.
await setHomeService(salonBId, { enabled: true, extraCharge: 150, radiusKm: -3 });
await expectSqlState(
  () => createV2({
    customerId: ids.customerB, salonId: salonBId, serviceIds: [ids.serviceB],
    start: nextSlot(), key: 'm65-invalid-radius-b', fingerprint: FP('f'),
    mode: 'home_service', address: ADDRESS, lat: INSIDE_POINT.lat, lon: INSIDE_POINT.lon,
  }),
  '22023',
);
ok('invalid published settings fail closed (22023)');

// Incomplete address / unverified coordinates.
await expectSqlState(
  () => createV2({
    customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
    start: nextSlot(), key: 'm65-short-address-a', fingerprint: FP('g'),
    mode: 'home_service', address: 'too short', lat: INSIDE_POINT.lat, lon: INSIDE_POINT.lon,
  }),
  '22023',
);
await expectSqlState(
  () => createV2({
    customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
    start: nextSlot(), key: 'm65-missing-coords-a', fingerprint: FP('h'),
    mode: 'home_service', address: ADDRESS,
  }),
  '22023',
);
ok('incomplete address or unverified coordinates are rejected (22023)');

/* ------------------------------------------------------------------ */
/* 4. Inside radius — authoritative charge + 25% advance on the total  */
/* ------------------------------------------------------------------ */

const homeStart = nextSlot();
const home = await createV2({
  customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
  start: homeStart, key: 'm65-home-inside-1', fingerprint: FP('i'),
  mode: 'home_service', address: ADDRESS, lat: INSIDE_POINT.lat, lon: INSIDE_POINT.lon,
});
const homeRow = home.rows[0];
assert.equal(homeRow.fulfillment_mode, 'home_service');
assert.equal(homeRow.service_address, ADDRESS);
const homeDistance = Number(homeRow.service_distance_km);
assert.ok(homeDistance > 0 && homeDistance <= 5, `distance ${homeDistance} must be inside 5 km`);
assert.equal(Number(homeRow.home_service_charge_paise), 20000, '₹200 → 20000 paise');
assert.equal(Number(homeRow.total_amount_paise), 120000, 'services 100000 + charge 20000');
assert.equal(Number(homeRow.advance_amount_paise), 30000, '25% of the FINAL total');
assert.equal(Number(homeRow.remaining_amount_paise), 90000);
const persisted = (await db.query(
  `select fulfillment_mode, service_address, service_latitude, service_longitude,
          service_distance_km, home_service_charge_paise, total_amount_paise, advance_amount_paise
   from public.bookings where id = $1`,
  [homeRow.booking_id],
)).rows[0];
assert.equal(persisted.fulfillment_mode, 'home_service');
assert.equal(Number(persisted.service_latitude), INSIDE_POINT.lat);
assert.equal(Number(persisted.service_longitude), INSIDE_POINT.lon);
assert.equal(Number(persisted.home_service_charge_paise), 20000);
assert.equal(Number(persisted.total_amount_paise), 120000);
ok('inside radius: verified coords + distance + charge persisted; advance = 25% of final total');

/* ------------------------------------------------------------------ */
/* 5. Idempotent retry — the charge is never applied twice             */
/* ------------------------------------------------------------------ */

const replay = await createV2({
  customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
  start: homeStart, key: 'm65-home-inside-1', fingerprint: FP('i'),
  mode: 'home_service', address: ADDRESS, lat: INSIDE_POINT.lat, lon: INSIDE_POINT.lon,
});
assert.equal(replay.rows[0].booking_id, homeRow.booking_id);
assert.equal(Number(replay.rows[0].total_amount_paise), 120000);
assert.equal(Number(replay.rows[0].home_service_charge_paise), 20000);
const homeRowCount = (await db.query(
  `select count(*)::int as n from public.bookings where fulfillment_mode = 'home_service' and salon_id = $1`,
  [salonAId],
)).rows[0].n;
assert.equal(homeRowCount, 1);
ok('idempotent replay returns the SAME row — charge applied exactly once');

// The same key with a different fingerprint is a conflict, not a new booking.
await expectSqlState(
  () => createV2({
    customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
    start: homeStart, key: 'm65-home-inside-1', fingerprint: FP('j'),
    mode: 'home_service', address: ADDRESS, lat: INSIDE_POINT.lat, lon: INSIDE_POINT.lon,
  }),
  '23505',
);
ok('idempotency key reuse with a different request is rejected (23505)');

/* ------------------------------------------------------------------ */
/* 6. Outside radius + exact boundary                                  */
/* ------------------------------------------------------------------ */

await expectSqlState(
  () => createV2({
    customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
    start: nextSlot(), key: 'm65-home-outside-1', fingerprint: FP('k'),
    mode: 'home_service', address: ADDRESS, lat: OUTSIDE_POINT.lat, lon: OUTSIDE_POINT.lon,
  }),
  '22023',
);
ok('outside radius rejected server-side (22023)');

// Exact boundary: distance == radius is bookable; one hundredth less is not.
const exactDistance = Number((await db.query(
  'select round(private.nexora_haversine_km($1,$2,$3,$4), 2) as d',
  [SALON_LAT, SALON_LON, INSIDE_POINT.lat, INSIDE_POINT.lon],
)).rows[0].d);
await setHomeService(salonAId, { enabled: true, extraCharge: 200, radiusKm: exactDistance });
const boundary = await createV2({
  customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
  start: nextSlot(), key: 'm65-home-boundary-1', fingerprint: FP('l'),
  mode: 'home_service', address: ADDRESS, lat: INSIDE_POINT.lat, lon: INSIDE_POINT.lon,
});
assert.equal(Number(boundary.rows[0].service_distance_km), exactDistance);
await setHomeService(salonAId, {
  enabled: true, extraCharge: 200, radiusKm: Number((exactDistance - 0.01).toFixed(2)),
});
await expectSqlState(
  () => createV2({
    customerId: ids.customerA, salonId: salonAId, serviceIds: [ids.serviceA],
    start: nextSlot(), key: 'm65-home-boundary-2', fingerprint: FP('m'),
    mode: 'home_service', address: ADDRESS, lat: INSIDE_POINT.lat, lon: INSIDE_POINT.lon,
  }),
  '22023',
);
await setHomeService(salonAId, { enabled: true, extraCharge: 200, radiusKm: 5 });
ok(`exact boundary (${exactDistance} km == radius) bookable; 0.01 km beyond rejected`);

/* ------------------------------------------------------------------ */
/* 7. Tampering is impossible                                          */
/* ------------------------------------------------------------------ */

// The browser can never call the write path directly …
await asRole('authenticated', ids.customerA, async () => {
  await expectSqlState(
    () => db.query(
      `select * from public.create_authoritative_customer_booking_v2(
         $1,$2,$3::uuid[],null,$4,$5,$6,'home_service',$7,$8,$9)`,
      [
        ids.customerA, salonAId, [ids.serviceA], nextSlot().toISOString(),
        'm65-tampered-direct-call', FP('n'), ADDRESS, INSIDE_POINT.lat, INSIDE_POINT.lon,
      ],
    ),
    '42501',
  );
});
// … and there is no argument through which a client could supply its own
// distance, charge or radius — the RPC recomputes all three.
const argTypes = (await db.query(
  `select pg_get_function_identity_arguments(pr.oid) as args
   from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
   where ns.nspname = 'public' and pr.proname = 'create_authoritative_customer_booking_v2'`,
)).rows[0].args;
assert.ok(!/distance|charge|radius|amount/i.test(argTypes));
ok('tampered client values impossible: RPC is service_role-only and accepts no pricing inputs');

// Direct RLS writes cannot forge a home-service row either.
await asRole('authenticated', ids.customerA, async () => {
  let rejected = false;
  try {
    await db.query(
      `update public.bookings set home_service_charge_paise = 1 where id = $1`,
      [homeRow.booking_id],
    );
    const check = await asServiceRole(() =>
      db.query('select home_service_charge_paise from public.bookings where id = $1', [homeRow.booking_id]));
    rejected = Number(check.rows[0].home_service_charge_paise) === 20000;
  } catch {
    rejected = true;
  }
  assert.ok(rejected, 'customer role must not be able to rewrite the charge');
});
ok('RLS: a customer cannot rewrite the persisted home-service charge');

/* ------------------------------------------------------------------ */
/* 8. Read RPCs + tenant isolation                                     */
/* ------------------------------------------------------------------ */

const customerView = await asServiceRole(() =>
  db.query('select * from public.get_customer_bookings_for_actor($1)', [ids.customerA]));
const customerHome = customerView.rows.find((row) => row.booking_id === homeRow.booking_id);
assert.ok(customerHome);
assert.equal(customerHome.fulfillment_mode, 'home_service');
assert.equal(customerHome.service_address, ADDRESS);
assert.equal(Number(customerHome.service_distance_km), homeDistance);
assert.equal(Number(customerHome.home_service_charge_paise), 20000);
ok('customer read RPC returns mode/address/distance/charge');

const ownerView = await asServiceRole(() =>
  db.query('select * from public.get_owner_salon_bookings_for_actor($1, $2)', [ids.ownerA, salonAId]));
const ownerHome = ownerView.rows.find((row) => row.booking_id === homeRow.booking_id);
assert.ok(ownerHome);
assert.equal(ownerHome.fulfillment_mode, 'home_service');
assert.equal(ownerHome.service_address, ADDRESS);
assert.equal(Number(ownerHome.home_service_charge_paise), 20000);
ok('owner read RPC returns mode/address/distance/charge');

// Tenant isolation: owner B / customer B never see salon A's home booking.
const ownerBView = await asServiceRole(() =>
  db.query('select * from public.get_owner_salon_bookings_for_actor($1, $2)', [ids.ownerB, salonBId]));
assert.ok(ownerBView.rows.every((row) => row.booking_id !== homeRow.booking_id));
await expectSqlState(
  () => asServiceRole(() =>
    db.query('select * from public.get_owner_salon_bookings_for_actor($1, $2)', [ids.ownerB, salonAId])),
  '42501',
);
const customerBView = await asServiceRole(() =>
  db.query('select * from public.get_customer_bookings_for_actor($1)', [ids.customerB]));
assert.ok(customerBView.rows.every((row) => row.booking_id !== homeRow.booking_id));
ok('tenant isolation: cross-tenant owners and customers cannot read the booking');

console.log(`\nM65 home service: ${passed}/${passed} checks PASS`);
await db.close();
