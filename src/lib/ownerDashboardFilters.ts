/**
 * PHASE 17.9 — shared Owner Dashboard filters.
 *
 * Options and matches come only from already-authorized booking/payment rows.
 * This module adds no storage, schema, ids or alternate data access path.
 */
import { readSalonBookings } from './bookingManagement';
import type { BookingActorContext, BookingManagePermission } from './bookingManagement';
import type { BookingStatus, PaymentRecord, PaymentStatus } from './siteBookingPayment';
import { localDateKey, salonNow } from './salonStatus';

export type OwnerDateRange = 'all' | 'today' | '7d' | '30d';
export const OWNER_DATE_RANGES: OwnerDateRange[] = ['all', 'today', '7d', '30d'];

export interface OwnerDashboardFilterState {
  dateRange: OwnerDateRange;
  bookingStatus: 'all' | BookingStatus;
  paymentStatus: 'all' | PaymentStatus;
  serviceId: 'all' | string;
}

export const DEFAULT_OWNER_FILTERS: OwnerDashboardFilterState = {
  dateRange: 'all',
  bookingStatus: 'all',
  paymentStatus: 'all',
  serviceId: 'all',
};

export interface OwnerServiceFilterOption {
  id: string;
  name: string;
}

export interface OwnerDashboardFilterOptions {
  bookingStatuses: BookingStatus[];
  paymentStatuses: PaymentStatus[];
  services: OwnerServiceFilterOption[];
}

export type OwnerFilterOptionsResult =
  | { ok: true; records: PaymentRecord[]; options: OwnerDashboardFilterOptions }
  | { ok: false; reason: BookingManagePermission };

const BOOKING_STATUS_ORDER: BookingStatus[] = [
  'pending_payment', 'confirmed', 'pay_at_salon', 'completed', 'cancelled', 'no_show', 'failed',
];
const PAYMENT_STATUS_ORDER: PaymentStatus[] = [
  'paid', 'pending', 'unpaid', 'failed', 'cancelled', 'refunded',
];

export function ownerFiltersActive(filters: OwnerDashboardFilterState): boolean {
  return filters.dateRange !== 'all'
    || filters.bookingStatus !== 'all'
    || filters.paymentStatus !== 'all'
    || filters.serviceId !== 'all';
}

export function ownerActiveFilterCount(filters: OwnerDashboardFilterState): number {
  return [filters.dateRange, filters.bookingStatus, filters.paymentStatus, filters.serviceId]
    .filter((value) => value !== 'all').length;
}

export function ownerFilterOptionsFromRecords(records: readonly PaymentRecord[]): OwnerDashboardFilterOptions {
  const bookingSet = new Set(records.map((record) => record.bookingStatus));
  const paymentSet = new Set(records.map((record) => record.paymentStatus));
  const services = new Map<string, string>();
  for (const record of records) {
    if (record.services?.length) {
      for (const line of record.services) {
        if (line.serviceId && line.serviceName) services.set(line.serviceId, line.serviceName);
      }
    } else if (record.serviceId && record.serviceName) {
      services.set(record.serviceId, record.serviceName);
    }
  }
  return {
    bookingStatuses: BOOKING_STATUS_ORDER.filter((status) => bookingSet.has(status)),
    paymentStatuses: PAYMENT_STATUS_ORDER.filter((status) => paymentSet.has(status)),
    services: [...services.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  };
}

export function readOwnerFilterOptions(
  actor: BookingActorContext,
  businessIds: readonly string[],
  themeIds: readonly string[],
): OwnerFilterOptionsResult {
  const seen = new Set<string>();
  const records: PaymentRecord[] = [];
  for (const businessId of businessIds) {
    for (const themeId of themeIds) {
      const result = readSalonBookings(actor, businessId, themeId);
      if (result.ok !== true) return { ok: false, reason: result.reason };
      for (const record of result.records) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        records.push(record);
      }
    }
  }
  return { ok: true, records, options: ownerFilterOptionsFromRecords(records) };
}

export type OwnerFilterDateMode = 'appointment' | 'created' | 'event';

function localStart(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function appointmentDateMatches(dateKey: string, range: OwnerDateRange, now: Date): boolean {
  if (range === 'all') return true;
  const today = localDateKey(now);
  if (range === 'today') return dateKey === today;
  const days = range === '7d' ? 7 : 30;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() + days);
  return dateKey >= today && dateKey < localDateKey(end);
}

function timestampMatches(timestamp: number, range: OwnerDateRange, now: Date): boolean {
  if (range === 'all') return true;
  const today = localStart(now);
  const end = today + 24 * 60 * 60 * 1000;
  if (range === 'today') return timestamp >= today && timestamp < end;
  const days = range === '7d' ? 7 : 30;
  const start = today - (days - 1) * 24 * 60 * 60 * 1000;
  return timestamp >= start && timestamp < end;
}

export function recordHasService(record: PaymentRecord, serviceId: string): boolean {
  if (serviceId === 'all') return true;
  if (record.services?.length) return record.services.some((line) => line.serviceId === serviceId);
  return record.serviceId === serviceId;
}

export function recordMatchesOwnerFilters(
  record: PaymentRecord,
  filters: OwnerDashboardFilterState,
  dateMode: Exclude<OwnerFilterDateMode, 'event'> = 'appointment',
  now: Date = salonNow(),
): boolean {
  if (filters.bookingStatus !== 'all' && record.bookingStatus !== filters.bookingStatus) return false;
  if (filters.paymentStatus !== 'all' && record.paymentStatus !== filters.paymentStatus) return false;
  if (!recordHasService(record, filters.serviceId)) return false;
  return dateMode === 'created'
    ? timestampMatches(record.createdAt, filters.dateRange, now)
    : appointmentDateMatches(record.dateKey, filters.dateRange, now);
}

export function eventTimestampMatchesOwnerDateRange(
  timestamp: number,
  range: OwnerDateRange,
  now: Date = salonNow(),
): boolean {
  return timestampMatches(timestamp, range, now);
}

export function filterOwnerRecords(
  records: readonly PaymentRecord[],
  filters: OwnerDashboardFilterState,
  dateMode: Exclude<OwnerFilterDateMode, 'event'> = 'appointment',
  now: Date = salonNow(),
): PaymentRecord[] {
  return records.filter((record) => recordMatchesOwnerFilters(record, filters, dateMode, now));
}
