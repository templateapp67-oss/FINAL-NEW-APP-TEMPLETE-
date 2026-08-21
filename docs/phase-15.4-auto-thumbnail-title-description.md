# PHASE 15.4 — Auto Thumbnail + Title + Description

> Status: **COMPLETE** · session `arena/01a0039c-new-tamplete-app`

## What was built

When the owner pastes a valid **YouTube URL**, the add-video form automatically
populates:

| Field | Source |
|-------|--------|
| Thumbnail | YouTube oEmbed / `img.youtube.com` (Phase 15.2) |
| Title | oEmbed `title` |
| Description | Open Graph / oEmbed |
| Channel / source | oEmbed `author_name` |
| Original video URL | Canonical watch or retained `/shorts/` URL |

**Only the URL is required.** Manual edits are allowed but never overwrite
valid platform metadata unnecessarily.

### No second fetch system

Reuses Phase 15.2 end-to-end:

- Client: `fetchVideoMetadata()` in `src/lib/videoUrlMetadata.ts`
- Server: `POST /api/video-metadata` (public oEmbed + OG — no API key)

New pure helpers (same module):

| Helper | Role |
|--------|------|
| `mergePlatformMetadataIntoForm` | Merge policy: empty → fill; manual → keep; previous auto-fill → refresh |
| `socialVideoFromPasteAndMetadata` | Build `SocialVideo` bound to theme + short/long kind |
| `platformMetadataIsComplete` | True when title+url present (paste-only save) |
| `partialMetadataNotice` | Clear notice when only a derived thumb arrived |

### Merge policy (never overwrite unnecessarily)

1. **Manual flag set** → field is never touched by a later fetch.
2. **Empty form field** → accepts platform value.
3. **Form still equals previous platform snapshot** → safe to refresh (derived → oembed).
4. **Divergent non-empty value** → treated as owner-owned and kept.

### Shorts / Long retention

Kind is captured from the **original paste** (`/shorts/` → short) before any
canonical watch-URL rewrite, then stamped on the saved `SocialVideo.videoKind`
and `themeId` (active salon theme). Metadata never crosses themes.

### Fallback / error states

| Case | UI |
|------|----|
| Invalid / non-YouTube URL | Red error under the URL field; save blocked |
| oEmbed failure after valid id | Derived thumb + amber notice; title required to save |
| Broken thumbnail image | Placeholder panel (owner list + form) — never a broken `<img>` |
| Missing title on partial meta | Save refused until owner adds a title |

### Schema

No new tables, columns, IDs, or API credentials. Uses existing:

- `SocialVideo.url` / `thumbnailUrl` / `title`
- Additive `externalVideoId`, `description`, `channelName`, `videoKind`, `themeId`
- DB mapping: `social_videos.video_url`, `external_video_id`, `caption`

### Public gallery

Owner cards with description + channel render on the video gallery
(`site-video-card-description`). Broken/missing thumbs use the existing
`site-video-gallery-thumb-fallback` path.

### Out of scope (later phases)

- Owner/admin management UI beyond Step 07 paste
- Likes / weekly videos / dashboard

### Validation

```bash
npm run test:phase-15.4   # 18/18
npm run test:phase-15.1   # 26/26
npm run test:phase-15.2   # 18/18
npm run test:phase-15.3   # 21/21
npm run lint
```
