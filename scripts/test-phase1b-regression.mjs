/**
 * Phase 1-B regression: keep using the canonical implementations.
 * Do not replace owner dashboard, catalog, location, nearby, public site,
 * white-label routing, auth, or existing database relationships.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

let passed = 0;
const ok = (label) => { passed += 1; console.log(`PASS ${label}`); };

const [
  dashboard,
  dashboardUi,
  app,
  main,
  nearby,
  nearbyUi,
  location,
  auth,
  hostRouting,
  publicUrl,
  publicView,
  ownerSalon,
  savedServices,
  products,
  provisioning,
] = await Promise.all([
  read('src/lib/ownerDashboard.ts'),
  read('src/components/OwnerDashboard.tsx'),
  read('src/App.tsx'),
  read('src/main.tsx'),
  read('src/lib/nearbySalons.ts'),
  read('src/components/NearbySalonSearch.tsx'),
  read('src/lib/salonLocationService.ts'),
  read('src/lib/useAuth.ts'),
  read('server/hostRouting.ts'),
  read('src/lib/publicWebsiteUrl.ts'),
  read('src/components/PublicSalonView.tsx'),
  read('src/lib/ownerSalon.ts'),
  read('src/lib/savedServiceService.ts'),
  read('src/lib/themeCatalogService.ts'),
  read('src/lib/ownerProvisioning.ts'),
]);

assert.match(dashboard, /export async function loadOwnerDashboardContext/);
assert.match(dashboard, /organization_members/);
assert.match(dashboardUi, /loadOwnerDashboardContext/);
// The point of this guard is that App.tsx renders THE existing
// ./components/OwnerDashboard, not some replacement shell. It may reach it
// either through a static import or a React.lazy code-split boundary, so
// accept both specifier forms while still pinning the module path.
assert.match(
  app,
  /(?:import OwnerDashboard from|const OwnerDashboard = lazy\(\(\) => import\()'\.\/components\/OwnerDashboard'\)?/,
  "App.tsx must render the existing ./components/OwnerDashboard",
);
assert.match(app, /<OwnerDashboard \/>/);
ok('owner dashboard stays on the existing OwnerDashboard + loadOwnerDashboardContext path');

assert.match(savedServices, /create_saved_service|get_theme_service_catalog|saved_service/);
assert.match(products, /get_theme_service_catalog|predefined_services/);
assert.doesNotMatch(provisioning, /create table public.services/);
assert.doesNotMatch(provisioning, /create table public.products/);
ok('services and products stay on the existing catalog RPCs');

assert.match(location, /export const SALON_LOCATION_TABLE = 'business_locations'/);
assert.match(location, /export async function saveSalonLocation/);
assert.match(location, /approval_status/);
assert.doesNotMatch(location, /from\('salons'\).*latitude/s);
ok('location still writes business_locations, not invented salon lat/lng');

assert.match(nearby, /PUBLIC_SALON_CATALOG_VIEW = 'public_salon_catalog'/);
assert.match(nearby, /SALON_LOCATION_TABLE/);
assert.match(nearby, /approval_status.*approved/);
assert.match(nearby, /export async function searchNearbySalons/);
assert.match(nearbyUi, /searchNearbySalons/);
assert.match(main, /normalizedPath === 'nearby'/);
assert.match(main, /<NearbySalonSearch/);
ok('nearby salon system still uses approved business_locations + public_salon_catalog');

assert.match(publicView, /rpc\('get_public_salon_website'/);
assert.match(publicView, /<TemplateRenderer data=\{state\.data\} mode=\{mode\} \/>/);
assert.match(main, /PublicSalonView/);
assert.match(publicUrl, /export function publicWebsiteUrl/);
ok('existing public website still resolves through get_public_salon_website + TemplateRenderer');

assert.match(hostRouting, /export function resolveHostSlug/);
assert.match(hostRouting, /export function rewriteHostPath/);
assert.match(main, /extractSubdomainSlug|normalizedPath/);
ok('existing white-label host routing is unchanged');

assert.match(auth, /export function useAuth/);
assert.match(auth, /signInWithPassword/);
assert.match(auth, /signUpWithPassword/);
assert.match(auth, /persistSession|getSession|onAuthStateChange/);
assert.match(app, /useAuth/);
ok('existing authentication (useAuth) is still the session authority');

assert.match(ownerSalon, /OWNER_SALON_IDS_FN = 'owner_salon_ids'/);
assert.match(ownerSalon, /ORG_MEMBERS_TABLE = 'organization_members'/);
assert.match(ownerSalon, /SALON_TABLE_NAME = 'salons'/);
assert.match(dashboard, /owner_salon_ids|resolveOwnerSalonId|organization_members/);
assert.doesNotMatch(provisioning, /job_salon_members/);
ok('existing ownership chain remains auth.users -> organization_members -> salons');

console.log(`\nPhase 1-B regression: ${passed}/${passed} checks PASS`);
