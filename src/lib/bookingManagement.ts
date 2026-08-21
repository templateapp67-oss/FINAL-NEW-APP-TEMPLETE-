/**
 * PHASE 16.7 — BOOKING MANAGEMENT · data layer over the EXISTING stores.
 *
 * ONE management layer for the EXISTING booking/payment architecture (the
 * Phase 10.7/16.5 `siteBookingPayment` record store). No duplicate booking
 * system, no new tables/columns/ids, no fake bookings:
 *
 *   CUSTOMER VIEW — a visitor sees ONLY their own bookings: rows whose
 *   `customerId` equals THIS browser's existing anonymous identity
 *   (`bookingBrowserId()`, the same identity holds/likes/reviews use).
 *   The identity is read inside the helper — callers cannot pass someone
 *   else's id. Another customer's private rows can never be returned.
 *
 *   OWNER VIEW — the salon owner sees bookings for ONLY their own salon.
 *   The salon is resolved from the AUTHENTICATED session via the EXISTING
 *   `useAuth` + `resolveOwnerSalonId` chain (auth.users →
 *   organization_members role='owner' → salons), exactly like gallery
 *   (14.6) and video (15.6) management. This module never accepts, trusts
 *   or invents a salon id: `resolveBookingActor` maps the session to a
 *   permission and every owner helper re-checks it before touching data.
 *
 *   STATUS CHANGES — owners may move a booking along the EXISTING status
 *   machine only:
 *       pending_payment → confirmed | cancelled
 *       confirmed / pay_at_salon → completed | cancelled
 *   (completed/cancelled are terminal; customers may cancel only their own
 *   not-yet-completed booking). Transitions are validated in this layer —
 *   not just hidden buttons — and every mutation re-verifies BOTH the
 *   actor's permission AND row ownership (tenant + theme keys). When the
 *   draft DB set (M08/M12) is applied, `bookings` writes are additionally
 *   guarded database-side by RLS + `booking_status_history`; this layer
 *   mirrors those rules so the server swap changes the source, not the
 *   architecture.
 *
 *   PAYMENT FIELDS — total / advance paid / remaining / payment status are
 *   READ from the persisted record (the 16.5 money snapshot). Completing a
 *   booking marks the remaining balance collected at the salon
 *   (`balance_collections` in the draft schema); no amounts are invented.
 */
import {
  PAYMENT_EVENT,
  readPaymentRecords,
  readPaymentRecordsForBusiness,
} from './siteBookingPayment';
import type { BookingStatus, PaymentRecord, PaymentStatus } from './siteBookingPayment';
import { bookingBrowserId } from './siteBookingFlow';
import { PAYMENT_STORE_KEY, PAYMENT_STORE_VERSION } from './siteBookingPayment';

/* ------------------------------------------------------------------ */
/* Actor resolution (mirrors 14.6 gallery / 15.6 video management)     */
/* ------------------------------------------------------------------ */

export type BookingManagePermission =
  | 'authorized'
  | 'not-configured'
  | 'not-authenticated'
  | 'no-ownership'
  | 'ambiguous'
  | 'permission-denied'
  | 'error';

export interface BookingActorContext {
  permission: BookingManagePermission;
  /**
   * Optional session-resolved tenant scope. Phase 17.4 supplies this from
   * organization_members → salons; callers cannot expand it with a row id.
   * Older Phase 16 local-preview callers omit it for backwards compatibility.
   */
  allowedBusinessIds?: readonly string[];
}

/**
 * Maps the EXISTING session + ownership resolution onto a booking-management
 * permission. Identical semantics to `resolveVideoActor` (15.6) without the
 * admin tier — booking management is owner-scoped in this phase.
 */
export function resolveBookingActor(options: {
  supabaseConfigured: boolean;
  userPresent: boolean;
  resolution: { status: string } | null | undefined;
  /** Tenant keys derived from the resolved salon, never from owner input. */
  allowedBusinessIds?: readonly string[];
}): BookingActorContext {
  if (!options.supabaseConfigured) {
    // Local onboarding draft — the wizard preview owner manages their own
    // draft salon (same rule as 14.6/14.7/15.6 offline tiers).
    return { permission: 'not-configured' };
  }
  if (!options.userPresent) return { permission: 'not-authenticated' };
  const resolution = options.resolution;
  if (!resolution) return { permission: 'not-configured' };
  switch (resolution.status) {
    case 'not-configured': return { permission: 'not-configured' };
    case 'not-authenticated': return { permission: 'not-authenticated' };
    case 'resolved': return {
      permission: 'authorized',
      allowedBusinessIds: options.allowedBusinessIds
        ? Array.from(new Set(options.allowedBusinessIds))
        : undefined,
    };
    case 'no-membership': return { permission: 'no-ownership' };
    case 'ambiguous': return { permission: 'ambiguous' };
    case 'permission-denied': return { permission: 'permission-denied' };
    default: return { permission: 'error' };
  }
}

/** True when the actor may manage the salon's bookings. */
export function bookingActorCanManage(actor: BookingActorContext): boolean {
  return actor.permission === 'authorized' || actor.permission === 'not-configured';
}

/** User-facing denial copy (EN handled by i18n keys in the panel). */
export function bookingManageDeniedKey(permission: BookingManagePermission): string | null {
  switch (permission) {
    case 'authorized':
    case 'not-configured':
      return null;
    case 'not-authenticated': return 'manage.denied.login';
    case 'no-ownership': return 'manage.denied.noSalon';
    case 'ambiguous': return 'manage.denied.ambiguous';
    case 'permission-denied': return 'manage.denied.permission';
    default: return 'manage.denied.error';
  }
}

/* ------------------------------------------------------------------ */
/* Reads — strictly scoped                                             */
/* ------------------------------------------------------------------ */

/**
 * THIS visitor's own bookings (any salon/theme they booked from this
 * browser). The identity is read internally — a caller can never request
 * another customer's rows.
 */
export function readMyBookings(): PaymentRecord[] {
  const me = bookingBrowserId();
  return readPaymentRecords().filter((record) => record.customerId === me);
}

function actorAllowsBusiness(actor: BookingActorContext, businessId: string): boolean {
  return !actor.allowedBusinessIds || actor.allowedBusinessIds.includes(businessId);
}

/**
 * Bookings of ONE salon + theme for the OWNER panel. The caller must hold
 * an authorized actor context — the permission is re-checked here, not
 * just at the button — and the read itself is tenant-keyed so another
 * salon's rows are structurally unreachable.
 */
export function readSalonBookings(
  actor: BookingActorContext,
  businessId: string,
  themeId: string,
): { ok: true; records: PaymentRecord[] } | { ok: false; reason: BookingManagePermission } {
  if (!bookingActorCanManage(actor)) {
    return { ok: false, reason: actor.permission };
  }
  if (!actorAllowsBusiness(actor, businessId)) {
    return { ok: false, reason: 'permission-denied' };
  }
  return { ok: true, records: readPaymentRecordsForBusiness(businessId, themeId) };
}

/* ------------------------------------------------------------------ */
/* Status machine (mirrors the draft DB spec's allowed transitions)    */
/* ------------------------------------------------------------------ */

/** Transitions an OWNER may perform. Terminal states have no exits. */
const OWNER_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending_payment: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  pay_at_salon: ['completed', 'cancelled'],
  failed: [],
  cancelled: [],
  completed: [],
};

/** Statuses from which the CUSTOMER may cancel their own booking. */
const CUSTOMER_CANCELLABLE: BookingStatus[] = ['pending_payment', 'confirmed', 'pay_at_salon'];

export function ownerAllowedTransitions(status: BookingStatus): BookingStatus[] {
  return OWNER_TRANSITIONS[status] ?? [];
}

/**
 * Record-aware transitions used by Phase 17.4 controls. The raw status
 * machine remains the single transition map, while this guard applies the
 * existing payment prerequisite: an advance/full-payment booking cannot move
 * from Pending to Confirmed until its gateway payment is actually `paid`.
 * Payment and booking status remain distinct fields.
 */
export function ownerAllowedTransitionsForRecord(
  record: Pick<PaymentRecord, 'bookingStatus' | 'paymentStatus' | 'paymentOption'>,
): BookingStatus[] {
  const transitions = ownerAllowedTransitions(record.bookingStatus);
  if (
    record.bookingStatus === 'pending_payment'
    && record.paymentOption !== 'pay_at_salon'
    && record.paymentStatus !== 'paid'
  ) {
    return transitions.filter((status) => status !== 'confirmed');
  }
  return transitions;
}

export function customerCanCancel(record: Pick<PaymentRecord, 'bookingStatus'>): boolean {
  return CUSTOMER_CANCELLABLE.includes(record.bookingStatus);
}

/* ------------------------------------------------------------------ */
/* Mutations — permission + ownership re-checked inside                */
/* ------------------------------------------------------------------ */

export type BookingUpdateFailure =
  | BookingManagePermission          // actor not allowed
  | 'not-found'                      // no such row for this tenant
  | 'invalid-transition'             // status machine refused
  | 'advance-payment-required'       // required gateway payment has not succeeded
  | 'duplicate-update';              // persisted status already equals request

export interface UpdateResult {
  ok: boolean;
  record?: PaymentRecord;
  reason?: BookingUpdateFailure;
}

function patchRecordRaw(id: string, patch: Partial<PaymentRecord>): PaymentRecord | null {
  // Reuses the EXISTING store (same key/version/event as 10.7/16.5) via a
  // read-modify-write identical to the engine's internal patch helper.
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PAYMENT_STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version: number; records: PaymentRecord[] }) : null;
    if (!parsed || parsed.version !== PAYMENT_STORE_VERSION || !Array.isArray(parsed.records)) return null;
    const idx = parsed.records.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const next: PaymentRecord = { ...parsed.records[idx], ...patch, updatedAt: Date.now() };
    const records = parsed.records.slice();
    records[idx] = next;
    window.localStorage.setItem(PAYMENT_STORE_KEY, JSON.stringify({ version: PAYMENT_STORE_VERSION, records }));
    window.dispatchEvent(new Event(PAYMENT_EVENT));
    return next;
  } catch {
    return null;
  }
}

/**
 * OWNER status change. Verifies (1) the actor is authorized, (2) the row
 * belongs to the actor's salon + theme, (3) the transition is legal.
 * `completed` additionally settles the remaining balance as collected at
 * the salon (`paymentStatus: 'paid'`, remaining → 0 — mirroring the draft
 * schema's `balance_collections` semantics). `cancelled` never invents a
 * refund: paid amounts stay recorded, only the status flips.
 */
export function ownerUpdateBookingStatus(
  actor: BookingActorContext,
  businessId: string,
  themeId: string,
  bookingId: string,
  nextStatus: BookingStatus,
): UpdateResult {
  if (!bookingActorCanManage(actor)) {
    return { ok: false, reason: actor.permission };
  }
  if (!actorAllowsBusiness(actor, businessId)) {
    return { ok: false, reason: 'permission-denied' };
  }
  // Tenant-keyed lookup — a foreign salon's booking is structurally invisible.
  const record = readPaymentRecordsForBusiness(businessId, themeId)
    .find((r) => r.bookingId === bookingId);
  if (!record) return { ok: false, reason: 'not-found' };
  if (record.bookingStatus === nextStatus) {
    return { ok: false, reason: 'duplicate-update' };
  }
  if (!ownerAllowedTransitions(record.bookingStatus).includes(nextStatus)) {
    return { ok: false, reason: 'invalid-transition' };
  }
  // Server/data-layer payment gate — this is deliberately repeated here even
  // though the UI also omits Confirm. A crafted call cannot confirm an unpaid
  // advance/full-payment booking.
  if (
    nextStatus === 'confirmed'
    && record.paymentOption !== 'pay_at_salon'
    && record.paymentStatus !== 'paid'
  ) {
    return { ok: false, reason: 'advance-payment-required' };
  }

  const patch: Partial<PaymentRecord> = { bookingStatus: nextStatus };
  if (nextStatus === 'completed') {
    // Remaining balance collected at the salon on completion.
    patch.paymentStatus = 'paid' as PaymentStatus;
    patch.amountDue = record.amountDue + record.remainingAmount;
    patch.remainingAmount = 0;
  }
  if (nextStatus === 'cancelled') {
    patch.failureReason = 'Cancelled by salon';
    if (record.paymentStatus === 'pending') patch.paymentStatus = 'cancelled';
  }
  const updated = patchRecordRaw(record.id, patch);
  if (!updated) return { ok: false, reason: 'not-found' };
  return { ok: true, record: updated };
}

/**
 * CUSTOMER cancellation of THEIR OWN booking. The identity comes from the
 * browser, never from the caller; a record owned by someone else (or in a
 * terminal state) is refused.
 */
export function customerCancelBooking(
  businessId: string,
  themeId: string,
  bookingId: string,
): UpdateResult {
  const me = bookingBrowserId();
  const record = readPaymentRecordsForBusiness(businessId, themeId)
    .find((r) => r.bookingId === bookingId);
  if (!record || record.customerId !== me) return { ok: false, reason: 'not-found' };
  if (!customerCanCancel(record)) return { ok: false, reason: 'invalid-transition' };
  const patch: Partial<PaymentRecord> = {
    bookingStatus: 'cancelled',
    failureReason: 'Cancelled by customer',
  };
  if (record.paymentStatus === 'pending') patch.paymentStatus = 'cancelled';
  const updated = patchRecordRaw(record.id, patch);
  if (!updated) return { ok: false, reason: 'not-found' };
  return { ok: true, record: updated };
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

/** Service names of a record — the 16.5 line items or the single service. */
export function bookingServiceNames(record: Pick<PaymentRecord, 'serviceName' | 'services'>): string[] {
  if (record.services && record.services.length > 0) {
    return record.services.map((line) => line.serviceName);
  }
  return [record.serviceName];
}

/** Money snapshot: total / advance actually paid / remaining / status. */
export function bookingMoney(record: PaymentRecord): {
  total: number;
  advancePaid: number;
  remaining: number;
  paymentStatus: PaymentStatus;
} {
  const advancePaid = record.paymentStatus === 'paid' ? record.amountDue : 0;
  return {
    total: record.baseAmount,
    advancePaid,
    remaining: record.paymentStatus === 'paid' ? record.remainingAmount : record.baseAmount,
    paymentStatus: record.paymentStatus,
  };
}

/** Newest-first sort key that groups active bookings before terminal ones. */
export function sortBookingsForList(records: readonly PaymentRecord[]): PaymentRecord[] {
  const rank = (status: BookingStatus): number => {
    if (status === 'pending_payment') return 0;
    if (status === 'confirmed' || status === 'pay_at_salon') return 1;
    if (status === 'completed') return 2;
    return 3; // cancelled / failed
  };
  return records.slice().sort((a, b) => {
    const r = rank(a.bookingStatus) - rank(b.bookingStatus);
    if (r !== 0) return r;
    return b.createdAt - a.createdAt;
  });
}
