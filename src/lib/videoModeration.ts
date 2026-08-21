/**
 * PHASE 15.6 — VIDEO APPROVAL / MODERATION layer.
 *
 * A thin moderation state machine on top of the EXISTING 15.1–15.5 video
 * gallery — no duplicate video architecture, no new tables/columns:
 *
 *   Saved → (Pending) → Approve/Reject → Published/Rejected.
 *
 * Customer visibility is exactly: moderation approved (or grandfathered
 * undefined — Phase 15.1–15.5 saved data stays public) AND
 * `status !== 'inactive'`. Pending / rejected / unpublished videos never
 * reach the public gallery; the 15.3 fill simply tops the theme up from the
 * protected catalog so the 5+5 contract holds.
 *
 * This module is deliberately free of authorization decisions (see
 * `videoManagement.ts` for the owner/admin capability matrix) and free of
 * credentials — it never saw and never needs a salon id.
 */
import type { SocialVideo } from '../types';
import { isSiteHeaderTheme } from './siteNavigation';
import { originalDestinationForVideo } from './originalVideoDestination';

/* ------------------------------------------------------------------ */
/* Local URL safety (mirrors the siteVideoGallery rules)               */
/* ------------------------------------------------------------------ */

/** http/https external links only; never javascript: or control chars. */
function isSafeExternalVideoUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (/[\u0000-\u001F\u007F]/.test(url)) return false;
  return true;
}

/** Thumbnail safety: http(s) or data:image URLs (same rule the gallery uses). */
function isSafeThumbnailUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  if (/^data:image\//i.test(url)) return true;
  return isSafeExternalVideoUrl(url);
}

/* ------------------------------------------------------------------ */
/* Status types                                                        */
/* ------------------------------------------------------------------ */

export type VideoModerationStatus = 'pending' | 'approved' | 'rejected';

export const VIDEO_MODERATION_STATUSES: readonly VideoModerationStatus[] = [
  'pending',
  'approved',
  'rejected',
];

export type VideoLifecycleStatus = 'active' | 'inactive';

/** Effective moderation — absent means grandfathered-approved (existing data). */
export function effectiveVideoModeration(
  video: Pick<SocialVideo, 'moderation'> | null | undefined,
): VideoModerationStatus {
  if (!video || !video.moderation) return 'approved';
  return video.moderation;
}

/* ------------------------------------------------------------------ */
/* Customer visibility                                                 */
/* ------------------------------------------------------------------ */

/** Only approved + active content is public; pending/rejected/unpublished hidden. */
export function isCustomerVisibleSocialVideo(video: SocialVideo | null | undefined): boolean {
  if (!video) return false;
  if (video.status === 'inactive') return false;
  return effectiveVideoModeration(video) === 'approved';
}

/** Alias — a published video is exactly a customer-visible video. */
export function isPublishedSocialVideo(video: SocialVideo | null | undefined): boolean {
  return isCustomerVisibleSocialVideo(video);
}

/* ------------------------------------------------------------------ */
/* State transitions                                                   */
/* ------------------------------------------------------------------ */

export function approveSocialVideo<T extends SocialVideo>(video: T, now = new Date().toISOString()): T {
  return { ...video, moderation: 'approved', rejectionReason: undefined, reviewedAt: now };
}

export function rejectSocialVideo<T extends SocialVideo>(
  video: T,
  reason: string,
  now = new Date().toISOString(),
): T {
  return {
    ...video,
    moderation: 'rejected',
    rejectionReason: (reason || 'Rejected').trim() || 'Rejected',
    status: 'inactive',
    reviewedAt: now,
  };
}

/** Pending review — video is hidden from the customer gallery until approved. */
export function setSocialVideoPending<T extends SocialVideo>(video: T): T {
  return { ...video, moderation: 'pending' };
}

/** Unpublish keeps the record but hides it from customers (status only). */
export function unpublishSocialVideo<T extends SocialVideo>(video: T): T {
  return { ...video, status: 'inactive' };
}

/** Only approved (or grandfathered) content can be reactivated. */
export function reactivateSocialVideo<T extends SocialVideo>(video: T): T {
  if (effectiveVideoModeration(video) !== 'approved') return video;
  return { ...video, status: 'active' };
}

export function setVideoModerationStatus<T extends SocialVideo>(
  video: T,
  status: VideoModerationStatus,
  reason?: string,
): T {
  if (status === 'approved') return approveSocialVideo(video);
  if (status === 'rejected') return rejectSocialVideo(video, reason || '');
  return setSocialVideoPending(video);
}

/* ------------------------------------------------------------------ */
/* Publish validation                                                  */
/* ------------------------------------------------------------------ */

/**
 * The publish gate. A video must be valid BEFORE it can be approved:
 * safe external URL, a title, valid theme scope when set, valid short/long
 * kind when set, and a safe thumbnail when set. The "correct salon"
 * requirement is enforced by the caller's ownership resolution — the video
 * itself never carries an invented salon id.
 */
export function validateSocialVideoForPublish(video: SocialVideo | null | undefined): string[] {
  const errors: string[] = [];
  if (!video || typeof video !== 'object') return ['Video record is missing.'];

  if (!originalDestinationForVideo(video).ok) {
    errors.push('Video URL must be a safe single-video link on its stated original platform.');
  }
  if (!(video.title || '').trim()) errors.push('Video title is required.');
  if (video.themeId && !isSiteHeaderTheme(video.themeId)) errors.push('Video theme is invalid.');
  if (video.videoKind && video.videoKind !== 'short' && video.videoKind !== 'long') {
    errors.push('Video type must be Short or Long.');
  }
  if (video.thumbnailUrl && !isSafeThumbnailUrl(video.thumbnailUrl)) {
    errors.push('Thumbnail URL is unsafe.');
  }
  return errors;
}

export function canPublishSocialVideo(video: SocialVideo | null | undefined): boolean {
  return validateSocialVideoForPublish(video).length === 0;
}
