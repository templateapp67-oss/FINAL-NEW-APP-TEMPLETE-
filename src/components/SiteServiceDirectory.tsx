/**
 * PHASE 12.4 — COMPLETE SERVICES directory (all five themes).
 *
 * The full service directory, rendered in the canonical `services` slot
 * (directly after Featured Services). Active Theme → Category → Services:
 *
 *   - categories and services come ONLY from the active theme (theme_id /
 *     theme_key relationship — see `directoryServicesForTheme`);
 *   - category tabs + search + price/duration sorting (reusing the existing
 *     `serviceSearch` engine);
 *   - each row shows name, description, offer-aware price, duration, an offer
 *     badge + discount when an active offer applies, and a Book Now action
 *     that opens the existing booking flow with that service preserved.
 *
 * Each theme keeps its own visual styling (surfaces + typography + shape); no
 * two themes share the same card design. Loading / empty / error states honour
 * the shared `setWebsiteSectionFlagsForTests({ services: … })` seam.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SalonData, Service } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import type { AppLocale } from '../lib/locale';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { siteText } from '../lib/siteI18n';
import { structureText } from '../lib/siteStructureI18n';
import { SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import { resolveSectionState, sectionProps, siteGrid } from '../lib/siteStructure';
import type { ViewportMode } from '../lib/siteStructure';
import {
  directoryServicesForTheme,
  distinctServiceCategories,
} from '../lib/siteServiceDirectory';
import { serviceDirectoryText } from '../lib/siteServiceDirectoryI18n';
import { filterAndSortServices } from '../lib/serviceSearch';
import type { ServiceSort } from '../lib/serviceSearch';
import { displayService } from '../lib/displayService';
import { translateCategory } from '../lib/siteI18n';
import { openSiteBookingForService } from '../lib/siteBooking';
import { serviceDisplayPrice, formatCurrency, featuredDiscountLabel } from '../lib/pricing';
import { getServiceVariants, serviceWithSelectedVariant } from '../lib/siteVariants';
import { siteVariantsText } from '../lib/siteVariantsI18n';
import { surfacesOf, BARBER_SURFACES, HAIR_STUDIO_SURFACES, BEAUTY_SPA_SURFACES, FAMILY_SURFACES, NAIL_LASH_SURFACES } from '../lib/themeSurfaces';
import { serviceVisuals, categoryIcon } from '../lib/siteServiceVisuals';
import ServiceVisual from './ServiceVisual';
import SiteServiceDetail from './SiteServiceDetail';
import { Clock, Search } from 'lucide-react';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  mode: ViewportMode;
}

interface DirectoryLook {
  sectionClass: string;
  sectionStyle: CSSProperties;
  maxW: string;
  header: 'center' | 'left';
  eyebrowClass: string;
  eyebrowStyle: CSSProperties;
  titleClass: string;
  titleStyle: CSSProperties;
  divider?: string;
  subtitleStyle: CSSProperties;
  tabsWrapClass: string;
  tabClass: string;
  tabStyle: CSSProperties;
  tabActiveStyle: CSSProperties;
  searchClass: string;
  searchStyle: CSSProperties;
  sortClass: string;
  sortStyle: CSSProperties;
  accent: string;
  muted: string;
  card: string;
  line: string;
  text: string;
  invert: string;
  grid: { desktop: 1 | 2 | 3 | 4; tablet?: 1 | 2 | 3; mobile: 1 | 2 };
  cardClass: string;
  cardStyle: CSSProperties;
  nameClass: string;
  nameStyle: CSSProperties;
  categoryStyle: CSSProperties;
  descStyle: CSSProperties;
  priceStyle: CSSProperties;
  discountStyle: CSSProperties;
  durationStyle: CSSProperties;
  badgeClass: string;
  badgeStyle: CSSProperties;
  ctaClass: string;
  ctaStyle: CSSProperties;
  ctaKey: 'common.bookSlot' | 'common.bookThisService' | 'common.bookNow';
  /** Ghost "Clear Filters" button (themed outline, matches the CTA shape). */
  clearClass: string;
  clearStyle: CSSProperties;
  /** Radius for the service visual strip (per-theme). */
  mediaRounded: string;
}

function buildLook(themeId: SiteHeaderThemeId, appearance: 'light' | 'dark'): DirectoryLook {
  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return {
      sectionClass: 'px-6 py-14',
      sectionStyle: { backgroundColor: t.charcoalSoft },
      maxW: 'max-w-3xl',
      header: 'center',
      eyebrowClass: 'text-[10px] font-bold uppercase tracking-[0.35em]',
      eyebrowStyle: { color: t.accentText },
      titleClass: 'text-2xl md:text-3xl font-black uppercase tracking-[0.05em] mt-2',
      titleStyle: { color: t.textStrong },
      divider: 'h-px w-16 mx-auto mt-4',
      subtitleStyle: { color: t.muted },
      tabsWrapClass: 'flex flex-wrap gap-2 justify-center',
      tabClass: 'site-touch px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] border',
      tabStyle: { backgroundColor: t.card, color: t.muted, borderColor: t.line },
      tabActiveStyle: { backgroundColor: t.gold, color: '#141414', borderColor: t.gold },
      searchClass: 'w-full px-3 py-2 text-xs border outline-none',
      searchStyle: { backgroundColor: t.card, color: t.textStrong, borderColor: t.line },
      sortClass: 'px-3 py-2 text-[11px] border outline-none',
      sortStyle: { backgroundColor: t.card, color: t.text, borderColor: t.line },
      accent: t.gold,
      muted: t.muted,
      card: t.card,
      line: t.line,
      text: t.textStrong,
      invert: '#141414',
      grid: { desktop: 2, tablet: 2, mobile: 1 },
      cardClass: 'border p-4 min-w-0 flex flex-col',
      cardStyle: { backgroundColor: t.card, borderColor: t.line },
      nameClass: 'text-sm font-black uppercase tracking-wider break-words',
      nameStyle: { color: t.textStrong },
      categoryStyle: { color: t.muted },
      descStyle: { color: t.muted },
      priceStyle: { color: t.gold },
      discountStyle: { color: t.goldBright },
      durationStyle: { color: t.muted },
      badgeClass: 'text-[8px] font-black uppercase tracking-wider px-2 py-0.5 border',
      badgeStyle: { backgroundColor: t.goldSoft, color: t.goldBright, borderColor: t.gold },
      ctaClass: 'site-touch mt-4 w-full py-2.5 text-[10px] font-black uppercase tracking-[0.15em]',
      ctaStyle: { backgroundColor: t.gold, color: '#141414' },
      ctaKey: 'common.bookSlot',
      clearClass: 'site-touch px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] border',
      clearStyle: { backgroundColor: 'transparent', color: t.accentText, borderColor: t.gold },
      mediaRounded: '',
    };
  }
  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return {
      sectionClass: 'px-5 py-16',
      sectionStyle: { backgroundColor: t.paper },
      maxW: 'max-w-3xl',
      header: 'center',
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      eyebrowStyle: { color: t.roseDeep },
      titleClass: 'text-2xl md:text-3xl font-serif mt-3',
      titleStyle: { color: t.ink },
      divider: 'h-px w-16 mx-auto mt-5',
      subtitleStyle: { color: t.muted },
      tabsWrapClass: 'flex flex-wrap gap-2 justify-center',
      tabClass: 'site-touch px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold border',
      tabStyle: { backgroundColor: t.card, color: t.muted, borderColor: t.line },
      tabActiveStyle: { backgroundColor: t.roseSoft, color: t.roseDeep, borderColor: t.roseDeep },
      searchClass: 'w-full px-3 py-2 text-xs border outline-none',
      searchStyle: { backgroundColor: t.card, color: t.ink, borderColor: t.line },
      sortClass: 'px-3 py-2 text-[11px] border outline-none',
      sortStyle: { backgroundColor: t.card, color: t.ink, borderColor: t.line },
      accent: t.roseDeep,
      muted: t.muted,
      card: t.card,
      line: t.line,
      text: t.ink,
      invert: '#ffffff',
      grid: { desktop: 2, tablet: 2, mobile: 1 },
      cardClass: 'border p-4 min-w-0 flex flex-col',
      cardStyle: { backgroundColor: t.card, borderColor: t.line },
      nameClass: 'text-sm font-serif font-semibold break-words',
      nameStyle: { color: t.ink },
      categoryStyle: { color: t.roseDeep },
      descStyle: { color: t.muted },
      priceStyle: { color: t.roseDeep },
      discountStyle: { color: t.roseBright },
      durationStyle: { color: t.muted },
      badgeClass: 'text-[8px] uppercase tracking-[0.16em] font-semibold px-2 py-0.5 border',
      badgeStyle: { backgroundColor: t.roseSoft, color: t.roseDeep, borderColor: t.roseDeep },
      ctaClass: 'site-touch mt-4 self-start text-[10px] uppercase tracking-[0.2em] font-semibold underline underline-offset-4',
      ctaStyle: { color: t.roseDeep },
      ctaKey: 'common.bookThisService',
      clearClass: 'site-touch px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold border rounded-md',
      clearStyle: { backgroundColor: 'transparent', color: t.roseDeep, borderColor: t.roseDeep },
      mediaRounded: '',
    };
  }
  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return {
      sectionClass: 'px-5 py-16',
      sectionStyle: { backgroundColor: t.cream },
      maxW: 'max-w-3xl',
      header: 'center',
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      eyebrowStyle: { color: t.emerald },
      titleClass: 'text-2xl md:text-3xl font-serif mt-3',
      titleStyle: { color: t.text },
      divider: 'h-px w-16 mx-auto mt-5',
      subtitleStyle: { color: t.muted },
      tabsWrapClass: 'flex flex-wrap gap-2 justify-center',
      tabClass: 'site-touch px-3.5 py-1.5 text-[10px] uppercase tracking-[0.16em] font-semibold rounded-full border',
      tabStyle: { backgroundColor: t.card, color: t.muted, borderColor: t.line },
      tabActiveStyle: { backgroundColor: t.emerald, color: '#ffffff', borderColor: t.emerald },
      searchClass: 'w-full px-4 py-2 text-xs border outline-none rounded-full',
      searchStyle: { backgroundColor: t.card, color: t.text, borderColor: t.line },
      sortClass: 'px-4 py-2 text-[11px] border outline-none rounded-full',
      sortStyle: { backgroundColor: t.card, color: t.text, borderColor: t.line },
      accent: t.emerald,
      muted: t.muted,
      card: t.card,
      line: t.line,
      text: t.text,
      invert: '#ffffff',
      grid: { desktop: 2, tablet: 2, mobile: 1 },
      cardClass: 'rounded-3xl border p-5 min-w-0 flex flex-col',
      cardStyle: { backgroundColor: t.card, borderColor: t.line },
      nameClass: 'text-sm font-serif font-semibold break-words',
      nameStyle: { color: t.text },
      categoryStyle: { color: t.emerald },
      descStyle: { color: t.muted },
      priceStyle: { color: t.emerald },
      discountStyle: { color: t.emeraldMid },
      durationStyle: { color: t.muted },
      badgeClass: 'text-[8px] uppercase tracking-[0.16em] font-semibold px-2 py-0.5 rounded-full',
      badgeStyle: { backgroundColor: t.emeraldSoft, color: t.emeraldDeep, borderColor: 'transparent' },
      ctaClass: 'site-touch mt-4 w-full py-2 rounded-full text-[10px] uppercase tracking-[0.2em] font-semibold',
      ctaStyle: { backgroundColor: t.emerald, color: '#ffffff' },
      ctaKey: 'common.bookNow',
      clearClass: 'site-touch px-3.5 py-1.5 text-[10px] uppercase tracking-[0.16em] font-semibold border rounded-full',
      clearStyle: { backgroundColor: 'transparent', color: t.emerald, borderColor: t.emerald },
      mediaRounded: 'rounded-2xl',
    };
  }
  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return {
      sectionClass: 'px-5 py-12',
      sectionStyle: { backgroundColor: t.white },
      maxW: 'max-w-3xl',
      header: 'left',
      eyebrowClass: 'inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em]',
      eyebrowStyle: { color: t.tealDeep },
      titleClass: 'text-2xl md:text-3xl font-extrabold leading-tight tracking-[-0.03em] mt-3',
      titleStyle: { color: t.heading },
      subtitleStyle: { color: t.muted },
      tabsWrapClass: 'flex flex-wrap gap-2',
      tabClass: 'site-touch px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] rounded-xl border',
      tabStyle: { backgroundColor: t.card, color: t.ink, borderColor: t.line },
      tabActiveStyle: { backgroundColor: t.teal, color: '#ffffff', borderColor: t.teal },
      searchClass: 'w-full px-3 py-2 text-xs border outline-none rounded-xl',
      searchStyle: { backgroundColor: t.card, color: t.ink, borderColor: t.line },
      sortClass: 'px-3 py-2 text-[11px] border outline-none rounded-xl',
      sortStyle: { backgroundColor: t.card, color: t.ink, borderColor: t.line },
      accent: t.teal,
      muted: t.muted,
      card: t.card,
      line: t.line,
      text: t.ink,
      invert: '#ffffff',
      grid: { desktop: 2, tablet: 2, mobile: 1 },
      cardClass: 'rounded-2xl border p-4 min-w-0 flex flex-col',
      cardStyle: { backgroundColor: t.well, borderColor: t.line },
      nameClass: 'text-sm font-extrabold break-words',
      nameStyle: { color: t.ink },
      categoryStyle: { color: t.tealDeep },
      descStyle: { color: t.muted },
      priceStyle: { color: t.teal },
      discountStyle: { color: t.blue },
      durationStyle: { color: t.muted },
      badgeClass: 'text-[8px] font-extrabold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full',
      badgeStyle: { backgroundColor: t.sky, color: t.blue, borderColor: 'transparent' },
      ctaClass: 'site-touch mt-4 w-full py-2.5 rounded-xl text-[9px] font-extrabold uppercase tracking-[0.13em]',
      ctaStyle: { backgroundColor: t.teal, color: '#ffffff' },
      ctaKey: 'common.bookNow',
      clearClass: 'site-touch px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] border rounded-xl',
      clearStyle: { backgroundColor: 'transparent', color: t.teal, borderColor: t.teal },
      mediaRounded: 'rounded-xl',
    };
  }
  // nail_lash_studio
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  return {
    sectionClass: 'px-5 py-12',
    sectionStyle: { backgroundColor: t.white },
    maxW: 'max-w-4xl',
    header: 'left',
    eyebrowClass: 'inline-flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.28em]',
    eyebrowStyle: { color: t.pinkDeep },
    titleClass: 'text-2xl md:text-3xl font-extrabold leading-tight tracking-[-0.02em] mt-3',
    titleStyle: { color: t.ink },
    subtitleStyle: { color: t.muted },
    tabsWrapClass: 'flex flex-wrap gap-2',
    tabClass: 'site-touch px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] rounded-full border',
    tabStyle: { backgroundColor: t.card, color: t.muted, borderColor: t.line },
    tabActiveStyle: { backgroundColor: t.pink, color: '#ffffff', borderColor: t.pink },
    searchClass: 'w-full px-3 py-2 text-xs border outline-none rounded-full',
    searchStyle: { backgroundColor: t.card, color: t.ink, borderColor: t.line },
    sortClass: 'px-3 py-2 text-[11px] border outline-none rounded-full',
    sortStyle: { backgroundColor: t.card, color: t.ink, borderColor: t.line },
    accent: t.pinkDeep,
    muted: t.muted,
    card: t.card,
    line: t.line,
    text: t.ink,
    invert: '#ffffff',
    grid: { desktop: 2, tablet: 2, mobile: 1 },
    cardClass: 'rounded-[1.5rem] border p-4 min-w-0 flex flex-col',
    cardStyle: { backgroundColor: t.cream, borderColor: t.line },
    nameClass: 'text-sm font-extrabold break-words',
    nameStyle: { color: t.ink },
    categoryStyle: { color: t.pinkDeep },
    descStyle: { color: t.muted },
    priceStyle: { color: t.pinkDeep },
    discountStyle: { color: t.pinkGlow },
    durationStyle: { color: t.muted },
      badgeClass: 'text-[8px] font-extrabold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full',
      badgeStyle: { backgroundColor: t.pinkSoft, color: t.pinkDeep, borderColor: 'transparent' },
      ctaClass: 'site-touch mt-4 w-full py-2.5 rounded-full text-[9px] font-extrabold uppercase tracking-[0.2em]',
      ctaStyle: { backgroundColor: t.pink, color: '#ffffff' },
      ctaKey: 'common.bookNow',
      clearClass: 'site-touch px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] border rounded-full',
      clearStyle: { backgroundColor: 'transparent', color: t.pinkDeep, borderColor: t.pink },
      mediaRounded: 'rounded-xl',
    };
  }

function ServiceDirectoryCard({
  service,
  themeId,
  data,
  locale,
  look,
  S,
  onOpenDetail,
}: {
  service: Service;
  themeId: SiteHeaderThemeId;
  data: SalonData;
  locale: AppLocale;
  look: DirectoryLook;
  S: Record<string, string>;
  onOpenDetail: (s: Service) => void;
  key?: string;
}) {
  const variants = getServiceVariants(service, themeId);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    service.selectedVariantId || null,
  );

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);
  const pricing = serviceDisplayPrice(service, data.offers, selectedVariantId);
  const offer = pricing.offer;
  const shown = displayService(service, locale);
  const visual = serviceVisuals(service, locale);
  const Glyph = categoryIcon(service.category);
  const activeDuration = selectedVariant?.duration || service.duration;

  const handleBook = () => {
    const bookable = serviceWithSelectedVariant(service, selectedVariantId, themeId);
    openSiteBookingForService(bookable, themeId);
  };

  return (
    <div
      key={service.id}
      data-testid="site-directory-card"
      data-theme={themeId}
      data-service-name={service.name}
      data-category={service.category}
      className={look.cardClass}
      style={look.cardStyle}
    >
      <ServiceVisual
        src={visual.url || undefined}
        alt={visual.alt}
        aspectRatio="16/9"
        rounded={look.mediaRounded}
        className="w-full"
        glyph={Glyph}
        glyphColor={look.accent}
        glyphBg={look.card}
        glyphBorder={look.line}
      />

      <div className="flex items-start justify-between gap-2 min-w-0 mt-3">
        <button
          type="button"
          data-testid="site-directory-open-detail"
          data-service-name={service.name}
          onClick={() => onOpenDetail(serviceWithSelectedVariant(service, selectedVariantId, themeId))}
          className="min-w-0 text-left flex-1 cursor-pointer"
        >
          <h3 className={look.nameClass} style={look.nameStyle}>{shown.name}</h3>
          <p className="text-[10px] uppercase tracking-[0.16em] mt-0.5 font-semibold" style={look.categoryStyle}>
            {translateCategory(shown.category, locale)}
          </p>
        </button>

        {offer && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span data-testid="site-directory-offer-badge" className={look.badgeClass} style={look.badgeStyle}>
              {offer.promotionalBadge || 'Offer'}
            </span>
            <span data-testid="service-offer-applied" className="text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
              🏷️ {locale === 'hi' ? 'ऑफ़र लागू' : 'Offer Applied'}
            </span>
          </div>
        )}
      </div>

      <p className="text-[11px] mt-2 leading-relaxed line-clamp-2 break-words" style={look.descStyle}>
        {shown.description}
      </p>

      {/* Variant Selector */}
      {variants.length > 0 && (
        <div data-testid="variant-selector" className="mt-3 space-y-1">
          <span className="text-[9px] font-extrabold uppercase tracking-wider block" style={{ color: look.accent }}>
            {siteVariantsText(themeId, locale).selectVariantLabel}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {variants.map((variant) => {
              const isSelected = variant.id === selectedVariantId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  data-testid="variant-option"
                  data-variant-id={variant.id}
                  data-variant-selected={isSelected ? 'true' : 'false'}
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                    isSelected ? 'ring-1 shadow-xs' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: isSelected ? look.accent : 'transparent',
                    color: isSelected ? '#ffffff' : look.text,
                    borderColor: isSelected ? look.accent : look.line,
                  }}
                >
                  {variant.name} {isSelected && <span data-testid="variant-selected">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t" style={{ borderColor: look.line }}>
        <span className="flex items-center gap-1.5 flex-wrap min-w-0">
          {offer ? (
            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-[10px] line-through opacity-55" style={look.priceStyle}>{formatCurrency(pricing.basePrice)}</span>
              <span data-testid="site-directory-price" className="text-sm font-extrabold" style={look.priceStyle}>
                <span data-testid="variant-price">{formatCurrency(pricing.finalPrice)}</span>
              </span>
            </span>
          ) : (
            <span data-testid="site-directory-price" className="text-sm font-extrabold" style={look.priceStyle}>
              <span data-testid="variant-price">{formatCurrency(pricing.finalPrice)}</span>
            </span>
          )}
          {offer && (
            <span data-testid="site-directory-discount" className="text-[9px] font-bold whitespace-nowrap" style={look.discountStyle}>
              {featuredDiscountLabel(offer)}
            </span>
          )}
        </span>

        <span data-testid="site-directory-duration" className="inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={look.durationStyle}>
          <Clock className="w-3 h-3" style={{ color: look.accent }} />
          <span data-testid="variant-duration">{activeDuration} {S['common.mins']}</span>
        </span>
      </div>

      <button
        type="button"
        data-testid="site-directory-book"
        data-service-name={service.name}
        onClick={handleBook}
        className={look.ctaClass}
        style={look.ctaStyle}
      >
        {S[look.ctaKey]}
      </button>
    </div>
  );
}

export default function SiteServiceDirectory({ themeId, data, mode }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const S = { ...siteText(themeId, locale), ...structureText(themeId, locale) };
  const X = structureCopyFrom(S);
  const copy = serviceDirectoryText(locale);
  const look = buildLook(themeId, appearance);

  const services = useMemo(() => directoryServicesForTheme(data, themeId), [data, themeId]);
  const categories = useMemo(() => distinctServiceCategories(services), [services]);
  const status = resolveSectionState('services', services);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | string>('all');
  const [sort, setSort] = useState<ServiceSort>('default');
  // PHASE 12.6 — selected service for the detail modal.
  const [detailService, setDetailService] = useState<Service | null>(null);

  // PHASE 12.5 — a theme switch always resets search / filter / sort so a
  // previous theme's query or category can never leak into the new theme.
  // PHASE 12.6 — the open detail modal is also closed on theme switch.
  useEffect(() => {
    setSearch('');
    setCategory('all');
    setSort('default');
    setDetailService(null);
  }, [themeId]);

  // Defensive: a stale category filter (from a previous data set) must never
  // hide the active theme's services.
  useEffect(() => {
    if (category !== 'all' && !categories.includes(category)) {
      setCategory('all');
    }
  }, [categories, category]);

  const filtersActive = search.trim() !== '' || category !== 'all' || sort !== 'default';
  const clearFilters = () => {
    setSearch('');
    setCategory('all');
    setSort('default');
  };

  const visible = useMemo(
    () => filterAndSortServices(services, {
      search, category, sort, suggestedOnly: false, activeOnly: false,
    }, locale),
    [services, search, category, sort, locale],
  );

  const isNail = themeId === 'nail_lash_studio';
  const eyebrow = isNail ? S.menuEyebrow : S.servicesEyebrow;
  const title = isNail ? S.menuTitle : S.servicesTitle;
  const subtitle = isNail ? S.menuBody : S.servicesSubtitle;

  const palette = {
    accent: look.accent,
    text: look.text,
    muted: look.muted,
    card: look.card,
    line: look.line,
    invert: look.invert,
  };

  const gridClass = `grid gap-3 mt-6 ${siteGrid(mode, look.grid)}`;

  const renderCard = (service: (typeof services)[number]) => (
    <ServiceDirectoryCard
      key={service.id}
      service={service}
      themeId={themeId}
      data={data}
      locale={locale}
      look={look}
      S={S}
      onOpenDetail={(s) => setDetailService(s)}
    />
  );

  return (
    <>
      <div
        {...sectionProps('services', status)}
        data-testid="site-services-directory"
        data-theme={themeId}
        className={`site-section min-w-0 ${look.sectionClass}`}
        style={look.sectionStyle}
      >
        <div className={`${look.maxW} mx-auto`}>
        <div className={look.header === 'center' ? 'text-center' : ''}>
          <span className={look.eyebrowClass} style={look.eyebrowStyle}>{eyebrow}</span>
          <h2 className={look.titleClass} style={look.titleStyle}>{title}</h2>
          {subtitle ? (
            <p className="text-xs mt-3 max-w-md mx-auto leading-relaxed" style={look.subtitleStyle}>{subtitle}</p>
          ) : null}
          {look.divider ? <div className={look.divider} style={{ backgroundColor: look.accent }} /> : null}
        </div>

        {status === 'ready' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: look.muted }} />
                <input
                  type="search"
                  data-testid="site-directory-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  className={`${look.searchClass} pl-9`}
                  style={look.searchStyle}
                  aria-label={copy.searchPlaceholder}
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  data-testid="site-directory-sort"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as ServiceSort)}
                  className={look.sortClass}
                  style={look.sortStyle}
                  aria-label={copy.sortLabel}
                >
                  <option value="default">{copy.sortDefault}</option>
                  <option value="name_asc">{copy.sortNameAsc}</option>
                  <option value="price_asc">{copy.sortPriceAsc}</option>
                  <option value="price_desc">{copy.sortPriceDesc}</option>
                  <option value="duration_asc">{copy.sortDurationAsc}</option>
                  <option value="duration_desc">{copy.sortDurationDesc}</option>
                </select>
                {filtersActive && (
                  <button
                    type="button"
                    data-testid="site-directory-clear"
                    onClick={clearFilters}
                    className={look.clearClass}
                    style={look.clearStyle}
                  >
                    {copy.clearFilters}
                  </button>
                )}
              </div>
            </div>

            <div className={`${look.tabsWrapClass} mt-3`} role="tablist" aria-label={copy.allCategories}>
              <button
                type="button"
                data-testid="site-directory-category"
                data-category="all"
                onClick={() => setCategory('all')}
                className={look.tabClass}
                style={category === 'all' ? look.tabActiveStyle : look.tabStyle}
                aria-pressed={category === 'all'}
              >
                {copy.allCategories}
              </button>
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  data-testid="site-directory-category"
                  data-category={item}
                  onClick={() => setCategory(item)}
                  className={look.tabClass}
                  style={category === item ? look.tabActiveStyle : look.tabStyle}
                  aria-pressed={category === item}
                >
                  {translateCategory(item, locale)}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div data-testid="site-directory-empty" className="text-center mt-8">
                <p data-testid="site-directory-no-results" className="text-xs" style={{ color: look.muted }}>
                  {copy.noResults}
                </p>
                <button
                  type="button"
                  data-testid="site-directory-empty-clear"
                  onClick={clearFilters}
                  className={`${look.clearClass} mt-3`}
                  style={{ ...look.clearStyle, backgroundColor: look.accent, color: look.invert, borderColor: 'transparent' }}
                >
                  {copy.clearFilters}
                </button>
              </div>
            ) : (
              <div data-testid="site-directory-grid" className={gridClass}>
                {visible.map(renderCard)}
              </div>
            )}
          </>
        )}

        {status !== 'ready' && (
          <div className="mt-6">
            <SectionStatePanel
              status={status}
              copy={X}
              palette={palette}
              emptyTitle={S.servicesEmpty}
              section="services"
              mode={mode}
            />
          </div>
        )}
        </div>
      </div>

      {detailService && (
        <SiteServiceDetail
          themeId={themeId}
          data={data}
          service={detailService}
          mode={mode}
          onClose={() => setDetailService(null)}
        />
      )}
    </>
  );
}
