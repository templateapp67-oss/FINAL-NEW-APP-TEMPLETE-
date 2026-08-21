/**
 * PHASE 14.6 — OWNER GALLERY MANAGEMENT helpers (all five themes).
 *
 * The management layer for `SalonData.gallery`. It reuses the EXISTING gallery
 * architecture (Phase 14.1's `GalleryImage` shape + `siteGallery` helpers)
 * instead of creating a second gallery system:
 *
 *   - Media validation (type + size) with a clean error string.
 *   - Theme scoping via the existing `ownerGalleryItemBelongsToTheme` rule and
 *     the existing five-theme ids (`siteNavigation`), so an item can only ever
 *     appear on the theme it is assigned to.
 *   - Service linking resolved ONLY through `directoryServicesForTheme` — a
 *     foreign theme's service can never be linked; invalid ids fail gracefully.
 *   - Before/After pairs are a single theme-scoped record, so both images always
 *     share the same theme (and the invariant is exposed for validation).
 *   - Display order + activate/deactivate + the customer-facing projection
 *     (active + theme-scoped + ordered, unsafe URLs dropped).
 *   - Authorization reuses the EXISTING `useAuth` + `resolveOwnerSalonId`
 *     ownership logic; no salon/theme ids are invented here.
 *
 * No Supabase credentials, no service-role key, no database writes live in this
 * module — the wizard already persists `SalonData` through its own
 * localStorage onboarding payload.
 */
import type { GalleryImage, SalonData, Service } from '../types';
import { directoryServicesForTheme } from './siteServiceDirectory';
import { isSafeMediaUrl } from './siteHero';
import { ownerGalleryItemBelongsToTheme, mapOwnerGalleryCategory } from './siteGallery';
import { isCustomerVisibleGalleryItem } from './galleryModeration';
import { isSiteHeaderTheme, SITE_HEADER_THEME_IDS } from './siteNavigation';
import type { SiteHeaderThemeId } from './siteNavigation';
import { THEME_LABELS } from './themeServices';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Reasonable gallery image cap (kept deliberately loose for data URLs). */
export const GALLERY_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const GALLERY_ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

/** Generic owner category tags — valid on every theme (mapped per theme). */
export const GALLERY_OWNER_CATEGORIES = ['Interior', 'Details', 'General', 'Hair', 'Barber', 'Beauty'] as const;
export type GalleryOwnerCategory = (typeof GALLERY_OWNER_CATEGORIES)[number];

export const GALLERY_STATUSES = ['active', 'inactive'] as const;
export type GalleryStatus = (typeof GALLERY_STATUSES)[number];

/** The five themes the gallery can be assigned to (display order). */
export const GALLERY_MANAGEMENT_THEMES: SiteHeaderThemeId[] = [...SITE_HEADER_THEME_IDS];

export function galleryManagementThemeLabel(themeId: string): string {
  return THEME_LABELS[themeId as keyof typeof THEME_LABELS] || themeId;
}

/* ------------------------------------------------------------------ */
/* Media validation                                                    */
/* ------------------------------------------------------------------ */

export function validateGalleryImageType(file: { type?: string } | null | undefined): string | null {
  if (!file) return 'Please choose an image.';
  const type = (file.type || '').toLowerCase();
  if (!type.startsWith('image/')) return 'Please upload an image file (JPG, PNG, WEBP, or GIF).';
  return null;
}

export function validateGalleryImageSize(file: { size?: number } | null | undefined): string | null {
  if (!file) return 'Please choose an image.';
  if (typeof file.size === 'number' && file.size > GALLERY_MAX_FILE_BYTES) {
    return `Image must be ${Math.round(GALLERY_MAX_FILE_BYTES / 1024 / 1024)} MB or smaller.`;
  }
  return null;
}

/** Combined upload gate — returns the first problem or null when acceptable. */
export function validateGalleryImageFile(file: { type?: string; size?: number } | null | undefined): string | null {
  return validateGalleryImageType(file) || validateGalleryImageSize(file);
}

/* ------------------------------------------------------------------ */
/* Theme scoping                                                       */
/* ------------------------------------------------------------------ */

/** The explicit theme the item is scoped to, or null (inherits salon theme). */
export function galleryItemTheme(item: GalleryImage | null | undefined): SiteHeaderThemeId | null {
  if (!item?.themeId) return null;
  return isSiteHeaderTheme(item.themeId) ? item.themeId : null;
}

/** An item shows on a theme when it is unscoped or scoped to that theme. */
export function galleryItemAppearsOnTheme(item: GalleryImage, themeId: SiteHeaderThemeId): boolean {
  return ownerGalleryItemBelongsToTheme(item, themeId);
}

/** The gallery work category the item maps to on a given theme. */
export function galleryWorkCategoryForTheme(item: GalleryImage, themeId: SiteHeaderThemeId): string {
  return mapOwnerGalleryCategory(themeId, item.category);
}

export function isGalleryOwnerCategory(value: unknown): value is GalleryOwnerCategory {
  return typeof value === 'string' && (GALLERY_OWNER_CATEGORIES as readonly string[]).includes(value);
}

/** Normalises a raw category tag to a valid owner tag ('General' fallback). */
export function normalizeGalleryCategory(value: string | undefined): GalleryOwnerCategory {
  const key = (value || 'General').trim();
  return isGalleryOwnerCategory(key) ? key : 'General';
}

/* ------------------------------------------------------------------ */
/* Service link (theme-scoped)                                         */
/* ------------------------------------------------------------------ */

export function galleryServicesForTheme(data: SalonData, themeId: SiteHeaderThemeId): Service[] {
  return directoryServicesForTheme(data, themeId);
}

/** The linked service when it belongs to the ACTIVE theme, else null. */
export function resolveLinkedGalleryService(
  data: SalonData,
  item: GalleryImage,
  themeId: SiteHeaderThemeId,
): Service | null {
  if (!item.serviceId) return null;
  const service = directoryServicesForTheme(data, themeId).find((candidate) => candidate.id === item.serviceId);
  return service || null;
}

export type LinkServiceResult =
  | { ok: true; service: Service }
  | { ok: false; error: string };

/** Validates + resolves a service link for a theme. Cross-theme → error. */
export function linkGalleryService(
  data: SalonData,
  serviceId: string | null | undefined,
  themeId: SiteHeaderThemeId,
): LinkServiceResult {
  if (!serviceId) return { ok: false, error: 'Choose a service to link.' };
  const service = directoryServicesForTheme(data, themeId).find((candidate) => candidate.id === serviceId);
  if (!service) return { ok: false, error: 'That service is not available for this theme.' };
  return { ok: true, service };
}

/* ------------------------------------------------------------------ */
/* Before / After                                                      */
/* ------------------------------------------------------------------ */

/** A valid before/after record has a safe after image AND a safe before image. */
export function isBeforeAfterItem(item: GalleryImage | null | undefined): boolean {
  if (!item) return false;
  return isSafeMediaUrl(item.url) && isSafeMediaUrl(item.beforeUrl);
}

/** A before/after pair is one record, so its images must share one theme scope. */
export function beforeAfterThemesMatch(
  afterTheme: string | null | undefined,
  beforeTheme: string | null | undefined,
): boolean {
  return (afterTheme || null) === (beforeTheme || null);
}

/* ------------------------------------------------------------------ */
/* Display order + status                                              */
/* ------------------------------------------------------------------ */

/** Stable sort by `displayOrder` (items without an order keep relative order). */
export function sortGalleryByDisplayOrder(items: readonly GalleryImage[]): GalleryImage[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ao = typeof a.item.displayOrder === 'number' ? a.item.displayOrder : Number.MAX_SAFE_INTEGER;
      const bo = typeof b.item.displayOrder === 'number' ? b.item.displayOrder : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/** Rewrites `displayOrder` to match the order of `orderedIds` (0..n). */
export function applyGalleryDisplayOrder(
  items: readonly GalleryImage[],
  orderedIds: readonly string[],
): GalleryImage[] {
  const rank = new Map<string, number>();
  orderedIds.forEach((id, index) => rank.set(id, index));
  return items.map((item) =>
    rank.has(item.id) ? { ...item, displayOrder: rank.get(item.id) } : item,
  );
}

export function activeGalleryItems(items: readonly GalleryImage[]): GalleryImage[] {
  return items.filter((item) => item.status !== 'inactive');
}

export function setGalleryItemStatus(item: GalleryImage, status: GalleryStatus): GalleryImage {
  return { ...item, status };
}

/** The next free `displayOrder` value (one past the current max). */
export function nextGalleryDisplayOrder(items: readonly GalleryImage[]): number {
  let max = -1;
  for (const item of items) {
    if (typeof item.displayOrder === 'number' && item.displayOrder > max) max = item.displayOrder;
  }
  return max + 1;
}

/* ------------------------------------------------------------------ */
/* Customer projection (owner save → customer gallery)                 */
/* ------------------------------------------------------------------ */

/**
 * The gallery a customer sees for `themeId`: active, theme-scoped, ordered,
 * safe URLs only. This is the same rule the public `SiteGallery` applies, so a
 * saved item can never leak into another theme.
 */
export function customerGalleryForTheme(data: SalonData, themeId: SiteHeaderThemeId): GalleryImage[] {
  return sortGalleryByDisplayOrder(
    (data.gallery || [])
      // PHASE 14.7 — approved + active only (pending/rejected/unpublished hidden).
      .filter((item) => isCustomerVisibleGalleryItem(item))
      .filter((item) => ownerGalleryItemBelongsToTheme(item, themeId))
      .filter((item) => isSafeMediaUrl(item.url)),
  );
}

/* ------------------------------------------------------------------ */
/* Full item validation                                                */
/* ------------------------------------------------------------------ */

/** All problems with an item as saved for a theme (empty = valid). */
export function validateGalleryItemForTheme(
  data: SalonData,
  item: GalleryImage,
  themeId: SiteHeaderThemeId,
): string[] {
  const errors: string[] = [];
  if (!isSafeMediaUrl(item.url)) errors.push('Gallery image URL is missing or unsafe.');
  if (item.themeId && !isSiteHeaderTheme(item.themeId)) errors.push('Gallery theme is invalid.');
  if (item.beforeUrl && !isSafeMediaUrl(item.beforeUrl)) errors.push('Before image URL is unsafe.');
  if (item.serviceId) {
    const linked = resolveLinkedGalleryService(data, item, themeId);
    if (!linked) errors.push('Linked service does not belong to this theme.');
  }
  if (item.status && !(GALLERY_STATUSES as readonly string[]).includes(item.status)) {
    errors.push('Gallery status is invalid.');
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* Authorization (existing auth + ownership logic)                     */
/* ------------------------------------------------------------------ */

export type GalleryEditPermission =
  | 'authorized'
  | 'not-configured'
  | 'not-authenticated'
  | 'no-ownership'
  | 'ambiguous'
  | 'permission-denied'
  | 'error';

/**
 * Maps the existing ownership resolution onto a gallery-edit permission.
 * `not-configured` is treated as the local onboarding draft (the owner edits
 * their own draft, exactly like the rest of the wizard when Supabase is off).
 */
export function galleryEditPermission(
  userPresent: boolean,
  resolution: { status: string } | null | undefined,
): GalleryEditPermission {
  if (!resolution) return 'not-configured';
  switch (resolution.status) {
    case 'not-configured':
      return 'not-configured';
    case 'not-authenticated':
      return 'not-authenticated';
    case 'resolved':
      return userPresent ? 'authorized' : 'not-authenticated';
    case 'no-membership':
      return 'no-ownership';
    case 'ambiguous':
      return 'ambiguous';
    case 'permission-denied':
      return 'permission-denied';
    default:
      return 'error';
  }
}

/** User-facing denial message (never exposes tokens, SQL, or ids). */
export function galleryEditDeniedMessage(permission: GalleryEditPermission): string | null {
  switch (permission) {
    case 'authorized':
      return null;
    case 'not-configured':
      return null; // offline onboarding draft
    case 'not-authenticated':
      return 'Please log in to manage your gallery.';
    case 'no-ownership':
      return 'Your account is not linked to a salon.';
    case 'ambiguous':
      return 'Multiple salons are linked to your account. Please select one.';
    case 'permission-denied':
      return 'You do not have permission to manage this gallery.';
    default:
      return 'Unable to verify your access right now.';
  }
}

/* ------------------------------------------------------------------ */
/* Upload (data URL + progress)                                        */
/* ------------------------------------------------------------------ */

/** Reads a validated file as a data URL, reporting progress 0–100. */
export function readGalleryFileAsDataUrl(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Could not read that image. Try another image.'));
        return;
      }
      onProgress?.(100);
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Could not read that image. Try another image.'));
    reader.readAsDataURL(file);
  });
}

/** Builds a new managed gallery item from validated inputs. */
export function createManagedGalleryItem(input: {
  id: string;
  url: string;
  alt?: string;
  category?: string;
  themeId?: string | null;
  beforeUrl?: string;
  beforeAlt?: string;
  title?: string;
  description?: string;
  serviceId?: string | null;
  displayOrder?: number;
  status?: GalleryStatus;
}): GalleryImage {
  return {
    id: input.id,
    url: input.url,
    alt: input.alt,
    category: normalizeGalleryCategory(input.category),
    themeId: input.themeId || null,
    beforeUrl: input.beforeUrl,
    beforeAlt: input.beforeAlt,
    title: input.title,
    description: input.description,
    serviceId: input.serviceId || null,
    displayOrder: input.displayOrder,
    status: input.status || 'active',
  };
}
