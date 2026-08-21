/**
 * PHASE 17.7 — OWNER CALENDAR / SCHEDULE · authorized data projection.
 *
 * Real appointment records only. Reads use the existing Phase 16.7 tenant
 * boundary and status blocking uses the exact Phase 16.3 availability
 * predicate. No calendar table, event id, relationship or booking path is
 * introduced.
 */
import { readSalonBookings } from './bookingManagement';
import type { BookingActorContext, BookingManagePermission } from './bookingManagement';
import { bookingStatusBlocksAvailability } from './siteBookingAvailability';
import type { PaymentRecord } from './siteBookingPayment';
import { localDateKey, salonNow } from './salonStatus';
import { toTodayAppointment } from './ownerTodayAppointments';
import type { TodayAppointment } from './ownerTodayAppointments';
import { recordMatchesOwnerFilters } from './ownerDashboardFilters';
import type { OwnerDashboardFilterState } from './ownerDashboardFilters';

export type CalendarView = 'day' | 'week';
export type SchedulePeriodState = 'booked' | 'cancelled' | 'completed';

export interface ScheduleAppointment extends TodayAppointment {
  periodState: SchedulePeriodState;
  /** Cancelled/failed slots are released by the existing availability rule. */
  releasedForAvailability: boolean;
}

export interface ScheduleDay {
  date: Date;
  dateKey: string;
  appointments: ScheduleAppointment[];
}

export type OwnerScheduleResult =
  | { ok: true; appointments: ScheduleAppointment[] }
  | { ok: false; reason: BookingManagePermission };

export function schedulePeriodState(status: PaymentRecord['bookingStatus']): SchedulePeriodState {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled' || status === 'failed') return 'cancelled';
  return 'booked';
}

export function toScheduleAppointment(record: PaymentRecord): ScheduleAppointment {
  const row = toTodayAppointment(record);
  const periodState = schedulePeriodState(record.bookingStatus);
  return {
    ...row,
    periodState,
    releasedForAvailability:
      periodState === 'cancelled' && !bookingStatusBlocksAvailability(record.bookingStatus),
  };
}

export function sortScheduleAppointments(
  rows: readonly ScheduleAppointment[],
): ScheduleAppointment[] {
  return rows.slice().sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (a.endMinutes !== b.endMinutes) return a.endMinutes - b.endMinutes;
    return a.bookingId.localeCompare(b.bookingId);
  });
}

/** All real appointments for the authenticated owner's own salon. */
export function readOwnerSchedule(
  actor: BookingActorContext,
  businessIds: readonly string[],
  themeIds: readonly string[],
  filters?: OwnerDashboardFilterState,
): OwnerScheduleResult {
  const seen = new Set<string>();
  const appointments: ScheduleAppointment[] = [];

  for (const businessId of businessIds) {
    for (const themeId of themeIds) {
      const result = readSalonBookings(actor, businessId, themeId);
      if (result.ok !== true) return { ok: false, reason: result.reason };
      for (const record of result.records) {
        if (filters && !recordMatchesOwnerFilters(record, filters, 'appointment')) continue;
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        appointments.push(toScheduleAppointment(record));
      }
    }
  }

  return { ok: true, appointments: sortScheduleAppointments(appointments) };
}

export function parseScheduleDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addLocalCalendarDays(date: Date, amount: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

/** Monday-first week containing the selected local date. */
export function scheduleWeekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = start.getDay();
  start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return start;
}

export function scheduleDatesForView(
  selectedDate: Date,
  view: CalendarView,
): Date[] {
  if (view === 'day') {
    return [new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())];
  }
  const start = scheduleWeekStart(selectedDate);
  return Array.from({ length: 7 }, (_, index) => addLocalCalendarDays(start, index));
}

export function groupScheduleByDates(
  appointments: readonly ScheduleAppointment[],
  dates: readonly Date[],
): ScheduleDay[] {
  return dates.map((date) => {
    const dateKey = localDateKey(date);
    return {
      date,
      dateKey,
      appointments: sortScheduleAppointments(
        appointments.filter((appointment) => appointment.dateKey === dateKey),
      ),
    };
  });
}

export function initialScheduleDate(now: Date = salonNow()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function moveScheduleDate(
  selectedDate: Date,
  view: CalendarView,
  direction: -1 | 1,
): Date {
  return addLocalCalendarDays(selectedDate, direction * (view === 'week' ? 7 : 1));
}
