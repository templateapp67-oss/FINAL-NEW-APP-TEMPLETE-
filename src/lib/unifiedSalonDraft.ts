/**
 * UNIFIED SALON DRAFT SCHEMA
 *
 * One canonical shape for everything an owner edits across setup steps 1–14
 * (details, logo, hero, gallery, services, offers, team, socials, location,
 * contact/booking rules, appearance, SEO, white-label copy).
 *
 * Previously the draft was assembled ad hoc inside
 * `salonWebsiteService.websiteConfigFromSalonData`, so a field added to a step
 * could silently fail to persist — the classic "my logo/gallery disappeared
 * after refresh" report. This module is now the SINGLE source of truth:
 *
 *   - `UNIFIED_DRAFT_FIELDS` enumerates every persisted key.
 *   - `unifiedDraftFromSalonData()` serializes a `SalonData` into the draft.
 *   - `mergeUnifiedDraft()` merges a server/local draft back onto a base WITHOUT
 *     dropping keys: arrays/objects are replaced wholesale only when the
 *     incoming value is present, and absent keys keep the base value.
 *   - `draftFingerprint()` gives the autosave hook a cheap change signature.
 *
 * Identity/session-derived fields (`salonId`, `publishState`, `publishedUrl`)
 * are deliberately excluded: they are owned by the database, never by the
 * browser, and must never be restored from a local cache.
 */
import type { SalonData } from '../types';

/**
 * Every business/content key persisted in `salon_public_websites.config`.
 * Presentation-only keys live in `templateSwitchInvariants` and keep their own
 * write authority (`set_owner_salon_template` / `set_owner_salon_visual_config`).
 */
export const UNIFIED_DRAFT_FIELDS = [
  'templateId',
  'salonName',
  'tagline',
  'ownerName',
  'ownerRole',
  'ownerPhotoUrl',
  'yearsOfExperience',
  'happyCustomers',
  'about',
  'phone',
  'email',
  'whatsappPhone',
  'contactOptions',
  'bookingRules',
  // Media (step 5) — logo, hero and gallery are real business content and must
  // never be dropped between saves or during publish.
  'logoUrl',
  'heroImageUrl',
  'gallery',
  // Socials / videos (step 6)
  'socialProfiles',
  'socialVideos',
  'disabledThemeVideoIds',
  // Location & hours (step 7)
  'address',
  'openingHours',
  'announcements',
  'holidays',
  // Catalog (steps 3, 4)
  'services',
  'packages',
  'offers',
  'team',
  // Appearance + brand identity (step 10)
  'websiteAppearance',
  'salonNameFont',
  'salonNameColor',
  'brandColor',
  'heroPosition',
  // AI review + white-label copy + SEO
  'reviewedContent',
  'websiteCopy',
  'metaDescription',
  'metaKeywords',
  'metaTitle',
  'socialShareImageUrl',
] as const satisfies readonly (keyof SalonData)[];

export type UnifiedDraftField = (typeof UNIFIED_DRAFT_FIELDS)[number];

/** Keys that must never be restored from a browser cache. */
export const DRAFT_EXCLUDED_FIELDS = [
  'salonId',
  'publishState',
  'publishedUrl',
  'websiteSlug',
  'lastCompletedStep',
] as const satisfies readonly (keyof SalonData)[];

const UNIFIED_DRAFT_FIELD_SET = new Set<string>(UNIFIED_DRAFT_FIELDS);

/** Serializes the persisted business/content slice of a salon record. */
export function unifiedDraftFromSalonData(data: SalonData): Partial<SalonData> {
  const draft: Record<string, unknown> = {};
  for (const key of UNIFIED_DRAFT_FIELDS) {
    const value = data[key as keyof SalonData];
    if (value === undefined) continue;
    draft[key] = value;
  }
  return draft as Partial<SalonData>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merges a persisted draft onto a base record WITHOUT dropping data:
 *   - `undefined` incoming keys are skipped (the base value survives).
 *   - `null` is honoured (an owner may deliberately clear a field).
 *   - Arrays / objects are replaced wholesale — never shallow-merged, which
 *     used to leave half-updated gallery and service lists.
 *   - Non-draft (identity) keys are never copied from the incoming draft.
 */
export function mergeUnifiedDraft(base: SalonData, incoming: unknown): SalonData {
  if (!isPlainObject(incoming)) return base;
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (!UNIFIED_DRAFT_FIELD_SET.has(key)) continue;
    if (value === undefined) continue;
    next[key] = value;
  }
  return next as unknown as SalonData;
}

/** True when `draft` contains at least one real business/content value. */
export function hasDraftContent(draft: unknown): boolean {
  if (!isPlainObject(draft)) return false;
  return UNIFIED_DRAFT_FIELDS.some((key) => {
    const value = draft[key];
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

/**
 * Stable change signature for the autosave debounce. Only persisted fields are
 * hashed, so a purely presentational toggle cannot trigger a business write.
 */
export function draftFingerprint(data: SalonData | null | undefined): string {
  if (!data) return '';
  try {
    return JSON.stringify(unifiedDraftFromSalonData(data));
  } catch {
    return '';
  }
}
