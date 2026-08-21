# PHASE 15.2 — YouTube / Platform URL Auto-Fetch

> Status: **COMPLETE** · session `arena/01a0039c-new-tamplete-app`

## What was built

When an owner pastes a valid **YouTube** URL in Step 07 (Socials), the app:

1. Extracts the **11-character Video ID** (client-side, pure).
2. Asks the existing Express server for platform metadata (no browser API keys).
3. **Auto-fills** title, thumbnail, description, channel/source name, canonical
   URL, platform and `externalVideoId` so the owner does not re-type them.

Invalid / non-YouTube URLs show a clear, human-readable error. The design is
extensible for Instagram / Facebook / TikTok later without a second system.

### Audit (pre-implementation)

| Existing piece | Role in 15.2 |
|----------------|--------------|
| `parseYoutubeVideoId` (`siteSocialFeed.ts`) | Shared 11-char id parser (watch, youtu.be, shorts, embed, live, m., music) |
| `SocialVideo` + `social_videos` (M06) | `video_url`, `external_video_id`, `caption` — URLs only, no video file storage |
| `server.ts` Express API | Existing proxy pattern (Nominatim, Gemini) — new `/api/video-metadata` |
| `useAuth` / Supabase session | Optional `Authorization` forward; oEmbed is public so wizard works pre-login |
| Phase 15.1 Video Gallery | Consumes auto-filled `socialVideos` unchanged |

**No new tables, columns, IDs, or relationships.** Additive client fields on
`SocialVideo` (`externalVideoId`, `description`, `channelName`) map onto the
existing `external_video_id` + caption concepts; description/channel are
presentation metadata only.

### Architecture

| File | Purpose |
|------|---------|
| `src/lib/videoUrlMetadata.ts` | Parse/detect, client fetch, draft builder, error copy |
| `server.ts` → `POST /api/video-metadata` | Public YouTube **oEmbed** + OG description scrape (no Data API key) |
| `src/screens/StepSocials.tsx` | Paste → debounce → auto-fill UI + clear errors |
| `src/types.ts` | Additive `externalVideoId`, `description`, `channelName` |

### Metadata sources (no secrets)

- **YouTube oEmbed** — `https://www.youtube.com/oembed?url=…&format=json`
  → title, author_name (channel), thumbnail_url
- **Open Graph** (best-effort) — `og:description` from the watch page
- **Derived fallback** — `img.youtube.com/vi/{id}/hqdefault.jpg` when the
  network call fails after a successful id parse

No `YOUTUBE_API_KEY`, no `service_role`, no YouTube Data API v3.

### Validation rules

| Input | Result |
|-------|--------|
| `youtube.com/watch?v=ID`, `youtu.be/ID`, `/shorts/`, `/embed/`, `/live/`, `m.`, `music.` | Extract id → fetch → auto-fill |
| Channel / `@handle` / home | `not_a_video` error |
| Bad / short id | `invalid_youtube` error |
| Instagram / Facebook / TikTok | `unsupported_platform` (reserved for later) |
| Garbage / `javascript:` | `invalid_url` error |

### Owner UX

- Debounced paste/type on the URL field (`VIDEO_METADATA_DEBOUNCE_MS = 450`)
- Loading spinner while fetching
- Success preview card (thumb + title + channel + id)
- Error alert under the input
- Title stays editable; manual edits are not overwritten by a later fetch
- Submit saves a real `SocialVideo` (no invented likes on the auto-fetch path)

### Out of scope (later phases)

- Shorts vs long quantity limits
- Likes / weekly featured videos
- Admin management / dashboard integration
- Instagram / Facebook / TikTok auto-fetch (hooks only)
- Mock / fake metadata

### Validation

```bash
npm run test:phase-15.2
npm run test:phase-15.1
npm run lint
```
