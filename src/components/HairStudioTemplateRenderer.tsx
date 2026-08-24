import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { SalonData, getPublicStaffData } from '../types';
import { DEFAULT_BRAND_CONFIG } from '../config/brandConfig';
import SiteHeader, { useSiteLocale, useThemeAppearance } from './SiteHeader';
import OwnerAvatar from './OwnerAvatar';
import { BundlePrice } from './PromotionalPricing';
import { FinalBookingCta, SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import SiteFooter from './SiteFooter';
import SiteFloatingActions from './SiteFloatingActions';
import SiteMobileActionBar from './SiteMobileActionBar';
import SiteBookingHost from './SiteBookingHost';
import SiteContactLockNotice from './SiteContactLockNotice';
import SiteSeo from './SiteSeo';
import { setActiveTheme, markPerformance } from '../lib/sitePerformance';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import HairStudioHero from './heroes/HairStudioHero';
import SiteSalonStatus from './SiteSalonStatus';
import SiteReviews from './SiteReviews';
import SiteVideoGallery from './SiteVideoGallery';
import SiteTrust from './SiteTrust';
import SiteFeaturedServices from './SiteFeaturedServices';
import SiteOffers from './SiteOffers';
import SiteCombos from './SiteCombos';
import SiteGallery from './SiteGallery';
import SiteServiceDirectory from './SiteServiceDirectory';
import { canCall, canWhatsApp, hasSalonAddress, openSiteBooking, salonMapsHref } from '../lib/siteBooking';
import { OWNER_PREVIEW_EMPTY } from '../lib/ownerPreview';
import { useIsOwnerPreview } from './SiteRenderContext';
import SiteProtectedContactAction from './SiteProtectedContactAction';
import OwnerPreviewTemplateNotice from './OwnerPreviewTemplateNotice';
import { HAIR_STUDIO_SURFACES, surfacesOf } from '../lib/themeSurfaces';
import { shouldShowOwnerPhoto } from '../lib/templateConfig';
import { setOwnerAppearanceDefault } from '../lib/siteNavigation';
import { dayLabel, siteText } from '../lib/siteI18n';
import { structureText } from '../lib/siteStructureI18n';
import {
  activeCatalogItems,
  headerModeOf,
  resolveSectionState,
  sectionProps,
  siteFrameClass,
  siteGrid,
} from '../lib/siteStructure';
import type { ViewportMode } from '../lib/siteStructure';
import {
  Phone, MessageCircle, CalendarCheck, MapPin, Clock, Navigation,
  CreditCard, Palette,
} from 'lucide-react';

interface Props {
  data: SalonData;
  mode: ViewportMode;
}

/**
 * HAIR STUDIO & COLOR BAR — dedicated theme renderer (Theme ID: hair_studio_color_bar).
 *
 * A modern-studio, minimalist monochrome + rose-gold editorial experience.
 * Distinct from the existing themes:
 *   - Light warm-paper surfaces, near-black ink, serif display type
 *   - Hairline rules and generous whitespace instead of boxed cards
 *   - A signature "Color Showcase" gallery of hair-color treatments
 *     (Balayage, Ombre, Highlights, Global Color, Fashion Color…)
 *   - An editorial services menu (numbered entries, no heavy cards)
 *
 * PHASE 10.2: dark mode = espresso-ink surfaces with brighter rose-gold
 * (HAIR_STUDIO_SURFACES); all customer-facing copy flows from the global
 * siteText() table (hair namespace) in English / हिन्दी.
 */

interface ColorSwatch {
  name: string;
  desc: string;
  gradient: string;
}

const COLOR_SHOWCASE: ColorSwatch[] = [
  { name: 'Balayage', desc: 'Hand-painted, sun-kissed dimension', gradient: 'linear-gradient(160deg, #3b2416 0%, #8a5a34 45%, #e6c79a 100%)' },
  { name: 'Ombre', desc: 'Shadow-root to tip gradient', gradient: 'linear-gradient(180deg, #241510 0%, #7a4b33 55%, #d9b287 100%)' },
  { name: 'Highlights & Lowlights', desc: 'Dimensional, multi-tonal finish', gradient: 'linear-gradient(160deg, #e9d9b8 0%, #b8895a 50%, #6b4a2c 100%)' },
  { name: 'Global Color', desc: 'Rich, all-over glossy tone', gradient: 'linear-gradient(160deg, #4a1f1f 0%, #7a3030 60%, #a05a4a 100%)' },
  { name: 'Fashion Color', desc: 'Bold pastel & vivid statements', gradient: 'linear-gradient(160deg, #f4c2d7 0%, #b48ec9 50%, #8fb8d8 100%)' },
  { name: 'Gloss & Tone', desc: 'Glass-like shine refresh', gradient: 'linear-gradient(160deg, #2c2226 0%, #6b4a52 50%, #c48b96 100%)' },
];

export default function HairStudioTemplateRenderer({ data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  // Live locale + appearance: re-render when the header controls switch.
  const locale = useSiteLocale();
  setOwnerAppearanceDefault(data.websiteAppearance);
  const appearance = useThemeAppearance('hair_studio_color_bar');
  const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
  const { ink, inkSoft, paper, paperDeep, rose, roseBright, roseSoft, roseDeep, line, muted, card } = t;
  const isDark = appearance === 'dark';
  const S = { ...siteText('hair_studio_color_bar', locale), ...structureText('hair_studio_color_bar', locale) };
  const X = structureCopyFrom(S);
  const palette = { accent: rose, text: ink, muted, card, line, invert: isDark ? '#241d1b' : '#ffffff' };
  const headerMode = headerModeOf(mode);
  // PHASE 10.12 — performance optimization: clear stale data, marks, memoize
  useEffect(() => {
    setActiveTheme('hair_studio_color_bar');
    markPerformance('hair_studio_color_bar-render-start');
    return () => { markPerformance('hair_studio_color_bar-render-end'); };
  }, []);
  const packages = activeCatalogItems(data.packages);
  const offersState = resolveSectionState('offers', packages);
  const teamState = resolveSectionState('team', data.team);
  const ownerState = resolveSectionState('owner', data.ownerName ? [data.ownerName] : []);
  const aboutState = resolveSectionState('about', (data.about || (!ownerPreview && S.heroFallbackAbout)) ? [1] : []);
  const hasAddress = hasSalonAddress(data, ownerPreview);
  const locationState = resolveSectionState('location', hasAddress ? [data.address?.fullAddress] : []);
  const depositPercentage = data.bookingRules?.advanceDepositPercentage ?? 0;

  const btnRose: CSSProperties = {
    backgroundColor: rose,
    color: isDark ? '#241d1b' : '#ffffff',
  };

  return (
    <div className={`relative shadow-xl border flex flex-col overflow-hidden transition-all duration-500 origin-top mx-auto h-full ${siteFrameClass(mode)} ${mode === 'mobile' ? 'site-has-mobile-dock' : ''}`} style={{ borderColor: line, backgroundColor: card }}>
      {/* Browser/Phone Header Bar (mock chrome — not part of the website) */}
      {mode !== 'mobile' ? (
        <div className="h-10 flex items-center px-4 gap-2 shrink-0 border-b" style={{ backgroundColor: paper, borderColor: line }}>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          </div>
          <div className="mx-auto px-4 py-1 rounded text-[10px] border font-mono tracking-wide" style={{ backgroundColor: card, borderColor: line, color: muted }}>
            {ownerPreview && !(data.websiteSlug || '').trim()
              ? OWNER_PREVIEW_EMPTY.websiteAddress
              : `${DEFAULT_BRAND_CONFIG.platform.websiteUrl.replace(/^https?:\/\//, '')}/${data.websiteSlug || data.salonName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'yoursalon'}`}
          </div>
        </div>
      ) : (
        <div className="h-6 w-full flex justify-center items-start shrink-0" style={{ backgroundColor: card }}>
          <div className="w-24 h-4 rounded-b-xl" style={{ backgroundColor: line }}></div>
        </div>
      )}

      {/* Scrollable Website Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar site-scroll pb-20" style={{ backgroundColor: paper, color: ink }}>
        <SiteSeo themeId="hair_studio_color_bar" data={data} mode={mode} />
        <SiteAnnouncementBar themeId="hair_studio_color_bar" data={data} />
        <SiteHeader themeId="hair_studio_color_bar" data={data} mode={headerMode} />

        {/* Hero — PHASE 11.1: editorial gallery hero */}
        <HairStudioHero data={data} mode={mode} />

        {/* Trust / Stats — PHASE 12.1: real, configured data only */}
        <SiteTrust themeId="hair_studio_color_bar" data={data} mode={mode} />

        {/* Featured Services — PHASE 12.2: theme-specific suggested services only */}
        <SiteFeaturedServices themeId="hair_studio_color_bar" data={data} mode={mode} />

        {/* Services — complete directory (PHASE 12.4: theme-scoped categories + search + sort) */}
        <SiteServiceDirectory themeId="hair_studio_color_bar" data={data} mode={mode} />

        {/* Offers & Discounts */}
        <SiteOffers themeId="hair_studio_color_bar" data={data} mode={mode} />

        {/* Combos & Packages */}
        <SiteCombos themeId="hair_studio_color_bar" data={data} mode={mode} />

        {/* Color Showcase — the signature hair-color gallery */}
        {ownerPreview ? (
          <OwnerPreviewTemplateNotice
            title="Color showcase design"
            detail="Add portfolio media and service details to replace this template setup state with your business's real color work."
            accent={roseDeep}
            background={paperDeep}
            color={ink}
            style={{ borderColor: line }}
          />
        ) : (
          <div id="section-color" className="px-8 py-16" style={{ backgroundColor: paperDeep }}>
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-12">
                <span className="text-[10px] uppercase tracking-[0.4em] font-semibold flex items-center justify-center gap-2" style={{ color: roseDeep }}>
                  <Palette className="w-3.5 h-3.5" /> {S.colorEyebrow}
                </span>
                <h2 className="text-2xl md:text-3xl font-serif mt-3" style={{ color: ink }}>{S.colorTitle}</h2>
                <p className="text-xs mt-3 max-w-md mx-auto" style={{ color: muted }}>
                  {S.colorSubtitle}
                </p>
                <div className="h-px w-16 mx-auto mt-5" style={{ backgroundColor: rose }}></div>
              </div>

              <div className={`grid gap-4 ${mode === 'desktop' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {COLOR_SHOWCASE.map((swatch) => (
                  <div key={swatch.name} className="relative aspect-[3/4] overflow-hidden group border" style={{ borderColor: line }}>
                    <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110" style={{ background: swatch.gradient }}></div>
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(25,24,23,0.85) 0%, rgba(25,24,23,0.15) 45%, transparent 70%)' }}></div>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="text-[11px] font-serif font-semibold text-white">{swatch.name}</p>
                      <p className="text-[9px] uppercase tracking-[0.18em] mt-0.5" style={{ color: roseBright }}>{swatch.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Gallery — PHASE 14.1: theme-scoped portfolio (featured, filter, lightbox, before/after) */}
        <SiteGallery themeId="hair_studio_color_bar" data={data} mode={mode} />

        <SiteVideoGallery themeId="hair_studio_color_bar" data={data} mode={mode} />

        <div {...sectionProps('about', aboutState)} className="site-section px-5 md:px-8 py-14" style={{ backgroundColor: paper }}>
          <div className="max-w-2xl mx-auto text-center">
            <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: roseDeep }}>{S.aboutEyebrow}</span>
            <h3 className="text-2xl md:text-3xl font-serif mt-3" style={{ color: ink }}>{S.aboutTitle}</h3>
            <p className="text-xs md:text-sm mt-4 leading-relaxed" style={{ color: muted }}>{data.about || (ownerPreview ? OWNER_PREVIEW_EMPTY.about : S.heroFallbackAbout)}</p>
          </div>
        </div>

        <div {...sectionProps('owner', ownerState)} className="site-section px-5 md:px-8 py-14 border-y" style={{ backgroundColor: paperDeep, borderColor: line }}>
          {ownerState === 'ready' ? (
            <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
              {shouldShowOwnerPhoto(data) && (
              <div className="w-28 h-28 rounded-full overflow-hidden shrink-0 border" style={{ borderColor: rose }}>
                <OwnerAvatar photoUrl={data.ownerPhotoUrl} name={data.ownerName} className="w-full h-full text-3xl" alt="Founder" />
              </div>
              )}
              <div className="min-w-0">
                {(!ownerPreview || data.ownerRole) && (
                  <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: roseDeep }}>{data.ownerRole || S.ownerFallbackRole}</span>
                )}
                <h3 className="text-2xl font-serif mt-1 break-words" style={{ color: ink }}>{data.ownerName}</h3>
                {(!ownerPreview || data.reviewedContent?.ownerIntro) && (
                  <p className="text-xs mt-2 leading-relaxed italic" style={{ color: muted }}>“{data.reviewedContent?.ownerIntro || S.ownerFallbackIntro}”</p>
                )}
              </div>
            </div>
          ) : <div className="max-w-3xl mx-auto"><SectionStatePanel status={ownerState} copy={X} palette={palette} emptyTitle={S.ownerEmptyTitle} emptyBody={S.ownerEmptyBody} /></div>}
        </div>

        <div {...sectionProps('team', teamState)} className="site-section px-5 md:px-8 py-16" style={{ backgroundColor: paper }}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: roseDeep }}>{S.teamEyebrow}</span>
              <h3 className="text-2xl md:text-3xl font-serif mt-3" style={{ color: ink }}>{S.teamTitle}</h3>
            </div>
            {teamState === 'ready' ? (
              <div className={`grid gap-8 ${siteGrid(mode, { desktop: 2, tablet: 2, mobile: 1 })}`}>
                {data.team.map((member) => {
                  const pub = getPublicStaffData(member);
                  return (
                    <div key={pub.id} className="flex flex-col gap-4 min-w-0">
                      <div className="flex items-center gap-5">
                        <img src={pub.imageUrl} alt={pub.name} className="w-20 h-20 object-cover border shrink-0" style={{ borderColor: line }} />
                        <div className="min-w-0">
                          <h4 className="font-serif font-semibold text-lg break-words" style={{ color: ink }}>{pub.name}</h4>
                          <p className="text-[10px] uppercase tracking-[0.25em] mt-1" style={{ color: roseDeep }}>{pub.role}</p>
                        </div>
                      </div>
                      <button data-open-booking="true" onClick={openSiteBooking} className="site-touch w-full py-2.5 text-[10px] uppercase tracking-[0.25em] font-semibold border" style={{ borderColor: ink, color: ink }}>{S['common.bookWith'].replace('{name}', pub.name.split(' ')[0])}</button>
                    </div>
                  );
                })}
              </div>
            ) : <SectionStatePanel status={teamState} copy={X} palette={palette} />}
          </div>
        </div>

        <SiteReviews themeId="hair_studio_color_bar" data={data} mode={mode} />

        <div {...sectionProps('location', locationState)} className="site-section px-5 md:px-8 py-16 border-t" style={{ backgroundColor: paper, borderColor: line }}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: roseDeep }}>{S.visitEyebrow}</span>
              <h3 className="text-2xl md:text-3xl font-serif mt-3" style={{ color: ink }}>{S['common.visitTitle']}</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 border space-y-4" style={{ borderColor: line, backgroundColor: card }}>
                <h4 className="font-serif font-semibold text-sm flex items-center gap-2" style={{ color: ink }}>
                  <MapPin className="w-4 h-4" style={{ color: roseDeep }} /> {S.addressLabel}
                </h4>
                <p className="text-xs leading-relaxed" style={{ color: muted }}>
                  {hasAddress
                    ? data.address?.fullAddress
                    : ownerPreview
                      ? OWNER_PREVIEW_EMPTY.address
                      : 'Shop 14, Linking Road, Bandra West, Mumbai, Maharashtra 400050'}
                </p>
                {hasAddress && (
                  <a
                    data-testid="theme-contact-directions"
                    href={salonMapsHref(data, ownerPreview)}
                    target="_blank"
                    rel="noreferrer"
                    className="site-touch w-full py-2.5 text-[10px] uppercase tracking-[0.25em] font-semibold transition-all hover:brightness-110 flex items-center justify-center gap-2"
                    style={btnRose}
                  >
                    <Navigation className="w-3.5 h-3.5" /> {S['common.getDirections']}
                  </a>
                )}
              </div>

              <div className="p-6 border space-y-3" style={{ borderColor: line, backgroundColor: card }}>
                <h4 className="font-serif font-semibold text-sm flex items-center gap-2" style={{ color: ink }}>
                  <Clock className="w-4 h-4" style={{ color: roseDeep }} /> {S['common.openingHours']}
                </h4>
                <SiteSalonStatus themeId="hair_studio_color_bar" data={data} placement="contact" />
                <div className="space-y-2 text-xs" style={{ color: muted }}>
                  {data.openingHours && Object.keys(data.openingHours).length > 0 ? (
                    Object.entries(data.openingHours).map(([day, sch]) => (
                      <div key={day} className="flex justify-between border-b pb-1.5" style={{ borderColor: line }}>
                        <span className="font-semibold" style={{ color: ink }}>{dayLabel(day, locale)}</span>
                        {sch.open ? <span>{sch.startTime} – {sch.endTime}</span> : <span className="font-semibold" style={{ color: roseDeep }}>{S['common.closed']}</span>}
                      </div>
                    ))
                  ) : ownerPreview ? (
                    <p>{OWNER_PREVIEW_EMPTY.hours}</p>
                  ) : (
                    <div className="flex justify-between"><span>Mon - Sat</span><span>10:00 AM - 8:00 PM</span></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact & Booking */}
        <div id="section-contact" className="px-8 py-16 text-center" style={{ backgroundColor: paperDeep }}>
          <div className="max-w-xl mx-auto">
            <div className="w-12 h-12 mx-auto flex items-center justify-center border mb-4" style={{ borderColor: rose }}>
              <CalendarCheck className="w-6 h-6" style={{ color: roseDeep }} />
            </div>
            <h3 className="text-2xl md:text-3xl font-serif mb-6" style={{ color: ink }}>{S.contactTitle}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {canCall(data) && (
                <SiteProtectedContactAction action="call" data={data} themeId="hair_studio_color_bar" testId="theme-contact-call" className="py-3 border font-semibold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors" style={{ borderColor: line, color: ink, backgroundColor: card }}>
                  <Phone className="w-4 h-4" style={{ color: roseDeep }} /> {S['common.callNow']}
                </SiteProtectedContactAction>
              )}
              {canWhatsApp(data) && (
                <SiteProtectedContactAction action="whatsapp" data={data} themeId="hair_studio_color_bar" testId="theme-contact-whatsapp" className="py-3 text-white font-semibold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all hover:brightness-110" style={{ backgroundColor: '#25D366' }}>
                  <MessageCircle className="w-4 h-4" /> {S['common.whatsApp']}
                </SiteProtectedContactAction>
              )}
              <button data-open-booking="true" onClick={openSiteBooking} className="py-3 font-semibold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all hover:brightness-110" style={btnRose}>
                <CalendarCheck className="w-4 h-4" /> {S['common.bookOnline']}
              </button>
            </div>

            {(!ownerPreview || depositPercentage > 0) && (
              <div className="p-5 border text-left text-xs space-y-2" style={{ borderColor: line, backgroundColor: card }}>
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5 uppercase tracking-[0.15em] text-[10px]" style={{ color: ink }}>
                    <CreditCard className="w-4 h-4" style={{ color: roseDeep }} /> {S.depositTitle}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ backgroundColor: roseSoft, color: roseDeep }}>
                    {ownerPreview ? `${depositPercentage}% advance` : S['common.advanceAdvance']}
                  </span>
                </div>
                <p style={{ color: muted }}>{ownerPreview ? `A ${depositPercentage}% advance deposit is configured for online booking.` : S.depositBody}</p>
              </div>
            )}
          </div>
        </div>

        <FinalBookingCta themeId="hair_studio_color_bar" data={data} title={S.bookingTitle} body={S.bookingBody} cta={S['struct.bookCta']} palette={palette} sharp />
        <SiteFooter themeId="hair_studio_color_bar" data={data} />
        {mode === 'mobile' && (
          <>
            <div className="site-mobile-action-bar-spacer" aria-hidden />
            <div className="site-mobile-dock-spacer" aria-hidden />
          </>
        )}
      </div>
      <SiteFloatingActions themeId="hair_studio_color_bar" data={data} mode={mode} />
      <SiteMobileActionBar themeId="hair_studio_color_bar" data={data} mode={mode} />
      <SiteBookingHost themeId="hair_studio_color_bar" data={data} />
      <SiteContactLockNotice themeId="hair_studio_color_bar" data={data} />
    </div>
  );
}
