/**
 * AUTOSAVE HOOK (all builder steps 1–14)
 *
 * Debounces every form/state change and then:
 *   1. writes the unified draft to the tenant-scoped LocalStorage cache
 *      (instant fallback — survives refresh, offline, and failed API calls);
 *   2. calls the backend API to persist the draft into
 *      `salons` + `salon_public_websites.config`.
 *
 * Status is reported for the TopBar indicator:
 *   'idle'   → nothing edited yet since the workspace hydrated
 *   'saving' → debounce running or request in flight
 *   'saved'  → backend confirmed the write
 *   'error'  → backend failed (the local cache still holds the change)
 *
 * Transient backend failures are retried automatically with backoff; a manual
 * `retry()` is exposed for the error state. No manual click is ever required.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce, useDebouncedCallback } from './useDebounce';
import { withRetry } from '../lib/mediaUpload';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Default debounce — inside the 1.5s–2s window required by the builder. */
export const AUTOSAVE_DEBOUNCE_MS = 1800;
/** The LocalStorage mirror is cheaper, so it lands sooner than the API call. */
export const LOCAL_CACHE_DEBOUNCE_MS = 400;

export interface AutosaveResult {
  /** Backend-confirmed salon id + slug when the server reports them. */
  salonId?: string;
  slug?: string;
}

export type AutosaveSaveFn<T> = (value: T) => Promise<AutosaveResult | { error: string }>;

export interface UseAutosaveOptions<T> {
  /** The value being edited (compared by `fingerprint`, not object identity). */
  value: T;
  /** Debounce in ms (default 1800). */
  delay?: number;
  /** Skip saving while false (e.g. before the workspace has hydrated). */
  enabled?: boolean;
  /**
   * Change signature for `value`. Defaults to the value itself; pass the
   * unified-draft fingerprint so a re-render with identical content never
   * triggers a redundant backend write.
   */
  fingerprint?: (value: T) => string;
  /** Backend write. Return `{ error }` (do not throw) for expected failures. */
  save: AutosaveSaveFn<T>;
  /** Local fallback write — debounced to 400 ms, runs even when offline. */
  persistLocally?: (value: T) => void;
  /** Fired after a confirmed backend write. */
  onSaved?: (result: AutosaveResult) => void;
  /** Fired once per failure streak (not once per retry). */
  onError?: (error: unknown) => void;
  /** Extra automatic retry attempts after the first failure (default 2). */
  retryAttempts?: number;
}

export interface UseAutosaveApi {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  error: string | null;
  /** Saves the latest value immediately, bypassing the debounce. */
  saveNow: () => Promise<boolean>;
  /** Re-runs the last failed save. */
  retry: () => Promise<boolean>;
  /** Writes the LocalStorage mirror right now (used on pagehide). */
  flushLocal: () => void;
  isPending: boolean;
}

function isErrorResult(result: unknown): result is { error: string } {
  return !!result && typeof result === 'object' && 'error' in (result as Record<string, unknown>);
}

export function useAutosave<T>({
  value,
  delay = AUTOSAVE_DEBOUNCE_MS,
  enabled = true,
  fingerprint,
  save,
  persistLocally,
  onSaved,
  onError,
  retryAttempts = 2,
}: UseAutosaveOptions<T>): UseAutosaveApi {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const debouncedValue = useDebounce(value, enabled ? delay : 0);
  const debouncedSignature = fingerprint ? fingerprint(debouncedValue) : '';

  // Latest-value refs so flush/retry never write stale data.
  const latest = useRef(value);
  latest.current = value;

  const saveRef = useRef(save);
  saveRef.current = save;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;

  /** Serializes writes so two rapid saves can never interleave. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const failureStreak = useRef(false);
  const requestId = useRef(0);
  /** Signature of the last successfully persisted snapshot. */
  const lastSavedSignature = useRef<string | null>(null);
  const enabledRef = useRef(false);

  const sign = useCallback((input: T) => (fingerprintRef.current ? fingerprintRef.current(input) : ''), []);

  // When autosave switches on (workspace hydrated), the current snapshot is
  // the baseline — hydration itself must never trigger a write.
  useEffect(() => {
    if (enabled && !enabledRef.current) {
      enabledRef.current = true;
      lastSavedSignature.current = sign(latest.current);
    } else if (!enabled) {
      enabledRef.current = false;
      lastSavedSignature.current = null;
    }
  }, [enabled, sign]);

  const persistRef = useRef(persistLocally);
  persistRef.current = persistLocally;

  /* ---------------------------------------------------------------- *
   * 1. Local fallback mirror (debounced, always attempted)
   * ---------------------------------------------------------------- */
  const localWrite = useDebouncedCallback(
    (snapshot: T) => {
      try {
        persistRef.current?.(snapshot);
      } catch (caught) {
        console.warn('Local draft cache write failed:', caught);
      }
    },
    LOCAL_CACHE_DEBOUNCE_MS,
  );

  useEffect(() => {
    if (!enabled || !persistLocally) return;
    localWrite(value);
  }, [enabled, value, persistLocally, localWrite]);

  // Do not leave the mirror stranded in its 400 ms debounce on unload.
  useEffect(() => {
    const flush = () => {
      try {
        localWrite.flush();
      } catch {
        /* nothing else we can do while unloading */
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [localWrite]);

  const flushLocal = useCallback(() => {
    try {
      localWrite.cancel();
      persistRef.current?.(latest.current);
    } catch (caught) {
      console.warn('Local draft cache flush failed:', caught);
    }
  }, [localWrite]);

  /* ---------------------------------------------------------------- *
   * 2. Debounced backend write
   * ---------------------------------------------------------------- */
  const run = useCallback(async (): Promise<boolean> => {
    const id = requestId.current + 1;
    requestId.current = id;
    const snapshot = latest.current;
    setIsPending(true);
    setStatus('saving');

    const next: Promise<boolean> = queue.current.then(async () => {
      try {
        const result = await withRetry(
          async () => {
            const response = await saveRef.current(latest.current);
            if (isErrorResult(response)) throw new Error(response.error);
            return response;
          },
          { attempts: Math.max(1, retryAttempts + 1) },
        );
        if (id !== requestId.current) return false;
        lastSavedSignature.current = sign(snapshot);
        setStatus('saved');
        setError(null);
        setLastSavedAt(Date.now());
        failureStreak.current = false;
        onSavedRef.current?.(result);
        return true;
      } catch (caught) {
        if (id !== requestId.current) return false;
        const message = caught instanceof Error ? caught.message : 'Could not save your changes.';
        setStatus('error');
        setError(message);
        if (!failureStreak.current) {
          failureStreak.current = true;
          onErrorRef.current?.(caught);
        }
        return false;
      } finally {
        if (id === requestId.current) setIsPending(false);
      }
    });

    queue.current = next.then(() => undefined, () => undefined);
    return next;
  }, [retryAttempts, sign]);

  useEffect(() => {
    if (!enabled) return;
    // Skip no-op saves: hydration, re-renders, and edits that revert.
    if (fingerprint && lastSavedSignature.current === debouncedSignature) return;
    void run();
    // `debouncedSignature` is the change key — a re-render with identical
    // content must never fire another backend write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint ? debouncedSignature : debouncedValue, enabled]);

  const saveNow = useCallback(async () => {
    return run();
  }, [run]);

  const retry = useCallback(async () => {
    failureStreak.current = false;
    return run();
  }, [run]);

  return { status, lastSavedAt, error, saveNow, retry, flushLocal, isPending };
}
