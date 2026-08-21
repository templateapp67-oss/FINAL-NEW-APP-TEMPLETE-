import type { CSSProperties, ReactNode } from 'react';
import type { SalonData } from '../types';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import SiteSalonStatus from './SiteSalonStatus';
import { resolveVisibleAnnouncement } from '../lib/salonAnnouncements';
import { useTickingNow } from '../lib/salonStatus';
import { announcementCtaFallback, announcementKindLabel } from '../lib/siteStatusI18n';
import { openSiteBooking } from '../lib/siteBooking';
import { buildSiteNavItems, scrollToSiteSection } from '../lib/siteNavigation';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { structureText } from '../lib/siteStructureI18n';
import { sectionProps } from '../lib/siteStructure';
import {
  BARBER_SURFACES,
  BEAUTY_SPA_SURFACES,
  FAMILY_SURFACES,
  HAIR_STUDIO_SURFACES,
  NAIL_LASH_SURFACES,
  surfacesOf,
} from '../lib/themeSurfaces';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
}

function handleAnnouncementCta(themeId: SiteHeaderThemeId, data: SalonData, target: string | undefined): void {
  if (target === 'booking') {
    openSiteBooking();
    return;
  }
  if (target === 'offers') {
    const offers = buildSiteNavItems(themeId, data).find((item) => item.key === 'offers');
    scrollToSiteSection(offers?.targetId || 'section-offers');
    return;
  }
  if (target === 'contact') {
    scrollToSiteSection('section-contact');
  }
}

function BarberBar({ children, gold }: { children: ReactNode; gold: string }) {
  return (
    <div
      {...sectionProps('announcement', 'ready')}
      data-testid="site-announcement-bar"
      data-theme="barber_mens_grooming"
      className="site-section px-4 py-2.5 flex flex-wrap items-center justify-center gap-2 text-center"
      style={{ backgroundColor: gold, color: '#141414' }}
    >
      {children}
    </div>
  );
}

/**
 * Themed announcement strip + compact live status.
 * The announcement section itself is always rendered (Phase 10.3 order).
 */
export default function SiteAnnouncementBar({ themeId, data }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const now = useTickingNow();
  const S = structureText(themeId, locale);
  const visible = resolveVisibleAnnouncement(data, themeId, locale, now, {
    announceDefault: S.announceDefault,
    announceBadge: S.announceBadge,
  });
  const badge = visible.badge || announcementKindLabel(visible.kind, locale) || S.announceBadge;
  const ctaLabel = visible.ctaLabel || announcementCtaFallback(visible.ctaTarget, locale);
  const showCta = Boolean(visible.ctaTarget && ctaLabel);

  const onCta = () => handleAnnouncementCta(themeId, data, visible.ctaTarget);

  const status = (
    <SiteSalonStatus themeId={themeId} data={data} placement="announcement" compact />
  );

  const message = (
    <p data-testid="site-announcement-message" className="min-w-0 break-words">
      {visible.message}
    </p>
  );

  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return (
      <BarberBar gold={t.gold}>
        <span
          data-testid="site-announcement-badge"
          data-announcement-kind={visible.kind || visible.source}
          className="text-[9px] font-black uppercase tracking-[0.22em] px-2 py-1"
          style={{ backgroundColor: '#141414', color: t.gold }}
        >
          {badge}
        </span>
        <span className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.14em]">{message}</span>
        {showCta && (
          <button
            type="button"
            data-testid="site-announcement-cta"
            data-open-booking={visible.ctaTarget === 'booking' ? 'true' : undefined}
            onClick={onCta}
            className="text-[9px] font-black uppercase tracking-[0.18em] px-2.5 py-1"
            style={{ backgroundColor: '#141414', color: t.gold }}
          >
            {ctaLabel}
          </button>
        )}
        {status}
      </BarberBar>
    );
  }

  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return (
      <div
        {...sectionProps('announcement', 'ready')}
        data-testid="site-announcement-bar"
        data-theme={themeId}
        className="site-section px-4 py-2.5 flex flex-wrap items-center justify-center gap-2 text-center border-b"
        style={{ backgroundColor: t.paperDeep, borderColor: t.line, color: t.ink }}
      >
        <span
          data-testid="site-announcement-badge"
          data-announcement-kind={visible.kind || visible.source}
          className="text-[9px] uppercase tracking-[0.28em] font-semibold"
          style={{ color: t.roseDeep }}
        >
          {badge}
        </span>
        <span className="text-[11px] font-medium">{message}</span>
        {showCta && (
          <button
            type="button"
            data-testid="site-announcement-cta"
            data-open-booking={visible.ctaTarget === 'booking' ? 'true' : undefined}
            onClick={onCta}
            className="text-[9px] uppercase tracking-[0.2em] font-semibold underline underline-offset-4"
            style={{ color: t.roseDeep }}
          >
            {ctaLabel}
          </button>
        )}
        {status}
      </div>
    );
  }

  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return (
      <div
        {...sectionProps('announcement', 'ready')}
        data-testid="site-announcement-bar"
        data-theme={themeId}
        className="site-section px-4 py-2.5 flex flex-wrap items-center justify-center gap-2 text-center"
        style={{ backgroundColor: t.emerald, color: '#ffffff' }}
      >
        <span
          data-testid="site-announcement-badge"
          data-announcement-kind={visible.kind || visible.source}
          className="text-[9px] uppercase tracking-[0.22em] font-semibold px-2 py-1 rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}
        >
          {badge}
        </span>
        <span className="text-[11px] font-medium">{message}</span>
        {showCta && (
          <button
            type="button"
            data-testid="site-announcement-cta"
            data-open-booking={visible.ctaTarget === 'booking' ? 'true' : undefined}
            onClick={onCta}
            className="text-[9px] uppercase tracking-[0.18em] font-semibold px-3 py-1 rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
          >
            {ctaLabel}
          </button>
        )}
        <SiteSalonStatus themeId={themeId} data={data} placement="announcement" compact inverted />
      </div>
    );
  }

  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return (
      <div
        {...sectionProps('announcement', 'ready')}
        data-testid="site-announcement-bar"
        data-theme={themeId}
        className="site-section px-4 py-2.5 flex flex-wrap items-center justify-center gap-2 text-center"
        style={{ backgroundColor: t.teal, color: '#ffffff' }}
      >
        <span
          data-testid="site-announcement-badge"
          data-announcement-kind={visible.kind || visible.source}
          className="text-[9px] font-extrabold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
          style={{ backgroundColor: t.sun, color: '#12385b' }}
        >
          {badge}
        </span>
        <span className="text-[11px] font-bold">{message}</span>
        {showCta && (
          <button
            type="button"
            data-testid="site-announcement-cta"
            data-open-booking={visible.ctaTarget === 'booking' ? 'true' : undefined}
            onClick={onCta}
            className="text-[9px] font-extrabold uppercase tracking-[0.14em] px-3 py-1 rounded-full"
            style={{ backgroundColor: t.sun, color: '#12385b' }}
          >
            {ctaLabel}
          </button>
        )}
        <SiteSalonStatus themeId={themeId} data={data} placement="announcement" compact inverted />
      </div>
    );
  }

  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  const nailCta: CSSProperties = {
    backgroundColor: 'rgba(255,255,255,0.16)',
    color: '#ffffff',
  };
  return (
    <div
      {...sectionProps('announcement', 'ready')}
      data-testid="site-announcement-bar"
      data-theme={themeId}
      className="site-section px-4 py-2.5 flex flex-wrap items-center justify-center gap-2 text-center"
      style={{ backgroundColor: t.pink, color: '#ffffff' }}
    >
      <span
        data-testid="site-announcement-badge"
        data-announcement-kind={visible.kind || visible.source}
        className="text-[9px] font-extrabold uppercase tracking-[0.18em]"
      >
        {badge}
      </span>
      <span className="text-[11px] font-bold">{message}</span>
      {showCta && (
        <button
          type="button"
          data-testid="site-announcement-cta"
          data-open-booking={visible.ctaTarget === 'booking' ? 'true' : undefined}
          onClick={onCta}
          className="text-[9px] font-extrabold uppercase tracking-[0.16em] px-3 py-1 rounded-full"
          style={nailCta}
        >
          {ctaLabel}
        </button>
      )}
      <SiteSalonStatus themeId={themeId} data={data} placement="announcement" compact inverted />
    </div>
  );
}
