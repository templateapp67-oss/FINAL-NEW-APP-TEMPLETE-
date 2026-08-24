import { createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin, requireAuthenticatedUser } from './supabaseAdmin';
import { handleGuestWebsiteBooking, isGuestWebsiteBooking } from './websiteBookingRoutes';

const createBookingSchema = z.object({
  salonId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1).max(20),
  staffId: z.string().uuid().nullable().optional(),
  appointmentStart: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict().superRefine((value, context) => {
  if (new Set(value.serviceIds).size !== value.serviceIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['serviceIds'], message: 'Duplicate services are not allowed.' });
  }
});

function sendError(response: Response, status: number, message: string) {
  response.status(status).json({ error: message });
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
      const normalized = JSON.stringify({
        salonId: input.salonId,
        serviceIds: [...input.serviceIds].sort(),
        staffId: input.staffId || null,
        appointmentStart: new Date(input.appointmentStart).toISOString(),
      });
      const fingerprint = createHash('sha256').update(normalized).digest('hex');
      const { data, error } = await getSupabaseAdmin().rpc('create_authoritative_customer_booking', {
        p_customer_id: user.id,
        p_salon_id: input.salonId,
        p_service_ids: input.serviceIds,
        p_staff_id: input.staffId || null,
        p_appointment_start: input.appointmentStart,
        p_idempotency_key: input.idempotencyKey,
        p_request_fingerprint: fingerprint,
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
      const { data, error } = await getSupabaseAdmin().rpc('get_customer_bookings', {
        p_user_id: user.id,
      });
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const bookings = rows.map((row: any) => {
        const totalPaise = Number(row.total_amount_paise || 0);
        const advancePaise = Number(row.advance_amount_paise || 0);
        const remainingPaise = Number(row.remaining_amount_paise ?? Math.max(0, totalPaise - advancePaise));

        const startDate = row.appointment_start ? new Date(row.appointment_start) : new Date();
        const endDate = row.appointment_end ? new Date(row.appointment_end) : new Date(startDate.getTime() + 30 * 60000);

        return {
          id: row.booking_id,
          bookingId: row.booking_id,
          salonId: row.salon_id,
          businessName: row.business_name || 'Salon',
          businessSlug: row.business_slug || '',
          serviceNames: Array.isArray(row.service_names) ? row.service_names : [],
          appointmentStart: row.appointment_start,
          appointmentEnd: row.appointment_end,
          dateKey: startDate.toISOString().slice(0, 10),
          totalAmount: Math.round(totalPaise / 100),
          advanceAmount: Math.round(advancePaise / 100),
          remainingAmount: Math.round(remainingPaise / 100),
          totalAmountPaise: totalPaise,
          advanceAmountPaise: advancePaise,
          remainingAmountPaise: remainingPaise,
          status: row.status || 'pending',
          paymentStatus: row.payment_status || 'pending',
          currency: row.currency || 'INR',
          createdAt: row.created_at,
        };
      });

      response.json({ bookings });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = /bearer|session|authenticat/i.test(message) ? 401 : 500;
      sendError(response, status, status === 401 ? 'Authentication required.' : 'Unable to load your bookings.');
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

      const { data: booking, error: findError } = await getSupabaseAdmin()
        .from('bookings')
        .select('id,customer_id,status,payment_status')
        .eq('id', bookingId)
        .maybeSingle();

      if (findError || !booking) {
        return sendError(response, 404, 'Booking not found.');
      }

      if (booking.customer_id !== user.id) {
        return sendError(response, 403, 'You can only cancel your own bookings.');
      }

      if (booking.status !== 'pending' && booking.status !== 'confirmed') {
        return sendError(response, 400, 'This booking cannot be cancelled.');
      }

      const { error: cancelError } = await getSupabaseAdmin().rpc('cancel_customer_booking', {
        p_booking_id: bookingId,
      });

      if (cancelError) throw cancelError;
      response.json({ success: true, bookingId });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = /bearer|session|authenticat/i.test(message) ? 401 : /403|denied|only cancel/i.test(message) ? 403 : 500;
      sendError(response, status, message || 'Unable to cancel the booking.');
    }
  });

  /** Owner Bookings List. Shows bookings belonging ONLY to the owner's salon. */
  app.get('/api/owner/bookings', async (request: Request, response: Response) => {
    try {
      const user = await requireAuthenticatedUser(request);
      const salonId = request.query.salonId ? String(request.query.salonId) : null;

      const { data, error } = await getSupabaseAdmin().rpc('get_owner_salon_bookings', {
        p_salon_id: salonId,
      });
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const bookings = rows.map((row: any) => {
        const totalPaise = Number(row.total_amount_paise || 0);
        const advancePaise = Number(row.advance_amount_paise || 0);
        const remainingPaise = Number(row.remaining_amount_paise ?? Math.max(0, totalPaise - advancePaise));

        const startDate = row.appointment_start ? new Date(row.appointment_start) : new Date();

        return {
          id: row.booking_id,
          bookingId: row.booking_id,
          salonId: row.salon_id,
          businessName: row.business_name || 'My Salon',
          customerId: row.customer_id,
          customerName: row.customer_name || 'Customer',
          customerEmail: row.customer_email || '',
          customerPhone: row.customer_phone || '',
          serviceNames: Array.isArray(row.service_names) ? row.service_names : [],
          appointmentStart: row.appointment_start,
          appointmentEnd: row.appointment_end,
          dateKey: startDate.toISOString().slice(0, 10),
          totalAmount: Math.round(totalPaise / 100),
          advanceAmount: Math.round(advancePaise / 100),
          remainingAmount: Math.round(remainingPaise / 100),
          totalAmountPaise: totalPaise,
          advanceAmountPaise: advancePaise,
          remainingAmountPaise: remainingPaise,
          status: row.status || 'pending',
          paymentStatus: row.payment_status || 'pending',
          currency: row.currency || 'INR',
          createdAt: row.created_at,
        };
      });

      response.json({ bookings, ownerId: user.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = /bearer|session|authenticat/i.test(message) ? 401 : 500;
      sendError(response, status, status === 401 ? 'Authentication required.' : 'Unable to load owner bookings.');
    }
  });

  /** Owner Update Booking Status. */
  app.post('/api/owner/bookings/:id/status', async (request: Request, response: Response) => {
    try {
      const user = await requireAuthenticatedUser(request);
      const bookingId = request.params.id;
      const nextStatus = String(request.body?.status || '').trim().toLowerCase();

      if (!bookingId || !nextStatus) {
        return sendError(response, 400, 'Booking ID and status are required.');
      }

      const { data, error } = await getSupabaseAdmin().rpc('update_owner_booking_status', {
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
      const message = error instanceof Error ? error.message : '';
      const status = /bearer|session|authenticat/i.test(message) ? 401 : 500;
      sendError(response, status, message || 'Unable to update booking status.');
    }
  });
}
