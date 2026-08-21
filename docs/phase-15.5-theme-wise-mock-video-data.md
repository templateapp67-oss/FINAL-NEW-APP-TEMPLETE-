# PHASE 15.5 — Theme-wise Protected Mock Video Data

> Status: **COMPLETE for all five themes** · session `arena/01a0039c-new-tamplete-app`

## What was built

Hardened the Phase 15.3 per-theme catalog into **protected mock / configured
video data** for all five themes:

| Theme | Shorts | Long | Content focus |
|-------|--------|------|----------------|
| Barber | 5 | 5 | Men's grooming, fades, beard, shave |
| Hair Studio | 5 | 5 | Colour, balayage, styling, keratin |
| Beauty/Spa | 5 | 5 | Facial, spa, skin, bridal makeup |
| Family Salon | 5 | 5 | Kids, family visits, men/women |
| Nail/Lash | 5 | 5 | Nails, lashes, brows, gel art |

**Total: 50 unique theme-specific records** — no shared titles, descriptions,
thumbnails, urls, record ids, or external video ids across themes.

### Audit (pre-implementation)

| Existing piece | Role in 15.5 |
|----------------|--------------|
| `src/lib/siteVideoCatalog.ts` (15.3) | 50-seed catalog — hardened as protected mocks |
| `videoItemsForTheme` fill path (15.3) | Auto-appear when owner has fewer than 5 of a kind |
| `SocialVideo` / `social_videos` (M06) | Existing URL-only model — no new tables/columns |
| Step Socials delete | Now refuses permanent delete of protected mocks |

**No new tables, columns, IDs, or relationships.** Reuses the existing catalog
and fill architecture.

### Protection rules

| Helper | Behaviour |
|--------|-----------|
| `isThemeMockVideoId(id)` | `theme:*` / catalog id set |
| `isProtectedThemeMockVideo(video)` | id or (catalog external id + showcase stamp) |
| `filterDeletableOwnerVideos(list, id)` | Always retains protected rows |
| `isDeleteBlockedForVideoId(list, id)` | True when target is protected |

- Public gallery fill **skips** any protected mock that leaked into owner storage
  and re-injects it under `origin: 'theme'` — so wiping owner storage cannot
  permanently remove mocks.
- Step 07 delete shows: *"Theme showcase videos cannot be permanently deleted."*
- Real owner-saved videos remain fully deletable.

### Auto-appear

When the owner has not configured enough real videos of a kind for the active
theme, `videoItemsForTheme` fills remaining short/long slots from that theme's
protected catalog only (never another theme's).

### Isolation

- Every mock row stamped `themeId = <active theme>`.
- Content vocabulary is theme-matched (asserted via `THEME_MOCK_CONTENT_HINTS`).
- Foreign mock titles never render on another theme's site.

### URLs

Real public YouTube watch/shorts links with valid 11-char ids; thumbnails from
`img.youtube.com/vi/{id}/hqdefault.jpg`. No random/fake/placeholder hosts.

### Out of scope (later phases)

- Admin management of mocks
- Likes / weekly ranking / dashboard

### Validation

```bash
npm run test:phase-15.5   # 19/19
npm run test:phase-15.3   # 21/21
npm run test:phase-15.1   # 26/26
npm run test:phase-15.4   # 18/18
npm run lint
```
