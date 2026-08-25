import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin, requireAuthenticatedUser } from './supabaseAdmin';

/**
 * M41 — public website booking API (guest bookings + booking context).
 *
 * Endpoints (all registered from setupApiRoutes):
 *   GET  /api/salons/:slug/booking-context  — services, experts, hours and
 *        available slots straight from the database (services table, staff
 *        table when present, salon_public_websites.config, bookings tables).
 *   POST /api/bookings/website              — guest booking (no auth needed).
 *        The legacy `POST /api/bookings` route delegates guest-shaped
 *        payloads here, so the documented single endpoint works as-is.
 *   GET  /api/bookings/website?salonId=...  — owner read surface (auth).
 *
 * All database access uses the service-role client. Guests can never set
 * prices/durations — the RPC `create_website_booking` snapshots them from
 * the live `services` row.
 */

const SALON_TZ = 'Asia/Kolkata';

/** Fallback opening hours (24h) when the published website config has none. */
const DEFAULT_HOURS: Record<string, { open: boolean; startTime: string; endTime: string }> = {
  monday: { open: true, startTime: '10:00', endTime: '20:00' },
  tuesday: { open: true, startTime: '10:00', endTime: '20:00' },
  wednesday: { open: true, startTime: '10:00', endTime: '20:00' },
  thursday: { open: true, startTime: '10:00', endTime: '20:00' },
  friday: { open: true, startTime: '10:00', endTime: '20:00' },
  saturday: { open: true, startTime: '10:00', endTime: '20:00' },
  sunday: { open: false, startTime: '10:00', endTime: '20:00' },
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const SLOT_MINUTES = 30;

function sendError(response: Response, status: number, message: string) {
  response.status(status).json({ error: message });
}

function istDayName(isoDate: string): string {
  try {
    const dt = new Date(`${isoDate}T12:00:00`);
    return DAY_NAMES[dt.toLocaleString('en-US', { timeZone: SALON_TZ, weekday: 'long' }).toLowerCase()];
  } catch {
    return DAY_NAMES[new Date(`${isoDate}T12:00:00Z`).getUTCDay()];
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function datePlusDays(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function todayIsoDate(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: SALON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('-');
}

function generateSlots(open: boolean, startHHMM: string, endHHMM: string, durationMinutes: number): string[] {
  if (!open) return [];
  const start = toMinutes(startHHMM);
  const end = toMinutes(endHHMM);
  if (end <= start) return [];
  const slots: string[] = [];
  // Last start must leave room for the service's own duration, otherwise a
  // 2h service booked at 19:00 would silently overflow the closing time.
  for (let t = start; t + durationMinutes <= end; t += SLOT_MINUTES) {
    slots.push(toHHMM(t));
  }
  return slots;
}

interface OccupancyWindow {
  start: number; // minutes since midnight (IST)
  end: number;
}

function occupancyFromRows(
  date: string,
  rows: Array<{ appointment_start: string; appointment_end: string | null }>,
): OccupancyWindow[] {
  const windows: OccupancyWindow[] = [];
  for (const row of rows) {
    try {
      const startTz = new Date(row.appointment_start).toLocaleString('en-US', {
        timeZone: SALON_TZ, hour12: false, hour: '2-digit', minute: '2-digit',
      });
      const endRaw = row.appointment_end || new Date(new Date(row.appointment_start).getTime() + 60 * 60 * 1000).toISOString();
      const endTz = new Date(endRaw).toLocaleString('en-US', {
        timeZone: SALON_TZ, hour12: false, hour: '2-digit', minute: '2-digit',
      });
      const startMin = toMinutes(startTz);
      const endMin = toMinutes(endTz);
      const dayOfStart = new Date(row.appointment_start).toLocaleString('en-US', {
        timeZone: SALON_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      }).split('/').reverse().join('-');
      if (dayOfStart === date && endMin > startMin) {
        windows.push({ start: startMin, end: endMin });
      }
    } catch {
      /* ignore malformed rows */
    }
  }
  return windows;
}

function overlaps(window: OccupancyWindow, slotStart: number, slotEnd: number): boolean {
  return window.start < slotEnd && window.end > slotStart;
}

/**
 * Fetch booking context for a published salon straight from the database.
 * `date` (YYYY-MM-DD, optional) adds the exact slot grid for that day.
 */
export async function handleBookingContext(request: Request, response: Response): Promise<void> {
  try {
    const slug = String(request.params.slug || '').trim().toLowerCase();
    if (!slug || slug.length > 200) {
      return sendError(response, 400, 'A valid salon slug is required.');
    }
    const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(request.query.date || ''))
      ? String(request.query.date)
      : todayIsoDate();
    const horizon = Math.min(Number.parseInt(String(request.query.days || '14'), 10) || 14, 30);

    const admin = getSupabaseAdmin();

    const { data: website, error: websiteError } = await admin
      .from('salon_public_websites')
      .select('salon_id,slug,template_key,config')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (websiteError) throw websiteError;
    if (!website) return sendError(response, 404, 'This salon is not published.');

    const salonId = String(website.salon_id);
    const config = website.config && typeof website.config === 'object' && !Array.isArray(website.config)
      ? website.config as Record<string, unknown>
      : {};

    const [{ data: salon, error: salonError }, { data: services, error: servicesError }] = await Promise.all([
      admin.from('salons').select('id,name,city').eq('id', salonId).maybeSingle(),
      admin
        .from('services')
        .select('id,name,price_paise,duration_minutes,is_featured,display_order')
        .eq('salon_id', salonId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('display_order'),
    ]);
    if (salonError) throw salonError;
    if (servicesError) throw servicesError;

    // Experts: the live `staff` table shape is under-specified in-repo
    // (M38 guardrail: only id/salon_id/is_active are known), so discover a
    // name column dynamically instead of assuming one. The dynamic column
    // list bypasses the typed select signature on purpose.
    let experts: Array<{ id: string; name: string; role: string }> = [];
    try {
      const staffQuery = admin.from('staff') as unknown as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
          };
        };
      };
      const probe = await staffQuery.select('id,salon_id').eq('salon_id', salonId).limit(50);
      if (!probe.error && probe.data) {
        let nameColumn: string | null = null;
        for (const candidate of ['full_name', 'name', 'display_name']) {
          const columnProbe = await staffQuery.select(candidate).eq('salon_id', salonId).limit(1);
          if (!columnProbe.error) { nameColumn = candidate; break; }
        }
        if (nameColumn) {
          const { data: staffRows, error: staffError } = await staffQuery
            .select(`id,${nameColumn}`)
            .eq('salon_id', salonId)
            .limit(50);
          if (!staffError && staffRows) {
            experts = staffRows
              .map((row) => ({
                id: String(row.id || ''),
                name: String(row[nameColumn] || '').trim(),
                role: 'Stylist',
              }))
              .filter((expert) => expert.id && expert.name.length > 0);
          }
        }
      }
    } catch {
      experts = [];
    }
    if (experts.length === 0 && Array.isArray(config.team)) {
      experts = (config.team as Array<Record<string, unknown>>)
        .map((member) => ({
          id: String(member.id || ''),
          name: String(member.name || '').trim(),
          role: String(member.role || 'Stylist'),
        }))
        .filter((expert) => expert.id && expert.name);
    }

    const hours = config.openingHours && typeof config.openingHours === 'object' && !Array.isArray(config.openingHours)
      ? (config.openingHours as Record<string, { open: boolean; startTime: string; endTime: string }>)
      : DEFAULT_HOURS;
    const holidayDates = new Set(
      (Array.isArray(config.holidays) ? config.holidays : [])
        .map((item) => item as Record<string, unknown>)
        .filter((item) => item && (item.closed === true || item.closed === undefined))
        .map((item) => String(item.date || ''))
        .filter(Boolean),
    );

    // Occupancy: guest bookings (authoritative for this feature) plus, when
    // the canonical table is present on the live schema, cross-checked.
    const today = todayIsoDate();
    const rangeEnd = datePlusDays(requestedDate, Math.max(horizon, 1));
    const occupancy: Record<string, OccupancyWindow[]> = {};

    const { data: guestRows, error: guestError } = await admin
      .from('website_bookings')
      .select('start_time,end_time,appointment_date')
      .eq('salon_id', salonId)
      .neq('status', 'cancelled')
      .gte('appointment_date', requestedDate)
      .lte('appointment_date', rangeEnd);
    if (!guestError && guestRows) {
      for (const row of guestRows) {
        const day = String(row.appointment_date).slice(0, 10);
        const startMin = toMinutes(String(row.start_time).slice(0, 5));
        const endMin = row.end_time ? toMinutes(String(row.end_time).slice(0, 5)) : startMin + 30;
        (occupancy[day] ||= []).push({ start: startMin, end: endMin });
      }
    }
    try {
      const { data: canonicalRows, error: canonicalError } = await admin
        .from('bookings')
        .select('appointment_start,appointment_end')
        .eq('salon_id', salonId)
        .neq('status', 'cancelled')
        .gte('appointment_start', `${requestedDate}T00:00:00+05:30`)
        .lte('appointment_start', `${rangeEnd}T23:59:59+05:30`);
      if (!canonicalError && canonicalRows) {
        for (const row of canonicalRows as Array<{ appointment_start: string; appointment_end: string | null }>) {
          try {
            const day = new Date(row.appointment_start).toLocaleString('en-US', {
              timeZone: SALON_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
            }).split('/').reverse().join('-');
            if (occupancy[day]) {
              const merged = occupancyFromRows(day, [row]);
              occupancy[day].push(...merged);
            } else if (day >= requestedDate && day <= rangeEnd) {
              occupancy[day] = occupancyFromRows(day, [row]);
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* canonical table may not exist on every schema — degrade gracefully */
    }

    const nowIstMinutes = (() => {
      const parts = new Date().toLocaleString('en-US', {
        timeZone: SALON_TZ, hour12: false, hour: '2-digit', minute: '2-digit',
      });
      return toMinutes(parts);
    })();

    // Services drive the latest possible duration for slot generation.
    const serviceList = (services || []).map((service) => ({
      id: String(service.id),
      name: String(service.name || ''),
      price: Math.round(Number(service.price_paise || 0) / 100),
      duration: Number(service.duration_minutes || 0),
      featured: service.is_featured === true,
    })).filter((service) => service.name.length > 0);

    const defaultDuration = 30;
    const days: Array<{ date: string; open: boolean; totalSlots: number; freeSlots: number }> = [];
    for (let offset = 0; offset < horizon; offset++) {
      const date = datePlusDays(requestedDate, offset);
      const dayHours = hours[istDayName(date)] || { open: false, startTime: '10:00', endTime: '20:00' };
      const open = Boolean(dayHours.open) && !holidayDates.has(date);
      if (!open) {
        days.push({ date, open: false, totalSlots: 0, freeSlots: 0 });
        continue;
      }
      const slots = generateSlots(true, dayHours.startTime, dayHours.endTime, defaultDuration);
      const windows = occupancy[date] || [];
      const isToday = date === today;
      let free = 0;
      for (const slot of slots) {
        const startMin = toMinutes(slot);
        if (isToday && startMin <= nowIstMinutes + 5) continue;
        if (!windows.some((window) => overlaps(window, startMin, startMin + SLOT_MINUTES))) free += 1;
      }
      days.push({ date, open: true, totalSlots: slots.length, freeSlots: free });
    }

    let slotGrid: Array<{ time: string; available: boolean }> | null = null;
    if (requestedDate <= datePlusDays(today, horizon)) {
      const dayHours = hours[istDayName(requestedDate)] || { open: false, startTime: '10:00', endTime: '20:00' };
      const open = Boolean(dayHours.open) && !holidayDates.has(requestedDate);
      const windows = occupancy[requestedDate] || [];
      const isToday = requestedDate === today;
      slotGrid = open
        ? generateSlots(true, dayHours.startTime, dayHours.endTime, defaultDuration).map((slot) => {
            const startMin = toMinutes(slot);
            const tooEarly = isToday && startMin <= nowIstMinutes + 5;
            const booked = windows.some((window) => overlaps(window, startMin, startMin + SLOT_MINUTES));
            return { time: slot, available: !tooEarly && !booked };
          })
        : [];
    }

    response.json({
      salon: {
        id: salonId,
        slug,
        name: String(salon?.name || ''),
        phone: String((salon as Record<string, unknown> | null)?.phone || String(config.phone || '')),
      },
      services: serviceList,
      experts,
      hours,
      days,
      slots: slotGrid,
    });
  } catch (error) {
    console.error('Booking context failed:', error);
    sendError(response, 500, 'Unable to load booking availability right now.');
  }
}

/** Guest booking payload — what the website modal POSTs (no auth required). */
const guestBookingSchema = z.object({
  salonSlug: z.string().trim().min(1).max(200),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(7).max(20),
  customerEmail: z.string().trim().max(200).optional().or(z.literal('')),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

/** True when the body is a guest website booking (not the auth'd payload). */
export function isGuestWebsiteBooking(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.salonSlug === 'string' &&
    (typeof candidate.customerName === 'string' || typeof candidate.customerPhone === 'string') &&
    typeof candidate.idempotencyKey !== 'string'
  );
}

async function executeGuestBooking(request: Request, response: Response): Promise<void> {
  try {
    const parsed = guestBookingSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(response, 400, parsed.error.issues[0]?.message || 'Invalid booking request.');
    }
    const input = parsed.data;

    const { data, error } = await getSupabaseAdmin().rpc('create_website_booking', {
      p_salon_slug: input.salonSlug,
      p_service_id: input.serviceId,
      p_staff_id: input.staffId || null,
      p_appointment_date: input.date,
      p_start_time: input.time,
      p_customer_name: input.customerName,
      p_customer_phone: input.customerPhone,
      p_customer_email: input.customerEmail || null,
      p_note: input.note || null,
    });
    if (error) {
      const code = String((error as { code?: string }).code || '');
      if (code === '23P01') return sendError(response, 409, 'The selected time is no longer available. Please pick another slot.');
      if (code === 'P0002') return sendError(response, 404, 'The selected service or salon is unavailable.');
      if (code === '22023' || code === '23514' || code === '23505' || code === '22P02') {
        return sendError(response, 400, String(error.message || 'Please check your details and try again.'));
      }
      console.error('Guest booking failed:', { code, message: error.message });
      return sendError(response, 500, 'Unable to create the booking right now. Please try again.');
    }

    const booking = Array.isArray(data) ? data[0] : data;
    if (!booking || !booking.booking_id) {
      return sendError(response, 500, 'Booking persistence returned no booking.');
    }
    const pricePaise = Number(booking.price_paise || 0);
    response.status(201).json({
      bookingId: String(booking.booking_id),
      bookingReference: String(booking.booking_reference || ''),
      serviceName: String(booking.service_name || ''),
      amount: Math.round(pricePaise / 100),
      currency: 'INR',
      durationMinutes: booking.duration_minutes != null ? Number(booking.duration_minutes) : null,
      appointmentDate: String(booking.appointment_date).slice(0, 10),
      startTime: String(booking.start_time || '').slice(0, 5),
      endTime: booking.end_time ? String(booking.end_time).slice(0, 5) : null,
      status: String(booking.status || 'pending'),
    });
  } catch (error) {
    console.error('Guest booking error:', error);
    sendError(response, 500, 'Unable to create the booking right now. Please try again.');
  }
}

/** Dedicated guest endpoint (and delegate target for POST /api/bookings). */
export function handleGuestWebsiteBooking(request: Request, response: Response): void {
  void executeGuestBooking(request, response);
}

/** Owner read surface for guest bookings (requires a signed-in owner). */
export async function handleWebsiteBookingsList(request: Request, response: Response): Promise<void> {
  try {
    const user = await requireAuthenticatedUser(request);
    const salonId = String(request.query.salonId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(salonId)) {
      return sendError(response, 400, 'A valid salonId is required.');
    }
    const { data, error } = await getSupabaseAdmin().rpc('get_website_bookings_for_actor', {
      p_actor_user_id: user.id,
      p_salon_id: salonId,
    });
    if (error) throw error;
    response.json({ bookings: Array.isArray(data) ? data : [], viewerId: user.id });
  } catch (error) {
    const dbError = error && typeof error === 'object'
      ? error as { code?: string; message?: string; details?: string; hint?: string }
      : {};
    const message = dbError.message || (error instanceof Error ? error.message : '');
    const status = /bearer|session|authenticat/i.test(message) || dbError.code === '28000'
      ? 401 : dbError.code === '42501' ? 403 : dbError.code === 'P0003' ? 409 : 500;
    if (status === 500) {
      console.error('Website booking list failed', {
        operation: 'get_website_bookings_for_actor',
        source: 'supabase',
        code: dbError.code || null,
        message: message || 'Unknown database error',
        details: dbError.details || null,
        hint: dbError.hint || null,
      });
    }
    sendError(response, status,
      status === 401 ? 'Authentication required.'
        : status === 403 ? 'Permission denied for this salon.'
          : status === 409 ? 'Multiple salons are linked to this account. Select one first.'
            : 'Unable to load bookings.');
  }
}

export function registerWebsiteBookingRoutes(app: Express): void {
  app.get('/api/salons/:slug/booking-context', handleBookingContext);
  app.post('/api/bookings/website', handleGuestWebsiteBooking);
  app.get('/api/bookings/website', handleWebsiteBookingsList);
}
