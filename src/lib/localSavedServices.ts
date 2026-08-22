import type { SavedService } from './savedServiceService';

/**
 * localStorage-backed saved-service store.
 *
 * Used ONLY when the live backend provably does not expose the Step-5 RPC
 * surface (see `rpcSurface.ts`) — e.g. a deployment whose project predates the
 * M40 migration, or a static prototype with no database at all. It mirrors the
 * server contract (`SavedService` rows, one list per catalog theme) so the
 * owner can add, list, edit, deactivate and delete services smoothly during
 * onboarding; once the RPC surface exists, the same functions transparently
 * use the database and this store is never consulted.
 *
 * Rows persisted here survive refreshes on the same device/browser. They are
 * intentionally keyed by theme so rows from one theme can never bleed into
 * another — the same isolation rule the server enforces by `theme_id`.
 *
 * In non-browser contexts (tests, SSR) where `localStorage` is unavailable,
 * an in-memory map keeps the behavior deterministic for the session.
 */

const STORAGE_PREFIX = 'nexora.localSavedServices.v1.';

/** Session mirror — also the only store when localStorage is unavailable. */
const memoryStore = new Map<string, SavedService[]>();

const storageKey = (themeId: string): string => `${STORAGE_PREFIX}${themeId}`;

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function listLocalSavedServices(themeId: string): SavedService[] {
  const remembered = memoryStore.get(themeId);
  if (remembered) return remembered.map((row) => ({ ...row }));

  const storage = browserStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(themeId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      storage.removeItem(storageKey(themeId));
      return [];
    }
    const rows = parsed.filter(
      (row): row is SavedService =>
        Boolean(row) && typeof row === 'object' && typeof (row as SavedService).id === 'string',
    );
    memoryStore.set(themeId, rows.map((row) => ({ ...row })));
    return rows;
  } catch {
    return [];
  }
}

function persistLocalSavedServices(themeId: string, rows: SavedService[]): void {
  memoryStore.set(themeId, rows.map((row) => ({ ...row })));
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(storageKey(themeId), JSON.stringify(rows));
  } catch {
    // Quota/serialization failures must never break onboarding: the in-memory
    // mirror above keeps this session consistent even if persistence failed.
  }
}

export function insertLocalSavedService(themeId: string, row: SavedService): SavedService {
  const rows = listLocalSavedServices(themeId);
  rows.push({ ...row });
  persistLocalSavedServices(themeId, rows);
  return { ...row };
}

/**
 * Applies an in-place mutation to one stored row of a theme. Returns the
 * updated row, or `null` when no row with `serviceId` exists for the theme.
 */
export function updateLocalSavedServiceRow(
  themeId: string,
  serviceId: string,
  apply: (row: SavedService) => SavedService,
): SavedService | null {
  const rows = listLocalSavedServices(themeId);
  const index = rows.findIndex((row) => row.id === serviceId);
  if (index === -1) return null;
  const updated = { ...apply({ ...rows[index] }) };
  rows[index] = updated;
  persistLocalSavedServices(themeId, rows);
  return { ...updated };
}

/**
 * Deletes by id across every theme list. Service-delete public API carries no
 * theme id, mirroring the server RPC which derives everything from the row.
 */
export function removeLocalSavedServiceEverywhere(serviceId: string): boolean {
  let removed = false;
  const themeIds = new Set<string>(memoryStore.keys());
  const storage = browserStorage();
  if (storage) {
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && key.startsWith(STORAGE_PREFIX)) themeIds.add(key.slice(STORAGE_PREFIX.length));
      }
    } catch {
      // Enumeration failure is non-fatal: the memory mirror still applies.
    }
  }
  for (const themeId of themeIds) {
    const rows = listLocalSavedServices(themeId);
    const next = rows.filter((row) => row.id !== serviceId);
    if (next.length !== rows.length) {
      removed = true;
      persistLocalSavedServices(themeId, next);
    }
  }
  return removed;
}

/**
 * Finds and updates one row by id across every theme list (used by
 * theme-less operations such as archive-by-id).
 */
export function updateLocalSavedServiceEverywhere(
  serviceId: string,
  apply: (row: SavedService) => SavedService,
): SavedService | null {
  const themeIds = new Set<string>(memoryStore.keys());
  const storage = browserStorage();
  if (storage) {
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && key.startsWith(STORAGE_PREFIX)) themeIds.add(key.slice(STORAGE_PREFIX.length));
      }
    } catch {
      // Non-fatal — see removeLocalSavedServiceEverywhere.
    }
  }
  for (const themeId of themeIds) {
    const updated = updateLocalSavedServiceRow(themeId, serviceId, apply);
    if (updated) return updated;
  }
  return null;
}

/** Test seam: clears every local list (memory + persisted). */
export function clearLocalSavedServicesForTests(): void {
  memoryStore.clear();
  const storage = browserStorage();
  if (!storage) return;
  try {
    const doomed: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(STORAGE_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => storage.removeItem(key));
  } catch {
    // Ignored — tests never depend on storage cleanup succeeding.
  }
}
