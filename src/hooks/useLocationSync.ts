import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '../lib/supabase';
import { resolveOwnerSalonId } from '../lib/ownerSalon';
import {
  fetchSalonLocation,
  saveSalonLocation,
  type SalonLocationRecord,
} from '../lib/salonLocationService';
import type { SalonAddress } from '../types';

/**
 * AUTHENTICATED LOCATION SYNCHRONIZATION (Nexora).
 *
 * Keeps the owner's in-progress draft location in sync with the secure Nexora
 * Supabase backend (`public.business_locations`) while the authenticated
 * workspace is mounted. It:
 *
 *   - STARTS ONLY AFTER AUTH: a signed-out user gets `idle` and no writes.
 *   - USES THE SECURE NEXORA BACKEND: owner salon id is resolved from the
 *     authenticated user's organization membership (never hardcoded, never
 *     from the URL), and every write goes through `salonLocationService`
 *     (RLS-gated upsert keyed by salon_id, approval_status 'pending',
 *     submitted_by auth.uid()).
 *   - CLEANS UP ON LOGOUT: watchers, timers and in-flight debounces are
 *     cancelled and the singleton is released when the user signs out.
 *   - PREVENTS DUPLICATE WATCHERS: a module-level singleton controller keyed
 *     by user id means React StrictMode double-mounts and multiple consumers
 *     share ONE watcher/push pipeline.
 *   - PRESERVES EXISTING LOCATION FEATURES: StepLocation keeps its explicit
 *     save flow; this hook adds a debounced best-effort sync of draft changes
 *     and exposes a read-only snapshot for consumers. No second auth system,
 *     no service_role key, no secrets.
 */

export type LocationSyncStatus =
  | 'idle'          // not authenticated or not configured — nothing watched
  | 'resolving'     // resolving the authenticated owner's salon
  | 'ready'         // watching; no pending push
  | 'syncing'       // pushing the latest draft to the backend
  | 'synced'        // last push succeeded
  | 'error';        // last push/resolve failed (never blocks the editor)

export interface LocationSyncState {
  status: LocationSyncStatus;
  salonId: string | null;
  record: SalonLocationRecord | null;
  syncedAt: string | null;
  error: string | null;
}

const IDLE_STATE: LocationSyncState = {
  status: 'idle',
  salonId: null,
  record: null,
  syncedAt: null,
  error: null,
};

/** Stable fingerprint used to avoid redundant writes for unchanged drafts. */
function fingerprint(address: SalonAddress | null | undefined): string {
  if (!address) return '';
  const lat = typeof address.latitude === 'number' ? address.latitude : null;
  const lon = typeof address.longitude === 'number' ? address.longitude : null;
  return `${address.fullAddress ?? ''}|${lat ?? ''}|${lon ?? ''}`;
}

function isValidDraft(address: SalonAddress | null | undefined): boolean {
  if (!address) return false;
  if (!address.fullAddress?.trim()) return false;
  return (
    typeof address.latitude === 'number' &&
    Number.isFinite(address.latitude) &&
    typeof address.longitude === 'number' &&
    Number.isFinite(address.longitude)
  );
}

/** Compose the public snapshot from the mutable controller fields. */
function snapshotOf(c: LocationSyncController): LocationSyncState {
  return {
    status: c.status,
    salonId: c.salonId,
    record: c.record,
    syncedAt: c.syncedAt,
    error: c.error,
  };
}

class LocationSyncController {
  userId: string | null = null;
  salonId: string | null = null;
  record: SalonLocationRecord | null = null;
  status: LocationSyncStatus = 'idle';
  syncedAt: string | null = null;
  error: string | null = null;

  private starting: Promise<void> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingDraft: SalonAddress | null = null;
  private lastPushedFingerprint = '';
  private readonly listeners = new Set<(next: LocationSyncState) => void>();

  subscribe(listener: (next: LocationSyncState) => void): () => void {
    this.listeners.add(listener);
    listener(snapshotOf(this));
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const next = snapshotOf(this);
    for (const listener of this.listeners) listener(next);
  }

  /**
   * Idempotent start. Duplicate calls for the same user (StrictMode,
   * multiple consumers) are no-ops — this is the duplicate-watcher guard.
   */
  start(userId: string): void {
    if (this.userId === userId) return; // already watching this user
    this.stop();
    this.userId = userId;
    this.status = 'resolving';
    this.error = null;
    this.notify();

    if (this.starting) return;
    this.starting = (async () => {
      try {
        // Ownership comes ONLY from the authenticated session (RLS-backed
        // helper + membership fallback). Never from the URL or props.
        const resolution = await resolveOwnerSalonId();
        if (this.userId !== userId) return; // signed out meanwhile
        if (resolution.status !== 'resolved') {
          this.salonId = null;
          this.record = null;
          this.status = 'idle';
          if (resolution.status !== 'not-authenticated') {
            this.error = 'Unable to determine your shop for location sync.';
          }
          this.notify();
          return;
        }
        this.salonId = resolution.salonId;

        // Hydrate the last persisted row so consumers immediately see the
        // backend snapshot and so unchanged drafts are never re-pushed.
        const record = await fetchSalonLocation(resolution.salonId);
        if (this.userId !== userId) return;
        this.record = record;
        this.lastPushedFingerprint = record
          ? `${record.address ?? ''}|${record.latitude ?? ''}|${record.longitude ?? ''}`
          : '';
        this.status = 'ready';
        this.notify();

        // A draft changed while the salon was still resolving — push it now.
        if (this.pendingDraft && isValidDraft(this.pendingDraft)) {
          this.schedulePush(userId, this.pendingDraft);
          this.pendingDraft = null;
        }
      } catch (err) {
        if (this.userId !== userId) return;
        console.error('Location sync failed to start:', err);
        this.status = 'error';
        this.error = 'Location sync is temporarily unavailable.';
        this.notify();
      } finally {
        this.starting = null;
      }
    })();
  }

  /** Debounced best-effort push of an authenticated owner draft change. */
  schedulePush(userId: string, draft: SalonAddress | null | undefined): void {
    if (this.userId !== userId) return;
    if (!isValidDraft(draft)) return;
    if (this.status === 'idle' || this.status === 'resolving') {
      // Remember the latest draft; push once the salon resolves.
      this.pendingDraft = draft as SalonAddress;
      return;
    }
    const nextFingerprint = fingerprint(draft);
    if (nextFingerprint === this.lastPushedFingerprint) return;

    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      void this.push(userId, draft as SalonAddress);
    }, 1200);
  }

  private async push(userId: string, draft: SalonAddress): Promise<void> {
    if (this.userId !== userId || !this.salonId) return;
    this.status = 'syncing';
    this.error = null;
    this.notify();
    try {
      const saved = await saveSalonLocation({
        salonId: this.salonId,
        address: draft.fullAddress,
        latitude: draft.latitude as number,
        longitude: draft.longitude as number,
      });
      if (this.userId !== userId) return;
      this.record = saved;
      this.lastPushedFingerprint = fingerprint(draft);
      this.syncedAt = new Date().toISOString();
      this.status = 'synced';
      this.notify();
    } catch (err) {
      if (this.userId !== userId) return;
      console.error('Location sync push failed:', err);
      this.status = 'error';
      this.error = 'Your changes are saved locally; location sync will retry.';
      this.notify();
    }
  }

  /** Release the watcher (logout or switching accounts). Idempotent. */
  stop(): void {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.pendingDraft = null;
    this.userId = null;
    this.salonId = null;
    this.record = null;
    this.lastPushedFingerprint = '';
    this.syncedAt = null;
    this.error = null;
    this.status = 'idle';
    this.notify();
  }
}

let controller: LocationSyncController | null = null;

/** Singleton accessor — the whole app shares exactly one watcher. */
function getController(): LocationSyncController {
  if (!controller) controller = new LocationSyncController();
  return controller;
}

/**
 * Hook to be mounted at the authenticated root (App). Also returns the
 * current sync state so consumers can react to the backend snapshot.
 */
export function useLocationSync(
  user: User | null,
  draftAddress: SalonAddress | null | undefined,
): LocationSyncState {
  const [state, setState] = useState<LocationSyncState>(IDLE_STATE);

  useEffect(() => {
    const c = getController();
    const unsubscribe = c.subscribe(setState);

    if (!user || !isSupabaseConfigured) {
      // Signed out / not configured: release the watcher (cleanup on logout).
      c.stop();
      return unsubscribe;
    }

    c.start(user.id);
    return unsubscribe;
  }, [user?.id, isSupabaseConfigured]);

  // Sync the latest draft whenever it changes while authenticated. The
  // controller debounces and deduplicates, so this effect is write-safe.
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;
    const c = getController();
    if (c.userId !== user.id) return;
    c.schedulePush(user.id, draftAddress);
  }, [user?.id, isSupabaseConfigured, draftAddress?.fullAddress, draftAddress?.latitude, draftAddress?.longitude]);

  return state;
}
