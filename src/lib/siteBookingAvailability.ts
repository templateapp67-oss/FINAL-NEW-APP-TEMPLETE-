/**
 * PHASE 16.3 — DATE & TIME SLOT AVAILABILITY · derivation layer.
 *
 * Bridges the EXISTING data sources into the slot engine's
 * `BookingSlotExtras` — no new stores, no new tables, no invented data:
 *
 *   1. **Booked spans** — real booking records from the EXISTING Phase 10.7
 *      payment store (`readPaymentRecordsForBusiness`), scoped to the active
 *      salon + theme. Records that represent a live appointment
 *      (`confirmed`, `pay_at_salon`, `pending_payment`) block their span;
 *      failed / cancelled records never do. Another salon's records can
 *      never leak in — the read itself is tenant-keyed.
 *
 *   2. **Staff windows** — the EXISTING `SalonData.team` relationship:
 *      `TeamMember.assignedServiceIds` (staff ↔ service mapping) +
 *      `TeamMember.schedule` (7-day working windows, the same
 *      `WeeklySchedule` the Staff Management module edits) +
 *      `TeamMember.status` (`Inactive` / `On Leave` staff don't count).
 *      The constraint only applies when the mapping actually exists for
 *      the selection; salons that never configured staff-service
 *      assignments keep salon-hours-only availability (nothing invented).
 *
 * This module sits ABOVE `siteBookingFlow` and `siteBookingPayment` so the
 * two lower layers stay dependency-free of each other (no import cycle).
 */
import type { SalonData, Service, TeamMember, SalonOpeningHours } from '../types';
import { parseClockToMinutes } from './salonStatus';
import { readPaymentRecordsForBusiness, PAYMENT_EVENT } from './siteBookingPayment';
import type { BookingBlockedSpan, BookingSlotExtras, BookingStaffWindow } from './siteBookingFlow';

/** Event other surfaces can listen to when availability inputs change. */
export const BOOKING_AVAILABILITY_EVENTS = [PAYMENT_EVENT] as const;

/** Booking statuses that occupy a real span on the calendar. */
const BLOCKING_STATUSES = new Set(['confirmed', 'pay_at_salon', 'pending_payment']);

/**
 * Shared Phase 16 availability predicate. Calendar/schedule readers reuse
 * this instead of inventing a second interpretation of booking statuses.
 */
export function bookingStatusBlocksAvailability(status: string): boolean {
  return BLOCKING_STATUSES.has(status);
}

/**
 * Spans taken by REAL booking records for this salon + theme.
 * `excludeBookingId` lets a resumed booking not block itself.
 */
export function bookedSpansForSalon(
  businessId: string,
  themeId: string,
  excludeBookingId?: string | null,
): BookingBlockedSpan[] {
  return readPaymentRecordsForBusiness(businessId, themeId)
    .filter((record) => bookingStatusBlocksAvailability(record.bookingStatus))
    .filter((record) => !excludeBookingId || record.bookingId !== excludeBookingId)
    .map((record) => ({
      dateKey: record.dateKey,
      startMinutes: record.startMinutes,
      endMinutes: record.endMinutes,
    }));
}

/** Staff who can take NEW bookings (existing status field; nothing invented). */
function bookableStaff(team: readonly TeamMember[] | undefined): TeamMember[] {
  return (team || []).filter(
    (member) => member.status !== 'Inactive' && member.status !== 'On Leave',
  );
}

/**
 * Working window (minutes from midnight) of one staff member on a weekday,
 * from the EXISTING `WeeklySchedule`. Null when not working / no schedule.
 */
export function staffWindowOn(
  member: TeamMember,
  weekday: keyof SalonOpeningHours,
): BookingStaffWindow | null {
  const day = member.schedule?.[weekday];
  if (!day || !day.working) return null;
  const start = parseClockToMinutes(day.startTime);
  const end = parseClockToMinutes(day.endTime);
  if (start == null || end == null || end <= start) return null;
  return { startMinutes: start, endMinutes: end };
}

/**
 * Staff working windows for the SELECTED services on a weekday.
 *
 *   - Returns `null` (no constraint) when the staff ↔ service mapping does
 *     not cover the selection — i.e. some selected service has no assigned
 *     bookable staff at all. Salon hours alone then govern, exactly as
 *     before 16.3 (we never invent a staff restriction).
 *   - Otherwise returns the windows of staff qualified for the WHOLE
 *     sitting (assigned to every selected service) on that weekday. An
 *     empty array means genuinely nobody can take the sitting that day.
 */
export function staffWindowsForSelection(
  data: Pick<SalonData, 'team'>,
  selectedServices: readonly Pick<Service, 'id'>[],
  weekday: keyof SalonOpeningHours,
): BookingStaffWindow[] | null {
  if (selectedServices.length === 0) return null;
  const staff = bookableStaff(data.team);
  if (staff.length === 0) return null;

  // The mapping must exist for EVERY selected service, else no constraint.
  const everyServiceMapped = selectedServices.every((service) =>
    staff.some((member) => member.assignedServiceIds?.includes(service.id)),
  );
  if (!everyServiceMapped) return null;

  // Qualified = can perform the whole sitting (multi-staff split sittings
  // and explicit staff selection are later-phase work).
  const qualified = staff.filter((member) =>
    selectedServices.every((service) => member.assignedServiceIds?.includes(service.id)),
  );

  const windows: BookingStaffWindow[] = [];
  for (const member of qualified) {
    const win = staffWindowOn(member, weekday);
    if (win) windows.push(win);
  }
  return windows;
}

/**
 * Complete availability context for one salon + theme + selection.
 * Everything derives from existing relationships; all inputs optional
 * downstream (pre-16.3 call sites keep their exact behaviour).
 */
export function bookingAvailabilityExtras(
  data: Pick<SalonData, 'team'>,
  businessId: string,
  themeId: string,
  selectedServices: readonly Pick<Service, 'id'>[],
  weekday: keyof SalonOpeningHours | null,
  excludeBookingId?: string | null,
): BookingSlotExtras {
  return {
    businessId,
    blockedSpans: bookedSpansForSalon(businessId, themeId, excludeBookingId),
    staffWindows: weekday ? staffWindowsForSelection(data, selectedServices, weekday) : null,
  };
}
