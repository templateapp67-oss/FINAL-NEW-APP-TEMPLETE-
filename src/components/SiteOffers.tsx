import React, { useMemo, useState } from 'react';
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import type { ViewportMode } from '../lib/siteStructure';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { openSiteBooking, openSiteBookingForService } from '../lib/siteBooking';
import { getThemeOffers, formatValidityRange, ResolvedOffer } from '../lib/siteOffers';
import { siteOffersText } from '../lib/siteOffersI18n';
import { BARBER_SURFACES, BEAUTY_SPA_SURFACES, FAMILY_SURFACES, HAIR_STUDIO_SURFACES, NAIL_LASH_SURFACES, surfacesOf } from '../lib/themeSurfaces';
import { activeCatalogItems, resolveSectionState, sectionProps, siteGrid, siteSectionDomId } from '../lib/siteStructure';
import { SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import SiteSkeleton from './SiteSkeleton';
import { BundlePrice } from './PromotionalPricing';
import { Tag, Sparkles, Scissors, Users, Leaf, ArrowRight, Clock, Package as PackageIcon } from 'lucide-react';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  mode: ViewportMode;
}

export default function SiteOffers({ themeId, data, mode }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const copy = siteOffersText(themeId, locale);

  const [nonce, setNonce] = useState(0);
  const retry = () => setNonce((n) => n + 1);

  const activeOffers = useMemo(
    () => getThemeOffers(themeId, data),
    [themeId, data, nonce],
  );

  const activePackages = useMemo(
    () => activeCatalogItems(data.packages),
    [data.packages],
  );

  const combinedItems = useMemo(
    () => [...activeOffers, ...activePackages],
    [activeOffers, activePackages],
  );

  const offersState = resolveSectionState('offers', combinedItems);

  // Surface & palette resolution
  const surfaces = useMemo(() => {
    switch (themeId) {
      case 'barber_mens_grooming':
        return surfacesOf(BARBER_SURFACES, appearance);
      case 'hair_studio_color_bar':
        return surfacesOf(HAIR_STUDIO_SURFACES, appearance);
      case 'beauty_skin_spa':
        return surfacesOf(BEAUTY_SPA_SURFACES, appearance);
      case 'family_full_service':
        return surfacesOf(FAMILY_SURFACES, appearance);
      case 'nail_lash_studio':
        return surfacesOf(NAIL_LASH_SURFACES, appearance);
    }
  }, [themeId, appearance]);

  const X = structureCopyFrom({
    structLoadingText: copy.loadingText,
    structErrorTitle: copy.errorTitle,
    structErrorBody: copy.errorBody,
    structRetry: copy.retryButton,
  });

  const sectionDomId = siteSectionDomId(themeId, 'offers');

  // Theme-specific visual theme rules
  const themeCardStyles = useMemo(() => {
    switch (themeId) {
      case 'barber_mens_grooming': {
        const t = surfacesOf(BARBER_SURFACES, appearance);
        return {
          bg: t.charcoal,
          cardBg: t.card,
          borderColor: t.gold,
          accentColor: t.gold,
          textColor: t.textStrong,
          mutedColor: t.muted,
          chipBg: t.gold,
          chipText: '#141414',
          ctaStyle: { backgroundColor: t.gold, color: '#141414' },
          badgeStyle: { backgroundColor: t.gold, color: '#141414' },
          rounded: 'rounded-none',
          titleFont: 'font-black uppercase tracking-wider text-base md:text-lg',
          eyebrowFont: 'font-bold uppercase tracking-[0.35em] text-[10px]',
          icon: <Scissors className="w-4 h-4 text-[#c9a227]" />,
        };
      }
      case 'hair_studio_color_bar': {
        const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
        return {
          bg: t.paper,
          cardBg: t.card,
          borderColor: t.line,
          accentColor: t.roseDeep,
          textColor: t.ink,
          mutedColor: t.muted,
          chipBg: t.roseSoft,
          chipText: t.roseDeep,
          ctaStyle: { backgroundColor: t.roseDeep, color: '#ffffff' },
          badgeStyle: { backgroundColor: t.roseDeep, color: '#ffffff' },
          rounded: 'rounded-md',
          titleFont: 'font-serif font-bold tracking-wide text-base md:text-lg',
          eyebrowFont: 'font-serif text-[10px] uppercase tracking-[0.3em]',
          icon: <Sparkles className="w-4 h-4 text-[#ac0053]" />,
        };
      }
      case 'beauty_skin_spa': {
        const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
        return {
          bg: t.beigeSoft,
          cardBg: t.card,
          borderColor: t.line,
          accentColor: t.emerald,
          textColor: t.textStrong,
          mutedColor: t.muted,
          chipBg: t.emeraldSoft,
          chipText: t.emerald,
          ctaStyle: { backgroundColor: t.emerald, color: '#ffffff' },
          badgeStyle: { backgroundColor: t.emerald, color: '#ffffff' },
          rounded: 'rounded-3xl',
          titleFont: 'font-serif font-bold tracking-wide text-base md:text-lg',
          eyebrowFont: 'font-serif text-[10px] uppercase tracking-[0.25em]',
          icon: <Leaf className="w-4 h-4 text-[#0b6623]" />,
        };
      }
      case 'family_full_service': {
        const t = surfacesOf(FAMILY_SURFACES, appearance);
        return {
          bg: t.bandBg,
          cardBg: t.card,
          borderColor: t.line,
          accentColor: t.sun,
          textColor: t.textStrong,
          mutedColor: t.muted,
          chipBg: t.sun,
          chipText: '#12385b',
          ctaStyle: { backgroundColor: t.sun, color: '#12385b' },
          badgeStyle: { backgroundColor: t.blue, color: '#ffffff' },
          rounded: 'rounded-2xl',
          titleFont: 'font-extrabold tracking-tight text-base md:text-lg',
          eyebrowFont: 'font-extrabold uppercase tracking-[0.2em] text-[10px]',
          icon: <Users className="w-4 h-4 text-[#0077b6]" />,
        };
      }
      case 'nail_lash_studio': {
        const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
        return {
          bg: t.cream,
          cardBg: t.card,
          borderColor: t.line,
          accentColor: t.pinkDeep,
          textColor: t.textStrong,
          mutedColor: t.muted,
          chipBg: t.pinkSoft,
          chipText: t.pinkDeep,
          ctaStyle: {
            backgroundImage: `linear-gradient(135deg, ${t.pinkDeep} 0%, #d81b60 100%)`,
            color: '#ffffff',
          },
          badgeStyle: {
            backgroundImage: `linear-gradient(135deg, ${t.pinkDeep} 0%, #d81b60 100%)`,
            color: '#ffffff',
          },
          rounded: 'rounded-3xl',
          titleFont: 'font-extrabold tracking-wide text-base md:text-lg uppercase',
          eyebrowFont: 'font-extrabold uppercase tracking-[0.25em] text-[10px]',
          icon: <Sparkles className="w-4 h-4 text-[#f054a3]" />,
        };
      }
    }
  }, [themeId, appearance]);

  const style = themeCardStyles;

  return (
    <div
      {...sectionProps('offers', offersState, sectionDomId)}
      className="site-section px-5 md:px-8 py-14 border-t transition-colors duration-300"
      style={{ backgroundColor: style.bg, borderColor: style.borderColor }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-2">
            {style.icon}
            <span className={style.eyebrowFont} style={{ color: style.accentColor }}>
              {copy.eyebrow}
            </span>
          </div>
          <h3 className={style.titleFont} style={{ color: style.textColor }}>
            {copy.title}
          </h3>
        </div>

        {/* Dynamic States */}
        {offersState === 'loading' ? (
          <div data-testid="site-offers-loading" className="py-4">
            <SiteSkeleton type="offers" />
          </div>
        ) : offersState === 'error' ? (
          <SectionStatePanel
            status="error"
            onRetry={retry}
            copy={X}
            palette={{
              accent: style.accentColor,
              text: style.textColor,
              muted: style.mutedColor,
              card: style.cardBg,
              line: style.borderColor,
            }}
          />
        ) : offersState === 'empty' ? (
          <SectionStatePanel
            status="empty"
            copy={X}
            emptyTitle={copy.emptyTitle}
            emptyBody={copy.emptyBody}
            palette={{
              accent: style.accentColor,
              text: style.textColor,
              muted: style.mutedColor,
              card: style.cardBg,
              line: style.borderColor,
            }}
          />
        ) : (
          <div
            data-testid="site-offers"
            className={`grid gap-6 ${siteGrid(mode, { desktop: 2, tablet: 2, mobile: 1 })}`}
          >
            {/* Service Offers */}
            {activeOffers.map((offer) => (
              <div
                key={offer.id}
                data-testid="offer-card"
                className={`p-6 border transition-all duration-300 hover:shadow-lg flex flex-col justify-between gap-5 relative overflow-hidden ${style.rounded}`}
                style={{ backgroundColor: style.cardBg, borderColor: style.borderColor }}
              >
                {/* Top Badge & Validity */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span
                    data-testid="offer-badge"
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-full shadow-sm"
                    style={style.badgeStyle}
                  >
                    <Tag className="w-3 h-3" />
                    {offer.promotionalBadge}
                  </span>

                  <div
                    data-testid="offer-validity"
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: style.mutedColor }}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: style.accentColor }} />
                    <span>{copy.validityLabel} {formatValidityRange(offer.startDate, offer.endDate, locale)}</span>
                  </div>
                </div>

                {/* Offer Title & Description */}
                <div className="space-y-2">
                  <h4
                    data-testid="offer-title"
                    className="text-base md:text-lg font-black tracking-tight leading-snug"
                    style={{ color: style.textColor }}
                  >
                    {offer.title}
                  </h4>
                  <p
                    data-testid="offer-description"
                    className="text-xs leading-relaxed"
                    style={{ color: style.mutedColor }}
                  >
                    {offer.description}
                  </p>
                </div>

                {/* Applicable Service */}
                <div
                  className="p-3 border rounded-xl flex items-center justify-between gap-2"
                  style={{ backgroundColor: style.bg, borderColor: style.borderColor }}
                >
                  <div className="text-[11px] font-bold truncate">
                    <span className="block text-[9px] uppercase tracking-wider" style={{ color: style.mutedColor }}>
                      {copy.applicableServiceLabel}
                    </span>
                    <span data-testid="offer-service" className="font-extrabold" style={{ color: style.textColor }}>
                      {offer.service.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase shrink-0" style={{ color: style.mutedColor }}>
                    ⏱ {offer.service.duration} mins
                  </span>
                </div>

                {/* Price & Book CTA */}
                <div className="pt-2 border-t flex items-center justify-between gap-3" style={{ borderColor: style.borderColor }}>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: style.mutedColor }}>
                      {copy.originalPriceLabel}{' '}
                      <span data-testid="offer-original-price" className="line-through">
                        ₹{offer.originalPrice.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="text-base md:text-lg font-black" style={{ color: style.accentColor }}>
                      <span className="text-[10px] uppercase font-bold mr-1">{copy.discountedPriceLabel}</span>
                      <span data-testid="offer-discounted-price">₹{offer.discountedPrice.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="offer-book-now"
                    onClick={() => openSiteBookingForService(offer.service, themeId)}
                    className="site-touch px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.15em] transition-all hover:brightness-110 flex items-center gap-1.5 shadow-sm shrink-0"
                    style={style.ctaStyle}
                  >
                    {copy.bookOfferCta}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Packages / Combos */}
            {activePackages.map((p) => (
              <div
                key={p.id}
                data-testid="offer-card"
                className={`p-6 border transition-all duration-300 hover:shadow-lg flex flex-col justify-between gap-5 relative overflow-hidden ${style.rounded}`}
                style={{ backgroundColor: style.cardBg, borderColor: style.borderColor }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span
                    data-testid="offer-badge"
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-full shadow-sm"
                    style={style.badgeStyle}
                  >
                    <PackageIcon className="w-3 h-3" />
                    {p.promotionalBadge || 'Best Value'}
                  </span>
                  <div
                    data-testid="offer-validity"
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: style.mutedColor }}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: style.accentColor }} />
                    <span>⏱ {p.duration} mins</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4
                    data-testid="offer-title"
                    className="text-base md:text-lg font-black tracking-tight leading-snug"
                    style={{ color: style.textColor }}
                  >
                    {p.name}
                  </h4>
                  <p
                    data-testid="offer-description"
                    className="text-xs leading-relaxed"
                    style={{ color: style.mutedColor }}
                  >
                    {p.description}
                  </p>
                </div>

                <div
                  className="p-3 border rounded-xl flex items-center justify-between gap-2"
                  style={{ backgroundColor: style.bg, borderColor: style.borderColor }}
                >
                  <div className="text-[11px] font-bold truncate">
                    <span className="block text-[9px] uppercase tracking-wider" style={{ color: style.mutedColor }}>
                      {copy.applicableServiceLabel}
                    </span>
                    <span data-testid="offer-service" className="font-extrabold" style={{ color: style.textColor }}>
                      {p.includedServices?.map((s) => s.name).join(' + ') || p.name}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t flex items-center justify-between gap-3" style={{ borderColor: style.borderColor }}>
                  <div>
                    {p.originalPrice && p.originalPrice > p.price && (
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: style.mutedColor }}>
                        {copy.originalPriceLabel}{' '}
                        <span data-testid="offer-original-price" className="line-through">
                          ₹{p.originalPrice.toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                    <div className="text-base md:text-lg font-black" style={{ color: style.accentColor }}>
                      <span className="text-[10px] uppercase font-bold mr-1">{copy.discountedPriceLabel}</span>
                      <span data-testid="offer-discounted-price">₹{p.price.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="offer-book-now"
                    data-open-booking="true"
                    onClick={openSiteBooking}
                    className="site-touch px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.15em] transition-all hover:brightness-110 flex items-center gap-1.5 shadow-sm shrink-0"
                    style={style.ctaStyle}
                  >
                    {copy.bookOfferCta}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
