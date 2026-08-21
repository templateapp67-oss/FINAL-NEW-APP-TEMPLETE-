/**
 * PHASE 12.2 + 12.3 — FEATURED SERVICES section (all five themes).
 *
 * Sits directly below Trust/Stats and shows ONLY the active theme's own
 * suggested services (theme-scoped, `is_suggested` catalog). Each card shows:
 *
 *   - Service Name + Short Description
 *   - Price / Starting Price (offer-aware; "From ₹X" when price options vary)
 *   - Duration
 *   - Service Image/Icon where available (real media, else a themed icon)
 *   - Offer/Discount Badge + the discount percentage/amount (active offers only,
 *     start/end dates respected, expired offers disappear automatically)
 *   - Suggested / Popular badge (data-driven: `isSuggested`, top-ranked =
 *     "Popular")
 *   - Book Now / Select Service CTA — opens the EXISTING booking flow with the
 *     selected service preserved (see `openSiteBookingForService`).
 *
 * Each theme keeps its own card design (surfaces + typography + shape); no two
 * themes share the same card styling. Loading / empty / error states honour the
 * shared `setWebsiteSectionFlagsForTests({ featured: … })` seam plus a natural
 * async loading/error lifecycle for the database path.
 */
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { siteText } from '../lib/siteI18n';
import { structureText } from '../lib/siteStructureI18n';
import { SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import { injectedSectionStatus, sectionProps, siteGrid } from '../lib/siteStructure';
import type { ViewportMode } from '../lib/siteStructure';
import {
  useFeaturedServices,
  featuredOfferFor,
  featuredPrice,
  featuredDiscountLabel,
  featuredStartingPrice,
  featuredServiceToService,
  localizeFeaturedService,
} from '../lib/siteFeaturedServices';
import type { FeaturedService } from '../lib/siteFeaturedServices';
import { openSiteBookingForService } from '../lib/siteBooking';
import { formatCurrency } from '../lib/pricing';
import { featuredCardText, startingPriceLabel } from '../lib/siteFeaturedI18n';
import { surfacesOf, BARBER_SURFACES, HAIR_STUDIO_SURFACES, BEAUTY_SPA_SURFACES, FAMILY_SURFACES, NAIL_LASH_SURFACES } from '../lib/themeSurfaces';
import {
  Baby,
  Droplets,
  Eye,
  Flower2,
  Hand,
  Package as PackageIcon,
  Palette,
  Scissors,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  mode: ViewportMode;
}

/** Theme-agnostic category → icon map (honest "icon where available"). */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Haircuts: Scissors,
  'Beard & Shave': Sparkles,
  'Grooming & Treatments': Droplets,
  'Styling & Cuts': Scissors,
  'Hair Color': Palette,
  Treatments: Droplets,
  'Facial & Skincare': Sparkles,
  'Spa & Body': Droplets,
  'Waxing & Threading': Flower2,
  Makeup: Palette,
  "Men's Services": Scissors,
  "Women's Services": Sparkles,
  'Kids Special': Baby,
  Combos: PackageIcon,
  'Nail Art & Gel': Palette,
  'Pedicure & Manicure': Hand,
  'Lash & Brow': Eye,
};

function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] || Sparkles;
}

interface FeaturedLook {
  sectionClass: string;
  sectionStyle: CSSProperties;
  maxW: string;
  grid: { desktop: 1 | 2 | 3 | 4 | 5; tablet?: 1 | 2 | 3 | 4; mobile: 1 | 2 };
  eyebrowClass: string;
  eyebrowStyle: CSSProperties;
  titleClass: string;
  titleStyle: CSSProperties;
  cardClass: string;
  cardStyle: CSSProperties;
  mediaClass: string;
  iconWrapClass: string;
  iconWrapStyle: CSSProperties;
  iconColor: string;
  nameClass: string;
  nameStyle: CSSProperties;
  categoryClass: string;
  categoryStyle: CSSProperties;
  descClass: string;
  descStyle: CSSProperties;
  priceStyle: CSSProperties;
  durationStyle: CSSProperties;
  badgeClass: string;
  badgeStyle: CSSProperties;
  statusBadgeClass: string;
  statusBadgeStyle: CSSProperties;
  popularBadgeStyle: CSSProperties;
  discountStyle: CSSProperties;
  ctaClass: string;
  ctaStyle: CSSProperties;
  ctaKey: 'common.bookSlot' | 'common.bookThisService' | 'common.bookNow';
}

function buildLook(themeId: SiteHeaderThemeId, appearance: 'light' | 'dark'): FeaturedLook {
  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return {
      sectionClass: 'px-6 py-14',
      sectionStyle: { backgroundColor: t.charcoalSoft },
      maxW: 'max-w-3xl',
      grid: { desktop: 2, tablet: 2, mobile: 1 },
      eyebrowClass: 'text-[10px] font-bold uppercase tracking-[0.35em]',
      eyebrowStyle: { color: t.accentText },
      titleClass: 'text-2xl font-black uppercase tracking-[0.05em] mt-2',
      titleStyle: { color: t.textStrong },
      cardClass: 'border p-4 min-w-0 flex flex-col',
      cardStyle: { backgroundColor: t.card, borderColor: t.gold },
      mediaClass: 'w-10 h-10 object-cover shrink-0',
      iconWrapClass: 'w-10 h-10 shrink-0 border flex items-center justify-center',
      iconWrapStyle: { backgroundColor: t.well, borderColor: t.line },
      iconColor: t.gold,
      nameClass: 'text-sm font-black uppercase tracking-wider break-words',
      nameStyle: { color: t.textStrong },
      categoryClass: 'text-[10px] uppercase tracking-wider mt-0.5',
      categoryStyle: { color: t.muted },
      descClass: 'text-[11px] mt-2 leading-relaxed line-clamp-2 break-words',
      descStyle: { color: t.muted },
      priceStyle: { color: t.gold },
      durationStyle: { color: t.muted },
      badgeClass: 'text-[8px] font-black uppercase tracking-wider px-2 py-0.5 border',
      badgeStyle: { backgroundColor: t.goldSoft, color: t.goldBright, borderColor: t.gold },
      statusBadgeClass: 'text-[8px] font-black uppercase tracking-wider px-2 py-0.5 border',
      statusBadgeStyle: { backgroundColor: 'transparent', color: t.muted, borderColor: t.line },
      popularBadgeStyle: { backgroundColor: t.gold, color: '#141414', borderColor: t.gold },
      discountStyle: { color: t.goldBright },
      ctaClass: 'site-touch mt-4 w-full py-2.5 text-[10px] font-black uppercase tracking-[0.15em]',
      ctaStyle: { backgroundColor: t.gold, color: '#141414' },
      ctaKey: 'common.bookSlot',
    };
  }
  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return {
      sectionClass: 'px-5 py-14',
      sectionStyle: { backgroundColor: t.paperDeep },
      maxW: 'max-w-3xl',
      grid: { desktop: 2, tablet: 2, mobile: 1 },
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      eyebrowStyle: { color: t.roseDeep },
      titleClass: 'text-2xl font-serif mt-2',
      titleStyle: { color: t.ink },
      cardClass: 'border p-5 min-w-0 flex flex-col',
      cardStyle: { backgroundColor: t.card, borderColor: t.line },
      mediaClass: 'w-10 h-10 object-cover shrink-0',
      iconWrapClass: 'w-10 h-10 shrink-0 border flex items-center justify-center',
      iconWrapStyle: { backgroundColor: t.paper, borderColor: t.line },
      iconColor: t.roseDeep,
      nameClass: 'text-sm font-serif font-semibold break-words',
      nameStyle: { color: t.ink },
      categoryClass: 'text-[10px] uppercase tracking-[0.18em] mt-1',
      categoryStyle: { color: t.roseDeep },
      descClass: 'text-[11px] mt-2 leading-relaxed line-clamp-2 break-words',
      descStyle: { color: t.muted },
      priceStyle: { color: t.roseDeep },
      durationStyle: { color: t.muted },
      badgeClass: 'text-[8px] uppercase tracking-[0.16em] font-semibold px-2 py-0.5 border',
      badgeStyle: { backgroundColor: t.roseSoft, color: t.roseDeep, borderColor: t.roseDeep },
      statusBadgeClass: 'text-[8px] uppercase tracking-[0.16em] font-semibold px-2 py-0.5 border',
      statusBadgeStyle: { backgroundColor: 'transparent', color: t.muted, borderColor: t.line },
      popularBadgeStyle: { backgroundColor: t.rose, color: '#ffffff', borderColor: t.rose },
      discountStyle: { color: t.roseBright },
      ctaClass: 'site-touch mt-4 self-start text-[10px] uppercase tracking-[0.2em] font-semibold underline underline-offset-4',
      ctaStyle: { color: t.roseDeep },
      ctaKey: 'common.bookThisService',
    };
  }
  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return {
      sectionClass: 'px-5 py-14',
      sectionStyle: { backgroundColor: t.cream },
      maxW: 'max-w-3xl',
      grid: { desktop: 2, tablet: 2, mobile: 1 },
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      eyebrowStyle: { color: t.emerald },
      titleClass: 'text-2xl font-serif mt-2',
      titleStyle: { color: t.text },
      cardClass: 'rounded-3xl border p-5 min-w-0 flex flex-col',
      cardStyle: { backgroundColor: t.card, borderColor: t.line },
      mediaClass: 'w-10 h-10 object-cover rounded-full shrink-0',
      iconWrapClass: 'w-10 h-10 shrink-0 rounded-full border flex items-center justify-center',
      iconWrapStyle: { backgroundColor: t.emeraldSoft, borderColor: t.line },
      iconColor: t.emerald,
      nameClass: 'text-sm font-serif font-semibold break-words',
      nameStyle: { color: t.text },
      categoryClass: 'text-[10px] uppercase tracking-[0.18em] mt-1',
      categoryStyle: { color: t.emerald },
      descClass: 'text-[11px] mt-2 leading-relaxed line-clamp-2 break-words',
      descStyle: { color: t.muted },
      priceStyle: { color: t.emerald },
      durationStyle: { color: t.muted },
      badgeClass: 'text-[8px] uppercase tracking-[0.16em] font-semibold px-2 py-0.5 rounded-full',
      badgeStyle: { backgroundColor: t.emeraldSoft, color: t.emeraldDeep, borderColor: 'transparent' },
      statusBadgeClass: 'text-[8px] uppercase tracking-[0.16em] font-semibold px-2 py-0.5 rounded-full',
      statusBadgeStyle: { backgroundColor: t.sage, color: t.muted, borderColor: 'transparent' },
      popularBadgeStyle: { backgroundColor: t.emerald, color: '#ffffff', borderColor: 'transparent' },
      discountStyle: { color: t.emeraldMid },
      ctaClass: 'site-touch mt-4 w-full py-2 rounded-full text-[10px] uppercase tracking-[0.2em] font-semibold',
      ctaStyle: { backgroundColor: t.emerald, color: '#ffffff' },
      ctaKey: 'common.bookNow',
    };
  }
  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return {
      sectionClass: 'px-5 py-12',
      sectionStyle: { backgroundColor: t.white },
      maxW: 'max-w-3xl',
      grid: { desktop: 2, tablet: 2, mobile: 1 },
      eyebrowClass: 'inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em]',
      eyebrowStyle: { color: t.tealDeep },
      titleClass: 'text-2xl font-extrabold leading-tight tracking-[-0.03em] mt-3',
      titleStyle: { color: t.heading },
      cardClass: 'rounded-2xl border p-4 min-w-0 flex flex-col',
      cardStyle: { backgroundColor: t.well, borderColor: t.line },
      mediaClass: 'w-10 h-10 object-cover rounded-xl shrink-0',
      iconWrapClass: 'w-10 h-10 shrink-0 rounded-xl flex items-center justify-center',
      iconWrapStyle: { backgroundColor: t.sky, borderColor: 'transparent' },
      iconColor: t.teal,
      nameClass: 'text-sm font-extrabold break-words',
      nameStyle: { color: t.ink },
      categoryClass: 'text-[9px] font-bold uppercase tracking-[0.12em] mt-1',
      categoryStyle: { color: t.tealDeep },
      descClass: 'text-[10px] mt-2 leading-relaxed line-clamp-2 break-words',
      descStyle: { color: t.muted },
      priceStyle: { color: t.teal },
      durationStyle: { color: t.muted },
      badgeClass: 'text-[8px] font-extrabold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full',
      badgeStyle: { backgroundColor: t.sky, color: t.blue, borderColor: 'transparent' },
      statusBadgeClass: 'text-[8px] font-extrabold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full',
      statusBadgeStyle: { backgroundColor: t.sunSoft, color: t.ink, borderColor: 'transparent' },
      popularBadgeStyle: { backgroundColor: t.sun, color: '#12385b', borderColor: 'transparent' },
      discountStyle: { color: t.blue },
      ctaClass: 'site-touch mt-4 w-full py-2.5 rounded-xl text-[9px] font-extrabold uppercase tracking-[0.13em]',
      ctaStyle: { backgroundColor: t.teal, color: '#ffffff' },
      ctaKey: 'common.bookNow',
    };
  }
  // nail_lash_studio
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  return {
    sectionClass: 'px-5 py-12',
    sectionStyle: { backgroundColor: t.cream },
    maxW: 'max-w-4xl',
    grid: { desktop: 4, tablet: 2, mobile: 2 },
    eyebrowClass: 'inline-flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.28em]',
    eyebrowStyle: { color: t.pinkDeep },
    titleClass: 'text-2xl font-extrabold leading-tight tracking-[-0.02em] mt-3',
    titleStyle: { color: t.ink },
    cardClass: 'rounded-[1.5rem] border p-4 min-w-0 flex flex-col',
    cardStyle: { backgroundColor: t.card, borderColor: t.line },
    mediaClass: 'w-10 h-10 object-cover rounded-xl shrink-0',
    iconWrapClass: 'w-10 h-10 shrink-0 rounded-xl flex items-center justify-center',
    iconWrapStyle: { backgroundColor: t.pinkSoft, borderColor: 'transparent' },
    iconColor: t.pinkDeep,
    nameClass: 'text-sm font-extrabold break-words',
    nameStyle: { color: t.ink },
    categoryClass: 'text-[8px] font-bold uppercase tracking-[0.14em] mt-1',
    categoryStyle: { color: t.pinkDeep },
    descClass: 'text-[9px] mt-2 leading-relaxed line-clamp-2 break-words',
    descStyle: { color: t.muted },
    priceStyle: { color: t.pinkDeep },
    durationStyle: { color: t.muted },
    badgeClass: 'text-[8px] font-extrabold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full',
    badgeStyle: { backgroundColor: t.pinkSoft, color: t.pinkDeep, borderColor: 'transparent' },
    statusBadgeClass: 'text-[8px] font-extrabold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full',
    statusBadgeStyle: { backgroundColor: t.sand, color: t.muted, borderColor: 'transparent' },
    popularBadgeStyle: { backgroundColor: t.pink, color: '#ffffff', borderColor: 'transparent' },
    discountStyle: { color: t.pinkGlow },
    ctaClass: 'site-touch mt-4 w-full py-2.5 rounded-full text-[9px] font-extrabold uppercase tracking-[0.2em]',
    ctaStyle: { backgroundColor: t.pink, color: '#ffffff' },
    ctaKey: 'common.bookNow',
  };
}

export default function SiteFeaturedServices({ themeId, data, mode }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const { status: runtimeStatus, services, retry } = useFeaturedServices(themeId);
  const S = { ...siteText(themeId, locale), ...structureText(themeId, locale) };
  const X = structureCopyFrom(S);
  const copy = featuredCardText(locale);
  const look = buildLook(themeId, appearance);

  // The test seam (loading/error/empty) overrides the natural async state.
  const forced = injectedSectionStatus('featured');
  const status = forced ?? runtimeStatus;

  const offers = useMemo(() => data.offers ?? [], [data.offers]);
  const gridClass = `grid gap-3 mt-7 ${siteGrid(mode, look.grid)}`;

  const palette = {
    accent: String(look.priceStyle.color),
    text: String(look.nameStyle.color),
    muted: String(look.durationStyle.color),
    card: String(look.cardStyle.backgroundColor),
    line: String(look.cardStyle.borderColor),
    invert: String(look.ctaStyle.color || '#ffffff'),
  };

  const renderCard = (service: FeaturedService, index: number) => {
    const shown = localizeFeaturedService(service, themeId, locale);
    const offer = featuredOfferFor(service, offers, themeId);
    const price = featuredPrice(service, offer);
    const starting = featuredStartingPrice(service);
    const Icon = categoryIcon(service.category);
    const isPopular = service.isSuggested && service.suggestedSortOrder === 0;
    const hasMedia = Boolean(service.media?.iconUrl || service.media?.imageUrl);

    const priceNode = starting.hasVariants && !offer ? (
      <span data-testid="site-featured-price" className="text-sm font-extrabold" style={look.priceStyle}>
        {startingPriceLabel(formatCurrency(starting.min), locale)}
      </span>
    ) : (
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        {offer && (
          <span className="text-[10px] line-through opacity-55" style={look.priceStyle}>{formatCurrency(price.base)}</span>
        )}
        <span data-testid="site-featured-price" className="text-sm font-extrabold" style={look.priceStyle}>
          {formatCurrency(price.final)}
        </span>
      </span>
    );

    return (
      <div
        key={service.key}
        data-testid="site-featured-card"
        data-theme={themeId}
        data-service-name={service.name}
        data-suggested={service.isSuggested ? 'true' : 'false'}
        className={look.cardClass}
        style={look.cardStyle}
      >
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="flex items-start gap-3 min-w-0">
            {hasMedia ? (
              <img
                src={service.media?.iconUrl || service.media?.imageUrl}
                alt=""
                className={look.mediaClass}
              />
            ) : (
              <span className={look.iconWrapClass} style={look.iconWrapStyle} data-testid="site-featured-icon" aria-hidden>
                <Icon className="w-4 h-4" style={{ color: look.iconColor }} />
              </span>
            )}
            <div className="min-w-0">
              <h3 className={look.nameClass} style={look.nameStyle}>{shown.name}</h3>
              <p className={look.categoryClass} style={look.categoryStyle}>{shown.category}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1 shrink-0">
            {isPopular ? (
              <span
                data-testid="site-featured-popular-badge"
                className={look.statusBadgeClass}
                style={{ ...look.statusBadgeStyle, ...look.popularBadgeStyle }}
              >
                {copy.popular}
              </span>
            ) : service.isSuggested ? (
              <span data-testid="site-featured-suggested-badge" className={look.statusBadgeClass} style={look.statusBadgeStyle}>
                {copy.suggested}
              </span>
            ) : null}
            {offer && (
              <span data-testid="site-featured-offer-badge" className={look.badgeClass} style={look.badgeStyle}>
                {offer.promotionalBadge || 'Offer'}
              </span>
            )}
          </div>
        </div>

        <p className={look.descClass} style={look.descStyle}>{shown.description}</p>

        <div className="flex items-center justify-between gap-2 mt-3">
          <span className="flex items-center gap-1.5 flex-wrap min-w-0">
            {priceNode}
            {offer && (
              <span data-testid="site-featured-discount" className="text-[9px] font-bold whitespace-nowrap" style={look.discountStyle}>
                {featuredDiscountLabel(offer)}
              </span>
            )}
          </span>
          <span data-testid="site-featured-duration" className="text-[10px] font-semibold whitespace-nowrap" style={look.durationStyle}>
            {service.duration} {S['common.mins']}
          </span>
        </div>

        <button
          type="button"
          data-testid="site-featured-book"
          data-service-name={service.name}
          onClick={() => openSiteBookingForService(featuredServiceToService(service, themeId), themeId)}
          className={look.ctaClass}
          style={look.ctaStyle}
        >
          {S[look.ctaKey]}
        </button>
      </div>
    );
  };

  return (
    <div
      {...sectionProps('featured', status)}
      data-testid="site-featured"
      data-theme={themeId}
      className={`site-section min-w-0 ${look.sectionClass}`}
      style={look.sectionStyle}
    >
      <div className={`${look.maxW} mx-auto`}>
        <div className="text-center mb-8">
          <span className={look.eyebrowClass} style={look.eyebrowStyle}>{S.featuredEyebrow}</span>
          <h2 className={look.titleClass} style={look.titleStyle}>{S.featuredTitle}</h2>
        </div>

        {status === 'ready' && (
          <div data-testid="site-featured-grid" className={gridClass}>
            {services.map((service, index) => renderCard(service, index))}
          </div>
        )}

        {status === 'loading' && (
          <div data-testid="site-featured-loading" className={gridClass}>
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className={`${look.cardClass} animate-pulse`}
                style={{ ...look.cardStyle, minHeight: '140px' }}
                aria-hidden
              >
                <div className="h-4 w-3/4 rounded" style={{ backgroundColor: look.durationStyle.color, opacity: 0.25 }} />
                <div className="h-3 w-1/3 mt-2 rounded" style={{ backgroundColor: look.durationStyle.color, opacity: 0.2 }} />
                <div className="h-3 w-full mt-3 rounded" style={{ backgroundColor: look.durationStyle.color, opacity: 0.15 }} />
                <div className="h-3 w-5/6 mt-2 rounded" style={{ backgroundColor: look.durationStyle.color, opacity: 0.15 }} />
              </div>
            ))}
          </div>
        )}

        {(status === 'error' || status === 'empty') && (
          <div className="mt-2">
            <SectionStatePanel
              status={status}
              copy={X}
              palette={palette}
              onRetry={status === 'error' ? retry : undefined}
              emptyTitle={S.featuredEmpty}
              section="featured"
              mode={mode}
            />
          </div>
        )}
      </div>
    </div>
  );
}
