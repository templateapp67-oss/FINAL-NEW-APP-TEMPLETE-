# Gaps Analysis — Blocked External Repositories

**Generated:** 24 August 2026  
**Source of truth:** this Template App checkout (`templateapp67-oss/FINAL-NEW-APP-TEMPLETE-`) plus the Phase 1-A / Phase 2–3 canonical schema (M28–M46).  
**Related verification:** Phase 20–21 main-surface verification and PR **#97** (Main Website, Job Portal, Beauty Shop, Template App).  
**This document does not claim those three apps were cloned or typechecked here.**

## Why these apps are BLOCKED

The Phase 20–21 verification matrix treats four in-family surfaces as verified. Three **external** product apps remain **BLOCKED** because they live in other GitHub organizations and were **not cloneable / writable** from this workspace:

| App | Expected repository | Role in the platform | Matrix status |
|---|---|---|---|
| Owner PWA | `promptaivideo4-coder/PINK-NEXORA-AAP-` | Salon owner operations (dashboard, location, publish, bookings) | **BLOCKED — no clone/write access** |
| Growth Partner PWA | `diamondpeomotion-cyber/pink-growth-partner-aap-` | Referral / commission / partner onboarding | **BLOCKED — no clone/write access** |
| Customer PWA | `freewebsite859-sudo/custmer-Fresh-app-` | Customer account, nearby search, bookings, history | **BLOCKED — no clone/write access** |

Until a developer can clone those repos (or receive a mirror), **no honest ✅** can be recorded for them. This document is the work that *can* be completed now: a complete gap map, a patch application manifest, and the exact commands that convert BLOCKED → verified once access exists.

Verified in-family surfaces (do **not** re-architect):

| Surface | Status after Phase 20–21 / PR #97 |
|---|---|
| Main Website | Verified |
| Job Portal | Verified |
| Beauty Shop | Verified |
| Template App (this repo) | Verified in-repo |

---

## Shared canonical contracts (do not invent a second stack)

All three blocked apps **must** attach to the **same** Supabase project and the **same** identity / location / publish model already used by this Template App and the Main Website.

### Auth contract (required)

| Rule | Canonical implementation (Template App) | Typical blocked-app failure |
|---|---|---|
| One Auth project | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` only | Hardcoded keys, `NEXT_PUBLIC_*` only, or a second project |
| Never ship service role to the browser | `SUPABASE_SERVICE_ROLE_KEY` is server-only | Service role in a PWA `.env` |
| Session persistence | `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`, `flowType: 'pkce'` | Implicit flow, no persist, or memory-only sessions |
| Storage key | `nexora.auth.<projectRef>` (`NEXORA_AUTH_STORAGE_KEY`) | Default `sb-<ref>-auth-token` **or** a different custom key → sessions do not survive reloads / do not share with other Nexora surfaces on the same origin |
| Profile / role | `profiles.platform_role` ∈ `customer \| business_user \| growth_partner \| delivery_partner \| admin` | App-local `role` table, `user_metadata.role` as authority, or `admin` self-assign |
| Tenant membership | `organization_members.role` ∈ `owner \| staff` via `auth.users → organization_members → organizations → salons` | Hardcoded salon id, `job_salon_members` used as ownership |
| Signup metadata | Owner signup sends `signup_role: 'business_user'` (admin cannot be self-assigned) | Customer/partner apps sending `business_user`/`admin` |
| Redirects | Stable `VITE_AUTH_REDIRECT_ORIGIN` — never localhost or a preview host in production | Missing redirect allowlist → email confirm / OAuth / recovery fails |

### Location authority (required)

Canonical table is **`public.business_locations`**, keyed by **`salon_id` (PK → `salons.id`)**:

- Columns: `address_label`, `latitude`, `longitude`, `approval_status` (`pending` / `approved` / `rejected`), `submitted_by` / `submitted_at`, `approved_by` / `approved_at`, `rejection_reason`, `created_at` / `updated_at`
- Public nearby search may read **only** `approval_status = 'approved'` rows
- **Do not** write coordinates onto invented `salons.latitude` / `salons.longitude` columns
- **Do not** use the Design-A `business_locations(business_id)` shape from M01–M27

### Publishing / slug (required)

Reuse Phase 1-A / M44–M45 only:

- `publish_owner_salon_website`
- `private.nexora_allocate_business_slug`
- Public resolve only when `salon_public_websites.is_published = true`

Do **not** add a second slug table or a client-invented published URL.

---

## 1. Owner app — `promptaivideo4-coder/PINK-NEXORA-AAP-`

### 1.1 Auth contract gaps

| Gap | Why it blocks the matrix | Expected fix |
|---|---|---|
| Cannot prove the PWA uses the **same** project URL + **anon** key as Template / Main Website | Cross-app login and owner RPCs (`owner_salon_ids`, `publish_owner_salon_website`) fail or hit the wrong project | Apply `auth-integration.patch` + `supabase-integration.patch` |
| Session storage key likely still default `sb-*-auth-token` | Owner session does not persist across reloads; cannot share a session with Template if they are ever same-origin | Set `storageKey` to `nexora.auth.<projectRef>` and PKCE |
| `signup_role` / `platform_role` not forced to `business_user` | Owners land as `customer` and `organization_members` never get `role='owner'` | `phase6-unified-auth.patch` + `handle_new_user` metadata |
| Token “sharing” via localStorage copy or query string | Security failure and stale JWTs | Use Supabase session only; never mint or copy access tokens |
| Auth redirect origin not documented | Confirmation / OAuth / recovery emails bounce to the Template origin | `VITE_AUTH_REDIRECT_ORIGIN` = Owner PWA production origin |

### 1.2 Location authority & RLS gaps

| Gap | Impact |
|---|---|
| Owner map may still write `salons.address` / invented lat-lng columns | 42703 at runtime; pin never appears in nearby search |
| Missing `approval_status='pending'` on owner upsert | Public catalog can leak unreviewed coordinates |
| RLS: owner UPDATE/INSERT on `business_locations` must be limited to `salon_id IN owner_salon_ids()` | Cross-tenant pin overwrite |
| Public SELECT must be `approved` only | Customer/nearby apps would see drafts |
| Must not use `job_salon_members` as the owner check | Staff could mutate location / publish |

### 1.3 Environment / origin gaps

Owner `.env.example` is expected to be missing (or incomplete for) these **required** values. This Template App’s `.env.example` also does **not** yet list the cross-app origin names — they must be added in each target repo:

| Variable | Required for Owner | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Shared project |
| `VITE_SUPABASE_ANON_KEY` | Yes | Publishable key only |
| `VITE_AUTH_REDIRECT_ORIGIN` | Yes | Owner production origin |
| `NEXORA_OWNER_PWA_ORIGIN` | Yes | Used by API CORS / email deep links |
| `NEXORA_CUSTOMER_PWA_ORIGIN` | Yes | Deep-link “view live site / customer booking” |
| `NEXORA_GROWTH_PARTNER_PWA_ORIGIN` | Optional but recommended | Partner invite links |
| `NEXORA_MAIN_WEBSITE_ORIGIN` | Recommended | Marketing / login handoff |
| `NEXORA_TEMPLATE_APP_ORIGIN` | Recommended | Builder handoff |
| `ALLOWED_API_ORIGINS` | Yes if Owner calls Template/API host | Must include Owner origin |
| `APP_ORIGIN` | Yes | Owner origin |
| `NEXORA_BASE_HOST` | If public sites are subdomains | Must match `brandConfig.platform.websiteUrl` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only if Owner has an API** | Never `VITE_` |
| Razorpay keys | Later phase | Do **not** block publish-readiness |

### 1.4 Likely TypeScript / lint failures after clone

These are the errors that historically appear when an older Owner PWA is pointed at the canonical schema:

- `Property 'business_id' does not exist` on location / booking types — must be `salon_id`
- `Cannot find name 'owner_salon_ids'` or calls to Design-A RPCs (`publish_business_website`, `is_business_member`)
- `platform_role` missing on `profiles` select lists
- Implicit `any` on `Session` if `@supabase/supabase-js` is pinned too old for PKCE types
- Next.js vs Vite env: `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` unused after Vite migration
- `tsc` failing because `strictNullChecks` meets `supabase` possibly `null`

### 1.5 Actionable implementation manifest (Owner)

When write access exists, apply patches **in this order**. Do not invent a second auth client.

1. **Inventory**
   ```bash
   git clone git@github.com:promptaivideo4-coder/PINK-NEXORA-AAP-.git owner-pwa
   cd owner-pwa
   git status
   test -f .env.example && cat .env.example
   rg -n "createClient|service_role|localStorage|business_id|owner_salon" --glob '!node_modules' | head
   ```
2. **Apply integration patches** (from the shared `integration-packages/` tree once it is on disk next to the clone):
   ```bash
   git apply --check ../integration-packages/owner/auth-integration.patch
   git apply ../integration-packages/owner/auth-integration.patch
   git apply ../integration-packages/owner/phase6-unified-auth.patch
   git apply ../integration-packages/owner/supabase-integration.patch
   ```
   If a patch fails, stop and rebase — **do not** hand-merge a second Supabase client.
3. **Align client options** with Template `src/lib/supabaseClient.ts`:
   - PKCE + persist + auto refresh + `storageKey = nexora.auth.<ref>`
   - Header `x-nexora-client: owner-pwa`
4. **Align ownership** with `resolveOwnerSalonId()` / `owner_salon_ids()`.
5. **Align location writes** with `salonLocationService.ts` (`business_locations` + pending approval).
6. **Publish** only through `publish_owner_salon_website` after `evaluatePublishReadiness` (this Template App). Incomplete businesses must not flip `is_published`.
7. **Env**
   ```bash
   cp .env.example .env.local
   # set URL, ANON, VITE_AUTH_REDIRECT_ORIGIN, NEXORA_OWNER_PWA_ORIGIN,
   # NEXORA_CUSTOMER_PWA_ORIGIN, ALLOWED_API_ORIGINS
   ```

---

## 2. Growth Partner app — `diamondpeomotion-cyber/pink-growth-partner-aap-`

### 2.1 Auth contract gaps

| Gap | Why it blocks | Expected fix |
|---|---|---|
| Partner signup not mapping to `profiles.platform_role = 'growth_partner'` | User can sign in but commission RPCs / RLS reject (`42501`) | `phase6-unified-auth.patch` sets `signup_role: 'growth_partner'` |
| Treating partners as `organization_members.owner` | Partners would see / mutate salons | Partners are **platform** role only; they are not salon owners |
| Separate auth project or implicit flow | Session mismatch with Main Website partner portal | Same URL + anon key + PKCE + `nexora.auth.<ref>` |
| Token sharing via custom cookies across mismatched domains | Silent login failure | Same-site cookie only if origins are designed as siblings; otherwise independent sessions on the same Auth users table |

### 2.2 Location authority & RLS gaps

| Gap | Impact |
|---|---|
| Partner UI reading **all** `business_locations` | Leaks pending pins and unpublished salons |
| Partner writes to `salons` / `business_locations` | Must be denied by RLS |
| Commission tables still keyed by Design-A `business_id` | Inserts fail against `growth_partner_commissions.salon_id` (RESTRICT FK) |
| Missing grant: authenticated SELECT on **approved** public projection only | Empty marketplace for attributed salons |

Partners may **read** approved public salon/location rows used for attribution. They must **never** approve locations or publish websites.

### 2.3 Environment / origin gaps

| Variable | Required for Growth Partner |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Yes |
| `VITE_AUTH_REDIRECT_ORIGIN` | Yes — partner production origin |
| `NEXORA_GROWTH_PARTNER_PWA_ORIGIN` | Yes |
| `NEXORA_OWNER_PWA_ORIGIN` | Invite / “open owner setup” links |
| `NEXORA_CUSTOMER_PWA_ORIGIN` | Optional referral landing |
| `NEXORA_MAIN_WEBSITE_ORIGIN` | Partner marketing site |
| `ALLOWED_API_ORIGINS` | Must include partner origin if it calls shared APIs |

### 2.4 Likely TypeScript / lint failures

- `PlatformRole` union missing `'growth_partner'`
- Imports of `growth_partners` table that M28+ never created as a second identity store (`profiles` is identity)
- Commission payload still typed with `business_id`
- Unused `any` on JWT `app_metadata`
- Next/Expo env prefix mismatch (`EXPO_PUBLIC_` vs `VITE_`)

### 2.5 Actionable implementation manifest (Growth Partner)

```bash
git clone git@github.com:diamondpeomotion-cyber/pink-growth-partner-aap-.git growth-partner-pwa
cd growth-partner-pwa
git apply --check ../integration-packages/growth-partner/auth-integration.patch
git apply ../integration-packages/growth-partner/auth-integration.patch
git apply ../integration-packages/growth-partner/phase6-unified-auth.patch
git apply ../integration-packages/growth-partner/supabase-integration.patch
```

Checklist after apply:

1. Signup metadata `signup_role: 'growth_partner'` only.
2. Every query that needs “my attributed salons” goes through existing commission / referral RPCs — **not** `owner_salon_ids()`.
3. Location reads: `business_locations` + `approval_status = 'approved'` only.
4. No `publish_owner_salon_website` execute grant in the partner client.
5. Fill `.env.example` with the origin variables above.

---

## 3. Customer app — `freewebsite859-sudo/custmer-Fresh-app-`

### 3.1 Auth contract gaps

| Gap | Why it blocks | Expected fix |
|---|---|---|
| Guest-only booking with no `profiles` row | “My bookings” cannot be durable across devices | `auth-integration.patch` + customer signup `signup_role: 'customer'` |
| Session not persisted / not PKCE | iOS PWA / Android WebView drop the user on resume | Match Template client options |
| Using Owner/Template `signup_role: 'business_user'` | Customers accidentally provision empty salons | Force `customer` |
| Sharing owner JWT into the customer WebView | Privilege confusion | Separate origins + independent sessions |
| Confirmation emails pointing at Owner/Template origin | User lands in the builder, not “My bookings” | `VITE_AUTH_REDIRECT_ORIGIN` + `NEXORA_CUSTOMER_PWA_ORIGIN` |

### 3.2 Location authority & RLS gaps

| Gap | Impact |
|---|---|
| Nearby search reading `salons` lat/lng that do not exist | Empty map / 42703 |
| Nearby search ignoring `approval_status` | Unapproved pins leak |
| Customer UPDATE on `business_locations` | Must be denied |
| Anon SELECT too wide on `salon_public_websites` | Unpublished drafts leak — M46 requires `is_published = true` |
| Booking insert from the browser into `bookings` | Must go through server RPCs (`create_authoritative_customer_booking` or guest `create_website_booking`) |

### 3.3 Environment / origin gaps

| Variable | Required for Customer |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Yes |
| `VITE_AUTH_REDIRECT_ORIGIN` | Yes — customer production origin |
| `NEXORA_CUSTOMER_PWA_ORIGIN` | Yes — this is the name other apps must allowlist |
| `NEXORA_OWNER_PWA_ORIGIN` | Optional “managed by” links |
| `NEXORA_BASE_HOST` | Public salon host if customer opens published sites |
| `ALLOWED_API_ORIGINS` | Must include customer origin for booking/payment APIs |
| `APP_ORIGIN` | Customer origin |
| Razorpay (later) | Out of scope for this publish-prep / access-blocked phase |

This Template App’s checked-in `.env.example` currently documents `APP_ORIGIN` / `ALLOWED_API_ORIGINS` but **does not yet name** `NEXORA_CUSTOMER_PWA_ORIGIN`. That name is a **cross-app contract** the blocked PWAs (and later this repo) must add so CORS and auth redirects stay consistent.

### 3.4 Likely TypeScript / lint failures

- `create_website_booking` / `create_authoritative_customer_booking` argument names (`p_salon_id` vs `business_id`)
- Customer types still importing Design-A `customers` table (identity is `auth.users` + `profiles`)
- `PaymentRecord` localStorage types treated as server truth
- Missing `approval_status` on location DTO
- `next` / Expo Router vs Vite path types for `/auth/callback`

### 3.5 Actionable implementation manifest (Customer)

```bash
git clone git@github.com:freewebsite859-sudo/custmer-Fresh-app-.git customer-pwa
cd customer-pwa
git apply --check ../integration-packages/customer/auth-integration.patch
git apply ../integration-packages/customer/auth-integration.patch
git apply ../integration-packages/customer/phase6-unified-auth.patch
git apply ../integration-packages/customer/supabase-integration.patch
```

Checklist after apply:

1. Anon key only; PKCE; `nexora.auth.<ref>`.
2. Signup `signup_role: 'customer'`.
3. Nearby = approved `business_locations` + published `salon_public_websites` only (same as `nearbySalons.ts`).
4. Bookings via existing server RPCs — do not add a fourth bookings table.
5. “My bookings” must read authorized server rows, not only `localStorage`.
6. Document `NEXORA_CUSTOMER_PWA_ORIGIN` in `.env.example`.

---

## 4. Patch map (integration-packages)

When the integration pack is available, expected layout:

```
integration-packages/
  owner/
    auth-integration.patch          # Supabase browser client, PKCE, storage key
    phase6-unified-auth.patch       # platform_role + signup_role + redirects
    supabase-integration.patch      # salon_id location, owner_salon_ids, publish RPC
  growth-partner/
    auth-integration.patch
    phase6-unified-auth.patch
    supabase-integration.patch      # commissions.salon_id, approved location reads
  customer/
    auth-integration.patch
    phase6-unified-auth.patch
    supabase-integration.patch      # nearby + published slug + booking RPCs
```

Apply rule: **`git apply --check` first**. If it fails, the target repo drifted — rebase the patch; do not create a parallel client.

Reference implementations already in **this** repo (copy behavior, not a second architecture):

| Concern | File |
|---|---|
| Browser client | `src/lib/supabaseClient.ts` |
| Auth API | `src/lib/useAuth.ts`, `src/lib/authRedirect.ts` |
| Owner resolution | `src/lib/ownerSalon.ts` |
| Location | `src/lib/salonLocationService.ts`, `src/lib/nearbySalons.ts` |
| Publish | `src/lib/salonWebsiteService.ts`, `src/lib/publishReadiness.ts` |
| Env template | `.env.example` |

---

## 5. Verification readiness (BLOCKED → ✅)

Nothing in this section can run until clone + write access exists. When it does, use **one recipe per app**. Prefer the repo’s own script names if they exist; otherwise these are the required gates.

### 5.1 Common bootstrap

```bash
# 1. Access
gh auth status
git clone <repo-url> && cd <app>

# 2. Branch (do not invent a second mainline)
git checkout -b fix/phase-20-21-unblocked-gaps

# 3. Install (lockfile-faithful)
npm ci || npm install

# 4. Env
cp .env.example .env.local
# Fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_AUTH_REDIRECT_ORIGIN,
# NEXORA_*_PWA_ORIGIN, ALLOWED_API_ORIGINS from the shared project
# (qwaehqsmodekbgvnaavz). Never paste the service_role key into a VITE_ var.
```

### 5.2 Quality gates (must all be green)

Run in this order. Record stdout in the matrix.

```bash
# Types — some repos name this typecheck, some lint=tsc
npm run typecheck || npm run lint

# Production build (must fail closed without real URL + anon key)
npm run build

# App-specific suites if present
npm test || true
```

Owner extra (once patches land):

```bash
npm run typecheck
npm run build
# if scripts exist:
npm run test:owner-publish-flow
npm run test:publish-readiness
```

Customer extra:

```bash
npm run typecheck
npm run build
# booking/nearby smoke if present — do not add a new booking schema
```

Growth Partner extra:

```bash
npm run typecheck
npm run build
# commission/role tests if present
```

### 5.3 Manual smoke (required before flipping the matrix)

| Check | Owner | Growth Partner | Customer |
|---|---|---|---|
| Sign up → `profiles.platform_role` correct | `business_user` | `growth_partner` | `customer` |
| Reload keeps session (`nexora.auth.*` key) | Yes | Yes | Yes |
| Service role absent from bundle | `rg service_role dist` empty | same | same |
| Location write | pending `business_locations` row for **own** salon | write denied | write denied |
| Nearby / public pin | only after approval | approved only | approved only |
| Publish | existing RPC + readiness gate | execute denied | execute denied |
| Cross-origin API | Owner origin in `ALLOWED_API_ORIGINS` | partner origin | `NEXORA_CUSTOMER_PWA_ORIGIN` |

### 5.4 Matrix conversion rule

A cell may move from **BLOCKED** to **✅** only when **all** of the following are true and attached to the verification note:

1. Repo cloned with documented SHA.
2. The three patches applied (or equivalent diff reviewed against this contract).
3. `npm ci` succeeded.
4. `npm run typecheck` **or** `npm run lint` (`tsc --noEmit`) exited 0.
5. `npm run build` exited 0 against the **real** shared project URL + anon key (no placeholders).
6. Smoke table above signed off.
7. No second Auth project, no second location table, no second publish/slug architecture.

If clone/write is still denied, the cell **stays BLOCKED**. Do not mark it partial-green from this Template App alone.

---

## 6. What this workspace could and could not prove

| Claim | Evidence |
|---|---|
| Template App auth client, location authority, publish RPC, and `.env.example` exist | This checkout |
| Canonical roles and `business_locations` shape | M28–M38 / `docs/database-gaps-analysis.md` |
| Phase 20–21 in-family apps verified | PR #97 context supplied by the task |
| Owner / Growth Partner / Customer source, `tsc`, or build | **Not available — repos unreachable** |
| Live RLS grants on the shared project for those PWAs | **EXTERNAL** — needs Dashboard / clone |

---

## 7. Recommended next human actions

1. Grant this agent (or a developer) **read+write** on the three GitHub repos.
2. Place `integration-packages/{owner,growth-partner,customer}/*.patch` next to the clones (or vendor them into a private pack).
3. Run §5 per app on a dedicated branch.
4. Add the missing origin names (`NEXORA_CUSTOMER_PWA_ORIGIN`, `NEXORA_OWNER_PWA_ORIGIN`, `NEXORA_GROWTH_PARTNER_PWA_ORIGIN`) to **each** `.env.example`, then allowlist those origins on the shared API host.
5. Only then update the Phase 20–21 verification matrix from BLOCKED → ✅.

**Overall classification for the three apps today:** **BLOCKED / not verifiable**. The gaps and the fix path are documented; the code changes belong in those repositories, not in a second architecture inside the Template App.
