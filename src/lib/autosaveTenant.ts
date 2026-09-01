/**
 * AUTOSAVE TENANT RESOLUTION — shared by every browser-side autosave.
 *
 * Used by `src/lib/serviceAutosave.ts` (canonical `services` rows) and
 * `src/lib/storeSettings.ts` (canonical `salon_public_websites.config`).
 *
 * RULE (M40 porting rule, restated): **a client-supplied salon id is never
 * accepted on its own.** The id is resolved from the authenticated session
 * (`owner_salon_ids()` ← `organization_members`); a caller-suggested id is
 * only used when it appears in that server-derived list. Row-level security is
 * the second lock, never the only one — so a bug here cannot become a
 * cross-tenant write.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAuthenticatedOwnerSalonIds } from './ownerSalon';

export const OWNER_SALON_IDS_RPC = 'owner_salon_ids';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True only for a real database UUID (local/temp ids are not, by design). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/** Salon ids the signed-in user may write, from the authoritative RPC. */
export async function ownerSalonIdsFromClient(client: SupabaseClient): Promise<string[] | null> {
  try {
    const { data, error } = await client.rpc(OWNER_SALON_IDS_RPC);
    if (error) return null;
    const rows = Array.isArray(data) ? data : data === null || data === undefined ? [] : [data];
    return Array.from(
      new Set(
        rows
          .map((row) =>
            typeof row === 'string'
              ? row
              : (row as Record<string, unknown>)?.salon_id ?? (row as Record<string, unknown>)?.id,
          )
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      ),
    );
  } catch {
    return null;
  }
}

export type SalonResolution = { salonId: string } | { error: string };

/**
 * Resolves the salon an autosave may write, VERIFYING any caller-suggested id
 * against the session's ownership list.
 */
export async function resolveAutosaveSalonId(
  client: SupabaseClient,
  candidate?: string | null,
): Promise<SalonResolution> {
  let owned = await ownerSalonIdsFromClient(client);
  if (!owned) owned = await fetchAuthenticatedOwnerSalonIds();

  if (!owned || owned.length === 0) {
    return { error: 'No salon is linked to this account yet.' };
  }
  if (candidate) {
    if (!owned.includes(candidate)) {
      return { error: 'You do not have access to this salon.' };
    }
    return { salonId: candidate };
  }
  if (owned.length === 1) return { salonId: owned[0] };
  return { error: 'Multiple shops are linked to your account. Please select a shop first.' };
}
