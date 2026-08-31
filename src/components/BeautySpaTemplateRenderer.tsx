import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { SalonData, getPublicStaffData } from '../types';
import { DEFAULT_BRAND_CONFIG } from '../config/brandConfig';
import { publicWebsiteHref, slugifySalonName } from '../lib/publicWebsiteUrl';
import SiteHeader, { useSiteLocale, useThemeAppearance } from './SiteHeader';
import OwnerAvatar from './OwnerAvatar';
import { BundlePrice, ServicePrice } from './PromotionalPricing';
import { FinalBookingCta, SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import SiteFooter from './SiteFooter';
import SiteFloatingActions from './SiteFloatingActions';
import SiteMobileActionBar from './SiteMobileActionBar';
import SiteBookingHost from './SiteBookingHost';
import SiteContactLockNotice from './SiteContactLockNotice';
import SiteSeo from './SiteSeo';
import { setActiveTheme, markPerformance } from '../lib/sitePerformance';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import BeautySpaHero from './heroes/BeautySpaHero';
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
import { displayService } from '../lib/displayService';
import { BEAUTY_SPA_SURFACES, surfacesOf } from '../lib/themeSurfaces';
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
  CreditCard, Leaf, Flower2, Sparkles, Droplets,
} from 'lucide-react';

interface Props {
  data: SalonData;
  mode: ViewportMode;
}

/**
 * BEAUTY, SKIN & SPA — dedicated theme renderer (Theme ID: beauty_skin_spa).
 *
 * Soft pastel, emerald + beige, calm and serene premium wellness.
 * A genuinely distinct visual language vs. the other themes:
 *   - Airy cream/beige surfaces, soft emerald accents, rounded (pill/rounded-3xl)
 *     shapes, generous whitespace and soft shadows — nothing boxed or sharp
 *   - A split "Facial & Skincare" visual section with ambient imagery and
 *     treatment lists driven by the owner's existing service data
 *   - An emerald "Spa & Wellness Rituals" band (ambience, presentation-only)
 *   - Serif display headings, gentle pastel chips
 *
 * PHASE 10.2: dark mode = deep forest night-spa (BEAUTY_SPA_SURFACES);
 * all customer-facing copy flows from the global siteText() table (spa
 * namespace) in English / हिन्दी.
 */

export default function BeautySpaTemplateRenderer({ data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  // Live locale + appearance: re-render when the header controls switch.
  const locale = useSiteLocale();
  // Seed the owner's explicit per-template appearance choice, never the legacy
  // global websiteAppearance field: when the owner never chose one, the
  // theme's design default (e.g. barber dark) must win.
  setOwnerAppearanceDefault(data.templateConfig?.appearance);
  const appearance = useThemeAppearance('beauty_skin_spa');
  const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
  const { emerald, emeraldDeep, emeraldMid, emeraldSoft, beigeSoft, cream, blush, sage, text, muted, line, card, bandBg, bandText, bandMuted } = t;
  const isDark = appearance === 'dark';
  const S = { ...siteText('beauty_skin_spa', locale), ...structureText('beauty_skin_spa', locale) };
  const X = structureCopyFrom(S);
  const palette = { accent: emerald, text, muted, card, line, invert: '#ffffff' };
  const headerMode = headerModeOf(mode);
  // PHASE 10.12 — performance optimization: clear stale data, marks, memoize
  useEffect(() => {
    setActiveTheme('beauty_skin_spa');
    markPerformance('beauty_skin_spa-render-start');
    return () => { markPerformance('beauty_skin_spa-render-end'); };
  }, []);
  const packages = activeCatalogItems(data.packages);
  const offersState = resolveSectionState('offers', packages);
  const teamState = resolveSectionState('team', data.team);
  const ownerState = resolveSectionState('owner', data.ownerName ? [data.ownerName] : []);
  const aboutState = resolveSectionState('about', (data.about || (!ownerPreview && S.heroFallbackAbout)) ? [1] : []);
  const hasAddress = hasSalonAddress(data, ownerPreview);
  const locationState = resolveSectionState('location', hasAddress ? [data.address?.fullAddress] : []);
  const depositPercentage = data.bookingRules?.advanceDepositPercentage ?? 0;

  const btnEmerald: CSSProperties = {
    backgroundColor: emerald,
    color: '#ffffff',
  };

  const SPA_RITUALS = [
    { icon: Droplets, name: S.ritual1Name, desc: S.ritual1Desc },
    { icon: Flower2, name: S.ritual2Name, desc: S.ritual2Desc },
    { icon: Sparkles, name: S.ritual3Name, desc: S.ritual3Desc },
    { icon: Leaf, name: S.ritual4Name, desc: S.ritual4Desc },
  ];

  // Facial/skincare services rendered in the split section, derived from the
  // owner's existing service data (no new service data is added).
  const facialServices = (data.services || []).filter((s) => {
    const q = (s.name + ' ' + s.category).toLowerCase();
    return q.includes('facial') || q.includes('skin') || q.includes('glow') || q.includes('hydra');
  }).slice(0, 5);

  const spaServices = (data.services || []).filter((s) => {
    const q = (s.name + ' ' + s.category).toLowerCase();
    return q.includes('massage') || q.includes('spa') || q.includes('reflexology') || q.includes('body');
  }).slice(0, 5);

  const FACIAL_FALLBACKS = [S.facial1, S.facial2, S.facial3, S.facial4];

  return (
    <div className={`relative shadow-xl border flex flex-col overflow-hidden transition-all duration-500 origin-top mx-auto h-full ${siteFrameClass(mode)} ${mode === 'mobile' ? 'site-has-mobile-dock' : ''}`} style={{ borderColor: line, backgroundColor: card }}>
      {mode !== 'mobile' ? (
        <div className="h-10 flex items-center px-4 gap-2 shrink-0 border-b" style={{ backgroundColor: cream, borderColor: line }}>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          </div>
          <div className="mx-auto px-4 py-1 rounded-full text-[10px] border font-mono tracking-wide" style={{ backgroundColor: card, borderColor: line, color: muted }}>
            {ownerPreview && !(data.websiteSlug || '').trim()
              ? OWNER_PREVIEW_EMPTY.websiteAddress
              : publicWebsiteHref((data.websiteSlug || '').trim() ? data.websiteSlug : slugifySalonName(data.salonName) || 'yoursalon', DEFAULT_BRAND_CONFIG.platform.websiteUrl)}
          </div>
        </div>
      ) : (
        <div className="h-6 w-full flex justify-center items-start shrink-0" style={{ backgroundColor: card }}>
          <div className="w-24 h-4 rounded-b-xl" style={{ backgroundColor: line }}></div>
        </div>
      )}

      {/* Scrollable Website Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar site-scroll pb-20" style={{ backgroundColor: cream, color: text }}>
        <SiteSeo themeId="beauty_skin_spa" data={data} mode={mode} />
        <SiteAnnouncementBar themeId="beauty_skin_spa" data={data} />
        <SiteHeader themeId="beauty_skin_spa" data={data} mode={headerMode} />

        {/* Hero — PHASE 11.1: soft arch spa hero */}
        <BeautySpaHero data={data} mode={mode} />

        {/* Trust / Stats — PHASE 12.1: real, configured data only */}
        <SiteTrust themeId="beauty_skin_spa" data={data} mode={mode} />

        {/* Featured Services — PHASE 12.2: theme-specific suggested services only */}
        <SiteFeaturedServices themeId="beauty_skin_spa" data={data} mode={mode} />

        {/* Services — complete directory (PHASE 12.4: theme-scoped categories + search + sort) */}
        <SiteServiceDirectory themeId="beauty_skin_spa" data={data} mode={mode} />

        {/* Offers & Discounts */}
        <SiteOffers themeId="beauty_skin_spa" data={data} mode={mode} />

        {/* Combos & Packages */}
        <SiteCombos themeId="beauty_skin_spa" data={data} mode={mode} />

        {ownerPreview ? (
          <OwnerPreviewTemplateNotice
            title="Skincare and wellness feature design"
            detail="Add your services and portfolio media to replace this template setup state with your business's real treatments and work."
            accent={emerald}
            background={beigeSoft}
            color={text}
          />
        ) : (
          <>
        {/* Facial & Skincare — split visual section */}
        <div id="section-skincare" className="px-8 py-16" style={{ backgroundColor: beigeSoft }}>
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-10 items-center">
            <div className="relative">
              <div className="aspect-[4/5] rounded-[2rem] overflow-hidden border" style={{ borderColor: line }}>
                <img
                  src="https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=800&auto=format&fit=crop"
                  alt="Facial & Skincare"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute bottom-3 right-3 rounded-2xl px-5 py-4 shadow-lg" style={{ backgroundColor: emerald }}>
                <p className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/80">{S.signatureBadge}</p>
                <p className="text-sm font-serif font-semibold text-white">{S.signatureTitle}</p>
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: emerald }}>{S.skincareEyebrow}</span>
              <h3 className="text-2xl md:text-3xl font-serif mt-3" style={{ color: text }}>{S.skincareTitle}</h3>
              <p className="text-xs mt-4 leading-relaxed" style={{ color: muted }}>
                {S.skincareBody}
              </p>

              <div className="mt-6 space-y-3">
                {facialServices.length > 0 ? (
                  facialServices.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5 rounded-2xl border" style={{ borderColor: line, backgroundColor: card }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: emeraldMid }}></div>
                        <div className="min-w-0">
                          <p className="text-sm font-serif font-semibold truncate" style={{ color: text }}>{displayService(s, locale).name}</p>
                          <p className="text-[10px] uppercase tracking-[0.15em]" style={{ color: muted }}>{s.duration} {S['common.mins']}</p>
                        </div>
                      </div>
                      <ServicePrice service={s} offers={data.offers} style={{ color: emerald }} compact dark={isDark} />
                    </div>
                  ))
                ) : (
                  <>
                    {FACIAL_FALLBACKS.map((label) => (
                      <div key={label} className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border" style={{ borderColor: line, backgroundColor: card }}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: emeraldMid }}></div>
                        <p className="text-sm font-serif font-semibold" style={{ color: text }}>{label}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Spa & Wellness — emerald rituals band */}
        <div id="section-wellness" className="px-8 py-16" style={{ backgroundColor: bandBg }}>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: bandMuted }}>{S.wellnessEyebrow}</span>
              <h3 className="text-2xl md:text-3xl font-serif mt-3" style={{ color: bandText }}>{S.wellnessTitle}</h3>
              <p className="text-xs mt-3 max-w-md mx-auto" style={{ color: bandMuted }}>
                {S.wellnessBody}
              </p>
            </div>

            <div className={`grid gap-4 ${mode === 'desktop' ? 'grid-cols-4' : 'grid-cols-2'}`}>
              {SPA_RITUALS.map((ritual) => {
                const Icon = ritual.icon;
                return (
                  <div key={ritual.name} className="rounded-3xl p-5 text-center bg-white/10 backdrop-blur-xs border border-white/15">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 bg-white/15">
                      <Icon className="w-4.5 h-4.5 text-white" />
                    </div>
                    <p className="text-sm font-serif font-semibold text-white">{ritual.name}</p>
                    <p className="text-[10px] leading-relaxed mt-1.5 text-white/70">{ritual.desc}</p>
                  </div>
                );
              })}
            </div>

            {spaServices.length > 0 && (
              <div className="mt-8 grid gap-3">
                {spaServices.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5 rounded-2xl bg-white/10 border border-white/15">
                    <div className="flex items-center gap-3 min-w-0">
                      <Droplets className="w-4 h-4 shrink-0 text-white/80" />
                      <div className="min-w-0">
                        <p className="text-sm font-serif font-semibold text-white truncate">{displayService(s, locale).name}</p>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-white/60">{s.duration} {S['common.mins']}</p>
                      </div>
                    </div>
                    <ServicePrice service={s} offers={data.offers} className="text-white" compact dark />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
          </>
        )}

        {/* Gallery — PHASE 14.1: theme-scoped portfolio (featured, filter, lightbox, before/after) */}
        <SiteGallery themeId="beauty_skin_spa" data={data} mode={mode} />

        <SiteVideoGallery themeId="beauty_skin_spa" data={data} mode={mode} />

        <div {...sectionProps('about', aboutState)} className="site-section px-5 md:px-8 py-14" style={{ backgroundColor: cream }}>
          <div className="max-w-2xl mx-auto text-center">
            <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: emerald }}>{S.aboutEyebrow}</span>
            <h3 className="text-2xl font-serif mt-3" style={{ color: text }}>{S.aboutTitle}</h3>
            <p className="text-xs mt-4 leading-relaxed" style={{ color: muted }}>{data.about || (ownerPreview ? OWNER_PREVIEW_EMPTY.about : S.heroFallbackAbout)}</p>
          </div>
        </div>

        <div {...sectionProps('owner', ownerState)} className="site-section px-5 md:px-8 py-14 border-y" style={{ backgroundColor: beigeSoft, borderColor: line }}>
          {ownerState === 'ready' ? (
            <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
              {shouldShowOwnerPhoto(data) && (
              <div className="w-28 h-28 rounded-full overflow-hidden shrink-0 border-4" style={{ borderColor: emeraldSoft }}>
                <OwnerAvatar photoUrl={data.ownerPhotoUrl} name={data.ownerName} className="w-full h-full text-3xl" alt="Founder" />
              </div>
              )}
              <div className="min-w-0">
                {(!ownerPreview || data.ownerRole) && (
                  <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: emerald }}>{data.ownerRole || S.ownerFallbackRole}</span>
                )}
                <h3 className="text-2xl font-serif mt-1 break-words" style={{ color: text }}>{data.ownerName}</h3>
                {(!ownerPreview || data.reviewedContent?.ownerIntro) && (
                  <p className="text-xs mt-2 leading-relaxed italic" style={{ color: muted }}>“{data.reviewedContent?.ownerIntro || S.ownerFallbackIntro}”</p>
                )}
              </div>
            </div>
          ) : <div className="max-w-3xl mx-auto"><SectionStatePanel status={ownerState} copy={X} palette={palette} emptyTitle={S.ownerEmptyTitle} emptyBody={S.ownerEmptyBody} /></div>}
        </div>

        <div {...sectionProps('team', teamState)} className="site-section px-5 md:px-8 py-16" style={{ backgroundColor: cream }}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: emerald }}>{S.teamEyebrow}</span>
              <h3 className="text-2xl md:text-3xl font-serif mt-3" style={{ color: text }}>{S.teamTitle}</h3>
            </div>
            {teamState === 'ready' ? (
              <div className={`grid gap-6 ${siteGrid(mode, { desktop: 2, tablet: 2, mobile: 1 })}`}>
                {data.team.map((member) => {
                  const pub = getPublicStaffData(member);
                  return (
                    <div key={pub.id} className="rounded-3xl border p-6 flex flex-col gap-4 min-w-0" style={{ borderColor: line, backgroundColor: card }}>
                      <div className="flex items-center gap-4">
                        <img src={pub.imageUrl} alt={pub.name} className="w-16 h-16 rounded-full object-cover border-2 shrink-0" style={{ borderColor: emeraldSoft }} />
                        <div className="min-w-0">
                          <h4 className="font-serif font-semibold text-base break-words" style={{ color: text }}>{pub.name}</h4>
                          <p className="text-[10px] uppercase tracking-[0.25em] mt-1" style={{ color: emerald }}>{pub.role}</p>
                        </div>
                      </div>
                      <button data-open-booking="true" onClick={openSiteBooking} className="site-touch w-full py-2.5 rounded-full text-[10px] uppercase tracking-[0.25em] font-semibold mt-auto" style={btnEmerald}>{S['common.bookWith'].replace('{name}', pub.name.split(' ')[0])}</button>
                    </div>
                  );
                })}
              </div>
            ) : <SectionStatePanel status={teamState} copy={X} palette={palette} />}
          </div>
        </div>

        <SiteReviews themeId="beauty_skin_spa" data={data} mode={mode} />

        {/* Location & Hours */}
        <div {...sectionProps('location', locationState)} className="site-section px-5 md:px-8 py-16 border-t" style={{ backgroundColor: beigeSoft, borderColor: line }}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-[10px] uppercase tracking-[0.4em] font-semibold" style={{ color: emerald }}>{S['common.visitEyebrow']}</span>
              <h3 className="text-2xl md:text-3xl font-serif mt-3" style={{ color: text }}>{S['common.visitTitle']}</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-3xl border space-y-4" style={{ borderColor: line, backgroundColor: card }}>
                <h4 className="font-serif font-semibold text-sm flex items-center gap-2" style={{ color: text }}>
                  <MapPin className="w-4 h-4" style={{ color: emerald }} /> {S.addressLabel}
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
                    className="site-touch w-full py-2.5 rounded-full text-[10px] uppercase tracking-[0.25em] font-semibold transition-all hover:brightness-105 flex items-center justify-center gap-2"
                    style={btnEmerald}
                  >
                    <Navigation className="w-3.5 h-3.5" /> {S['common.getDirections']}
                  </a>
                )}
              </div>

              <div className="p-6 rounded-3xl border space-y-3" style={{ borderColor: line, backgroundColor: card }}>
                <h4 className="font-serif font-semibold text-sm flex items-center gap-2" style={{ color: text }}>
                  <Clock className="w-4 h-4" style={{ color: emerald }} /> {S['common.openingHours']}
                </h4>
                <SiteSalonStatus themeId="beauty_skin_spa" data={data} placement="contact" />
                <div className="space-y-2 text-xs" style={{ color: muted }}>
                  {data.openingHours && Object.keys(data.openingHours).length > 0 ? (
                    Object.entries(data.openingHours).map(([day, sch]) => (
                      <div key={day} className="flex justify-between border-b pb-1.5" style={{ borderColor: line }}>
                        <span className="font-semibold" style={{ color: text }}>{dayLabel(day, locale)}</span>
                        {sch.open ? <span>{sch.startTime} – {sch.endTime}</span> : <span className="font-semibold" style={{ color: emerald }}>{S['common.closed']}</span>}
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
        <div id="section-contact" className="px-8 py-16 text-center" style={{ backgroundColor: cream }}>
          <div className="max-w-xl mx-auto">
            <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-4" style={{ backgroundColor: emeraldSoft }}>
              <CalendarCheck className="w-6 h-6" style={{ color: emerald }} />
            </div>
            <h3 className="text-2xl md:text-3xl font-serif mb-6" style={{ color: text }}>{S.contactTitle}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {canCall(data) && (
                <SiteProtectedContactAction action="call" data={data} themeId="beauty_skin_spa" testId="theme-contact-call" className="py-3 rounded-full border font-semibold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors" style={{ borderColor: line, color: text, backgroundColor: card }}>
                  <Phone className="w-4 h-4" style={{ color: emerald }} /> {S['common.callNow']}
                </SiteProtectedContactAction>
              )}
              {canWhatsApp(data) && (
                <SiteProtectedContactAction action="whatsapp" data={data} themeId="beauty_skin_spa" testId="theme-contact-whatsapp" className="py-3 rounded-full text-white font-semibold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all hover:brightness-105" style={{ backgroundColor: '#25D366' }}>
                  <MessageCircle className="w-4 h-4" /> {S['common.whatsApp']}
                </SiteProtectedContactAction>
              )}
              <button data-open-booking="true" onClick={openSiteBooking} className="py-3 rounded-full font-semibold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all hover:brightness-105" style={btnEmerald}>
                <CalendarCheck className="w-4 h-4" /> {S['common.bookOnline']}
              </button>
            </div>

            {(!ownerPreview || depositPercentage > 0) && (
              <div className="p-5 rounded-3xl border text-left text-xs space-y-2" style={{ borderColor: line, backgroundColor: card }}>
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5 uppercase tracking-[0.15em] text-[10px]" style={{ color: text }}>
                    <CreditCard className="w-4 h-4" style={{ color: emerald }} /> {S.depositTitle}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ backgroundColor: emeraldSoft, color: isDark ? '#bfe3d6' : emeraldDeep }}>
                    {ownerPreview ? `${depositPercentage}% advance` : S['common.advanceAdvance']}
                  </span>
                </div>
                <p style={{ color: muted }}>{ownerPreview ? `A ${depositPercentage}% advance deposit is configured for online booking.` : S.depositBody}</p>
              </div>
            )}
          </div>
        </div>

        <FinalBookingCta themeId="beauty_skin_spa" data={data} title={S.bookingTitle} body={S.bookingBody} cta={S['struct.bookCta']} palette={palette} />
        <SiteFooter themeId="beauty_skin_spa" data={data} />
        {mode === 'mobile' && (
          <>
            <div className="site-mobile-action-bar-spacer" aria-hidden />
            <div className="site-mobile-dock-spacer" aria-hidden />
          </>
        )}
      </div>
      <SiteFloatingActions themeId="beauty_skin_spa" data={data} mode={mode} />
      <SiteMobileActionBar themeId="beauty_skin_spa" data={data} mode={mode} />
      <SiteBookingHost themeId="beauty_skin_spa" data={data} />
      <SiteContactLockNotice themeId="beauty_skin_spa" data={data} />
    </div>
  );
}
