# PHASE 15.8 — Likes + Weekly Most-Liked System

> Status: **COMPLETE** · branch `arena/01a0065c-new-tamplete-app`

Implemented only Phase 15.8 on top of the existing Phase 15.1–15.7 video
gallery. No dashboard integration, and no Phase 15.9 / 15.10 work.

## Schema inspection (done before any structure was added)

| Existing structure | Reused for 15.8 |
|---|---|
| `public.social_videos` (M06) | the one and only video table — likes reference it |
| `public.businesses` / `business_members` (M03) | tenancy + role matrix |
| `auth.users` + Supabase Auth session | liker identity for signed-in users |
| `public.website_events.visitor_token` (M10) | the existing anonymous-visitor concept, reused for logged-out likes |
| `businesses.timezone` (M03) | the clock the ranking week is computed in |
| `is_business_member()` / `is_published_business()` (M11) | authorization helpers |

No user ids, salon ids, or auth rules were invented. No parallel video, user,
or salon model was created.

## What was added

**Draft migration `M27`** (`20260815000101_m27_social_video_likes_weekly.sql`):

1. Two additive nullable columns on the existing `social_videos`
   (`theme_key`, `video_kind`) that persist the Phase 15.1/15.3 client
   discriminators so the ranking can be theme- and kind-aware in SQL. Existing
   rows stay valid with `NULL`.
2. `public.social_video_likes` — one row per (video, liker):
   - `user_id → auth.users` **xor** `visitor_token` (check constraint);
   - composite FK `(video_id, business_id, theme_key)` → `social_videos`, which
     makes a cross-theme or cross-tenant like structurally impossible;
   - partial unique indexes `(video_id, user_id)` and `(video_id, visitor_token)`
     so duplicates cannot exist.
3. `toggle_social_video_like(uuid)` — the only write path. Verifies the video is
   active and belongs to a published/managed business, resolves identity from
   the session (`auth.uid()`, else the forwarded visitor token), and toggles
   instead of inserting a duplicate.
4. `get_social_video_like_counts()` and `get_weekly_top_videos(business, theme,
   kind, limit)` — weekly window computed from `businesses.timezone`,
   Monday→Sunday, no scheduled job.
5. RLS on the likes table: tenant members read their salon's rows, a visitor
   reads/writes only their own, and there is no `UPDATE` path at all.

**Nothing is executed against any database** — M27 is a draft like M01–M26.

**Client engine `src/lib/videoLikes.ts`** mirrors those exact rules for the
current local-store runtime (same pattern as Phase 10.7 payments / 10.8
reviews), so behaviour is identical before and after the migrations are applied.

## Identity + duplicate protection

`videoLikeActor(user?.id)` maps the **existing** session onto a like actor:

- signed in → `user:<auth.users.id>` from `useAuth()`;
- signed out → `session:<bookingBrowserId()>`, the per-browser id the booking
  and review flows already use.

One row per `(business, theme, video, actor)`. A repeat like from the same
identity is a **toggle**, never a second row, and a short per-actor rate limit
blocks flooding. Because identity is session-derived, it cannot be typed,
guessed, or swapped by the client.

## Current week

Monday 00:00 → Sunday 23:59 on the salon clock (`salonNow()`), keyed as an ISO
week (`2026-W33`). The week rolls over on read — no timer, cron, or stored
"current week" row. Last week's likes stay in the all-time count and drop out
of the weekly count automatically.

## Weekly Top Videos

`weeklyTopVideos(businessId, themeId, data, { kind, limit })`:

- candidates are exactly `videoItemsForTheme(themeId, data)` — the same
  theme-isolated projection the gallery renders;
- likes are matched on `(businessId, themeId, videoId)`;
- **Shorts and Long Videos both rank**, together or filtered per kind;
- ordering: weekly likes → all-time likes → the gallery's stable order;
- videos with zero likes this week are excluded (never an invented ranking).

A video, or a like, from one theme can therefore never appear in or inflate
another theme's ranking — asserted for all five themes in both suites.

## UI

- Every card (owner and protected showcase, Short and Long) has a **Like**
  button with an accurate count, `aria-pressed`, and `data-like-count` /
  `data-weekly-like-count` / `data-liked` attributes.
- After a successful like the count, the button state and the **Weekly Top
  Videos** block all update immediately; a `nexora:video-likes` event keeps
  other mounted surfaces in sync.
- Liking never triggers the Phase 15.7 card-click behaviour (no accidental
  redirect to the original platform).
- EN + HI copy for every new string.

| State | Behavior |
|---|---|
| Weekly loading | spinner + localized copy while the existing session resolves |
| Weekly error | localized alert (honours the section error flag) |
| Weekly empty | "No likes yet this week" — never a fabricated ranking |
| Like in flight | button disabled, spinner, `aria-busy`, saving copy |
| Like failed | `role="alert"` message; the count is left unchanged |
| Rate limited / unavailable video | distinct localized messages |
| Section loading/error/empty | Phase 15.1–15.7 behavior preserved |

## Security

Enforcement is in the data layer and the database, not the button:

- `toggleVideoLike` re-validates theme membership, customer visibility
  (rejected / unpublished / foreign-theme / unknown ids are refused), and the
  rate limit — the UI is never the gate;
- M27 repeats the same rules with constraints, unique indexes, RLS and a
  `security definer` RPC;
- direct table writes cannot forge another identity or another tenant's row.

## Files

- `supabase/migrations/20260815000101_m27_social_video_likes_weekly.sql` — draft M27
- `src/lib/videoLikes.ts` — likes + weekly ranking engine
- `src/lib/siteVideoGalleryI18n.ts` — EN/HI likes + weekly copy
- `src/components/SiteVideoGallery.tsx` — Like button, counts, weekly block, states
- `scripts/test-phase-15.8.mjs` — 24-test acceptance suite
- `scripts/validate-migrations.mjs` — new database test **U**
- `scripts/test-phase-15.1.mjs` — assertion updated for the now-expected surface

## Validation

```bash
npm run test:phase-15.8      # 24/24
npm run test:phase-15        # 171/171 (15.1–15.8)
npm run validate:migrations  # 27/27 applied x2, 21/21 tests (new test U)
npm run test:phase-14        # 180/180 regression
npm run test:phase-10.8      # 36/36 · 10.3 86/86 · 10.12 178/178
npm run lint                 # 0 errors
npm run build                # green
node verify-22-screens.js    # 25/25
```

## Explicitly out of scope

- Main website dashboard integration
- Any Phase 15.9 or 15.10 functionality
