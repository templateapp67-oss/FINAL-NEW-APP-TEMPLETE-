# Nexora — Master Database Specification (Points 1–90)

> **STATUS: COLLECTION COMPLETE — all 90 points received (90/90).**
> M01–M15 now exist as **DRAFT migration files** for local review/validation.
> They have been exercised only in disposable PGlite; **nothing has been applied
> to local, staging, or live Supabase**. M02 must be regenerated after read-only
> live-schema inspection, and database execution requires a separate go-ahead.
>
> This document is the single cumulative specification; all 90 points belong to ONE Nexora Supabase architecture.

---

## 0. Standing Guardrails (applied to every point)

1. **No SQL execution against a Supabase environment** without a separate explicit go-ahead after live introspection and finalized M02. Disposable local PostgreSQL validation of draft files is allowed and does not count as deployment approval.
2. **Preserve the existing Nexora Supabase schema & data** — no DROP TABLE, no destructive operations; use ALTER / IF EXISTS / IF NOT EXISTS, backfill before new constraints, preserve current IDs and relationships.
3. **No duplicate data models** — ONE salon record, ONE service source, ONE staff source, ONE booking source, ONE payment source. Onboarding, dashboard, live preview, and published website must share the same business data.
4. **INR / paise** for all money fields where required.
5. **25% advance rule** enforced at booking/payment layer.
6. **RLS isolates each salon**; anonymous access is safe; public website exposure limited to public-safe fields.
7. **Storage paths salon-scoped.**
8. **Supabase Auth** used correctly for salon owners/staff/customers.
9. Every new point is merged against Points 1…N — conflicts are recorded, never silently discarded.
10. Final deliverable: consolidated 25-section specification → wait for approval → ordered safe migrations.

---

## 1. Point Checklist (1–90)

| # | Status | Summary |
|---|--------|---------|
| 1  | ✅ Received | Full Supabase DB-readiness; preserve app; inspect-then-build; ONE business-scoped model with `business_id` isolation for ALL business-owned data |
| 2  | ✅ Received | Supabase Auth only (no 2nd auth DB); `profiles` table — id PK → auth.users(id), full_name, mobile, email, avatar_url, created_at/updated_at |
| 3  | ✅ Received | `businesses` = tenant root table (create/verify): id PK, name/business_type/phone NOT NULL, tagline, about, whatsapp, email, logo_url, hero_image_url, timezone 'Asia/Kolkata', currency 'INR', country_code 'IN', status 'active', created_by → profiles(id), timestamps |
| 4  | ✅ Received | `business_members` — profile↔business access: business_id→businesses, user_id→profiles, access_role, status 'active'; UNIQUE(business_id,user_id); roles: owner_admin, manager, service_provider, receptionist, limited_staff (no professional salon role) |
| 5  | ✅ Received | `business_owners` — public owner profile: business_id UNIQUE → businesses, name NOT NULL, photo_url, role_title, bio, phone, email, timestamps; separate from app access (business_members) |
| 6  | ✅ Received | `services` — business-owned: business_id→businesses, name NOT NULL, category, price_paise BIGINT NOT NULL (integer paise, ₹500=50000, NO float), duration_minutes INT NOT NULL, short_description, is_featured false, status 'active', display_order 0, timestamps |
| 7  | ✅ Received | `packages` — business-owned offers: business_id→businesses, name NOT NULL, price_paise BIGINT NOT NULL (paise rule), duration_minutes, description, is_featured false, status 'active', display_order 0, timestamps |
| 8  | ✅ Received | `package_services` join: package_id→packages, service_id→services, display_order 0; UNIQUE(package_id, service_id) |
| 9  | ✅ Received | `staff_members` (create/verify): business_id→businesses, auth_user_id NULLABLE, full_name NOT NULL, photo_url, primary_role NOT NULL (= professional salon role), app_access_role (= internal permission role — KEEP SEPARATE), mobile, commission_percent numeric(5,2) 0, status 'available', hide_mobile_public true, is_public true, display_order 0, timestamps |
| 10 | ✅ Received | `staff_services` join: staff_id→staff_members, service_id→services; UNIQUE(staff_id, service_id) |
| 11 | ✅ Received | `staff_skills` — staff_id→staff_members, skill_name NOT NULL, display_order 0 |
| 12 | ✅ Received | `staff_schedules` — staff_id→staff_members, day_of_week INT (0=Sun..6=Sat), is_working true, start_time time, end_time time; UNIQUE(staff_id, day_of_week) |
| 13 | ✅ Received | `staff_permissions` — staff_id→staff_members, permission_key (manage_bookings, manage_services, manage_staff, view_payments, edit_website, manage_customers…), enabled true; UNIQUE(staff_id, permission_key); INTERNAL — never exposed publicly |
| 14 | ✅ Received | `business_media` — business_id→businesses, media_type (logo|hero|gallery|owner|staff), storage_path, public_url, category, display_order 0, is_demo false; uploads via Supabase Storage |
| 15 | ✅ Received | `social_profiles` — business_id→businesses, platform (instagram|facebook|youtube), profile_url, username, is_active true; UNIQUE(business_id, platform) |
| 16 | ✅ Received | `social_videos` — business_id→businesses, platform NOT NULL, video_url NOT NULL (URLs ONLY, NO video file storage), external_video_id, caption, display_order 0, status 'active', timestamps |
| 17 | ✅ Received | `business_locations` — business_id→businesses UNIQUE, address_line, area, city, state, postal_code, country 'India', lat/lng double precision, google_place_id, timestamps |
| 18 | ✅ Received | `business_hours` — business_id→businesses, day_of_week INT (0=Sun..6=Sat), is_open true, open_time time, close_time time; UNIQUE(business_id, day_of_week) |
| 19 | ✅ Received | `contact_settings` — business_id→businesses UNIQUE; show_call, show_whatsapp, show_book_now (true), booking_note; timestamps |
| 20 | ✅ Received | `booking_settings` — business_id UNIQUE; minimum_notice_minutes 60, maximum_advance_days 30, buffer_minutes 0, allow_customer_staff_selection true, advance_percent 25.00 (exists for consistency; owner UI must NOT edit; 25% enforced in backend logic) |
| 21 | ✅ Received | `booking_day_settings` — business_id→businesses, day_of_week INT, booking_enabled true; UNIQUE(business_id, day_of_week); actual open/close comes from business_hours |
| 22 | ✅ Received | `website_settings` — business_id UNIQUE; template_id NOT NULL (barber|hair_unisex|beauty_wellness), appearance (light|dark), slug UNIQUE, publish_status 'draft', published_at, referral_badge_visible true, nexora_branding_visible true, custom_domain, custom_domain_status, favicon_url, timestamps |
| 23 | ✅ Received | `website_content` — business_id UNIQUE; hero_heading, tagline, about_text, owner_intro, booking_cta (editable website copy ONLY; NO business name/services duplication) |
| 24 | ✅ Received | Service website copy: prefer storing final AI-reviewed description directly in `services.short_description`; NO duplicate service content tables unless needed |
| 25 | ✅ Received | `onboarding_progress` — business_id UNIQUE, user_id→profiles, current_step 1, last_completed_step 0, status in_progress|completed, completed_at; powers resume-from-last-screen |
| 26 | ✅ Received | `customers` — business_id→businesses, full_name NOT NULL, mobile NOT NULL, email; unique/index (business_id, mobile); NO forced customer login |
| 27 | ✅ Received | `bookings` — business_id→businesses, customer_id→customers, service_id/package_id/staff_id nullable, booking_reference UNIQUE, appointment_date NOT NULL, start_time/end_time time, service_name_snapshot NOT NULL, service_price_paise NOT NULL, duration_minutes, advance_paise NOT NULL, remaining_paise NOT NULL, customer_note, booking_source 'website', booking_status 'pending_payment', payment_status 'pending', balance_status 'due' |
| 28 | ✅ Received | `bookings.booking_status` allowed set: pending_payment, confirmed, upcoming, in_progress, completed, cancelled, no_show, expired |
| 29 | ✅ Received | `bookings.booking_source` allowed set: website, dashboard, walk_in, phone, whatsapp |
| 30 | ✅ Received | Booking snapshot rule: bookings ALWAYS keep service_name_snapshot, service_price_paise, duration_minutes, advance_paise, remaining_paise even if service changes later; never rely only on current service record |
| 31 | ✅ Received | `booking_status_history` — booking_id→bookings, old_status, new_status, changed_by NULLABLE, reason, created_at; preserves cancellation/completion history |
| 32 | ✅ Received | `booking_slot_holds` — business_id→businesses, service_id, staff_id NULLABLE, appointment_date, start/end time, session_token, expires_at; short hold during Razorpay payment; expired holds must not block booking forever |
| 33 | ✅ Received | `payment_orders` — business_id→businesses, booking_id→bookings, provider 'razorpay', provider_order_id UNIQUE, amount_paise NOT NULL, currency 'INR', status 'created', timestamps |
| 34 | ✅ Received | `payments` — business_id, booking_id, payment_order_id→payment_orders, provider 'razorpay', provider_payment_id UNIQUE, amount_paise NOT NULL, currency 'INR', payment_method, payment_status, verification_status, verified_at, timestamps |
| 35 | ✅ Received | `payments.payment_status` allowed: pending, verified, failed, refunded, partially_refunded; `payments.verification_status` allowed: pending, verified, failed |
| 36 | ✅ Received | `balance_collections` — business_id, booking_id, amount_paise NOT NULL, payment_method, collected_by NULLABLE, collected_at, notes; tracks remaining amount collected AT SALON — NOT a Razorpay payment |
| 37 | ✅ Received | `payment_refunds` — ONLY if refund support implemented: payment_id→payments, provider_refund_id, amount_paise, status, reason, timestamps; do NOT create fake refund UI without backend flow |
| 38 | ✅ Received | `referral_codes` — business_id→businesses UNIQUE, code UNIQUE, is_active true, created_at |
| 39 | ✅ Received | `referral_events` — referral_code_id, source_business_id, visitor_token, event_type (visit|setup_started|business_created|website_published), referred_business_id NULLABLE, created_at |
| 40 | ✅ Received | `business_activity` — business_id, actor_user_id NULLABLE, event_type, entity_type, entity_id NULLABLE, metadata JSONB, created_at; e.g., booking_created, payment_verified, service_updated, staff_added, website_published |
| 41 | ✅ Received | `website_events` — business_id, event_type, visitor_token, page_path, metadata JSONB, created_at; events: page_view, book_now_click, whatsapp_click, call_click, directions_click, referral_badge_click; REAL events only |
| 42 | ✅ Received | `notification_settings` — business_id, user_id, new_booking/booking_cancelled/payment_verified/upcoming_appointment/website_updates (true), email_enabled true, sms_enabled false, whatsapp_enabled false, in_app_enabled true; UNIQUE(business_id, user_id) |
| 43 | ✅ Received | `notifications` — business_id, user_id, type, title, message, is_read false, metadata JSONB, created_at |
| 44 | ✅ Received | `business_plans` — business_id UNIQUE; plan_code, status, white_label_enabled false, hide_nexora_branding false, custom_domain_enabled false, referral_badge_can_hide false; UI must NOT bypass these permissions |
| 45 | ✅ Received | Storage buckets: create/reuse `business-media`, `avatars`; OPTIONAL `website-assets`; NO video storage for Instagram/Facebook/YouTube videos |
| 46 | ✅ Received | Storage paths business-scoped: business-media/{business_id}/logo|hero|gallery|owners|staff/{staff_id}/...; NO uncontrolled public directory for all businesses |
| 47 | ✅ Received | Storage RLS: business members upload/manage ONLY their own business files; public reads ONLY public-display assets; Business A must NEVER edit/delete Business B media |
| 48 | ✅ Received | MANDATORY: ENABLE RLS on ALL business-owned tables (businesses, services, packages, staff_members, business_media, social_profiles, social_videos, business_locations, business_hours, booking_settings, website_settings, website_content, bookings, payments, referrals, activity, notifications, + all others) |
| 49 | ✅ Received | RLS helpers: `is_business_member(target_business_id uuid)` and/or `has_business_role(target_business_id uuid, allowed_roles text[])`; SECURITY DEFINER used carefully; PREVENT RLS recursion |
| 50 | ✅ Received | Owner/Admin (owner_admin) can manage ALL business-owned dashboard data |
| 51 | ✅ Received | Manager can manage operational data per permissions (bookings, services, staff, website) but sensitive platform/admin settings may remain restricted |
| 52 | ✅ Received | Service Provider: only own/assigned bookings, assigned services, own schedule/profile; NO all-payments/settings data by default |
| 53 | ✅ Received | Receptionist: bookings, customers, schedule/frontdesk; NO branding/admin/security access by default |
| 54 | ✅ Received | PUBLIC READ policies: anon may read ONLY published public data (business public info, active services/packages, public staff fields, gallery, social profiles/videos, location/hours, rendering-needed website settings/content); NEVER expose commission, app roles, permissions, private mobile, payment internals, member accounts |
| 55 | ✅ Received | PUBLIC BOOKING WRITE: NO free anonymous inserts of confirmed bookings/payments; use controlled server/API/RPC functions or server routes |
| 56 | ✅ Received | Razorpay SECRET KEY NEVER in public DB fields — server env/secrets only; DB stores provider_order_id, provider_payment_id, amount, status, verification state (no secrets) |
| 57 | ✅ Received | Create-payment-order MUST be server-side: 1 load booking, 2 load real service/package snapshot, 3 verify slot, 4 calculate exact 25%, 5 create Razorpay order, 6 store payment_order, 7 return safe checkout data |
| 58 | ✅ Received | Payment verification server-side: 1 verify Razorpay signature, 2 validate order/payment relationship, 3 verify amount, 4 mark payment verified ONCE, 5 mark booking confirmed, 6 set verified_at, 7 prevent duplicates, 8 remove/release slot hold, 9 write activity event; use transaction where possible |
| 59 | ✅ Received | Idempotency required for critical ops: website publish, payment verification, booking confirmation, balance collection, referral event creation — repeated client calls must NOT create duplicates |
| 60 | ✅ Received | Booking availability function (DB/server) using: business hours, booking-day settings, service duration, buffer, minimum notice, maximum advance window, staff schedules, staff-service assignments, existing bookings, active slot holds |
| 61 | ✅ Received | Double-booking protection: backend re-checks availability before order creation AND confirmation; transaction/advisory locking/exclusion logic; NOT frontend-only |
| 62 | ✅ Received | Website publish function: update existing website_settings → publish_status='published', published_at=now(); NO duplication of business/services/staff records |
| 63 | ✅ Received | `website_settings.slug` UNIQUE; validation: lowercase letters, numbers, hyphens, NO spaces; create unique index |
| 64 | ✅ Received | Reusable trigger function `set_updated_at()` applied to ALL tables with `updated_at` |
| 65 | ✅ Received | New-business bootstrap: create owner membership safely; optionally init booking_settings, contact_settings, website_settings, onboarding_progress, notification_settings; NO fake service/staff data |
| 66 | ✅ Received | Default website template by business_type: Barber→barber, Hair/Unisex→hair_unisex, Beauty/Nail/Spa/Massage→beauty_wellness; NEVER overwrite user-selected template later |
| 67 | ✅ Received | Indexes at minimum: services.business_id; staff_members.business_id; staff_services.staff_id & service_id; bookings.business_id, appointment_date, staff_id, customer_id, booking_status; payments.business_id, booking_id, provider_payment_id; website_settings.slug; customers(business_id+mobile); business_activity(business_id+created_at); website_events(business_id+created_at); referral_events.referral_code_id |
| 68 | ✅ Received | FK delete behavior: business deletion→cascade business-owned config IF intentional; service deletion→DO NOT destroy historical booking snapshots; booking deletion→avoid hard delete for real records; payments must not disappear on service change; use archive/status for operational history |
| 69 | ✅ Received | Soft delete/archive preferred for services, packages, staff, bookings where history matters; NEVER permanently delete records referenced by financial/booking history |
| 70 | ✅ Received | Constraints: price_paise ≥ 0; duration_minutes > 0; commission_percent 0–100; advance_percent = 25; latitude −90..90; longitude −180..180; day_of_week 0–6; remaining_paise ≥ 0 |
| 71 | ✅ Received | Use PG enums or CHECK constraints CONSISTENTLY; no arbitrary scattered status strings without validation |
| 72 | ✅ Received | After schema ready: generate/update Supabase TypeScript database types; replace unnecessary `any` in DB access where practical |
| 73 | ✅ Received | Create/reuse clean data-access/service layer (businessService, serviceService, staffService, websiteService, bookingService, paymentService, referralService…); NO raw Supabase queries scattered in UI components |
| 74 | ✅ Received | Screen↔data mapping (Screens 03–25) recorded — each screen wired to its real DB sources (details in log) |
| 75 | ✅ Received | CRITICAL — no duplicate data: NO onboarding_services, dashboard_services, onboarding_staff, dashboard_staff, preview_business, published_business, temporary_public_services etc. ONE business/service/staff record; screens read/write the SAME records |
| 76 | ✅ Received | `get_public_website_by_slug(slug)` view/function: loads complete published website (owner, services, packages, public staff, gallery, social, location, hours, settings, copy, contact) — public-safe ONLY, no private fields |
| 77 | ✅ Received | Dashboard overview RPC for Screen 16: today's bookings, upcoming bookings, month booking value, verified advance collected, service count, staff count — efficient, not dozens of frontend requests |
| 78 | ✅ Received | Payments/revenue query for Screen 23: booking value, verified advance, remaining due, balance collected, refunds (if implemented) — NO double counting |
| 79 | ✅ Received | Public website reads efficient; NO auth required for public published website; public query exposes ONLY approved fields |
| 80 | ✅ Received | Realtime: enable only where useful (bookings, payments/verification status, dashboard updates); do NOT subscribe every screen to every table |
| 81 | ✅ Received | Migrations: implement DB changes via ordered migration files (NOT one-off dashboard SQL); safe to run on existing project |
| 82 | ✅ Received | Seed/demo data: NO auto fake production records; dev-only seed script with INDIAN mock data; NEVER auto-seed in production |
| 83 | ✅ Received | DB error handling: frontend gets simple errors ("This website address is already taken", "This time is no longer available", "Payment could not be verified"); NEVER raw PostgreSQL errors to users |
| 84 | ✅ Received | Transactions for critical multi-step ops: payment verification, booking confirmation, publish state updates, balance payment logging; avoid half-completed states |
| 85 | ✅ Received | Audit/security: sensitive operations attributable (actor_user_id, timestamps, status history); do NOT log passwords, secret keys, or full sensitive payment data |
| 86 | ✅ Received | India defaults: currency INR, country India, timezone Asia/Kolkata, money in paise, phone UI +91 default |
| 87 | ✅ Received | Final security review checklist: RLS enabled, no cross-business reads, no public commission, no public app roles, no public payment internals, no exposed Razorpay secret, no unrestricted anonymous payment inserts, no unrestricted confirmed booking writes, storage business-isolated, published-website query safe |
| 88 | ✅ Received | Final database tests A–L: multi-business isolation (A); same-record service across screens (B); same-record staff across screens (C); published-site sync (D); ₹1,200 → advance ₹300 / remaining ₹900 (E); unverified payment blocks confirmation (F); verification confirms exactly once (G); screens 19/23 reflect (H); archived service keeps history (I); onboarding resume from progress (J); slug loads public site (K); no private-field access (L) |
| 89 | ✅ Received | Deliverables after implementation: final table list, relationship summary, migration files, RLS policies, storage buckets/policies, functions/RPCs, triggers, indexes, updated TS types, env vars, remaining backend functions to deploy, test results |
| 90 | ✅ Received | FINAL INSTRUCTION: ACTUALLY IMPLEMENT the architecture in the existing project (preserve UI/data, reuse tables, safe migrations, production RLS, 25 screens on ONE shared source of truth, ready for onboarding/dashboard/publishing/services/staff/gallery/social/location/booking/Razorpay 25% advance/verification/revenue/referral/white-label/settings/auto-save/resume/multi-business isolation); NO duplicate databases or business data |

---

## 2. Cumulative Requirements Log

*(Each received point is appended here verbatim-condensed with its validated interpretation.)*

### Point 1 — "Make the existing Nexora project completely database-ready using Supabase"

**Scope constraints (hard rules):**
- Do NOT create a new app; do NOT redesign any screen; do NOT change the existing 25-screen product flow; do NOT replace working UI; do NOT create duplicate onboarding/dashboard data.
- This point covers ONLY: Supabase database, auth relationships, RLS/security, storage, database functions, triggers, indexes, real-data wiring readiness, booking + payment data model, publishing data model, referral data model, white-label/settings data model.
- Goal: ONE clean production-ready database architecture for the complete Nexora product.

**§0 — Inspect existing project BEFORE creating anything (read-only):**
- Check for: Supabase client setup, existing migrations, existing tables, existing auth integration, existing database types, existing staff tables, booking/payment tables, website tables, storage buckets, functions/triggers, RLS policies.
- Do NOT blindly create duplicate tables — if an equivalent table exists: reuse/migrate it safely. Preserve existing data.

**§1 — Core database rule (ONE business-scoped model):**
- Every salon/business has its own `business_id`.
- ALL business-owned data is isolated by `business_id`: services, staff, bookings, payments, website, gallery, settings — **must never leak between businesses**.

**Interpretation notes (validated):**
- Task is DB-layer only; UI/product flow untouched. "Database-ready" = schema + auth + RLS + storage + functions/triggers + indexes that the existing 25-screen flow can wire to real data without UI redesign.
- §0 inspection result (performed, read-only, recorded in §4 below).
- §1 implies: `business_id` is the tenant key — every business-owned table carries `business_id` (directly or via a guaranteed FK chain), every RLS policy filters on it, and storage paths are scoped by it. A single root `salons`/`businesses` record is the canonical tenant; NO parallel "onboarding vs dashboard vs published site" data copies (matches standing guardrail #3).

### Point 2 — "AUTH USERS"

- Use **Supabase Auth** for login. Do NOT create a second password/authentication database (no custom credentials tables).
- Create application profile table **`profiles`** with recommended fields:
  - `id uuid primary key references auth.users(id)`
  - `full_name text`
  - `mobile text`
  - `email text`
  - `avatar_url text`
  - `created_at timestamptz`
  - `updated_at timestamptz`

**Interpretation notes (validated):**
- `profiles` is the single application-side extension of `auth.users` (1:1). Confirms the "profiles" concept from the known existing-schema list — target: reuse/upgrade any existing `profiles` table, preserve rows, add missing columns only via ALTER + backfill.
- "No second password DB" → no `users`, `accounts`, `credentials`, `sessions` tables of our own; login/identity/session lives entirely in `auth.*` (Supabase-managed).
- A trigger-based row insertion from `auth.users` (e.g., `handle_new_user` → insert into `profiles`) is implied as the canonical wiring, with `updated_at` auto-touch trigger (details to be consolidated later — triggers are a later point's scope).
- `profiles` is identity-level, NOT the business tenant: salon ownership (`business_id`) belongs to the `salons`/business model (Point 1), to be linked from profiles via later points. No `business_id` column is prescribed on `profiles` by this point.

### Point 3 — "BUSINESSES"

- **Create / verify** table **`businesses`** (the tenant root).
- Fields:
  - `id uuid primary key`
  - `name text not null`
  - `business_type text not null`
  - `tagline text`
  - `about text`
  - `phone text not null`
  - `whatsapp text`
  - `email text`
  - `logo_url text`
  - `hero_image_url text`
  - `timezone text default 'Asia/Kolkata'`
  - `currency text default 'INR'`
  - `country_code text default 'IN'`
  - `status text default 'active'`
  - `created_by uuid references profiles(id)`
  - `created_at timestamptz`
  - `updated_at timestamptz`

**Interpretation notes (validated):**
- `businesses.id` IS the `business_id` from Point 1 — the single tenant key every business-owned table must reference. One salon record only (no duplicate sources).
- "Create / verify" = verify against live schema first; reuse/migrate the existing `salons` concept if found (see Conflicts log).
- `created_by` ties the tenant to the authenticated owner profile (Point 2); a profile may later hold memberships to one or more businesses (role model comes in a later point).

### Point 4 — "BUSINESS MEMBERS / ACCESS"

- **Create `business_members`** — connects app users (profiles) to businesses.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid references businesses(id)`
  - `user_id uuid references profiles(id)`
  - `access_role text`
  - `status text default 'active'`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **UNIQUE constraint: `business_id + user_id`**
- **Supported access roles (closed set):** `owner_admin`, `manager`, `service_provider`, `receptionist`, `limited_staff`
- **Do NOT use "professional salon role" here** — `access_role` is access/membership only; professional/staff job roles belong to the staff model (a later point).

**Interpretation notes (validated):**
- This is the access layer that makes Point 1's `business_id` isolation enforceable: a user may access a business's data iff they have an `active` membership row for that `business_id`.
- Closed role set → enforce via CHECK constraint (or enum) on `access_role`; do not invent new roles.
- `businesses.created_by` (Point 3) and `owner_admin` membership must stay consistent — plan: backfill an `owner_admin` membership for each business owner during migration; decision recorded below.
- `business_members.id` PK + UNIQUE(business_id, user_id): one active membership record per user per business (status handles deactivation).

### Point 5 — "OWNER PROFILE"

- **Create `business_owners`** — public-facing owner profile for a business.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` **UNIQUE** (one owner profile per business)
  - `name text not null`
  - `photo_url text`
  - `role_title text`
  - `bio text`
  - `phone text`
  - `email text`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **Owner public information remains separate from app access permissions.**

**Interpretation notes (validated):**
- `business_owners` is PUBLIC/display data ("meet the owner" on the published website) — intentionally separate from `business_members` (app access) and from `profiles` (auth identity). One row per business (`UNIQUE(business_id)`).
- Public exposure boundaries apply: only public-safe owner fields may be served to anonymous visitors (phone/email exposure policy to be finalized in the public-access point).
- Relationship: `business_owners.business_id → businesses(id)`. No FK to profiles required by this point — the owner may not even have an app account; do not force-link.

### Point 6 — "SERVICES"

- **Create `services`** — the ONE service source (shared by onboarding, dashboard, preview, published website).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `name text not null`
  - `category text`
  - `price_paise bigint not null`
  - `duration_minutes integer not null`
  - `short_description text`
  - `is_featured boolean default false`
  - `status text default 'active'`
  - `display_order integer default 0`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **Money rule: use integer paise** — e.g., ₹500 = `50000`. **Do NOT store money using float.**

**Interpretation notes (validated):**
- `price_paise bigint NOT NULL` is the global money format for Nexora → applies to ALL money fields across every later point (payments, revenue, packages): integer minor-unit (paise), never float/numeric-with-decimal (unless a later point explicitly overrides — any such override would be recorded as a conflict).
- `category` is free text at this point; a later point may define categories (packages/grouping).
- One service record = shared by all surfaces (enforces standing guardrail #3).

### Point 7 — "PACKAGES"

- **Create `packages`** — business-owned package/offer records (sibling of `services`).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `name text not null`
  - `price_paise bigint not null` (integer paise rule from Point 6 applies)
  - `duration_minutes integer`
  - `description text`
  - `is_featured boolean default false`
  - `status text default 'active'`
  - `display_order integer default 0`
  - `created_at timestamptz`
  - `updated_at timestamptz`

**Interpretation notes (validated):**
- `packages` is the package/offer catalog — a separate, business-owned entity from `services` (no duplication: a package is an offer record, not a second service source). If a later point defines package composition (which services a package contains), it will add a join table — pending.
- Money rule (Point 6): `price_paise` integer paise, no floats — applies unchanged.
- Shared by all surfaces (onboarding, dashboard, preview, published site) — no duplicate catalogs.

### Point 8 — "PACKAGE SERVICES"

- **Create `package_services`** — join/line-item table linking packages to their component services.
- Fields:
  - `id uuid` (PK)
  - `package_id uuid` (→ packages(id))
  - `service_id uuid` (→ services(id))
  - `display_order integer default 0`
- **UNIQUE: `package_id + service_id`**

**Interpretation notes (validated):**
- Realizes the package-composition note from Point 7: a package contains services via this join (many-to-many).
- UNIQUE(package_id, service_id) → a service appears at most once per package.
- Tenant safety note: both joined tables are business-scoped; a package may only link services of the SAME business — enforce via trigger/function or composite FK in final SQL (recorded; to be implemented in the functions/triggers migration).

### Point 9 — "STAFF MEMBERS"

- **Create / verify `staff_members`** — the ONE staff source (shared by dashboard, preview, published site).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `auth_user_id uuid` **nullable** (→ profiles(id), only if staff has an app login)
  - `full_name text not null`
  - `photo_url text`
  - `primary_role text not null` — **professional salon role** (e.g., hairstylist, beautician — the "professional salon role" that Point 4 excluded from access roles)
  - `app_access_role text` — **internal Nexora permission role** (app-access level)
  - `mobile text`
  - `commission_percent numeric(5,2) default 0` — percentage, NOT money (paise rule unaffected)
  - `status text default 'available'`
  - `hide_mobile_public boolean default true`
  - `is_public boolean default true`
  - `display_order integer default 0`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **IMPORTANT — keep separate:** `primary_role` = professional salon role; `app_access_role` = internal Nexora permission role.

**Interpretation notes (validated):**
- Resolves the Point 4 exclusion cleanly: professional salon roles live here (`primary_role`); app permission roles (`app_access_role`) mirror the `business_members.access_role` set (owner_admin, manager, service_provider, receptionist, limited_staff) — exact permitted values for `app_access_role` to be pinned by a later point.
- `auth_user_id` nullable → staff without an app account exist as public team records only; staff WITH an account are linked to profiles (and to a `business_members` row for RLS access).
- `commission_percent numeric(5,2)` is a rate (%), not money — does not violate the integer-paise money rule.
- Public flags: `is_public` (show on website) + `hide_mobile_public` (mask mobile on public site) — public exposure handled by the public-access point.
- Recorded for later reconciliation: potential role-source duplication between `staff_members.app_access_role` and `business_members.access_role` (see Conflicts log).

### Point 10 — "STAFF SERVICES"

- **Create `staff_services`** — join table: which staff members provide which services.
- Fields:
  - `id uuid` (PK)
  - `staff_id uuid` (→ staff_members(id))
  - `service_id uuid` (→ services(id))
- **UNIQUE: `staff_id + service_id`**

**Interpretation notes (validated):**
- Many-to-many `staff_members ↔ services` (a staff member can do many services; a service can have many staff).
- UNIQUE(staff_id, service_id) → each pairing recorded once.
- Tenant safety: same as package_services — a staff member may only be linked to services of the SAME business; enforce via composite-FK/trigger guard in final SQL.
- Drives booking availability & assignment (booking point later): bookable staff per service.

### Point 11 — "STAFF SKILLS"

- **Create `staff_skills`** — free-text skills per staff member (e.g., keratin, bridal makeup).
- Fields:
  - `id uuid` (PK)
  - `staff_id uuid` (→ staff_members(id))
  - `skill_name text not null`
  - `display_order integer default 0`

**Interpretation notes (validated):**
- One-to-many `staff_members → staff_skills`; skills are display/tag data (public website "skills" chips).
- Tenant scoping inherited via `staff_members` (no direct business_id needed; keep composite-FK guard pattern consistent with staff_services).

### Point 12 — "STAFF WEEKLY SCHEDULE"

- **Create `staff_schedules`** — recurring weekly availability per staff member.
- Fields:
  - `id uuid` (PK)
  - `staff_id uuid` (→ staff_members(id))
  - `day_of_week integer` — **0 = Sunday, 1 = Monday … 6 = Saturday**
  - `is_working boolean default true`
  - `start_time time`
  - `end_time time`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **UNIQUE: `staff_id + day_of_week`** — one schedule row per weekday per staff member.

**Interpretation notes (validated):**
- Basis for booking availability: a staff member is bookable on a day only within [start_time, end_time) when `is_working = true`.
- Add CHECK: `day_of_week BETWEEN 0 AND 6`; `end_time > start_time` when working (final SQL).
- Tenant scoping inherited via `staff_members`; composite-FK guard pattern maintained.

### Point 13 — "STAFF PERMISSIONS"

- **Create `staff_permissions`** — granular internal permissions per staff member (feature-level access control).
- Fields:
  - `id uuid` (PK)
  - `staff_id uuid` (→ staff_members(id))
  - `permission_key text`
  - `enabled boolean default true`
- **UNIQUE: `staff_id + permission_key`**
- Example keys: `manage_bookings`, `manage_services`, `manage_staff`, `view_payments`, `edit_website`, `manage_customers`
- **Do NOT expose publicly** — strictly internal; never served to anonymous visitors; excluded from public views/RLS.

**Interpretation notes (validated):**
- Permission model: role (`business_members.access_role` / `staff_members.app_access_role`) + granular `staff_permissions` overrides. Keys are string-based (extensible); closed key set to be defined in final SQL or app constants — do not expose the table or its contents publicly.
- Internal-only ⇒ RLS: no anonymous/`authenticated` read by default except staff of the same business (exact policy in RLS point); never in public website queries.
- Tenant scoping inherited via `staff_members`.

### Point 14 — "GALLERY / MEDIA"

- **Create `business_media`** — the single media/gallery source per business (photos uploaded via **Supabase Storage**).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `media_type text` — **types: `logo`, `hero`, `gallery`, `owner`, `staff`**
  - `storage_path text`
  - `public_url text`
  - `category text`
  - `display_order integer default 0`
  - `is_demo boolean default false`
  - `created_at timestamptz`
- **Use Supabase Storage for uploaded images.**

**Interpretation notes (validated):**
- `business_media` becomes the canonical media registry; `storage_path` points into Supabase Storage (bucket + salon-scoped path per standing guardrail #7); `public_url` caches the served URL (or is derived — final decision in storage point).
- `media_type` closed set: logo, hero, gallery, owner, staff → CHECK constraint in final SQL.
- `is_demo` marks seeded/demo media (kept separate from real business uploads).
- Staff media (`media_type='staff'`) vs. `staff_members.photo_url`: recorded as a potential duplication point — decision below (Conflicts log).
- Owner media (`media_type='owner'`) vs. `business_owners.photo_url`: same reconciliation applies.

### Point 15 — "SOCIAL PROFILES"

- **Create `social_profiles`** — business social links (public website footer/social section).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `platform text` — **platforms: `instagram`, `facebook`, `youtube`**
  - `profile_url text`
  - `username text`
  - `is_active boolean default true`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **UNIQUE: `business_id + platform`** — one profile per platform per business.

**Interpretation notes (validated):**
- Closed platform set (instagram, facebook, youtube) → CHECK constraint; UNIQUE(business_id, platform) enforces single entry per platform.
- `is_active` controls public display; only active profiles exposed to the public site.

### Point 16 — "SOCIAL VIDEOS"

- **Create `social_videos`** — embedded social video references for the business.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `platform text not null`
  - `video_url text not null`
  - `external_video_id text`
  - `caption text`
  - `display_order integer default 0`
  - `status text default 'active'`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **IMPORTANT: DO NOT store video files — store URLs/references only.**

**Interpretation notes (validated):**
- `video_url` + `external_video_id` reference external hosts (YouTube/Instagram etc.); no video upload path, no storage bucket for videos.
- Public site embeds via URL; `status` gates visibility.

### Point 17 — "BUSINESS LOCATION"

- **Create `business_locations`** — single location record per business.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` **unique** (→ businesses(id)) — one location row per business
  - `address_line text`
  - `area text`
  - `city text`
  - `state text`
  - `postal_code text`
  - `country text default 'India'`
  - `latitude double precision`
  - `longitude double precision`
  - `google_place_id text`
  - `created_at timestamptz`
  - `updated_at timestamptz`

**Interpretation notes (validated):**
- UNIQUE(business_id) → 1:1 with businesses; this is the canonical location source (wizard StepLocation + public map/contact).
- If a later point needs multi-location businesses (chain salons), that would be a conflict to record — current model is single-location per business.
- `google_place_id` for Google Places integration (map, autocomplete); lat/lng for map rendering.
- Public-safe fields: address/city/state/postal/country/coords are intended for public display (maps); exact exposure finalized in public-access point.

### Point 18 — "BUSINESS OPENING HOURS"

- **Create `business_hours`** — weekly opening hours per business.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `day_of_week integer` — 0 = Sunday … 6 = Saturday (same convention as `staff_schedules`, Point 12)
  - `is_open boolean default true`
  - `open_time time`
  - `close_time time`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **UNIQUE: `business_id + day_of_week`** — one row per weekday per business.

**Interpretation notes (validated):**
- Booking layer will validate proposed booking slots against `business_hours` (business open) AND `staff_schedules` (staff working).
- Same CHECKs as staff_schedules: `day_of_week BETWEEN 0 AND 6`; `close_time > open_time` when open.
- Public display: hours shown on the published website; `is_open=false` → closed that day.

### Point 19 — "CONTACT SETTINGS"

- **Create `contact_settings`** — per-business public contact-action preferences.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` **unique** (→ businesses(id)) — 1:1 with business
  - `show_call boolean default true`
  - `show_whatsapp boolean default true`
  - `show_book_now boolean default true`
  - `booking_note text`
  - `created_at timestamptz`
  - `updated_at timestamptz`

**Interpretation notes (validated):**
- Controls which contact CTAs appear on the public website (call / WhatsApp / book-now) and any note shown at booking time.
- 1:1 with business (UNIQUE business_id) — same row pattern as `business_locations`, `business_owners`.
- `show_*` flags directly gate public exposure of phone/WhatsApp (they are UI/public-surface controls, not RLS controls).

### Point 20 — "BOOKING SETTINGS"

- **Create `booking_settings`** — per-business booking rules.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` **unique** (→ businesses(id)) — 1:1
  - `minimum_notice_minutes integer default 60`
  - `maximum_advance_days integer default 30`
  - `buffer_minutes integer default 0`
  - `allow_customer_staff_selection boolean default true`
  - `advance_percent numeric(5,2) default 25.00`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **IMPORTANT:**
  - `advance_percent` exists for **system consistency** only.
  - The **owner UI must NOT allow editing** it.
  - **Enforce 25% in backend business logic.**

**Interpretation notes (validated):**
- Standing guardrail #5 (25% advance rule) is now concretized: fixed at **25%**, enforced by backend/DB logic, not user-editable.
- `advance_percent` stored (default 25.00) as the single consistency constant; DB-level protection: exclude column from owner UPDATE paths + trigger/function enforcement on payment computation (details in payments point). Backend derives advance = 25% of booking total (paise math, rounding rule to be fixed in payments point).
- `minimum_notice_minutes`, `maximum_advance_days`, `buffer_minutes`, `allow_customer_staff_selection` are owner-editable booking rules; validation against `business_hours`/`staff_schedules` at booking creation.

### Point 21 — "BOOKING DAY AVAILABILITY"

- **Create `booking_day_settings`** — per-day booking on/off switch per business.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `day_of_week integer` — 0=Sun…6=Sat (same convention)
  - `booking_enabled boolean default true`
- **UNIQUE: `business_id + day_of_week`**
- **Use `business_hours` for actual opening/closing time** — this table only enables/disables booking for a weekday.

**Interpretation notes (validated):**
- Layered availability check at booking creation: `booking_day_settings.booking_enabled` (can customers book this weekday?) + `business_hours` (open/close times) + `staff_schedules` (staff working) + `booking_settings` (notice/advance/buffer).
- No time columns here — do not duplicate business_hours (Point 18).

### Point 22 — "WEBSITE SETTINGS"

- **Create `website_settings`** — per-business website/publishing configuration (the publishing data model root).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` **unique** (→ businesses(id)) — 1:1
  - `template_id text not null` — **allowed: `barber`, `hair_unisex`, `beauty_wellness`**
  - `appearance text default 'light'` — **allowed: `light`, `dark`**
  - `slug text` **unique** — public website URL slug
  - `publish_status text default 'draft'`
  - `published_at timestamptz`
  - `referral_badge_visible boolean default true`
  - `nexora_branding_visible boolean default true`
  - `custom_domain text`
  - `custom_domain_status text`
  - `favicon_url text`
  - `created_at timestamptz`
  - `updated_at timestamptz`

**Interpretation notes (validated):**
- This is the single publishing source (draft ↔ published; live preview + published site read the same business data, only gated by `publish_status`).
- `template_id` and `appearance` closed sets → CHECK constraints; `slug` global-unique (public URL); `custom_domain` + status for domain mapping (white-label); branding flags control Nexora/referral badges on the public site (white-label point later).
- `publish_status` lifecycle values to be finalized in the publishing point (e.g., draft/published/archived).

### Point 23 — "WEBSITE CONTENT"

- **Create `website_content`** — editable website copy only.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` **unique** (→ businesses(id)) — 1:1
  - `hero_heading text`
  - `tagline text`
  - `about_text text`
  - `owner_intro text`
  - `booking_cta text`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **Do NOT duplicate business name/services here — store only editable website copy.**

**Interpretation notes (validated):**
- Scope guard: business identity (name/tagline) lives in `businesses`; services live in `services`; this table stores only screen copy. `tagline` here = website-copy tagline (businesses.tagline already exists — see conflict note below).
- Renders the hero/about/owner/CTA sections of the template; AI-reviewable copy (per Point 24 pattern).

### Point 24 — "SERVICE WEBSITE COPY"

- If service descriptions can be **AI-reviewed independently**, prefer storing the final description directly in **`services.short_description`**.
- **Do NOT create unnecessary duplicate service content tables unless needed.**

**Interpretation notes (validated):**
- Confirms no `service_content`/`service_descriptions` table: `services.short_description` (Point 6) is the single final copy field (AI-reviewed output written back in place).
- If future needs arise (e.g., versioned AI drafts), a separate drafts table could be justified — but NOT a parallel final-copy source. Noted, no action now.

### Point 25 — "ONBOARDING PROGRESS"

- **Create `onboarding_progress`** — wizard/setup progress per business (the DB-backed auto-save/resume for onboarding).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` **unique** (→ businesses(id)) — one progress row per business
  - `user_id uuid` (→ profiles(id))
  - `current_step integer default 1`
  - `last_completed_step integer default 0`
  - `status text default 'in_progress'` — **allowed: `in_progress`, `completed`**
  - `completed_at timestamptz`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **Must power: resume from last saved screen.**

**Interpretation notes (validated):**
- This is the DB migration path for the existing `localStorage` builder persistence (`nexora_onboarding_state`, `nexora_builder_state`) — the app writes progress here and resumes from `last_completed_step`/`current_step` (auto-save/resume architecture; the JSONB draft-state table likely comes in a later point).
- `user_id` + UNIQUE business_id → track owner advancing the wizard; status CHECK (`in_progress`, `completed`).

### Point 28 — "BOOKING STATUS"

- **Allowed `bookings.booking_status` values (closed set):**
  - `pending_payment`
  - `confirmed`
  - `upcoming`
  - `in_progress`
  - `completed`
  - `cancelled`
  - `no_show`
  - `expired`
- → CHECK constraint (or enum) on `bookings.booking_status`.

**Interpretation notes (validated):**
- Lifecycle implied: `pending_payment` → `confirmed` → `upcoming` → `in_progress` → `completed`; terminal/abort: `cancelled`, `no_show`, `expired`. Transition enforcement via trigger in final SQL (transitions to be pinned in the lifecycle point, if any).

### Point 29 — "BOOKING SOURCE"

- **Allowed `bookings.booking_source` values (closed set):**
  - `website`
  - `dashboard`
  - `walk_in`
  - `phone`
  - `whatsapp`
- → CHECK constraint on `bookings.booking_source`. Default `website` (Point 27) unchanged.

### Point 30 — "BOOKING SNAPSHOT RULE"

- **Bookings MUST preserve snapshots.** Even if the service changes later, the existing booking keeps:
  - `service_name_snapshot`
  - `service_price_paise`
  - `duration_minutes`
  - `advance_paise`
  - `remaining_paise`
- **Do NOT rely only on the current service record.**

**Interpretation notes (validated):**
- Elevates the Point 27 snapshot pattern to a hard rule: booking history is immutable w.r.t. catalog changes. The snapshot columns on `bookings` are never rewritten when `services`/`packages` change. Triggers in final SQL must NOT cascade service updates into bookings.

### Point 31 — "BOOKING STATUS HISTORY"

- **Create `booking_status_history`** — audit trail for booking status changes.
- Fields:
  - `id uuid` (PK)
  - `booking_id uuid` (→ bookings(id))
  - `old_status text`
  - `new_status text`
  - `changed_by uuid` **nullable** (→ profiles(id), nullable for system/anon changes)
  - `reason text`
  - `created_at timestamptz`
- **Preserve cancellation/completion history.**

**Interpretation notes (validated):**
- Canonical audit: every `bookings.booking_status` change appends a row (trigger-driven in final SQL). `changed_by` nullable — system transitions (e.g., `expired`) have no actor.
- Supports guardrail "booking history is preserved".

### Point 32 — "SLOT HOLDS"

- **Create `booking_slot_holds`** — short temporary slot reservation while Razorpay payment is in progress.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `service_id uuid` (→ services(id))
  - `staff_id uuid` **nullable** (→ staff_members(id))
  - `appointment_date date`
  - `start_time time`
  - `end_time time`
  - `session_token text`
  - `expires_at timestamptz`
  - `created_at timestamptz`
- **Purpose:** short temporary hold during Razorpay checkout.
- **Expired holds must not block booking forever.**

**Interpretation notes (validated):**
- A hold is time-boxed (`expires_at`); availability queries consider only unexpired holds; expired holds are ignored (and may be cleaned by a scheduled job/function — final SQL).
- `session_token` ties the hold to the anonymous checkout session (no forced login — consistent with Point 26).
- Not a booking: a successful payment converts a hold into a `bookings` row (and the hold expires/clears).

### Point 33 — "PAYMENT ORDERS"

- **Create `payment_orders`** — Razorpay order records (one per checkout attempt).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `booking_id uuid` (→ bookings(id))
  - `provider text default 'razorpay'`
  - `provider_order_id text` **unique** — Razorpay order id (e.g., `order_...`)
  - `amount_paise bigint not null` (integer paise rule)
  - `currency text default 'INR'`
  - `status text default 'created'`
  - `created_at timestamptz`
  - `updated_at timestamptz`

**Interpretation notes (validated):**
- `provider_order_id` UNIQUE prevents duplicate Razorpay orders; a booking can have multiple payment orders over time (retry/re-advance) — the payments table records what actually succeeded.
- Order lifecycle (created → paid → failed/cancelled) values to be pinned by a later point; `status` default `created`.

### Point 34 — "PAYMENTS"

- **Create `payments`** — successful/payment-event records (the ONE payment source).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `booking_id uuid` (→ bookings(id))
  - `payment_order_id uuid` (→ payment_orders(id))
  - `provider text default 'razorpay'`
  - `provider_payment_id text` **unique** — Razorpay payment id (e.g., `pay_...`)
  - `amount_paise bigint not null`
  - `currency text default 'INR'`
  - `payment_method text`
  - `payment_status text`
  - `verification_status text`
  - `verified_at timestamptz`
  - `created_at timestamptz`
  - `updated_at timestamptz`

**Interpretation notes (validated):**
- One row per payment event; `provider_payment_id` UNIQUE prevents duplicate captures.
- `payment_status` + `verification_status` (Point 35) split: payment_status = provider-side outcome; verification_status = our server-side signature verification outcome (Razorpay webhook verification). `verified_at` records when verification succeeded.
- Money rule: `amount_paise` integer paise, no float.

### Point 35 — "PAYMENT STATUS"

- **Allowed `payments.payment_status` (closed set):**
  - `pending`
  - `verified`
  - `failed`
  - `refunded`
  - `partially_refunded`
- **Allowed `payments.verification_status` (closed set):**
  - `pending`
  - `verified`
  - `failed`
- → CHECK constraints on both columns.

**Interpretation notes (validated):**
- Refund states live on `payments.payment_status`; refund records themselves (amounts/razorpay refund ids) likely arrive in a later point (refunds/revenue) — if so, they must remain consistent with `payment_status` here.

### Point 36 — "BALANCE COLLECTIONS"

- **Create `balance_collections`** — tracks the remaining amount collected at the salon (in-person).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `booking_id uuid` (→ bookings(id))
  - `amount_paise bigint not null`
  - `payment_method text`
  - `collected_by uuid` (→ profiles(id), nullable)
  - `collected_at timestamptz`
  - `notes text`
  - `created_at timestamptz`
- **Purpose:** track remaining amount collected at salon.
- **Do NOT treat this as a Razorpay payment.**

**Interpretation notes (validated):**
- Completes the 25%-advance model: `advance_paise` collected via Razorpay (`payments`), the remainder (`remaining_paise`) collected in-salon via `balance_collections`.
- Deliberately NOT in `payments` (which is Razorpay-only): separate table, separate semantics, `collected_by` staff actor, offline `payment_method` (cash/UPI/card at counter).
- Reconciliation invariant (final SQL trigger/check): sum(advance payments) + sum(balance_collections) ≤ service_price_paise; when equal → `balance_status` cleared.

### Point 37 — "REFUNDS"

- **Only if refund support is implemented**, create/use `payment_refunds`:
  - `id uuid` (PK)
  - `payment_id uuid` (→ payments(id))
  - `provider_refund_id text`
  - `amount_paise bigint`
  - `status text`
  - `reason text`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **Do not create fake refund UI if the backend flow is not implemented.**

**Interpretation notes (validated):**
- Conditional table: include in final SQL only if the Razorpay refund flow (API + webhook) is actually implemented; otherwise create nothing (and no UI either). Decision point recorded — pending confirmation during final architecture review.

### Point 38 — "REFERRAL CODES"

- **Create `referral_codes`** — one referral code per business.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` **unique** (→ businesses(id)) — one code per business
  - `code text` **unique** — human-shareable code
  - `is_active boolean default true`
  - `created_at timestamptz`

**Interpretation notes (validated):**
- Both UNIQUEs enforced: one code per business AND globally unique code text. Feeds the referral flow: visitor enters/taps code → `referral_events` (Point 39).

### Point 39 — "REFERRAL EVENTS"

- **Create `referral_events`** — funnel events attributed to a referral code.
- Fields:
  - `id uuid` (PK)
  - `referral_code_id uuid` (→ referral_codes(id))
  - `source_business_id uuid` (→ businesses(id)) — the business whose code was used
  - `visitor_token text` — anonymous visitor identifier (no forced login)
  - `event_type text` — **allowed: `visit`, `setup_started`, `business_created`, `website_published`**
  - `referred_business_id uuid` **nullable** (→ businesses(id)) — set once the visitor creates a business
  - `created_at timestamptz`

**Interpretation notes (validated):**
- Referral attribution funnel: visit → setup_started → business_created → website_published. `referred_business_id` fills in at `business_created`.
- `visitor_token` keeps attribution anonymous/device-scoped (consistent with no-forced-login); business_created/published events link the new tenant.
- `event_type` CHECK on the closed set.

### Point 40 — "ACTIVITY LOG"

- **Create `business_activity`** — generic per-business activity/audit log.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `actor_user_id uuid` **nullable** (→ profiles(id))
  - `event_type text`
  - `entity_type text`
  - `entity_id uuid` **nullable**
  - `metadata jsonb`
  - `created_at timestamptz`
- Examples: `booking_created`, `payment_verified`, `service_updated`, `staff_added`, `website_published`

**Interpretation notes (validated):**
- Flexible event log: `metadata` JSONB carries structured extras (diffs, amounts, references); `entity_type`+`entity_id` link to the affected record (bookings, services, staff…).
- Write-mostly table: inserts by app/triggers; reads restricted to business members; no public exposure. Indexing on (business_id, created_at) and (business_id, entity_type) in final SQL.

### Point 41 — "WEBSITE ANALYTICS EVENTS"

- **Create `website_events`** — public website analytics events (anonymous).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `event_type text` — **possible: `page_view`, `book_now_click`, `whatsapp_click`, `call_click`, `directions_click`, `referral_badge_click`**
  - `visitor_token text` — anonymous visitor id
  - `page_path text`
  - `metadata jsonb`
  - `created_at timestamptz`
- **Use real events only.**

**Interpretation notes (validated):**
- Public-site analytics: INSERT-only from anonymous visitors (RLS: anon INSERT allowed, no SELECT); no PII beyond visitor_token (device-scoped, consistent with referral visitor_token).
- `event_type` CHECK on the listed set; "real events only" = no fabricated/backfilled analytics data.

### Point 42 — "NOTIFICATION SETTINGS"

- **Create `notification_settings`** — per-user notification preferences within a business.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `user_id uuid` (→ profiles(id))
  - `new_booking boolean default true`
  - `booking_cancelled boolean default true`
  - `payment_verified boolean default true`
  - `upcoming_appointment boolean default true`
  - `website_updates boolean default true`
  - `email_enabled boolean default true`
  - `sms_enabled boolean default false`
  - `whatsapp_enabled boolean default false`
  - `in_app_enabled boolean default true`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **UNIQUE: `business_id + user_id`** — one preference row per user per business.

**Interpretation notes (validated):**
- Channel defaults: email/in-app on; sms/whatsapp off (opt-in). Event-type toggles gate which notifications are delivered; channels gate how.
- Pairs with `notifications` (Point 43) delivery engine.

### Point 43 — "NOTIFICATIONS"

- **Create `notifications`** — delivered notifications per user.
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `user_id uuid` (→ profiles(id))
  - `type text`
  - `title text`
  - `message text`
  - `is_read boolean default false`
  - `metadata jsonb`
  - `created_at timestamptz`

**Interpretation notes (validated):**
- In-app notification feed (and source for email/sms/whatsapp fan-out honoring `notification_settings`). `type` mirrors activity/event types (booking_created etc.); `metadata` carries links/amounts.
- Business-scoped; user sees only their own notifications (RLS: user_id = auth.uid() AND membership).

### Point 44 — "WHITE-LABEL / PLAN"

- **Create `business_plans`** — plan entitlements per business (white-label permissions).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` **unique** (→ businesses(id)) — one plan row per business
  - `plan_code text`
  - `status text`
  - `white_label_enabled boolean default false`
  - `hide_nexora_branding boolean default false`
  - `custom_domain_enabled boolean default false`
  - `referral_badge_can_hide boolean default false`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **Do NOT allow UI to bypass these permissions.**

**Interpretation notes (validated):**
- Authoritative entitlement gate: `website_settings.nexora_branding_visible`, `referral_badge_visible`, `custom_domain` (Point 22) must be server/DB-enforced against these flags — UI cannot self-grant. Example rule (final SQL/backend): hide_nexora_branding only honored if `white_label_enabled`; custom domain only if `custom_domain_enabled`; referral badge hide only if `referral_badge_can_hide`.
- `plan_code`/`status` define tier & lifecycle (values later/plan point if any).

### Point 45 — "STORAGE BUCKETS"

- **Create/reuse Supabase Storage buckets:**
  - `business-media` — business uploads (logo, hero, gallery, owner, staff photos) → maps to `business_media.storage_path` (Point 14)
  - `avatars` — profile avatars (→ `profiles.avatar_url`, staff photos)
  - **OPTIONAL:** `website-assets` — website-asset bucket (favicon/custom assets)
- **Do NOT create video storage for Instagram/Facebook/YouTube videos** (Point 16: URLs only).

**Interpretation notes (validated):**
- Bucket-level policies in final SQL (RLS/storage section): `business-media` paths salon-scoped (`{business_id}/...` per guardrail #7); public reads for published-site media; writes restricted to business members. `avatars` user-scoped (`{user_id}/...`). `website-assets` optional, created only if needed.

### Point 46 — "STORAGE PATH STRUCTURE"

- **Business-scoped paths only. Examples:**
  - `business-media/{business_id}/logo/...`
  - `business-media/{business_id}/hero/...`
  - `business-media/{business_id}/gallery/...`
  - `business-media/{business_id}/owners/...`
  - `business-media/{business_id}/staff/{staff_id}/...`
- **Do NOT place all businesses in one uncontrolled public directory.**

**Interpretation notes (validated):**
- Canonical storage layout for `business-media`; `{business_id}` is the first path segment → guardrail #7 enforced structurally.
- `avatars/{user_id}/...` follows the same principle for profiles. `staff/{staff_id}/...` scopes per-staff media.
- Storage policies (Point 47) will match on path prefixes.

### Point 47 — "STORAGE RLS"

- Create secure Storage policies:
  - **Business members** may upload/manage **their own business files only** (path prefix `{business_id}/` + membership check).
  - **Public users** may read **only assets intended for public website display** (logo/hero/gallery/owner/public staff photos; NOT private/internal files).
  - **Users from Business A must never edit/delete Business B media.**

**Interpretation notes (validated):**
- Storage policy = ownership prefix match AND `is_business_member` (Point 49) for writes; read policy for anon limited to public-media prefixes (a public-read convention per media_type + publish_status — pinned in final storage migration).

### Point 48 — "DATABASE RLS — MANDATORY"

- **ENABLE ROW LEVEL SECURITY on ALL business-owned tables.** Explicit examples: `businesses`, `services`, `packages`, `staff_members`, `business_media`, `social_profiles`, `social_videos`, `business_locations`, `business_hours`, `booking_settings`, `website_settings`, `website_content`, `bookings`, `payments`, `referrals`, `activity`, `notifications` — and by extension every table introduced in Points 1–45 and later (customers, business_owners, business_members, referral_codes/events, website_events, balance_collections, payment_orders, business_plans, booking_status_history, booking_slot_holds, staff_* …).
- Identity tables (`profiles`) and `auth` are handled by their own policies (user-scoped).
- Note: RLS enabled does not mean everything is locked — the public website access strategy (later points) will add narrowly-scoped anon policies for public-safe reads.

**Interpretation notes (validated):**
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on every business-owned table in final SQL (mandatory, no exceptions).

### Point 49 — "BUSINESS MEMBERSHIP RLS"

- **Create helper function(s):**
  - `is_business_member(target_business_id uuid)` → bool
  - and/or `has_business_role(target_business_id uuid, allowed_roles text[])` → bool
- Use **SECURITY DEFINER carefully**.
- **Prevent recursion in RLS.**

**Interpretation notes (validated):**
- Helpers read `business_members` (Point 4) filtered by `auth.uid()`; used by every business-owned RLS policy — single source of membership truth (no per-table membership duplication).
- SECURITY DEFINER: set `search_path` explicitly, `SET search_path = public, pg_temp`; `security definer` + stable; return based on active memberships (`status='active'`); policies call these helpers — no recursion because helpers query `business_members` which has its own non-recursive policy (or is read via definer context).
- Guard: helper must not re-enter the calling table's RLS (definer bypass within helper; calling table's policy checks the result).

### Point 50 — "OWNER / ADMIN ACCESS"

- **Owner/Admin can manage ALL business-owned dashboard data** — full CRUD on all business-owned tables for members with `access_role = 'owner_admin'`.

**Interpretation notes (validated):**
- RLS: `has_business_role(business_id, ARRAY['owner_admin'])` grants all dashboard operations. Owner_admin also implied by `businesses.created_by` backfill (Point 4 decision).

### Point 51 — "MANAGER ACCESS"

- **Manager can manage operational data based on permissions** — e.g., `bookings`, `services`, `staff`, `website` — **but sensitive platform/admin settings may remain restricted**.

**Interpretation notes (validated):**
- RLS: managers get policy access to operational tables (bookings/services/staff/website content etc.); restricted from platform/admin-sensitive areas: `business_plans` entitlements, `business_members` role management (self-manage own membership?), payment/settlement internals, `booking_settings.advance_percent`, custom-domain/white-label flags (final matrix in RLS point of consolidated spec).
- Granularity: `staff_permissions` (Point 13) refines manager capability within allowed tables (permission_key checks in backend/edge layer where row-level is insufficient).

### Point 52 — "SERVICE PROVIDER ACCESS"

- **Service Provider** should only access data needed for:
  - **own/assigned bookings**
  - **assigned services**
  - **own schedule/profile** (where applicable)
- **Do NOT grant all payments/settings data by default.**

**Interpretation notes (validated):**
- RLS: `service_provider` policies scope bookings to rows where `staff_members.auth_user_id = auth.uid()` (via staff_id on the booking); services to those linked in `staff_services`; own profile/schedule only.
- Payments/settings/branding NOT included by default (opt-in via `staff_permissions`, e.g., `view_payments`).

### Point 53 — "RECEPTIONIST ACCESS"

- **Receptionist** may access:
  - **bookings**
  - **customers**
  - **schedule/frontdesk**
- **Do NOT grant branding/admin/security access by default.**

**Interpretation notes (validated):**
- RLS: `receptionist` gets bookings + customers + schedule/frontdesk tables; no access to `business_plans`, white-label/branding settings, membership/role management, or security config by default.

### Point 54 — "PUBLIC WEBSITE READ POLICIES"

- **Anonymous customers may read ONLY published public data required for website rendering:**
  - business public info
  - active services
  - active packages
  - public staff fields
  - gallery
  - social profiles/videos
  - location/hours
  - website settings necessary for rendering
  - website content
- **Never expose:**
  - commission
  - app access roles
  - permissions
  - private mobile
  - payment internals
  - business-member accounts

**Interpretation notes (validated):**
- Public-read policies must be **column-level safe**: expose only public-safe columns (e.g., staff: exclude `commission_percent`, `app_access_role`, mobile unless `hide_mobile_public=false`; bookings/payments/members: no anon access at all).
- Options for final SQL: (a) narrow anon SELECT policies per table on public-safe columns, and/or (b) a dedicated public-view schema (VIEWs) exposing only public fields — decision in consolidated spec; requirement captured as-is.
- "Published" gate: anon reads only when `website_settings.publish_status = 'published'` (draft businesses invisible publicly).

### Point 55 — "PUBLIC BOOKING WRITE SECURITY"

- **Do NOT allow the anonymous browser to freely insert arbitrary confirmed bookings/payments directly.**
- Use **secure server/API/RPC logic**.
- Public customer booking flow should call **controlled backend functions or server routes**.

**Interpretation notes (validated):**
- No `INSERT` policy on `bookings`/`payments`/`payment_orders` for `anon` (or restricted to stub rows at most — final decision).
- Booking creation flows through RPC/Edge/Express functions that: validate availability (hours/schedules/holds/settings), enforce 25% advance math, create slot hold → Razorpay order → on webhook verification → insert booking+payment atomically (security definer functions).
- This aligns with Point 32 (slot holds) and Points 33–35 (orders/payments) and the standalone server (`server.ts`) for controlled routes.

### Point 56 — "PAYMENT SECURITY"

- **Razorpay SECRET KEY must NEVER be stored in public database fields** — use **server environment/secrets**.
- The database may store:
  - `provider_order_id`
  - `provider_payment_id`
  - `amount`
  - `status`
  - `verification state`
- **Not** the Razorpay secret.

**Interpretation notes (validated):**
- Secret key lives in server env (`.env`, secrets manager); Supabase table columns never hold keys/secrets. (Also applies to Supabase `service_role` key, webhook secrets, Gemini key — secrets policy, final security review.)

### Point 57 — "CREATE PAYMENT ORDER FUNCTION"

- **Payment order creation must happen server-side.** Backend must:
  1. load booking
  2. load real service/package snapshot
  3. verify slot
  4. calculate exact 25%
  5. create Razorpay order
  6. store `payment_order`
  7. return safe checkout data

**Interpretation notes (validated):**
- Order creation never trusts client-supplied amounts: server reloads booking + service/package snapshot, re-verifies slot availability, computes 25% advance in paise, creates the Razorpay order, persists `payment_orders`, returns checkout-safe payload (no secrets).
- Implementable as Edge Function/RPC/Express route (`server.ts`); DB RPC variant recorded for consolidated spec.

### Point 58 — "PAYMENT VERIFY FUNCTION"

- **Server-side verification must:**
  1. verify Razorpay signature
  2. validate order/payment relationship
  3. verify amount
  4. mark payment verified **once**
  5. mark booking confirmed
  6. set `verified_at`
  7. prevent duplicates
  8. remove/release slot hold
  9. write activity event
- **Use transaction where possible.**

**Interpretation notes (validated):**
- End-to-end verify pipeline: signature check → order↔payment relation → amount match → idempotent state flips (`payments.payment_status='verified'`, `verification_status='verified'`, `bookings.booking_status='confirmed'`, `verified_at`) → hold release (Point 32) → `business_activity` entry — all inside a transaction (and idempotent per Point 59).

### Point 59 — "IDEMPOTENCY"

- **Critical operations must be idempotent:** website publish, payment verification, booking confirmation, balance collection, referral event creation (where applicable).
- **Repeated client calls must not create duplicates.**

**Interpretation notes (validated):**
- Mechanisms for final SQL: unique constraints on natural keys (e.g., `provider_payment_id`, `provider_order_id`, booking_reference, referral event dedupe key `(referral_code_id, visitor_token, event_type)`), conditional upserts (`INSERT ... ON CONFLICT DO NOTHING/UPDATE`), guarded state transitions (only pending→verified once), and idempotency keys for server endpoints.

### Point 60 — "BOOKING AVAILABILITY FUNCTION"

- **Create/reuse database/server logic to calculate available slots using:**
  - business hours
  - booking-day settings
  - service duration
  - buffer
  - minimum notice
  - maximum advance window
  - staff schedules
  - staff-service assignments
  - existing bookings
  - active slot holds

**Interpretation notes (validated):**
- Central slot-engine: given business_id (+ service/package, staff optional), returns free slots within the advance window, honoring all 10 inputs; layered per Points 12/18/20/21/27/32. Single source of truth for availability used by public booking flow, dashboard, and preview.

### Point 61 — "DOUBLE BOOKING PROTECTION"

- **Do not rely only on frontend availability.**
- **Before payment/order creation AND confirmation:** re-check availability on the backend.
- Use **transaction / advisory locking / exclusion logic** as appropriate to prevent double booking.

**Interpretation notes (validated):**
- Backend (RPC/Edge/server) re-validates the slot at order creation (Point 57 step 3) and at confirmation (Point 58); concurrency control via:
  - `pg_advisory_xact_lock` keyed on (business_id, staff_id, date, start_time) around booking insert,
  - and/or `EXCLUDE USING gist` on `bookings`/`booking_slot_holds` (tsrange with staff_id) — requires `btree_gist` extension,
  - re-check existing bookings + active holds inside the same transaction.
- Frontend checks are UX only, never authoritative.

### Point 62 — "WEBSITE PUBLISH FUNCTION"

- **Publishing must update existing `website_settings`:** set `publish_status = 'published'`, `published_at = now()`.
- **Do NOT duplicate business/services/staff records.**

**Interpretation notes (validated):**
- Publish = state flip on the existing row (idempotent per Point 59); NO snapshot/copy of business data at publish time — published site renders live business data gated by `publish_status` (guardrail #3: no duplicate data sources). Unpublish = flip back to draft (published_at cleared or kept — final decision in consolidated spec).

### Point 63 — "WEBSITE SLUG"

- `website_settings.slug` must be **unique**.
- Validation: **lowercase letters, numbers, hyphens. No spaces.**
- Create a **unique index**.

**Interpretation notes (validated):**
- UNIQUE index on `website_settings.slug` + CHECK constraint `slug ~ '^[a-z0-9-]+$'` (and non-empty, not starting/ending with '-' — pinned in final SQL). Slug generation & collision handling server-side (idempotent publish).

### Point 64 — "UPDATED_AT TRIGGER"

- **Create reusable trigger function `set_updated_at()`** — sets `NEW.updated_at = now()` on UPDATE.
- **Apply to ALL tables with `updated_at`.**

**Interpretation notes (validated):**
- One shared function (SECURITY INVOKER, stable) + `BEFORE UPDATE` triggers on every table that has `updated_at` (all business tables + profiles etc.). Listed explicitly in final migration 11 (functions/triggers).

### Point 65 — "CREATED USER BUSINESS BOOTSTRAP"

- **When a new business is created:**
  - create **owner membership** safely
  - optionally initialize: `booking_settings`, `contact_settings`, `website_settings`, `onboarding_progress`, `notification_settings`
- **Do not create fake service/staff data.**

**Interpretation notes (validated):**
- Trigger/RPC `handle_new_business`: inserts `businesses` + `business_members` (owner_admin — consistent with Point 4 decision) + defaults rows for the listed settings tables (all are 1:1 with business: booking_settings, contact_settings, website_settings, onboarding_progress; notification_settings for the owner user).
- Explicitly NO seeded fake services/staff/packages — only real user-created data.

### Point 66 — "DEFAULT WEBSITE TEMPLATE"

- **When business type is known, default template logically:**
  - Barber → `barber`
  - Hair / Unisex → `hair_unisex`
  - Beauty / Nail / Spa / Massage → `beauty_wellness`
- **Do NOT overwrite a user-selected template later.**

**Interpretation notes (validated):**
- `website_settings.template_id` (Point 22) initialized by business_type mapping at bootstrap; the user may change it; system never auto-overwrites a user choice (record a flag or only set default when template_id is still the system default — final SQL detail).

### Point 67 — "INDEXES"

- **Create indexes for common queries. At minimum:**
  - `services.business_id`
  - `staff_members.business_id`
  - `staff_services.staff_id`, `staff_services.service_id`
  - `bookings.business_id`, `bookings.appointment_date`, `bookings.staff_id`, `bookings.customer_id`, `bookings.booking_status`
  - `payments.business_id`, `payments.booking_id`, `payments.provider_payment_id` (note: UNIQUE already — see below)
  - `website_settings.slug` (UNIQUE — Point 63)
  - `customers(business_id + mobile)` (UNIQUE — Point 26)
  - `business_activity(business_id + created_at)`
  - `website_events(business_id + created_at)`
  - `referral_events.referral_code_id`

**Interpretation notes (validated):**
- Final index list will be generated in migration 14 (indexes/constraints); duplicates avoided where UNIQUE constraints already provide the index (provider_payment_id, slug, customers mobile pair, referral dedupe keys).

### Point 68 — "FOREIGN KEY DELETE BEHAVIOR"

- **Use sensible delete policies. Examples:**
  - business deletion → cascade business-owned configuration **if intentional**
  - service deletion → **DO NOT destroy historical booking snapshots**
  - booking deletion → generally **avoid hard delete for real records**
  - payment → **should not disappear because service changes**
  - use archive/status for operational history where appropriate

**Interpretation notes (validated):**
- FK policy design for final SQL:
  - `services.id` / `packages.id` referenced by `bookings.service_id/package_id` → **RESTRICT/SET NULL on hard delete** (but deletions are soft anyway per Point 69) — snapshots live in booking rows, so history survives.
  - `bookings.*` referenced by payments/history → no cascade from services.
  - `businesses.id` cascade: only to pure child-config tables IF intentional (settings, hours, media, content); business-owned financial records (bookings, payments, collections) → RESTRICT (must be archived/transferred first) — decision recorded.
  - Payments never cascade from catalog changes.

### Point 69 — "SOFT DELETE / ARCHIVE"

- **Prefer status/archive for:** services, packages, staff, bookings — where historical integrity matters.
- **NEVER permanently delete records referenced by financial/booking history.**

**Interpretation notes (validated):**
- Soft-delete pattern: `status` columns (services.status, packages.status, staff_members.status, bookings.booking_status) act as lifecycle/archive states ('active' → 'archived'/'inactive'/'cancelled' etc., sets pinned in final SQL) instead of DELETE. No hard DELETE for financial/history-referenced rows (enforce with RESTRICT + app-level archive flows).

### Point 70 — "CONSTRAINTS"

- **Add database constraints. Examples:**
  - `price_paise >= 0`
  - `duration_minutes > 0`
  - `commission_percent >= 0 AND <= 100`
  - `advance_percent = 25`
  - `latitude BETWEEN -90 AND 90`
  - `longitude BETWEEN -180 AND 180`
  - valid `day_of_week` 0–6
  - `remaining_paise >= 0`
- → CHECK constraints applied at table level in final SQL (plus the previously recorded ones: slug pattern, day_of_week sets, event_type sets, advance+remaining math, at-least-one-of service/package on bookings).

### Point 71 — "ENUMS OR CHECK CONSTRAINTS"

- Use **PostgreSQL enums or CHECK constraints consistently**.
- **Do not scatter arbitrary status strings without validation.**

**Interpretation notes (validated):**
- Every status/type/role field gets an enum or CHECK: booking_status (28), booking_source (29), payment_status/verification_status (35), access_role (4), media_type (14), platform sets (15/16), event_type (39/41), status fields (businesses, services, packages, staff, website publish_status, plans…). One canonical list in final SQL (migration 1 — extensions/enums + CHECKs), reused everywhere.

### Point 72 — "DATABASE TYPES FOR FRONTEND"

- After the schema is ready: **generate/update Supabase TypeScript database types** (e.g., `supabase gen types typescript` / generated `database.types.ts`).
- **Replace unnecessary `any` types in database access where practical.**

**Interpretation notes (validated):**
- Deliverable of the DB-readiness work (post-migration): typed client (Database type), typed RPCs for the functions (Points 57/58/60/62), removing `any` from DB access code. Note: current repo has no Supabase client/types yet — created during wiring phase, not now.

### Point 73 — "SERVICE LAYER"

- **Create/reuse a clean data-access/service layer.** Conceptual examples:
  - `businessService`
  - `serviceService`
  - `staffService`
  - `websiteService`
  - `bookingService`
  - `paymentService`
  - `referralService`
- **Do NOT put raw Supabase queries randomly inside every UI component if avoidable.**

**Interpretation notes (validated):**
- Architectural rule for the wiring phase: typed service modules wrap Supabase clients/RPCs; UI components consume services. Pairs with Point 72 (types) and Point 74 (screen mapping).

### Point 74 — "SCREEN DATA MAPPING"

- **Wire database readiness to existing screens:**
  - Screen 03 → `businesses` + `business_owners`
  - Screen 04 → `services` + `packages`
  - Screen 05 → `staff_members` + `staff_services` + `staff_skills` + `staff_schedules`
  - Screen 06 → `business_media`
  - Screen 07 → `social_profiles` + `social_videos`
  - Screen 08 → `business_locations` + `business_hours`
  - Screen 09 → `contact_settings` + `booking_settings` + `booking_day_settings`
  - Screen 10 → `website_settings.template_id`
  - Screen 11 → `website_settings.appearance`
  - Screen 12 → `website_content` + service descriptions
  - Screen 13 → read complete public website model
  - Screen 14 → `website_settings.slug`/publish
  - Screen 15 → `website_settings` publish status
  - Screen 16 → aggregate real business dashboard data
  - Screen 17 → edit same public website data
  - Screen 18 → `services`/`packages`
  - Screen 19 → `bookings`
  - Screen 20 → booking draft / availability / customers
  - Screen 21 → `payment_orders` + `payments`
  - Screen 22 → confirmed booking/payment read
  - Screen 23 → `payments` + `balances` + `bookings`
  - Screen 24 → `referral_codes` + `referral_events` + website settings
  - Screen 25 → business settings + access + plan + notifications

**Interpretation notes (validated):**
- Explicit proof that every screen (03–25) maps to the SAME shared tables (no screen-local copies) — feeds the final "25-screen database mapping" section of the consolidated spec. Screens 01–02 are landing/auth (profiles) — noted.

### Point 75 — "DO NOT DUPLICATE DATA"

- **CRITICAL:** Do NOT create:
  - `onboarding_services`, `dashboard_services`
  - `onboarding_staff`, `dashboard_staff`
  - `preview_business`, `published_business`
  - `temporary_public_services` (etc.)
- **One business record. One service record. One staff record.**
- **Different screens read/write the SAME records.**

**Interpretation notes (validated):**
- Restates standing guardrail #3 as a hard rule with explicit forbidden table names; enforced during final architecture review and screen mapping (Point 74). No denormalized per-surface copies at any point in the schema.

### Point 76 — "WEBSITE VIEW MODEL"

- **Create a clean query/view/function to load the complete published website**, e.g., **`get_public_website_by_slug(slug)`**.
- Return only public-safe data:
  - business
  - owner
  - services
  - packages
  - public staff
  - gallery
  - social
  - location
  - hours
  - website settings
  - website copy
  - contact settings
- **Do NOT expose private fields.**

**Interpretation notes (validated):**
- Single RPC (SECURITY DEFINER, restricted to published sites) returning a JSON aggregate or typed composite — one call renders the whole public site (perf-friendly per Point 79). Column-safe: only the public fields enumerated in Point 54; private fields (commission, roles, permissions, mobile, payment internals) excluded at the function level (not merely by RLS).

### Point 77 — "DASHBOARD OVERVIEW QUERY"

- **Create efficient query/RPC/view for Screen 16 metrics:**
  - today's bookings
  - upcoming bookings
  - month booking value
  - verified advance collected
  - service count
  - staff count
- **Do not calculate everything through dozens of frontend requests.**

**Interpretation notes (validated):**
- Single `get_dashboard_overview(business_id)` RPC: aggregates from `bookings` (counts/value by status/date), `payments` (verified advances, month), `services`/`staff_members` counts — one round-trip; member-only (has_business_role).

### Point 78 — "PAYMENTS / REVENUE QUERY"

- **Create efficient server/query logic for Screen 23:**
  - booking value
  - verified advance
  - remaining due
  - balance collected
  - refunds (if implemented)
- **Ensure no double counting.**

**Interpretation notes (validated):**
- `get_payments_revenue(business_id)` RPC: booking value = sum(service_price_paise snapshots) on non-cancelled bookings; verified advance = sum(payments where verified, join to bookings); balance collected = sum(balance_collections); remaining due = booking value − advance − balance; refunds subtract from verified advance where implemented (Point 37). Single aggregation source — no double counting (documented invariants; mirror the Point 36 reconciliation check).

### Point 79 — "PUBLIC WEBSITE CACHE READINESS"

- **Keep website reads efficient.**
- **Do not require user auth for the public published website.**
- **Public query must expose only approved fields.**

**Interpretation notes (validated):**
- Public site = anon-accessible via `get_public_website_by_slug` (no auth header); efficiency via the single RPC + indexes (slug unique index) + optional caching layer (CDN/edge or materialized cache decision in consolidated spec); approved-field guarantee enforced inside the function.

### Point 80 — "REALTIME"

- **If using Supabase Realtime, enable only where useful.** Examples:
  - bookings
  - payments / verification status
  - dashboard updates
- **Do NOT subscribe every screen to every table.**

**Interpretation notes (validated):**
- Minimal Realtime surface: `bookings` (+ status), `payments` (verification), and dashboard aggregates; topic filters for `business_id`; RLS applies to Realtime (member-only). Public website and read-only screens stay on standard queries. Final list pinned in consolidated spec (not enabled by default).

### Point 81 — "MIGRATIONS"

- **Implement database changes through migrations.**
- **Do NOT manually depend on one-off dashboard SQL only.**
- **Create migration files in correct order.**
- **Migrations must be safe to run on the existing project.**

**Interpretation notes (validated):**
- All schema changes ship as numbered, ordered migration files (e.g., `supabase/migrations/...`), idempotent/guarded (IF EXISTS / IF NOT EXISTS), replayable on the live project, preserving data (backfill before constraints). The 15-migration ordered structure is detailed in §5.25.

### Point 82 — "SEED / DEMO DATA"

- **DO NOT insert fake production business records automatically.**
- **If development seed data is needed:** put it in a separate seed/dev-only script.
- **Use Indian mock data only.**
- **Never run seed automatically in production.**

**Interpretation notes (validated):**
- No auto-seeding of businesses/services/staff on signup (Point 65 bootstrap creates only real owner + default config rows — no fake catalog). Any demo data (Indian mock names/cities, INR prices) lives in a dev-only seed script excluded from production migration path.

### Point 83 — "DATABASE ERROR HANDLING"

- **Frontend should receive simple errors**, e.g.:
  - "This website address is already taken."
  - "This time is no longer available."
  - "Payment could not be verified."
- **Do NOT expose raw PostgreSQL errors to users.**

**Interpretation notes (validated):**
- Server/RPC layer maps DB exceptions (unique_violation, check_violation, custom codes) to friendly, typed error messages; PostgreSQL error text/constraint names never reach the UI. RPCs raise with application error codes (SQLSTATE P0001 etc.) that the client translates.

### Point 84 — "TRANSACTIONS"

- **Use transactions for critical multi-step operations:**
  - payment verification
  - booking confirmation
  - publish state updates (where needed)
  - balance payment logging
- **Avoid half-completed states.**

**Interpretation notes (validated):**
- All critical multi-step writes run inside a single transaction (RPC/plpgsql `BEGIN…COMMIT`, or server-side transaction): verify-payment pipeline (Point 58), booking creation + hold release, publish flip + activity log, balance collection + reconciliation — atomic, no partial states. Idempotency (Point 59) complements this.

### Point 85 — "AUDIT / SECURITY"

- **Sensitive operations should be attributable.** Use:
  - `actor_user_id`
  - timestamps
  - status history
- **Do NOT log passwords, secret keys, or full sensitive payment data.**

**Interpretation notes (validated):**
- Attribution pattern already present: `business_activity.actor_user_id` (Point 40), `booking_status_history.changed_by` (Point 31), timestamps everywhere, `set_updated_at` (Point 64). Applied consistently to sensitive ops (payments, bookings, publish, membership changes).
- Logging discipline: application/DB logs must redact secrets and full payment payloads (e.g., log `provider_payment_id` + amount + status, never card/Razorpay signatures/keys); consistent with Point 56 (no secrets in DB).

### Point 86 — "INDIA DEFAULTS"

- **Database defaults:**
  - `currency = INR`
  - `country = India`
  - `timezone = Asia/Kolkata`
  - `money = paise`
  - `phone UI = +91` default

**Interpretation notes (validated):**
- Already aligned: `businesses.currency='INR'`, `timezone='Asia/Kolkata'`, `country_code='IN'` (Point 3); `business_locations.country='India'` (Point 17); money in paise everywhere (Point 6 rule); +91 default is an app/UI-layer default (client-side phone input), no schema change needed — recorded as app-layer convention.

### Point 87 — "FINAL SECURITY REVIEW"

- **Before completion verify:**
  1. RLS enabled (Point 48)
  2. no cross-business reads (Points 1/47/49)
  3. no public commission access (Points 54/76)
  4. no public app roles (Points 54/76)
  5. no public payment internals (Points 54/76)
  6. no exposed Razorpay secret (Point 56)
  7. no unrestricted anonymous inserts into payments (Point 55)
  8. no unrestricted confirmed booking writes (Point 55)
  9. storage isolated by business (Points 46/47)
  10. published-website public query safe (Points 76/79)

**Interpretation notes (validated):**
- This is the closing verification checklist applied during the final review phase (before presenting the consolidated spec and before/after migration); each item maps to already-recorded points.

### Point 88 — "FINAL DATABASE TEST"

- **TEST A:** Business A vs Business B — User A must NOT read/edit Business B private data.
- **TEST B:** Service created on Screen 04 appears on Screen 18 AND public website from the SAME record.
- **TEST C:** Staff created on Screen 05 appears in Staff Management AND public website from the SAME record.
- **TEST D:** Website content changed on Screen 17 → published site updates using same data.
- **TEST E:** Customer books ₹1,200 service → advance ₹300, remaining ₹900.
- **TEST F:** Payment not verified → booking must NOT become confirmed.
- **TEST G:** Payment verified → booking becomes confirmed **exactly once** (idempotency).
- **TEST H:** Confirmed booking appears on Screen 19; verified payment appears on Screen 23.
- **TEST I:** Archive a service → old booking history remains intact.
- **TEST J:** Refresh onboarding → resume from `onboarding_progress.current_step`.
- **TEST K:** Publish website → slug loads public website by the same business data.
- **TEST L:** Public visitor cannot access private staff/payment/account fields.

**Interpretation notes (validated):**
- Acceptance test suite (A–L) executed after implementation; results reported under Deliverables (Point 89 item 12). Tests B/C/D/K assert single-source-of-truth; E/G assert the 25% + idempotency; F asserts verification gating; I asserts snapshot history; J asserts auto-save/resume.

### Point 89 — "DELIVERABLES"

- **After implementation provide:**
  1. Final table list
  2. Relationship summary
  3. Migration files created
  4. RLS policies created
  5. Storage buckets/policies created
  6. Functions/RPCs created
  7. Triggers created
  8. Indexes created
  9. Updated TypeScript database types
  10. Any required environment variables
  11. Any remaining backend functions that must be deployed
  12. Test results

**Interpretation notes (validated):**
- The deliverable manifest for the implementation phase; mapped into the consolidated spec's final sections (tables/relationships/migrations/RLS/storage/functions/triggers/indexes/types/env/deployment/tests).

### Point 90 — "FINAL INSTRUCTION"

- **DO NOT JUST GIVE ME SQL IN CHAT. ACTUALLY IMPLEMENT THIS DATABASE ARCHITECTURE IN THE EXISTING NEXORA PROJECT.**
  - Preserve all working UI and current data.
  - Reuse existing tables where possible.
  - Create safe migrations where missing.
  - Enable production-grade Supabase RLS.
  - Prepare all 25 screens to use ONE shared source of truth.
- The completed project must be ready for: Onboarding, Dashboard, Website publishing, Services, Staff, Gallery, Social links/videos, Location, Booking, Razorpay 25% advance, Payment verification, Revenue, Referral, White-label, Settings, Auto-save, Resume, Multi-business isolation.
- **DO NOT CREATE DUPLICATE DATABASES OR DUPLICATE BUSINESS DATA.**

**Interpretation notes (validated):**
- Point 90 completes the 90-point collection phase and mandates real implementation (migration files in the repo, RLS, wiring readiness) rather than chat-only SQL.
- Process reconciliation (per the original workflow): after Point 90 the flow is — (1) produce the FINAL CONSOLIDATED SPECIFICATION (25 sections), (2) consistency review, (3) WAIT for user approval ("APPROVED — GENERATE FINAL SQL"), (4) generate safe ordered migrations and implement. Point 90's "actually implement" is the mandate that binds steps (4) onward; it does not override the explicit pre-SQL approval gate from the workflow. Also: **Points 81–84 missing — to be clarified before the consolidated spec is finalized.**

### Point 26 — "CUSTOMERS"

- **Create `customers`** — business-scoped customer records (anonymous/guest bookers; NOT auth users).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `full_name text not null`
  - `mobile text not null`
  - `email text`
  - `created_at timestamptz`
  - `updated_at timestamptz`
- **Unique or indexed appropriately by: `business_id + mobile`**
- **Do NOT force customer login.**

**Interpretation notes (validated):**
- Customers are guest records owned by the business (no `user_id`/auth link required; a later point may add an optional auth link, but login is never forced).
- `business_id + mobile` gets a UNIQUE constraint (one customer identity per phone per business) — "unique or indexed appropriately" → UNIQUE is the appropriate choice; indexed fallback noted.
- Feeds the booking point (Point 27): `customers` is the single customer source for bookings, dashboard, and public booking flow.

### Point 27 — "BOOKINGS"

- **Create `bookings`** — the ONE booking source (shared by dashboard, public booking flow, preview).
- Fields:
  - `id uuid` (PK)
  - `business_id uuid` (→ businesses(id))
  - `customer_id uuid` (→ customers(id))
  - `service_id uuid` **nullable** (→ services(id))
  - `package_id uuid` **nullable** (→ packages(id))
  - `staff_id uuid` **nullable** (→ staff_members(id))
  - `booking_reference text` **unique** (global unique)
  - `appointment_date date not null`
  - `start_time time not null`
  - `end_time time`
  - `service_name_snapshot text not null`
  - `service_price_paise bigint not null`
  - `duration_minutes integer`
  - `advance_paise bigint not null`
  - `remaining_paise bigint not null`
  - `customer_note text`
  - `booking_source text default 'website'`
  - `booking_status text default 'pending_payment'`
  - `payment_status text default 'pending'`
  - `balance_status text default 'due'`
  - `created_at timestamptz`
  - `updated_at timestamptz`

**Interpretation notes (validated):**
- **Snapshot pattern:** `service_name_snapshot`, `service_price_paise`, `duration_minutes` freeze the booked offer at booking time (history preserved even if the service catalog changes later) — supports guardrail "booking history is preserved".
- **25% advance concretized:** `advance_paise` + `remaining_paise` must equal `service_price_paise`; advance = 25% of total per Point 20 (backend/DB-enforced; CHECK + trigger in final SQL). `service_price_paise` is integer paise (Point 6 rule).
- `service_id`/`package_id` nullable (a booking may be for a service, a package, or a custom/off-catalog offer); at least one of service/package expected for catalog bookings — validation detail to pin in final SQL (CHECK: service_id IS NOT NULL OR package_id IS NOT NULL — recorded).
- `booking_reference` global unique (e.g., generated NXR-XXXXXX); feeds customer-facing confirmations.
- Status triples (`booking_status` / `payment_status` / `balance_status`) — value sets to be finalized by later points (booking lifecycle / payment lifecycle); defaults recorded: `pending_payment` / `pending` / `due`.
- Availability checks at creation: business_hours + staff_schedules + booking_day_settings + booking_settings (Points 12/18/20/21).
- `booking_source` tracks origin ('website' default; other sources later).
- FK tenant guards: staff_id/service_id/package_id must belong to the SAME business as the booking (composite-FK/trigger guard pattern, consistent with Points 8/10).

---

## 3. Conflicts & Decisions Log

*(Conflicts between points and the chosen resolution are recorded here — nothing silently discarded.)*

- **Point 1 vs. known-existing-schema assumption:** The brief states Nexora "already has an existing Supabase schema" (profiles, salons, services, staff, appointments, referrals, RLS, storage, auth logic, builder persistence). **Inspection of this repo found NO Supabase artifacts in the codebase** (see §4). Decision: do not assume the live schema is present in this repo; the final architecture must include a **live-schema inspection step** (introspect the actual Supabase project before generating migrations) and reuse/migrate any tables found there, preserving data. This satisfies Point 1 §0 without inventing tables.

- **Point 3 vs. existing `salons` concept:** The brief's known-existing list includes `salons`, but Point 3 prescribes the canonical tenant table `businesses`. **Decision:** `businesses` is the single tenant root. If the live DB has an existing `salons` table (or equivalent), do NOT create a parallel tenant — migrate/reuse it (safely rename/alter to `businesses`, or keep as the physical table with `businesses` as the logical model), preserve all IDs, rows, and relationships. If the live DB has nothing, create `businesses` fresh.

- **Point 4 vs. Point 3 (owner consistency):** `businesses.created_by` implies the owner, and `business_members` adds role-based access with `owner_admin`. **Decision:** during migration, backfill one `business_members` row per business (`user_id = created_by`, `access_role = 'owner_admin'`, `status = 'active'`). `created_by` remains the legacy ownership pointer; `business_members` becomes the operational access source of truth for RLS. Both stay consistent, no duplicate ownership model.

- **Point 9 vs. Point 4 (role sources):** `business_members.access_role` (Point 4) and `staff_members.app_access_role` (Point 9) both express app-permission roles. **Decision:** `business_members` remains the operational access/RLS source of truth; `staff_members.app_access_role` is the staff-record's permission field used for staff-specific convenience/permissions and MUST be kept consistent (same closed role set; sync via trigger/application write). Not a duplicate permission model — one truth, one mirror. Any future point that contradicts this is a conflict to record.

- **Point 14 vs. Point 3/5/9 (photo sources):** `business_media` (media_type `logo`/`hero`/`owner`/`staff`) vs. direct photo columns on `businesses` (`logo_url`, `hero_image_url`), `business_owners` (`photo_url`), `staff_members` (`photo_url`). **Decision:** `business_media` is the canonical media registry for uploaded images; the *_url columns remain as convenient cached pointers. Rule: every uploaded image is stored once in Storage + registered in `business_media`; the entity `*_url` columns are maintained (trigger or app write) as the display-ready URL reference to that media record. No duplicate uploads; the single source of the file is `business_media.storage_path`. Final reconciliation happens in the storage migration.

- **Point 23 vs. Point 3 (tagline duplication):** `website_content.tagline` (Point 23) vs. `businesses.tagline` (Point 3). **Decision:** `businesses.tagline` is the canonical business tagline (identity); `website_content.tagline` is accepted as the editable website-copy variant — but to avoid two live tagline sources, treat `website_content.tagline` as the *website-display* tagline that, when set, overrides `businesses.tagline` on the public site, and keep `businesses.tagline` as the default fallback. No data duplication at the storage level beyond this controlled override; final behavior pinned in the publishing/backfill migration.

- **Points 81–84 (resolved gap):** Initially skipped (80 → 85 → … → 90); user subsequently supplied Points 81–84. **Resolution:** all 90 points now received and merged; the gap is closed with no impact on the consolidated architecture (Points 81–84 added process/quality requirements: migrations, seed discipline, error handling, transactions).

---

## 4. Known Existing Nexora Schema (context, to preserve/upgrade)

### 4.1 In-repo inspection results (Point 1 §0 — performed, read-only, 2026-08-10)

| Item | Found in repo? | Details |
|---|---|---|
| Supabase client setup | ❌ No | No `@supabase/supabase-js` dependency, no client factory, no `SUPABASE_URL` / `SUPABASE_ANON_KEY` usage |
| Existing migrations / SQL | ❌ No | No `.sql` files, no `supabase/` folder, no `migrations/` |
| Existing tables / schema | ❌ No | No schema/types in code; any live tables exist only in the remote Supabase project |
| Existing auth integration | ❌ No | No auth code in `src/` or `server.ts` |
| Existing database types | ❌ No | No `database.types.ts` or generated types |
| Staff / booking / payment / website tables | ❌ No (DB) | UI components only: `StaffManagementModule.tsx`, `BookingConfirmation.tsx`, `CustomerBookingPreview.tsx`, `ShareReferralPremium.tsx`, `BrandingWhiteLabel.tsx`, `TemplateRenderer.tsx`, `PreviewPane.tsx`, `StepPublish*.tsx` — all in-memory/local today |
| Storage buckets | ❌ No | None configured in code |
| Functions / triggers | ❌ No | None; only Express API `POST /api/generate-bio` (Gemini AI) |
| RLS policies | ❌ No | None |
| Builder persistence | ⚠️ Partial | **Client-side only**: `localStorage` keys `nexora_onboarding_state` (StepPublish), `nexora_builder_state` (`STORAGE_KEY` in `App.tsx`), dashboard tab key; auto-save on step/data change. This is the existing "builder persistence" — its DB migration path is to be defined by a later point (auto-save/resume). |
| App stack | — | React 19 + Vite 6 + Tailwind v4; Express server (port 3000); 15 wizard step screens in `src/screens/` + components; project metadata references 25-screen flow & `verify-22-screens.js` |

### 4.2 Live-project inspection requirement (deferred, mandatory)

Before ANY migration is generated (post-approval), introspect the actual Supabase project:
- `information_schema` tables/columns, `pg_policies`, `storage.buckets`/`storage.objects`, enums/types, indexes, functions/triggers.
- Map every found table to the 90-point target architecture; classify as **preserve / alter / migrate / (new)**.
- Preserve current IDs and relationships; backfill before enforcing new constraints.
- Expected live-DB candidates from the brief (verify against live project — never assume): `profiles`, `salons`, `services`, `staff`, `appointments`, `referrals`, RLS policies, storage buckets, auth-related logic, existing builder persistence state.

---

## 5. FINAL CONSOLIDATED DATABASE SPECIFICATION (Points 1–90)

*Generated from ALL 90 points. Draft M01–M15 SQL now exists for local validation; no Supabase execution is approved. See `database-migrations-plan.md`.*

### 5.1 Final Table List (38 tables)

| # | Table | Source | Kind |
|---|-------|--------|------|
| 1 | `profiles` | P2 | Identity (1:1 auth.users) |
| 2 | `businesses` | P3 | Tenant root |
| 3 | `business_members` | P4 | Access/membership |
| 4 | `business_owners` | P5 | Public owner profile (1:1) |
| 5 | `services` | P6 | Catalog |
| 6 | `packages` | P7 | Catalog |
| 7 | `package_services` | P8 | Join M:N |
| 8 | `staff_members` | P9 | Staff root |
| 9 | `staff_services` | P10 | Join M:N |
| 10 | `staff_skills` | P11 | 1:N |
| 11 | `staff_schedules` | P12 | 1:N (weekly) |
| 12 | `staff_permissions` | P13 | 1:N internal |
| 13 | `business_media` | P14 | Media registry |
| 14 | `social_profiles` | P15 | 1:N |
| 15 | `social_videos` | P16 | 1:N (URLs only) |
| 16 | `business_locations` | P17 | 1:1 |
| 17 | `business_hours` | P18 | 1:N (weekly) |
| 18 | `contact_settings` | P19 | 1:1 |
| 19 | `booking_settings` | P20 | 1:1 |
| 20 | `booking_day_settings` | P21 | 1:N (weekly) |
| 21 | `website_settings` | P22 | 1:1 |
| 22 | `website_content` | P23 | 1:1 |
| 23 | `onboarding_progress` | P25 | 1:1 |
| 24 | `customers` | P26 | 1:N |
| 25 | `bookings` | P27 | Core booking |
| 26 | `booking_status_history` | P31 | Audit 1:N |
| 27 | `booking_slot_holds` | P32 | Temp 1:N |
| 28 | `payment_orders` | P33 | Razorpay orders |
| 29 | `payments` | P34 | Razorpay payments |
| 30 | `balance_collections` | P36 | Offline collections |
| 31 | `payment_refunds` | P37 | **Conditional** (only if refund backend implemented) |
| 32 | `referral_codes` | P38 | 1:1 |
| 33 | `referral_events` | P39 | 1:N funnel |
| 34 | `business_activity` | P40 | Audit 1:N |
| 35 | `website_events` | P41 | Analytics 1:N |
| 36 | `notification_settings` | P42 | 1:N per user |
| 37 | `notifications` | P43 | 1:N per user |
| 38 | `business_plans` | P44 | 1:1 entitlements |

*(Plus `auth.users` — Supabase-managed, never duplicated.)*

### 5.2 Existing Tables to Preserve

- **Live-schema inspection is step one of implementation** (Point 1 §0, §4.2). Known concepts from the brief to verify and preserve as-is wherever they exist and satisfy the model: `profiles`, `salons`, `services`, `staff`, `appointments`, `referrals`, existing RLS policies, existing storage buckets, auth-related logic, existing builder persistence (currently client-side `localStorage`).
- Preserve current IDs, rows, and relationships; no destructive drops.

### 5.3 Existing Tables to Alter

- Any live table mapping 1:1 to the final model gets **ALTER-only upgrades**: add missing columns with defaults, backfill, then add constraints (e.g., `salons` → `businesses` rename/expand if found; `profiles` +missing columns; `staff` → `staff_members` +role separation; `appointments` → `bookings` +snapshot/advance columns; `referrals` → `referral_codes`/`referral_events`).
- Never assume live schema from this repo (none present); inspect first.

### 5.4 New Tables to Create

- All tables in §5.1 not found (or not equivalently found) during live inspection — created in the ordered migrations (§5.25).

### 5.5 Relationships / Foreign Keys (summary)

- `profiles.id → auth.users(id)` (1:1)
- `businesses.created_by → profiles(id)` (owner pointer)
- `business_members.business_id → businesses(id)`; `business_members.user_id → profiles(id)`; UNIQUE(business_id, user_id)
- `business_owners / business_locations / contact_settings / booking_settings / website_settings / website_content / onboarding_progress / business_plans / referral_codes .business_id → businesses(id)` — UNIQUE (1:1)
- `business_hours / booking_day_settings / social_profiles / social_videos .business_id → businesses(id)` — UNIQUE(business_id, day_of_week/platform)
- `services / packages / staff_members / customers / business_media / bookings / payment_orders / payments / balance_collections / business_activity / website_events / notification_settings / notifications .business_id → businesses(id)` — 1:N
- `package_services.package_id → packages(id)`, `.service_id → services(id)`; UNIQUE(pair) + same-business guard
- `staff_services.staff_id → staff_members(id)`, `.service_id → services(id)`; UNIQUE(pair) + same-business guard
- `staff_skills / staff_schedules / staff_permissions .staff_id → staff_members(id)`
- `bookings.customer_id → customers(id)`; `.service_id → services(id)` (nullable); `.package_id → packages(id)` (nullable); `.staff_id → staff_members(id)` (nullable); same-business guard
- `booking_status_history.booking_id → bookings(id)`; `booking_slot_holds.business_id/service_id/staff_id`
- `payments.payment_order_id → payment_orders(id)`; `payment_orders.booking_id → bookings(id)`
- `balance_collections.booking_id → bookings(id)`; `collected_by → profiles(id)` (nullable)
- `payment_refunds.payment_id → payments(id)` (conditional)
- `referral_events.referral_code_id → referral_codes(id)`; `.source_business_id → businesses(id)`; `.referred_business_id → businesses(id)` (nullable)
- `business_activity.actor_user_id → profiles(id)` (nullable); `notification_settings.user_id / notifications.user_id → profiles(id)`

### 5.6 Enums / Check Constraints

- `booking_status`: pending_payment, confirmed, upcoming, in_progress, completed, cancelled, no_show, expired (P28)
- `booking_source`: website, dashboard, walk_in, phone, whatsapp (P29)
- `payment_status`: pending, verified, failed, refunded, partially_refunded (P35)
- `verification_status`: pending, verified, failed (P35)
- `access_role` / `app_access_role`: owner_admin, manager, service_provider, receptionist, limited_staff (P4, P9)
- `media_type`: logo, hero, gallery, owner, staff (P14)
- `social platform`: instagram, facebook, youtube (P15); `website_events.event_type`: page_view, book_now_click, whatsapp_click, call_click, directions_click, referral_badge_click (P41); `referral_events.event_type`: visit, setup_started, business_created, website_published (P39)
- `onboarding status`: in_progress, completed (P25)
- CHECKs: `price_paise >= 0`; `duration_minutes > 0`; `commission_percent BETWEEN 0 AND 100`; `advance_percent = 25`; `latitude BETWEEN -90 AND 90`; `longitude BETWEEN -180 AND 180`; `day_of_week BETWEEN 0 AND 6`; `remaining_paise >= 0`; `advance_paise + remaining_paise = service_price_paise`; bookings: `service_id IS NOT NULL OR package_id IS NOT NULL`; slug `^[a-z0-9-]+$`; template_id/appearance sets (P70, P22, P63, P27)
- One canonical enum/CHECK source (migration 01) — no scattered arbitrary strings (P71)

### 5.7 Indexes

Per P67: services.business_id; staff_members.business_id; staff_services(staff_id, service_id); bookings(business_id, appointment_date), (staff_id), (customer_id), (booking_status); payments(business_id), (booking_id), UNIQUE(provider_payment_id); payment_orders UNIQUE(provider_order_id); website_settings UNIQUE(slug); customers UNIQUE(business_id, mobile); business_activity(business_id, created_at); website_events(business_id, created_at); referral_events(referral_code_id); plus UNIQUE keys already specified (business_members pair, referral code/business, holds expiry, etc.). Generated in migration 14; duplicates avoided.

### 5.8 RLS Strategy

- **Mandatory:** `ENABLE ROW LEVEL SECURITY` on every business-owned table (P48).
- **Helpers:** `is_business_member(target_business_id)` + `has_business_role(target_business_id, allowed_roles[])` — SECURITY DEFINER, explicit search_path, no recursion (P49).
- **Role matrix:** owner_admin = full CRUD (P50); manager = operational tables per `staff_permissions` (P51); service_provider = own bookings/services/schedule/profile only (P52); receptionist = bookings/customers/schedule/frontdesk (P53); limited_staff = minimal per permissions.
- **Identity:** `profiles` user-scoped (own row).
- **Public:** narrow anon SELECT only via `get_public_website_by_slug` (published, public-safe fields, P54/76/79); `website_events` anon INSERT-only; no anon SELECT on private tables; no anon writes to bookings/payments (P55).
- **Realtime** respects RLS (P80).

### 5.9 Public Website Access Strategy

- No auth for public published site (P79). Single RPC `get_public_website_by_slug(slug)` returns the full public model (business, owner, active services/packages, public staff fields, gallery, social, location, hours, settings, copy, contact) — only published sites (`publish_status='published'`), only public-safe columns; private fields excluded inside the function (P54, P76). Public reads efficient + cache-ready (P79).

### 5.10 Auth / Membership Strategy

- Supabase Auth only — no second credential store (P2). `profiles` 1:1 via `handle_new_user` trigger. `business_members` = operational access truth (P4); `businesses.created_by` retained as ownership pointer; backfill owner_admin membership per business (P65). `staff_members.auth_user_id` links staff to logins where applicable (P9). No forced customer login (P26).

### 5.11 Storage Bucket Strategy

- Buckets: `business-media` (required), `avatars` (required), `website-assets` (optional) (P45). No video storage (P16).
- Paths business-scoped: `business-media/{business_id}/logo|hero|gallery|owners|staff/{staff_id}/...`; `avatars/{user_id}/...` (P46).
- Policies: members write only own business prefixes; anon read only public-display assets; cross-business edit/delete impossible (P47).

### 5.12 Booking Architecture

- Single `bookings` source with snapshots (`service_name_snapshot`, `service_price_paise`, `duration_minutes`, `advance_paise`, `remaining_paise`) — never rewritten by catalog changes (P27, P30).
- Layered availability: business_hours + booking_day_settings + staff_schedules + service duration + buffer + notice + advance window + existing bookings + active holds (P60).
- Flow: public booking → slot hold (P32) → server-side order creation (P57) → Razorpay → webhook verification (P58) → confirm booking + release hold; all transactional (P84), idempotent (P59), double-booking-safe via advisory locks/exclusion (P61).
- 25% advance fixed and backend-enforced (P20, P70, TEST E); status lifecycle + history (P28, P31); soft archive over hard delete (P68, P69).

### 5.13 Staff Architecture

- `staff_members` single source (P9) with `primary_role` (professional) vs `app_access_role` (internal) kept separate; `staff_services` (assignments), `staff_skills`, `staff_schedules` (weekly), `staff_permissions` (granular keys, internal-only) (P9–P13). Role mirror with `business_members` kept consistent (Conflict log).

### 5.14 Services/Packages Architecture

- `services` + `packages` catalogs + `package_services` composition (P6–P8); single source shared by all screens; `short_description` holds final AI-reviewed copy (P24); soft archive (P69).
- Phase 7.1 adds a separate global onboarding reference catalog:
  `themes → service_categories → predefined_services`. These rows are platform
  suggestions only and never replace or duplicate a business's user-owned
  `services` rows. A composite `(category_id, theme_id)` foreign key prevents
  cross-theme category/service relationships.
- Phase 7.2 extends the existing business-owned `services` rows with nullable
  `theme_id`, `category_id`, and `predefined_service_id` provenance. A composite
  `(predefined_service_id, theme_id, category_id)` FK requires an exact catalog
  match while leaving legacy/custom services safely unlinked.
- Phase 7.3 idempotently seeds the exact five Phase 2–6 catalogs: 5 themes,
  17 categories, 78 canonical predefined services, and 30 suggested mappings.
  Suggested labels/orders remain attributes of their canonical predefined row,
  including aliases where chip and canonical names differ.
- Phase 7.4 Session 1 exposes one read-only
  `get_theme_service_catalog(p_theme_id)` boundary. SQL applies the mandatory
  stable theme filter before returning that theme's categories, predefined
  services, and `is_suggested=true` relationships to the unchanged UI.
- Phase 7.4 Session 2 adds authenticated `save_predefined_services`: tenant is
  derived from `auth.uid()` membership, the full catalog chain is validated,
  and partial uniqueness on `(business_id, predefined_service_id)` makes Add
  Selected replay-safe without restricting custom NULL provenance rows.
- Phase 7.4 Session 3 adds tenant-derived saved-service refresh and mutable-field
  management. Edit cannot change catalog provenance; deactivate touches only the
  saved status; delete targets only the tenant's `services` row and never global
  theme/category/predefined records.

### 5.15 Website/Publishing Architecture

- `website_settings` (template/appearance/slug/publish_status/custom_domain/branding flags) + `website_content` (copy only) (P22, P23); default template by business_type, never overwrites user choice (P66); publish = idempotent state flip on the existing row (P62); slug unique + validated (P63); public model via RPC (P76); draft invisible publicly.

### 5.16 Razorpay Payment Architecture

- `payment_orders` + `payments`; secrets in server env only (P56); server-side create-order (P57) and verify (P58) functions; webhook verification split (payment_status vs verification_status, P34/35); idempotent, transactional, duplicate-proof (P59, P84); refunds conditional on backend implementation (P37).

### 5.17 Revenue Architecture

- Verified advance (payments) + balance collections (in-salon) + remaining due + booking value; single `get_payments_revenue` aggregation with no double counting (P36, P78); reconciliation invariant advance+collections ≤ total (P36); refunds subtract where implemented (P37).

### 5.18 Referral Architecture

- `referral_codes` (1 per business, unique code) + `referral_events` funnel (visit → setup_started → business_created → website_published) keyed by anonymous `visitor_token`; idempotent event creation (P38, P39, P59).

### 5.19 White-Label/Settings Architecture

- `business_plans` entitlements (white_label, hide_nexora_branding, custom_domain, referral_badge_can_hide) are the authoritative gate — UI cannot bypass (P44); `website_settings` branding/custom-domain flags render only what the plan allows; `contact_settings` controls public CTAs (P19).

### 5.20 Notifications/Activity Architecture

- `notification_settings` (per user per business; email/in-app default on, SMS/WhatsApp opt-in) + `notifications` (delivered feed) + `business_activity` (audit with actor_user_id + metadata JSONB) + `website_events` (anon analytics) (P40–P43); sensitive ops attributable, no secrets logged (P85).

### 5.21 Auto-Save/Resume Architecture

- `onboarding_progress` (business_id UNIQUE, current_step, last_completed_step, status) powers resume-from-last-screen (P25, TEST J); the existing `localStorage` builder state (`nexora_onboarding_state` / `nexora_builder_state`) migrates into DB-backed state (auto-save on step change); draft payload home is the JSONB strategy (§5.22).

### 5.22 JSONB Migration/Backfill Strategy

- Proposed (consistent with P25/P90 auto-save-resume): one `business_draft_state (business_id uuid PK → businesses(id), draft jsonb NOT NULL DEFAULT '{}', updated_at timestamptz)` table holds the wizard's live draft JSON; `onboarding_progress` holds step/status. Migration backfills draft rows from existing localStorage payloads where available, preserving IDs; JSONB used for flexible draft/metadata only — business facts (services, staff, settings) never live in JSONB, only in their real tables (P75).
- Backfill order: profiles → businesses/members → catalog/staff → settings → website → history tables; backfill before enforcing new constraints (P81).

### 5.23 25-Screen Database Mapping

- Screens 01–02: landing/auth → `profiles` (+ Supabase Auth)
- 03 → businesses + business_owners · 04 → services + packages · 05 → staff_members + staff_services + staff_skills + staff_schedules · 06 → business_media · 07 → social_profiles + social_videos · 08 → business_locations + business_hours · 09 → contact_settings + booking_settings + booking_day_settings · 10 → website_settings.template_id · 11 → website_settings.appearance · 12 → website_content + services.short_description · 13 → `get_public_website_by_slug` (full public model) · 14 → website_settings.slug/publish · 15 → website_settings publish status · 16 → `get_dashboard_overview` · 17 → same public website data (edit) · 18 → services/packages · 19 → bookings · 20 → draft/availability/customers · 21 → payment_orders + payments · 22 → confirmed booking/payment read · 23 → `get_payments_revenue` · 24 → referral_codes + referral_events + website settings · 25 → business settings + access + plan + notifications. (P74 — all screens share the SAME records.)

### 5.24 Security Review (pre-execution)

Checked against P87 + guardrails: RLS on all business-owned tables ✓ (P48); no cross-business reads ✓ (P1/47/49); no public commission/app-roles/private-mobile/payment internals ✓ (P54/76); no Razorpay secret in DB ✓ (P56); no unrestricted anon payment/booking writes ✓ (P55); storage business-isolated ✓ (P46/47); public query safe & auth-free ✓ (P76/79); Supabase Auth correct ✓ (P2); money INR/paise, 25% advance ✓ (P6/20/70); booking & payment history preserved ✓ (P30/31/68/69); existing data preserved via inspect-first migrations ✓ (P1/81); every screen has a DB source ✓ (§5.23); friendly errors only ✓ (P83); transactions everywhere critical ✓ (P84); no duplicate models ✓ (P75).

### 5.25 Migration Execution Order (draft, for approval)

1. **M01** extensions/enums (pgcrypto, btree_gist; all enums)
2. **M02** existing-schema inspection & safe upgrades (preserve/alter live tables)
3. **M03** membership/access: profiles, businesses, business_members, business_owners
4. **M04** services/packages: services, packages, package_services
5. **M05** staff: staff_members, staff_services, staff_skills, staff_schedules, staff_permissions
6. **M06** media/social/location: business_media, social_profiles, social_videos, business_locations, business_hours
7. **M07** website/onboarding: website_settings, website_content, onboarding_progress, business_draft_state
8. **M08** customers/bookings: customers, bookings, booking_status_history, booking_slot_holds
9. **M09** payments: payment_orders, payments, balance_collections, payment_refunds (conditional)
10. **M10** referrals/notifications/activity: referral_codes, referral_events, notification_settings, notifications, business_activity, website_events, business_plans
11. **M11** functions/triggers: set_updated_at, handle_new_user, handle_new_business, is_business_member, has_business_role, availability, create_order, verify_payment, publish, dashboard/revenue RPCs, status-history & snapshot guards, same-business guards
12. **M12** RLS policies (all tables + helpers)
13. **M13** storage buckets + policies
14. **M14** indexes/constraints (final CHECKs, UNIQUEs, indexes)
15. **M15** backfill/data migration (localStorage → DB, owner memberships, defaults) — dev seed script separate (P82)
16. **M16** Phase 7.1 global theme/service reference architecture (themes, categories, predefined services; no dataset seed)
17. **M17** Phase 7.2 nullable catalog provenance on existing business-owned saved services
18. **M18** Phase 7.3 exact, generated, idempotent five-theme catalog seed
19. **M19** Phase 7.4 Session 1 mandatory theme-filtered catalog read RPC
20. **M20** Phase 7.4 Session 2 authenticated, tenant-derived, idempotent predefined-service saving
21. **M21** Phase 7.4 Session 3 tenant-scoped refresh/edit/status/delete management

**Execution gate:** M01–M21 are checked in as DRAFT ordered files (P81), but M02 is not final. Read-only live Supabase introspection → regenerate M02/adapt downstream files → separate execution approval → ordered apply (P90) → report per P89.
