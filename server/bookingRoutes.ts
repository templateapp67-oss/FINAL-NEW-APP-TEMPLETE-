import { createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin, requireAuthenticatedUser } from './supabaseAdmin';
import { handleGuestWebsiteBooking, isGuestWebsiteBooking } from './websiteBookingRoutes';
import { geocodeAddressServer } from './geocoding';

const createBookingSchema = z.object({
  salonId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1).max(20),
  staffId: z.string().uuid().nullable().optional(),
  appointmentStart: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  /**
   * HOME SERVICE — optional + additive. The browser only says WHERE it wants
   * service; the address is re-geocoded HERE and the distance/charge/radius
   * decision is recomputed by the M65 database function. Client-supplied
   * coordinates, distances or charges are deliberately not accepted.
   */
  fulfillmentMode: z.enum(['at_salon', 'home_service']).optional(),
  serviceAddress: z.string().trim().min(10).max(400).optional(),
}).strict().superRefine((value, context) => {
  if (new Set(value.serviceIds).size !== value.serviceIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['serviceIds'], message: 'Duplicate services are not allowed.' });
  }
  if (value.fulfillmentMode === 'home_service' && !value.serviceAddress) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceAddress'],
      message: 'A complete service address is required for home service.',
    });
  }
  if ((value.fulfillmentMode ?? 'at_salon') === 'at_salon' && value.serviceAddress) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceAddress'],
      message: 'A service address applies only to home service bookings.',
    });
  }
});

function sendError(response: Response, status: number, message: string) {
  response.status(status).json({ error: message });
}

interface DatabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

function databaseError(error: unknown): DatabaseErrorLike {
  return error && typeof error === 'object' ? error as DatabaseErrorLike : {};
}

function logDatabaseFailure(operation: string, error: unknown): void {
  const dbError = databaseError(error);
  console.error('Booking API database operation failed', {
    operation,
    source: 'supabase',
    code: dbError.code || null,
    message: dbError.message || (error instanceof Error ? error.message : 'Unknown database error'),
    details: dbError.details || null,
    hint: dbError.hint || null,
  });
}

const SALON_TIME_ZONE = 'Asia/Kolkata';

function salonDateTime(value: unknown): { dateKey: string; minutes: number } {
  const date = typeof value === 'string' ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new Error('The database returned an invalid booking timestamp.');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value || '';
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const hour = Number(part('hour'));
  const minute = Number(part('minute'));
  if (!year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error('The database returned an invalid booking timestamp.');
  }
  return { dateKey: `${year}-${month}-${day}`, minutes: hour * 60 + minute };
}

export function registerBookingRoutes(app: Express): void {
  /** Create a real authenticated customer booking in Supabase. */
  app.post('/api/bookings', async (request: Request, response: Response) => {
    if (isGuestWebsiteBooking(request.body)) {
      return handleGuestWebsiteBooking(request, response);
    }
    try {
      const user = await requireAuthenticatedUser(request);
      const parsed = createBookingSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, parsed.error.issues[0]?.message || 'Invalid booking request.');
        return;
      }

      const input = parsed.data;
      const fulfillmentMode = input.fulfillmentMode ?? 'at_salon';

      // HOME SERVICE — the server geocodes the customer address itself via
      // the existing OpenStreetMap/Nominatim proxy path. The database then
      // recomputes distance + charge from canonical salon coordinates and
      // the owner's published settings; nothing priced client-side survives.
      let serviceCoordinates: { latitude: number; longitude: number } | null = null;
      if (fulfillmentMode === 'home_service') {
        serviceCoordinates = await geocodeAddressServer(input.serviceAddress || '');
        if (!serviceCoordinates) {
          sendError(response, 400, 'We could not verify that address. Please enter a complete address.');
          return;
        }
      }

      const normalized = JSON.stringify({
        salonId: input.salonId,
        serviceIds: [...input.serviceIds].sort(),
        staffId: input.staffId || null,
        appointmentStart: new Date(input.appointmentStart).toISOString(),
        // Fulfillment participates in the fingerprint so one idempotency key
        // can never silently switch a booking between modes or addresses.
        fulfillmentMode,
        serviceAddress: fulfillmentMode === 'home_service' ? (input.serviceAddress || '').trim() : null,
      });
      const fingerprint = createHash('sha256').update(normalized).digest('hex');
      const { data, error } = await getSupabaseAdmin().rpc('create_authoritative_customer_booking_v2', {
        p_customer_id: user.id,
        p_salon_id: input.salonId,
        p_service_ids: input.serviceIds,
        p_staff_id: input.staffId || null,
        p_appointment_start: input.appointmentStart,
        p_idempotency_key: input.idempotencyKey,
        p_request_fingerprint: fingerprint,
        p_fulfillment_mode: fulfillmentMode,
        p_service_address: fulfillmentMode === 'home_service' ? (input.serviceAddress || '').trim() : null,
        p_service_latitude: serviceCoordinates?.latitude ?? null,
        p_service_longitude: serviceCoordinates?.longitude ?? null,
      });
      if (error) {
        console.error('Authoritative booking creation failed:', { code: error.code, message: error.message });
        if (error.code === '23P01') sendError(response, 409, 'The selected time is no longer available.');
        else if (error.code === '23505') sendError(response, 409, 'This booking request conflicts with an earlier request.');
        else if (error.code === 'P0002') sendError(response, 404, 'The salon, service, or staff selection is unavailable.');
        else if (error.code === '22023' || error.code === '23514') sendError(response, 400, error.message);
        else sendError(response, 500, 'Unable to create the booking.');
        return;
      }

      const booking = Array.isArray(data) ? data[0] : data;
      if (!booking?.booking_id) {
        sendError(response, 500, 'Booking persistence returned no booking.');
        return;
      }

      const totalPaise = Number(booking.total_amount_paise || (Number(booking.amount_paise) * 4));
      const advancePaise = Number(booking.advance_amount_paise || booking.amount_paise);
      const remainingPaise = Number(booking.remaining_amount_paise ?? (totalPaise - advancePaise));

      response.status(201).json({
        bookingId: booking.booking_id,
        amount: advancePaise, // 25% advance amount to charge via Razorpay
        totalAmountPaise: totalPaise,
        advanceAmountPaise: advancePaise,
        remainingAmountPaise: remainingPaise,
        totalAmount: Math.round(totalPaise / 100),
        advanceAmount: Math.round(advancePaise / 100),
        remainingAmount: Math.round(remainingPaise / 100),
        currency: booking.currency || 'INR',
        appointmentEnd: booking.appointment_end,
        // HOME SERVICE — server-verified fulfillment facts (never the client's).
        fulfillmentMode: booking.fulfillment_mode || 'at_salon',
        serviceAddress: booking.service_address || null,
        serviceDistanceKm: booking.service_distance_km != null ? Number(booking.service_distance_km) : null,
        homeServiceChargePaise: Number(booking.home_service_charge_paise || 0),
      });
    } catch (error) {
      const status = error instanceof Error && /bearer|session|authenticat/i.test(error.message) ? 401 : 500;
      sendError(response, status, status === 401 ? 'Authentication required.' : 'Unable to create the booking.');
    }
  });

  /** Get Customer My Bookings. Strictly customer-scoped via Supabase Auth. */
  app.get('/api/customer/bookings', async (request: Request, response: Response) => {
    try {
      const user = await requireAuthenticatedUser(request);
      const { data, error } = await getSupabaseAdmin().rpc('get_customer_bookings_for_actor', {
        p_actor_user_id: user.id,
      });
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const bookings = rows.map((row: any) => {
        const totalPaise = Number(row.total_amount_paise || 0);
        const advancePaise = Number(row.advance_amount_paise || 0);
        const remainingPaise = Number(row.remaining_amount_paise ?? Math.max(0, totalPaise - advancePaise));

        const start = salonDateTime(row.appointment_start);
        const end = row.appointment_end ? salonDateTime(row.appointment_end) : null;

        return {
          id: row.booking_id,
          bookingId: row.booking_id,
          salonId: row.salon_id,
          businessName: typeof row.business_name === 'string' ? row.business_name : null,
          businessSlug: typeof row.business_slug === 'string' ? row.business_slug : null,
          serviceNames: Array.isArray(row.service_names) ? row.service_names : [],
          appointmentStart: row.appointment_start,
          appointmentEnd: row.appointment_end,
          dateKey: start.dateKey,
          startMinutes: start.minutes,
          endMinutes: end?.minutes ?? null,
          totalAmount: Math.round(totalPaise / 100),
          advanceAmount: Math.round(advancePaise / 100),
          remainingAmount: Math.round(remainingPaise / 100),
          totalAmountPaise: totalPaise,
          advanceAmountPaise: advancePaise,
          remainingAmountPaise: remainingPaise,
          status: row.status,
          paymentStatus: row.payment_status,
          currency: row.currency,
          createdAt: row.created_at,
          fulfillmentMode: row.fulfillment_mode || 'at_salon',
          serviceAddress: typeof row.service_address === 'string' ? row.service_address : null,
          serviceDistanceKm: row.service_distance_km != null ? Number(row.service_distance_km) : null,
          homeServiceChargePaise: Number(row.home_service_charge_paise || 0),
        };
      });

      response.json({ bookings });
    } catch (error) {
      const dbError = databaseError(error);
      const message = dbError.message || (error instanceof Error ? error.message : '');
      const status = /bearer|session|authenticat/i.test(message) ? 401 : dbError.code === '42501' ? 403 : 500;
      if (status === 500) logDatabaseFailure('get_customer_bookings_for_actor', error);
      sendError(response, status, status === 401
        ? 'Authentication required.'
        : status === 403 ? 'Permission denied.' : 'Unable to load your bookings.');
    }
  });

  /** Customer Cancel Booking. Can only cancel their own pending/confirmed booking. */
  app.post('/api/customer/bookings/:id/cancel', async (request: Request, response: Response) => {
    try {
      const user = await requireAuthenticatedUser(request);
      const bookingId = request.params.id;
      if (!bookingId) {
        return sendError(response, 400, 'Booking ID is required.');
      }

      // Keep authorization and mutation in one database transaction. The
      // service-role client may bypass RLS, so the authenticated actor UUID is
      // mandatory at the RPC boundary (M55); a read-then-write API check would
      // leave a TOCTOU gap and would not constrain a privileged function call.
      const { error: cancelError } = await getSupabaseAdmin().rpc('cancel_customer_booking_for_actor', {
        p_actor_user_id: user.id,
        p_booking_id: bookingId,
      });

      if (cancelError) {
        if (cancelError.code === '42501') return sendError(response, 403, 'You can only cancel your own bookings.');
        if (cancelError.code === 'P0002') return sendError(response, 404, 'Booking not found.');
        if (cancelError.code === '22023') return sendError(response, 400, cancelError.message);
        throw cancelError;
      }
      response.json({ success: true, bookingId });
    } catch (error) {
      const dbError = databaseError(error);
      const message = dbError.message || (error instanceof Error ? error.message : '');
      const status = /bearer|session|authenticat/i.test(message) ? 401 : dbError.code === '42501' ? 403 : 500;
      if (status === 500) logDatabaseFailure('cancel_customer_booking_for_actor', error);
      sendError(response, status, status === 401
        ? 'Authentication required.'
        : status === 403 ? 'You can only cancel your own bookings.' : 'Unable to cancel the booking.');
    }
  });

  /**
   * M61 — atomic customer/owner reschedule. The slot swap (release old,
   * acquire new, keep payments) happens inside one SECURITY DEFINER RPC; the
   * route only carries the session-derived actor and the target window.
   */
  app.post('/api/customer/bookings/:id/reschedule', async (request: Request, response: Response) => {
    try {
      const user = await requireAuthenticatedUser(request);
      const bookingId = request.params.id;
      const rawStart = String(request.body?.appointmentStart || '').trim();
      const appointmentStart = new Date(rawStart);
      if (!bookingId || !rawStart || Number.isNaN(appointmentStart.getTime())) {
        return sendError(response, 400, 'A booking id and a valid new appointment start are required.');
      }

      const { data, error } = await getSupabaseAdmin().rpc('reschedule_customer_booking_for_actor', {
        p_actor_user_id: user.id,
        p_booking_id: bookingId,
        p_new_appointment_start: appointmentStart.toISOString(),
      });

      if (error) {
        if (error.code === '42501') return sendError(response, 403, 'You can only reschedule your own bookings.');
        if (error.code === 'P0002') return sendError(response, 404, 'Booking not found.');
        if (error.code === '23P01') return sendError(response, 409, 'The selected time is no longer available.');
        if (error.code === '22023') return sendError(response, 400, error.message);
        throw error;
      }

      const row = Array.isArray(data) ? data[0] : data;
      response.json({
        success: true,
        bookingId,
        oldAppointmentStart: row?.old_appointment_start ?? null,
        newAppointmentStart: row?.new_appointment_start ?? appointmentStart.toISOString(),
        newAppointmentEnd: row?.new_appointment_end ?? null,
        status: row?.status ?? null,
        paymentStatus: row?.payment_status ?? null,
      });
    } catch (error) {
      const dbError = databaseError(error);
      const message = dbError.message || (error instanceof Error ? error.message : '');
      const status = /bearer|session|authenticat/i.test(message) ? 401
        : dbError.code === '42501' ? 403
          : dbError.code === 'P0002' ? 404
            : dbError.code === '23P01' ? 409 : 500;
      if (status === 500) logDatabaseFailure('reschedule_customer_booking_for_actor', error);
      sendError(response, status, status === 401
        ? 'Authentication required.'
        : status === 403 ? 'You can only reschedule your own bookings.'
          : status === 404 ? 'Booking not found.'
            : status === 409 ? 'The selected time is no longer available.'
              : 'Unable to reschedule the booking.');
    }
  });

  /** Owner Bookings List. Shows bookings belonging ONLY to the owner's salon. */
  app.get('/api/owner/bookings', async (request: Request, response: Response) => {
    try {
      const user = await requireAuthenticatedUser(request);
      const rawSalonId = request.query.salonId ? String(request.query.salonId) : null;
      const salonId = rawSalonId ? z.string().uuid().safeParse(rawSalonId) : null;
      if (salonId && !salonId.success) {
        return sendError(response, 400, 'A valid salonId is required.');
      }

      const { data, error } = await getSupabaseAdmin().rpc('get_owner_salon_bookings_for_actor', {
        p_actor_user_id: user.id,
        p_salon_id: salonId?.success ? salonId.data : null,
      });
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const bookings = rows.map((row: any) => {
        const totalPaise = Number(row.total_amount_paise || 0);
        const advancePaise = Number(row.advance_amount_paise || 0);
        const remainingPaise = Number(row.remaining_amount_paise ?? Math.max(0, totalPaise - advancePaise));

        const start = salonDateTime(row.appointment_start);
        const end = row.appointment_end ? salonDateTime(row.appointment_end) : null;

        return {
          id: row.booking_id,
          bookingId: row.booking_id,
          salonId: row.salon_id,
          businessName: typeof row.business_name === 'string' ? row.business_name : null,
          themeId: typeof row.theme_key === 'string' ? row.theme_key : null,
          customerId: row.customer_id,
          customerName: typeof row.customer_name === 'string' ? row.customer_name : null,
          customerEmail: typeof row.customer_email === 'string' ? row.customer_email : null,
          customerPhone: typeof row.customer_phone === 'string' ? row.customer_phone : null,
          serviceNames: Array.isArray(row.service_names) ? row.service_names : [],
          serviceLines: Array.isArray(row.service_lines) ? row.service_lines : [],
          staffId: typeof row.staff_id === 'string' ? row.staff_id : null,
          staffName: typeof row.staff_name === 'string' ? row.staff_name : null,
          appointmentStart: row.appointment_start,
          appointmentEnd: row.appointment_end,
          dateKey: start.dateKey,
          startMinutes: start.minutes,
          endMinutes: end?.minutes ?? null,
          totalAmount: Math.round(totalPaise / 100),
          advanceAmount: Math.round(advancePaise / 100),
          remainingAmount: Math.round(remainingPaise / 100),
          totalAmountPaise: totalPaise,
          advanceAmountPaise: advancePaise,
          remainingAmountPaise: remainingPaise,
          status: row.status,
          paymentStatus: row.payment_status,
          currency: row.currency,
          createdAt: row.created_at,
          fulfillmentMode: row.fulfillment_mode || 'at_salon',
          serviceAddress: typeof row.service_address === 'string' ? row.service_address : null,
          serviceDistanceKm: row.service_distance_km != null ? Number(row.service_distance_km) : null,
          homeServiceChargePaise: Number(row.home_service_charge_paise || 0),
        };
      });

      response.json({ bookings, ownerId: user.id });
    } catch (error) {
      const dbError = databaseError(error);
      const message = dbError.message || (error instanceof Error ? error.message : '');
      const status = /bearer|session|authenticat/i.test(message) || dbError.code === '28000'
        ? 401
        : dbError.code === '42501' ? 403 : dbError.code === 'P0003' ? 409 : 500;
      if (status === 500) logDatabaseFailure('get_owner_salon_bookings_for_actor', error);
      sendError(response, status,
        status === 401 ? 'Authentication required.'
          : status === 403 ? 'Permission denied for this salon.'
            : status === 409 ? 'Multiple salons are linked to this account. Select one first.'
              : 'Unable to load owner bookings.');
    }
  });

  /** Owner Update Booking Status. */
  app.post('/api/owner/bookings/:id/status', async (request: Request, response: Response) => {
    try {
      const user = await requireAuthenticatedUser(request);
      const parsed = z.object({
        bookingId: z.string().uuid(),
        status: z.enum(['confirmed', 'completed', 'cancelled']),
      }).safeParse({
        bookingId: request.params.id,
        status: String(request.body?.status || '').trim().toLowerCase(),
      });

      if (!parsed.success) {
        return sendError(response, 400, parsed.error.issues[0]?.message || 'A valid booking ID and status are required.');
      }
      const { bookingId, status: nextStatus } = parsed.data;

      const { data, error } = await getSupabaseAdmin().rpc('update_owner_booking_status_for_actor', {
        p_actor_user_id: user.id,
        p_booking_id: bookingId,
        p_next_status: nextStatus,
      });

      if (error) {
        if (error.code === '42501') return sendError(response, 403, 'Permission denied for this salon booking.');
        if (error.code === 'P0002') return sendError(response, 404, 'Booking not found.');
        return sendError(response, 400, error.message || 'Unable to update booking status.');
      }

      response.json({ success: true, bookingId, status: nextStatus });
    } catch (error) {
      const dbError = databaseError(error);
      const message = dbError.message || (error instanceof Error ? error.message : '');
      const status = /bearer|session|authenticat/i.test(message) || dbError.code === '28000'
        ? 401 : dbError.code === '42501' ? 403 : dbError.code === 'P0002' ? 404 : 500;
      if (status === 500) logDatabaseFailure('update_owner_booking_status_for_actor', error);
      sendError(response, status,
        status === 401 ? 'Authentication required.'
          : status === 403 ? 'Permission denied for this salon booking.'
            : status === 404 ? 'Booking not found.' : 'Unable to update booking status.');
    }
  });
}
