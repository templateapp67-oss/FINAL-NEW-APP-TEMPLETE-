/**
 * PHASE 10.5 — live salon open/closed status.
 *
 * Uses weekly `openingHours`, optional special `holidays`, and the current
 * local clock. Expired / weekly-closed / holiday days are never shown as open.
 * No database writes — this is a client-side read of existing SalonData.
 */
import { useEffect, useState } from 'react';
import type { DaySchedule, SalonData, SalonHoliday, SalonOpeningHours } from '../types';

export const SALON_CLOCK_EVENT = 'nexora:salon-clock';
export const CLOSING_SOON_MINUTES = 30;

export type SalonStatusKind =
  | 'open'
  | 'closing_soon'
  | 'opens_at'
  | 'closed'
  | 'closed_today'
  | 'holiday';

export interface SalonLiveStatus {
  kind: SalonStatusKind;
  /** Minutes from midnight for the current (or next) opening, when known. */
  openMinutes?: number;
  /** Customer-facing clock label, e.g. `10:00 AM`. */
  openTimeLabel?: string;
  closeMinutes?: number;
  closeTimeLabel?: string;
  holidayName?: string;
  holidayNameHi?: string;
  /** Local `YYYY-MM-DD` the status was computed for. */
  dateKey: string;
}

const WEEKDAY_KEYS: Array<keyof SalonOpeningHours> = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const DEFAULT_OPEN: DaySchedule = { open: true, startTime: '10:00', endTime: '20:00' };
const DEFAULT_SUNDAY: DaySchedule = { open: false, startTime: '10:00', endTime: '20:00' };

let injectedClock: Date | null = null;

export function setSalonClockForTests(value: Date | string | number | null): void {
  injectedClock = value == null ? null : new Date(value);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SALON_CLOCK_EVENT));
  }
}

export function salonNow(): Date {
  return injectedClock ? new Date(injectedClock.getTime()) : new Date();
}

/** Local calendar key — never UTC (`toISOString` would shift the day in IST). */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Accepts `10:00`, `20:00`, `09:00 AM`, `8:00 PM`. */
export function parseClockToMinutes(value: string | undefined | null): number | null {
  if (!value) return null;
  const raw = value.trim();
  const m12 = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (m12) {
    let hours = Number(m12[1]);
    const minutes = Number(m12[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
    const mer = m12[3].toUpperCase();
    if (hours === 12) hours = 0;
    if (mer === 'PM') hours += 12;
    if (hours > 23) return null;
    return hours * 60 + minutes;
  }
  const m24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const hours = Number(m24[1]);
    const minutes = Number(m24[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  return null;
}

export function formatClockLabel(minutes: number): string {
  const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  let hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  const mer = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${mer}`;
}

export function weekdayKeyOf(date: Date): keyof SalonOpeningHours {
  return WEEKDAY_KEYS[date.getDay()];
}

export function holidayOn(holidays: readonly SalonHoliday[] | undefined, dateKey: string): SalonHoliday | null {
  if (!holidays) return null;
  return holidays.find((item) => item.date === dateKey) || null;
}

export function isClosedHoliday(holiday: SalonHoliday | null | undefined): holiday is SalonHoliday {
  return !!holiday && holiday.closed !== false;
}

export function scheduleForDay(
  hours: SalonOpeningHours | undefined,
  day: keyof SalonOpeningHours,
): DaySchedule {
  const given = hours?.[day];
  if (given) return given;
  return day === 'sunday' ? DEFAULT_SUNDAY : DEFAULT_OPEN;
}

function addLocalDays(base: Date, days: number): Date {
  const next = new Date(base.getTime());
  next.setDate(base.getDate() + days);
  return next;
}

export function nextOpenSlot(
  data: Pick<SalonData, 'openingHours' | 'holidays'>,
  from: Date,
): { dateKey: string; openMinutes: number; openTimeLabel: string } | null {
  const nowMinutes = minutesSinceMidnight(from);
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addLocalDays(from, offset);
    const key = localDateKey(day);
    if (isClosedHoliday(holidayOn(data.holidays, key))) continue;
    const schedule = scheduleForDay(data.openingHours, weekdayKeyOf(day));
    if (!schedule.open) continue;
    const openMinutes = parseClockToMinutes(schedule.startTime);
    if (openMinutes == null) continue;
    if (offset === 0 && openMinutes <= nowMinutes) continue;
    return { dateKey: key, openMinutes, openTimeLabel: formatClockLabel(openMinutes) };
  }
  return null;
}

export function resolveSalonStatus(
  data: Pick<SalonData, 'openingHours' | 'holidays'>,
  now: Date = salonNow(),
): SalonLiveStatus {
  const dateKey = localDateKey(now);
  const nowMinutes = minutesSinceMidnight(now);
  const holiday = holidayOn(data.holidays, dateKey);

  if (isClosedHoliday(holiday)) {
    const next = nextOpenSlot(data, addLocalDays(now, 1));
    return {
      kind: 'holiday',
      dateKey,
      holidayName: holiday.name,
      holidayNameHi: holiday.nameHi,
      openMinutes: next?.openMinutes,
      openTimeLabel: next?.openTimeLabel,
    };
  }

  const schedule = scheduleForDay(data.openingHours, weekdayKeyOf(now));
  if (!schedule.open) {
    const next = nextOpenSlot(data, addLocalDays(now, 1));
    return {
      kind: 'closed_today',
      dateKey,
      openMinutes: next?.openMinutes,
      openTimeLabel: next?.openTimeLabel,
    };
  }

  const openMinutes = parseClockToMinutes(schedule.startTime) ?? 10 * 60;
  const closeMinutes = parseClockToMinutes(schedule.endTime) ?? 20 * 60;
  const openTimeLabel = formatClockLabel(openMinutes);
  const closeTimeLabel = formatClockLabel(closeMinutes);

  if (nowMinutes < openMinutes) {
    return { kind: 'opens_at', dateKey, openMinutes, openTimeLabel, closeMinutes, closeTimeLabel };
  }

  if (nowMinutes >= closeMinutes) {
    const next = nextOpenSlot(data, now);
    return {
      kind: 'closed',
      dateKey,
      closeMinutes,
      closeTimeLabel,
      openMinutes: next?.openMinutes,
      openTimeLabel: next?.openTimeLabel,
    };
  }

  if (closeMinutes - nowMinutes <= CLOSING_SOON_MINUTES) {
    return { kind: 'closing_soon', dateKey, openMinutes, openTimeLabel, closeMinutes, closeTimeLabel };
  }

  return { kind: 'open', dateKey, openMinutes, openTimeLabel, closeMinutes, closeTimeLabel };
}

/** 30s tick + injected-clock events + tab visibility so the chip stays live. */
export function useTickingNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => salonNow());
  useEffect(() => {
    const tick = () => setNow(salonNow());
    const id = window.setInterval(tick, intervalMs);
    window.addEventListener(SALON_CLOCK_EVENT, tick);
    const onVisibility = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(SALON_CLOCK_EVENT, tick);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
  return now;
}
