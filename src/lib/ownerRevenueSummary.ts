/**
 * PHASE 17.6 — REVENUE & PAYMENT SUMMARY · authorized data projection.
 *
 * Uses the EXISTING Phase 10.7/16.5 booking/payment records only. There is no
 * analytics store, financial row, transaction id, table or column here.
 * Every read passes through `readSalonBookings`, so the actor permission and
 * session-derived salon tenant scope are re-checked before any amount is seen.
 *
 * The active payment engine is the existing deterministic mock/test gateway.
 * Values calculated here are therefore explicitly test-mode values; they are
 * never represented as production settlements.
 */
import { readSalonBookings } from './bookingManagement';
import type { BookingActorContext, BookingManagePermission } from './bookingManagement';
import type { PaymentRecord, PaymentStatus } from './siteBookingPayment';
import { salonNow } from './salonStatus';
import { filterOwnerRecords } from './ownerDashboardFilters';
import type { OwnerDashboardFilterState } from './ownerDashboardFilters';

/** Existing runtime mode documented by siteBookingPayment.ts. */
export const OWNER_PAYMENT_DATA_MODE = 'mock' as const;

export type RevenueDateRange = 'all' | 'today' | '7d' | '30d';
export const REVENUE_DATE_RANGES: RevenueDateRange[] = ['all', 'today', '7d', '30d'];

export interface PaymentSummaryBucket {
  count: number;
  /** Existing requested/paid amount represented by this status bucket. */
  amount: number;
}

export interface OwnerRevenueSummary {
  recordsCount: number;
  /** Sum of non-failed/non-cancelled real booking snapshots. */
  totalBookingValue: number;
  /** Paid amount on non-failed/non-cancelled bookings only. */
  receivedAmount: number;
  /** Amount still due on non-failed/non-cancelled bookings. */
  remainingAmount: number;
  paid: PaymentSummaryBucket;
  pending: PaymentSummaryBucket;
  failed: PaymentSummaryBucket;
  unpaid: PaymentSummaryBucket;
  cancelled: PaymentSummaryBucket;
  refunded: PaymentSummaryBucket;
  /** Paid transaction value attached to cancelled bookings, excluded above. */
  cancelledPaidExcluded: PaymentSummaryBucket;
}

export type OwnerRevenueResult =
  | { ok: true; records: PaymentRecord[]; summary: OwnerRevenueSummary }
  | { ok: false; reason: BookingManagePermission };

function money(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Booking status and payment status stay separate in every predicate. */
export function bookingCountsTowardValue(record: Pick<PaymentRecord, 'bookingStatus'>): boolean {
  return record.bookingStatus !== 'failed' && record.bookingStatus !== 'cancelled';
}

export function paymentCountsAsReceived(
  record: Pick<PaymentRecord, 'bookingStatus' | 'paymentStatus'>,
): boolean {
  return record.paymentStatus === 'paid' && bookingCountsTowardValue(record);
}

/**
 * Remaining due follows the existing 16.7 money semantics: after a successful
 * payment use the persisted remainder; when nothing succeeded, the complete
 * booking value is still due. Failed/cancelled bookings contribute nothing.
 */
export function remainingForRecord(
  record: Pick<PaymentRecord, 'bookingStatus' | 'paymentStatus' | 'baseAmount' | 'remainingAmount'>,
): number {
  if (!bookingCountsTowardValue(record)) return 0;
  return record.paymentStatus === 'paid'
    ? money(record.remainingAmount)
    : money(record.baseAmount);
}

function bucketForStatus(records: readonly PaymentRecord[], status: PaymentStatus): PaymentSummaryBucket {
  const matches = records.filter((record) => record.paymentStatus === status);
  return {
    count: matches.length,
    amount: matches.reduce((total, record) => total + money(record.amountDue), 0),
  };
}

export function summarizeOwnerRevenue(records: readonly PaymentRecord[]): OwnerRevenueSummary {
  const active = records.filter(bookingCountsTowardValue);
  const received = records.filter(paymentCountsAsReceived);
  const cancelledPaid = records.filter(
    (record) => record.bookingStatus === 'cancelled' && record.paymentStatus === 'paid',
  );

  return {
    recordsCount: records.length,
    totalBookingValue: active.reduce((total, record) => total + money(record.baseAmount), 0),
    receivedAmount: received.reduce((total, record) => total + money(record.amountDue), 0),
    remainingAmount: active.reduce((total, record) => total + remainingForRecord(record), 0),
    // A paid payment attached to a cancelled/failed booking is deliberately
    // excluded from this successful bucket and from received revenue.
    paid: {
      count: received.length,
      amount: received.reduce((total, record) => total + money(record.amountDue), 0),
    },
    pending: bucketForStatus(records, 'pending'),
    failed: bucketForStatus(records, 'failed'),
    unpaid: bucketForStatus(records, 'unpaid'),
    cancelled: bucketForStatus(records, 'cancelled'),
    refunded: bucketForStatus(records, 'refunded'),
    cancelledPaidExcluded: {
      count: cancelledPaid.length,
      amount: cancelledPaid.reduce((total, record) => total + money(record.amountDue), 0),
    },
  };
}

function localDayStart(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** Date filter over the existing booking/payment record creation timestamp. */
export function revenueRangeStart(
  range: RevenueDateRange,
  now: Date = salonNow(),
): number | null {
  if (range === 'all') return null;
  const today = localDayStart(now);
  if (range === 'today') return today;
  const days = range === '7d' ? 7 : 30;
  return today - (days - 1) * 24 * 60 * 60 * 1000;
}

export function filterRevenueRecordsByDate(
  records: readonly PaymentRecord[],
  range: RevenueDateRange,
  now: Date = salonNow(),
): PaymentRecord[] {
  const start = revenueRangeStart(range, now);
  if (start === null) return records.slice();
  const end = localDayStart(now) + 24 * 60 * 60 * 1000;
  return records.filter((record) => record.createdAt >= start && record.createdAt < end);
}

/**
 * Read and de-duplicate real records for the authenticated owner's own salon.
 * A refusal on any key refuses the whole financial result.
 */
export function readOwnerRevenueSummary(
  actor: BookingActorContext,
  businessIds: readonly string[],
  themeIds: readonly string[],
  range: RevenueDateRange = 'all',
  now: Date = salonNow(),
  filters?: OwnerDashboardFilterState,
): OwnerRevenueResult {
  const seen = new Set<string>();
  const records: PaymentRecord[] = [];

  for (const businessId of businessIds) {
    for (const themeId of themeIds) {
      const result = readSalonBookings(actor, businessId, themeId);
      if (result.ok !== true) return { ok: false, reason: result.reason };
      for (const record of result.records) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        records.push(record);
      }
    }
  }

  const globallyFiltered = filters
    ? filterOwnerRecords(records, filters, 'created', now)
    : records;
  const filtered = filterRevenueRecordsByDate(globallyFiltered, range, now);
  return { ok: true, records: filtered, summary: summarizeOwnerRevenue(filtered) };
}
