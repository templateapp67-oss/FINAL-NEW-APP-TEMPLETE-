/**
 * PHASE 12.1 — TRUST & SALON STATS section (all five themes).
 *
 * Renders the trust strip directly below each theme's hero. It shows ONLY the
 * stats the salon actually configured (see `src/lib/siteTrust.ts`); a stat with
 * no data is omitted, and when nothing is available the section falls back to
 * its empty state. Loading / error states honour the shared
 * `setWebsiteSectionFlagsForTests({ trust: … })` seam used by the other sections.
 *
 * Every theme keeps its OWN card design (surfaces + typography + shape), so no
 * two themes share the same trust card look:
 *   barber   — charcoal/gold, sharp corners, heavy uppercase
 *   hair     — paper/rose editorial, serif values, hairline rules
 *   spa      — emerald/beige, rounded-3xl, serif values
 *   family   — bright sky/teal, rounded-2xl, extrabold
 *   nail     — sand/pink, rounded-2xl, neon-pink values
 */
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { structureText } from '../lib/siteStructureI18n';
import { SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import { resolveSectionState, sectionProps, siteGrid } from '../lib/siteStructure';
import type { ViewportMode } from '../lib/siteStructure';
import { trustStats } from '../lib/siteTrust';
import type { TrustStat } from '../lib/siteTrust';
import { trustText } from '../lib/siteTrustI18n';
import { useTickingNow } from '../lib/salonStatus';
import type { SalonStatusKind } from '../lib/salonStatus';
import { surfacesOf, BARBER_SURFACES, HAIR_STUDIO_SURFACES, BEAUTY_SPA_SURFACES, FAMILY_SURFACES, NAIL_LASH_SURFACES } from '../lib/themeSurfaces';
import {
  Star,
  MessageSquareText,
  Award,
  Users,
  Sparkles,
  Clock3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  mode: ViewportMode;
}

/** Icon per stat kind (shared mapping; colors come from the theme look). */
const STAT_ICONS: Record<TrustStat['kind'], LucideIcon> = {
  rating: Star,
  reviewCount: MessageSquareText,
  yearsExperience: Award,
  happyCustomers: Users,
  services: Sparkles,
  salonStatus: Clock3,
};

const STATUS_DOT: Record<SalonStatusKind, string> = {
  open: '#16a34a',
  closing_soon: '#d97706',
  opens_at: '#2563eb',
  closed: '#6b7280',
  closed_today: '#6b7280',
  holiday: '#b45309',
};

interface TrustLook {
  sectionClass: string;
  sectionStyle: CSSProperties;
  eyebrowClass: string;
  eyebrowStyle: CSSProperties;
  titleClass: string;
  titleStyle: CSSProperties;
  cardClass: string;
  cardStyle: CSSProperties;
  valueClass: string;
  valueStyle: CSSProperties;
  labelClass: string;
  labelStyle: CSSProperties;
  detailClass: string;
  detailStyle: CSSProperties;
  iconColor: string;
  marker: 'dot' | 'dash' | null;
  markerColor: string;
  invert: string;
}

function buildLook(themeId: SiteHeaderThemeId, appearance: 'light' | 'dark'): TrustLook {
  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return {
      sectionClass: 'px-6 py-10 border-y',
      sectionStyle: { backgroundColor: t.charcoal, borderColor: t.line },
      eyebrowClass: 'text-[10px] font-bold uppercase tracking-[0.35em]',
      eyebrowStyle: { color: t.accentText },
      titleClass: 'text-xl font-black uppercase tracking-[0.05em] mt-2',
      titleStyle: { color: t.textStrong },
      cardClass: 'border p-4 min-w-0',
      cardStyle: { backgroundColor: t.card, borderColor: t.line },
      valueClass: 'text-2xl font-black mt-2',
      valueStyle: { color: t.gold },
      labelClass: 'text-[10px] font-bold uppercase tracking-[0.18em] mt-1',
      labelStyle: { color: t.muted },
      detailClass: 'text-[10px] mt-1',
      detailStyle: { color: t.muted },
      iconColor: t.gold,
      marker: null,
      markerColor: t.gold,
      invert: '#141414',
    };
  }
  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return {
      sectionClass: 'px-5 py-10 border-y',
      sectionStyle: { backgroundColor: t.paper, borderColor: t.line },
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      eyebrowStyle: { color: t.roseDeep },
      titleClass: 'text-xl font-serif mt-2',
      titleStyle: { color: t.ink },
      cardClass: 'border p-4 min-w-0',
      cardStyle: { backgroundColor: t.card, borderColor: t.line },
      valueClass: 'text-2xl font-serif mt-2',
      valueStyle: { color: t.roseDeep },
      labelClass: 'text-[10px] uppercase tracking-[0.16em] mt-1',
      labelStyle: { color: t.muted },
      detailClass: 'text-[10px] mt-1',
      detailStyle: { color: t.muted },
      iconColor: t.roseDeep,
      marker: null,
      markerColor: t.roseDeep,
      invert: '#ffffff',
    };
  }
  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return {
      sectionClass: 'px-5 py-10',
      sectionStyle: { backgroundColor: t.beigeSoft },
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      eyebrowStyle: { color: t.emerald },
      titleClass: 'text-xl font-serif mt-2',
      titleStyle: { color: t.text },
      cardClass: 'rounded-3xl border p-4 min-w-0',
      cardStyle: { backgroundColor: t.card, borderColor: t.line },
      valueClass: 'text-2xl font-serif mt-2',
      valueStyle: { color: t.emerald },
      labelClass: 'text-[10px] uppercase tracking-[0.16em] mt-1',
      labelStyle: { color: t.muted },
      detailClass: 'text-[10px] mt-1',
      detailStyle: { color: t.muted },
      iconColor: t.emerald,
      marker: null,
      markerColor: t.emerald,
      invert: '#ffffff',
    };
  }
  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return {
      sectionClass: 'px-5 py-10',
      sectionStyle: { backgroundColor: t.well },
      eyebrowClass: 'inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em]',
      eyebrowStyle: { color: t.tealDeep },
      titleClass: 'text-2xl font-extrabold leading-tight tracking-[-0.03em] mt-3',
      titleStyle: { color: t.heading },
      cardClass: 'rounded-2xl border p-4 min-w-0',
      cardStyle: { backgroundColor: t.card, borderColor: t.line },
      valueClass: 'text-2xl font-extrabold mt-2',
      valueStyle: { color: t.teal },
      labelClass: 'text-[9px] font-bold mt-1',
      labelStyle: { color: t.muted },
      detailClass: 'text-[9px] mt-1',
      detailStyle: { color: t.muted },
      iconColor: t.teal,
      marker: 'dot',
      markerColor: t.teal,
      invert: '#ffffff',
    };
  }
  // nail_lash_studio
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  return {
    sectionClass: 'px-5 py-10',
    sectionStyle: { backgroundColor: t.sand },
    eyebrowClass: 'inline-flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.28em]',
    eyebrowStyle: { color: t.pinkDeep },
    titleClass: 'text-2xl font-extrabold leading-tight tracking-[-0.02em] mt-3',
    titleStyle: { color: t.ink },
    cardClass: 'rounded-2xl border p-4 min-w-0',
    cardStyle: { backgroundColor: t.card, borderColor: t.line },
    valueClass: 'text-2xl font-extrabold mt-2',
    valueStyle: { color: t.pinkDeep },
    labelClass: 'text-[8px] uppercase tracking-[0.12em] font-bold mt-1',
    labelStyle: { color: t.muted },
    detailClass: 'text-[9px] mt-1',
    detailStyle: { color: t.muted },
    iconColor: t.pinkDeep,
    marker: 'dash',
    markerColor: t.pink,
    invert: '#ffffff',
  };
}

export default function SiteTrust({ themeId, data, mode }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const now = useTickingNow();
  const S = structureText(themeId, locale);
  const X = structureCopyFrom(S);
  const copy = trustText(locale);
  const stats = useMemo(() => trustStats(themeId, data, now, locale), [themeId, data, now, locale]);
  const state = resolveSectionState('trust', stats);
  const look = buildLook(themeId, appearance);

  const palette = {
    accent: look.iconColor,
    text: String(look.titleStyle.color),
    muted: String(look.labelStyle.color),
    card: String(look.cardStyle.backgroundColor),
    line: String(look.cardStyle.borderColor),
    invert: look.invert,
  };

  const gridClass = `grid gap-3 mt-7 ${siteGrid(mode, { desktop: 3, tablet: 3, mobile: 1 })}`;

  return (
    <div
      {...sectionProps('trust', state)}
      data-testid="site-trust"
      data-theme={themeId}
      className={`site-section min-w-0 ${look.sectionClass}`}
      style={look.sectionStyle}
    >
      <div className="max-w-3xl mx-auto text-center">
        <span className={look.eyebrowClass} style={look.eyebrowStyle}>
          {look.marker === 'dot' && (
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: look.markerColor }} aria-hidden />
          )}
          {look.marker === 'dash' && (
            <span className="w-5 h-px shrink-0" style={{ backgroundColor: look.markerColor }} aria-hidden />
          )}
          {S.trustEyebrow}
        </span>
        <h2 className={look.titleClass} style={look.titleStyle}>{S.trustTitle}</h2>

        {state === 'ready' && (
          <div data-testid="site-trust-grid" className={gridClass}>
            {stats.map((stat) => {
              const Icon = STAT_ICONS[stat.kind];
              const detail = stat.kind === 'rating' ? copy.ratingOf : stat.detail;
              return (
                <div
                  key={stat.kind}
                  data-testid="site-trust-stat"
                  data-kind={stat.kind}
                  className={look.cardClass}
                  style={look.cardStyle}
                >
                  <Icon className="w-4 h-4" style={{ color: look.iconColor }} aria-hidden />
                  {stat.kind === 'salonStatus' ? (
                    <p className={look.valueClass} style={look.valueStyle}>
                      <span
                        data-testid="site-trust-status-dot"
                        className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                        style={{ backgroundColor: STATUS_DOT[stat.statusKind || 'closed'] }}
                        aria-hidden
                      />
                      {stat.value}
                    </p>
                  ) : (
                    <p className={look.valueClass} style={look.valueStyle}>{stat.value}</p>
                  )}
                  <p className={look.labelClass} style={look.labelStyle}>{copy.label(stat.kind)}</p>
                  {detail ? (
                    <p className={look.detailClass} style={look.detailStyle}>{detail}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {state === 'loading' && (
          <div data-testid="site-trust-loading" className={gridClass}>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className={`${look.cardClass} animate-pulse`}
                style={{ ...look.cardStyle, minHeight: '110px' }}
                aria-hidden
              >
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: look.labelStyle.color, opacity: 0.3 }} />
                <div className="h-6 w-16 mt-3 rounded" style={{ backgroundColor: look.labelStyle.color, opacity: 0.25 }} />
                <div className="h-3 w-24 mt-2 rounded" style={{ backgroundColor: look.labelStyle.color, opacity: 0.2 }} />
              </div>
            ))}
          </div>
        )}

        {(state === 'error' || state === 'empty') && (
          <div className="mt-6">
            <SectionStatePanel
              status={state}
              copy={X}
              palette={palette}
              emptyTitle={copy.emptyTitle}
              emptyBody={copy.emptyBody}
              section="trust"
              mode={mode}
            />
          </div>
        )}
      </div>
    </div>
  );
}
