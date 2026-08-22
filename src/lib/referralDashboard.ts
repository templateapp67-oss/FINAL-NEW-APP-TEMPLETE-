/**
 * REFERRAL DASHBOARD DATA LAYER
 *
 * Real-time "Referred Salons" registry backing the Referral Dashboard
 * (Screen 24 / `ShareReferralPremium` and the logged-in owner dashboard).
 *
 * Source of truth:
 *   1. The current referral context — the dynamic code generated from the
 *      owner's salon name plus the code stored in `nexora_referral_code`
 *      (who referred this salon) via `./referral.ts`.
 *   2. A local registry (`nexora_referral_registry`) of salons that signed up
 *      through a referral code. Entries are recorded at account creation by
 *      the Sign-Up page and the auth modal, then advance in status:
 *        Pending → Registered → Active
 *      Credits accrue per status, and the accumulated wallet rewards are
 *      the sum across entries — rendered live (storage events + a custom
 *      in-page event keep every mounted dashboard in sync).
 *
 * Demo seed data ships with the template so the dashboard is populated out
 * of the box; entries seeded by the template are flagged `demo: true`.
 */

import { readStoredReferralCode } from './referral';
import { safeGetItem, safeSetItem } from './safeStorage';

export type ReferralStatus = 'Pending' | 'Registered' | 'Active';

export interface ReferralEntry {
  id: string;
  /** Salon / business name the referee signed up with. */
  salonName: string;
  /** Contact email of the referred salon owner. */
  email: string;
  /** Referral code that was applied at sign-up. */
  code: string;
  /** Registration status of the referred salon. */
  status: ReferralStatus;
  /** ISO timestamp of the sign-up. */
  joinedAt: string;
  /** Wallet credits accrued for this referral (per status). */
  credits: number;
  /** True for template seed rows (shown as "Demo" in the UI). */
  demo?: boolean;
}

export interface ReferralDashboardData {
  entries: ReferralEntry[];
  totals: {
    referred: number;
    pending: number;
    registered: number;
    active: number;
    /** Accumulated wallet rewards / credits across all entries. */
    totalCredits: number;
    /** Credits still awaiting the friend's completed visit. */
    pendingCredits: number;
  };
  /** Code this owner shares (derived from their salon name). */
  ownCode: string | null;
  /** Code that referred THIS salon (from `nexora_referral_code`). */
  referredByCode: string | null;
}

const REFERRAL_REGISTRY_KEY = 'nexora_referral_registry';
const UPDATED_EVENT = 'nexora-referral-updated';

/** Wallet credits granted per registration status (INR). */
export const CREDITS_BY_STATUS: Record<ReferralStatus, number> = {
  Pending: 0,
  Registered: 250,
  Active: 750,
};

const STATUS_ORDER: ReferralStatus[] = ['Pending', 'Registered', 'Active'];

function demoSeed(): ReferralEntry[] {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();
  const row = (
    n: number,
    salonName: string,
    email: string,
    status: ReferralStatus,
    days: number,
  ): ReferralEntry => ({
    id: `NX-1048${n}`,
    salonName,
    email,
    code: 'NX-ROYAL-2026',
    status,
    joinedAt: daysAgo(days),
    credits: CREDITS_BY_STATUS[status],
    demo: true,
  });
  return [
    row(2, 'Meera Nair · Glow Spa', 'meera@glowspa.in', 'Active', 2),
    row(1, 'Sana Khan · Sana Cuts', 'sana@sana-cuts.in', 'Active', 4),
    row(9, 'Kavya Menon · Kavya Bridal', 'kavya@kavyabridal.in', 'Registered', 6),
    row(7, 'Ishita Bose · Skin Rituals', 'ishita@skinrituals.in', 'Registered', 8),
    row(6, 'Ananya Iyer · Ananya Aesthetics', 'ananya@anyaesthetics.in', 'Pending', 11),
    row(4, 'Ritika Jain · Ritika Lounge', 'ritika@ritikalounge.in', 'Pending', 14),
  ];
}

function normalizeEntry(raw: unknown): ReferralEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ReferralEntry>;
  if (typeof r.email !== 'string' || !r.email.trim()) return null;
  const status: ReferralStatus = STATUS_ORDER.includes(r.status as ReferralStatus)
    ? (r.status as ReferralStatus)
    : 'Pending';
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `NX-${Date.now()}`,
    salonName: typeof r.salonName === 'string' && r.salonName ? r.salonName : 'New Salon',
    email: r.email.trim().toLowerCase(),
    code: typeof r.code === 'string' && r.code ? r.code : '—',
    status,
    joinedAt:
      typeof r.joinedAt === 'string' && r.joinedAt ? r.joinedAt : new Date().toISOString(),
    credits: typeof r.credits === 'number' ? r.credits : CREDITS_BY_STATUS[status],
    demo: r.demo === true,
  };
}

function persist(entries: ReferralEntry[]): void {
  try {
    safeSetItem(REFERRAL_REGISTRY_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('Could not persist referral registry:', err);
  }
}

function emitUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UPDATED_EVENT, { detail: loadRegistry() }));
}

function loadRegistry(): ReferralEntry[] {
  try {
    const raw = safeGetItem(REFERRAL_REGISTRY_KEY);
    if (!raw) {
      const seed = demoSeed();
      persist(seed);
      return seed;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((e): e is ReferralEntry => Boolean(e));
  } catch {
    return [];
  }
}

/**
 * Record a salon that signed up with a referral code (called at account
 * creation — Sign-Up page / auth modal). Deduplicates by email: an existing
 * row keeps its earliest join date and its highest status.
 */
export function recordReferralSignup(input: {
  email: string;
  code: string;
  salonName?: string | null;
}): ReferralEntry | null {
  if (typeof window === 'undefined') return null;
  const email = (input.email || '').trim().toLowerCase();
  if (!email) return null;

  const entries = loadRegistry();
  const existing = entries.find((e) => e.email === email);
  if (existing) {
    return existing;
  }
  const entry: ReferralEntry = {
    id: `NX-${String(Date.now()).slice(-5)}`,
    salonName: (input.salonName || '').trim() || 'New Salon',
    email,
    code: input.code || '—',
    status: 'Pending',
    joinedAt: new Date().toISOString(),
    credits: CREDITS_BY_STATUS.Pending,
  };
  entries.unshift(entry);
  persist(entries);
  emitUpdated();
  return entry;
}

/** Advance (or set) the registration status of a referred salon. */
export function setReferralStatus(
  email: string,
  status: ReferralStatus,
): ReferralEntry | null {
  if (typeof window === 'undefined') return null;
  const entries = loadRegistry();
  const idx = entries.findIndex((e) => e.email === email.trim().toLowerCase());
  if (idx === -1) return null;
  const current = entries[idx];
  if (STATUS_ORDER.indexOf(status) <= STATUS_ORDER.indexOf(current.status)) {
    return current;
  }
  entries[idx] = {
    ...current,
    status,
    credits: CREDITS_BY_STATUS[status],
  };
  persist(entries);
  emitUpdated();
  return entries[idx];
}

/** Full dashboard payload: entries + live totals + referral context. */
export function getReferralDashboard(ownCode: string | null = null): ReferralDashboardData {
  const entries = [...loadRegistry()].sort(
    (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime(),
  );
  const totals = entries.reduce(
    (acc, e) => {
      acc.referred += 1;
      if (e.status === 'Pending') {
        acc.pending += 1;
        acc.pendingCredits += 0;
      } else if (e.status === 'Registered') {
        acc.registered += 1;
        acc.pendingCredits += CREDITS_BY_STATUS.Registered;
      } else {
        acc.active += 1;
      }
      acc.totalCredits += e.credits;
      return acc;
    },
    { referred: 0, pending: 0, registered: 0, active: 0, totalCredits: 0, pendingCredits: 0 },
  );
  return {
    entries,
    totals,
    ownCode,
    referredByCode: readStoredReferralCode(),
  };
}

/**
 * Subscribe to registry changes: cross-tab `storage` events plus the in-page
 * `nexora-referral-updated` custom event, so dashboards update in real time.
 */
export function onReferralDashboardUpdated(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === REFERRAL_REGISTRY_KEY || e.key === null) cb();
  };
  const onCustom = () => cb();
  window.addEventListener('storage', onStorage);
  window.addEventListener(UPDATED_EVENT, onCustom as EventListener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(UPDATED_EVENT, onCustom as EventListener);
  };
}
