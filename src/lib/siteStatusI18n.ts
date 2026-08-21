/**
 * PHASE 10.5 copy — live salon status + announcement kind labels.
 * Phase 10.2 `siteI18n.ts` is left untouched.
 */
import type { AppLocale } from './locale';
import type { SalonAnnouncementKind } from '../types';
import type { SalonLiveStatus } from './salonStatus';

const STATUS_EN = {
  open: 'Open Now',
  closing_soon: 'Closing Soon',
  closed: 'Closed',
  closed_today: 'Closed Today',
  holiday: 'Holiday',
  opens_at: 'Opens at {time}',
} as const;

const STATUS_HI: Record<keyof typeof STATUS_EN, string> = {
  open: 'अभी खुला है',
  closing_soon: 'जल्द बंद होगा',
  closed: 'बंद',
  closed_today: 'आज बंद है',
  holiday: 'अवकाश',
  opens_at: '{time} बजे खुलेगा',
};

const KIND_EN: Record<SalonAnnouncementKind, string> = {
  festival: 'Festival',
  seasonal: 'Seasonal',
  important: 'Notice',
  custom: 'Update',
};

const KIND_HI: Record<SalonAnnouncementKind, string> = {
  festival: 'त्योहार',
  seasonal: 'सीज़न',
  important: 'सूचना',
  custom: 'अपडेट',
};

const CTA_EN = {
  booking: 'Book now',
  offers: 'View offers',
  contact: 'Contact',
} as const;

const CTA_HI: Record<keyof typeof CTA_EN, string> = {
  booking: 'अभी बुक करें',
  offers: 'ऑफ़र देखें',
  contact: 'संपर्क',
};

export function announcementKindLabel(kind: SalonAnnouncementKind | undefined, locale: AppLocale): string {
  if (!kind) return '';
  return locale === 'hi' ? KIND_HI[kind] : KIND_EN[kind];
}

export function announcementCtaFallback(
  target: keyof typeof CTA_EN | undefined,
  locale: AppLocale,
): string {
  if (!target) return '';
  return locale === 'hi' ? CTA_HI[target] : CTA_EN[target];
}

export function salonStatusLabel(status: SalonLiveStatus, locale: AppLocale): string {
  const table = locale === 'hi' ? STATUS_HI : STATUS_EN;
  if (status.kind === 'opens_at') {
    return table.opens_at.replace('{time}', status.openTimeLabel || '');
  }
  if (status.kind === 'holiday') {
    const name = locale === 'hi'
      ? (status.holidayNameHi || status.holidayName)
      : status.holidayName;
    return name ? `${table.holiday} · ${name}` : table.holiday;
  }
  return table[status.kind];
}
