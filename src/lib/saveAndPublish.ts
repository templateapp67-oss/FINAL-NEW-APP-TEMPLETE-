/**
 * "SAVE & PUBLISH" — the single, complete commit for the whole wizard.
 *
 * Publishing alone was not enough: `publish_owner_salon_website` writes
 * `salons.name/slug`, `organizations.name` and
 * `salon_public_websites.config`, but the rest of the step 1–14 data lives in
 * other stores the publish RPC does not touch —
 *
 *   - `business_locations` (step 7 map pin / coordinates)
 *   - `salon_hours`        (step 7 weekly availability)
 *
 * Going live straight from the publish RPC therefore dropped part of the
 * owner's setup. This module runs the FULL draft commit first
 * (`persistOwnerBusinessSetup`, which owns those writes) and only then
 * publishes, so every step's data is on the server before the site becomes
 * public. A failed draft commit ABORTS the publish instead of publishing a
 * half-saved salon.
 *
 * It lives in its own module (rather than inside `salonWebsiteService`) so the
 * two write paths stay acyclic: `ownerBusinessSetup` → `salonWebsiteService`
 * is a one-way dependency.
 */
import type { SalonData } from '../types';
import { isSupabaseConfigured } from './supabaseClient';
import { persistOwnerBusinessSetup } from './ownerBusinessSetup';
import { publishOwnerSalonWebsite } from './salonWebsiteService';
import { draftFingerprint } from './unifiedSalonDraft';

export interface SaveAndPublishResult {
  salonId: string;
  slug: string;
  isPublished: boolean;
  publishedAt: string | null;
  /** True when the draft commit ran (and succeeded) before publishing. */
  draftCommitted: boolean;
}

/**
 * Commits every persisted field, then publishes.
 *
 * @throws when the draft commit fails — the site must never go live with the
 *         owner's data only half stored.
 */
export async function saveAndPublishOwnerWebsite(data: SalonData): Promise<SaveAndPublishResult> {
  let draftCommitted = false;

  if (isSupabaseConfigured) {
    const committed = await persistOwnerBusinessSetup(data);
    if ('error' in committed) {
      throw new Error(committed.error);
    }
    draftCommitted = true;
  }

  const published = await publishOwnerSalonWebsite(data);
  return {
    salonId: published.salonId,
    slug: published.slug,
    isPublished: published.isPublished,
    publishedAt: published.publishedAt,
    draftCommitted,
  };
}

/**
 * Guards a publish against a silently empty draft: the owner must never be
 * able to publish an empty shell because a hydration race blanked their data.
 */
export function assertPublishPayloadComplete(data: SalonData): void {
  const name = (data.salonName || '').trim();
  if (!name) throw new Error('Add your salon name before publishing.');
  if (!isSupabaseConfigured) {
    throw new Error('Sign in to publish your website.');
  }
  if (!draftFingerprint(data)) {
    throw new Error('Your website draft is empty. Please complete the setup steps before publishing.');
  }
}
