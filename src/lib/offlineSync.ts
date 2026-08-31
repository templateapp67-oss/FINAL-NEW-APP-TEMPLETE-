const DRAFT_KEY = 'nexora_service_form_draft';

/** `true` only when the browser reports a definite offline state. */
export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

/**
 * True when the page is in a stale / uncertain connectivity window — the
 * browser reports online but no recent online event has been observed. Used to
 * avoid flashing connectivity banners or restoring drafts on a flapping
 * connection, never to gate writes (writes still consult `isBrowserOffline`).
 */
export function isStaleConnectivityState(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return navigator.onLine !== false && !windowOnlineEverObserved.current;
}

/** Test seam — resets the observed-online window so tests are deterministic. */
export function resetOnlineEventObservationForTests(): void {
  windowOnlineEverObserved.current = false;
}

const windowOnlineEverObserved: { current: boolean } = { current: false };
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    windowOnlineEverObserved.current = true;
  });
}

export interface ServiceFormDraft {
  themeId: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  category: string;
  savedAt: string;
}

export function persistServiceFormDraft(draft: ServiceFormDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore quota / private mode.
  }
}

export function readServiceFormDraft(themeId: string): ServiceFormDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ServiceFormDraft;
    if (draft.themeId !== themeId) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearServiceFormDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Discards a draft whose content matches the server-confirmed saved service.
 * Called on successful submit so a stale auto-saved draft can never be
 * "restored" on the next mount (the root cause of the restored-form banner
 * firing while online).
 */
export function clearServiceFormDraftIfMatches(saved: {
  name: string;
  price: number;
  duration: number;
  description: string;
  category: string;
}): boolean {
  if (typeof window === 'undefined') return false;
  let draft: ServiceFormDraft | null = null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (raw) draft = JSON.parse(raw) as ServiceFormDraft;
  } catch {
    return false;
  }
  if (!draft) return false;
  const matches = draft.name === saved.name
    && draft.price === saved.price
    && draft.duration === saved.duration
    && draft.description === saved.description
    && draft.category === saved.category;
  if (matches) clearServiceFormDraft();
  return matches;
}

export function networkErrorMessage(error: unknown, offline: boolean): string {
  if (offline) return 'You are offline. Your changes are kept here — retry when the connection returns.';
  const raw = error instanceof Error ? error.message : '';
  if (/failed to fetch|network|offline|timeout/i.test(raw)) {
    return 'Network error. Nothing was saved twice — retry when you are back online.';
  }
  return raw || 'Unable to save right now. Please try again.';
}
