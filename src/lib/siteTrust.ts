/**
 * PHASE 12.1 — TRUST & SALON STATS (single engine for all five themes).
 *
 * Builds the "Trust / Stats" strip that sits directly below the hero.
 * It reads ONLY real, configured data and never fabricates a number:
 *
 *   - rating         — average of APPROVED customer reviews (Phase 10.8).
 *   - reviewCount    — number of approved reviews (Phase 10.8).
 *   - yearsExperience— `SalonData.yearsOfExperience`, only when the owner set it.
 *   - happyCustomers — `SalonData.happyCustomers`, only when the owner set it.
 *   - services       — count of the owner's active service catalog.
 *   - salonStatus    — live open/closed status from the existing Phase 10.5
 *                      engine, only when opening hours / holidays are configured.
 *
 * Every stat is nullable by omission: a stat with no real data simply does not
 * appear, so the site never shows a fake rating, count, year or volume.
 *
 * No database, service or booking architecture is touched — this reads the
 * existing `SalonData` shape plus the Phase 10.5 / 10.8 engines already in use.
 */
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import type { AppLocale } from './locale';
import {
  resolveSalonStatus,
  salonNow,
  weekdayKeyOf,
  scheduleForDay,
} from './salonStatus';
import type { SalonLiveStatus, SalonStatusKind } from './salonStatus';
import { publicReviews, ratingSummary, reviewBusinessId } from './siteReviews';
import { activeCatalogItems } from './siteStructure';

export type TrustStatKind =
  | 'rating'
  | 'reviewCount'
  | 'yearsExperience'
  | 'happyCustomers'
  | 'services'
  | 'salonStatus';

export interface TrustStat {
  kind: TrustStatKind;
  /** Customer-facing value string (already locale-formatted). */
  value: string;
  /** Optional secondary line (rating scale, opening hours, next open time). */
  detail: string | null;
  /** Live status kind for the salon-status card (drives its status dot). */
  statusKind?: SalonStatusKind;
}

/** Canonical display order — matches the requirement's stat list. */
export const TRUST_STAT_KINDS: readonly TrustStatKind[] = [
  'rating',
  'reviewCount',
  'yearsExperience',
  'happyCustomers',
  'services',
  'salonStatus',
];

const STATUS_SHORT_EN: Record<SalonStatusKind, string> = {
  open: 'Open',
  closing_soon: 'Closing Soon',
  opens_at: 'Opens Soon',
  closed: 'Closed',
  closed_today: 'Closed Today',
  holiday: 'Holiday',
};

const STATUS_SHORT_HI: Record<SalonStatusKind, string> = {
  open: 'खुला',
  closing_soon: 'जल्द बंद',
  opens_at: 'जल्द खुलेगा',
  closed: 'बंद',
  closed_today: 'आज बंद',
  holiday: 'अवकाश',
};

/** Compact card value for the live-status stat (detail carries the specifics). */
export function statusShortLabel(kind: SalonStatusKind, locale: AppLocale): string {
  return (locale === 'hi' ? STATUS_SHORT_HI : STATUS_SHORT_EN)[kind];
}

/** Locale-aware grouping for counts (Indian digit grouping, matching INR salon context). */
function formatCount(value: number, locale: AppLocale): string {
  const n = Math.round(value);
  try {
    return new Intl.NumberFormat(locale === 'hi' ? 'hi-IN' : 'en-IN').format(n);
  } catch {
    return String(n);
  }
}

/** Owner-configured years of experience; null when absent, non-integer or ≤ 0. */
function configuredYears(data: SalonData): number | null {
  const value = (data as SalonData & { yearsOfExperience?: unknown }).yearsOfExperience;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** Owner-configured happy-customers figure; null when absent, non-integer or ≤ 0. */
function configuredHappyCustomers(data: SalonData): number | null {
  const value = (data as SalonData & { happyCustomers?: unknown }).happyCustomers;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** Whether the salon actually configured opening info (hours or holidays). */
export function hasConfiguredOpening(data: SalonData): boolean {
  const hours = data.openingHours as unknown;
  if (hours && typeof hours === 'object' && Object.keys(hours as object).length > 0) return true;
  return Array.isArray(data.holidays) && data.holidays.length > 0;
}

/**
 * Secondary line for the salon-status stat:
 * today's hours when relevant, the next opening time otherwise, holiday name.
 */
export function salonStatusDetail(
  data: SalonData,
  status: SalonLiveStatus,
  now: Date,
  locale: AppLocale,
): string | null {
  if (status.kind === 'holiday') {
    const name = locale === 'hi'
      ? (status.holidayNameHi || status.holidayName)
      : status.holidayName;
    return name || null;
  }
  if (status.kind === 'open' || status.kind === 'closing_soon' || status.kind === 'opens_at') {
    const schedule = scheduleForDay(data.openingHours, weekdayKeyOf(now));
    const start = (schedule.startTime || '').trim();
    const end = (schedule.endTime || '').trim();
    if (start && end) return `${start} – ${end}`;
  }
  if (status.openTimeLabel) {
    return (locale === 'hi' ? 'खुलेगा ' : 'Opens ') + status.openTimeLabel;
  }
  return null;
}

/**
 * Resolves the trust stats for one theme from real data only.
 * Returns an empty array when the salon has supplied nothing to show.
 */
export function trustStats(
  themeId: SiteHeaderThemeId,
  data: SalonData,
  now: Date = salonNow(),
  locale: AppLocale = 'en',
): TrustStat[] {
  const items: TrustStat[] = [];

  let summary: { average: number; count: number } | null = null;
  try {
    const resolved = ratingSummary(publicReviews(reviewBusinessId(data), themeId));
    if (resolved.count > 0) summary = resolved;
  } catch {
    summary = null;
  }

  if (summary) {
    items.push({ kind: 'rating', value: summary.average.toFixed(1), detail: null });
    items.push({ kind: 'reviewCount', value: formatCount(summary.count, locale), detail: null });
  }

  const years = configuredYears(data);
  if (years !== null) {
    items.push({ kind: 'yearsExperience', value: formatCount(years, locale), detail: null });
  }

  const happy = configuredHappyCustomers(data);
  if (happy !== null) {
    items.push({ kind: 'happyCustomers', value: formatCount(happy, locale), detail: null });
  }

  const services = activeCatalogItems(data.services);
  if (services.length > 0) {
    items.push({ kind: 'services', value: formatCount(services.length, locale), detail: null });
  }

  if (hasConfiguredOpening(data)) {
    const status = resolveSalonStatus(data, now);
    items.push({
      kind: 'salonStatus',
      value: statusShortLabel(status.kind, locale),
      detail: salonStatusDetail(data, status, now, locale),
      statusKind: status.kind,
    });
  }

  return items;
}
