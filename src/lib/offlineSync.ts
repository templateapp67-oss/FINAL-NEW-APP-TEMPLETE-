const DRAFT_KEY = 'nexora_service_form_draft';

export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
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

export function networkErrorMessage(error: unknown, offline: boolean): string {
  if (offline) return 'You are offline. Your changes are kept here — retry when the connection returns.';
  const raw = error instanceof Error ? error.message : '';
  if (/failed to fetch|network|offline|timeout/i.test(raw)) {
    return 'Network error. Nothing was saved twice — retry when you are back online.';
  }
  return raw || 'Unable to save right now. Please try again.';
}
