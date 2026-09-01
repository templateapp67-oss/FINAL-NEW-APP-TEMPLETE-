/**
 * useAutoSaveService — debounced, status-reporting Supabase autosave for ONE
 * service row.
 *
 * This is this repository's version of the documented pattern:
 *
 *   export function useAutoSaveService(serviceData) {
 *     const [status, setStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
 *     const saveData = useCallback(debounce(async (data) => {
 *       setStatus('saving');
 *       const { error } = await supabase.from('services')
 *         .upsert({ ...data, updated_at: new Date().toISOString() });
 *       setStatus(error ? 'error' : 'saved');
 *     }, 800), []);
 *     useEffect(() => { if (serviceData) saveData(serviceData); }, [serviceData, saveData]);
 *     return status;
 *   }
 *
 * Three deliberate differences, all required by this codebase:
 *
 *   1. NO `lodash/debounce` and NO `createClient(process.env.NEXT_PUBLIC_*)`.
 *      There is no Next.js runtime here and lodash is not a dependency. The
 *      debounce comes from `./useDebounce` (already bundle-audited) and the
 *      client is the single shared `src/lib/supabase.ts` instance.
 *   2. It composes `useAutosave` instead of re-implementing it, so a service
 *      autosave inherits the guarantees the rest of the builder already has:
 *      serialized writes, automatic retry with backoff, a LocalStorage mirror,
 *      `saveNow()`/`retry()` for explicit actions, and a `pagehide` flush.
 *   3. It is SAFE BY DEFAULT. Only rows that already exist in the database
 *      (UUID id) are upserted; creating a service still goes through
 *      `create_saved_service` so provenance/duplicate guards keep applying.
 *      Pass `allowInsert: true` to opt into inserts.
 *
 * Usage (service editor):
 *
 *   const autosave = useAutoSaveService(editingService, { enabled: isSaved });
 *   <span>{autosave.status === 'saving' ? 'Saving…' : 'Saved ✓'}</span>
 */
import { useCallback, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAutosave, type AutosaveResult } from './useAutosave';
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase';
import {
  SERVICE_AUTOSAVE_DEBOUNCE_MS,
  autosaveServiceDraftWithClient,
  isServiceAutosaveFailure,
  isUuid,
  serviceDraftFingerprint,
  toServiceAutosaveDraft,
  type ServiceAutosaveDraft,
  type ServiceAutosaveSuccess,
} from '../lib/serviceAutosave';
import type { Service } from '../types';

export type ServiceAutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseAutoSaveServiceOptions {
  /** Debounce in ms (default 800 — the documented builder window). */
  delay?: number;
  /** Skip saving while false, e.g. before the row exists or while disabled. */
  enabled?: boolean;
  /** Allow INSERT for a draft that has no database id (default false). */
  allowInsert?: boolean;
  /** Caller-suggested salon; verified against the session's owned salons. */
  salonId?: string | null;
  /** Client override for tests/request-boundary suites. */
  client?: SupabaseClient | null;
  /** Local fallback write — runs on its own shorter debounce. */
  persistLocally?: (draft: ServiceAutosaveDraft) => void;
  /** Fired after a confirmed database write. */
  onSaved?: (result: ServiceAutosaveSuccess) => void;
  /** Fired once per failure streak (not once per retry). */
  onError?: (error: string) => void;
  /** Extra automatic retry attempts after the first failure (default 1). */
  retryAttempts?: number;
}

export interface UseAutoSaveServiceApi {
  /** 'idle' → nothing edited yet · 'saving' → in flight · 'saved' · 'error'. */
  status: ServiceAutosaveStatus;
  error: string | null;
  lastSavedAt: number | null;
  isPending: boolean;
  /** Saves the latest value immediately, bypassing the debounce. */
  saveNow: () => Promise<boolean>;
  /** Re-runs the last failed save. */
  retry: () => Promise<boolean>;
  /** Writes the LocalStorage mirror right now (used on pagehide). */
  flushLocal: () => void;
}

/**
 * Debounced autosave for a single service.
 *
 * @param serviceData the service being edited (a `Service` or an
 *   already-normalized `ServiceAutosaveDraft`). `null` disables saving.
 */
export function useAutoSaveService(
  serviceData: Service | ServiceAutosaveDraft | null,
  options: UseAutoSaveServiceOptions = {},
): UseAutoSaveServiceApi {
  const {
    delay = SERVICE_AUTOSAVE_DEBOUNCE_MS,
    enabled = true,
    allowInsert = false,
    salonId,
    client = null,
    persistLocally,
    onSaved,
    onError,
    retryAttempts = 1,
  } = options;

  // Refs keep the callbacks below stable without re-triggering the debounce.
  const clientRef = useRef<SupabaseClient | null>(client);
  clientRef.current = client;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const persistRef = useRef(persistLocally);
  persistRef.current = persistLocally;

  const draft = serviceData ? toServiceAutosaveDraft(serviceData) : null;
  // A row with no database id is not autosavable unless inserts are allowed:
  // the create path owns provenance and duplicate guards.
  const hasSaveTarget = Boolean(draft && (allowInsert || isUuid(draft.id)));
  const isEnabled = enabled && hasSaveTarget && isSupabaseConfigured;

  const save = useCallback(
    async (value: ServiceAutosaveDraft | null): Promise<AutosaveResult | { error: string }> => {
      if (!value) return { error: 'Nothing to save yet.' };
      const target = clientRef.current ?? requireSupabase();
      const outcome = await autosaveServiceDraftWithClient(target, value, { allowInsert, salonId });
      if (isServiceAutosaveFailure(outcome)) return { error: outcome.error };
      // `useAutosave` reports the failure (once per streak) — see `onError`.
      onSavedRef.current?.(outcome);
      return { salonId: outcome.salonId };
    },
    [allowInsert, salonId],
  );

  const localWrite = useCallback((value: ServiceAutosaveDraft | null) => {
    if (!value) return;
    persistRef.current?.(value);
  }, []);

  const autosave = useAutosave<ServiceAutosaveDraft | null>({
    value: draft,
    delay,
    enabled: isEnabled,
    fingerprint: serviceDraftFingerprint,
    save,
    persistLocally: persistLocally ? localWrite : undefined,
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error ?? '');
      onErrorRef.current?.(message);
    },
    retryAttempts,
  });

  return {
    status: autosave.status,
    error: autosave.error,
    lastSavedAt: autosave.lastSavedAt,
    isPending: autosave.isPending,
    saveNow: autosave.saveNow,
    retry: autosave.retry,
    flushLocal: autosave.flushLocal,
  };
}
