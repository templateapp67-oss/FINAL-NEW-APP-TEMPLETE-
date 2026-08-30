/**
 * PHASE 16.6 — BOOKING CONFIRMATION · derivation layer over the EXISTING
 * booking/payment record store.
 *
 * There is still exactly ONE booking architecture. This module does NOT
 * create bookings, tables, columns, ids or amounts — it only READS the
 * records the Phase 10.7 / 16.5 engine already persists
 * (`siteBookingPayment.ts`) and derives the confirmation view a customer
 * is allowed to see:
 *
 *   - **Booking reference** = the EXISTING `PaymentRecord.bookingId`
 *     produced by the existing `generateBookingId()` (`NX-#####`). Never
 *     invented, never hardcoded here.
 *   - **Money** = the EXISTING 16.5 money snapshot, read through the
 *     SAME rule the 16.7 management layer uses (`bookingMoney`) so total /
 *     advance paid / remaining can never disagree between screens.
 *   - **State** = derived strictly from the persisted booking + payment
 *     status pair. A booking is reported `confirmed` ONLY when the
 *     required payment actually succeeded (`paymentStatus === 'paid'`) or
 *     when the customer legitimately chose the no-advance "pay at salon"
 *     path. An inconsistent row (confirmed but unpaid) degrades to
 *     `payment_pending` — the screen must never claim a confirmation the
 *     payment did not earn.
 *   - **Privacy** — `readBookingConfirmation` resolves the browser
 *     identity INTERNALLY (`bookingBrowserId()`, the same identity the
 *     holds / reviews / 16.7 "My Bookings" surfaces use) and is keyed by
 *     tenant + theme. Another customer's or another salon's booking is
 *     structurally unreachable: the caller gets `not-found`, never data.
 *   - **Duplicate protection** — `findActiveBookingForContext` lets the
 *     booking flow re-use an existing live booking for the same
 *     salon + theme + services + date + slot + customer instead of
 *     creating a second row when the visitor refreshes, retries or comes
 *     back to the confirmation screen.
 *
 * When the drafted M08/M09 schema is eventually applied, `bookings` /
 * `payments` become the source of these same fields — the shape here
 * mirrors those columns so the swap changes the source, not the screens.
 */
import { bookingBrowserId } from './siteBookingFlow';
import { bookingMoney, bookingServiceNames } from './bookingManagement';
import { formatMinutesLabel, readPaymentRecordsForBusiness } from './siteBookingPayment';
import type {
  BookingCustomerSnapshot,
  BookingStatus,
  PaymentOption,
  PaymentRecord,
  PaymentServiceLine,
  PaymentStatus,
} from './siteBookingPayment';
import type { AppLocale } from './locale';

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

/**
 * The four customer-facing outcomes required by Phase 16.6, plus the
 * existing terminal `completed` state owned by the 16.7 status machine.
 */
export type BookingConfirmationState =
  | 'confirmed'
  | 'payment_pending'
  | 'payment_failed'
  | 'cancelled'
  | 'completed';

export const BOOKING_CONFIRMATION_STATES: BookingConfirmationState[] = [
  'confirmed',
  'payment_pending',
  'payment_failed',
  'cancelled',
  'completed',
];

/**
 * Derives the confirmation state from the persisted status pair.
 *
 * INVARIANT (Phase 16.5 + 16.6): `confirmed` requires a real success —
 * either `paymentStatus === 'paid'` for the advance / full-payment paths
 * or the explicit no-advance `pay_at_salon` booking status. Anything else
 * is pending, failed or cancelled.
 */
export function bookingConfirmationState(
  record: Pick<PaymentRecord, 'bookingStatus' | 'paymentStatus'>,
): BookingConfirmationState {
  const { bookingStatus, paymentStatus } = record;
  if (bookingStatus === 'cancelled' || paymentStatus === 'cancelled') return 'cancelled';
  if (bookingStatus === 'failed' || paymentStatus === 'failed') return 'payment_failed';
  if (bookingStatus === 'completed') return 'completed';
  if (bookingStatus === 'pay_at_salon') return 'confirmed';
  if (bookingStatus === 'confirmed') {
    // Never claim a confirmation the payment did not earn.
    return paymentStatus === 'paid' ? 'confirmed' : 'payment_pending';
  }
  return 'payment_pending';
}

/** True only when the screen may present the booking as confirmed. */
export function isConfirmedState(state: BookingConfirmationState): boolean {
  return state === 'confirmed' || state === 'completed';
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export interface BookingConfirmationView {
  /** Booking reference from the EXISTING record (`NX-#####`). */
  reference: string;
  /** Internal row id (never shown to the customer). */
  recordId: string;
  state: BookingConfirmationState;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentOption: PaymentOption;
  /** No advance was required — the customer pays everything at the salon. */
  payAtSalon: boolean;
  /** The chosen option required a gateway payment before confirmation. */
  advanceRequired: boolean;
  /** Tenant + theme this booking belongs to. */
  businessId: string;
  themeId: string;
  /** Service lines (single-service bookings collapse to one line). */
  services: PaymentServiceLine[];
  serviceNames: string[];
  /** Slot. */
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  /** Money — the EXISTING 16.5 snapshot, via the shared 16.7 rule. */
  totalAmount: number;
  advancePaid: number;
  remainingAmount: number;
  currency: string;
  /** Payment metadata. */
  paymentMethod: PaymentRecord['paymentMethod'];
  paymentMask?: string;
  gatewayRef?: string;
  failureReason?: string;
  /** Customer snapshot (this visitor's own details only). */
  customer: BookingCustomerSnapshot;
  staffName?: string | null;
  createdAt: number;
  updatedAt: number;
  /** HOME SERVICE — fulfillment snapshot (absent means At Salon). */
  fulfillment?: PaymentRecord['fulfillment'];
}

/** Service ids of a record — the 16.5 line items or the single service. */
export function bookingServiceIds(record: Pick<PaymentRecord, 'serviceId' | 'services'>): string[] {
  if (record.services && record.services.length > 0) {
    return record.services.map((line) => line.serviceId);
  }
  return [record.serviceId];
}

/** Normalised service lines — always at least one entry. */
export function bookingServiceLines(record: PaymentRecord): PaymentServiceLine[] {
  if (record.services && record.services.length > 0) {
    return record.services.map((line) => ({ ...line }));
  }
  return [{
    serviceId: record.serviceId,
    serviceName: record.serviceName,
    price: record.baseAmount,
    durationMinutes: Math.max(0, record.endMinutes - record.startMinutes),
  }];
}

/** Pure projection of an existing record — no writes, no invented values. */
export function toBookingConfirmation(record: PaymentRecord): BookingConfirmationView {
  const money = bookingMoney(record);
  return {
    reference: record.bookingId,
    recordId: record.id,
    state: bookingConfirmationState(record),
    bookingStatus: record.bookingStatus,
    paymentStatus: record.paymentStatus,
    paymentOption: record.paymentOption,
    payAtSalon: record.paymentOption === 'pay_at_salon',
    advanceRequired: record.paymentOption !== 'pay_at_salon',
    businessId: record.businessId,
    themeId: record.themeId,
    services: bookingServiceLines(record),
    serviceNames: bookingServiceNames(record),
    dateKey: record.dateKey,
    startMinutes: record.startMinutes,
    endMinutes: record.endMinutes,
    durationMinutes: Math.max(0, record.endMinutes - record.startMinutes),
    totalAmount: money.total,
    advancePaid: money.advancePaid,
    remainingAmount: money.remaining,
    currency: record.currency,
    paymentMethod: record.paymentMethod,
    paymentMask: record.paymentMask,
    gatewayRef: record.gatewayRef,
    failureReason: record.failureReason,
    customer: record.customer,
    staffName: record.staffName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.fulfillment ? { fulfillment: { ...record.fulfillment } } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Reads — own rows only, tenant + theme keyed                         */
/* ------------------------------------------------------------------ */

export type BookingConfirmationLookup =
  | { ok: true; view: BookingConfirmationView }
  | { ok: false; reason: 'not-found' };

/**
 * THIS visitor's confirmation for ONE booking reference at ONE salon +
 * theme. The identity is read internally, so a caller can never request
 * another customer's confirmation, and the tenant keys make another
 * salon's booking structurally unreachable.
 */
export function readBookingConfirmation(
  bookingId: string,
  businessId: string,
  themeId: string,
): BookingConfirmationLookup {
  const me = bookingBrowserId();
  const record = readPaymentRecordsForBusiness(businessId, themeId)
    .find((r) => r.bookingId === bookingId && r.customerId === me);
  if (!record) return { ok: false, reason: 'not-found' };
  return { ok: true, view: toBookingConfirmation(record) };
}

/** All of THIS visitor's confirmations at one salon + theme (newest first). */
export function readMyBookingConfirmations(businessId: string, themeId: string): BookingConfirmationView[] {
  const me = bookingBrowserId();
  return readPaymentRecordsForBusiness(businessId, themeId)
    .filter((record) => record.customerId === me)
    .map(toBookingConfirmation);
}

/* ------------------------------------------------------------------ */
/* Duplicate-booking protection                                        */
/* ------------------------------------------------------------------ */

/** Statuses that still represent a LIVE booking for a slot. */
const LIVE_STATUSES: BookingStatus[] = ['pending_payment', 'confirmed', 'pay_at_salon', 'completed'];

/**
 * Digits only, without a country-code prefix, so "+91 98765-43210",
 * "09876543210" and "9876543210" are recognised as the SAME customer and
 * cannot slip past the duplicate check through formatting alone.
 */
function normalizeMobile(value: string | undefined): string {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export interface BookingContext {
  businessId: string;
  themeId: string;
  serviceIds: string[];
  dateKey: string;
  startMinutes: number;
  customerMobile: string;
}

/** Stable identity of "the same booking attempt" — used to de-duplicate. */
export function bookingContextKey(input: BookingContext): string {
  return [
    input.businessId,
    input.themeId,
    input.serviceIds.slice().sort().join('+'),
    input.dateKey,
    input.startMinutes,
    normalizeMobile(input.customerMobile),
  ].join('|');
}

/**
 * The visitor's existing LIVE booking for exactly this context, if any.
 *
 * The booking flow calls this before creating a record so a refresh, a
 * retry or a return to the confirmation screen re-uses the existing
 * booking (and its reference) instead of creating a duplicate. Failed and
 * cancelled rows are ignored — those may legitimately be re-attempted.
 */
export function findActiveBookingForContext(input: BookingContext): PaymentRecord | null {
  const me = bookingBrowserId();
  const key = bookingContextKey(input);
  return readPaymentRecordsForBusiness(input.businessId, input.themeId).find((record) => {
    if (record.customerId !== me) return false;
    if (!LIVE_STATUSES.includes(record.bookingStatus)) return false;
    return bookingContextKey({
      businessId: record.businessId,
      themeId: record.themeId,
      serviceIds: bookingServiceIds(record),
      dateKey: record.dateKey,
      startMinutes: record.startMinutes,
      customerMobile: record.customer.mobile,
    }) === key;
  }) || null;
}

/* ------------------------------------------------------------------ */
/* Text receipt (shared by the confirmation panel's download action)   */
/* ------------------------------------------------------------------ */

export function bookingConfirmationReceiptText(
  view: BookingConfirmationView,
  T: Record<string, string>,
  locale: AppLocale,
  salonName: string,
): string {
  const money = (value: number) => `${view.currency === 'INR' ? '₹' : ''}${value.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN')}`;
  const lines: string[] = [];
  lines.push(T['receipt.title']);
  lines.push('================================');
  lines.push(`${T['field.reference']}: ${view.reference}`);
  lines.push(`${T['field.status']}: ${T[`state.${view.state}`] || view.state}`);
  lines.push('');
  lines.push(`${T['field.salon']}: ${salonName}`);
  lines.push(`${T['field.services']}: ${view.serviceNames.join(' + ')}`);
  lines.push(`${T['field.date']}: ${view.dateKey}`);
  lines.push(
    `${T['field.time']}: ${formatMinutesLabel(view.startMinutes, locale)} – ${formatMinutesLabel(view.endMinutes, locale)}`,
  );
  lines.push(`${T['field.duration']}: ${view.durationMinutes} ${T['common.minutes']}`);
  lines.push('');
  lines.push(`${T['field.total']}: ${money(view.totalAmount)}`);
  lines.push(`${T['field.advancePaid']}: ${money(view.advancePaid)}`);
  lines.push(`${T['field.remaining']}: ${money(view.remainingAmount)}`);
  lines.push(`${T['field.paymentStatus']}: ${T[`payment.${view.paymentStatus}`] || view.paymentStatus}`);
  if (view.gatewayRef) lines.push(`${T['field.gatewayRef']}: ${view.gatewayRef}`);
  lines.push('');
  lines.push(`${T['field.customer']}: ${view.customer.name}`);
  lines.push(`${T['field.mobile']}: ${view.customer.mobile}`);
  lines.push('');
  lines.push(`${T['receipt.issued']}: ${new Date(view.updatedAt || view.createdAt).toISOString()}`);
  return lines.join('\n');
}
