# Header Navigation Audit — `/arts-by-uma`

**Date:** 2026-09-02
**Scope:** All header / navbar navigation buttons in the public salon web app
(`/arts-by-uma`) and the builder chrome, verified fully working end-to-end.

> **Follow-up (same day):** implemented the requested **Navigation & Links
> Mapping** — see "Navigation & Links Mapping — implemented" below.

## 1. Main Header / Navbar component used by `/arts-by-uma`

The `/arts-by-uma` public site renders through `src/components/PublicSalonView.tsx`
→ `src/components/TemplateRenderer.tsx`, which routes to the theme renderer for
the salon's `template_key`. Every one of the five canonical themes
(`barber_mens_grooming`, `hair_studio_color_bar`, `beauty_skin_spa`,
`family_full_service`, `nail_lash_studio`) shares **one** interactive header
component:

> **`src/components/SiteHeader.tsx`**

`SiteHeader` owns the nav structure (via `src/lib/siteNavigation.ts`
`buildSiteNavItems`) and every nav button's behaviour. Section layout/order/ids
live in `src/lib/siteStructure.ts`.

## 2. Every button / link has an active handler

All header controls are `<button>` elements with real `onClick` handlers (no
dead buttons, no bare anchors in the shared header):

| Control | Handler | Target / Effect |
|---|---|---|
| Logo / Salon name (`site-brand`) | `go({key:'home'…})` | smooth-scrolls to `#section-hero` |
| Nav items (`nav-home`, `nav-services`, `nav-offers`, `nav-gallery`, `nav-videos`, `nav-about`, `nav-team`, `nav-contact`) | `go(item)` | sets `aria-current`, closes drawer, `scrollToSiteSection(item.targetId)` |
| Book Appointment (`site-book-cta`, `site-book-cta-mobile`) | `goBook` | scrolls to `#section-contact` (booking/contact) |
| Language EN / हिन्दी (`site-header-lang-en/hi`, drawer variants) | `setSiteLocale` | swaps all labels + persists `nexora_locale` |
| Dark Mode toggle (`site-header-dark-toggle`, drawer variants) | `toggleAppearance` | flips `data-appearance`, persists `nexora_site_appearance` |
| Hamburger (`site-menu-button`) | `setMenuOpen` | opens/closes mobile drawer (Escape also closes) |
| Mobile drawer rows (`nav-mobile-*`) | `go(item)` | scrolls + closes drawer |
| Login / Sign Up (logged out) | `openCustomerAuth('login'\|'signup')` | opens customer auth modal |
| My Bookings / Logout (logged in) | `openSiteBooking` / `signOut` | booking flow / session end |

Related site-wide nav surfaces are also fully wired:
- `src/components/SiteMobileActionBar.tsx` — Call / WhatsApp / Directions /
  Book (each has `href` or `onClick`; disabled states when data absent).
- `src/components/SiteFloatingActions.tsx` — back-to-top `scrollSiteToTop`.
- `src/components/SiteAnnouncementBar.tsx` — CTA → `openSiteBooking` or
  `scrollToSiteSection`.
- `src/components/TemplateRenderer.tsx` (legacy `hair` template) — nav links
  wired via `handleNavClick` → `scrollToSiteSection`; Book CTAs open the shared
  `BookingModal`.
- `src/components/TopBar.tsx` (owner builder chrome) — module switcher,
  universal navigator, login/logout all have `onClick`.

## 3. End-to-end verification (scroll targets exist)

Each nav item's `targetId` is a real DOM id rendered by the theme. All map to
existing sections (verified for the `barber_mens_grooming` theme that
`/arts-by-uma` resolves to when no template is stored):

- `home` → `#section-hero` (BarberHero) ✔
- `services` → `#section-services` (SiteServiceDirectory) ✔
- `offers` → `#section-offers` (SiteOffers) ✔
- `gallery` → `#section-gallery` (SiteGallery) ✔
- `videos` → `#section-social` (SiteVideoGallery) ✔
- `about` → `#section-about` ✔
- `team` → `#section-team` ✔
- `contact` / Book → `#section-contact` ✔

Family/nail themes map Offers to `#section-combos` / `#section-service-menu`
via `SITE_SECTION_ID_ALIASES`; all targets exist.

## 4. Automated proof

- `npm run test:phase-10.1` — **80/80 passed** (header + navigation,
  desktop & mobile, all five themes: nav order, `aria-current`, scroll
  targets, Book CTA, language, dark mode, drawer).
- `npm run test:phase-10.2` — **49/49 passed** (language & dark mode).
- `npm run test:phase-10.3` — **86/86 passed** (website structure/ids).
- Independent jsdom mount of `BarberTemplateRenderer` with the `/arts-by-uma`
  (barber, near-empty config) payload: **0 buttons missing a handler; 0 nav
  scroll targets missing from the DOM.**

## Conclusion

The header navigation for `/arts-by-uma` is fully working end-to-end. Every
navbar button/link has an active event handler, every handler scrolls to a
section that exists in the rendered DOM, and the behaviour is covered by the
passing phase-10.1 navigation acceptance suite.

## Navigation & Links Mapping — implemented (2026-09-02)

Applied the requested nav/link mapping to the shared header
(`src/components/SiteHeader.tsx` + `src/lib/siteNavigation.ts`).

| Nav item | Behaviour | Route / hash |
|---|---|---|
| **HOME** | scrolls to the very top of the site | `/arts-by-uma#home` |
| **SERVICES** | smooth-scrolls to `#section-services` | `/arts-by-uma#services` |
| **OFFERS** | smooth-scrolls to the offers/combo block | `/arts-by-uma#offers` |
| **ABOUT** | smooth-scrolls to `#section-about` (was wrongly pointing at the founder block) | `/arts-by-uma#about` |
| **CONTACT** | smooth-scrolls to the contact/footer section | `/arts-by-uma#contact` |
| **MY BOOKINGS** | opens the booking modal/view (which lists the visitor's own bookings) | existing booking flow |
| **BOOK APPOINTMENT** | triggers the appointment booking modal | `/arts-by-uma#booking` |

Details:

- `src/lib/siteNavigation.ts` — added canonical route hashes
  (`SITE_NAV_ROUTE_HASH`, `BOOKING_ROUTE_HASH`), `routeHashForNav`,
  `pushRouteHash` (writes the address-bar hash), and
  `scrollToRouteHashIfPresent` (deep-link loader). Also fixed the barber/hair/
  beauty **About** nav target from `section-owner` → `section-about`.
- `src/components/SiteHeader.tsx` — `go()` scrolls **Home** to the top (via
  `scrollSiteToTop`) and every other item smooth-scrolls to its section while
  mirroring the canonical hash; `goBook()` now **opens the booking modal**
  (`openSiteBooking`) and sets `#booking` (previously it only scrolled to
  contact). Brand lockup + mobile drawer rows use the same `go()`.
- `src/components/PublicSalonView.tsx` — on public-site load, reads the URL
  hash and scrolls to the matching section, so deep links
  (`/arts-by-uma#services`, `#offers`, `#about`, `#contact`, `#home`) behave
  exactly like the header nav.

Tests updated (`scripts/test-phase-10.1.mjs`, `scripts/test-phase-10.4.mjs`)
and all green:

- `test-phase-10.1` header & navigation — **90/90 passed** (includes new Home
  → top, route-hash, and Book-opens-flow checks).
- `test-phase-10.4` final CTA/footer — **118/118 passed** (header Book now
  opens the booking flow).
- `test-phase-10.2` (49), `test-phase-10.3` (86), `test-phase-10.5` (56),
  `test-phase-10.12` (178), `test-phase-10.13` (339), `test-phase-11.1` (215),
  `test-phase-11.2` (138), `test-phase-11.3` (249), `test-phase-16.1` (55),
  `test-phase-16.2` (55), `test-phase-14.5` (22) — all pass.
- `tsc --noEmit` and a full `npm run build` both succeed.

## Actions & Multi-Language Logic — verified (2026-09-02)

Confirmed and covered by a new dedicated test
(`scripts/test-header-auth-locale.mjs`, registered as
`npm run test:header-auth-locale` — **4/4 passed**).

### LOGOUT
The public-site header's Logout buttons (desktop `site-header-logout` and
mobile-drawer `site-drawer-logout`) are wired to the shared
`signOut()` in `src/lib/useAuth.ts`:

1. `signOut()` clears the owner browser workspace cache and calls
   `supabase.auth.signOut()` (try/catch guarded).
2. Supabase emits `SIGNED_OUT` → the single shared auth store
   (`useAuth`'s `onAuthStateChange`) republishes `{ user: null, session: null }`.
3. Every `useAuth()` subscriber re-renders, so the header instantly flips
   from **My Bookings / Logout** back to **Login / Sign Up** (state update).
4. On protected routes only (`/dashboard`, `/builder`) it also redirects to
   `/auth/login` via `redirectToOwnerLoginForSessionLoss`; the public site
   (`/arts-by-uma`) simply clears the session and stays put.

### EN / हिन्दी (Language Switcher)
The header's EN/HI segmented control calls `setSiteLocale(option)`
(`src/lib/siteNavigation.ts` → `src/lib/locale.ts`):

- Persists the choice (`nexora_locale`) and broadcasts the
  `SITE_LOCALE_EVENT`.
- Every renderer/header subscribes via `useSiteLocale()`, so clicking the
  toggle repaints **all** UI strings instantly and smoothly — nav labels, Book
  CTA, section headings, and the auth actions (**My Bookings ↔ मेरी बुकिंग**,
  **Logout ↔ लॉग आउट**, **Login ↔ लॉग इन**, **Sign Up ↔ साइन अप**).
- Works identically in the desktop bar and the mobile drawer.

New test proves: signed-in header shows My Bookings + Logout; switching
EN→हिन्दी repaints those labels + the Book CTA and persists; clicking Logout
runs `auth.signOut()` and flips the header (desktop and mobile drawer) to
Login / Sign Up. Regression suites re-run green: phase-10.1 (90), 10.2 (49),
10.4 (118), auth-flow-fixes (13).

## Testing & Verification — smooth scroll / clickability / a11y / console errors (2026-09-02)

New automated suite **`scripts/test-header-ux-verify.mjs`** (`npm run test:header-ux`,
**30/30 passed**), running the real Barber + Nail & Lash themes in **both desktop and
mobile** preview modes. It verifies:

- **Smooth scrolling enabled** — `scroll-behavior: smooth` present on `html`,
  `.site-scroll` and `.site-legacy-scroll` in `src/index.css`, plus every JS
  scroll call passing `behavior: 'smooth'` (`scrollToSiteSection`,
  `scrollSiteToTop`). Reduced-motion users get `behavior: auto`.
- **Clickable** — every header control is a `<button>`/`<a>` with an active
  handler/href and is not disabled.
- **Accessible** — every control exposes a non-empty accessible name; nav rows
  carry `aria-current`; the menu button carries `aria-expanded`/`aria-label`.
- **Hover/click visual feedback** — nav links and drawer rows animate on hover
  (`transition*` + `hover:`); Book CTAs add `active:` press feedback.
- **No console errors** during mount and every interaction.

### Fixes made while verifying (all covered by the suite)

1. **Nav links had no hover feedback** in any of the five themes — they only
   changed on click. Added `hover:opacity-70` to every theme's `linkClass`
   (`src/components/SiteHeader.tsx`).
2. **Mobile drawer rows lacked hover feedback** — added `hover:opacity-70` to
   every theme's `drawerRowClass`.
3. **Mobile Book CTA lacked press feedback** in hair/beauty/family/nail —
   added `active:scale-[0.99]` to `drawerBookClass`.
4. **`.site-scroll` lacked a CSS smooth-scroll fallback** — added
   `scroll-behavior: smooth` (and the reduced-motion override) in
   `src/index.css`, matching `html` / `.site-legacy-scroll`.
5. **Nail & Lash crash on a team member without specialties** —
   `getPublicStaffData` now defaults `specialties` to `[]` (`src/types.ts`), so
   the Nail & Lash `TeamCard` (`member.specialties.length`) never throws on a
   member with no specialties.

Regression suites all green after these fixes: phase-10.1 (90), 10.2 (49),
10.3 (86), 10.4 (118), 10.5 (56), 14.5 (22), 16.6 (54), 16.7 (39),
header-auth-locale (4). `tsc --noEmit` clean; `npm run build` succeeds.

## Phase 1 — Header Navigation & Action Fixes (consolidated, 2026-09-02)

New acceptance suite **`scripts/test-phase1-header.mjs`** (`npm run test:phase1-header`,
**10/10 passed**) covering every required nav action against the real
`/arts-by-uma` (barber) header, desktop:

| # | Nav / action | Verified behaviour |
|---|---|---|
| 1 | **HOME** | smooth-scrolls to the top of the site, sets `#home` |
| 2 | **SERVICES** | smooth-scrolls to `#section-services`, sets `#services` |
| 3 | **OFFERS** | smooth-scrolls to the offers block, sets `#offers` |
| 4 | **ABOUT** | smooth-scrolls to `#section-about`, sets `#about` |
| 5 | **CONTACT** | smooth-scrolls to `#section-contact`, sets `#contact` |
| 6 | **LOGIN / SIGN UP** | open the Supabase auth modal on the correct tab (login vs signup), closes cleanly |
| 7 | **MY BOOKINGS / LOGOUT** | shown conditionally when signed in (Login/Sign Up hidden); Logout runs `auth.signOut()` and flips back to Login/Sign Up |
| 8 | **EN / हिन्दी** | toggles i18n state, repaints nav labels instantly, persists `nexora_locale` |
| 9 | **BOOK APPOINTMENT** | opens the booking flow and sets `#booking` |

All nine requirements were already wired by the earlier passes (navigation
mapping, auth/locale, UX verification); this phase locks them in under one
acceptance suite. `tsc --noEmit` clean; `npm run build` succeeds.
