/**
 * M41 — website guest booking client.
 *
 * Talks to the SAME-ORIGIN server API (Express in dev, Vercel serverless in
 * prod — both register the identical routes):
 *   GET  /api/salons/:slug/booking-context   services, experts, hours, slots
 *   POST /api/bookings                       guest booking (no auth required)
 *
 * The modal NEVER prices a booking itself: amounts come from the database
 * (services table) via the context endpoint, and the final amount is
 * re-confirmed by the server RPC at submit time.
 */

export interface BookingServiceOption {
  id: string;
  name: string;
  price: number; // INR rupees
  duration: number; // minutes
  featured?: boolean;
}

export interface BookingExpertOption {
  id: string;
  name: string;
  role: string;
}

export interface DayAvailability {
  date: string; // YYYY-MM-DD
  open: boolean;
  totalSlots: number;
  freeSlots: number;
}

export interface SlotOption {
  time: string; // HH:MM (24h, salon local)
  available: boolean; // the 30-minute chunk itself is free
}

export interface DayScheduleInfo {
  open: boolean;
  startTime: string;
  endTime: string;
}

export interface BookingContext {
  salon: { id: string; slug: string; name: string; phone: string };
  services: BookingServiceOption[];
  experts: BookingExpertOption[];
  hours: Record<string, DayScheduleInfo> | null;
  days: DayAvailability[];
  slots: SlotOption[] | null;
}

export interface WebsiteBookingInput {
  salonSlug: string;
  serviceId: string;
  staffId?: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  note?: string;
}

export interface WebsiteBookingResult {
  bookingId: string;
  bookingReference: string;
  serviceName: string;
  amount: number;
  currency: 'INR';
  durationMinutes: number | null;
  appointmentDate: string;
  startTime: string;
  endTime: string | null;
  status: string;
  /**
   * True when the live API was unreachable and the request was saved on the
   * visitor's device instead (see `src/lib/offlineBookings.ts`). The UI shows
   * a confirmation that the salon will follow up by phone/WhatsApp.
   */
  local?: boolean;
}

interface ApiError {
  error?: string;
}

async function parseJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  let body: ApiError | T | null = null;
  try {
    body = (await response.json()) as ApiError | T;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof (body as ApiError).error === 'string'
      ? (body as ApiError).error!
      : fallbackMessage;
    throw new Error(message);
  }
  return body as T;
}

/**
 * Fetch services, experts and available slots for the published salon
 * directly from the database API. `date` (YYYY-MM-DD) requests the exact
 * slot grid for that day (defaults to today, salon local time).
 */
export async function fetchBookingContext(slug: string, date?: string): Promise<BookingContext> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  const response = await fetch(`/api/salons/${encodeURIComponent(slug)}/booking-context?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  return parseJson<BookingContext>(response, 'Live availability could not be loaded. Please try again.');
}

/**
 * Create a guest website booking via POST /api/bookings (same endpoint the
 * authenticated flow uses; the server routes guest payloads to the
 * `create_website_booking` RPC, which snapshots price/duration from DB).
 */
export async function createWebsiteBooking(input: WebsiteBookingInput): Promise<WebsiteBookingResult> {
  const response = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<WebsiteBookingResult>(response, 'The booking could not be created. Please try again.');
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

export function formatINR(amount: number): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  }
}

/**
 * Normalise opening-hours times to 24h 'HH:MM'. The saved website config
 * mostly stores '10:00', but some drafts use '10:00 AM' style strings.
 */
export function normalizeHHMM(value: string | undefined | null): string {
  const raw = (value || '').trim();
  const plain = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (plain) return `${plain[1].padStart(2, '0')}:${plain[2]}`;
  const ampm = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)$/i);
  if (ampm) {
    let hour = Number.parseInt(ampm[1], 10) % 12;
    if (/pm/i.test(ampm[3])) hour += 12;
    return `${String(hour).padStart(2, '0')}:${ampm[2]}`;
  }
  return raw;
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** '14:30' → '2:30 PM' */
export function formatSlotTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDayLabel(date: string): { weekday: string; day: string; month: string; isToday: boolean } {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dt = new Date(`${date}T12:00:00`);
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'short' });
  const month = dt.toLocaleDateString('en-US', { month: 'short' });
  const day = String(dt.getDate());
  return { weekday, day, month, isToday: date === today };
}

/**
 * A slot is selectable for a `duration`-minute service only when the slot's
 * own 30-minute chunk is free AND every 30-minute chunk it spans is present
 * (within opening hours) and free in the grid.
 */
export function slotFitsService(slot: SlotOption, slots: SlotOption[], durationMinutes: number): boolean {
  if (!slot.available) return false;
  const needed = Math.max(1, Math.ceil(durationMinutes / 30));
  const index = slots.findIndex((candidate) => candidate.time === slot.time);
  if (index === -1) return false;
  for (let offset = 0; offset < needed; offset += 1) {
    const chunk = slots[index + offset];
    if (!chunk || !chunk.available) return false;
  }
  return true;
}
