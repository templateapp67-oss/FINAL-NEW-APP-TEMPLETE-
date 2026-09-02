/**
 * Persist owner business setup to the existing schema only.
 *
 * Canonical writes:
 *   salons.name / salons.address / salons.city
 *   organizations.name
 *   salon_public_websites.config (contact, logo, hours, booking rules, owner profile)
 *   business_locations (map pin when coordinates exist)
 *   salon_hours (weekday availability when that table accepts the live columns)
 *
 * Services/pricing stay on public.services via savedServiceService RPCs.
 * Identity is always owner_salon_ids() / auth.uid() — never a client salon id.
 */
import type { SalonData, SalonOpeningHours } from '../types';
import { resolveOwnerSalonId } from './ownerSalon';
import { requireSupabase, isSupabaseConfigured } from './supabaseClient';
import { saveOwnerWebsiteDraft, getLastDraftSaveErrorMessage, describeDraftSaveFailure } from './salonWebsiteService';
import { saveSalonLocation } from './salonLocationService';
import {
  diagnosticFromError,
  logWorkspaceFailure,
  workspaceUserMessage,
  WorkspaceInitializationError,
} from './workspaceDiagnostics';

export const SALONS_TABLE = 'salons';
export const ORGANIZATIONS_TABLE = 'organizations';
export const SALON_HOURS_TABLE = 'salon_hours';

const WEEKDAYS: Array<keyof SalonOpeningHours> = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export async function loadOwnerSalonRow(): Promise<{
  salonId: string;
  organizationId: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
} | null> {
  if (!isSupabaseConfigured) return null;
  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') {
    if (resolution.status === 'error' || resolution.status === 'permission-denied') {
      const diagnostic = resolution.diagnostic || diagnosticFromError({
        operation: 'workspace.salon_read',
        stage: 'ownership',
        error: { code: 'WORKSPACE_OWNERSHIP_UNAVAILABLE', message: 'Owner salon resolution failed.' },
      });
      throw new WorkspaceInitializationError(diagnostic, workspaceUserMessage(diagnostic));
    }
    return null;
  }
  const { data, error } = await requireSupabase()
    .from(SALONS_TABLE)
    .select('id, organization_id, name, address, city')
    .eq('id', resolution.salonId)
    .maybeSingle();
  if (error) {
    const diagnostic = diagnosticFromError({
      operation: 'workspace.salon_read',
      stage: 'salon-read',
      error,
      authenticatedUserExists: true,
      userId: null,
    });
    logWorkspaceFailure(diagnostic);
    throw new WorkspaceInitializationError(diagnostic, workspaceUserMessage(diagnostic));
  }
  if (!data) {
    const diagnostic = diagnosticFromError({
      operation: 'workspace.salon_read',
      stage: 'salon-read',
      error: {
        code: 'WORKSPACE_SALON_MISSING',
        message: 'Owner membership resolved to a salon that could not be read.',
      },
      authenticatedUserExists: true,
    });
    logWorkspaceFailure(diagnostic);
    throw new WorkspaceInitializationError(diagnostic, workspaceUserMessage(diagnostic));
  }
  return {
    salonId: String(data.id),
    organizationId: data.organization_id ? String(data.organization_id) : null,
    name: typeof data.name === 'string' ? data.name : null,
    address: typeof data.address === 'string' ? data.address : null,
    city: typeof data.city === 'string' ? data.city : null,
  };
}

async function persistSalonHours(salonId: string, hours: SalonOpeningHours | undefined): Promise<void> {
  if (!hours) return;
  const client = requireSupabase();
  const rows = WEEKDAYS.map((key, dayOfWeek) => {
    const day = hours[key];
    return {
      salon_id: salonId,
      day_of_week: dayOfWeek,
      is_open: Boolean(day?.open),
      open_time: day?.open ? day.startTime : null,
      close_time: day?.open ? day.endTime : null,
    };
  });
  const { error } = await client
    .from(SALON_HOURS_TABLE)
    .upsert(rows, { onConflict: 'salon_id,day_of_week' });
  if (error) {
    // Live salon_hours column names are not invented here. Availability still
    // lives in salon_public_websites.config.openingHours.
    console.warn('salon_hours upsert skipped:', error.message);
  }
}

/** Write business fields to existing tables + website draft. */
export async function persistOwnerBusinessSetup(data: SalonData): Promise<{
  salonId: string;
  slug?: string;
} | { error: string }> {
  if (!isSupabaseConfigured) {
    return { error: 'Authentication is not configured.' };
  }
  const resolution = await resolveOwnerSalonId();
  if (resolution.status !== 'resolved') {
    return { error: 'Please log in to save your business details.' };
  }

  const client = requireSupabase();
  const name = (data.salonName || '').trim();
  const address = (data.address?.fullAddress || '').trim();
  const city = (data.address?.city || '').trim();

  const { error: salonError } = await client
    .from(SALONS_TABLE)
    .update({
      ...(name ? { name } : {}),
      address: address || null,
      city: city || null,
    })
    .eq('id', resolution.salonId);
  if (salonError) {
    console.error('Failed to update salon profile:', salonError);
    // Surface the REAL cause (expired session, permission denial, outage)
    // instead of one catch-all sentence the owner cannot act on.
    return { error: describeDraftSaveFailure(salonError) };
  }

  const { data: salonRow } = await client
    .from(SALONS_TABLE)
    .select('organization_id')
    .eq('id', resolution.salonId)
    .maybeSingle();
  if (salonRow?.organization_id && name) {
    const { error: orgError } = await client
      .from(ORGANIZATIONS_TABLE)
      .update({ name })
      .eq('id', salonRow.organization_id);
    if (orgError) console.warn('Organization name update skipped:', orgError.message);
  }

  const draft = await saveOwnerWebsiteDraft(data);
  // saveOwnerWebsiteDraft returns null when the write genuinely did not reach
  // the database (client write + server fallback both failed). Report that as
  // a failed save instead of returning a success shape with a guessed slug —
  // otherwise the UI shows "Saved ✓" for data that will be gone on refresh.
  if (!draft) {
    console.error('persistOwnerBusinessSetup: website draft save failed.');
    // saveOwnerWebsiteDraft records WHY it failed (session expiry, CORS/origin
    // rejection, payload too large, storage-service outage…). Propagate that
    // reason so the autosave toast and TopBar can show it.
    const reason = getLastDraftSaveErrorMessage();
    if (reason) return { error: reason };
    return { error: 'Unable to save your website details. Please try again.' };
  }
  await persistSalonHours(resolution.salonId, data.openingHours);

  const lat = data.address?.latitude;
  const lng = data.address?.longitude;
  if (address && typeof lat === 'number' && typeof lng === 'number') {
    try {
      await saveSalonLocation({
        salonId: resolution.salonId,
        address,
        latitude: lat,
        longitude: lng,
      });
    } catch (error) {
      console.warn('business_locations save skipped:', error);
    }
  }

  return { salonId: resolution.salonId, slug: draft.slug };
}

/** Overlay DB salon name/address/city onto the in-memory draft. */
export function mergeSalonRowIntoDraft(
  data: SalonData,
  row: Awaited<ReturnType<typeof loadOwnerSalonRow>>,
): SalonData {
  if (!row) return data;
  return {
    ...data,
    salonId: row.salonId,
    // Canonical SQL columns are authoritative even when NULL. Falling back to
    // an older JSON draft here can resurrect a renamed/sample business fact.
    salonName: row.name?.trim() || '',
    address: {
      ...(data.address || {
        fullAddress: '',
        area: '',
        city: '',
        state: '',
        pinCode: '',
      }),
      fullAddress: row.address?.trim() || '',
      city: row.city?.trim() || '',
    },
  };
}
