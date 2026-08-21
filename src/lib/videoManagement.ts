/**
 * PHASE 15.6 — OWNER/ADMIN VIDEO MANAGEMENT layer.
 *
 * Management for the EXISTING Phase 15.1–15.5 video architecture
 * (`SalonData.socialVideos` + the protected per-theme showcase catalog in
 * `siteVideoCatalog.ts`). No duplicate video system, no new tables, columns,
 * or relationships:
 *
 *   - Owner: add new video (Step 07 paste flow, 15.2/15.4), replace a video,
 *     and edit video metadata — ONLY inside their own salon's payload. The
 *     salon is resolved server-side from the authenticated session by the
 *     existing `useAuth` + `resolveOwnerSalonId` (`organization_members
 *     role='owner'` → `salons`) logic; this module never accepts, trusts, or
 *     invents a salon id, so an owner can never reach another salon's videos.
 *   - Owner CAN edit protected theme showcase (mock) videos: the edit is
 *     materialised as an owner-owned override row (`replacesMockId` points
 *     back at the protected record). The protected catalog itself is NEVER
 *     mutated, and deleting the override simply restores the default.
 *   - Owner CANNOT permanently delete a protected showcase record:
 *     `canDeleteVideo` refuses it and the 15.5 filters keep guarding the
 *     quick list. Only an admin session may remove one — and only for their
 *     salon via `SalonData.disabledThemeVideoIds` (a per-salon tombstone;
 *     the shared catalog stays intact for everyone else).
 *   - Admin: full add / edit / replace / delete plus approve / reject /
 *     unpublish / reactivate (the `videoModeration` state machine) and
 *     showcase-record disable/restore. Admin tier requires a real
 *     authenticated session carrying an admin claim (`app_metadata.role` etc.)
 *     — never a client-typed flag like "make me admin".
 *   - Offline draft (`not-configured`, Supabase absent) keeps owner-tier
 *     management only — same rule the wizard already uses in 14.6/14.7.
 *
 * Every helper re-validates capabilities and REFUSES the mutation when the
 * actor lacks them, so enforcement lives in the data layer (not just hidden
 * buttons). When the draft RLS set (M12) is applied, `social_videos` writes
 * are additionally guarded database-side by
 * `has_business_role(business_id, ['owner_admin','manager'])`.
 */
import type { SalonData, SocialVideo } from '../types';
import { isSafeMediaUrl } from './siteHero';
import { isSiteHeaderTheme, type SiteHeaderThemeId } from './siteNavigation';
import { resolveVideoKind, safeExternalVideoUrl } from './siteVideoGallery';
import {
  isProtectedThemeMockVideo,
  isThemeMockVideoId,
  activeThemeVideoCatalog,
  isDisabledThemeMockId,
  type VideoKind,
} from './siteVideoCatalog';
import {
  approveSocialVideo,
  effectiveVideoModeration,
  isCustomerVisibleSocialVideo,
  rejectSocialVideo,
  reactivateSocialVideo,
  setSocialVideoPending,
  unpublishSocialVideo,
  validateSocialVideoForPublish,
  type VideoModerationStatus,
} from './videoModeration';
import {
  parseVideoUrl,
  type VideoPlatformMetadata,
} from './videoUrlMetadata';
import { youtubeThumbUrl } from './siteSocialFeed';

/* ------------------------------------------------------------------ */
/* Actor + permission (existing auth + ownership logic only)           */
/* ------------------------------------------------------------------ */

/** 'owner' manages their own salon; 'admin' additionally approves and manages protected records. */
export type VideoActorRole = 'owner' | 'admin';

export type VideoEditPermission =
  | 'authorized'
  | 'not-configured'
  | 'not-authenticated'
  | 'no-ownership'
  | 'ambiguous'
  | 'permission-denied'
  | 'error';

export interface VideoActorContext {
  permission: VideoEditPermission;
  role: VideoActorRole;
}

/**
 * Role claim values that mean "platform admin". Deliberately does NOT include
 * `owner_admin` (the salon-level "Owner / Admin" access role) — a salon owner
 * stays owner-tier for protected showcase records.
 */
export const VIDEO_ADMIN_ROLE_CLAIMS = ['admin', 'administrator', 'platform_admin', 'super_admin'] as const;

function claimIsAdmin(value: unknown): boolean {
  if (typeof value === 'string') {
    return (VIDEO_ADMIN_ROLE_CLAIMS as readonly string[]).includes(value.trim().toLowerCase());
  }
  if (Array.isArray(value)) return value.some((entry) => claimIsAdmin(entry));
  return false;
}

/**
 * Reads the admin claim from the standard Supabase session metadata
 * (`app_metadata` is server-signed; it cannot be forged from the browser).
 * No hardcoded user/salon ids, no env allowlists.
 */
export function hasAdminSessionClaim(
  user: { app_metadata?: unknown; user_metadata?: unknown } | null | undefined,
): boolean {
  if (!user || typeof user !== 'object') return false;
  const app = (user.app_metadata || {}) as Record<string, unknown>;
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  return (
    claimIsAdmin(app.role) ||
    claimIsAdmin(app.roles) ||
    claimIsAdmin(app.access_role) ||
    claimIsAdmin(meta.account_role) ||
    claimIsAdmin(meta.access_role) ||
    claimIsAdmin(meta.platform_role)
  );
}

/**
 * Maps the EXISTING session + ownership resolution onto a video-management
 * actor. Mirrors `galleryEditPermission` (14.6) with one addition: a session
 * carrying an admin claim is authorized at the platform level and does not
 * need a salon membership (admins manage protected/default records too).
 * The salon itself is still always the session-resolved one.
 */
export function resolveVideoActor(options: {
  supabaseConfigured: boolean;
  userPresent: boolean;
  isAdmin: boolean;
  resolution: { status: string } | null | undefined;
}): VideoActorContext {
  const role: VideoActorRole = options.isAdmin ? 'admin' : 'owner';

  if (!options.supabaseConfigured) {
    // Local onboarding draft — owner tier only (same rule as 14.6/14.7).
    return { permission: 'not-configured', role: 'owner' };
  }
  if (!options.userPresent) return { permission: 'not-authenticated', role: 'owner' };
  if (role === 'admin') return { permission: 'authorized', role };

  const resolution = options.resolution;
  if (!resolution) return { permission: 'not-configured', role: 'owner' };
  switch (resolution.status) {
    case 'not-configured':
      return { permission: 'not-configured', role: 'owner' };
    case 'not-authenticated':
      return { permission: 'not-authenticated', role: 'owner' };
    case 'resolved':
      return { permission: 'authorized', role: 'owner' };
    case 'no-membership':
      return { permission: 'no-ownership', role: 'owner' };
    case 'ambiguous':
      return { permission: 'ambiguous', role: 'owner' };
    case 'permission-denied':
      return { permission: 'permission-denied', role: 'owner' };
    default:
      return { permission: 'error', role: 'owner' };
  }
}

/** User-facing denial message (never exposes tokens, SQL, or ids). */
export function videoEditDeniedMessage(permission: VideoEditPermission): string | null {
  switch (permission) {
    case 'authorized':
      return null;
    case 'not-configured':
      return null; // offline onboarding draft
    case 'not-authenticated':
      return 'Please log in to manage your videos.';
    case 'no-ownership':
      return 'Your account is not linked to a salon.';
    case 'ambiguous':
      return 'Multiple salons are linked to your account. Please select one.';
    case 'permission-denied':
      return 'You do not have permission to manage these videos.';
    default:
      return 'Unable to verify your access right now.';
  }
}

/* ------------------------------------------------------------------ */
/* Capability matrix                                                   */
/* ------------------------------------------------------------------ */

/** Add / edit / replace — authorized owner or admin session, or the local draft. */
export function canManageOwnSalonVideos(actor: VideoActorContext): boolean {
  return actor.permission === 'authorized' || actor.permission === 'not-configured';
}

export const canAddVideo = canManageOwnSalonVideos;
export const canEditVideo = canManageOwnSalonVideos;
export const canReplaceVideo = canManageOwnSalonVideos;

/** Admin-only: approve / reject / set-pending salon videos. */
export function canApproveVideos(actor: VideoActorContext): boolean {
  return actor.permission === 'authorized' && actor.role === 'admin';
}

/** Admin-only: disable / restore protected theme showcase records for the salon. */
export function canManageThemeMockRecords(actor: VideoActorContext): boolean {
  return canApproveVideos(actor);
}

/**
 * Delete rule (Phase 15.5 hardened, 15.6 extended):
 *   - owner rows → deletable by any authorized manager of this salon.
 *   - protected showcase records → NEVER by an owner; only a verified admin.
 */
export function canDeleteVideo(
  actor: VideoActorContext,
  video: Pick<SocialVideo, 'id' | 'externalVideoId' | 'dateAdded'> | null | undefined,
): boolean {
  if (!canManageOwnSalonVideos(actor)) return false;
  if (isProtectedThemeMockVideo(video) || isThemeMockVideoId(video?.id)) {
    return actor.permission === 'authorized' && actor.role === 'admin';
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Mutation results                                                    */
/* ------------------------------------------------------------------ */

export type VideoMutationResult =
  | { ok: true; videos: SocialVideo[]; video?: SocialVideo; materializedOverride?: boolean }
  | { ok: false; error: string };

export type SalonVideoMutationResult =
  | { ok: true; data: SalonData }
  | { ok: false; error: string };

const DENIED = 'You are not allowed to change videos for this salon.';
const PROTECTED_DELETE = 'Theme showcase videos cannot be permanently deleted.';
const ADMIN_ONLY = 'Only an admin can manage protected showcase videos.';

/* ------------------------------------------------------------------ */
/* Metadata edits                                                      */
/* ------------------------------------------------------------------ */

export interface VideoMetadataEditInput {
  title?: string;
  description?: string;
  channelName?: string;
  thumbnailUrl?: string;
  /** Re-link to another of the five themes (owner rows only; mocks are locked). */
  themeId?: string | null;
  videoKind?: 'short' | 'long' | null;
}

/** Validates edit inputs; returns the list of problems (empty = valid). */
export function validateVideoMetadataEdits(edits: VideoMetadataEditInput): string[] {
  const errors: string[] = [];
  if (edits.title !== undefined && !edits.title.trim()) {
    errors.push('Video title is required.');
  }
  if (edits.thumbnailUrl !== undefined && edits.thumbnailUrl.trim() && !isSafeMediaUrl(edits.thumbnailUrl)) {
    errors.push('Thumbnail URL is unsafe.');
  }
  if (edits.themeId !== undefined && edits.themeId !== null && edits.themeId !== '' && !isSiteHeaderTheme(edits.themeId)) {
    errors.push('Video theme is invalid.');
  }
  if (edits.videoKind !== undefined && edits.videoKind !== null && edits.videoKind !== 'short' && edits.videoKind !== 'long') {
    errors.push('Video type must be Short or Long.');
  }
  return errors;
}

/** Pure edit application (validation already passed). Never mutates input. */
function applyMetadataEdits(video: SocialVideo, edits: VideoMetadataEditInput): SocialVideo {
  const next: SocialVideo = { ...video };
  if (edits.title !== undefined) next.title = edits.title.trim();
  if (edits.description !== undefined) next.description = edits.description.trim() || undefined;
  if (edits.channelName !== undefined) next.channelName = edits.channelName.trim() || undefined;
  if (edits.thumbnailUrl !== undefined) next.thumbnailUrl = edits.thumbnailUrl.trim();
  if (edits.themeId !== undefined) next.themeId = edits.themeId || null;
  if (edits.videoKind !== undefined) next.videoKind = edits.videoKind || null;
  return next;
}

/** What the management panel is pointing at. */
export type ManagedVideoTarget =
  | { kind: 'owner'; id: string }
  | { kind: 'mock'; mock: SocialVideo };

function findOwnerVideo(list: readonly SocialVideo[], id: string): SocialVideo | null {
  const found = (list || []).find((video) => video.id === id);
  if (!found) return null;
  // Protected rows are never edited "in place" — treat them as missing so the
  // caller routes through the mock materialisation path instead.
  return isProtectedThemeMockVideo(found) ? null : found;
}

/**
 * Edit video metadata (title / description / channel / thumbnail / theme /
 * short-long type).
 *
 *   - Owner row → edited in place (stays in the SAME salon list it came from).
 *   - Protected showcase record → the protected row is never mutated; the edit
 *     is materialised as an owner-owned override (`replacesMockId`) pinned to
 *     the mock's own theme + kind so the salon+theme+type link is preserved.
 */
export function editManagedVideoMetadata(
  list: readonly SocialVideo[] | null | undefined,
  target: ManagedVideoTarget,
  edits: VideoMetadataEditInput,
  actor: VideoActorContext,
  options: { newId?: string; now?: string } = {},
): VideoMutationResult {
  if (!canEditVideo(actor)) return { ok: false, error: DENIED };
  const problems = validateVideoMetadataEdits(edits);
  if (problems.length > 0) return { ok: false, error: problems.join(' ') };

  const source = Array.isArray(list) ? list : [];

  if (target.kind === 'mock') {
    const mock = target.mock;
    if (!isProtectedThemeMockVideo(mock) && !isThemeMockVideoId(mock?.id)) {
      return { ok: false, error: 'That showcase video could not be found.' };
    }
    // Showcase videos stay pinned to their own theme + salon linkage.
    if (edits.themeId !== undefined && edits.themeId && edits.themeId !== mock.themeId) {
      return { ok: false, error: 'Showcase videos stay on their own theme.' };
    }
    const newId = (options.newId || '').trim() || `v-override-${Date.now()}`;
    if (isThemeMockVideoId(newId) || source.some((video) => video.id === newId)) {
      return { ok: false, error: 'Could not create the override id. Try again.' };
    }
    const override = applyMetadataEdits(
      {
        ...mock,
        id: newId,
        replacesMockId: mock.id,
        themeId: mock.themeId ?? null,
        videoKind: mock.videoKind ?? null,
        status: 'active',
        moderation: 'approved',
        rejectionReason: undefined,
        reviewedAt: options.now,
        dateAdded: 'Today',
      },
      edits,
    );
    return { ok: true, videos: [override, ...source], video: override, materializedOverride: true };
  }

  const existing = findOwnerVideo(source, target.id);
  if (!existing) return { ok: false, error: 'That video could not be found in this salon.' };
  const updated = applyMetadataEdits(existing, edits);
  return {
    ok: true,
    videos: source.map((video) => (video.id === existing.id ? updated : video)),
    video: updated,
  };
}

/* ------------------------------------------------------------------ */
/* Replace video (new URL, re-derived platform data)                   */
/* ------------------------------------------------------------------ */

export interface VideoReplaceResultFields {
  url: string;
  originalPlatformUrl: string;
  platform: SocialVideo['platform'];
  externalVideoId: string | null;
  thumbnailUrl: string;
  videoKind: VideoKind;
  /** Populated from the Phase 15.2 fetch when available. */
  title?: string;
  description?: string;
  channelName?: string;
}

/**
 * Validates the replacement URL and derives the new platform fields.
 * Reuses the Phase 15.2 parser (pure, no network) and the 15.2/15.4 metadata
 * snapshot when the caller already fetched it — no second fetch system.
 */
export function buildVideoReplaceFields(
  rawUrl: string,
  meta: VideoPlatformMetadata | null | undefined,
  kindOverride?: 'short' | 'long' | null,
): { ok: true; fields: VideoReplaceResultFields } | { ok: false; error: string } {
  const parsed = parseVideoUrl(rawUrl);
  if (parsed.ok === false) return { ok: false, error: parsed.message };

  const pastedKind = resolveVideoKind({ url: parsed.originalUrl, platform: parsed.platform });
  const videoKind: VideoKind = kindOverride === 'short' || kindOverride === 'long' ? kindOverride : pastedKind;

  // Retain the existing canonical storage field for compatibility, while the
  // untouched paste below is the only external destination used in 15.7.
  const url = parsed.platform === 'youtube' && videoKind === 'short'
    ? `https://www.youtube.com/shorts/${parsed.externalVideoId}`
    : parsed.canonicalUrl || parsed.originalUrl;

  const thumbFromMeta = meta && isSafeMediaUrl(meta.thumbnailUrl) ? meta.thumbnailUrl.trim() : '';
  const derivedThumb =
    parsed.platform === 'youtube'
      ? (() => {
          const derived = youtubeThumbUrl(parsed.externalVideoId);
          return isSafeMediaUrl(derived) ? derived : '';
        })()
      : '';

  return {
    ok: true,
    fields: {
      url,
      originalPlatformUrl: parsed.originalUrl,
      platform: parsed.platform,
      externalVideoId: parsed.externalVideoId,
      thumbnailUrl: thumbFromMeta || derivedThumb,
      videoKind,
      title: meta?.title?.trim() || undefined,
      description: meta?.description?.trim() || undefined,
      channelName: meta?.channelName?.trim() || undefined,
    },
  };
}

/**
 * Replace a video's URL (and, when fresh metadata was fetched, its title /
 * description / channel / thumbnail). Owner rows are replaced in place;
 * protected showcase records are materialised as owner overrides — the
 * protected original stays in the catalog and is never "replaced away".
 */
export function replaceManagedVideoUrl(
  list: readonly SocialVideo[] | null | undefined,
  target: ManagedVideoTarget,
  rawUrl: string,
  meta: VideoPlatformMetadata | null | undefined,
  actor: VideoActorContext,
  options: { newId?: string; now?: string; keepMetadata?: boolean } = {},
): VideoMutationResult {
  if (!canReplaceVideo(actor)) return { ok: false, error: DENIED };
  const built = buildVideoReplaceFields(rawUrl, meta);
  if (built.ok === false) return { ok: false, error: built.error };
  const { fields } = built;
  const source = Array.isArray(list) ? list : [];

  const edits: VideoMetadataEditInput = {
    // Fresh platform metadata replaces stale values; without a fetch the
    // owner keeps their existing copy (keepMetadata default true).
    ...(options.keepMetadata === false
      ? {
          title: fields.title || '',
          description: fields.description,
          channelName: fields.channelName,
        }
      : fields.title || fields.description || fields.channelName
        ? {
            ...(fields.title ? { title: fields.title } : {}),
            ...(fields.description ? { description: fields.description } : {}),
            ...(fields.channelName ? { channelName: fields.channelName } : {}),
          }
        : {}),
    ...(fields.thumbnailUrl ? { thumbnailUrl: fields.thumbnailUrl } : {}),
    videoKind: fields.videoKind,
  };

  if (target.kind === 'mock') {
    const mock = target.mock;
    if (!isProtectedThemeMockVideo(mock) && !isThemeMockVideoId(mock?.id)) {
      return { ok: false, error: 'That showcase video could not be found.' };
    }
    const newId = (options.newId || '').trim() || `v-override-${Date.now()}`;
    if (isThemeMockVideoId(newId) || source.some((video) => video.id === newId)) {
      return { ok: false, error: 'Could not create the override id. Try again.' };
    }
    const base: SocialVideo = {
      ...mock,
      id: newId,
      replacesMockId: mock.id,
      themeId: mock.themeId ?? null,
      url: fields.url,
      originalPlatformUrl: fields.originalPlatformUrl,
      platform: fields.platform,
      externalVideoId: fields.externalVideoId,
      thumbnailUrl: fields.thumbnailUrl || mock.thumbnailUrl,
      videoKind: fields.videoKind,
      status: 'active',
      moderation: 'approved',
      rejectionReason: undefined,
      reviewedAt: options.now,
      dateAdded: 'Today',
    };
    const override = applyMetadataEdits(base, edits);
    return { ok: true, videos: [override, ...source], video: override, materializedOverride: true };
  }

  const existing = findOwnerVideo(source, target.id);
  if (!existing) return { ok: false, error: 'That video could not be found in this salon.' };
  const replaced = applyMetadataEdits(
    {
      ...existing,
      url: fields.url,
      originalPlatformUrl: fields.originalPlatformUrl,
      platform: fields.platform,
      externalVideoId: fields.externalVideoId,
      thumbnailUrl: fields.thumbnailUrl || existing.thumbnailUrl,
    },
    edits,
  );
  return {
    ok: true,
    videos: source.map((video) => (video.id === existing.id ? replaced : video)),
    video: replaced,
  };
}

/* ------------------------------------------------------------------ */
/* Delete                                                              */
/* ------------------------------------------------------------------ */

/**
 * Delete an OWNED row. Protected showcase records are refused for owners
 * (and for the offline draft) — admins use `disableThemeMockForSalon` for the
 * salon-scoped removal of showcase records.
 */
export function deleteManagedVideoRecord(
  list: readonly SocialVideo[] | null | undefined,
  id: string,
  actor: VideoActorContext,
): VideoMutationResult {
  const source = Array.isArray(list) ? list : [];
  const target = source.find((video) => video.id === id);
  if (!target) {
    return isThemeMockVideoId(id)
      ? { ok: false, error: PROTECTED_DELETE }
      : { ok: false, error: 'That video could not be found in this salon.' };
  }
  if (!canDeleteVideo(actor, target)) return { ok: false, error: PROTECTED_DELETE };
  return { ok: true, videos: source.filter((video) => video.id !== id), video: target };
}

/**
 * Admin-only: remove a protected showcase record FOR THIS SALON. Implemented
 * as a per-salon tombstone (`disabledThemeVideoIds`) plus removal of any
 * overrides derived from the record — the shared protected catalog is never
 * mutated, so every other salon keeps the default.
 */
export function disableThemeMockForSalon(
  data: SalonData,
  mockId: string,
  actor: VideoActorContext,
): SalonVideoMutationResult {
  if (!canManageThemeMockRecords(actor)) return { ok: false, error: ADMIN_ONLY };
  if (!isThemeMockVideoId(mockId)) return { ok: false, error: 'That is not a showcase video record.' };
  const disabled = Array.isArray(data.disabledThemeVideoIds) ? data.disabledThemeVideoIds : [];
  const nextDisabled = disabled.includes(mockId) ? disabled : [...disabled, mockId];
  return {
    ok: true,
    data: {
      ...data,
      disabledThemeVideoIds: nextDisabled,
      socialVideos: (data.socialVideos || []).filter((video) => video.replacesMockId !== mockId),
    },
  };
}

/** Admin-only: bring back a previously disabled showcase record for this salon. */
export function restoreThemeMockForSalon(
  data: SalonData,
  mockId: string,
  actor: VideoActorContext,
): SalonVideoMutationResult {
  if (!canManageThemeMockRecords(actor)) return { ok: false, error: ADMIN_ONLY };
  const disabled = Array.isArray(data.disabledThemeVideoIds) ? data.disabledThemeVideoIds : [];
  if (!disabled.includes(mockId)) return { ok: true, data };
  return {
    ok: true,
    data: { ...data, disabledThemeVideoIds: disabled.filter((id) => id !== mockId) },
  };
}

/* ------------------------------------------------------------------ */
/* Moderation + activation (admin approve/manage)                      */
/* ------------------------------------------------------------------ */

export type VideoModerationAction = 'approve' | 'reject' | 'pending';

/**
 * Admin approve/manage of a salon video. Approve runs the publish gate first
 * (`validateSocialVideoForPublish`) — an invalid video is never approved.
 */
export function moderateManagedVideo(
  list: readonly SocialVideo[] | null | undefined,
  id: string,
  action: VideoModerationAction,
  actor: VideoActorContext,
  options: { reason?: string; now?: string } = {},
): VideoMutationResult {
  if (!canApproveVideos(actor)) return { ok: false, error: 'Only an admin can approve or reject videos.' };
  const source = Array.isArray(list) ? list : [];
  const existing = findOwnerVideo(source, id);
  if (!existing) return { ok: false, error: 'That video could not be found in this salon.' };

  if (action === 'approve') {
    const problems = validateSocialVideoForPublish(existing);
    if (problems.length > 0) return { ok: false, error: problems.join(' ') };
  }

  const next =
    action === 'approve'
      ? approveSocialVideo(existing, options.now)
      : action === 'reject'
        ? rejectSocialVideo(existing, options.reason || '', options.now)
        : setSocialVideoPending(existing);

  return { ok: true, videos: source.map((video) => (video.id === id ? next : video)), video: next };
}

/**
 * Publish/unpublish (status) for an owned row. Owner + admin may unpublish
 * their salon's rows; only approved content can be reactivated.
 */
export function setManagedVideoActive(
  list: readonly SocialVideo[] | null | undefined,
  id: string,
  active: boolean,
  actor: VideoActorContext,
): VideoMutationResult {
  if (!canManageOwnSalonVideos(actor)) return { ok: false, error: DENIED };
  const source = Array.isArray(list) ? list : [];
  const existing = findOwnerVideo(source, id);
  if (!existing) return { ok: false, error: 'That video could not be found in this salon.' };
  if (!safeExternalVideoUrl(existing.url)) return { ok: false, error: 'Video URL is missing or unsafe.' };

  const next = active ? reactivateSocialVideo(existing) : unpublishSocialVideo(existing);
  if (active && next.status !== 'active') {
    return { ok: false, error: 'Only approved videos can be republished.' };
  }
  return { ok: true, videos: source.map((video) => (video.id === id ? next : video)), video: next };
}

/* ------------------------------------------------------------------ */
/* Management projection (what the panel lists)                        */
/* ------------------------------------------------------------------ */

export interface ManagedVideoRow {
  /** Stable key (video id). */
  key: string;
  video: SocialVideo;
  origin: 'owner' | 'theme';
  /** Protected theme showcase record (catalog row, not in owner storage). */
  isProtected: boolean;
  /** Owner row that customises a showcase record (`replacesMockId` set). */
  isOverride: boolean;
  kind: VideoKind;
  themeId: SiteHeaderThemeId | null;
  moderation: VideoModerationStatus;
  active: boolean;
  customerVisible: boolean;
}

/**
 * The salon's complete manageable video set for the ACTIVE theme:
 *   1. every owner row (any review state — management must see hidden ones),
 *   2. the theme's protected showcase records that are NOT shadowed by an
 *      owner override (same external video id, same rule the public fill
 *      dedups with) and NOT admin-disabled for this salon.
 *
 * Only the caller's own salon payload is ever read — no salon id input exists.
 */
export function managedVideoRowsForSalon(
  data: Pick<SalonData, 'socialVideos' | 'disabledThemeVideoIds'>,
  themeId: SiteHeaderThemeId,
): ManagedVideoRow[] {
  const ownerList = Array.isArray(data.socialVideos) ? data.socialVideos : [];
  const disabled = data.disabledThemeVideoIds;

  const rows: ManagedVideoRow[] = ownerList.map((video) => ({
    key: video.id,
    video,
    origin: 'owner' as const,
    isProtected: isProtectedThemeMockVideo(video),
    isOverride: !!video.replacesMockId,
    kind: resolveVideoKind(video),
    themeId: isSiteHeaderTheme(video.themeId || '') ? (video.themeId as SiteHeaderThemeId) : null,
    moderation: effectiveVideoModeration(video),
    active: video.status !== 'inactive',
    customerVisible: isCustomerVisibleSocialVideo(video),
  }));

  // External ids shadowed by owner rows visible on this theme (fill rule).
  const shadowedExternalIds = new Set(
    rows
      .filter((row) => row.origin === 'owner' && row.customerVisible)
      .filter((row) => !row.themeId || row.themeId === themeId)
      .map((row) => row.video.externalVideoId)
      .filter((id): id is string => typeof id === 'string' && !!id),
  );

  for (const mock of activeThemeVideoCatalog(themeId, disabled)) {
    if (mock.externalVideoId && shadowedExternalIds.has(mock.externalVideoId)) continue;
    rows.push({
      key: mock.id,
      video: mock,
      origin: 'theme',
      isProtected: true,
      isOverride: false,
      kind: resolveVideoKind(mock),
      themeId: isSiteHeaderTheme(mock.themeId || '') ? (mock.themeId as SiteHeaderThemeId) : themeId,
      moderation: 'approved',
      active: true,
      customerVisible: true,
    });
  }

  // Shorts first, then longs — stable within each origin, mirroring the gallery.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ka = a.row.kind === 'short' ? 0 : 1;
      const kb = b.row.kind === 'short' ? 0 : 1;
      if (ka !== kb) return ka - kb;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Showcase records the admin disabled for THIS salon (restore UI). */
export function disabledThemeMocksForSalon(
  data: Pick<SalonData, 'disabledThemeVideoIds'>,
  themeId: SiteHeaderThemeId,
): SocialVideo[] {
  const disabled = Array.isArray(data.disabledThemeVideoIds) ? data.disabledThemeVideoIds : [];
  if (disabled.length === 0) return [];
  return activeThemeVideoCatalog(themeId, null).filter((mock) =>
    isDisabledThemeMockId(disabled, mock.id),
  );
}
