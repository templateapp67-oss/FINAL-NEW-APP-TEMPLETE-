import type { CSSProperties } from 'react';
import type { SalonData } from '../types';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { isSiteHeaderTheme } from '../lib/siteNavigation';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { resolveSalonStatus, useTickingNow } from '../lib/salonStatus';
import type { SalonStatusKind } from '../lib/salonStatus';
import { salonStatusLabel } from '../lib/siteStatusI18n';
import { OWNER_PREVIEW_EMPTY } from '../lib/ownerPreview';
import { useIsOwnerPreview } from './SiteRenderContext';

export type StatusPlacement = 'announcement' | 'contact' | 'booking';

interface Props {
  themeId: string;
  data: SalonData;
  placement: StatusPlacement;
  compact?: boolean;
  inverted?: boolean;
}

const DOT: Record<SalonStatusKind, string> = {
  open: '#16a34a',
  closing_soon: '#d97706',
  opens_at: '#2563eb',
  closed: '#6b7280',
  closed_today: '#6b7280',
  holiday: '#b45309',
};

function themedChip(
  themeId: SiteHeaderThemeId,
  inverted: boolean,
  kind: SalonStatusKind,
): CSSProperties {
  if (inverted) {
    return {
      backgroundColor: 'rgba(255,255,255,0.14)',
      color: '#ffffff',
      borderColor: 'rgba(255,255,255,0.22)',
    };
  }
  if (themeId === 'barber_mens_grooming') {
    return { backgroundColor: '#141414', color: '#e8c95c', borderColor: '#c9a227' };
  }
  if (themeId === 'hair_studio_color_bar') {
    return { backgroundColor: 'transparent', color: '#9d5a63', borderColor: '#e7e0d8' };
  }
  if (themeId === 'beauty_skin_spa') {
    return { backgroundColor: '#e2f0ea', color: '#15594a', borderColor: '#ece6dc' };
  }
  if (themeId === 'family_full_service') {
    return { backgroundColor: '#d9f5f1', color: '#087a78', borderColor: '#dcebf4' };
  }
  if (themeId === 'nail_lash_studio') {
    return { backgroundColor: '#ffe5f1', color: '#d70f68', borderColor: '#eadbd5' };
  }
  return {
    backgroundColor: kind === 'open' ? '#ecfdf3' : '#f3f4f6',
    color: '#374151',
    borderColor: '#e5e7eb',
  };
}

/**
 * Compact live open/closed chip. Used in the contact hours card and the
 * existing booking-flow header — not in the footer or floating actions.
 */
export default function SiteSalonStatus({
  themeId,
  data,
  placement,
  compact = false,
  inverted = false,
}: Props) {
  const locale = useSiteLocale();
  const ownerPreview = useIsOwnerPreview();
  const headerTheme: SiteHeaderThemeId = isSiteHeaderTheme(themeId) ? themeId : 'hair_studio_color_bar';
  useThemeAppearance(headerTheme);
  const now = useTickingNow();
  const status = resolveSalonStatus(data, now);
  const hasConfiguredHours = Boolean(data.openingHours && Object.keys(data.openingHours).length > 0);
  const label = ownerPreview && !hasConfiguredHours
    ? OWNER_PREVIEW_EMPTY.hours
    : salonStatusLabel(status, locale);
  const theme = isSiteHeaderTheme(themeId) ? themeId : headerTheme;
  const sharp = theme === 'barber_mens_grooming' || theme === 'hair_studio_color_bar';

  return (
    <span
      data-testid="site-salon-status"
      data-placement={placement}
      data-status={ownerPreview && !hasConfiguredHours ? 'not-configured' : status.kind}
      data-theme={themeId}
      className={`inline-flex items-center gap-1.5 border shrink-0 ${
        sharp ? '' : 'rounded-full'
      } ${compact ? 'px-2 py-0.5 text-[8px]' : 'px-2.5 py-1 text-[9px]'} font-extrabold uppercase tracking-[0.12em]`}
      style={themedChip(theme, inverted, status.kind)}
    >
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: inverted ? '#ffffff' : DOT[status.kind] }}
      />
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
