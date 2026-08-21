import type { CSSProperties, ReactNode } from 'react';
import { AlertCircle, CalendarCheck, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { SITE_HEADER_LABELS } from '../lib/siteNavigation';
import type { SectionStatus, SiteSectionKey, ViewportMode } from '../lib/siteStructure';
import { SITE_SECTION_IDS, sectionProps } from '../lib/siteStructure';
import { chromeText } from '../lib/siteChromeI18n';
import {
  canCall,
  canWhatsApp,
  openSiteBooking,
} from '../lib/siteBooking';
import { useSiteLocale } from './SiteHeader';
import SiteProtectedContactAction from './SiteProtectedContactAction';
import SiteSkeleton from './SiteSkeleton';

export interface StructurePalette {
  accent: string;
  accentSoft?: string;
  text: string;
  muted: string;
  card: string;
  line: string;
  invert?: string;
}

interface StateCopy {
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
}

function skeletonTypeForSection(section: SiteSectionKey): 'services' | 'offers' | 'gallery' | 'videos' | 'reviews' | 'staff' | 'owner' | 'location' | 'generic' {
  switch (section) {
    case 'services':
    case 'featured':
      return 'services';
    case 'offers':
      return 'offers';
    case 'gallery':
      return 'gallery';
    case 'videos':
      return 'videos';
    case 'reviews':
      return 'reviews';
    case 'team':
      return 'staff';
    case 'owner':
      return 'owner';
    case 'location':
      return 'location';
    default:
      return 'generic';
  }
}

export function SectionStatePanel({
  status,
  copy,
  palette,
  onRetry,
  emptyTitle,
  emptyBody,
  section = 'services' as SiteSectionKey,
  mode = 'desktop' as ViewportMode,
}: {
  status: SectionStatus;
  copy: StateCopy;
  palette: StructurePalette;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyBody?: string;
  section?: SiteSectionKey;
  mode?: ViewportMode;
}) {
  if (status === 'ready') return null;
  if (status === 'loading') {
    const skType = skeletonTypeForSection(section);
    return (
      <div data-testid="section-state-loading" data-section={section} className="min-w-0">
        <SiteSkeleton type={skType} mode={mode} />
        <div className="flex items-center justify-center gap-2 mt-3 text-[10px]" style={{ color: palette.muted }}>
          <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
          <span className="font-semibold">{copy.loading}</span>
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div
        data-testid="section-state-error"
        data-section={section}
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border px-4 py-8 text-center min-h-[88px]"
        style={{ borderColor: palette.line, backgroundColor: palette.card }}
      >
        <AlertCircle className="w-5 h-5" style={{ color: palette.accent }} />
        <p className="text-sm font-bold" style={{ color: palette.text }}>{copy.errorTitle}</p>
        <p className="text-xs max-w-sm" style={{ color: palette.muted }}>{copy.errorBody}</p>
        <button
          type="button"
          data-testid="section-state-retry"
          onClick={onRetry}
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl text-[10px] font-extrabold uppercase tracking-wider"
          style={{ backgroundColor: palette.accent, color: palette.invert || '#ffffff' }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> {copy.retry}
        </button>
      </div>
    );
  }
  return (
    <div
      data-testid="section-state-empty"
      data-section={section}
      className="rounded-2xl border border-dashed px-4 py-8 text-center min-h-[88px]"
      style={{ borderColor: palette.line, backgroundColor: palette.card }}
    >
      <p className="text-sm font-bold" style={{ color: palette.text }}>{emptyTitle || copy.emptyTitle}</p>
      <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: palette.muted }}>{emptyBody || copy.emptyBody}</p>
    </div>
  );
}

export function StructuredSection({
  section,
  status,
  id,
  className,
  style,
  children,
  copy,
  palette,
  emptyTitle,
  emptyBody,
  mode,
}: {
  section: SiteSectionKey;
  status: SectionStatus;
  id?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  copy: StateCopy;
  palette: StructurePalette;
  emptyTitle?: string;
  emptyBody?: string;
  mode?: ViewportMode;
}) {
  return (
    <section {...sectionProps(section, status, id)} className={`site-section min-w-0 ${className || ''}`} style={style}>
      {status === 'ready' ? children : (
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-10">
          <SectionStatePanel status={status} copy={copy} palette={palette} emptyTitle={emptyTitle} emptyBody={emptyBody} section={section} mode={mode} />
        </div>
      )}
    </section>
  );
}

export function structureCopyFrom(S: Record<string, string>): StateCopy {
  return {
    loading: S['struct.loading'],
    emptyTitle: S['struct.emptyTitle'],
    emptyBody: S['struct.emptyBody'],
    errorTitle: S['struct.errorTitle'],
    errorBody: S['struct.errorBody'],
    retry: S['struct.retry'],
  };
}

export function FinalBookingCta({
  title,
  body,
  cta,
  palette,
  sharp = false,
  themeId,
  data,
}: {
  title: string;
  body: string;
  cta: string;
  palette: StructurePalette;
  sharp?: boolean;
  themeId?: SiteHeaderThemeId;
  data?: SalonData;
}) {
  const locale = useSiteLocale();
  const C = themeId ? chromeText(themeId, locale) : null;
  const showCall = !!(data && canCall(data));
  const showWa = !!(data && canWhatsApp(data));
  const bookLabel = cta || SITE_HEADER_LABELS.bookAppointment[locale];

  const bookBtn = (
    <button
      type="button"
      data-testid="final-booking-cta"
      data-open-booking="true"
      onClick={openSiteBooking}
      className={`inline-flex items-center justify-center min-h-11 px-8 text-[11px] font-extrabold uppercase tracking-[0.16em] ${
        themeId === 'barber_mens_grooming' || themeId === 'hair_studio_color_bar' || sharp
          ? ''
          : themeId === 'family_full_service'
            ? 'rounded-xl'
            : 'rounded-full'
      }`}
      style={bookStyle(themeId, palette)}
    >
      {bookLabel}
    </button>
  );

  const extras = (C && data) ? (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {showCall && themeId && (
        <SiteProtectedContactAction
          action="call"
          data={data}
          themeId={themeId}
          testId="final-cta-call"
          ariaLabel={C.ctaCall}
          className={`site-touch inline-flex items-center gap-2 px-4 text-[10px] font-bold uppercase tracking-[0.14em] ${shapeOf(themeId, sharp)}`}
          style={ghostStyle(themeId, palette)}
          showLockIcon={false}
        >
          <Phone className="w-3.5 h-3.5" /> {C.ctaCall}
        </SiteProtectedContactAction>
      )}
      {showWa && themeId && (
        <SiteProtectedContactAction
          action="whatsapp"
          data={data}
          themeId={themeId}
          testId="final-cta-whatsapp"
          ariaLabel={C.ctaWhatsapp}
          className={`site-touch inline-flex items-center gap-2 px-4 text-[10px] font-bold uppercase tracking-[0.14em] ${shapeOf(themeId, sharp)}`}
          style={ghostStyle(themeId, palette)}
          showLockIcon={false}
        >
          <MessageCircle className="w-3.5 h-3.5" /> {C.ctaWhatsapp}
        </SiteProtectedContactAction>
      )}
    </div>
  ) : null;

  return (
    <section
      {...sectionProps('booking', 'ready', SITE_SECTION_IDS.booking)}
      data-testid="final-cta-section"
      data-theme={themeId || 'generic'}
      className={`site-section px-5 md:px-8 py-12 text-center min-w-0 final-cta-${themeId || 'generic'}`}
      style={bandStyle(themeId, palette)}
    >
      <div className="max-w-xl mx-auto">
        <div
          className={`w-12 h-12 mx-auto mb-4 flex items-center justify-center ${shapeOf(themeId, sharp)}`}
          style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}
        >
          <CalendarCheck className="w-6 h-6 text-white" />
        </div>
        <h2 className={headingClass(themeId)}>{title}</h2>
        <p className="text-xs md:text-sm mt-3 text-white/80 leading-relaxed">{body}</p>
        <div className="mt-6">{bookBtn}</div>
        {extras}
      </div>
    </section>
  );
}

function shapeOf(themeId: SiteHeaderThemeId | undefined, sharp: boolean): string {
  if (themeId === 'barber_mens_grooming' || themeId === 'hair_studio_color_bar' || sharp) return '';
  if (themeId === 'family_full_service') return 'rounded-xl';
  return 'rounded-full';
}

function headingClass(themeId: SiteHeaderThemeId | undefined): string {
  if (themeId === 'hair_studio_color_bar' || themeId === 'beauty_skin_spa') {
    return 'text-2xl md:text-3xl font-serif text-white tracking-tight';
  }
  if (themeId === 'barber_mens_grooming') {
    return 'text-2xl md:text-3xl font-black uppercase tracking-[0.06em] text-white';
  }
  return 'text-2xl md:text-3xl font-extrabold text-white tracking-tight';
}

function bandStyle(themeId: SiteHeaderThemeId | undefined, palette: StructurePalette): CSSProperties {
  if (themeId === 'barber_mens_grooming') return { backgroundColor: '#141414', borderTop: `2px solid ${palette.accent}`, borderBottom: `2px solid ${palette.accent}` };
  if (themeId === 'hair_studio_color_bar') return { backgroundColor: '#191817' };
  if (themeId === 'beauty_skin_spa') return { background: `linear-gradient(160deg, ${palette.accent} 0%, #15594a 100%)` };
  if (themeId === 'family_full_service') return { backgroundColor: '#12385b' };
  if (themeId === 'nail_lash_studio') return { backgroundImage: `linear-gradient(120deg, ${palette.accent} 0%, #d70f68 100%)`, backgroundColor: palette.accent };
  return { backgroundColor: palette.accent };
}

function bookStyle(themeId: SiteHeaderThemeId | undefined, palette: StructurePalette): CSSProperties {
  if (themeId === 'barber_mens_grooming') return { backgroundColor: palette.accent, color: '#141414' };
  if (themeId === 'hair_studio_color_bar') return { backgroundColor: 'transparent', color: '#d8a0a8', border: '1px solid #d8a0a8' };
  if (themeId === 'nail_lash_studio') return { backgroundColor: '#211b24', color: '#ffffff' };
  if (themeId === 'family_full_service') return { backgroundColor: '#079f9a', color: '#ffffff' };
  return { backgroundColor: '#ffffff', color: palette.accent };
}

function ghostStyle(themeId: SiteHeaderThemeId | undefined, palette: StructurePalette): CSSProperties {
  if (themeId === 'barber_mens_grooming') return { border: `1px solid ${palette.accent}`, color: palette.accent };
  if (themeId === 'hair_studio_color_bar') return { border: '1px solid rgba(255,255,255,0.28)', color: '#faf8f5' };
  return { border: '1px solid rgba(255,255,255,0.35)', color: '#ffffff' };
}
