import { authenticatedApiFetch } from './apiFetch';
import { startRazorpayCheckout } from './razorpayCheckout';

export interface AuthoritativeBookingInput {
  salonId: string;
  serviceIds: string[];
  staffId?: string | null;
  appointmentStart: string;
  idempotencyKey: string;
}

export interface AuthoritativeBooking {
  bookingId: string;
  amount: number;
  currency: 'INR';
  appointmentEnd: string;
}

/** Persist a server-priced booking before any payment UI is opened. */
export async function createAuthoritativeBooking(input: AuthoritativeBookingInput): Promise<AuthoritativeBooking> {
  const response = await authenticatedApiFetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json() as Partial<AuthoritativeBooking> & { error?: string };
  if (!response.ok || !body.bookingId || typeof body.amount !== 'number' || !body.appointmentEnd) {
    throw new Error(body.error || 'Unable to create the booking.');
  }
  return {
    bookingId: body.bookingId,
    amount: body.amount,
    currency: body.currency === 'INR' ? 'INR' : 'INR',
    appointmentEnd: body.appointmentEnd,
  };
}

/**
 * Full production path: authoritative DB booking -> provider order -> checkout
 * -> server signature verification. No local success state is accepted.
 */
export async function createBookingAndPay(
  bookingInput: AuthoritativeBookingInput,
  customer?: { name?: string; email?: string; phone?: string },
): Promise<AuthoritativeBooking & { paymentId: string }> {
  const booking = await createAuthoritativeBooking(bookingInput);
  const payment = await startRazorpayCheckout({
    bookingId: booking.bookingId,
    customerName: customer?.name,
    customerEmail: customer?.email,
    customerPhone: customer?.phone,
  });
  return { ...booking, paymentId: payment.paymentId };
}
