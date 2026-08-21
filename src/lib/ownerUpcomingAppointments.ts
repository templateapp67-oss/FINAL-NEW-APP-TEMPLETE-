/**
 * PHASE 17.3 — UPCOMING APPOINTMENTS · data layer.
 *
 * FUTURE bookings for the OWNER's OWN salon, read from the EXISTING booking
 * architecture. This module deliberately REUSES Phase 17.2's projection and
 * ownership plumbing instead of duplicating them:
 *
 *   SOURCE — the Phase 10.7 / 16.5 payment-record store, read through 16.7's
 *   `readSalonBookings()` (permission re-checked inside, tenant-keyed) exactly
 *   as `ownerTodayAppointments.ts` does. Same records, same `Appointment`
 *   projection (`toTodayAppointment`), same money/service helpers. No new
 *   store, table, column, id or record shape, and no synthetic appointment —
 *   an empty store yields an empty list.
 *
 *   OWNERSHIP — the authenticated session only:
 *   auth.users → organization_members (role='owner') → salons.organization_id
 *   → salons.id, surfaced by 17.1's `loadOwnerDashboardContext()` and the
 *   session-derived tenant candidates from `ownerBookingTenant()`.
 *   `job_salon_members` is a staff relationship and is NOT used.
 *
 *   "UPCOMING" — strictly AFTER the salon's local calendar day, matching the
 *   section's existing shipped description ("Appointments scheduled after
 *   today") and keeping a clean boundary with the 17.2 Today list, so a
 *   booking is never shown twice across the two sections. Past days are
 *   excluded by the same comparison.
 *
 *   INACTIVE ROWS — cancelled/failed bookings are EXCLUDED here, per the
 *   existing booking rules (`isCancelledAppointment`, the same predicate 17.2
 *   uses to mark a slot released). Upcoming is a forward-looking work list;
 *   a released slot is not upcoming work.
 *
 * SCOPE (17.3): the upcoming list + its date grouping only. Booking status
 * management, customer management, revenue, calendar and notifications are
 * NOT implemented here.
 */

import { readSalonBookings } from './bookingManagement';
import type { BookingActorContext, BookingManagePermission } from './bookingManagement';
import type { PaymentRecord } from './siteBookingPayment';
import { localDateKey, salonNow } from './salonStatus';
import { recordMatchesOwnerFilters } from './ownerDashboardFilters';
import type { OwnerDashboardFilterState } from './ownerDashboardFilters';
import {
  isCancelledAppointment,
  toTodayAppointment,
  todayDateKey,
} from './ownerTodayAppointments';
import type { TodayAppointment, TodayStatusGroup } from './ownerTodayAppointments';

/**
 * The upcoming list uses the SAME row shape as the today list — one
 * appointment projection across the dashboard, not two.
 */
export type UpcomingAppointment = TodayAppointment;

/* ------------------------------------------------------------------ */
/* Window predicates                                                   */
/* ------------------------------------------------------------------ */

/**
 * A record is "upcoming" when its own `dateKey` is strictly after the salon's
 * local today. String comparison is safe and intentional: `dateKey` is a
 * zero-padded `YYYY-MM-DD` produced by `localDateKey()`, so lexical order IS
 * chronological order — and no timezone conversion can shift the day.
 */
export function isUpcomingDateKey(dateKey: string, today: string): boolean {
  return typeof dateKey === 'string' && dateKey > today;
}

/** Past or today — everything the upcoming list must exclude by date. */
export function isPastOrTodayDateKey(dateKey: string, today: string): boolean {
  return !isUpcomingDateKey(dateKey, today);
}

/**
 * Rows the upcoming list shows: future-dated AND still active per the
 * EXISTING rules (cancelled/failed are inactive). Completed rows cannot occur
 * in the future in practice, but if one exists it is a real record and is not
 * filtered out here — only inactivity and the date window filter.
 */
export function isUpcomingRecord(
  record: Pick<PaymentRecord, 'dateKey' | 'bookingStatus'>,
  today: string,
): boolean {
  if (!isUpcomingDateKey(record.dateKey, today)) return false;
  if (isCancelledAppointment(record.bookingStatus)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Ordering — nearest first                                            */
/* ------------------------------------------------------------------ */

/**
 * Nearest upcoming date/time first: date ascending, then start time, then end
 * time, then booking id so the order is stable across re-renders.
 */
export function sortByNearestUpcoming(
  rows: readonly UpcomingAppointment[],
): UpcomingAppointment[] {
  return rows.slice().sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (a.endMinutes !== b.endMinutes) return a.endMinutes - b.endMinutes;
    return a.bookingId.localeCompare(b.bookingId);
  });
}

/* ------------------------------------------------------------------ */
/* Date grouping                                                       */
/* ------------------------------------------------------------------ */

/**
 * How a day should be labelled relative to now. Only `tomorrow` is special —
 * every other day is rendered from its own real date, never from an invented
 * bucket name.
 */
export type UpcomingDayKind = 'tomorrow' | 'this-week' | 'later';

export interface UpcomingGroup {
  /** `YYYY-MM-DD` of the day (the records' own value). */
  dateKey: string;
  kind: UpcomingDayKind;
  /** Whole days from today — 1 = tomorrow. Derived, never stored. */
  daysAhead: number;
  appointments: UpcomingAppointment[];
}

/** Midnight of the salon's local today — the reference point for offsets. */
function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Parse a `YYYY-MM-DD` key as a LOCAL date (never UTC). */
export function parseDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '');
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days between the salon's today and the given day key. */
export function daysAhead(dateKey: string, now: Date = salonNow()): number {
  const target = parseDateKey(dateKey);
  if (!target) return 0;
  const diffMs = localMidnight(target).getTime() - localMidnight(now).getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function upcomingDayKind(offset: number): UpcomingDayKind {
  if (offset <= 1) return 'tomorrow';
  if (offset <= 7) return 'this-week';
  return 'later';
}

/**
 * Group the sorted rows by their own appointment date, nearest day first.
 * Days with no bookings are NOT emitted — the dashboard never renders an
 * empty day it invented.
 */
export function groupByDate(
  rows: readonly UpcomingAppointment[],
  now: Date = salonNow(),
): UpcomingGroup[] {
  const byDate = new Map<string, UpcomingAppointment[]>();
  for (const row of sortByNearestUpcoming(rows)) {
    const bucket = byDate.get(row.dateKey);
    if (bucket) bucket.push(row);
    else byDate.set(row.dateKey, [row]);
  }
  return [...byDate.entries()].map(([dateKey, appointments]) => {
    const offset = daysAhead(dateKey, now);
    return { dateKey, kind: upcomingDayKind(offset), daysAhead: offset, appointments };
  });
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export type UpcomingAppointmentsResult =
  | {
      ok: true;
      todayKey: string;
      appointments: UpcomingAppointment[];
      groups: UpcomingGroup[];
    }
  | { ok: false; reason: BookingManagePermission };

/**
 * UPCOMING appointments for the owner's OWN salon.
 *
 * `businessIds` / `themeIds` are the SESSION-RESOLVED tenant candidates — never
 * user input. The permission is re-checked inside `readSalonBookings` for every
 * key, each read is tenant-keyed, and a refusal on ANY key refuses the whole
 * read rather than degrading to a partial or silently-empty list. Rows are
 * de-duplicated by record id.
 */
export function readUpcomingAppointments(
  actor: BookingActorContext,
  businessIds: readonly string[],
  themeIds: readonly string[],
  now: Date = salonNow(),
  filters?: OwnerDashboardFilterState,
): UpcomingAppointmentsResult {
  const todayKey = todayDateKey(now);
  const seen = new Set<string>();
  const rows: UpcomingAppointment[] = [];

  for (const businessId of businessIds) {
    for (const themeId of themeIds) {
      const result = readSalonBookings(actor, businessId, themeId);
      if (result.ok !== true) return { ok: false, reason: result.reason };
      for (const record of result.records) {
        if (!isUpcomingRecord(record, todayKey)) continue;
        if (filters && !recordMatchesOwnerFilters(record, filters, 'appointment', now)) continue;
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        rows.push(toTodayAppointment(record));
      }
    }
  }

  const appointments = sortByNearestUpcoming(rows);
  return { ok: true, todayKey, appointments, groups: groupByDate(appointments, now) };
}

/* ------------------------------------------------------------------ */
/* Tally                                                               */
/* ------------------------------------------------------------------ */

export type UpcomingStatusCounts = Record<TodayStatusGroup, number> & {
  total: number;
  days: number;
};

/** Tally of the REAL rows loaded — not a business statistic. */
export function countUpcoming(groups: readonly UpcomingGroup[]): UpcomingStatusCounts {
  const counts: UpcomingStatusCounts = {
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
    days: groups.length,
  };
  for (const group of groups) {
    for (const row of group.appointments) {
      counts[row.statusGroup] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

/** Localized long date label for a group heading, from the row's own key. */
export function formatGroupDate(dateKey: string, locale: 'en' | 'hi'): string {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  return date.toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
