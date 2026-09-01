/**
 * Debounce primitives shared by the builder's autosave.
 *
 * `useDebounce` delays a VALUE; `useDebouncedCallback` delays a FUNCTION and
 * exposes `flush()` / `cancel()` so an unmount, a step change, or an explicit
 * "Save & Publish" can push the pending write through immediately instead of
 * leaving it stranded in the timer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Returns `value` after it has stopped changing for `delay` ms. */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    if (delay <= 0) {
      setDebounced(value);
      return;
    }
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export interface DebouncedCallback<Args extends unknown[]> {
  /** Schedules (or reschedules) the call. */
  (...args: Args): void;
  /** Runs a pending call immediately; no-op when nothing is pending. */
  flush: () => void;
  /** Drops a pending call. */
  cancel: () => void;
  /** True while a call is pending. */
  pending: () => boolean;
}

/**
 * Debounces `callback` by `delay` ms, preserving the latest arguments.
 * The timer is cleared on unmount; `flush()` is NOT called automatically so an
 * unmounting step cannot fire a stale write.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
): DebouncedCallback<Args> {
  const timerRef = useRef<number | null>(null);
  const argsRef = useRef<Args | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    argsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const args = argsRef.current;
    argsRef.current = null;
    if (args) callbackRef.current(...args);
  }, []);

  const pending = useCallback(() => timerRef.current !== null, []);

  // Drop a pending call when the component goes away.
  useEffect(() => cancel, [cancel]);

  const debounced = useMemo(() => {
    const run = (...args: Args) => {
      argsRef.current = args;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const pendingArgs = argsRef.current;
        argsRef.current = null;
        if (pendingArgs) callbackRef.current(...pendingArgs);
      }, Math.max(0, delay));
    };
    return Object.assign(run, { flush, cancel, pending }) as DebouncedCallback<Args>;
  }, [delay, flush, cancel]);

  return debounced;
}
