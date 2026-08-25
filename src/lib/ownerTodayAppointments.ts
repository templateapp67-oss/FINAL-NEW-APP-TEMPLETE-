/**
 * PHASE 17.2 — TODAY'S APPOINTMENTS · data layer.
 *
 * Reads the OWNER's OWN salon's REAL bookings for TODAY out of the EXISTING
 * booking/payment architecture. Nothing here is new storage:
 *
 *   SOURCE — the Phase 10.7 / 16.5 payment-record store
 *   (`siteBookingPayment.ts`). Every website booking already persists there
 *   with its tenant keys (`businessId` + `themeId`), the 16.5 multi-service
 *   lines, the slot snapshot (`dateKey`, `startMinutes`, `endMinutes`), the
 *   money snapshot and the customer snapshot. That store IS the booking list.
 *   No duplicate table, column, id or record shape is introduced, and no fake
 *   appointment is ever synthesised — an empty store renders the empty state.
 *
 *   OWNERSHIP — the salon comes from the AUTHENTICATED session through the
 *   EXISTING chain (auth.users → organization_members role='owner' →
 *   salons.organization_id → salons.id), surfaced by 17.1's
 *   `loadOwnerDashboardContext()`. Reads go through 16.7's
 *   `readSalonBookings()`, which re-checks the actor's permission and does a
 *   TENANT-KEYED read, so another salon's rows are structurally unreachable.
 *   `job_salon_members` is a staff relationship and is NOT used for ownership.
 *
 *   TODAY — "today" is the salon clock's local calendar day
 *   (`salonNow()` + `localDateKey()`, the same helpers booking availability
 *   uses), never UTC — `toISOString()` would shift the day in IST.
 *
 *   STATUS — the EXISTING status values only (`pending_payment`, `confirmed`,
 *   `pay_at_salon`, `completed`, `cancelled`, `failed`). No new status is
 *   invented; cancelled/failed rows are kept but marked inactive so the owner
 *   can see that the slot was released.
 *
 * SCOPE (17.2): today's list only. Upcoming appointments, customer
 * management, revenue calculations, calendar logic and notifications are NOT
 * implemented here.
 */

import {
  bookingMoney,
  bookingServiceNames,
  readSalonBookings,
} from './bookingManagement';
import type { BookingActorContext, BookingManagePermission } from './bookingManagement';
import type { BookingStatus, PaymentRecord, PaymentStatus } from './siteBookingPayment';
import { localDateKey, salonNow } from './salonStatus';
import { recordMatchesOwnerFilters } from './ownerDashboardFilters';
import type { OwnerDashboardFilterState } from './ownerDashboardFilters';

/* ------------------------------------------------------------------ */
/* Status grouping — existing values only                              */
/* ------------------------------------------------------------------ */

/**
 * The four buckets the owner must be able to distinguish. `pay_at_salon` is
 * an EXISTING confirmed variant (the booking is confirmed, payment happens at
 * the salon), so it groups under `confirmed`; `failed` is a terminal
 * non-attendance outcome and groups with `cancelled`.
 */
export type TodayStatusGroup = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export const TODAY_STATUS_GROUPS: TodayStatusGroup[] = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
];

export function todayStatusGroup(status: BookingStatus): TodayStatusGroup {
  switch (status) {
    case 'pending_payment':
      return 'pending';
    case 'confirmed':
    case 'pay_at_salon':
      return 'confirmed';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'failed':
    case 'no_show':
    default:
      return 'cancelled';
  }
}

/** Cancelled/failed rows are shown but visually and semantically inactive. */
export function isCancelledAppointment(status: BookingStatus): boolean {
  return status === 'cancelled' || status === 'failed' || status === 'no_show';
}

/** A row the salon still expects someone to turn up for. */
export function isActiveAppointment(status: BookingStatus): boolean {
  return !isCancelledAppointment(status) && status !== 'completed';
}

/* ------------------------------------------------------------------ */
/* View model                                                          */
/* ------------------------------------------------------------------ */

/**
 * One row of the Today list, projected from an EXISTING payment record.
 * Every field is READ from the record — none is computed from thin air.
 */
export interface TodayAppointment {
  /** Existing record id (store row) and the existing human booking id. */
  id: string;
  bookingId: string;
  /**
   * Existing immutable tenant locator. Status controls pass these exact values
   * back to the mutation layer; they are never entered by the owner.
   */
  businessId: string;
  themeId: PaymentRecord['themeId'];
  paymentOption: PaymentRecord['paymentOption'];
  /** Customer snapshot the booking was created with (existing permissions). */
  customerName: string;
  customerMobile: string;
  /** 16.5 service lines, or the single-service fallback. */
  serviceNames: string[];
  /** Slot snapshot, minutes since midnight (salon local). */
  startMinutes: number;
  endMinutes: number;
  /** Derived only from the two slot fields above. */
  durationMinutes: number;
  dateKey: string;
  status: BookingStatus;
  statusGroup: TodayStatusGroup;
  paymentStatus: PaymentStatus;
  /** Money snapshot exactly as 16.7's `bookingMoney` reports it. */
  total: number;
  advancePaid: number;
  remaining: number;
  currency: string;
  staffName: string | null;
  cancelled: boolean;
}

/**
 * Duration comes from the record's own slot span. Records are always written
 * with `endMinutes > startMinutes`; a malformed row yields 0 rather than a
 * negative or invented number.
 */
export function appointmentDuration(record: Pick<PaymentRecord, 'startMinutes' | 'endMinutes'>): number {
  const span = record.endMinutes - record.startMinutes;
  return Number.isFinite(span) && span > 0 ? span : 0;
}

export function toTodayAppointment(record: PaymentRecord): TodayAppointment {
  const money = bookingMoney(record);
  return {
    id: record.id,
    bookingId: record.bookingId,
    businessId: record.businessId,
    themeId: record.themeId,
    paymentOption: record.paymentOption,
    customerName: (record.customer?.name || '').trim(),
    customerMobile: (record.customer?.mobile || '').trim(),
    serviceNames: bookingServiceNames(record),
    startMinutes: record.startMinutes,
    endMinutes: record.endMinutes,
    durationMinutes: appointmentDuration(record),
    dateKey: record.dateKey,
    status: record.bookingStatus,
    statusGroup: todayStatusGroup(record.bookingStatus),
    paymentStatus: money.paymentStatus,
    total: money.total,
    advancePaid: money.advancePaid,
    remaining: money.remaining,
    currency: record.currency,
    staffName: record.staffName ? record.staffName.trim() || null : null,
    cancelled: isCancelledAppointment(record.bookingStatus),
  };
}

/* ------------------------------------------------------------------ */
/* Today filter + chronological ordering                               */
/* ------------------------------------------------------------------ */

/** The salon's local calendar day. Never UTC. */
export function todayDateKey(now: Date = salonNow()): string {
  return localDateKey(now);
}

export function isTodayRecord(record: Pick<PaymentRecord, 'dateKey'>, dateKey: string): boolean {
  return record.dateKey === dateKey;
}

/**
 * Chronological by appointment time — the requirement for this section.
 * Ties break on the end time, then on the booking id so the order is stable
 * across re-renders (no jitter when two bookings share a slot).
 */
export function sortByAppointmentTime(rows: readonly TodayAppointment[]): TodayAppointment[] {
  return rows.slice().sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (a.endMinutes !== b.endMinutes) return a.endMinutes - b.endMinutes;
    return a.bookingId.localeCompare(b.bookingId);
  });
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export type TodayAppointmentsResult =
  | { ok: true; dateKey: string; appointments: TodayAppointment[] }
  | { ok: false; reason: BookingManagePermission };

/**
 * TODAY's appointments for the owner's OWN salon.
 *
 * `businessIds` are the SESSION-RESOLVED tenant candidates from
 * `ownerBookingTenant()` (organization_id → salon id → the engine's own
 * `public-site` fallback) — never a user-supplied value. `themeIds` are the
 * themes the salon's site may have stamped rows with.
 *
 * The permission is re-checked inside `readSalonBookings` for EVERY key
 * (hiding UI is only cosmetic) and each read is tenant-keyed, so a foreign
 * salon's bookings can never appear — not even for an otherwise-authorized
 * owner. Rows are de-duplicated by record id.
 */
export function readTodayAppointments(
  actor: BookingActorContext,
  businessIds: readonly string[],
  themeIds: readonly string[],
  now: Date = salonNow(),
  filters?: OwnerDashboardFilterState,
): TodayAppointmentsResult {
  const dateKey = todayDateKey(now);
  const seen = new Set<string>();
  const rows: TodayAppointment[] = [];

  for (const businessId of businessIds) {
    for (const themeId of themeIds) {
      const result = readSalonBookings(actor, businessId, themeId);
      // A refusal for one key is a refusal for all of them — never fall back
      // to a partial/silent list.
      if (result.ok !== true) return { ok: false, reason: result.reason };
      for (const record of result.records) {
        if (!isTodayRecord(record, dateKey)) continue;
        if (filters && !recordMatchesOwnerFilters(record, filters, 'appointment', now)) continue;
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        rows.push(toTodayAppointment(record));
      }
    }
  }

  return { ok: true, dateKey, appointments: sortByAppointmentTime(rows) };
}

/* ------------------------------------------------------------------ */
/* Counts — a plain tally of the rows above (no revenue maths here)    */
/* ------------------------------------------------------------------ */

export type TodayStatusCounts = Record<TodayStatusGroup, number> & { total: number };

/**
 * Counts the REAL rows already loaded. This is a tally of existing records,
 * not a statistic about the business, and never runs when the list is empty.
 */
export function countByStatusGroup(rows: readonly TodayAppointment[]): TodayStatusCounts {
  const counts: TodayStatusCounts = {
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    total: rows.length,
  };
  for (const row of rows) counts[row.statusGroup] += 1;
  return counts;
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

/** Localized duration label, e.g. "1 h 30 m" / "45 m". */
export function formatDurationLabel(minutes: number, hourUnit: string, minuteUnit: string): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ${hourUnit} ${m} ${minuteUnit}`;
  if (h > 0) return `${h} ${hourUnit}`;
  return `${m} ${minuteUnit}`;
}

/** True when there is a real remaining balance worth showing. */
export function hasRemainingBalance(row: Pick<TodayAppointment, 'remaining'>): boolean {
  return Number.isFinite(row.remaining) && row.remaining > 0;
}

/** True when a real advance was actually collected. */
export function hasAdvancePaid(row: Pick<TodayAppointment, 'advancePaid'>): boolean {
  return Number.isFinite(row.advancePaid) && row.advancePaid > 0;
}
