/**
 * PHASE 16.1 — BOOKING FOUNDATION · salon + theme scoped booking drafts.
 *
 * ONE draft record per (business, theme, browser) captures the visitor's
 * progress through Salon → Service → Date → Time → Details → Summary.
 * It is the foundation the later phases build on WITHOUT rebuilding:
 *
 *   - 16.2+ time-slot work re-verifies `dateKey` / `startMinutes` against
 *     server-authoritative slots and attaches the confirmed hold here;
 *   - the advance-payment phase converts a `summary_ready` draft into the
 *     existing Phase 10.7 `PaymentRecord` (same tenant + theme keys);
 *   - the confirmation phase clears the draft once a booking is final.
 *
 * The store mirrors the Phase 10.7 payment-store conventions exactly:
 * versioned localStorage payload, tenant ownership on every row, injected
 * test store, and a window event for cross-surface sync. No database
 * writes, no payment, no invented ids — `businessId` comes from
 * `bookingBusinessId` (existing data only) and the visitor identity is the
 * existing anonymous `bookingBrowserId()`.
 */
import type { SiteHeaderThemeId } from './siteNavigation';
import { bookingBrowserId } from './siteBookingFlow';
import type { BookingCustomerDetails, BookingStepId } from './siteBookingFlow';

export const BOOKING_DRAFT_STORE_KEY = 'nexora_site_booking_drafts';
export const BOOKING_DRAFT_EVENT = 'nexora:booking-draft';
/** Bump when the on-disk draft shape changes (2 = 16.2 multi-service lines). */
export const BOOKING_DRAFT_STORE_VERSION = 2;
/** Drafts older than this are dropped on read (stale foundation data). */
export const BOOKING_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type BookingDraftStatus = 'in_progress' | 'summary_ready';

/** PHASE 16.2 — one selected service inside a multi-service draft. */
export interface BookingDraftServiceLine {
  serviceId: string;
  serviceName: string;
  category: string;
  /** Offer-aware price actually charged (existing pricing engine). */
  price: number;
  durationMinutes: number;
}

export interface BookingDraftRecord {
  /** Internal row id (browser-local; the server will own real booking ids). */
  id: string;
  /** Tenant ownership — the salon this draft belongs to. */
  businessId: string;
  themeId: SiteHeaderThemeId;
  /** Anonymous visitor identity (same id the holds / likes systems use). */
  browserId: string;
  status: BookingDraftStatus;
  /** Furthest step the visitor reached. */
  step: BookingStepId;
  /** Service snapshot — copied so later catalog edits cannot mutate it.
   * With multiple services these mirror the FIRST line + summed totals so
   * 16.1 consumers keep working; `services` holds the full line items. */
  serviceId: string | null;
  serviceName: string | null;
  servicePrice: number | null;
  serviceDurationMinutes: number | null;
  /** PHASE 16.2 — every selected service, in selection order. */
  services: BookingDraftServiceLine[];
  /** PHASE 16.2 — offer-aware total of all lines. */
  totalPrice: number | null;
  /** PHASE 16.2 — summed duration of all lines (one continuous sitting). */
  totalDurationMinutes: number | null;
  /** Slot snapshot (local salon-clock values, as in the entry flow). */
  dateKey: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  /** Customer details exactly as typed (validated by the entry flow). */
  customer: BookingCustomerDetails | null;
  createdAt: number;
  updatedAt: number;
}

interface PersistedDraftStore {
  version: number;
  records: BookingDraftRecord[];
}

function emptyStore(): PersistedDraftStore {
  return { version: BOOKING_DRAFT_STORE_VERSION, records: [] };
}

/* ---- storage (localStorage + test injection, like the payment store) ---- */

let injectedStore: PersistedDraftStore | null = null;

/** Test-only injection; pass null to restore localStorage. */
export function setBookingDraftStoreForTests(store: { records: BookingDraftRecord[] } | null): void {
  injectedStore = store
    ? { version: BOOKING_DRAFT_STORE_VERSION, records: store.records.slice() }
    : null;
}

function readStore(): PersistedDraftStore {
  if (injectedStore) return { ...injectedStore, records: injectedStore.records.slice() };
  if (typeof window === 'undefined') return emptyStore();
  try {
    const raw = window.localStorage.getItem(BOOKING_DRAFT_STORE_KEY);
    if (!raw) return emptyStore();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed || typeof parsed !== 'object'
      || (parsed as PersistedDraftStore).version !== BOOKING_DRAFT_STORE_VERSION
      || !Array.isArray((parsed as PersistedDraftStore).records)
    ) {
      return emptyStore();
    }
    return parsed as PersistedDraftStore;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: PersistedDraftStore): void {
  if (injectedStore) {
    injectedStore = { ...store, records: store.records.slice() };
  } else if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(BOOKING_DRAFT_STORE_KEY, JSON.stringify(store));
    } catch {
      /* storage unavailable — the flow keeps working in memory */
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BOOKING_DRAFT_EVENT));
  }
}

function freshRecords(store: PersistedDraftStore, now: number): BookingDraftRecord[] {
  return store.records
    .filter((record) => now - record.updatedAt <= BOOKING_DRAFT_MAX_AGE_MS)
    // PHASE 16.2 — defensive normalisation: injected/legacy rows without
    // the multi-service fields read back as an empty line list, never crash.
    .map((record) => ({
      ...record,
      services: Array.isArray(record.services) ? record.services : [],
      totalPrice: record.totalPrice ?? null,
      totalDurationMinutes: record.totalDurationMinutes ?? null,
    }));
}

/* ---- public API ---- */

/** Every draft owned by this tenant + theme (stale rows dropped). */
export function readBookingDrafts(businessId: string, themeId: string): BookingDraftRecord[] {
  const now = Date.now();
  return freshRecords(readStore(), now).filter(
    (record) => record.businessId === businessId && record.themeId === themeId,
  );
}

/** THIS browser's draft for the tenant + theme, or null. */
export function readBookingDraft(businessId: string, themeId: string): BookingDraftRecord | null {
  const browserId = bookingBrowserId();
  return readBookingDrafts(businessId, themeId).find((record) => record.browserId === browserId) || null;
}

export interface BookingDraftInput {
  businessId: string;
  themeId: SiteHeaderThemeId;
  status: BookingDraftStatus;
  step: BookingStepId;
  serviceId?: string | null;
  serviceName?: string | null;
  servicePrice?: number | null;
  serviceDurationMinutes?: number | null;
  /** PHASE 16.2 — full multi-service line items (selection order). */
  services?: BookingDraftServiceLine[];
  totalPrice?: number | null;
  totalDurationMinutes?: number | null;
  dateKey?: string | null;
  startMinutes?: number | null;
  endMinutes?: number | null;
  customer?: BookingCustomerDetails | null;
}

/**
 * Create-or-update the single draft for (business, theme, browser).
 * Idempotent: saving the same progress twice never duplicates a row,
 * so a refresh or re-render cannot create a second draft.
 */
export function saveBookingDraft(input: BookingDraftInput): BookingDraftRecord {
  const now = Date.now();
  const browserId = bookingBrowserId();
  const store = readStore();
  const records = freshRecords(store, now);
  const existing = records.find(
    (record) =>
      record.businessId === input.businessId
      && record.themeId === input.themeId
      && record.browserId === browserId,
  );

  const next: BookingDraftRecord = {
    id: existing?.id || `draft-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    businessId: input.businessId,
    themeId: input.themeId,
    browserId,
    status: input.status,
    step: input.step,
    serviceId: input.serviceId ?? null,
    serviceName: input.serviceName ?? null,
    servicePrice: input.servicePrice ?? null,
    serviceDurationMinutes: input.serviceDurationMinutes ?? null,
    services: (input.services || []).map((line) => ({ ...line })),
    totalPrice: input.totalPrice ?? null,
    totalDurationMinutes: input.totalDurationMinutes ?? null,
    dateKey: input.dateKey ?? null,
    startMinutes: input.startMinutes ?? null,
    endMinutes: input.endMinutes ?? null,
    customer: input.customer ? { ...input.customer } : null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  writeStore({
    version: BOOKING_DRAFT_STORE_VERSION,
    records: [...records.filter((record) => record.id !== next.id), next],
  });
  return next;
}

/** Remove THIS browser's draft for the tenant + theme (post-confirmation cleanup). */
export function clearBookingDraft(businessId: string, themeId: string): void {
  const now = Date.now();
  const browserId = bookingBrowserId();
  const store = readStore();
  const records = freshRecords(store, now).filter(
    (record) =>
      !(record.businessId === businessId && record.themeId === themeId && record.browserId === browserId),
  );
  writeStore({ version: BOOKING_DRAFT_STORE_VERSION, records });
}
