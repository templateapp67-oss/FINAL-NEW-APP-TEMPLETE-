import type { BookingStatus, PaymentStatus } from './siteBookingPayment';

/** Explicit boundary from canonical database vocabulary to dashboard vocabulary. */
export function canonicalBookingStatus(value: string): BookingStatus {
  switch (value) {
    case 'pending': return 'pending_payment';
    case 'confirmed': return 'confirmed';
    case 'completed': return 'completed';
    case 'cancelled': return 'cancelled';
    case 'no_show': return 'no_show';
    default: throw new Error(`Canonical booking response has unsupported booking status: ${value || 'missing'}.`);
  }
}

/**
 * A canonical partially-paid row means its required advance was collected;
 * the remaining balance is carried separately, matching the existing UI model.
 */
export function canonicalPaymentStatus(value: string): PaymentStatus {
  switch (value) {
    case 'partially_paid': return 'paid';
    case 'unpaid':
    case 'pending':
    case 'paid':
    case 'failed':
    case 'cancelled':
    case 'refunded':
      return value;
    default:
      throw new Error(`Canonical booking response has unsupported payment status: ${value || 'missing'}.`);
  }
}
