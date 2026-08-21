/**
 * PHASE 17.8 — OWNER NOTIFICATIONS · existing-event projection.
 *
 * The repository already defines the authoritative `notifications` table,
 * per-user `is_read` state and tenant/user RLS in draft M10/M12. Those drafts
 * are not active in the current browser-local mock booking runtime, so this
 * module does NOT create a second notification store or read-state mechanism.
 *
 * Instead, the current dashboard projects owner notifications deterministically
 * from real existing booking/payment records and their persisted timestamps.
 * The existing PAYMENT_EVENT refreshes the view. No click creates a notice,
 * and no notification id/table/relationship is invented.
 */
import { readSalonBookings } from './bookingManagement';
import type { BookingActorContext, BookingManagePermission } from './bookingManagement';
import type { BookingStatus, PaymentRecord, PaymentStatus } from './siteBookingPayment';
import { eventTimestampMatchesOwnerDateRange, recordMatchesOwnerFilters } from './ownerDashboardFilters';
import type { OwnerDashboardFilterState } from './ownerDashboardFilters';

export type OwnerNotificationType =
  | 'new_booking'
  | 'payment_received'
  | 'booking_cancelled'
  | 'status_changed'
  | 'payment_failed';

export interface OwnerNotification {
  /** Stable render key derived from the existing record id + represented event. */
  key: string;
  type: OwnerNotificationType;
  recordId: string;
  bookingId: string;
  occurredAt: number;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  serviceNames: string[];
  /** Current local record source has no persistent read/unread field. */
  isRead?: boolean;
}

export type OwnerNotificationsResult =
  | { ok: true; notifications: OwnerNotification[]; records: PaymentRecord[] }
  | { ok: false; reason: BookingManagePermission };

function serviceNames(record: PaymentRecord): string[] {
  return record.services?.length
    ? record.services.map((line) => line.serviceName)
    : [record.serviceName];
}

function event(
  record: PaymentRecord,
  type: OwnerNotificationType,
  occurredAt: number,
  amount = 0,
): OwnerNotification {
  return {
    key: `${record.id}:${type}`,
    type,
    recordId: record.id,
    bookingId: record.bookingId,
    occurredAt,
    bookingStatus: record.bookingStatus,
    paymentStatus: record.paymentStatus,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    serviceNames: serviceNames(record),
  };
}

/**
 * Events that can be proven from the persisted record only. We deliberately
 * do not reconstruct intermediate history that the current source does not
 * contain. When the existing DB notifications/history tables become active,
 * their real rows can replace this adapter without changing the UI contract.
 */
export function notificationsFromBookingRecord(record: PaymentRecord): OwnerNotification[] {
  const notifications: OwnerNotification[] = [
    event(record, 'new_booking', record.createdAt),
  ];

  if (record.paymentStatus === 'paid' && record.amountDue > 0) {
    notifications.push(event(record, 'payment_received', record.updatedAt, record.amountDue));
  }
  if (record.paymentStatus === 'failed') {
    notifications.push(event(record, 'payment_failed', record.updatedAt, record.amountDue));
  }
  if (record.bookingStatus === 'cancelled') {
    notifications.push(event(record, 'booking_cancelled', record.updatedAt));
  } else if (
    record.updatedAt > record.createdAt
    && (record.bookingStatus === 'confirmed' || record.bookingStatus === 'completed')
  ) {
    notifications.push(event(record, 'status_changed', record.updatedAt));
  }

  return notifications;
}

export function sortOwnerNotifications(
  notifications: readonly OwnerNotification[],
): OwnerNotification[] {
  const priority: Record<OwnerNotificationType, number> = {
    booking_cancelled: 0,
    payment_received: 1,
    payment_failed: 2,
    status_changed: 3,
    new_booking: 4,
  };
  return notifications.slice().sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return b.occurredAt - a.occurredAt;
    if (priority[a.type] !== priority[b.type]) return priority[a.type] - priority[b.type];
    if (a.bookingId !== b.bookingId) return a.bookingId.localeCompare(b.bookingId);
    return a.key.localeCompare(b.key);
  });
}

/** Real events for the authenticated owner's own salon only. */
export function readOwnerNotifications(
  actor: BookingActorContext,
  businessIds: readonly string[],
  themeIds: readonly string[],
  filters?: OwnerDashboardFilterState,
): OwnerNotificationsResult {
  const seen = new Set<string>();
  const records: PaymentRecord[] = [];

  for (const businessId of businessIds) {
    for (const themeId of themeIds) {
      const result = readSalonBookings(actor, businessId, themeId);
      if (result.ok !== true) return { ok: false, reason: result.reason };
      for (const record of result.records) {
        const nonDateFilters = filters ? { ...filters, dateRange: 'all' as const } : undefined;
        if (nonDateFilters && !recordMatchesOwnerFilters(record, nonDateFilters, 'appointment')) continue;
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        records.push(record);
      }
    }
  }

  const notifications = records
    .flatMap(notificationsFromBookingRecord)
    .filter((notification) => !filters
      || eventTimestampMatchesOwnerDateRange(notification.occurredAt, filters.dateRange));
  return {
    ok: true,
    records,
    notifications: sortOwnerNotifications(notifications),
  };
}
