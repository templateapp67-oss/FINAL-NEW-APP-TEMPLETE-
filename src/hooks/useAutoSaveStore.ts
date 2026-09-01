/**
 * useAutoSaveStore — a CENTRAL, debounced settings store with auto-save.
 *
 * This is this repository's version of the documented pattern:
 *
 *   const [data, setData] = useState<T>(initialData);
 *   const [status, setStatus] = useState<SaveStatus>('idle');
 *   const supabase = createClientComponentClient();
 *   const debouncedSave = useRef(debounce(async (updatedData: T) => {
 *     setStatus('saving');
 *     const { error } = await supabase.from('store_settings')
 *       .upsert({ id: storeId, ...updatedData, updated_at: new Date().toISOString() });
 *     setStatus(error ? 'error' : 'saved');
 *   }, 600)).current;
 *   const updateField = useCallback((field, value) => {
 *     setData((prev) => { const updated = {...prev, [field]: value};
 *       setStatus('saving'); debouncedSave(updated); return updated; });
 *   }, [debouncedSave]);
 *   return { data, updateField, status, setData };
 *
 * Same three adaptations as `useAutoSaveService`:
 *
 *   1. NO `@supabase/auth-helpers-nextjs` and NO `createClientComponentClient()`
 *      — there is no Next.js runtime here. The one shared client from
 *      `src/lib/supabase.ts` is used (injectable via `options.client`).
 *   2. NO lodash — the debounce is `useDebouncedCallback`
 *      (`src/hooks/useDebounce.ts`), which also exposes `flush()`/`cancel()` so
 *      a pending save can be pushed through on `pagehide`.
 *   3. The table is the canonical `salon_public_websites.config` jsonb, merged
 *      (never replaced); `updated_at` is database-maintained because the column
 *      grant does not expose it to browser writes. See `src/lib/storeSettings.ts`.
 *
 * Extra behaviour this codebase needs:
 *   • writes are serialized through a promise queue, so two rapid edits can
 *     never interleave (a stale write must never win);
 *   • transient failures retry with backoff (`withRetry`);
 *   • `hydrate()` loads server data WITHOUT triggering a write — hydration is
 *     never an edit;
 *   • `saveNow()` / `retry()` back the explicit "Save" button.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useDebouncedCallback } from './useDebounce';
import { withRetry } from '../lib/mediaUpload';
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase';
import {
  STORE_AUTOSAVE_DEBOUNCE_MS,
  isStoreSettingsFailure,
  readStoreSettingsWithClient,
  saveStoreSettingsWithClient,
  storeSettingsErrorMessage,
  type StoreSettingsPatch,
} from '../lib/storeSettings';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseAutoSaveStoreOptions {
  /** Debounce in ms (default 600 — the documented window). */
  delay?: number;
  /** Skip saving while false (e.g. before the workspace hydrated). */
  enabled?: boolean;
  /** Salon (store) id; verified against the session. Omit to auto-resolve. */
  storeId?: string | null;
  /** Namespace inside the config jsonb (e.g. 'bookingRules'). */
  configKey?: string | null;
  /** Needed only when the settings row does not exist yet. */
  slug?: string | null;
  /** Client override for tests and request-boundary suites. */
  client?: SupabaseClient | null;
  /** Load the stored slice from the database on mount (default false). */
  load?: boolean;
  /** Fired after a confirmed write. */
  onSaved?: (patch: StoreSettingsPatch) => void;
  /** Fired once per failure streak. */
  onError?: (message: string) => void;
  /** Extra retry attempts after the first failure (default 1). */
  retryAttempts?: number;
}

export interface UseAutoSaveStoreApi<T> {
  /** The central state — updated instantly on every field change. */
  data: T;
  /** Instant local update + debounced background save. */
  updateField: <K extends keyof T>(field: K, value: T[K]) => void;
  /** Replace the whole store (edit path — schedules a save). */
  setData: Dispatch<SetStateAction<T>>;
  /** Load server state WITHOUT saving (hydration is never an edit). */
  hydrate: (next: T) => void;
  status: SaveStatus;
  error: string | null;
  lastSavedAt: number | null;
  isPending: boolean;
  /** Saves immediately, bypassing the debounce. */
  saveNow: () => Promise<boolean>;
  /** Re-runs the last failed save. */
  retry: () => Promise<boolean>;
}

function fingerprint<T>(value: T): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    // Unserializable content can never be saved anyway — treat it as changed.
    return `unserializable:${Date.now()}`;
  }
}

/**
 * A central settings store that saves itself.
 *
 * @param initialData starting state (often the values already in the draft)
 * @param options see `UseAutoSaveStoreOptions`
 */
export function useAutoSaveStore<T extends Record<string, unknown>>(
  initialData: T,
  options: UseAutoSaveStoreOptions = {},
): UseAutoSaveStoreApi<T> {
  const {
    delay = STORE_AUTOSAVE_DEBOUNCE_MS,
    enabled = true,
    storeId,
    configKey,
    slug,
    client = null,
    load = false,
    onSaved,
    onError,
    retryAttempts = 1,
  } = options;

  const [data, setDataState] = useState<T>(initialData);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Latest-value refs: the debounced writer must never see a stale snapshot.
  const latest = useRef<T>(initialData);
  latest.current = data;
  const clientRef = useRef<SupabaseClient | null>(client);
  clientRef.current = client;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /** Signature of the last state we know is in sync with the database. */
  const synced = useRef<string | null>(null);
  /** Serializes writes; a slow request can never overwrite a newer one. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const requestId = useRef(0);
  const failureStreak = useRef(false);

  const canSave = enabled && isSupabaseConfigured;

  const run = useCallback(
    async (force = false): Promise<boolean> => {
      if (!canSave) return false;
      const snapshot = latest.current;
      if (!force && synced.current === fingerprint(snapshot)) return true;

      const id = requestId.current + 1;
      requestId.current = id;
      setIsPending(true);
      setStatus('saving');

      const task = queue.current.then(async () => {
        try {
          await withRetry(
            async () => {
              const outcome = await saveStoreSettingsWithClient(
                clientRef.current ?? requireSupabase(),
                snapshot as StoreSettingsPatch,
                { storeId, configKey, slug },
              );
              if (isStoreSettingsFailure(outcome)) throw new Error(outcome.error);
              return outcome;
            },
            { attempts: Math.max(1, retryAttempts + 1) },
          );
          if (id !== requestId.current) return false;
          synced.current = fingerprint(snapshot);
          setStatus('saved');
          setError(null);
          setLastSavedAt(Date.now());
          failureStreak.current = false;
          onSavedRef.current?.(snapshot as StoreSettingsPatch);
          return true;
        } catch (caught) {
          if (id !== requestId.current) return false;
          const message = storeSettingsErrorMessage(caught);
          setStatus('error');
          setError(message);
          if (!failureStreak.current) {
            failureStreak.current = true;
            onErrorRef.current?.(message);
          }
          return false;
        } finally {
          if (id === requestId.current) setIsPending(false);
        }
      });

      queue.current = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
    [canSave, configKey, retryAttempts, slug, storeId],
  );

  const schedule = useDebouncedCallback(() => {
    void run();
  }, delay);

  /** Marks the store dirty and (re)schedules the background save. */
  const bump = useCallback(() => {
    if (!canSave) return;
    // Instant feedback, exactly like the documented `updateField`: the status
    // flips to "saving" on the keystroke, not 600 ms later.
    setStatus('saving');
    schedule();
  }, [canSave, schedule]);

  const commit = useCallback(
    (next: T) => {
      latest.current = next;
      setDataState(next);
      bump();
    },
    [bump],
  );

  const updateField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      commit({ ...latest.current, [field]: value } as T);
    },
    [commit],
  );

  const setData = useCallback(
    (next: SetStateAction<T>) => {
      const value =
        typeof next === 'function' ? (next as (previous: T) => T)(latest.current) : next;
      commit(value);
    },
    [commit],
  ) as Dispatch<SetStateAction<T>>;

  /** Loads external state. Never schedules a save. */
  const hydrate = useCallback((next: T) => {
    const signature = fingerprint(next);
    if (signature === fingerprint(latest.current)) return;
    latest.current = next;
    synced.current = signature;
    setDataState(next);
    setStatus('idle');
    setError(null);
  }, []);

  // Mount: the initial data is the baseline — mounting must not write.
  useEffect(() => {
    synced.current = fingerprint(latest.current);
  }, []);

  // Optional hydration from the database.
  useEffect(() => {
    if (!load || !canSave) return;
    let cancelled = false;
    void (async () => {
      try {
        const stored = await readStoreSettingsWithClient(clientRef.current ?? requireSupabase(), {
          storeId,
          configKey,
        });
        if (cancelled || !stored) return;
        hydrate({ ...latest.current, ...(stored as Partial<T>) } as T);
      } catch (caught) {
        if (cancelled) return;
        const message = storeSettingsErrorMessage(caught);
        setStatus('error');
        setError(message);
        onErrorRef.current?.(message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Hydration runs once per store identity, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, canSave, storeId, configKey]);

  // A pending save must not be lost when the tab goes away.
  useEffect(() => {
    if (!canSave) return;
    const flush = () => {
      if (!schedule.pending()) return;
      schedule.cancel();
      void run(true);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [canSave, run, schedule]);

  const saveNow = useCallback(async () => {
    schedule.cancel();
    return run(true);
  }, [run, schedule]);

  const retry = useCallback(async () => {
    failureStreak.current = false;
    schedule.cancel();
    return run(true);
  }, [run, schedule]);

  return { data, updateField, setData, hydrate, status, error, lastSavedAt, isPending, saveNow, retry };
}
