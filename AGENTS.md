# AGENTS.md — Nexora Salon Website Builder

Guidance for AI agents and human contributors working in this repository.
Read this before making changes. For the current state and next steps, see
[`docs/HANDOFF.md`](docs/HANDOFF.md).

## Project overview

**Nexora** is an interactive wizard + live website builder for salons and beauty
professionals, with AI content generation and post-launch management modules.

The app contains:

- **16-step onboarding wizard** (`src/screens/Step*.tsx`, driven by `src/App.tsx`)
  — template, salon details, services, team, photos, socials, location, booking
  rules, publish.
- **Staff management module** (`src/components/StaffManagementModule.tsx`) —
  7-day schedules, payroll & commissions, role permissions, availability.
- **Post-launch dashboard (screens 18–25)** — tabs: overview, website,
  bookings, payments, share, settings, referral, branding
  (`src/components/PreviewPane.tsx` + dashboard tabs in `src/App.tsx`).
- **Salon Owner Dashboard (screen 26, Phase 17.1)** —
  `src/components/OwnerDashboard.tsx` over `src/lib/ownerDashboard.ts`:
  sections for Overview, Today's / Upcoming Appointments, Customers,
  Revenue/Payments, Calendar and Notifications, scoped to the signed-in
  owner's OWN salon. Today's Appointments (17.2) and Upcoming Appointments
  (17.3) are live, read-only over the existing booking records and sharing
  ONE row renderer (`OwnerAppointmentRow.tsx`); the other four sections are
  placeholders. It is a sibling
  module of the 18–25 dashboard, **not** a replacement — do not fork a
  second dashboard system.
- **Booking confirmation** (dashboard demo screen
  `src/components/BookingConfirmation.tsx`, booking ID `NX-10482`; the REAL
  public-site confirmation is `src/components/SiteBookingConfirmation.tsx`
  over `src/lib/siteBookingConfirmation.ts`), **Share Referral Premium**,
  **Branding White-label**.
- **Website guest bookings (M41)** — the LEGACY public templates
  (templateId `hair`, e.g. the deployed `/royal-hair-studio`) have all their
  Book CTAs (Book Slot / Book Bundle / Book with Stylist / Book Appointment /
  Book Online) wired to ONE shared `src/components/BookingModal.tsx`, prefilled
  with Service Name/Price/Duration, backed by `GET /api/salons/:slug/booking-context`
  and `POST /api/bookings` (guest pipeline, no auth) in
  `server/websiteBookingRoutes.ts`. Persisted through the service-role RPC
  `create_website_booking` (migration M41) into the new `website_bookings`
  table; prices are snapshotted server-side and slots conflict-check against
  both `website_bookings` and canonical `bookings`. Call/WhatsApp/Directions
  are direct `tel:`/`wa.me`/maps actions. `npm run test:m41:all`.
- **Owner auth + shop location** — Supabase Auth, Leaflet map with Nominatim
  geocoding, and a **public nearby-salon search** at the `/nearby` route
  (`src/components/NearbySalonSearch.tsx`).

There is **no README**; `AGENTS.md` + `docs/HANDOFF.md` are the orientation docs.

## Tech stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`) |
| UI       | `motion` (framer-motion successor), `lucide-react` icons, `leaflet` maps |
| Server   | Express (`server.ts`), run with `tsx` in dev, bundled with esbuild for prod |
| Backend  | Supabase (`@supabase/supabase-js`, browser anon key only), Google Gemini (`@google/genai`) |

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server on http://0.0.0.0:3000 (tsx server.ts)
npm run build        # vite build + esbuild bundle of server.ts -> dist/
npm run start        # run the production build (node dist/server.cjs)
npm run preview      # vite preview on http://0.0.0.0:4173
npm run lint         # type-check only: tsc --noEmit
npm run generate:theme-seed # regenerate M18 from src/lib/themeServices.ts
npm run validate:migrations # source-check M18 + apply M01–M27 twice + tests A–U
npm run test:theme-catalog # verify five-theme DB/RPC/UI read boundaries
npm run test:service-saving # verify saved-service CRUD/tenant/persistence flow
npm run test:service-management # Phase 8.1 management E2E on real PostgreSQL
npm run test:service-security # Phase 8.2 adversarial security/validation suite
npm run test:acceptance     # Phase 8.3 five-theme acceptance (data + integration)
npm run test:acceptance-ui  # Phase 8.3 five-theme acceptance (real React UI in jsdom)
npm run test:phase-7.4-final # complete Phase 7.4 DB + UI validation
npm run test:phase-8.1      # complete Phase 8.1 service-management validation
npm run test:phase-8.2      # complete Phase 8.2 security + error-handling validation
npm run test:phase-8.3      # complete Phase 8.3 final five-theme acceptance
npm run test:phase-8        # every Phase 7-8 suite (161 tests)
npm run test:phase-9.1      # offers/pricing/bundles across all five themes
npm run test:phase-10.1     # global header & navigation across all five themes
npm run test:phase-10.2     # global EN/HI language + per-theme dark mode
npm run test:phase-10.3     # canonical section order + responsive structure
npm run test:phase-10.4     # final CTA, footer & floating actions
npm run test:phase-10.5     # announcement bar & live salon status
npm run test:phase-10.6     # Book Appointment entry flow (Salon → Service → Date → Slot → Details → Summary since 16.1)
npm run test:phase-10.7     # Advance payment & booking confirmation
npm run test:phase-10.8     # Reviews, ratings & social / latest-work feed
npm run test:phase-10       # all Phase 10 suites
npm run test:phase-11.1     # unique hero design across all five themes
npm run test:phase-11.2     # hero headline & content (EN + HI) across all five themes
npm run test:phase-11.3     # hero media & CTA across all five themes
npm run test:phase-11.4     # hero desktop + tablet + mobile QA
npm run test:phase-11.5     # hero final polish across all five themes
npm run test:phase-11.6     # hero interaction & conversion
npm run test:phase-11.7     # hero data validation
npm run test:phase-11.8    # final hero acceptance gate
npm run test:phase-11      # every Phase 11 suite (2398 tests)
npm run test:phase-11      # both Phase 11 suites
npm run test:phase-12.1    # trust & salon stats across all five themes (84 tests)
npm run test:phase-12.2    # featured services across all five themes (117 tests)
npm run test:phase-12.3    # featured service card enhancement (74 tests)
npm run test:phase-12.4    # complete service directory across all five themes (105 tests)
npm run test:phase-12.5    # service discovery (search/filter/sort) across all five themes (83 tests)
npm run test:phase-12.6    # service detail experience across all five themes (59 tests)
npm run test:phase-12.7    # service images & visuals across all five themes (60 tests)
npm run test:phase-14.1    # gallery & visual portfolio across all five themes (55 tests)
npm run test:phase-15.1    # video gallery foundation (26 tests)
npm run test:phase-15.2    # YouTube URL auto-fetch (18 tests)
npm run test:phase-15.3    # 5 shorts + 5 long videos per theme (21 tests)
npm run test:phase-15.4    # auto thumbnail + title + description (18 tests)
npm run test:phase-15.5    # theme-wise protected mock video data (19 tests)
npm run test:phase-15.6    # owner/admin video management (34 tests)
npm run test:phase-15.6    # owner/admin video management (34 tests)
npm run test:phase-15.7    # original-platform video player/redirect (11 tests)
npm run test:phase-15.8    # likes + weekly most-liked videos (24 tests)
npm run test:phase-15.10   # final 5-theme video acceptance gate (73 tests)
npm run test:phase-15      # every Phase 15 suite (244 tests)
npm run test:phase-16.1    # booking foundation: Salon → Service → Date → Time → Details → Summary (55 tests)
npm run test:phase-16.2    # multi-service selection + auto totals (55 tests)
npm run test:phase-16.3    # date & time slot availability (36 tests)
npm run test:phase-16.5    # advance payment / deposit (24 tests)
npm run test:phase-16.6    # booking confirmation (54 tests)
npm run test:phase-16.8    # call/WhatsApp/book action protection (74 tests)
npm run test:phase-16.7    # booking management (39 tests)
npm run test:phase-16.9    # booking notifications & UX (47 tests)
npm run test:phase-16.10   # final booking acceptance gate for all of Phase 16 (68 tests)
npm run test:phase-17.1    # salon owner dashboard foundation (56 tests)
npm run test:phase-17.2    # owner dashboard today's appointments (49 tests)
npm run test:phase-17.3    # owner dashboard upcoming appointments (50 tests)
npm run clean        # remove dist/ and stray server.js
node verify-22-screens.js   # static verification of all 25 screens/features
```

## Architecture

### Server (`server.ts`)

- Express on port **3000**, bound to `0.0.0.0`. In dev it mounts the Vite dev
  middleware; in production (`NODE_ENV=production`) it serves `dist/` with an SPA
  fallback for client routes and JSON 404s for unknown `/api/*` paths.
- CORS is open (`*`) — required by the preview proxy
  (`https://{port}-{sandboxId}.e2b.app`).
- Endpoints:
  - `GET /api/health` → `{ status: 'ok', screens: 25, timestamp }`
  - `GET /api/geocode/search?q=...` — Nominatim forward geocoding
    (server-side proxy, rate-limited to ≥1.1s, cached 24h).
  - `GET /api/geocode/reverse?lat=...&lon=...` — Nominatim reverse geocoding.
  - `POST /api/generate-bio` — Gemini team-bio generation **with offline
    fallback** when `GEMINI_API_KEY` is missing or the API fails.
  - `POST /api/improve-text` — Gemini copy rewrite **with rule-based offline
    fallback** (tone/keyword aware).

### Client

- **No router.** `src/main.tsx` switches on the pathname: exactly `/nearby`
  renders `NearbySalonSearch` (public customer discovery), everything else
  renders `App`.
- `src/App.tsx` owns the wizard state machine (16 steps), the active module
  (`wizard | staff-management | dashboard`), and dashboard tabs. Progress and
  salon data persist to `localStorage` under key `nexora_onboarding_state`
  (`nexora_dashboard_tab` for the dashboard tab).
- `src/types.ts` holds the shared domain model (`SalonData`, `Service`,
  `TeamMember`, `WeeklySchedule`, …) and `initialData`.

### Data layer (`src/lib/`)

- `supabaseClient.ts` — browser client built from `VITE_SUPABASE_URL` +
  `VITE_SUPABASE_ANON_KEY`; **null when unconfigured** (callers must handle
  that; `requireSupabase()` throws a readable error). Never use a
  `service_role` key client-side.
- `useAuth.ts` — thin Supabase Auth wrapper (email/password session).
- `ownerUpcomingAppointments.ts` — FUTURE bookings (strictly after the
  salon-local day, cancelled/failed excluded) for the owner's own salon,
  nearest-first and grouped by date. Reuses the 17.2 projection and tenant
  resolution; never forks a second appointment model.
- `ownerTodayAppointments.ts` — today's bookings for the owner's own salon,
  projected from the EXISTING 10.7/16.5 payment records through 16.7's
  `readSalonBookings` (permission re-checked, tenant-keyed). "Today" is the
  salon-local day; statuses are the existing values only.
- `ownerDashboard.ts` — the owner dashboard's only data entry point:
  section registry + access model + `loadOwnerDashboardContext()`
  (session → `resolveOwnerSalonId()` → one read of that salon over existing
  columns). It takes **no** salon id from anywhere; unauthorized access
  returns no salon data at all. Read-only — 17.1 added no DB objects.
- `ownerSalon.ts` — resolves the salon owned by the signed-in user via the
  **existing** schema: `auth.users.id → organization_members (role='owner') →
  salons.organization_id`, using the canonical DB helper `owner_salon_ids()`
  (`nexora_owner_salon_ids()` is a delegating alias, per M28/M38). Never
  hardcodes a salon id.
- `salonLocationService.ts` — owner location persistence. **Canonical storage
  is `public.business_locations` keyed by `salon_id` (PK → `salons(id)`), with
  `address_label`, `latitude`, `longitude`, `approval_status`
  (`pending`/`approved`/`rejected`), `submitted_by`/`submitted_at`,
  `approved_by`/`approved_at`, `rejection_reason`.** `public.salons` has no
  location columns at runtime (verified 42703 — `address`, `latitude`,
  `longitude`, `location_confirmed` do NOT exist there). Do not introduce a
  second parallel location system or revert to the older business-keyed
  `business_locations` draft.
- `nearbySalons.ts` — public nearby search: reads only coordinate-bearing,
  confirmed salons, computes distance with a JS Haversine function (no
  PostGIS/RPC), and surfaces readable errors for missing grants/RLS.
- `location.ts` — shared coordinate helpers (`normalizeCoordinates`,
  `findNearbySalons`, radius logic).

### Docs

- `docs/nexora-database-spec.md` — the 90-point Nexora Supabase master
  specification and source for migration order §5.25.
- `docs/database-migrations-plan.md` + `supabase/migrations/` — **DRAFT** M01–M27.
  They pass clean replay x2 plus tests A–T in PGlite, but have **not been applied
  to any database**. M02 is deliberately a fail-closed preflight and must be
  regenerated after read-only live Supabase introspection. Never execute the
  migration set without a separate explicit go-ahead.
- `docs/owner-location-setup.sql` — earlier manual setup notes for owner
  location. Reconcile it with the finalized M02/RLS plan before any future SQL
  execution; the app itself never executes it.

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | browser (Vite) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser (Vite) | Supabase anon/public key |
| `VITE_AUTH_REDIRECT_ORIGIN` | browser (Vite) | Stable public app origin for email confirmation, OAuth, and recovery links; never use localhost or a temporary preview host in deployment |
| `GEMINI_API_KEY` | server | enables real Gemini bio/copy generation (fallback otherwise) |
| `NOMINATIM_APP_IDENTIFIER` | server (optional) | overrides built-in Nominatim User-Agent |
| `NOMINATIM_REFERER` | server (optional) | overrides built-in Nominatim Referer |
| `NOMINATIM_BASE_URL` | server (optional) | switch geocoding service |

Copy `.env.example` → `.env` (and/or `.env.local`, which `server.ts` also
loads). All `.env*` files are gitignored except `.env.example`.

## Conventions & guardrails

- **Frame-aware responsiveness**: themed website renderers draw inside a
  FIXED-WIDTH preview frame (desktop 950 / tablet 768 / mobile 390). Never size
  them with Tailwind viewport breakpoints (`md:` …) — those key off the real
  browser and match even inside the 390px phone frame. Use the renderer `mode`
  via `siteGrid()` / `heroModeValue()`.
- **Style**: Tailwind utility classes inline; follow the existing look of the
  screens; use `TopBar` for standardized headers; `motion` for transitions;
  `lucide-react` for icons. The `@` alias points at the repo root.
- **Navigation vs action semantics**: in-page navigation must be an `<a
  href="#section-...">` (focusable, visible target, open-in-new-tab); only
  real actions are `<button type="button">`. Resolve section ids through
  `siteSectionDomId()` / `heroTargetId()`, never hardcoded strings.
- **Validate owner-supplied media URLs.** Salon media is untrusted input:
  pass it through `isSafeMediaUrl()` / `safeMediaUrl()` before it reaches a
  `src`/`href`, and fall back to theme media when it fails. Never rely on
  React's `javascript:` guard as the only defence.
- **Owner-scoped surfaces must reuse `resolveOwnerSalonId()`.** Salon
  ownership is `auth.users → organization_members (role='owner') →
  salons.organization_id` and nothing else. `job_salon_members` is a
  staff relationship and must never be used for ownership. Never accept a
  salon id from a prop, URL, or localStorage.
- **Never invent business facts.** Customer-facing surfaces must not hardcode
  counts, ratings, years or volumes a salon did not supply. Derive them from
  real data (see `heroStat()`) and render nothing when there is no data.
- **Gemini features must keep their offline fallbacks** — the app must work
  without an API key.
- **Server-side secrets stay server-side** — `GEMINI_API_KEY` etc. must never
  reach the browser; Supabase uses only the anon key.
- **No destructive DB work** — no `DROP TABLE` and no database execution without
  explicit approval. Drafting/testing migration files locally is not permission
  to apply them. Live introspection and a regenerated M02 come first.
- **Preview compatibility**: the server must bind `0.0.0.0`, allow all hosts,
  and keep CORS open (`vite.config.ts` and `server.ts` already do this — do
  not regress it).
- **Don't touch `vite.config.ts` HMR/watch settings** — they are intentionally
  tuned for agent editing (`DISABLE_HMR` env).
- **Verification**: after UI/feature changes, run
  `node verify-22-screens.js` and `npm run lint`. After migration changes, also
  run `npm run validate:migrations` and keep the 27/27 x2 + 21/21 result.

## Git workflow

- Session work happens on the `arena/*` branch; open a PR against `main` and
  merge it (repo history uses merge commits, e.g. "Merge pull request #N from
  templateapp67-oss/arena/...").
- `docs/` changes are just as important as code — keep `HANDOFF.md` current at
  the end of every session.
