/**
 * PHASE 10.6 — BOOK APPOINTMENT ENTRY FLOW · single engine for all five themes.
 *
 * This is the ONE booking entry architecture for the public website. It:
 *
 *   - derives the service list from the ACTIVE theme only (theme-isolated
 *     category → service selection, reusing the active-catalog filter);
 *   - respects weekly `openingHours`, dated `holidays` and `bookingRules`
 *     (min notice / max advance / buffer) when generating days and slots;
 *   - shows only available slots and disables past / taken / closed ones;
 *   - prevents double-booking with short-lived slot holds (localStorage),
 *     keyed per theme + service + local date + start time;
 *   - validates the customer entry form (name required, mobile required,
 *     email + notes optional).
 *
 * No database writes, no payment, no final confirmation — those arrive in
 * later phases. The engine reuses the Phase 10.5 salon clock
 * (`salonStatus.salonNow`) so status and booking agree on "now".
 */
import type { SalonData, SalonHoliday, SalonOpeningHours, Service, ServiceOffer } from '../types';
import { digitsOnly } from './siteBooking';
import { serviceDisplayPrice } from './pricing';
import { activeCatalogItems } from './siteStructure';
import type { SiteHeaderThemeId } from './siteNavigation';
import {
  formatClockLabel,
  holidayOn,
  isClosedHoliday,
  localDateKey,
  minutesSinceMidnight,
  parseClockToMinutes,
  salonNow,
  scheduleForDay,
  weekdayKeyOf,
} from './salonStatus';

/* ------------------------------------------------------------------ */
/* Steps + holds                                                       */
/* ------------------------------------------------------------------ */

/**
 * PHASE 16.1 — the flow gains a leading `salon` confirmation step:
 *   Salon → Service → Date → Time → Customer Details → Booking Summary.
 * The salon step never lets the visitor pick a different salon — it
 * confirms the ACTIVE salon (the one whose website is open) so every
 * later selection stays isolated to that salon + theme.
 */
export type BookingStepId = 'salon' | 'service' | 'date' | 'time' | 'details' | 'summary';
export const BOOKING_STEP_IDS: BookingStepId[] = ['salon', 'service', 'date', 'time', 'details', 'summary'];

export const BOOKING_HOLDS_KEY = 'nexora_site_booking_holds';
export const BOOKING_BROWSER_KEY = 'nexora_site_booking_browser';
export const BOOKING_HOLD_EVENT = 'nexora:booking-holds';
export const BOOKING_HOLD_MINUTES = 15;

/* ------------------------------------------------------------------ */
/* PHASE 16.1 — salon context (step 1 of the flow)                     */
/* ------------------------------------------------------------------ */

/**
 * Tenant id for the salon whose website is open. Resolution reuses the
 * EXISTING Phase 10.7 rule (the payment engine's tenant ownership):
 * provenance on the salon's own service rows first, then the `salonId`
 * resolved from the public database projection, then a legacy explicit
 * `businessId` payload, and finally the shared local-preview fallback. No
 * salon id is ever invented, hardcoded or accepted from URL input.
 */
export function bookingBusinessId(data: SalonData): string {
  const fromServices = (data.services || [])
    .map((service) => (service as Service & { businessId?: string }).businessId)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (fromServices) return fromServices;
  if (typeof data.salonId === 'string' && data.salonId.trim().length > 0) {
    return data.salonId.trim();
  }
  const explicit = (data as SalonData & { businessId?: string }).businessId;
  if (typeof explicit === 'string' && explicit.trim().length > 0) return explicit;
  return 'public-site';
}

export interface BookingSalonContext {
  /** Tenant that owns every record this flow produces. */
  businessId: string;
  /** Active theme — bookings stay isolated to this salon + theme. */
  themeId: string;
  salonName: string;
  address: string;
  phone: string;
  /** Whether the active theme has at least one bookable service. */
  hasServices: boolean;
}

/**
 * The salon the visitor is booking at — ALWAYS the salon whose website
 * is open, derived from existing data only (never a picker over foreign
 * salons, never an invented id). The salon confirmation step renders it.
 */
export function bookingSalonContext(data: SalonData, themeId: string): BookingSalonContext {
  return {
    businessId: bookingBusinessId(data),
    themeId,
    salonName: (data.salonName || '').trim(),
    address: (data.address?.fullAddress || '').trim(),
    phone: (data.phone || '').trim(),
    hasServices: bookingServicesForTheme(data, themeId).length > 0,
  };
}

/* ------------------------------------------------------------------ */
/* Theme-isolated service list                                         */
/* ------------------------------------------------------------------ */

/**
 * Services for the ACTIVE theme only. Rows carrying explicit theme
 * provenance must match the active theme; inactive/archived rows are
 * dropped. Rows without provenance are the active theme's own plain
 * catalog and stay visible. Cross-theme services can never leak in.
 */
export function bookingServicesForTheme(data: SalonData, themeId: string): Service[] {
  return activeCatalogItems(data.services).filter(
    (service) => !service.themeId || service.themeId === themeId,
  );
}

/** Category → services, preserving catalog order inside each category. */
export function bookingServicesByCategory(services: readonly Service[]): Array<{ category: string; services: Service[] }> {
  const map = new Map<string, Service[]>();
  for (const service of services) {
    const category = (service.category || '').trim() || 'Other';
    const list = map.get(category);
    if (list) list.push(service);
    else map.set(category, [service]);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, services: items }));
}

/* ------------------------------------------------------------------ */
/* PHASE 16.2 — multi-service selection (one appointment, N services)  */
/* ------------------------------------------------------------------ */

/**
 * Maximum services per single appointment. A guard, not a business rule:
 * the appointment stays one continuous sitting, so runaway selections
 * (and absurd total durations) are prevented at the engine level.
 */
export const BOOKING_MAX_SERVICES = 6;

export interface BookingSelectionLine {
  service: Service;
  /** Offer-aware price actually charged (existing Phase 9.1 pricing). */
  finalPrice: number;
  /** Pre-offer price for strikethrough display. */
  basePrice: number;
  /** Duration in minutes (active pricing-variant override wins, as in 10.6). */
  durationMinutes: number;
}

export interface BookingSelectionSummary {
  lines: BookingSelectionLine[];
  /** Sum of offer-aware final prices. */
  totalPrice: number;
  /** Sum of pre-offer base prices (>= totalPrice; equal when no offers). */
  totalBasePrice: number;
  /** Total appointment length in minutes. */
  totalDurationMinutes: number;
  count: number;
}

/** Duration for one service — active variant override first, as in 10.6. */
export function bookingServiceDuration(service: Service): number {
  const variant = service.pricingVariants?.find((v) => v.status === 'active');
  return Math.max(variant?.duration ?? service.duration ?? 30, 1);
}

/**
 * Resolves the ordered id list against the ACTIVE theme's own service list.
 * Unknown / foreign / stale ids are silently dropped — a selection can never
 * contain a service the active theme does not itself offer.
 */
export function bookingSelectedServices(
  services: readonly Service[],
  selectedIds: readonly string[],
): Service[] {
  const seen = new Set<string>();
  const result: Service[] = [];
  for (const id of selectedIds) {
    if (seen.has(id)) continue;
    const service = services.find((item) => item.id === id);
    if (!service) continue;
    seen.add(id);
    result.push(service);
  }
  return result;
}

/**
 * Toggle one service in the ordered selection. Selecting an already-selected
 * service removes it; adding beyond `BOOKING_MAX_SERVICES` is refused (the
 * caller shows the limit note). Never invents ids — the id must exist in the
 * theme's own list at resolve time (`bookingSelectedServices`).
 */
export function toggleBookingService(
  selectedIds: readonly string[],
  serviceId: string,
): { ids: string[]; changed: boolean; reason?: 'limit' } {
  if (selectedIds.includes(serviceId)) {
    return { ids: selectedIds.filter((id) => id !== serviceId), changed: true };
  }
  if (selectedIds.length >= BOOKING_MAX_SERVICES) {
    return { ids: selectedIds.slice(), changed: false, reason: 'limit' };
  }
  return { ids: [...selectedIds, serviceId], changed: true };
}

/**
 * Totals for the selection: offer-aware price (Phase 9.1 `serviceDisplayPrice`,
 * same function every service card already uses) and variant-aware duration.
 * Prices and durations are read from the existing rows only — never invented.
 */
export function bookingSelectionSummary(
  selectedServices: readonly Service[],
  offers: readonly ServiceOffer[] | undefined,
): BookingSelectionSummary {
  const lines: BookingSelectionLine[] = selectedServices.map((service) => {
    const pricing = serviceDisplayPrice(service, (offers || []) as ServiceOffer[]);
    return {
      service,
      finalPrice: pricing.finalPrice,
      basePrice: pricing.basePrice,
      durationMinutes: bookingServiceDuration(service),
    };
  });
  return {
    lines,
    totalPrice: lines.reduce((sum, line) => sum + line.finalPrice, 0),
    totalBasePrice: lines.reduce((sum, line) => sum + line.basePrice, 0),
    totalDurationMinutes: lines.reduce((sum, line) => sum + line.durationMinutes, 0),
    count: lines.length,
  };
}

/**
 * The combined selection acts as ONE bookable sitting for the existing
 * slot/hold engine (id = stable joined ids, duration = summed minutes).
 * Single-service selections collapse to the service itself, so all
 * pre-16.2 hold keys, tests and behaviours stay byte-identical.
 */
export function bookingCombinedSlotService(
  selectedServices: readonly Service[],
): Pick<Service, 'id' | 'duration'> | null {
  if (selectedServices.length === 0) return null;
  if (selectedServices.length === 1) {
    return { id: selectedServices[0].id, duration: bookingServiceDuration(selectedServices[0]) };
  }
  const ids = selectedServices.map((service) => service.id);
  return {
    id: ids.slice().sort().join('+'),
    duration: selectedServices.reduce((sum, service) => sum + bookingServiceDuration(service), 0),
  };
}

/* ------------------------------------------------------------------ */
/* Booking rules parsing                                               */
/* ------------------------------------------------------------------ */

export interface ParsedBookingRules {
  /** Minimum notice before a slot can be booked, in minutes. */
  minNoticeMinutes: number;
  /** How many days ahead can be booked (inclusive of today). */
  maxAdvanceDays: number;
  /** Buffer minutes appended to a service before the next slot starts. */
  bufferMinutes: number;
}

/** Accepts `1 hour`, `45 min`, `30 days`, `No buffer`, `15 minutes`. */
export function parseDurationToMinutes(value: string | null | undefined): number | null {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('no buffer') || raw.includes('none') || raw === '0') return 0;
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(minute|minutes|mins|min|hour|hours|hr|hrs|day|days)?/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2] || 'min';
  if (unit.startsWith('hour') || unit === 'hr' || unit === 'hrs') return Math.round(amount * 60);
  if (unit.startsWith('day')) return Math.round(amount * 24 * 60);
  return Math.round(amount);
}

export function parsedBookingRules(data: Pick<SalonData, 'bookingRules'>): ParsedBookingRules {
  const rules = data.bookingRules;
  const maxAdvanceRaw = parseDurationToMinutes(rules?.maxAdvance);
  return {
    minNoticeMinutes: parseDurationToMinutes(rules?.minNotice) ?? 60,
    maxAdvanceDays: maxAdvanceRaw != null ? Math.max(1, Math.round(maxAdvanceRaw / (24 * 60))) : 30,
    bufferMinutes: parseDurationToMinutes(rules?.bufferTime) ?? 0,
  };
}

/** Gap between slot start times: ≥30 min, rounded up to 30-min grid. */
export function bookingSlotIntervalMinutes(
  service: Pick<Service, 'duration'>,
  data: Pick<SalonData, 'bookingRules'>,
): number {
  const { bufferMinutes } = parsedBookingRules(data);
  const total = Math.max(service.duration || 30, 1) + Math.max(bufferMinutes, 0);
  return Math.min(120, Math.max(30, Math.ceil(total / 30) * 30));
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export type BookingDayReason = 'outside-window' | 'holiday' | 'closed' | 'past' | 'full';

export interface BookingDayInfo {
  date: Date;
  /** Local calendar key `YYYY-MM-DD` — never UTC. */
  dateKey: string;
  weekday: keyof SalonOpeningHours;
  isToday: boolean;
  selectable: boolean;
  reason?: BookingDayReason;
  holiday?: SalonHoliday | null;
  openLabel?: string;
  closeLabel?: string;
}

/** First selectable day of the window (today, local midnight). */
export function bookingWindowStart(now: Date = salonNow()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** `YYYY-MM-DD` keys from start (inclusive) to start + days (exclusive). */
export function bookingWindowDateKeys(data: Pick<SalonData, 'bookingRules'>, now: Date = salonNow()): Set<string> {
  const start = bookingWindowStart(now);
  const days = parsedBookingRules(data).maxAdvanceDays;
  const keys = new Set<string>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start.getTime());
    d.setDate(start.getDate() + i);
    keys.add(localDateKey(d));
  }
  return keys;
}

export function bookingDayInfo(
  data: Pick<SalonData, 'openingHours' | 'holidays' | 'bookingRules'>,
  date: Date,
  now: Date = salonNow(),
): BookingDayInfo {
  const dateKey = localDateKey(date);
  const weekday = weekdayKeyOf(date);
  const holiday = holidayOn(data.holidays, dateKey);
  const base: BookingDayInfo = {
    date,
    dateKey,
    weekday,
    isToday: dateKey === localDateKey(now),
    selectable: true,
    holiday,
  };

  if (!bookingWindowDateKeys(data, now).has(dateKey)) {
    return { ...base, selectable: false, reason: 'outside-window' };
  }
  if (isClosedHoliday(holiday)) {
    return { ...base, selectable: false, reason: 'holiday' };
  }
  const schedule = scheduleForDay(data.openingHours, weekday);
  if (!schedule.open) {
    return { ...base, selectable: false, reason: 'closed' };
  }
  const openMinutes = parseClockToMinutes(schedule.startTime);
  const closeMinutes = parseClockToMinutes(schedule.endTime);
  const openLabel = openMinutes != null ? formatClockLabel(openMinutes) : undefined;
  const closeLabel = closeMinutes != null ? formatClockLabel(closeMinutes) : undefined;
  if (base.isToday && closeMinutes != null && minutesSinceMidnight(now) >= closeMinutes) {
    return { ...base, selectable: false, reason: 'past', openLabel, closeLabel };
  }
  return { ...base, openLabel, closeLabel };
}

/** The next `count` days from today (never UTC-shifted). */
export function bookingDayList(
  data: Pick<SalonData, 'openingHours' | 'holidays' | 'bookingRules'>,
  count: number,
  now: Date = salonNow(),
): BookingDayInfo[] {
  const start = bookingWindowStart(now);
  const days: BookingDayInfo[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(start.getTime());
    d.setDate(start.getDate() + i);
    days.push(bookingDayInfo(data, d, now));
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* Slots                                                               */
/* ------------------------------------------------------------------ */

export type BookingSlotState = 'available' | 'past' | 'taken' | 'held';

export interface BookingSlot {
  /** Minutes from midnight when the service starts. */
  minutes: number;
  startLabel: string;
  endLabel: string;
  state: BookingSlotState;
}

export interface BookingHold {
  key: string;
  browserId: string;
  themeId: string;
  serviceId: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  expiresAt: number;
  /** PHASE 16.3 — salon that owns the hold. Legacy holds without it keep
   * blocking the same theme (fail-closed backward compatibility). */
  businessId?: string;
}

/* ------------------------------------------------------------------ */
/* PHASE 16.3 — availability extras (booked spans + staff windows)     */
/* ------------------------------------------------------------------ */

/** A span already taken by a real booking record (same salon + theme). */
export interface BookingBlockedSpan {
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
}

/** Minutes-from-midnight window in which qualified staff are working. */
export interface BookingStaffWindow {
  startMinutes: number;
  endMinutes: number;
}

/**
 * Optional availability context threaded through the slot engine:
 *   - `blockedSpans`  — spans taken by confirmed/pending booking records
 *                       (derived from the EXISTING 10.7 payment store);
 *   - `staffWindows`  — when non-null, a slot must fit fully inside one
 *                       window (staff availability); `null`/undefined =
 *                       salon hours alone govern (no mapping exists);
 *   - `businessId`    — the active salon. Holds stamped with a DIFFERENT
 *                       salon id never block this salon's slots.
 * All fields optional → every pre-16.3 call site behaves identically.
 */
export interface BookingSlotExtras {
  blockedSpans?: readonly BookingBlockedSpan[];
  staffWindows?: readonly BookingStaffWindow[] | null;
  businessId?: string;
}

function spanBlocked(
  extras: BookingSlotExtras | undefined,
  dateKey: string,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (!extras?.blockedSpans) return false;
  return extras.blockedSpans.some(
    (span) => span.dateKey === dateKey && span.startMinutes < endMinutes && span.endMinutes > startMinutes,
  );
}

function outsideStaffWindows(
  extras: BookingSlotExtras | undefined,
  startMinutes: number,
  endMinutes: number,
): boolean {
  const windows = extras?.staffWindows;
  if (windows == null) return false; // no staff constraint for this selection
  return !windows.some((win) => win.startMinutes <= startMinutes && win.endMinutes >= endMinutes);
}

/** A hold blocks this salon unless it is explicitly stamped with another salon. */
function holdBlocksBusiness(hold: BookingHold, extras: BookingSlotExtras | undefined): boolean {
  if (!hold.businessId || !extras?.businessId) return true; // legacy fail-closed
  return hold.businessId === extras.businessId;
}

export function bookingSlotKey(
  themeId: string,
  serviceId: string,
  dateKey: string,
  startMinutes: number,
): string {
  return `${themeId}|${serviceId}|${dateKey}|${startMinutes}`;
}

let injectedHolds: BookingHold[] | null = null;

/** Test-only injection of foreign holds (simulates other visitors' bookings). */
export function setBookingHoldsForTests(holds: BookingHold[] | null): void {
  injectedHolds = holds ? holds.slice() : null;
}

/* ------------------------------------------------------------------ */
/* PHASE 16.9 — date-list state seam (loading / error / ready).        */
/*                                                                     */
/* The date step gets its OWN seam instead of sharing the 'booking'    */
/* section flag the 16.3 slot states use, so forcing slot availability */
/* loading never hides the date grid (and vice versa). The date list   */
/* itself is computed synchronously today; the states exist for        */
/* future async sources and for the 16.9 acceptance tests.             */
/* ------------------------------------------------------------------ */

let datesStateOverride: 'loading' | 'error' | null = null;

export function setBookingDatesStateForTests(state: 'loading' | 'error' | null): void {
  datesStateOverride = state;
}

export function bookingDatesStatus(): 'loading' | 'error' | 'ready' {
  if (datesStateOverride === 'loading' || datesStateOverride === 'error') return datesStateOverride;
  return 'ready';
}

/** Stable per-browser id so a visitor's own holds never block themselves. */
export function bookingBrowserId(): string {
  if (typeof window === 'undefined') return 'booking-test';
  try {
    let id = window.localStorage.getItem(BOOKING_BROWSER_KEY);
    if (!id) {
      id = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(BOOKING_BROWSER_KEY, id);
    }
    return id;
  } catch {
    return `b-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function readBookingHolds(): BookingHold[] {
  if (injectedHolds) return injectedHolds.slice();
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BOOKING_HOLDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BookingHold =>
        !!item && typeof item === 'object'
        && typeof (item as BookingHold).key === 'string'
        && typeof (item as BookingHold).expiresAt === 'number',
    );
  } catch {
    return [];
  }
}

export function activeBookingHolds(nowEpochMs: number = Date.now()): BookingHold[] {
  return readBookingHolds().filter((hold) => hold.expiresAt > nowEpochMs);
}

function writeBookingHolds(holds: BookingHold[]): void {
  if (injectedHolds) {
    injectedHolds = holds.slice();
  } else if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(BOOKING_HOLDS_KEY, JSON.stringify(holds));
    } catch {
      /* storage unavailable — holds simply won't persist */
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BOOKING_HOLD_EVENT));
  }
}

export interface BookingHoldResult {
  ok: boolean;
  reason?: 'taken' | 'expired';
  hold?: BookingHold;
}

/**
 * Reserve a slot for the current browser. Rejects when the exact slot or any
 * overlapping slot on the same theme/day is already held by someone else —
 * this is the double-booking guard. Re-reserving your own slot refreshes it.
 */
export function reserveBookingSlot(
  themeId: string,
  service: Pick<Service, 'id' | 'duration'>,
  dateKey: string,
  startMinutes: number,
  extras?: BookingSlotExtras,
): BookingHoldResult {
  const duration = Math.max(service.duration || 30, 1);
  const endMinutes = startMinutes + duration;
  const key = bookingSlotKey(themeId, service.id, dateKey, startMinutes);
  const myId = bookingBrowserId();
  const now = Date.now();
  const holds = activeBookingHolds(now);

  // PHASE 16.3 — a span already taken by a REAL booking record can never
  // be held, even if no live hold exists for it.
  if (spanBlocked(extras, dateKey, startMinutes, endMinutes)) {
    return { ok: false, reason: 'taken' };
  }

  const existing = holds.find((hold) => hold.key === key);
  if (existing && existing.browserId !== myId && holdBlocksBusiness(existing, extras)) {
    return { ok: false, reason: 'taken' };
  }
  const rest = holds.filter((hold) => hold.key !== key);
  const overlapping = rest.find(
    (hold) =>
      hold.themeId === themeId
      && hold.dateKey === dateKey
      && hold.startMinutes < endMinutes
      && hold.endMinutes > startMinutes
      && holdBlocksBusiness(hold, extras),
  );
  if (overlapping) {
    return { ok: false, reason: 'taken' };
  }

  const hold: BookingHold = {
    key,
    browserId: myId,
    themeId,
    serviceId: service.id,
    dateKey,
    startMinutes,
    endMinutes,
    expiresAt: now + BOOKING_HOLD_MINUTES * 60_000,
    ...(extras?.businessId ? { businessId: extras.businessId } : {}),
  };
  writeBookingHolds([...rest, hold]);
  return { ok: true, hold };
}

export function releaseBookingSlot(key: string | null | undefined): void {
  if (!key) return;
  writeBookingHolds(readBookingHolds().filter((hold) => hold.key !== key));
}

export function bookingHoldFor(themeId: string, serviceId: string, dateKey: string, startMinutes: number): BookingHold | null {
  const key = bookingSlotKey(themeId, serviceId, dateKey, startMinutes);
  return activeBookingHolds().find((hold) => hold.key === key) || null;
}

/**
 * All slots for a service on a day. Slots respect opening hours (never start
 * before open, never run past close), the slot interval, today's minimum
 * notice, and existing holds — past and taken slots stay visible but are
 * disabled (`state: 'past' | 'taken'`). `held` = reserved by THIS browser.
 */
export function bookingSlotsForDay(
  data: Pick<SalonData, 'openingHours' | 'holidays' | 'bookingRules'>,
  themeId: string,
  service: Pick<Service, 'id' | 'duration'>,
  date: Date,
  now: Date = salonNow(),
  extras?: BookingSlotExtras,
): BookingSlot[] {
  const info = bookingDayInfo(data, date, now);
  if (!info.selectable) return [];

  const schedule = scheduleForDay(data.openingHours, info.weekday);
  const openMinutes = parseClockToMinutes(schedule.startTime) ?? 10 * 60;
  const closeMinutes = parseClockToMinutes(schedule.endTime) ?? 20 * 60;
  const duration = Math.max(service.duration || 30, 1);
  const interval = bookingSlotIntervalMinutes(service, data);
  const { minNoticeMinutes } = parsedBookingRules(data);
  const nowMinutes = info.isToday ? minutesSinceMidnight(now) : -1;
  const myId = bookingBrowserId();
  const holds = activeBookingHolds();

  const slots: BookingSlot[] = [];
  for (let start = openMinutes; start + duration <= closeMinutes && slots.length < 48; start += interval) {
    const end = start + duration;
    const key = bookingSlotKey(themeId, service.id, info.dateKey, start);

    let state: BookingSlotState = 'available';
    if (info.isToday && start < nowMinutes + minNoticeMinutes) {
      // Started already, or inside the minimum-notice window.
      state = 'past';
    } else if (
      // PHASE 16.3 — a span taken by a REAL booking record (same salon +
      // theme) or outside every qualified staff member's working window
      // is unavailable regardless of holds.
      spanBlocked(extras, info.dateKey, start, end)
      || outsideStaffWindows(extras, start, end)
    ) {
      state = 'taken';
    } else {
      const mine = holds.find((hold) => hold.key === key && hold.browserId === myId);
      const foreign = holds.find(
        (hold) =>
          hold.themeId === themeId
          && hold.dateKey === info.dateKey
          && hold.startMinutes < end
          && hold.endMinutes > start
          && !(hold.key === key && hold.browserId === myId)
          && holdBlocksBusiness(hold, extras),
      );
      if (foreign) state = 'taken';
      else if (mine) state = 'held';
    }

    slots.push({
      minutes: start,
      startLabel: formatClockLabel(start),
      endLabel: formatClockLabel(end),
      state,
    });
  }
  return slots;
}

/** True when the slot is still bookable (available or held by this browser). */
export function bookingSlotIsStillAvailable(
  data: Pick<SalonData, 'openingHours' | 'holidays' | 'bookingRules'>,
  themeId: string,
  service: Pick<Service, 'id' | 'duration'>,
  date: Date,
  startMinutes: number,
  now: Date = salonNow(),
  extras?: BookingSlotExtras,
): boolean {
  const slot = bookingSlotsForDay(data, themeId, service, date, now, extras).find(
    (item) => item.minutes === startMinutes,
  );
  return !!slot && (slot.state === 'available' || slot.state === 'held');
}

/* ------------------------------------------------------------------ */
/* Customer details validation                                         */
/* ------------------------------------------------------------------ */

export interface BookingCustomerDetails {
  name: string;
  mobile: string;
  email: string;
  notes: string;
}

export interface BookingDetailsErrors {
  name?: boolean;
  mobile?: boolean;
  email?: boolean;
}

export function validateBookingCustomer(details: BookingCustomerDetails): BookingDetailsErrors {
  const errors: BookingDetailsErrors = {};
  if ((details.name || '').trim().length < 2) errors.name = true;
  const digits = digitsOnly(details.mobile);
  if (digits.length < 10 || digits.length > 13) errors.mobile = true;
  const email = (details.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = true;
  return errors;
}

export const BOOKING_THEME_IDS: SiteHeaderThemeId[] = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];
