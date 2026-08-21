/**
 * PHASE 10.5 — dated website announcements.
 *
 * Active + in-window + theme-matched announcements win. Expired and inactive
 * rows are never shown. When nothing dated is live we fall back to the
 * existing offer/package teaser, then the theme's default strip copy.
 */
import type {
  SalonAnnouncement,
  SalonAnnouncementCtaTarget,
  SalonAnnouncementKind,
  SalonData,
} from '../types';
import type { AppLocale } from './locale';
import { announcementOffer } from './siteStructure';
import { normalizeThemeId } from './themeServices';
import { localDateKey, salonNow } from './salonStatus';

export interface VisibleAnnouncement {
  source: 'dated' | 'offer' | 'default';
  id?: string;
  kind?: SalonAnnouncementKind;
  message: string;
  badge: string;
  ctaLabel?: string;
  ctaTarget?: SalonAnnouncementCtaTarget;
}

const KIND_RANK: Record<SalonAnnouncementKind, number> = {
  important: 0,
  festival: 1,
  seasonal: 2,
  custom: 3,
};

export function announcementIsLive(
  announcement: SalonAnnouncement,
  now: Date = salonNow(),
  themeId?: string,
): boolean {
  if (announcement.status !== 'active') return false;
  if (!announcement.message?.trim() && !announcement.messageHi?.trim()) return false;
  const key = localDateKey(now);
  if (announcement.startDate && key < announcement.startDate) return false;
  if (announcement.endDate && key > announcement.endDate) return false;
  if (announcement.themeId) {
    if (!themeId) return false;
    if (normalizeThemeId(announcement.themeId) !== normalizeThemeId(themeId)) return false;
  }
  return true;
}

function pickCopy(
  locale: AppLocale,
  en: string | undefined,
  hi: string | undefined,
  fallback: string,
): string {
  const chosen = locale === 'hi' ? (hi || en) : en;
  return (chosen || fallback).trim();
}

export function localizeAnnouncement(
  announcement: SalonAnnouncement,
  themeId: string,
  locale: AppLocale,
): Pick<VisibleAnnouncement, 'message' | 'badge' | 'ctaLabel' | 'ctaTarget' | 'kind' | 'id'> {
  const variant = announcement.variants?.[themeId] || announcement.variants?.[normalizeThemeId(themeId)];
  const message = pickCopy(
    locale,
    variant?.message || announcement.message,
    variant?.messageHi || announcement.messageHi,
    announcement.message,
  );
  const badge = pickCopy(
    locale,
    variant?.badge || announcement.badge,
    variant?.badgeHi || announcement.badgeHi,
    '',
  );
  const ctaLabel = pickCopy(
    locale,
    variant?.ctaLabel || announcement.ctaLabel,
    variant?.ctaLabelHi || announcement.ctaLabelHi,
    '',
  );
  return {
    id: announcement.id,
    kind: announcement.kind,
    message,
    badge,
    ctaLabel: ctaLabel || undefined,
    ctaTarget: announcement.ctaTarget,
  };
}

export function pickDatedAnnouncement(
  data: Pick<SalonData, 'announcements'>,
  themeId: string,
  now: Date = salonNow(),
): SalonAnnouncement | null {
  const live = (data.announcements || []).filter((item) => announcementIsLive(item, now, themeId));
  if (live.length === 0) return null;
  live.sort((a, b) => {
    const rank = (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
    if (rank !== 0) return rank;
    if (a.startDate === b.startDate) return a.id.localeCompare(b.id);
    return a.startDate < b.startDate ? 1 : -1;
  });
  return live[0];
}

export function resolveVisibleAnnouncement(
  data: SalonData,
  themeId: string,
  locale: AppLocale,
  now: Date = salonNow(),
  fallback?: { announceDefault: string; announceBadge: string },
): VisibleAnnouncement {
  const dated = pickDatedAnnouncement(data, themeId, now);
  if (dated) {
    const copy = localizeAnnouncement(dated, themeId, locale);
    return {
      source: 'dated',
      id: copy.id,
      kind: copy.kind,
      message: copy.message,
      badge: copy.badge,
      ctaLabel: copy.ctaLabel,
      ctaTarget: copy.ctaTarget,
    };
  }

  const offer = announcementOffer(data);
  if (offer) {
    return {
      source: 'offer',
      message: offer.title,
      badge: offer.badge || fallback?.announceBadge || '',
    };
  }

  return {
    source: 'default',
    message: fallback?.announceDefault || '',
    badge: fallback?.announceBadge || '',
  };
}
