# Phase 17.1 — Salon Owner Dashboard (Foundation)

> Status: **COMPLETE** (2026-08-17, session `arena/01a00df7-new-tamplete-app`).
> Scope: the FOUNDATION and NAVIGATION of the Salon Owner Dashboard over the
> EXISTING authentication and salon-ownership architecture. Phases 10–16 are
> preserved untouched. Appointment lists, customer management, revenue
> calculations, calendar logic and notification delivery are **deliberately
> not implemented** — they belong to 17.2+.

## 1. Audit performed first

| Area | Finding |
|------|---------|
| **Ownership** | `src/lib/ownerSalon.ts` already implements the project's ownership rule: `auth.users.id → organization_members (role='owner', status='active') → organization_members.organization_id → salons.organization_id → salons.id (deleted_at is null)`, preferring the existing DB helper `nexora_owner_salon_ids()` and falling back to the equivalent join. It never hardcodes a salon id and never picks "the first row". |
| **`job_salon_members`** | A staff/employee relationship. Not used for ownership anywhere in the repo — and not used here. Verified by an automated test that strips comments before scanning. |
| **Auth** | `src/lib/useAuth.ts` — one thin Supabase Auth wrapper (email/password session). No second auth system was introduced. |
| **Existing owner surfaces** | 14.6 gallery management, 14.7 gallery approval, 15.6 video management and 16.7 booking management all resolve the actor with the same `useAuth` + `resolveOwnerSalonId` chain. 17.1 follows that precedent exactly. |
| **Existing dashboard** | ONE post-launch dashboard exists: `src/screens/Landing.tsx` (screens 18–25, tabs overview/website/services/bookings/staff/payments/share/settings/referral/branding) driven by `App.tsx` `activeModule === 'dashboard'`. It is **untouched**; the owner dashboard is a sibling module in the same chrome, not a replacement or a copy. |
| **Database** | `supabase/migrations/M01–M27` remain **UNAPPLIED drafts**. The only `public.salons` columns known to exist live are the ones the app already reads: `id, name, slug, address, city, latitude, longitude, is_active, location_confirmed, location_confirmed_at, organization_id, deleted_at`. 17.1 therefore performs **read-only** access using a subset of those and **adds no migration, table, column, RPC or RLS change**. |
| **Design system** | Reused: `useSiteLocale` / `useSiteAppearance` (the same EN/HI + light/dark preference bus the website chrome uses, `siteNavigation.ts` events), Tailwind utilities, `lucide-react` icons, the namespaced-i18n-file convention, and the panel/card/skeleton/denial-card patterns from 16.7. |

## 2. What landed

| File | Role |
|------|------|
| `src/lib/ownerDashboard.ts` | The single source of truth for the dashboard: the seven-section registry, section normalization/persistence (UI preference only), the access model (`OwnerDashboardAccess`), and `loadOwnerDashboardContext()` — session → **existing** `resolveOwnerSalonId()` → one read of the owner's own `salons` row. |
| `src/lib/ownerDashboardI18n.ts` | EN/हिन्दी copy for the shell, all seven sections, placeholders, and every loading/empty/error/refusal message. English fallback for any gap; refusal copy never mentions SQL, tables or error codes. |
| `src/components/OwnerDashboard.tsx` | The shell: desktop sidebar / tablet icon rail / mobile pills + drawer navigation, section headings, the Overview foundation card (real salon fields only), placeholder bodies for the six data sections, and the loading / empty / error+retry / unauthorized states. Light + dark palettes, EN/HI toggles. |
| `src/App.tsx` | New module `owner-dashboard` (screen 26) in the existing module switcher. Mounts `<OwnerDashboard />` with **no props** — nothing about salon identity crosses that boundary. |
| `src/components/TopBar.tsx` | Screen 26 added to the universal navigator (new "OWNER DASHBOARD (26)" group) plus an "Owner" button in the module switcher and the mobile module cycle. Screens 1–25 are unchanged. |
| `scripts/test-phase-17.1.mjs` | 56-test acceptance suite (`npm run test:phase-17.1`). |
| `scripts/test-phase-16.10.mjs` | One-line additive change: the new UI-preference storage key joins the known-store allowlist so the 16.10 hygiene scan stays truthful. |

## 3. Ownership & isolation guarantees

```
auth.users.id
  → organization_members.user_id      (role = 'owner', status = 'active')
  → organization_members.organization_id
  → salons.organization_id
  → salons.id                          (deleted_at is null)
```

- Resolution happens **only** inside `loadOwnerDashboardContext()`, which calls
  the existing `resolveOwnerSalonId()`. The dashboard does not re-implement the
  membership query and does not query `job_salon_members`.
- There is **no salon-id prop, URL param, storage key or input** anywhere in the
  component tree — a user cannot ask for another salon.
- The single salon read is `.eq('id', sessionResolvedId).is('deleted_at', null)`
  over `id, name, slug, address, city, is_active`. RLS remains the real
  boundary; this filter only expresses the same intent.
- Any non-`authorized` access returns `{ salon: null }`, so an unauthorized
  viewer receives **no salon data at all** — not even a name. Verified in tests.
- More than one owned salon → `ambiguous` refusal. One is never picked
  arbitrarily.

## 4. Dashboard structure (17.1 deliverable)

| Section | Status in 17.1 |
|---------|----------------|
| Overview | Structure **+** real salon identity card (name, location, website address, live/inactive) sourced from the owner's own `salons` row, plus a section index. |
| Today's Appointments | Structure + navigation + placeholder. No appointment logic. |
| Upcoming Appointments | Structure + navigation + placeholder. No appointment logic. |
| Customers | Structure + navigation + placeholder. No customer logic. |
| Revenue / Payments | Structure + navigation + placeholder. No amounts, no calculations. |
| Calendar | Structure + navigation + placeholder. No calendar logic. |
| Notifications | Structure + navigation + placeholder. No notification delivery. |

No counts, currency amounts, ratings, customer names or booking rows appear
anywhere — consistent with the repo's "never invent business facts" guardrail.
Missing salon fields render "Not added yet" / "अभी नहीं जोड़ा गया".

## 5. States

- **Loading** — skeleton cards + polite live region while the session/ownership
  chain resolves (never a bare spinner, never a flash of denial).
- **Unauthorized** — a refusal card (`role="alert"`) per access reason: not
  logged in, no linked salon, more than one salon, permission denied, backend
  unavailable. Retry is offered **only** for transient failures (`error`,
  `permission-denied`).
- **Error** — error card with a working Retry that re-runs the whole chain; a
  rejected loader degrades to this state instead of crashing.
- **Empty** — a shared empty-state block ready for the data sections in 17.2+.

## 6. Responsive · i18n · theming

- **Desktop (lg+)** full labelled sidebar · **Tablet (md)** 64px icon rail with
  `title` + `sr-only` labels · **Mobile (<md)** horizontal section pills plus a
  slide-over drawer. Content column scrolls independently, capped at `max-w-6xl`,
  cards reflow 1 → 2 → 3 columns.
- **EN/HI** via the existing `siteNavigation` locale bus — switching the locale
  repaints nav, headings, placeholders and refusals live.
- **Light/Dark** via the existing appearance bus; every surface (shell, header,
  sidebar, cards, refusal card) has explicit tokens in both modes.

## 7. Verification

```bash
npm run lint                 # 0 errors
node verify-22-screens.js    # 25/25 verified (screens 1–25 unchanged)
npm run test:phase-17.1      # 56/56 passed
```

Regression check on earlier phases (all green):
`test:phase-10.1` 80/80 · `10.6` 107/107 · `11.8` 450/450 · `12.1` 84/84 ·
`14.6` 26/26 · `15.6` 34/34 · `16.7` 39/39 · `16.9` 47/47 · `16.10` 68/68.

## 8. Explicitly out of scope (17.2 and later)

Appointment lists (today/upcoming), customer management, revenue and payment
calculations, calendar rendering/logic, notification generation and delivery,
and any database migration. 17.1 stops at the foundation.
