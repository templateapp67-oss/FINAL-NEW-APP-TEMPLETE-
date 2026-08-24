/**
 * Template architecture contract.
 *
 * A template is a presentation attached to an existing salon. It never owns
 * or copies tenant business data. The database switch authority is the
 * authenticated, salon-resolving RPC below.
 */

import type { SalonData } from '../types';
import {
  TEMPLATE_SWITCH_PROTECTED_DOMAINS,
  snapshotTemplateSwitchProtectedData,
} from './templateSwitchInvariants';

export const CORE_BUSINESS_TABLES = [
  'organizations',
  'organization_members',
  'profiles',
  'salons',
  'business_locations',
  'services',
  'service_price_variants',
  'products',
  'bookings',
  'payment_orders',
  'payments',
] as const;

export const PRESENTATION_TABLES = ['themes', 'salon_public_websites'] as const;
export const TEMPLATE_SWITCH_RPC = 'set_owner_salon_template' as const;
export { TEMPLATE_SWITCH_PROTECTED_DOMAINS };

/**
 * A fail-closed snapshot of all in-memory business/content fields. Products,
 * customers, bookings, and payments are canonical database entities and are
 * covered by the SQL regression test rather than duplicated in SalonData.
 */
export function coreBusinessSnapshot(data: SalonData): Record<string, unknown> {
  return snapshotTemplateSwitchProtectedData(data);
}

export function switchPreservedCoreBusiness(before: SalonData, after: SalonData): boolean {
  return JSON.stringify(coreBusinessSnapshot(before)) === JSON.stringify(coreBusinessSnapshot(after));
}
