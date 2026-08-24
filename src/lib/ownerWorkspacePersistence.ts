/**
 * Owner workspace persistence.
 *
 * Authoritative business/template state lives in Supabase
 * (`salons` + `salon_public_websites.config` via persistOwnerBusinessSetup).
 * Browser storage is only a disposable UI cache and must never be read back
 * as the owner's saved salon after a refresh or a new login.
 */
import type { SalonData } from '../types';
import { persistOwnerBusinessSetup } from './ownerBusinessSetup';
import { safeRemoveItem } from './safeStorage';

export const OWNER_ONBOARDING_CACHE_KEY = 'nexora_onboarding_state';
export const OWNER_DASHBOARD_TAB_CACHE_KEY = 'nexora_dashboard_tab';

/** Drop local wizard mirrors so they cannot impersonate a saved salon. */
export function clearOwnerBrowserWorkspaceCache(): void {
  safeRemoveItem(OWNER_ONBOARDING_CACHE_KEY);
  safeRemoveItem(OWNER_DASHBOARD_TAB_CACHE_KEY);
}

/** Write the current in-memory draft to the existing owner tables/RPC path. */
export async function persistOwnerWorkspace(data: SalonData): Promise<{
  salonId: string;
  slug?: string;
} | { error: string }> {
  return persistOwnerBusinessSetup(data);
}
