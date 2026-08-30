import type { OwnerBookingItem, OwnerBookingServiceLine } from './authoritativeBooking';
import type {
  PaymentRecord,
  PaymentServiceLine,
} from './siteBookingPayment';
import { isSiteHeaderTheme } from './siteNavigation';
import { canonicalBookingStatus, canonicalPaymentStatus } from './canonicalBookingStatus';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Owner booking response is missing ${field}.`);
  }
  return value.trim();
}

function finiteMoney(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Owner booking response has invalid ${field}.`);
  }
  return value;
}

function serviceLine(line: OwnerBookingServiceLine): PaymentServiceLine {
  const serviceId = requiredString(line.serviceId, 'serviceLines.serviceId');
  const serviceName = requiredString(line.serviceName, 'serviceLines.serviceName');
  const quantity = Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 1;
  const pricePaise = finiteMoney(line.pricePaise, 'serviceLines.pricePaise');
  const durationMinutes = Number(line.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('Owner booking response has invalid serviceLines.durationMinutes.');
  }
  return {
    serviceId,
    serviceName,
    price: (pricePaise * quantity) / 100,
    durationMinutes: durationMinutes * quantity,
  };
}

/**
 * Adapts canonical API rows to the dashboard's existing read-only projection.
 * It does not persist them and rejects missing/unknown database facts rather
 * than filling the UI with sample or fallback business data.
 */
export function ownerBookingItemToDashboardRecord(item: OwnerBookingItem): PaymentRecord {
  const id = requiredString(item.id || item.bookingId, 'bookingId');
  const businessId = requiredString(item.salonId, 'salonId');
  const customerId = requiredString(item.customerId, 'customerId');
  const themeId = requiredString(item.themeId, 'themeId');
  if (!isSiteHeaderTheme(themeId)) {
    throw new Error(`Owner booking response has unsupported themeId: ${themeId}.`);
  }

  const startMinutes = Number(item.startMinutes);
  const endMinutes = Number(item.endMinutes);
  if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes >= 24 * 60) {
    throw new Error('Owner booking response has invalid startMinutes.');
  }
  if (!Number.isInteger(endMinutes) || endMinutes <= startMinutes || endMinutes > 24 * 60) {
    throw new Error('Owner booking response has invalid endMinutes.');
  }

  const services = Array.isArray(item.serviceLines) ? item.serviceLines.map(serviceLine) : [];
  const names = Array.isArray(item.serviceNames)
    ? item.serviceNames.filter((name): name is string => typeof name === 'string' && Boolean(name.trim())).map((name) => name.trim())
    : [];
  const serviceName = services[0]?.serviceName || names[0] || '';
  const serviceId = services[0]?.serviceId || '';
  if (!serviceName || !serviceId) {
    throw new Error('Owner booking response has no canonical service line.');
  }

  const createdAt = Date.parse(requiredString(item.createdAt, 'createdAt'));
  if (!Number.isFinite(createdAt)) throw new Error('Owner booking response has invalid createdAt.');

  const baseAmount = finiteMoney(item.totalAmount, 'totalAmount');
  const amountDue = finiteMoney(item.advanceAmount, 'advanceAmount');
  const remainingAmount = finiteMoney(item.remainingAmount, 'remainingAmount');
  const paymentOption = amountDue <= 0
    ? 'pay_at_salon'
    : amountDue >= baseAmount ? 'full' : 'advance';

  return {
    id,
    bookingId: requiredString(item.bookingId, 'bookingId'),
    idempotencyKey: id,
    businessId,
    themeId,
    customerId,
    customer: {
      name: typeof item.customerName === 'string' ? item.customerName.trim() : '',
      mobile: typeof item.customerPhone === 'string' ? item.customerPhone.trim() : '',
      ...(typeof item.customerEmail === 'string' && item.customerEmail.trim()
        ? { email: item.customerEmail.trim() }
        : {}),
    },
    serviceId,
    serviceName,
    services,
    dateKey: requiredString(item.dateKey, 'dateKey'),
    startMinutes,
    endMinutes,
    baseAmount,
    amountDue,
    remainingAmount,
    currency: requiredString(item.currency, 'currency'),
    paymentOption,
    paymentMethod: null,
    paymentStatus: canonicalPaymentStatus(item.paymentStatus),
    bookingStatus: canonicalBookingStatus(item.status),
    staffId: typeof item.staffId === 'string' ? item.staffId : null,
    staffName: typeof item.staffName === 'string' && item.staffName.trim() ? item.staffName.trim() : null,
    createdAt,
    updatedAt: createdAt,
    payAtSalon: paymentOption === 'pay_at_salon',
    // HOME SERVICE — server-verified fulfillment facts for owner surfaces.
    ...(item.fulfillmentMode === 'home_service'
      ? {
          fulfillment: {
            mode: 'home_service' as const,
            ...(typeof item.serviceAddress === 'string' && item.serviceAddress.trim()
              ? { address: item.serviceAddress.trim() }
              : {}),
            ...(typeof item.serviceDistanceKm === 'number' && Number.isFinite(item.serviceDistanceKm)
              ? { distanceKm: item.serviceDistanceKm }
              : {}),
            ...(typeof item.homeServiceChargePaise === 'number' && item.homeServiceChargePaise > 0
              ? { homeServiceCharge: Math.round(item.homeServiceChargePaise / 100) }
              : {}),
          },
        }
      : {}),
  };
}

export function ownerBookingItemsToDashboardRecords(items: readonly OwnerBookingItem[]): PaymentRecord[] {
  return items.map(ownerBookingItemToDashboardRecord);
}
