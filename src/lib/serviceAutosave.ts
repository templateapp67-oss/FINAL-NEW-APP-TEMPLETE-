/**
 * SERVICE AUTOSAVE — direct persistence for the canonical `services` table.
 *
 * This module is the write path used by `useAutoSaveService`
 * (src/hooks/useAutoSaveService.ts). It is the Vite/React equivalent of the
 * Next.js App Router pattern:
 *
 *   const { error } = await supabase
 *     .from('services')
 *     .upsert({ ...data, updated_at: new Date().toISOString() });
 *
 * adapted to this repository's rules:
 *
 *   1. ONE Supabase client — `src/lib/supabase.ts`. We never call
 *      `createClient(process.env.NEXT_PUBLIC_*)` here: there is no Next.js
 *      runtime in this app and a second client would fork auth/session state.
 *      Every entry point accepts an injected client so tests (and the
 *      request-boundary suites) can drive it without touching the singleton.
 *   2. NO lodash. The debounce lives in React (src/hooks/useDebounce.ts), so
 *      no new dependency is added to the bundle.
 *   3. TENANT SAFETY — a client-supplied salon id is never accepted. The
 *      salon is resolved from the authenticated session
 *      (`owner_salon_ids()` ← `organization_members`) and a caller-suggested
 *      id is only used when it appears in that server-derived list. RLS
 *      (`phase1a_services_member_all`) is the second lock, never the only one.
 *   4. PROVENANCE IS IMMUTABLE. `theme_id` / `category_id` /
 *      `predefined_service_id` are written ONLY when a brand-new row is
 *      inserted with explicit, caller-supplied provenance. An autosave of an
 *      existing row never rewrites them, so a Custom (NULL) service can never
 *      be silently re-linked to a predefined catalog entry.
 *   5. COLUMN SET is exactly the one the canonical RPCs write
 *      (salon_id, theme_id, category_id, predefined_service_id, name,
 *      category, price_paise, duration_minutes, short_description,
 *      is_featured, is_active, deleted_at, display_order) plus the M40
 *      `promotional_badge`. Nothing else is ever sent.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, requireSupabase } from './supabase';
import { fetchAuthenticatedOwnerSalonIds } from './ownerSalon';
import type { Service } from '../types';

/** Canonical table. One service source — shared by builder, dashboard, site. */
export const SERVICE_TABLE = 'services';

/** Debounce window for service autosave (matches the builder UX budget). */
export const SERVICE_AUTOSAVE_DEBOUNCE_MS = 800;

/** Composite unique index backing `upsert({ onConflict: 'id,salon_id' })`. */
export const SERVICE_UPSERT_CONFLICT = 'id,salon_id';

const OWNER_SALON_IDS_RPC = 'owner_salon_ids';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True only for a real database UUID (local/temp ids are not, by design). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/**
 * The editable payload of one service. Prices are RUPEES here (the builder
 * shape) and converted to `price_paise` at the row boundary — never floats in
 * the database (see the Nexora database spec).
 */
export interface ServiceAutosaveDraft {
  /** Database id when the row already exists; absent for a not-yet-saved service. */
  id?: string | null;
  /**
   * Canonical `salons.id`. `Service.businessId` holds exactly this value
   * (M40 keeps the JSON key name `business_id` but it is the salon UUID).
   */
  salonId?: string | null;
  name: string;
  category?: string | null;
  description?: string | null;
  /** Rupees. */
  price: number;
  /** Minutes. */
  duration: number;
  featured?: boolean;
  promotionalBadge?: string | null;
  displayOrder?: number;
  /** Provenance — insert-only, never rewritten by an autosave. */
  themeId?: string | null;
  categoryId?: string | null;
  predefinedServiceId?: string | null;
}

export interface ServiceAutosaveSuccess {
  id: string;
  salonId: string;
  /** True when the row was created instead of updated. */
  inserted: boolean;
}

export interface ServiceAutosaveFailure {
  error: string;
}

export type ServiceAutosaveOutcome = ServiceAutosaveSuccess | ServiceAutosaveFailure;

export function isServiceAutosaveFailure(
  outcome: ServiceAutosaveOutcome,
): outcome is ServiceAutosaveFailure {
  return 'error' in outcome;
}

export interface ServiceAutosaveOptions {
  /**
   * Allow a brand-new row to be INSERTED when the draft has no database id.
   * Default `false`: creating a service still goes through
   * `create_saved_service`, which enforces the duplicate/provenance guards an
   * anonymous table insert cannot express.
   */
  allowInsert?: boolean;
  /** Caller-suggested salon. Accepted ONLY if the session owns it. */
  salonId?: string | null;
}

/** Builder `Service` → autosave draft. Lossless for the mutable fields. */
export function serviceToAutosaveDraft(service: Service): ServiceAutosaveDraft {
  return {
    id: service.id,
    salonId: service.businessId ?? null,
    name: service.name,
    category: service.category ?? null,
    description: service.description ?? '',
    price: service.price,
    duration: service.duration,
    featured: service.featured === true,
    promotionalBadge: service.promotionalBadge ?? null,
    themeId: service.themeId ?? null,
    categoryId: service.categoryId ?? null,
    predefinedServiceId: service.predefinedServiceId ?? null,
  };
}

/** True when the value already is a draft (duck-typed, no double mapping). */
export function isServiceAutosaveDraft(value: unknown): value is ServiceAutosaveDraft {
  return (
    !!value &&
    typeof value === 'object' &&
    ('price' in (value as Record<string, unknown>) ||
      'salonId' in (value as Record<string, unknown>))
  );
}

/** Normalizes any input (Service or draft) to a draft. */
export function toServiceAutosaveDraft(
  value: Service | ServiceAutosaveDraft,
): ServiceAutosaveDraft {
  return isServiceAutosaveDraft(value) && 'price' in value
    ? (value as ServiceAutosaveDraft)
    : serviceToAutosaveDraft(value as Service);
}

/**
 * Change signature of a draft. Two renders with identical content produce the
 * same string, so a re-render can never trigger a redundant write.
 */
export function serviceDraftFingerprint(draft: ServiceAutosaveDraft | null): string {
  if (!draft) return '';
  return JSON.stringify([
    draft.id ?? '',
    draft.salonId ?? '',
    (draft.name || '').trim(),
    (draft.category || '').trim(),
    (draft.description || '').trim(),
    Number.isFinite(draft.price) ? Math.round(draft.price * 100) : null,
    Number.isFinite(draft.duration) ? Math.round(draft.duration) : null,
    draft.featured === true,
    draft.promotionalBadge ?? '',
    Number.isFinite(draft.displayOrder) ? Math.round(draft.displayOrder as number) : null,
  ]);
}

/**
 * Mirrors the database constraints (and the `create_saved_service` guards) in
 * the client so an autosave never ships a row the server must reject.
 * Returns a user-readable message, or `null` when the draft is valid.
 */
export function validateServiceDraft(draft: ServiceAutosaveDraft | null): string | null {
  if (!draft) return 'Nothing to save yet.';
  if (!(draft.name || '').trim()) return 'Service name is required.';

  const price = Number(draft.price);
  if (!Number.isFinite(price) || price < 0) return 'Service price cannot be negative.';

  const duration = Number(draft.duration);
  if (!Number.isInteger(duration) || duration <= 0) return 'Service duration must be positive.';

  if (draft.displayOrder !== undefined && draft.displayOrder !== null) {
    const order = Number(draft.displayOrder);
    if (!Number.isInteger(order) || order < 0) return 'Display order cannot be negative.';
  }

  if (draft.id && !isUuid(draft.id)) {
    return 'This service has not been saved yet, so it cannot be autosaved.';
  }
  if (draft.salonId && !isUuid(draft.salonId)) {
    return 'This service is not linked to a salon yet.';
  }
  return null;
}

/**
 * Draft → canonical `services` row.
 *
 * `updated_at` is written explicitly (the spec's `{ ...data, updated_at }`)
 * and is still maintained by the database trigger where one exists.
 */
export function buildServiceRow(
  draft: ServiceAutosaveDraft,
  salonId: string,
  options: { includeProvenance: boolean },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    salon_id: salonId,
    name: (draft.name || '').trim(),
    category: (draft.category || '').trim() || null,
    short_description: draft.description ?? '',
    price_paise: Math.round(Number(draft.price) * 100),
    duration_minutes: Math.round(Number(draft.duration)),
    is_featured: draft.featured === true,
    promotional_badge: (draft.promotionalBadge || '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (draft.displayOrder !== undefined && draft.displayOrder !== null) {
    row.display_order = Math.round(Number(draft.displayOrder));
  }

  // A database id makes this an UPSERT of an existing row. Without one the
  // row is new, which is only allowed with `allowInsert` (option-gated).
  if (isUuid(draft.id)) row.id = draft.id;

  if (options.includeProvenance) {
    // Insert-only. See rule 4 in the module header.
    if (isUuid(draft.themeId)) row.theme_id = draft.themeId;
    if (isUuid(draft.categoryId)) row.category_id = draft.categoryId;
    if (isUuid(draft.predefinedServiceId)) row.predefined_service_id = draft.predefinedServiceId;
    row.display_order = row.display_order ?? 0;
    row.is_active = true;
    row.deleted_at = null;
  }

  return row;
}

/** PostgREST error → user-readable message. Never leaks SQL or internals. */
export function serviceAutosaveErrorMessage(error: unknown): string {
  const raw = error && typeof error === 'object' ? (error as { message?: unknown }) : null;
  const message = typeof raw?.message === 'string' ? raw.message.trim() : '';
  if (!message) return 'Unable to save this service right now. Please try again.';

  // Messages raised deliberately by the schema/RPC layer are safe to surface.
  if (/service name is required|price cannot be negative|duration must be positive/i.test(message)) {
    return message;
  }
  if (/already saved|does not belong to this theme/i.test(message)) return message;
  if (/row-level security|violates row-level/i.test(message)) {
    return 'You do not have permission to edit this salon.';
  }
  if (/failed to fetch|network|offline|timeout/i.test(message)) {
    return 'Network error. Your change is kept here — it will retry automatically.';
  }
  return 'Unable to save this service right now. Please try again.';
}

/** Salon ids the signed-in user may write, from the authoritative RPC. */
async function ownerSalonIdsFromClient(client: SupabaseClient): Promise<string[] | null> {
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
 * Resolves the salon an autosave may write.
 *
 * A caller-suggested id is VERIFIED against the server-derived ownership list;
 * it is never trusted on its own (M40: "A client-supplied salon id is never
 * accepted").
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

/**
 * Writes one service row with an injected client.
 *
 * Expected failures (validation, ownership, permissions) are RETURNED as
 * `{ error }` so the hook can surface them without retrying. Transport
 * failures throw so the autosave retry/backoff in `useAutosave` applies.
 */
export async function autosaveServiceDraftWithClient(
  client: SupabaseClient,
  draft: ServiceAutosaveDraft,
  options: ServiceAutosaveOptions = {},
): Promise<ServiceAutosaveOutcome> {
  const invalid = validateServiceDraft(draft);
  if (invalid) return { error: invalid };

  const allowInsert = options.allowInsert === true;
  const hasRowId = isUuid(draft.id);
  if (!hasRowId && !allowInsert) {
    return { error: 'This service has not been saved yet, so it cannot be autosaved.' };
  }

  const resolution = await resolveAutosaveSalonId(client, options.salonId ?? draft.salonId ?? null);
  if ('error' in resolution) return { error: resolution.error };

  const row = buildServiceRow(draft, resolution.salonId, {
    includeProvenance: !hasRowId,
  });

  const table = client.from(SERVICE_TABLE);
  const result = hasRowId
    ? await table.upsert(row, { onConflict: SERVICE_UPSERT_CONFLICT }).select('id').maybeSingle()
    : await table.insert(row).select('id').maybeSingle();

  if (result.error) {
    return { error: serviceAutosaveErrorMessage(result.error) };
  }

  const savedId =
    (result.data as { id?: unknown } | null)?.id != null
      ? String((result.data as { id: unknown }).id)
      : hasRowId
        ? (draft.id as string)
        : '';

  return { id: savedId, salonId: resolution.salonId, inserted: !hasRowId };
}

/**
 * Autosaves one service with the shared singleton client.
 *
 * Returns `{ error }` (never throws) when Supabase is unconfigured so the
 * builder keeps working in demo/offline mode: the surrounding
 * `useAutosave` already mirrors the change into the local draft cache.
 */
export async function autosaveServiceDraft(
  draft: ServiceAutosaveDraft,
  options: ServiceAutosaveOptions = {},
): Promise<ServiceAutosaveOutcome> {
  if (!isSupabaseConfigured) {
    return { error: 'Autosave is unavailable right now. Your change is kept here.' };
  }
  try {
    return await autosaveServiceDraftWithClient(requireSupabase(), draft, options);
  } catch (error) {
    return { error: serviceAutosaveErrorMessage(error) };
  }
}
