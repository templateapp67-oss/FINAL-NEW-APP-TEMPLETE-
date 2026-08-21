# Phase 10.8 — Reviews, Ratings & Social Content (all 5 themes)

> Status: **COMPLETE** (2026-08-13, session `arena/019ffba4-new-tamplete-app`).
> Scope: customer reviews + ratings with a Write a Review form, and a
> Social / Latest Work feed that reuses the existing Videos / Reels
> architecture. Header, Language, Dark Mode, booking, payment, footer and
> 10.4 CTAs / FABs are untouched. No database schema changes.

## What landed

| File | Role |
|------|------|
| `src/lib/siteReviews.ts` | Single review engine: eligibility, spam / duplicate guards, pending moderation, averages, tenant + theme isolation. |
| `src/lib/siteReviewsI18n.ts` | EN / हिन्दी copy for the form, empty / pending / error states. |
| `src/lib/siteReviewsTheme.ts` | Five distinct review visuals (slab / editorial / pills / rounded / neon). |
| `src/components/SiteReviews.tsx` | Reviews section: average + count, cards, Write a Review form. |
| `src/lib/siteSocialFeed.ts` | Resolves the feed from configured `socialVideos` + `socialProfiles` only. YouTube / Instagram embed parse. |
| `src/lib/siteSocialI18n.ts` | EN / हिन्दी social / latest-work copy. |
| `src/lib/siteSocialTheme.ts` | Five distinct feed visuals. |
| `src/components/SiteSocialFeed.tsx` | Latest Work feed mounted as the existing `videos` / `section-social` block. |
| Five theme renderers | Hardcoded testimonials and raw video grids replaced with the shared components. Beauty's extra post-reviews video block removed (it was a duplicate). |

## Reviews

- Public list shows **approved** reviews only. Nothing is invented.
- Average rating + review count sit above the list.
- **Write a Review** opens Rating + Review + Customer Name.
- Submission is allowed only after a valid Phase 10.7 booking
  (`confirmed` or `pay_at_salon`) on the same business + theme whose
  appointment date is today or earlier.
- New rows start as `pending` and the submitter sees a moderation state.
- One review per booking; repeated-character / identical-body / rate-limit
  spam is rejected.
- Reviews are keyed by `businessId` + `themeId`.

## Social / Latest Work

- Not a second Videos system. The existing `data-site-section="videos"`
  (`#section-social`) is the feed.
- Posts come only from `data.socialVideos`. Profiles (Instagram, YouTube,
  Facebook, TikTok) come only from `data.socialProfiles`.
- Thumbnails, captions and a View / Open action are shown.
- YouTube 11-character ids and Instagram shortcodes get a real embed URL;
  demo ids such as `67890` do not invent an embed.
- No fallback / placeholder posts.

## Validation

```bash
npm run test:phase-10.8   # 36/36 across all five themes
npm run test:phase-10     # 10.1 → 10.8: 593 tests, all green
npm run lint              # 0 errors
```

- 10.1 (80/80), 10.2 (49/49), 10.3 (86/86), 10.4 (118/118),
  10.5 (56/56), 10.6 (102/102), 10.7 (66/66) still pass.
