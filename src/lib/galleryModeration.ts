/**
 * PHASE 14.7 — OWNER/ADMIN GALLERY APPROVAL (moderation layer).
 *
 * A thin moderation state machine on top of the EXISTING 14.1/14.6 gallery —
 * no duplicate gallery architecture, no booking/payment/service changes.
 *
 *   Upload → Pending → Approve/Reject → Published/Rejected.
 *
 * Customer visibility is exactly: moderation approved (or grandfathered
 * undefined) AND `status !== 'inactive'`. Pending / rejected / unpublished
 * content never reaches the public gallery.
 *
 * Security: approval/rejection is gated on the SAME existing ownership logic
 * (the caller passes the `galleryEditPermission` resolved by `useAuth` +
 * `resolveOwnerSalonId`); no salon/theme id is invented or trusted from the
 * client, and no storage/service-role credential lives here.
 */
import type { GalleryImage, SalonData } from '../types';
import { isSafeMediaUrl } from './siteHero';
import { isSiteHeaderTheme } from './siteNavigation';
import type { SiteHeaderThemeId } from './siteNavigation';
import { directoryServicesForTheme } from './siteServiceDirectory';

/* ------------------------------------------------------------------ */
/* Status types                                                        */
/* ------------------------------------------------------------------ */

export type GalleryModerationStatus = 'pending' | 'approved' | 'rejected';

export const GALLERY_MODERATION_STATUSES: readonly GalleryModerationStatus[] = [
  'pending',
  'approved',
  'rejected',
];

/** Effective moderation — absent means grandfathered-approved (existing data). */
export function effectiveModeration(item: GalleryImage | null | undefined): GalleryModerationStatus {
  if (!item || !item.moderation) return 'approved';
  return item.moderation;
}

/* ------------------------------------------------------------------ */
/* Customer visibility                                                 */
/* ------------------------------------------------------------------ */

/** Only approved + active content is public; pending/rejected/unpublished hidden. */
export function isCustomerVisibleGalleryItem(item: GalleryImage | null | undefined): boolean {
  if (!item) return false;
  if (item.status === 'inactive') return false;
  return effectiveModeration(item) === 'approved';
}

/** Alias — a published item is exactly a customer-visible item. */
export function isPublishedGalleryItem(item: GalleryImage | null | undefined): boolean {
  return isCustomerVisibleGalleryItem(item);
}

/* ------------------------------------------------------------------ */
/* State transitions                                                   */
/* ------------------------------------------------------------------ */

export function approveGalleryItem(item: GalleryImage, now = new Date().toISOString()): GalleryImage {
  return { ...item, moderation: 'approved', rejectionReason: undefined, reviewedAt: now };
}

export function rejectGalleryItem(item: GalleryImage, reason: string, now = new Date().toISOString()): GalleryImage {
  return {
    ...item,
    moderation: 'rejected',
    rejectionReason: (reason || 'Rejected').trim() || 'Rejected',
    status: 'inactive',
    reviewedAt: now,
  };
}

export function unpublishGalleryItem(item: GalleryImage): GalleryImage {
  return { ...item, status: 'inactive' };
}

/** Only approved (or grandfathered) content can be reactivated. */
export function reactivateGalleryItem(item: GalleryImage): GalleryImage {
  if (effectiveModeration(item) !== 'approved') return item;
  return { ...item, status: 'active' };
}

export function setGalleryModerationStatus(
  item: GalleryImage,
  status: GalleryModerationStatus,
  reason?: string,
): GalleryImage {
  if (status === 'approved') return approveGalleryItem(item);
  if (status === 'rejected') return rejectGalleryItem(item, reason || '');
  return { ...item, moderation: 'pending' };
}

/* ------------------------------------------------------------------ */
/* Publish validation                                                  */
/* ------------------------------------------------------------------ */

/**
 * The publish gate. An item must be valid BEFORE it can be approved:
 * safe image, valid theme, safe before image, and a linked service that
 * belongs to the ITEM's own theme (cross-theme mapping is rejected).
 * The "correct salon" requirement is enforced by the caller's ownership
 * resolution — the item itself never carries an invented salon id.
 */
export function validateGalleryItemForPublish(
  data: SalonData,
  item: GalleryImage,
  activeThemeId: SiteHeaderThemeId,
): string[] {
  const errors: string[] = [];

  if (!isSafeMediaUrl(item.url)) errors.push('Gallery image URL is missing or unsafe.');

  let itemTheme: SiteHeaderThemeId = activeThemeId;
  if (item.themeId) {
    if (!isSiteHeaderTheme(item.themeId)) {
      errors.push('Gallery theme is invalid.');
    } else {
      itemTheme = item.themeId;
    }
  }

  if (item.beforeUrl && !isSafeMediaUrl(item.beforeUrl)) {
    errors.push('Before image URL is unsafe.');
  }

  if (item.serviceId) {
    const linked = directoryServicesForTheme(data, itemTheme).find((service) => service.id === item.serviceId);
    if (!linked) errors.push('Linked service does not belong to this theme.');
  }

  return errors;
}

export function canPublishGalleryItem(
  data: SalonData,
  item: GalleryImage,
  activeThemeId: SiteHeaderThemeId,
): boolean {
  return validateGalleryItemForPublish(data, item, activeThemeId).length === 0;
}

/* ------------------------------------------------------------------ */
/* Authorization                                                       */
/* ------------------------------------------------------------------ */

/**
 * Moderation is allowed only for an authorized owner/admin session, or the
 * local onboarding draft (`not-configured`, same rule the rest of the wizard
 * uses when Supabase is off). Everything else — signed out, no membership,
 * ambiguous, permission-denied, error — is blocked.
 */
export function canModerateGallery(permission: string): boolean {
  return permission === 'authorized' || permission === 'not-configured';
}
