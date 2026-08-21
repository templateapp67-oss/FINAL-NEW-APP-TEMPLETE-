/**
 * PHASE 15.8 — VIDEO LIKES + WEEKLY MOST-LIKED engine (all five themes).
 *
 * Built strictly on the EXISTING Phase 15.1–15.7 video architecture
 * (`SalonData.socialVideos` + the protected per-theme showcase catalog) and
 * the EXISTING session architecture. Nothing here invents a user id, a salon
 * id, an authentication rule, or a database field:
 *
 *   - IDENTITY comes from the existing Supabase Auth session
 *     (`useAuth().user.id`, the same session the rest of the app already
 *      uses). When there is no signed-in user the visitor is identified by
 *     the EXISTING per-browser id (`bookingBrowserId()`, Phase 10.6/10.8).
 *     Nothing is ever typed by, or trusted from, the client.
 *   - TENANT scope reuses `reviewBusinessId(data)` (Phase 10.8), so likes are
 *     scoped to the same business identifier reviews already use.
 *   - DUPLICATES: one like per (business, theme, video, actor). A repeat like
 *     from the same user/session is not a second row — it is a toggle (unlike).
 *     Because the identity is session-derived, a visitor cannot inflate a
 *     count by clicking repeatedly.
 *   - STORAGE mirrors the Phase 10.7/10.8 local tenant store pattern
 *     (`nexora_site_reviews` / payments). Draft migration **M27** adds the
 *     matching server-side table `public.social_video_likes` on top of the
 *     existing `social_videos` + `auth.users` relationships, with the unique
 *     constraint, RLS and RPCs that enforce the same rules database-side.
 *     Nothing is applied to any database from the app.
 *   - WEEK: Monday 00:00 → Sunday 23:59 in the salon's local clock
 *     (`salonNow()`), keyed as an ISO week (`2026-W33`), so the weekly ranking
 *     rolls over without a timer or scheduled job.
 *   - THEME ISOLATION: every row carries `themeId`, and the ranking projects
 *     through `videoItemsForTheme`, so one theme's video can never appear in
 *     — or contribute likes to — another theme's ranking.
 *   - Shorts AND Long videos are both rankable, together or per kind.
 */
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import { bookingBrowserId } from './siteBookingFlow';
import { salonNow } from './salonStatus';
import { reviewBusinessId } from './siteReviews';
import { videoItemsForTheme, type VideoGalleryItem } from './siteVideoGallery';
import { isVideoGalleryThemeId } from './siteVideoGallery';
import type { VideoKind } from './siteVideoCatalog';

export const VIDEO_LIKE_STORE_KEY = 'nexora_video_likes';
export const VIDEO_LIKE_EVENT = 'nexora:video-likes';
export const VIDEO_LIKE_STORE_VERSION = 1;

/** Anti-abuse: at most N like/unlike writes per actor per theme in the window. */
export const VIDEO_LIKE_RATE_WINDOW_MS = 60_000;
export const VIDEO_LIKE_RATE_MAX = 30;

/** Default size of the Weekly Top Videos result. */
export const WEEKLY_TOP_LIMIT = 5;

/* ------------------------------------------------------------------ */
/* Actor identity (existing auth/session only)                         */
/* ------------------------------------------------------------------ */

export type VideoLikeActorKind = 'user' | 'session';

export interface VideoLikeActor {
  /** Namespaced identity — never a raw, guessable value written by the client. */
  id: string;
  kind: VideoLikeActorKind;
}

/**
 * Maps the EXISTING session onto a like actor.
 *
 * `userId` must come from the real Supabase session (`useAuth().user.id`).
 * When absent, the visitor falls back to the existing per-browser id, which
 * is the same anonymous identity the booking and review flows already use.
 */
export function videoLikeActor(userId?: string | null): VideoLikeActor {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  if (trimmed) return { id: `user:${trimmed}`, kind: 'user' };
  return { id: `session:${bookingBrowserId()}`, kind: 'session' };
}

/** Tenant scope — reuses the Phase 10.8 business resolution (no invented id). */
export function videoLikeBusinessId(data: SalonData): string {
  return reviewBusinessId(data);
}

/* ------------------------------------------------------------------ */
/* Week window (salon local clock, ISO week)                           */
/* ------------------------------------------------------------------ */

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Monday 00:00 of the week containing `date` (salon local time). */
export function startOfWeek(date: Date = salonNow()): Date {
  const day = startOfLocalDay(date);
  // getDay(): 0 = Sunday → treat Monday as the first day of the week.
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

/** Exclusive end of the week (next Monday 00:00). */
export function endOfWeek(date: Date = salonNow()): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
}

/** ISO-8601 week key, e.g. `2026-W33`. Stable across the whole week. */
export function weekKeyOf(date: Date = salonNow()): string {
  // ISO week: Thursday of the current week decides the year.
  const monday = startOfWeek(date);
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  const year = thursday.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const firstMonday = startOfWeek(firstThursday);
  const week = Math.round((thursday.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function isInCurrentWeek(atMs: number, now: Date = salonNow()): boolean {
  return atMs >= startOfWeek(now).getTime() && atMs < endOfWeek(now).getTime();
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface VideoLike {
  id: string;
  businessId: string;
  themeId: SiteHeaderThemeId;
  videoId: string;
  /** Short / long, so the ranking can be filtered per kind. */
  videoKind: VideoKind;
  /** Session-derived identity (`user:<uuid>` or `session:<browser>`). */
  actorId: string;
  actorKind: VideoLikeActorKind;
  createdAt: number;
  /** ISO week the like belongs to (denormalised for the weekly ranking). */
  weekKey: string;
  /** Unique key that makes a duplicate like impossible. */
  fingerprint: string;
}

export interface VideoLikeAttempt {
  actorId: string;
  businessId: string;
  themeId: string;
  at: number;
}

export interface PersistedVideoLikeStore {
  version: number;
  likes: VideoLike[];
  attempts: VideoLikeAttempt[];
}

let injectedStore: PersistedVideoLikeStore | null = null;
let forcedStorageFailure = false;

function emptyStore(): PersistedVideoLikeStore {
  return { version: VIDEO_LIKE_STORE_VERSION, likes: [], attempts: [] };
}

function isVideoLike(value: unknown): value is VideoLike {
  if (!value || typeof value !== 'object') return false;
  const like = value as VideoLike;
  return (
    typeof like.id === 'string'
    && typeof like.businessId === 'string'
    && typeof like.videoId === 'string'
    && typeof like.actorId === 'string'
    && typeof like.createdAt === 'number'
    && isVideoGalleryThemeId(like.themeId)
  );
}

function readStore(): PersistedVideoLikeStore {
  if (typeof window === 'undefined') return emptyStore();
  try {
    const raw = window.localStorage.getItem(VIDEO_LIKE_STORE_KEY);
    if (!raw) return emptyStore();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed || typeof parsed !== 'object'
      || (parsed as PersistedVideoLikeStore).version !== VIDEO_LIKE_STORE_VERSION
      || !Array.isArray((parsed as PersistedVideoLikeStore).likes)
    ) {
      return emptyStore();
    }
    const store = parsed as PersistedVideoLikeStore;
    return {
      version: VIDEO_LIKE_STORE_VERSION,
      likes: store.likes.filter(isVideoLike),
      attempts: Array.isArray(store.attempts) ? store.attempts : [],
    };
  } catch {
    return emptyStore();
  }
}

function emitEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(VIDEO_LIKE_EVENT));
  }
}

function effectiveStore(): PersistedVideoLikeStore {
  if (injectedStore) return injectedStore;
  return readStore();
}

/** Returns false when the like could not be persisted (surfaces an error state). */
function effectiveWrite(store: PersistedVideoLikeStore): boolean {
  if (forcedStorageFailure) return false;
  if (injectedStore) {
    injectedStore = {
      version: VIDEO_LIKE_STORE_VERSION,
      likes: store.likes.slice(),
      attempts: store.attempts.slice(),
    };
    emitEvent();
    return true;
  }
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(VIDEO_LIKE_STORE_KEY, JSON.stringify(store));
  } catch {
    return false;
  }
  emitEvent();
  return true;
}

export function setVideoLikeStoreForTests(store: PersistedVideoLikeStore | null): void {
  injectedStore = store
    ? {
        version: VIDEO_LIKE_STORE_VERSION,
        likes: (store.likes || []).slice(),
        attempts: (store.attempts || []).slice(),
      }
    : null;
}

export function readVideoLikeStoreForTests(): PersistedVideoLikeStore {
  return effectiveStore();
}

/** Test seam: simulate a persistence failure so the error state is reachable. */
export function setVideoLikeStorageFailureForTests(failing: boolean): void {
  forcedStorageFailure = failing;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export function videoLikeFingerprint(
  businessId: string,
  themeId: string,
  videoId: string,
  actorId: string,
): string {
  return `${businessId}|${themeId}|${videoId}|${actorId}`;
}

/** Every like for one business + theme (theme isolation is applied here). */
export function likesForTheme(businessId: string, themeId: SiteHeaderThemeId): VideoLike[] {
  return effectiveStore().likes.filter(
    (like) => like.businessId === businessId && like.themeId === themeId,
  );
}

export function likesForVideo(
  businessId: string,
  themeId: SiteHeaderThemeId,
  videoId: string,
): VideoLike[] {
  return likesForTheme(businessId, themeId).filter((like) => like.videoId === videoId);
}

/** All-time like count for one video within its own theme. */
export function videoLikeCount(
  businessId: string,
  themeId: SiteHeaderThemeId,
  videoId: string,
): number {
  return likesForVideo(businessId, themeId, videoId).length;
}

/** Like count for the CURRENT week only. */
export function weeklyVideoLikeCount(
  businessId: string,
  themeId: SiteHeaderThemeId,
  videoId: string,
  now: Date = salonNow(),
): number {
  const key = weekKeyOf(now);
  return likesForVideo(businessId, themeId, videoId).filter(
    (like) => like.weekKey === key && isInCurrentWeek(like.createdAt, now),
  ).length;
}

/** True when THIS user/session already liked the video (drives the toggle UI). */
export function hasActorLikedVideo(
  businessId: string,
  themeId: SiteHeaderThemeId,
  videoId: string,
  actor: VideoLikeActor,
): boolean {
  const fingerprint = videoLikeFingerprint(businessId, themeId, videoId, actor.id);
  return likesForTheme(businessId, themeId).some((like) => like.fingerprint === fingerprint);
}

export interface VideoLikeSummary {
  videoId: string;
  total: number;
  weekly: number;
  likedByActor: boolean;
}

export function videoLikeSummary(
  businessId: string,
  themeId: SiteHeaderThemeId,
  videoId: string,
  actor: VideoLikeActor,
  now: Date = salonNow(),
): VideoLikeSummary {
  return {
    videoId,
    total: videoLikeCount(businessId, themeId, videoId),
    weekly: weeklyVideoLikeCount(businessId, themeId, videoId, now),
    likedByActor: hasActorLikedVideo(businessId, themeId, videoId, actor),
  };
}

/* ------------------------------------------------------------------ */
/* Write (like / unlike)                                               */
/* ------------------------------------------------------------------ */

export type VideoLikeError =
  | 'unknown-video'
  | 'foreign-theme'
  | 'rate-limited'
  | 'storage';

export interface ToggleVideoLikeInput {
  businessId: string;
  themeId: SiteHeaderThemeId;
  videoId: string;
  data: Pick<SalonData, 'socialVideos' | 'disabledThemeVideoIds'>;
  actor: VideoLikeActor;
  now?: Date;
}

export interface ToggleVideoLikeResult {
  ok: boolean;
  liked: boolean;
  total: number;
  weekly: number;
  error?: VideoLikeError;
}

function isRateLimited(actorId: string, businessId: string, themeId: string, nowMs: number): boolean {
  const windowStart = nowMs - VIDEO_LIKE_RATE_WINDOW_MS;
  return (
    effectiveStore().attempts.filter(
      (attempt) =>
        attempt.actorId === actorId
        && attempt.businessId === businessId
        && attempt.themeId === themeId
        && attempt.at >= windowStart,
    ).length >= VIDEO_LIKE_RATE_MAX
  );
}

function prunedAttempts(store: PersistedVideoLikeStore, nowMs: number): VideoLikeAttempt[] {
  return store.attempts.filter((attempt) => attempt.at >= nowMs - VIDEO_LIKE_RATE_WINDOW_MS);
}

function randToken(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Like / unlike ONE customer-visible video of the ACTIVE theme.
 *
 * Enforcement (not UI-only):
 *   - The video must be part of `videoItemsForTheme` for this theme, so a
 *     hidden / rejected / foreign-theme / unknown id can never be liked.
 *   - One row per (business, theme, video, actor) — a repeat like toggles off
 *     instead of adding a duplicate.
 *   - Per-actor rate limit inside a short window.
 */
export function toggleVideoLike(input: ToggleVideoLikeInput): ToggleVideoLikeResult {
  const now = input.now || salonNow();
  const nowMs = now.getTime();
  const { businessId, themeId, videoId, actor } = input;

  const fail = (error: VideoLikeError): ToggleVideoLikeResult => ({
    ok: false,
    liked: hasActorLikedVideo(businessId, themeId, videoId, actor),
    total: videoLikeCount(businessId, themeId, videoId),
    weekly: weeklyVideoLikeCount(businessId, themeId, videoId, now),
    error,
  });

  if (!isVideoGalleryThemeId(themeId)) return fail('foreign-theme');

  const item = videoItemsForTheme(themeId, input.data).find((entry) => entry.id === videoId);
  if (!item) return fail('unknown-video');

  if (isRateLimited(actor.id, businessId, themeId, nowMs)) return fail('rate-limited');

  const store = effectiveStore();
  const fingerprint = videoLikeFingerprint(businessId, themeId, videoId, actor.id);
  const existing = store.likes.find((like) => like.fingerprint === fingerprint);
  const attempts = prunedAttempts(store, nowMs).concat([
    { actorId: actor.id, businessId, themeId, at: nowMs },
  ]);

  const likes = existing
    ? store.likes.filter((like) => like.fingerprint !== fingerprint)
    : store.likes.concat([
        {
          id: randToken('vlike'),
          businessId,
          themeId,
          videoId,
          videoKind: item.kind,
          actorId: actor.id,
          actorKind: actor.kind,
          createdAt: nowMs,
          weekKey: weekKeyOf(now),
          fingerprint,
        },
      ]);

  const written = effectiveWrite({ version: VIDEO_LIKE_STORE_VERSION, likes, attempts });
  if (!written) return fail('storage');

  return {
    ok: true,
    liked: !existing,
    total: videoLikeCount(businessId, themeId, videoId),
    weekly: weeklyVideoLikeCount(businessId, themeId, videoId, now),
  };
}

/* ------------------------------------------------------------------ */
/* Weekly Top Videos                                                   */
/* ------------------------------------------------------------------ */

export interface WeeklyTopVideo {
  rank: number;
  item: VideoGalleryItem;
  weeklyLikes: number;
  totalLikes: number;
}

export interface WeeklyTopOptions {
  /** Restrict the ranking to Shorts or Long videos. Omit for both. */
  kind?: VideoKind | 'all';
  limit?: number;
  now?: Date;
}

/**
 * Weekly Top Videos for ONE theme.
 *
 * The candidate set is exactly `videoItemsForTheme(themeId, data)` — the same
 * theme-isolated projection the gallery renders — and likes are matched on
 * (businessId, themeId, videoId). A video from another theme can therefore
 * never enter this ranking, and another theme's likes can never inflate it.
 * Both Shorts and Long videos are supported.
 *
 * Videos with zero likes this week are excluded (never invent a ranking).
 * Ties break on all-time likes, then the gallery's stable order.
 */
export function weeklyTopVideos(
  businessId: string,
  themeId: SiteHeaderThemeId,
  data: Pick<SalonData, 'socialVideos' | 'disabledThemeVideoIds'>,
  options: WeeklyTopOptions = {},
): WeeklyTopVideo[] {
  if (!isVideoGalleryThemeId(themeId)) return [];
  const now = options.now || salonNow();
  const limit = Math.max(1, options.limit ?? WEEKLY_TOP_LIMIT);
  const kind = options.kind && options.kind !== 'all' ? options.kind : null;

  const items = videoItemsForTheme(themeId, data).filter((item) => !kind || item.kind === kind);
  const order = new Map(items.map((item, index) => [item.id, index]));

  return items
    .map((item) => ({
      item,
      weeklyLikes: weeklyVideoLikeCount(businessId, themeId, item.id, now),
      totalLikes: videoLikeCount(businessId, themeId, item.id),
    }))
    .filter((entry) => entry.weeklyLikes > 0)
    .sort((a, b) => {
      if (b.weeklyLikes !== a.weeklyLikes) return b.weeklyLikes - a.weeklyLikes;
      if (b.totalLikes !== a.totalLikes) return b.totalLikes - a.totalLikes;
      return (order.get(a.item.id) ?? 0) - (order.get(b.item.id) ?? 0);
    })
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

/** Convenience: the ids of this week's top videos (tests / isolation checks). */
export function weeklyTopVideoIds(
  businessId: string,
  themeId: SiteHeaderThemeId,
  data: Pick<SalonData, 'socialVideos' | 'disabledThemeVideoIds'>,
  options: WeeklyTopOptions = {},
): string[] {
  return weeklyTopVideos(businessId, themeId, data, options).map((entry) => entry.item.id);
}

/** Compact display form for like counts (1200 → 1.2K). */
export function formatLikeCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count < 1000) return String(Math.round(count));
  if (count < 1_000_000) {
    const value = count / 1000;
    return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)}K`;
  }
  const value = count / 1_000_000;
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)}M`;
}
