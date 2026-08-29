/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Appointment } from './PaymentsPanel';

export interface AppointmentTotals {
  /** Sum of service value for bookings that are Confirmed or Completed. */
  totalBookingsValue: number;
  /** Advance already collected online on those same bookings. */
  totalAdvanceCollected: number;
  /** Balance still due at the salon. */
  totalRemainingAtSalon: number;
}

/**
 * Revenue roll-up for the owner dashboard.
 *
 * Lifted out of `Landing.tsx` verbatim so the overview and payments tabs
 * derive identical figures instead of each keeping a private copy.
 * Cancelled and Pending bookings are excluded from every total.
 */
export function appointmentTotals(appointments: Appointment[]): AppointmentTotals {
  const counted = appointments.filter(
    (a) => a.status === 'Confirmed' || a.status === 'Completed',
  );
  const totalBookingsValue = counted.reduce((sum, a) => sum + a.price, 0);
  const totalAdvanceCollected = counted.reduce((sum, a) => sum + a.depositPaid, 0);
  return {
    totalBookingsValue,
    totalAdvanceCollected,
    totalRemainingAtSalon: totalBookingsValue - totalAdvanceCollected,
  };
}
