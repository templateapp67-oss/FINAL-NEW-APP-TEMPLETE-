/**
 * PHASE 10.7 — ADVANCE PAYMENT & BOOKING CONFIRMATION · single payment engine.
 *
 * The public site has exactly ONE booking + payment architecture. This module
 * owns the payment side: pricing the selected item, mapping it onto one of
 * three customer-facing payment options, running a deterministic mock gateway
 * with a real-world timeout / failure / cancellation / retry surface,
 * persisting the resulting booking + payment status in a secure local store,
 * and guarding against duplicate payments or duplicate confirmations on
 * refresh / retry.
 *
 * No network call, no real gateway, no real money — but the shape and the
 * guards match what a real integration will need. Replacing `simulateGateway`
 * with a real gateway call is a one-function swap.
 *
 *   - Payment options      : 'pay_at_salon' | 'advance' | 'full'
 *   - Payment status       : 'unpaid' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
 *   - Booking status       : 'pending_payment' | 'confirmed' | 'pay_at_salon' | 'failed' | 'cancelled'
 *   - Idempotency key      : every attempt uses a stable per-booking key, so
 *                            a refresh or retry never creates a second
 *                            payment / booking row.
 *   - Sensitive fields     : card numbers / UPI IDs / CVV are NEVER stored —
 *                            only a masked last-4 + payment method label.
 *   - Tenant ownership     : every persisted record carries the active
 *                            business / theme / tenant so two different
 *                            salons can never share booking rows.
 */
import type { AppLocale } from './locale';
import { parsedBookingRules, bookingBrowserId, bookingSlotKey } from './siteBookingFlow';
import type { Service } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import { serviceDisplayPrice } from './pricing';
import { isSupabaseConfigured } from './supabaseClient';

/* ------------------------------------------------------------------ */
/* Public types                                                       */
/* ------------------------------------------------------------------ */

export type PaymentOption = 'pay_at_salon' | 'advance' | 'full';
export const PAYMENT_OPTIONS: PaymentOption[] = ['pay_at_salon', 'advance', 'full'];

export type PaymentMethod = 'card' | 'upi' | 'netbanking' | 'wallet' | 'salon';
export const PAYMENT_METHODS: PaymentMethod[] = ['card', 'upi', 'netbanking', 'wallet'];

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
/** PHASE 16.7 — `completed` added additively (owner marks a served booking). */
export type BookingStatus = 'pending_payment' | 'confirmed' | 'pay_at_salon' | 'failed' | 'cancelled' | 'completed' | 'no_show';

export type GatewayOutcome = 'success' | 'failure' | 'cancellation' | 'timeout';

export interface PaymentAmounts {
  /** Pre-discount service price (or bundle final price). */
  baseAmount: number;
  /** Whatever the option asks the visitor to pay now. */
  amountDue: number;
  /** Amount the visitor still owes at the salon (0 for `full`/`pay_at_salon` advance). */
  remainingAmount: number;
  /** Advance deposit percentage actually applied (0 for `full`, 100 for `pay_at_salon`). */
  advancePercent: number;
  /** Source of the amount: which item was booked. */
  source: 'service' | 'package';
  /** Whether the option is the no-payment path. */
  requiresGateway: boolean;
}

/* ------------------------------------------------------------------ */
/* Pricing                                                            */
/* ------------------------------------------------------------------ */

export function calculatePaymentAmounts(
  option: PaymentOption,
  item: { price: number; finalPrice: number },
  bookingRules: { advanceDepositPercentage?: number } | undefined,
): PaymentAmounts {
  const base = Math.max(0, item.finalPrice || item.price || 0);
  const pct = Math.max(0, Math.min(100, bookingRules?.advanceDepositPercentage ?? 25));
  if (option === 'full') {
    return {
      baseAmount: base,
      amountDue: base,
      remainingAmount: 0,
      advancePercent: 100,
      source: 'service',
      requiresGateway: true,
    };
  }
  if (option === 'advance') {
    const amountDue = Math.round((base * pct) / 100);
    return {
      baseAmount: base,
      amountDue,
      remainingAmount: Math.max(0, base - amountDue),
      advancePercent: pct,
      source: 'service',
      requiresGateway: true,
    };
  }
  // pay_at_salon — no gateway, full amount stays due.
  return {
    baseAmount: base,
    amountDue: 0,
    remainingAmount: base,
    advancePercent: 0,
    source: 'service',
    requiresGateway: false,
  };
}

/** Resolves the service final price (offer-aware) and packages it with booking rules. */
export function summarizeServiceForPayment(
  service: Service,
  offers: Service['translations'] extends never ? never : unknown,
): { finalPrice: number; basePrice: number } {
  // `serviceDisplayPrice` accepts `ServiceOffer[]`; we pass whatever offers
  // the host already loaded so an offer-aware price is used.
  const offerList = (Array.isArray(offers) ? offers : []) as never;
  const pricing = serviceDisplayPrice(service, offerList as never);
  return { finalPrice: pricing.finalPrice, basePrice: pricing.basePrice };
}

/* ------------------------------------------------------------------ */
/* Persistence (booking + payment records)                             */
/* ------------------------------------------------------------------ */

export const PAYMENT_STORE_KEY = 'nexora_site_payment_records';
export const PAYMENT_EVENT = 'nexora:site-payment';
/** Bump this if the on-disk record schema changes. */
export const PAYMENT_STORE_VERSION = 1;
/** Inactivity timer for the mock gateway (mirrors a real "session expired"). */
export const PAYMENT_GATEWAY_TIMEOUT_MS = 30_000;

/** Test-only override for the inactivity window (the UI counter reads this). */
let gatewayTimeoutOverride: number | null = null;
export function setPaymentGatewayTimeoutForTests(ms: number | null): void {
  gatewayTimeoutOverride = ms;
}
export function paymentGatewayTimeoutMs(): number {
  return gatewayTimeoutOverride ?? PAYMENT_GATEWAY_TIMEOUT_MS;
}

export interface PaymentRecord {
  /** Internal row id. */
  id: string;
  /** Stable per-attempt key — guards against duplicate payments. */
  idempotencyKey: string;
  /** Tenant ownership: the salon / business that owns this row. */
  businessId: string;
  themeId: SiteHeaderThemeId;
  /** Booking / customer identity. */
  customerId: string;
  bookingId: string;
  serviceId: string;
  serviceName: string;
  /** PHASE 16.5 — all selected services (absent = single-service booking). */
  services?: PaymentServiceLine[];
  /** Snapshot of the slot at the moment of booking. */
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  /** Money snapshot. */
  baseAmount: number;
  amountDue: number;
  remainingAmount: number;
  currency: string;
  /** What the visitor chose. */
  paymentOption: PaymentOption;
  paymentMethod: PaymentMethod | null;
  /** Status snapshots. */
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  /** Optional method-of-payment detail (masked only — never the full value). */
  paymentMask?: string;
  /** Gateway reference id (only on success). */
  gatewayRef?: string;
  /** Failure / cancellation reason (human-readable, never raw SQL). */
  failureReason?: string;
  /** Optional staff preference. */
  staffId?: string | null;
  staffName?: string | null;
  /** Full snapshot of the customer details at the time of booking. */
  customer: BookingCustomerSnapshot;
  createdAt: number;
  updatedAt: number;
  /** Whether this record came from a no-payment path (pay_at_salon). */
  payAtSalon: boolean;
  /**
   * HOME SERVICE — optional + additive fulfillment snapshot. Absent means an
   * At Salon booking (every pre-existing record parses unchanged).
   */
  fulfillment?: {
    mode: 'at_salon' | 'home_service';
    address?: string;
    distanceKm?: number;
    homeServiceCharge?: number;
  } | null;
}

export interface BookingCustomerSnapshot {
  name: string;
  mobile: string;
  email?: string;
  notes?: string;
}

/**
 * PHASE 16.5 — one selected service inside a multi-service booking record.
 * Optional + additive: pre-16.5 rows without `services` parse unchanged and
 * mean a single-service booking (the existing serviceId/serviceName fields).
 * This is the browser-local sandbox store — NOT a database column.
 */
export interface PaymentServiceLine {
  serviceId: string;
  serviceName: string;
  /** Offer-aware price actually charged for this line (existing pricing). */
  price: number;
  durationMinutes: number;
}

export interface PersistedPaymentStore {
  version: number;
  records: PaymentRecord[];
}

const FALLBACK_BUSINESS_ID = 'public-site';

function readStore(): PersistedPaymentStore {
  if (typeof window === 'undefined') return { version: PAYMENT_STORE_VERSION, records: [] };
  try {
    const raw = window.localStorage.getItem(PAYMENT_STORE_KEY);
    if (!raw) return { version: PAYMENT_STORE_VERSION, records: [] };
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed || typeof parsed !== 'object'
      || (parsed as PersistedPaymentStore).version !== PAYMENT_STORE_VERSION
      || !Array.isArray((parsed as PersistedPaymentStore).records)
    ) {
      return { version: PAYMENT_STORE_VERSION, records: [] };
    }
    return parsed as PersistedPaymentStore;
  } catch {
    return { version: PAYMENT_STORE_VERSION, records: [] };
  }
}

function writeStore(store: PersistedPaymentStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PAYMENT_EVENT));
  }
}

function emitEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PAYMENT_EVENT));
  }
}

/** All records in the local store, newest first. */
export function readPaymentRecords(): PaymentRecord[] {
  return readStore().records.slice().sort((a, b) => b.createdAt - a.createdAt);
}

/** Records for a specific tenant — used everywhere to enforce ownership. */
export function readPaymentRecordsForBusiness(businessId: string, themeId: string): PaymentRecord[] {
  return readPaymentRecords().filter((r) => r.businessId === businessId && r.themeId === themeId);
}

/** Find a record by its booking id (within the active tenant). */
export function findPaymentRecord(bookingId: string, businessId = FALLBACK_BUSINESS_ID, themeId?: string): PaymentRecord | null {
  return readPaymentRecords().find(
    (r) => r.bookingId === bookingId && r.businessId === businessId && (themeId ? r.themeId === themeId : true),
  ) || null;
}

/** Find a record by its idempotency key (used by the gateway simulator). */
export function findPaymentRecordByKey(idempotencyKey: string, businessId: string, themeId: string): PaymentRecord | null {
  return readPaymentRecords().find(
    (r) => r.idempotencyKey === idempotencyKey && r.businessId === businessId && r.themeId === themeId,
  ) || null;
}

/** Test-only injection of the store. */
let injectedStore: PersistedPaymentStore | null = null;
export function setPaymentStoreForTests(store: PersistedPaymentStore | null): void {
  injectedStore = store ? { ...store, records: store.records.slice() } : null;
}

function effectiveStore(): PersistedPaymentStore {
  if (injectedStore) return injectedStore;
  return readStore();
}

function effectiveWrite(store: PersistedPaymentStore): void {
  if (injectedStore) {
    injectedStore = { ...store, records: store.records.slice() };
    emitEvent();
    return;
  }
  writeStore(store);
}

/** Test-only store read. */
export function readPaymentStoreForTests(): PersistedPaymentStore {
  return effectiveStore();
}

/* ------------------------------------------------------------------ */
/* ID + idempotency                                                   */
/* ------------------------------------------------------------------ */

function randToken(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Human-facing booking id (matches the existing `NX-10482` style). */
export function generateBookingId(): string {
  // 5 digits — collision-resistance for a single browser is plenty; the
  // server-side real implementation will own the authoritative id space.
  const num = Math.floor(10000 + Math.random() * 89999);
  return `NX-${num}`;
}

/** Idempotency key for an attempt. Stable per (bookingId, paymentOption, slot). */
export function buildIdempotencyKey(input: {
  businessId: string;
  themeId: SiteHeaderThemeId;
  bookingId: string;
  paymentOption: PaymentOption;
  amountDue: number;
  serviceId: string;
  dateKey: string;
  startMinutes: number;
  /** HOME SERVICE — mode + address join the key so distinct fulfillments never collide. */
  fulfillmentMode?: 'at_salon' | 'home_service';
  serviceAddress?: string | null;
}): string {
  const parts = [
    input.businessId,
    input.themeId,
    input.bookingId,
    input.paymentOption,
    input.amountDue,
    input.serviceId,
    input.dateKey,
    input.startMinutes,
  ];
  if (input.fulfillmentMode === 'home_service') {
    parts.push('home_service', (input.serviceAddress || '').trim().toLowerCase());
  }
  return parts.join('|');
}

/* ------------------------------------------------------------------ */
/* Record creation                                                    */
/* ------------------------------------------------------------------ */

export interface CreatePaymentRecordInput {
  businessId: string;
  themeId: SiteHeaderThemeId;
  service: Service;
  /** PHASE 16.5 — full multi-service line items (optional + additive). */
  services?: PaymentServiceLine[];
  bookingId: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  amounts: PaymentAmounts;
  paymentOption: PaymentOption;
  paymentMethod: PaymentMethod | null;
  customer: BookingCustomerSnapshot;
  paymentMask?: string;
  staffId?: string | null;
  staffName?: string | null;
  /** HOME SERVICE — optional fulfillment snapshot persisted with the record. */
  fulfillment?: PaymentRecord['fulfillment'];
}

/** Creates a record for the no-payment path immediately (pay_at_salon). */
export function createPayAtSalonRecord(input: CreatePaymentRecordInput): PaymentRecord {
  return createBookingRecordInternal(input, {
    paymentStatus: 'unpaid',
    bookingStatus: 'pay_at_salon',
    payAtSalon: true,
  });
}

/**
 * Creates a pending record for the gateway path (advance / full payment).
 * Status is `pending` / `pending_payment` until the gateway resolves.
 */
export function createPendingBookingRecord(input: CreatePaymentRecordInput): PaymentRecord {
  return createBookingRecordInternal(input, {
    paymentStatus: 'pending',
    bookingStatus: 'pending_payment',
    payAtSalon: false,
  });
}

interface InternalCreateOptions {
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  payAtSalon: boolean;
}

function createBookingRecordInternal(
  input: CreatePaymentRecordInput,
  options: InternalCreateOptions,
): PaymentRecord {
  const id = randToken('pay');
  const now = Date.now();
  const idempotencyKey = buildIdempotencyKey({
    businessId: input.businessId,
    themeId: input.themeId,
    bookingId: input.bookingId,
    paymentOption: input.paymentOption,
    amountDue: input.amounts.amountDue,
    serviceId: input.service.id,
    dateKey: input.dateKey,
    startMinutes: input.startMinutes,
    ...(input.fulfillment?.mode === 'home_service'
      ? { fulfillmentMode: 'home_service' as const, serviceAddress: input.fulfillment.address || null }
      : {}),
  });
  const record: PaymentRecord = {
    id,
    idempotencyKey,
    businessId: input.businessId,
    themeId: input.themeId,
    customerId: bookingBrowserId(),
    bookingId: input.bookingId,
    serviceId: input.service.id,
    serviceName: input.service.name,
    ...(input.services && input.services.length > 0
      ? { services: input.services.map((line) => ({ ...line })) }
      : {}),
    dateKey: input.dateKey,
    startMinutes: input.startMinutes,
    endMinutes: input.endMinutes,
    baseAmount: input.amounts.baseAmount,
    amountDue: input.amounts.amountDue,
    remainingAmount: input.amounts.remainingAmount,
    currency: 'INR',
    paymentOption: input.paymentOption,
    paymentMethod: input.paymentMethod,
    paymentStatus: options.paymentStatus,
    bookingStatus: options.bookingStatus,
    customer: input.customer,
    staffId: input.staffId ?? null,
    staffName: input.staffName ?? null,
    paymentMask: input.paymentMask,
    createdAt: now,
    updatedAt: now,
    payAtSalon: options.payAtSalon,
    ...(input.fulfillment ? { fulfillment: { ...input.fulfillment } } : {}),
  };
  const store = effectiveStore();
  // Idempotency: a duplicate call returns the existing record instead of
  // creating a second one.
  const existing = store.records.find((r) => r.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  effectiveWrite({ version: PAYMENT_STORE_VERSION, records: [record, ...store.records] });
  return record;
}

function patchRecord(id: string, patch: Partial<PaymentRecord>): PaymentRecord | null {
  const store = effectiveStore();
  const idx = store.records.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const next: PaymentRecord = { ...store.records[idx], ...patch, updatedAt: Date.now() };
  const records = store.records.slice();
  records[idx] = next;
  effectiveWrite({ version: PAYMENT_STORE_VERSION, records });
  return next;
}

/* ------------------------------------------------------------------ */
/* Mock gateway                                                       */
/* ------------------------------------------------------------------ */

export interface GatewayForm {
  method: PaymentMethod;
  /** Card number (last 4 captured only). */
  cardNumber?: string;
  cardHolder?: string;
  cardExpiry?: string;
  /** UPI id (last 4 captured only). */
  upiId?: string;
  /** Bank/wallet label (masked only). */
  bankLabel?: string;
  walletLabel?: string;
}

export interface GatewayAttempt {
  attemptId: string;
  recordId: string;
  startedAt: number;
  /** Resolves when the gateway returns. */
  promise: Promise<GatewayAttemptResult>;
  /**
   * Cancel the attempt. `outcome` selects how the record resolves:
   * `cancellation` (default — the customer stopped the payment) or
   * `timeout` (the inactivity window expired — the record lands in
   * `failed`, never `confirmed`).
   */
  cancel: (reason?: string, outcome?: GatewayOutcome) => void;
}

export interface GatewayAttemptResult {
  outcome: GatewayOutcome;
  reason?: string;
  gatewayRef?: string;
  maskedIdentifier?: string;
  method: PaymentMethod;
  /** Snapshot of the record after the attempt completed. */
  record: PaymentRecord;
}

export type GatewayScenario = 'all_success' | 'mixed' | 'force_failure' | 'force_timeout';

let scenario: GatewayScenario = 'all_success';
/** Test-only override. */
export function setPaymentScenarioForTests(next: GatewayScenario): void {
  scenario = next;
}

function maskCardNumber(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  if (!last4) return undefined;
  return `•••• ${last4}`;
}

function maskUpiId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const at = value.indexOf('@');
  if (at <= 0) return value.slice(0, 2) + '•••';
  const handle = value.slice(0, Math.max(1, Math.min(at, 3)));
  return `${handle}•••@${value.slice(at + 1)}`;
}

function maskBankLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length > 16 ? `${value.slice(0, 14)}…` : value;
}

export function maskPaymentForm(form: Partial<GatewayForm>): string | undefined {
  if (form.method === 'card') return maskCardNumber(form.cardNumber);
  if (form.method === 'upi') return maskUpiId(form.upiId);
  if (form.method === 'netbanking') return maskBankLabel(form.bankLabel);
  if (form.method === 'wallet') return maskBankLabel(form.walletLabel);
  return undefined;
}

/** How the customer wants to pay at the salon. */
export const PAY_AT_SALON_METHODS: PaymentMethod[] = ['cash', 'upi', 'card'].filter(() => true) as never;
export const SALON_METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
};

/**
 * Deterministic mock gateway. Honours the active scenario:
 *  - `all_success` (default): every call returns `success`.
 *  - `mixed`: ~25% return `failure` (insufficient funds, generic decline).
 *  - `force_failure`: always fails with the given reason.
 *  - `force_timeout`: never resolves — the UI uses its own inactivity
 *    timer to mark the attempt as `timeout`.
 */
export function simulateGateway(record: PaymentRecord, form: Partial<GatewayForm>): GatewayAttempt {
  const attemptId = randToken('att');
  const startedAt = Date.now();
  let cancelTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let cancelReason: string | undefined;
  let cancelHook: ((reason?: string, outcome?: GatewayOutcome) => void) | null = null;

  // A configured deployment must never treat this browser simulator as payment
  // authority. Real flows persist a UUID booking and use startRazorpayCheckout,
  // whose server routes derive the amount and verify the signature.
  if (isSupabaseConfigured) {
    const reason = 'Secure checkout requires a persisted booking. Please restart this booking.';
    const failed = patchRecord(record.id, {
      paymentStatus: 'failed',
      bookingStatus: 'pending_payment',
      paymentMethod: form.method,
      paymentMask: maskPaymentForm(form),
      failureReason: reason,
    }) || record;
    return {
      attemptId,
      recordId: record.id,
      startedAt,
      promise: Promise.resolve({ outcome: 'failure', reason, method: form.method, record: failed }),
      cancel() { /* already failed closed */ },
    };
  }

  // Move the demo-only record into the `pending` state immediately.
  patchRecord(record.id, {
    paymentStatus: 'pending',
    paymentMethod: form.method,
    paymentMask: maskPaymentForm(form),
  });

  const finish = (resolve: (v: GatewayAttemptResult) => void, outcome: GatewayOutcome, reason?: string) => {
    const updated = effectiveStore().records.find((r) => r.id === record.id);
    if (!updated) {
      resolve({
        outcome: 'failure',
        reason: 'record-missing',
        method: form.method,
        record,
      });
      return;
    }
    if (outcome === 'success') {
      const gatewayRef = randToken('GW').toUpperCase();
      const next = patchRecord(record.id, {
        paymentStatus: 'paid',
        bookingStatus: 'confirmed',
        paymentMethod: form.method,
        paymentMask: maskPaymentForm(form),
        gatewayRef,
        failureReason: undefined,
      });
      resolve({
        outcome: 'success',
        gatewayRef,
        maskedIdentifier: maskPaymentForm(form),
        method: form.method,
        record: next || updated,
      });
      return;
    }
    if (outcome === 'failure') {
      const next = patchRecord(record.id, {
        paymentStatus: 'failed',
        bookingStatus: 'failed',
        paymentMethod: form.method,
        paymentMask: maskPaymentForm(form),
        failureReason: reason || 'Payment declined by issuer',
      });
      resolve({
        outcome: 'failure',
        reason: reason || 'Payment declined by issuer',
        method: form.method,
        record: next || updated,
      });
      return;
    }
    if (outcome === 'cancellation') {
      const next = patchRecord(record.id, {
        paymentStatus: 'cancelled',
        bookingStatus: 'cancelled',
        paymentMethod: form.method,
        paymentMask: maskPaymentForm(form),
        failureReason: reason || 'Payment cancelled by customer',
      });
      resolve({
        outcome: 'cancellation',
        reason: reason || 'Payment cancelled by customer',
        method: form.method,
        record: next || updated,
      });
      return;
    }
    if (outcome === 'timeout') {
      const next = patchRecord(record.id, {
        paymentStatus: 'failed',
        bookingStatus: 'failed',
        paymentMethod: form.method,
        paymentMask: maskPaymentForm(form),
        failureReason: reason || 'Payment timed out — please retry',
      });
      resolve({
        outcome: 'timeout',
        reason: reason || 'Payment timed out — please retry',
        method: form.method,
        record: next || updated,
      });
    }
  };

  const promise = new Promise<GatewayAttemptResult>((resolve) => {
    const resolveNow = () => {
      if (scenario === 'force_failure') return finish(resolve, 'failure', 'Payment declined by issuer (test)');
      if (scenario === 'force_timeout') return; // never resolves on its own
      // mixed: ~25% decline
      if (scenario === 'mixed' && Math.random() < 0.25) {
        return finish(resolve, 'failure', 'Payment declined by issuer');
      }
      // Simulated network latency
      cancelTimer = setTimeout(() => finish(resolve, 'success'), 1100);
    };

    // Tiny delay so the UI can show a "processing" state.
    setTimeout(() => {
      if (cancelled) return;
      resolveNow();
    }, 250);

    cancelHook = (reason?: string, outcome: GatewayOutcome = 'cancellation') => {
      cancelled = true;
      cancelReason = reason;
      if (cancelTimer) clearTimeout(cancelTimer);
      finish(resolve, outcome, reason);
    };
  });

  return {
    attemptId,
    recordId: record.id,
    startedAt,
    promise,
    cancel(reason?: string, outcome?: GatewayOutcome) {
      cancelHook?.(reason, outcome);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Retry helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Retry a failed attempt for the same booking + option. Re-uses the
 * idempotency key so a refresh of the page can never produce a second
 * confirmed payment for the same amount.
 */
export function retryPayment(record: PaymentRecord, form: Partial<GatewayForm>): GatewayAttempt {
  // Re-create the record in `pending` state — but never create a second row.
  const refreshed = patchRecord(record.id, {
    paymentStatus: 'pending',
    paymentMethod: form.method,
    paymentMask: maskPaymentForm(form),
    failureReason: undefined,
    bookingStatus: 'pending_payment',
  }) || record;
  return simulateGateway(refreshed, form);
}

/* ------------------------------------------------------------------ */
/* Slot key helper (kept here so callers don't have to import flow)   */
/* ------------------------------------------------------------------ */

export function paymentSlotKey(themeId: string, serviceId: string, dateKey: string, startMinutes: number): string {
  return bookingSlotKey(themeId, serviceId, dateKey, startMinutes);
}

/* ------------------------------------------------------------------ */
/* Convenience: derive a clean receipt view from a record             */
/* ------------------------------------------------------------------ */

export interface ReceiptView {
  bookingId: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentOption: PaymentOption;
  paymentMethod: PaymentMethod | null;
  paymentLabel: string;
  maskedIdentifier?: string;
  gatewayRef?: string;
  totalAmount: number;
  amountPaid: number;
  amountDueAtSalon: number;
  currency: string;
  createdAt: number;
  paidAt?: number;
  serviceName: string;
  /** PHASE 16.5 — line items of a multi-service booking (absent = single). */
  services?: PaymentServiceLine[];
  dateKey: string;
  startLabel: string;
  endLabel: string;
  durationMinutes: number;
  customer: BookingCustomerSnapshot;
  businessId: string;
  themeId: string;
  staffId?: string | null;
  staffName?: string | null;
}

export function toReceiptView(record: PaymentRecord, locale: AppLocale = 'en'): ReceiptView {
  const startLabel = formatMinutesLabel(record.startMinutes, locale);
  const endLabel = formatMinutesLabel(record.endMinutes, locale);
  const methodLabel: Record<PaymentMethod, string> = {
    card: 'Card',
    upi: 'UPI',
    netbanking: 'Net Banking',
    wallet: 'Wallet',
    salon: 'Pay at Salon',
  };
  const paymentLabel = record.paymentMethod
    ? methodLabel[record.paymentMethod] || 'Pay at Salon'
    : record.payAtSalon
      ? 'Pay at Salon'
      : 'Pay at Salon';
  return {
    bookingId: record.bookingId,
    bookingStatus: record.bookingStatus,
    paymentStatus: record.paymentStatus,
    paymentOption: record.paymentOption,
    paymentMethod: record.paymentMethod,
    paymentLabel,
    maskedIdentifier: record.paymentMask,
    gatewayRef: record.gatewayRef,
    totalAmount: record.baseAmount,
    amountPaid: record.paymentStatus === 'paid' ? record.amountDue : 0,
    amountDueAtSalon: record.paymentStatus === 'paid' ? record.remainingAmount : record.baseAmount,
    currency: record.currency,
    createdAt: record.createdAt,
    paidAt: record.paymentStatus === 'paid' ? record.updatedAt : undefined,
    serviceName: record.services && record.services.length > 1
      ? record.services.map((line) => line.serviceName).join(' + ')
      : record.serviceName,
    services: record.services,
    dateKey: record.dateKey,
    startLabel,
    endLabel,
    durationMinutes: Math.max(0, record.endMinutes - record.startMinutes),
    customer: record.customer,
    businessId: record.businessId,
    themeId: record.themeId,
    staffId: record.staffId,
    staffName: record.staffName,
  };
}

/** Localized 12h/24h label. */
export function formatMinutesLabel(minutes: number, locale: AppLocale = 'en'): string {
  const hrs = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hrs >= 12 ? (locale === 'hi' ? 'शाम' : 'PM') : (locale === 'hi' ? 'सुबह' : 'AM');
  const display = hrs % 12 === 0 ? 12 : hrs % 12;
  const mm = String(mins).padStart(2, '0');
  return `${display}:${mm} ${period}`;
}

/* ------------------------------------------------------------------ */
/* Resolve the booking rules an offer-aware summary should respect    */
/* ------------------------------------------------------------------ */

export function paymentAdvancePercentage(rules: { advanceDepositPercentage?: number } | undefined): number {
  return Math.max(0, Math.min(100, rules?.advanceDepositPercentage || 25));
}
