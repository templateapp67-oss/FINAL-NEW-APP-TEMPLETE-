/**
 * STORE SETTINGS — the tenant's canonical settings row.
 *
 * The documented pattern persists a settings object with
 * `supabase.from('store_settings').upsert({ id: storeId, ...data, updated_at })`
 * (a dedicated settings table with one column per setting).
 *
 * This repository has no `store_settings` table and must not grow one: the
 * Nexora database spec forbids duplicate business data (point 75 — "ONE
 * business/service/staff record … no onboarding_*, dashboard_*, preview_*
 * tables"). The canonical per-tenant settings surface here is
 *
 *   `salon_public_websites.config`  (jsonb, one row per salon, RLS-protected)
 *
 * which is exactly where the builder already persists the website draft. So:
 *
 * | Snippet                          | Here                                        |
 * | -------------------------------- | ------------------------------------------- |
 * | table `store_settings`           | `salon_public_websites`                     |
 * | `id: storeId`                    | `salon_id` (resolved from the session)      |
 * | `{ ...data }` (one column each)  | `config` jsonb, MERGED (never replaced)     |
 * | `updated_at`                     | database-maintained; not client-writable    |
 *
 * The merge is the same read-modify-write the app already uses in
 * `salonWebsiteService.saveOwnerWebsiteVisualConfig()` and in
 * `POST /api/owner/save-website-visual-config`: read `config`, shallow-merge
 * the patch, write it back. An optional `configKey` namespaces the patch
 * (e.g. `bookingRules`) so a settings group can never clobber its neighbours.
 *
 * SECURITY
 *   • The salon id comes from the session (`owner_salon_ids()`); a
 *     caller-suggested id is accepted only when the session owns it.
 *   • RLS: `phase1a_public_websites_owner_draft_update`
 *     (`private.can_manage_salon_settings(salon_id)`) plus column grants —
 *     `grant update (slug, template_key, config)` — so an owner can rewrite
 *     the draft config but never flip `is_published` from the browser.
 *   • `created` rows are forced to a DRAFT (`is_published = false`,
 *     `published_at = null`), which the insert policy requires.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, requireSupabase } from './supabase';
import { resolveAutosaveSalonId } from './autosaveTenant';

/** Canonical per-tenant settings row (one per salon). */
export const STORE_SETTINGS_TABLE = 'salon_public_websites';

/** Unique index backing `upsert({ onConflict: 'salon_id' })`. */
export const STORE_UPSERT_CONFLICT = 'salon_id';

/** Debounce window for the store autosave (the documented 600 ms). */
export const STORE_AUTOSAVE_DEBOUNCE_MS = 600;

export type StoreSettingsPatch = Record<string, unknown>;

export interface StoreSettingsTarget {
  /** Salon (store) id — verified against the session, never trusted raw. */
  storeId?: string | null;
  /** Namespace inside the config jsonb (e.g. 'bookingRules'). Optional. */
  configKey?: string | null;
  /** Required ONLY when the settings row does not exist yet. */
  slug?: string | null;
}

export interface StoreSettingsSuccess {
  storeId: string;
  /** True when this write had to create the settings row. */
  created: boolean;
}

export interface StoreSettingsFailure {
  error: string;
}

export type StoreSettingsOutcome = StoreSettingsSuccess | StoreSettingsFailure;

export function isStoreSettingsFailure(
  outcome: StoreSettingsOutcome,
): outcome is StoreSettingsFailure {
  return 'error' in outcome;
}

/**
 * Validates that a patch can live in a jsonb column.
 * Functions, symbols and cycles are rejected before they reach the database.
 */
export function toJsonPatch(patch: unknown): StoreSettingsPatch {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Store settings must be an object.');
  }
  const serialized = JSON.stringify(patch, (_key, value) => {
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw new Error('Store settings must be JSON-serializable.');
    }
    return value;
  });
  return JSON.parse(serialized) as StoreSettingsPatch;
}

/** Shallow-merges `patch` into the existing config, optionally namespaced. */
export function mergeStoreConfig(
  current: unknown,
  patch: StoreSettingsPatch,
  configKey?: string | null,
): StoreSettingsPatch {
  const base: StoreSettingsPatch =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as StoreSettingsPatch)
      : {};
  if (!configKey) return { ...base, ...patch };
  const nested =
    base[configKey] && typeof base[configKey] === 'object' && !Array.isArray(base[configKey])
      ? (base[configKey] as StoreSettingsPatch)
      : {};
  return { ...base, [configKey]: { ...nested, ...patch } };
}

/** PostgREST error → user-readable message. Never leaks SQL or internals. */
export function storeSettingsErrorMessage(error: unknown): string {
  const raw = error && typeof error === 'object' ? (error as { message?: unknown }) : null;
  const message = typeof raw?.message === 'string' ? raw.message.trim() : '';
  if (!message) return 'Unable to save these settings right now. Please try again.';
  // Messages raised deliberately by this module are safe (and useful) to show.
  if (
    /JSON-serializable|must be an object|Nothing to save|not set up yet|do not have access|No salon is linked|Multiple shops are linked/i.test(
      message,
    )
  ) {
    return message;
  }
  if (/row-level security|violates row-level|permission denied/i.test(message)) {
    return 'You do not have permission to change these settings.';
  }
  if (/failed to fetch|network|offline|timeout/i.test(message)) {
    return 'Network error. Your change is kept here — it will retry automatically.';
  }
  return 'Unable to save these settings right now. Please try again.';
}

/**
 * Reads the stored settings slice for the signed-in owner.
 * Returns `null` when the salon has no settings row yet.
 */
export async function readStoreSettingsWithClient(
  client: SupabaseClient,
  target: StoreSettingsTarget = {},
): Promise<StoreSettingsPatch | null> {
  const resolution = await resolveAutosaveSalonId(client, target.storeId ?? null);
  if ('error' in resolution) throw new Error(resolution.error);

  const { data, error } = await client
    .from(STORE_SETTINGS_TABLE)
    .select('config')
    .eq('salon_id', resolution.salonId)
    .maybeSingle();

  if (error) throw new Error(storeSettingsErrorMessage(error));
  const config =
    data && typeof data === 'object' && 'config' in data ? (data as { config?: unknown }).config : null;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const parsed = config as StoreSettingsPatch;
  if (!target.configKey) return parsed;
  const nested = parsed[target.configKey];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as StoreSettingsPatch)
    : null;
}

/**
 * Merges `patch` into the canonical settings row.
 *
 * Expected failures (ownership, permissions, non-serializable data) are
 * RETURNED as `{ error }`; transport failures throw so the caller's retry
 * applies.
 */
export async function saveStoreSettingsWithClient(
  client: SupabaseClient,
  patch: StoreSettingsPatch,
  target: StoreSettingsTarget = {},
): Promise<StoreSettingsOutcome> {
  let safePatch: StoreSettingsPatch;
  try {
    safePatch = toJsonPatch(patch);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'These settings cannot be saved.' };
  }
  if (Object.keys(safePatch).length === 0) return { error: 'Nothing to save yet.' };

  const resolution = await resolveAutosaveSalonId(client, target.storeId ?? null);
  if ('error' in resolution) return { error: resolution.error };

  const { data: row, error: readError } = await client
    .from(STORE_SETTINGS_TABLE)
    .select('config')
    .eq('salon_id', resolution.salonId)
    .maybeSingle();

  if (readError) return { error: storeSettingsErrorMessage(readError) };

  const merged = mergeStoreConfig(row?.config, safePatch, target.configKey);

  if (row) {
    const { error } = await client
      .from(STORE_SETTINGS_TABLE)
      .update({ config: merged })
      .eq('salon_id', resolution.salonId);
    if (error) return { error: storeSettingsErrorMessage(error) };
    return { storeId: resolution.salonId, created: false };
  }

  // No settings row yet: create it as a DRAFT (publishing stays server-side).
  if (!target.slug) {
    return { error: 'Your salon website is not set up yet.' };
  }
  const { error } = await client.from(STORE_SETTINGS_TABLE).upsert(
    {
      salon_id: resolution.salonId,
      slug: target.slug,
      config: merged,
      is_published: false,
      published_at: null,
    },
    { onConflict: STORE_UPSERT_CONFLICT },
  );
  if (error) return { error: storeSettingsErrorMessage(error) };
  return { storeId: resolution.salonId, created: true };
}

/** Saves the settings with the shared singleton client (never throws). */
export async function saveStoreSettings(
  patch: StoreSettingsPatch,
  target: StoreSettingsTarget = {},
): Promise<StoreSettingsOutcome> {
  if (!isSupabaseConfigured) {
    return { error: 'Autosave is unavailable right now. Your change is kept here.' };
  }
  try {
    return await saveStoreSettingsWithClient(requireSupabase(), patch, target);
  } catch (error) {
    return { error: storeSettingsErrorMessage(error) };
  }
}
