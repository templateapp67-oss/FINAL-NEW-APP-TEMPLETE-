/**
 * PHASE 12.6 — SERVICE DETAIL modal (all five themes).
 *
 * A clean, theme-specific detail view for the selected service. It shows the
 * real, configured data only:
 *
 *   - name, full description, category;
 *   - price / starting price (offer-aware) + duration;
 *   - the active offer/discount badge + amount (dates respected);
 *   - the service image/icon when available, else a themed category glyph;
 *   - available staff/stylists (only when configured — see `staffForService`);
 *   - a Book Now CTA that opens the EXISTING booking flow with the selected
 *     theme + category + service preserved (no re-selection).
 *
 * Theme isolation: it renders only the service it is handed (which the
 * directory resolves from the active theme), and each theme keeps its own
 * surfaces/typography/shape. The overlay is mobile-first (bottom sheet) and
 * centers on desktop.
 */
import { useState, type CSSProperties } from 'react';
import type { SalonData, Service, ServiceOffer } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { siteText } from '../lib/siteI18n';
import { displayService } from '../lib/displayService';
import { translateCategory } from '../lib/siteI18n';
import { openSiteBookingForService } from '../lib/siteBooking';
import { serviceDisplayPrice, formatCurrency } from '../lib/pricing';
import { getServiceVariants, resolveServiceVariant, serviceWithSelectedVariant } from '../lib/siteVariants';
import { siteVariantsText } from '../lib/siteVariantsI18n';
import { serviceDetailText } from '../lib/siteServiceDetailI18n';
import { staffForService } from '../lib/siteServiceDetail';
import { serviceVisuals, categoryIcon } from '../lib/siteServiceVisuals';
import ServiceVisual from './ServiceVisual';
import type { ViewportMode } from '../lib/siteStructure';
import { surfacesOf, BARBER_SURFACES, HAIR_STUDIO_SURFACES, BEAUTY_SPA_SURFACES, FAMILY_SURFACES, NAIL_LASH_SURFACES } from '../lib/themeSurfaces';
import OwnerAvatar from './OwnerAvatar';
import {
  Clock,
  Star,
  X,
} from 'lucide-react';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  service: Service;
  mode: ViewportMode;
  onClose: () => void;
}

interface DetailLook {
  panelClass: string;
  panelStyle: CSSProperties;
  maxW: string;
  accent: string;
  muted: string;
  text: string;
  textStrong: string;
  line: string;
  card: string;
  invert: string;
  closeClass: string;
  closeStyle: CSSProperties;
  eyebrowClass: string;
  eyebrowStyle: CSSProperties;
  nameClass: string;
  nameStyle: CSSProperties;
  categoryStyle: CSSProperties;
  descStyle: CSSProperties;
  priceStyle: CSSProperties;
  discountStyle: CSSProperties;
  durationStyle: CSSProperties;
  mediaWrapClass: string;
  mediaWrapStyle: CSSProperties;
  iconColor: string;
  badgeClass: string;
  badgeStyle: CSSProperties;
  staffTitleClass: string;
  staffTitleStyle: CSSProperties;
  staffCardStyle: CSSProperties;
  staffRoleStyle: CSSProperties;
  ctaClass: string;
  ctaStyle: CSSProperties;
  ctaKey: 'common.bookSlot' | 'common.bookThisService' | 'common.bookNow';
  /** Radius for the gallery / icon thumbnails (per-theme). */
  mediaRounded: string;
}

function buildLook(themeId: SiteHeaderThemeId, appearance: 'light' | 'dark'): DetailLook {
  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return {
      panelClass: 'relative w-full max-h-[90%] overflow-y-auto border',
      panelStyle: { backgroundColor: t.charcoal, borderColor: t.gold, color: t.text },
      maxW: 'sm:max-w-md',
      accent: t.gold,
      muted: t.muted,
      text: t.text,
      textStrong: t.textStrong,
      line: t.line,
      card: t.card,
      invert: '#141414',
      closeClass: 'absolute top-3 right-3 w-8 h-8 flex items-center justify-center border',
      closeStyle: { color: t.muted, borderColor: t.line, backgroundColor: t.card },
      eyebrowClass: 'text-[10px] font-bold uppercase tracking-[0.35em]',
      eyebrowStyle: { color: t.accentText },
      nameClass: 'text-xl font-black uppercase tracking-[0.05em] break-words',
      nameStyle: { color: t.textStrong },
      categoryStyle: { color: t.muted },
      descStyle: { color: t.muted },
      priceStyle: { color: t.gold },
      discountStyle: { color: t.goldBright },
      durationStyle: { color: t.muted },
      mediaWrapClass: 'w-full aspect-[16/9] flex items-center justify-center border',
      mediaWrapStyle: { backgroundColor: t.charcoalSoft, borderColor: t.line },
      iconColor: t.gold,
      badgeClass: 'text-[8px] font-black uppercase tracking-wider px-2 py-0.5 border',
      badgeStyle: { backgroundColor: t.goldSoft, color: t.goldBright, borderColor: t.gold },
      staffTitleClass: 'text-[10px] font-bold uppercase tracking-[0.35em]',
      staffTitleStyle: { color: t.accentText },
      staffCardStyle: { backgroundColor: t.card, borderColor: t.line },
      staffRoleStyle: { color: t.muted },
      ctaClass: 'site-touch w-full py-3 text-[11px] font-black uppercase tracking-[0.15em]',
      ctaStyle: { backgroundColor: t.gold, color: '#141414' },
      ctaKey: 'common.bookSlot',
      mediaRounded: '',
    };
  }
  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return {
      panelClass: 'relative w-full max-h-[90%] overflow-y-auto border rounded-lg',
      panelStyle: { backgroundColor: t.paper, borderColor: t.line, color: t.ink },
      maxW: 'sm:max-w-md',
      accent: t.roseDeep,
      muted: t.muted,
      text: t.ink,
      textStrong: t.ink,
      line: t.line,
      card: t.card,
      invert: '#ffffff',
      closeClass: 'absolute top-3 right-3 w-8 h-8 flex items-center justify-center border rounded-md',
      closeStyle: { color: t.muted, borderColor: t.line, backgroundColor: t.card },
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      eyebrowStyle: { color: t.roseDeep },
      nameClass: 'text-xl font-serif break-words',
      nameStyle: { color: t.ink },
      categoryStyle: { color: t.roseDeep },
      descStyle: { color: t.muted },
      priceStyle: { color: t.roseDeep },
      discountStyle: { color: t.roseBright },
      durationStyle: { color: t.muted },
      mediaWrapClass: 'w-full aspect-[16/9] flex items-center justify-center border',
      mediaWrapStyle: { backgroundColor: t.paperDeep, borderColor: t.line },
      iconColor: t.roseDeep,
      badgeClass: 'text-[8px] uppercase tracking-[0.16em] font-semibold px-2 py-0.5 border',
      badgeStyle: { backgroundColor: t.roseSoft, color: t.roseDeep, borderColor: t.roseDeep },
      staffTitleClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      staffTitleStyle: { color: t.roseDeep },
      staffCardStyle: { backgroundColor: t.card, borderColor: t.line },
      staffRoleStyle: { color: t.muted },
      ctaClass: 'site-touch w-full py-3 text-[11px] uppercase tracking-[0.2em] font-semibold',
      ctaStyle: { backgroundColor: t.rose, color: '#ffffff' },
      ctaKey: 'common.bookThisService',
      mediaRounded: '',
    };
  }
  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return {
      panelClass: 'relative w-full max-h-[90%] overflow-y-auto border rounded-t-3xl',
      panelStyle: { backgroundColor: t.cream, borderColor: t.line, color: t.text },
      maxW: 'sm:max-w-md',
      accent: t.emerald,
      muted: t.muted,
      text: t.text,
      textStrong: t.textStrong,
      line: t.line,
      card: t.card,
      invert: '#ffffff',
      closeClass: 'absolute top-3 right-3 w-8 h-8 flex items-center justify-center border rounded-full',
      closeStyle: { color: t.muted, borderColor: t.line, backgroundColor: t.card },
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      eyebrowStyle: { color: t.emerald },
      nameClass: 'text-xl font-serif break-words',
      nameStyle: { color: t.text },
      categoryStyle: { color: t.emerald },
      descStyle: { color: t.muted },
      priceStyle: { color: t.emerald },
      discountStyle: { color: t.emeraldMid },
      durationStyle: { color: t.muted },
      mediaWrapClass: 'w-full aspect-[16/9] flex items-center justify-center border',
      mediaWrapStyle: { backgroundColor: t.emeraldSoft, borderColor: t.line },
      iconColor: t.emerald,
      badgeClass: 'text-[8px] uppercase tracking-[0.16em] font-semibold px-2 py-0.5 rounded-full',
      badgeStyle: { backgroundColor: t.emeraldSoft, color: t.emeraldDeep, borderColor: 'transparent' },
      staffTitleClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      staffTitleStyle: { color: t.emerald },
      staffCardStyle: { backgroundColor: t.card, borderColor: t.line },
      staffRoleStyle: { color: t.muted },
      ctaClass: 'site-touch w-full py-3 rounded-full text-[11px] uppercase tracking-[0.2em] font-semibold',
      ctaStyle: { backgroundColor: t.emerald, color: '#ffffff' },
      ctaKey: 'common.bookNow',
      mediaRounded: 'rounded-2xl',
    };
  }
  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return {
      panelClass: 'relative w-full max-h-[90%] overflow-y-auto border rounded-t-2xl',
      panelStyle: { backgroundColor: t.white, borderColor: t.line, color: t.ink },
      maxW: 'sm:max-w-md',
      accent: t.teal,
      muted: t.muted,
      text: t.ink,
      textStrong: t.heading,
      line: t.line,
      card: t.card,
      invert: '#ffffff',
      closeClass: 'absolute top-3 right-3 w-8 h-8 flex items-center justify-center border rounded-xl',
      closeStyle: { color: t.ink, borderColor: t.line, backgroundColor: t.card },
      eyebrowClass: 'inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em]',
      eyebrowStyle: { color: t.tealDeep },
      nameClass: 'text-xl font-extrabold tracking-[-0.02em] break-words',
      nameStyle: { color: t.heading },
      categoryStyle: { color: t.tealDeep },
      descStyle: { color: t.muted },
      priceStyle: { color: t.teal },
      discountStyle: { color: t.blue },
      durationStyle: { color: t.muted },
      mediaWrapClass: 'w-full aspect-[16/9] flex items-center justify-center border',
      mediaWrapStyle: { backgroundColor: t.sky, borderColor: t.line },
      iconColor: t.teal,
      badgeClass: 'text-[8px] font-extrabold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full',
      badgeStyle: { backgroundColor: t.sky, color: t.blue, borderColor: 'transparent' },
      staffTitleClass: 'text-[10px] font-extrabold uppercase tracking-[0.24em]',
      staffTitleStyle: { color: t.tealDeep },
      staffCardStyle: { backgroundColor: t.well, borderColor: t.line },
      staffRoleStyle: { color: t.muted },
      ctaClass: 'site-touch w-full py-3 rounded-xl text-[11px] font-extrabold uppercase tracking-[0.13em]',
      ctaStyle: { backgroundColor: t.teal, color: '#ffffff' },
      ctaKey: 'common.bookNow',
      mediaRounded: 'rounded-xl',
    };
  }
  // nail_lash_studio
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  return {
    panelClass: 'relative w-full max-h-[90%] overflow-y-auto border rounded-t-[1.75rem]',
    panelStyle: { backgroundColor: t.cream, borderColor: t.line, color: t.ink },
    maxW: 'sm:max-w-md',
    accent: t.pinkDeep,
    muted: t.muted,
    text: t.ink,
    textStrong: t.ink,
    line: t.line,
    card: t.card,
    invert: '#ffffff',
    closeClass: 'absolute top-3 right-3 w-8 h-8 flex items-center justify-center border rounded-full',
    closeStyle: { color: t.ink, borderColor: t.line, backgroundColor: t.card },
    eyebrowClass: 'inline-flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.28em]',
    eyebrowStyle: { color: t.pinkDeep },
    nameClass: 'text-xl font-extrabold tracking-[-0.02em] break-words',
    nameStyle: { color: t.ink },
    categoryStyle: { color: t.pinkDeep },
    descStyle: { color: t.muted },
    priceStyle: { color: t.pinkDeep },
    discountStyle: { color: t.pinkGlow },
    durationStyle: { color: t.muted },
    mediaWrapClass: 'w-full aspect-[16/9] flex items-center justify-center border',
    mediaWrapStyle: { backgroundColor: t.pinkSoft, borderColor: t.line },
    iconColor: t.pinkDeep,
    badgeClass: 'text-[8px] font-extrabold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full',
    badgeStyle: { backgroundColor: t.pinkSoft, color: t.pinkDeep, borderColor: 'transparent' },
    staffTitleClass: 'text-[9px] font-extrabold uppercase tracking-[0.28em]',
    staffTitleStyle: { color: t.pinkDeep },
    staffCardStyle: { backgroundColor: t.card, borderColor: t.line },
    staffRoleStyle: { color: t.muted },
    ctaClass: 'site-touch w-full py-3 rounded-full text-[10px] font-extrabold uppercase tracking-[0.2em]',
    ctaStyle: { backgroundColor: t.pink, color: '#ffffff' },
    ctaKey: 'common.bookNow',
    mediaRounded: 'rounded-xl',
  };
}

export default function SiteServiceDetail({ themeId, data, service, mode, onClose }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const S = { ...siteText(themeId, locale) };
  const copy = serviceDetailText(locale);
  const look = buildLook(themeId, appearance);
  const shown = displayService(service, locale);

  const variants = getServiceVariants(service, themeId);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    service.selectedVariantId || null,
  );

  const activeVariant = resolveServiceVariant(service, selectedVariantId, themeId);
  const pricing = serviceDisplayPrice(service, data.offers, selectedVariantId);
  const offer = pricing.offer;
  const activeDuration = activeVariant?.duration || service.duration;

  const staff = staffForService(data, service.id);
  const Icon = categoryIcon(service.category);
  const visual = serviceVisuals(service, locale);

  const discountLabel = (off: ServiceOffer) =>
    off.discountType === 'percentage'
      ? `${Math.round(off.discountValue * 100) / 100}% off`
      : `₹${off.discountValue.toLocaleString('en-IN')} off`;

  const handleBook = () => {
    onClose();
    const bookable = serviceWithSelectedVariant(service, selectedVariantId, themeId);
    openSiteBookingForService(bookable, themeId);
  };

  const priceNode = offer ? (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[11px] line-through opacity-55" style={look.priceStyle}>{formatCurrency(pricing.basePrice)}</span>
      <span data-testid="site-service-detail-price" className="text-lg font-extrabold" style={look.priceStyle}>{formatCurrency(pricing.finalPrice)}</span>
    </span>
  ) : (
    <span data-testid="site-service-detail-price" className="text-lg font-extrabold" style={look.priceStyle}>{formatCurrency(pricing.finalPrice)}</span>
  );

  return (
    <div
      data-testid="site-service-detail"
      data-theme={themeId}
      data-mode={mode}
      className="absolute inset-0 z-[60] flex items-end sm:items-center sm:justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
    >
      <button
        type="button"
        data-testid="site-service-detail-backdrop"
        onClick={onClose}
        className="absolute inset-0 w-full h-full cursor-default"
        style={{ backgroundColor: 'transparent', border: 'none' }}
        aria-label={copy.close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.dialogLabel}
        data-testid="site-service-detail-panel"
        className={`${look.panelClass} ${look.maxW}`}
        style={look.panelStyle}
      >
        <button
          type="button"
          data-testid="site-service-detail-close"
          onClick={onClose}
          className={look.closeClass}
          style={look.closeStyle}
          aria-label={copy.close}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Media hero — configured image/banner/icon via SiteImage; themed glyph fallback */}
        <div className={look.mediaWrapClass} style={look.mediaWrapStyle}>
          {visual.url ? (
            <ServiceVisual
              src={visual.url}
              alt={visual.alt}
              aspectRatio="16/9"
              className="w-full h-full"
              testId="site-service-detail-media"
              glyph={Icon}
              glyphColor={look.iconColor}
              glyphBg={String(look.mediaWrapStyle.backgroundColor)}
              glyphBorder={look.line}
            />
          ) : (
            <Icon data-testid="site-service-detail-icon" className="w-10 h-10" style={{ color: look.iconColor }} aria-hidden />
          )}
        </div>

        <div className="p-5">
          <span className={look.eyebrowClass} style={look.eyebrowStyle}>
            {translateCategory(shown.category, locale)}
          </span>
          <div className="flex items-center gap-2.5 mt-1">
            {visual.iconUrl && (
              <ServiceVisual
                src={visual.iconUrl}
                alt=""
                aspectRatio="1/1"
                rounded="rounded-full"
                className="w-9 h-9 shrink-0"
                glyph={Icon}
                glyphColor={look.iconColor}
                glyphBg={look.card}
                glyphBorder={look.line}
              />
            )}
            <h2 className={`${look.nameClass}`} style={look.nameStyle} data-testid="site-service-detail-name">
              {shown.name}
            </h2>
          </div>
          <p className="text-[10px] uppercase tracking-[0.16em] mt-1 font-semibold" style={look.categoryStyle}>
            {translateCategory(shown.category, locale)}
          </p>

          <p data-testid="site-service-detail-description" className="text-xs mt-3 leading-relaxed break-words" style={look.descStyle}>
            {shown.description}
          </p>

          {/* PHASE 12.7 — optional gallery/banner image when distinct from the hero */}
          {visual.galleryUrl && (
            <ServiceVisual
              src={visual.galleryUrl}
              alt={visual.alt}
              aspectRatio="16/9"
              rounded={look.mediaRounded}
              className="w-full mt-3"
              glyph={Icon}
              glyphColor={look.iconColor}
              glyphBg={look.card}
              glyphBorder={look.line}
            />
          )}

          {/* Variant Selector */}
          {variants.length > 0 && (
            <div data-testid="variant-selector" className="mt-4 p-3 border rounded-xl space-y-1.5" style={{ borderColor: look.line, backgroundColor: look.card }}>
              <span className="text-[10px] font-extrabold uppercase tracking-wider block" style={{ color: look.accent }}>
                {siteVariantsText(themeId, locale).selectVariantLabel}
              </span>
              <div className="flex flex-wrap gap-2">
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
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        isSelected ? 'ring-2 shadow-xs' : 'opacity-70 hover:opacity-100'
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

          <div className="flex items-center justify-between gap-3 mt-4">
            <span className="flex items-center gap-2 flex-wrap min-w-0">
              {priceNode}
              {offer && (
                <span
                  data-testid="site-service-detail-offer"
                  className={`${look.badgeClass} inline-flex flex-col gap-0.5 items-start`}
                  style={look.badgeStyle}
                >
                  <span>{offer.promotionalBadge || 'Offer'}</span>
                  <span data-testid="site-service-detail-discount" style={look.discountStyle}>
                    {discountLabel(offer)}
                  </span>
                </span>
              )}
            </span>
            <span
              data-testid="site-service-detail-duration"
              data-testid-variant="variant-duration"
              className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap"
              style={look.durationStyle}
            >
              <Clock className="w-3.5 h-3.5" style={{ color: look.accent }} />
              {activeDuration} {S['common.mins']}
            </span>
          </div>

          {staff.length > 0 && (
            <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${look.line}` }}>
              <h3 className={look.staffTitleClass} style={look.staffTitleStyle} data-testid="site-service-detail-staff-title">
                {copy.availableStaff}
              </h3>
              <div data-testid="site-service-detail-staff" className="flex flex-col gap-2 mt-3">
                {staff.map((member) => (
                  <div
                    key={member.id}
                    data-testid="site-service-detail-staff-member"
                    className="flex items-center gap-3 border p-2.5"
                    style={look.staffCardStyle}
                  >
                    <OwnerAvatar photoUrl={member.imageUrl} name={member.name} className="w-10 h-10 rounded-full shrink-0 text-sm" alt={member.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate" style={{ color: look.textStrong }}>{member.name}</p>
                      <p className="text-[10px] truncate" style={look.staffRoleStyle}>{member.role}</p>
                    </div>
                    {typeof member.rating === 'number' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold shrink-0" style={{ color: look.accent }}>
                        <Star className="w-3 h-3" style={{ fill: look.accent }} />
                        {member.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            data-testid="site-service-detail-book"
            data-service-name={service.name}
            onClick={handleBook}
            className={`${look.ctaClass} mt-5`}
            style={look.ctaStyle}
          >
            {S[look.ctaKey]}
          </button>
        </div>
      </div>
    </div>
  );
}
