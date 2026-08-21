import { createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin, requireAuthenticatedUser } from './supabaseAdmin';

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
  app.post('/api/bookings', async (request: Request, response: Response) => {
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
      response.status(201).json({
        bookingId: booking.booking_id,
        amount: Number(booking.amount_paise),
        currency: booking.currency,
        appointmentEnd: booking.appointment_end,
      });
    } catch (error) {
      const status = error instanceof Error && /bearer|session|authenticated/i.test(error.message) ? 401 : 500;
      sendError(response, status, status === 401 ? 'Authentication required.' : 'Unable to create the booking.');
    }
  });
}
