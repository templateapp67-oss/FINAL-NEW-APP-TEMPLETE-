import { authenticatedApiFetch } from './apiFetch';
import { startRazorpayCheckout } from './razorpayCheckout';

export interface AuthoritativeBookingInput {
  salonId: string;
  serviceIds: string[];
  staffId?: string | null;
  appointmentStart: string;
  idempotencyKey: string;
  /**
   * HOME SERVICE — optional + additive. Only the mode and the raw address
   * travel to the server; coordinates, distance and charge are recomputed
   * authoritatively there (browser values are never trusted).
   */
  fulfillmentMode?: 'at_salon' | 'home_service';
  serviceAddress?: string;
}

export interface AuthoritativeBooking {
  bookingId: string;
  amount: number;
  totalAmount?: number;
  advanceAmount?: number;
  remainingAmount?: number;
  totalAmountPaise?: number;
  advanceAmountPaise?: number;
  remainingAmountPaise?: number;
  currency: 'INR';
  appointmentEnd: string;
  /** HOME SERVICE — server-verified fulfillment facts echoed back. */
  fulfillmentMode?: 'at_salon' | 'home_service';
  serviceAddress?: string | null;
  serviceDistanceKm?: number | null;
  homeServiceChargePaise?: number;
}

export interface CustomerBookingItem {
  id: string;
  bookingId: string;
  salonId: string;
  businessName: string | null;
  businessSlug: string | null;
  serviceNames: string[];
  appointmentStart: string;
  appointmentEnd: string | null;
  dateKey: string;
  startMinutes: number;
  endMinutes: number | null;
  totalAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  totalAmountPaise: number;
  advanceAmountPaise: number;
  remainingAmountPaise: number;
  status: string;
  paymentStatus: string;
  currency: string;
  createdAt: string;
  /** HOME SERVICE — fulfillment snapshot (server-verified). */
  fulfillmentMode?: 'at_salon' | 'home_service';
  serviceAddress?: string | null;
  serviceDistanceKm?: number | null;
  homeServiceChargePaise?: number;
}

export interface OwnerBookingServiceLine {
  serviceId: string;
  serviceName: string;
  pricePaise: number;
  durationMinutes: number;
  quantity: number;
}

export interface OwnerBookingItem {
  id: string;
  bookingId: string;
  salonId: string;
  businessName: string | null;
  themeId: string | null;
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  serviceNames: string[];
  serviceLines: OwnerBookingServiceLine[];
  staffId: string | null;
  staffName: string | null;
  appointmentStart: string;
  appointmentEnd: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number | null;
  totalAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  totalAmountPaise: number;
  advanceAmountPaise: number;
  remainingAmountPaise: number;
  status: string;
  paymentStatus: string;
  currency: string;
  createdAt: string;
  /** HOME SERVICE — fulfillment snapshot (server-verified). */
  fulfillmentMode?: 'at_salon' | 'home_service';
  serviceAddress?: string | null;
  serviceDistanceKm?: number | null;
  homeServiceChargePaise?: number;
}

/** Persist a server-priced booking with authoritative 25% advance calculation before payment UI. */
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
    totalAmount: body.totalAmount,
    advanceAmount: body.advanceAmount,
    remainingAmount: body.remainingAmount,
    totalAmountPaise: body.totalAmountPaise,
    advanceAmountPaise: body.advanceAmountPaise,
    remainingAmountPaise: body.remainingAmountPaise,
    currency: body.currency === 'INR' ? 'INR' : 'INR',
    appointmentEnd: body.appointmentEnd,
    fulfillmentMode: body.fulfillmentMode === 'home_service' ? 'home_service' : 'at_salon',
    serviceAddress: body.serviceAddress ?? null,
    serviceDistanceKm: body.serviceDistanceKm ?? null,
    homeServiceChargePaise: body.homeServiceChargePaise ?? 0,
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

/** Fetch customer's own bookings from the server. */
export async function fetchCustomerBookings(): Promise<CustomerBookingItem[]> {
  const response = await authenticatedApiFetch('/api/customer/bookings');
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error((errorBody as { error?: string }).error || 'Failed to load your bookings.');
  }
  const data = await response.json() as { bookings: CustomerBookingItem[] };
  return data.bookings || [];
}

/** Cancel a customer's own booking. */
export async function cancelCustomerBooking(bookingId: string): Promise<boolean> {
  const response = await authenticatedApiFetch(`/api/customer/bookings/${bookingId}/cancel`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error((errorBody as { error?: string }).error || 'Failed to cancel the booking.');
  }
  return true;
}

/** Fetch owner bookings for a specific salon. */
export async function fetchOwnerBookings(salonId?: string): Promise<OwnerBookingItem[]> {
  const url = salonId ? `/api/owner/bookings?salonId=${encodeURIComponent(salonId)}` : '/api/owner/bookings';
  const response = await authenticatedApiFetch(url);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error((errorBody as { error?: string }).error || 'Failed to load salon bookings.');
  }
  const data = await response.json() as { bookings: OwnerBookingItem[] };
  return data.bookings || [];
}

/** Update a booking status from owner dashboard. */
export async function updateOwnerBookingStatus(bookingId: string, status: string): Promise<boolean> {
  const response = await authenticatedApiFetch(`/api/owner/bookings/${bookingId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error((errorBody as { error?: string }).error || 'Failed to update booking status.');
  }
  return true;
}
