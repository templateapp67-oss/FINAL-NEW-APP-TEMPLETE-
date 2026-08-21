/**
 * PHASE 17.5 — OWNER CUSTOMER DIRECTORY · data layer.
 *
 * This is a projection over the EXISTING booking/customer snapshots. It does
 * not create a customer store, row, id, table or profile. A person appears
 * only when at least one real booking belonging to the authenticated owner's
 * salon exists.
 *
 * Ownership remains the existing chain resolved by OwnerDashboard:
 * auth.users → organization_members (active owner) → salons.organization_id
 * → salons.id. Every tenant read passes through `readSalonBookings`, which
 * re-checks the actor and session-derived business scope. The draft database
 * schema's `customers`/`bookings` RLS supplies the equivalent database boundary
 * once that schema is applied. Staff membership is not an ownership source.
 */
import {
  bookingServiceNames,
  readSalonBookings,
} from './bookingManagement';
import type { BookingActorContext, BookingManagePermission } from './bookingManagement';
import type { BookingStatus, PaymentRecord } from './siteBookingPayment';
import { recordMatchesOwnerFilters } from './ownerDashboardFilters';
import type { OwnerDashboardFilterState } from './ownerDashboardFilters';

export interface CustomerBookingHistoryEntry {
  /** Existing booking row/reference fields only. */
  id: string;
  bookingId: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  serviceNames: string[];
  bookingStatus: BookingStatus;
  createdAt: number;
  updatedAt: number;
}

export interface OwnerCustomer {
  /** Existing customer identity stamped on the booking; never displayed. */
  customerId: string;
  name: string;
  phone: string;
  email: string | null;
  totalBookings: number;
  recentBooking: CustomerBookingHistoryEntry;
  bookingHistory: CustomerBookingHistoryEntry[];
  /** Existing record timestamp used for useful recent-activity ordering. */
  recentActivityAt: number;
}

export type OwnerCustomersResult =
  | { ok: true; customers: OwnerCustomer[] }
  | { ok: false; reason: BookingManagePermission };

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Most recently created booking first, with deterministic real-field ties. */
export function sortCustomerBookingHistory(
  entries: readonly CustomerBookingHistoryEntry[],
): CustomerBookingHistoryEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    return a.bookingId.localeCompare(b.bookingId);
  });
}

function toHistoryEntry(record: PaymentRecord): CustomerBookingHistoryEntry {
  return {
    id: record.id,
    bookingId: record.bookingId,
    dateKey: record.dateKey,
    startMinutes: record.startMinutes,
    endMinutes: record.endMinutes,
    serviceNames: bookingServiceNames(record),
    bookingStatus: record.bookingStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Group already-authorized booking rows by their EXISTING customer identity.
 * Contact fields use the newest non-empty snapshot, so an older available
 * email is not hidden merely because a later booking omitted this optional
 * field. No values are inferred from phone/name and no synthetic identity is
 * generated.
 */
export function customersFromBookingRecords(records: readonly PaymentRecord[]): OwnerCustomer[] {
  const groups = new Map<string, PaymentRecord[]>();
  for (const record of records) {
    const customerId = clean(record.customerId);
    // Persisted booking records always carry this id. Malformed rows are
    // ignored rather than merged into an invented "unknown" customer.
    if (!customerId) continue;
    const current = groups.get(customerId);
    if (current) current.push(record);
    else groups.set(customerId, [record]);
  }

  const customers: OwnerCustomer[] = [];
  for (const [customerId, rows] of groups) {
    const newestRows = rows.slice().sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    });
    const history = sortCustomerBookingHistory(newestRows.map(toHistoryEntry));
    if (history.length === 0) continue;

    const firstContact = (field: 'name' | 'mobile' | 'email'): string => {
      for (const row of newestRows) {
        const value = clean(row.customer?.[field]);
        if (value) return value;
      }
      return '';
    };

    customers.push({
      customerId,
      name: firstContact('name'),
      phone: firstContact('mobile'),
      email: firstContact('email') || null,
      totalBookings: history.length,
      recentBooking: history[0],
      bookingHistory: history,
      recentActivityAt: Math.max(...newestRows.map((row) => row.updatedAt)),
    });
  }

  return customers.sort((a, b) => {
    if (a.recentActivityAt !== b.recentActivityAt) return b.recentActivityAt - a.recentActivityAt;
    if (a.recentBooking.createdAt !== b.recentBooking.createdAt) {
      return b.recentBooking.createdAt - a.recentBooking.createdAt;
    }
    return a.customerId.localeCompare(b.customerId);
  });
}

/**
 * Customers with real booking history for the owner's OWN salon only.
 * A refusal on any session-derived tenant key refuses the complete directory;
 * it never degrades into a partial result that looks authorized.
 */
export function readOwnerCustomers(
  actor: BookingActorContext,
  businessIds: readonly string[],
  themeIds: readonly string[],
  filters?: OwnerDashboardFilterState,
): OwnerCustomersResult {
  const seen = new Set<string>();
  const records: PaymentRecord[] = [];

  for (const businessId of businessIds) {
    for (const themeId of themeIds) {
      const result = readSalonBookings(actor, businessId, themeId);
      if (result.ok !== true) return { ok: false, reason: result.reason };
      for (const record of result.records) {
        if (filters && !recordMatchesOwnerFilters(record, filters, 'appointment')) continue;
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        records.push(record);
      }
    }
  }

  return { ok: true, customers: customersFromBookingRecords(records) };
}

/** Search uses only contact and booking data already present in authorized rows. */
export function filterOwnerCustomers(
  customers: readonly OwnerCustomer[],
  query: string,
): OwnerCustomer[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return customers.slice();
  return customers.filter((customer) => {
    const haystack = [
      customer.name,
      customer.phone,
      customer.email ?? '',
      ...customer.bookingHistory.flatMap((booking) => [
        booking.bookingId,
        ...booking.serviceNames,
      ]),
    ].join('\n').toLocaleLowerCase();
    return haystack.includes(needle);
  });
}
