/**
 * OFFLINE BOOKING FALLBACK — guest website bookings.
 *
 * When the live booking API is unreachable (no backend / no network), the
 * Confirm Booking flow must still complete: the request is persisted on the
 * visitor's device (localStorage) with a local reference, and the salon
 * confirms by phone/WhatsApp. The banner in the booking modal ("Live
 * availability is offline right now … Your request will still be saved") is
 * truthful because of this module.
 *
 * Records are keyed per salon slug and capped so storage can never grow
 * unbounded. Nothing here touches the network.
 */
import { safeGetItem, safeSetItem } from './safeStorage';

export interface OfflineBookingRecord {
  id: string;
  /** Local reference shown to the visitor (e.g. NX-OFF-M3K2J9). */
  reference: string;
  salonSlug: string;
  salonName: string;
  serviceName: string;
  serviceId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  customerName: string;
  customerPhone: string;
  note?: string;
  requestedAt: string;
}

const MAX_RECORDS = 25;

function keyFor(salonSlug: string): string {
  return `nexora_offline_bookings:${(salonSlug || 'unknown').trim().toLowerCase()}`;
}

function makeReference(): string {
  return `NX-OFF-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
}

/**
 * Persists a booking request that could not reach the live API.
 * Returns the saved record, or null when storage itself is unavailable.
 */
export function saveOfflineBooking(
  entry: Omit<OfflineBookingRecord, 'id' | 'reference' | 'requestedAt'> & { requestedAt?: string },
): OfflineBookingRecord | null {
  const record: OfflineBookingRecord = {
    ...entry,
    id: `off-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    reference: makeReference(),
    requestedAt: entry.requestedAt || new Date().toISOString(),
  };
  try {
    const key = keyFor(record.salonSlug);
    const raw = safeGetItem(key);
    const list: OfflineBookingRecord[] = raw ? (JSON.parse(raw) as OfflineBookingRecord[]) : [];
    list.unshift(record);
    safeSetItem(key, JSON.stringify(list.slice(0, MAX_RECORDS)));
    return record;
  } catch {
    return null;
  }
}

/** Reads the offline booking queue for a salon (newest first). */
export function listOfflineBookings(salonSlug: string): OfflineBookingRecord[] {
  try {
    const raw = safeGetItem(keyFor(salonSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineBookingRecord[]) : [];
  } catch {
    return [];
  }
}
