import { useEffect, useMemo, type CSSProperties } from 'react';
import { SalonData, getPublicStaffData } from '../types';
import { DEFAULT_BRAND_CONFIG } from '../config/brandConfig';
import { publicWebsiteHref, slugifySalonName } from '../lib/publicWebsiteUrl';
import SiteHeader, { useSiteLocale, useThemeAppearance } from './SiteHeader';
import OwnerAvatar from './OwnerAvatar';
import { BundlePrice } from './PromotionalPricing';
import { FinalBookingCta, SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import SiteFooter from './SiteFooter';
import SiteFloatingActions from './SiteFloatingActions';
import SiteMobileActionBar from './SiteMobileActionBar';
import SiteBookingHost from './SiteBookingHost';
import SiteContactLockNotice from './SiteContactLockNotice';
import SiteProtectedContactAction from './SiteProtectedContactAction';
import { useIsOwnerPreview } from './SiteRenderContext';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import BarberHero from './heroes/BarberHero';
import SiteSeo from './SiteSeo';
import SiteImage from './SiteImage';
import SiteSkeleton from './SiteSkeleton';
import SiteSalonStatus from './SiteSalonStatus';
import SiteReviews from './SiteReviews';
import SiteVideoGallery from './SiteVideoGallery';
import SiteTrust from './SiteTrust';
import SiteFeaturedServices from './SiteFeaturedServices';
import SiteOffers from './SiteOffers';
import SiteCombos from './SiteCombos';
import SiteGallery from './SiteGallery';
import SiteServiceDirectory from './SiteServiceDirectory';
import { setActiveTheme, markPerformance } from '../lib/sitePerformance';
import { canCall, canWhatsApp, hasSalonAddress, openSiteBooking, salonMapsHref } from '../lib/siteBooking';
import { OWNER_PREVIEW_EMPTY } from '../lib/ownerPreview';
import { BARBER_SURFACES, surfacesOf } from '../lib/themeSurfaces';
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
  CreditCard,
} from 'lucide-react';

interface Props {
  data: SalonData;
  mode: ViewportMode;
}

/**
 * BARBER & MEN'S GROOMING — dedicated theme renderer (Theme ID: barber_mens_grooming).
 *
 * This is NOT a colour variation of the existing themes. It is a complete,
 * self-contained layout with its own visual language:
 *   - Dark charcoal surfaces, vintage gold accents, sharp corners
 *   - Strong uppercase display typography with wide letter-spacing
 *   - A barbershop "price board" services menu with numbered entries
 *   - Theme-specific sections (The Barbers, Client Reviews) with static,
 *     presentation-only content (no database wiring in this phase)
 *
 * PHASE 10.2: surfaces come from BARBER_SURFACES (dark = the native design,
 * light = a warm "day shift" cream variant); all customer-facing copy comes
 * from the global siteText() table (barber namespace) so the header Language
 * control flips the whole page between English and हिन्दी.
 */
export default function BarberTemplateRenderer({ data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  // Live locale + appearance: re-render when the header controls switch.
  const locale = useSiteLocale();
  // Seed the owner's explicit per-template appearance choice, never the legacy
  // global websiteAppearance field: when the owner never chose one, the
  // theme's design default (e.g. barber dark) must win.
  setOwnerAppearanceDefault(data.templateConfig?.appearance);
  const appearance = useThemeAppearance('barber_mens_grooming');
  const t = surfacesOf(BARBER_SURFACES, appearance);
  const { gold, goldBright, goldSoft, charcoal, charcoalSoft, muted, line, text, textStrong, card, well, chipLine, accentText } = t;
  const S = { ...siteText('barber_mens_grooming', locale), ...structureText('barber_mens_grooming', locale) };
  const X = structureCopyFrom(S);
  const palette = { accent: gold, text: textStrong, muted, card, line, invert: '#141414' };
  const headerMode = headerModeOf(mode);
  // PHASE 10.12 — performance: memoize heavy lists, clear stale theme data, marks
  useEffect(() => {
    setActiveTheme('barber_mens_grooming');
    markPerformance('barber-render-start');
    return () => {
      markPerformance('barber-render-end');
    };
  }, []);
  const packages = useMemo(() => activeCatalogItems(data.packages), [data.packages]);
  const teamItems = useMemo(() => data.team || [], [data.team]);
  const offersState = resolveSectionState('offers', packages);
  const teamState = resolveSectionState('team', teamItems);
  const ownerState = resolveSectionState('owner', data.ownerName ? [data.ownerName] : []);
  const aboutState = resolveSectionState('about', (data.about || (!ownerPreview && S.heroFallbackAbout)) ? [1] : []);
  const hasAddress = hasSalonAddress(data, ownerPreview);
  const locationState = resolveSectionState('location', hasAddress ? [data.address?.fullAddress] : []);
  const depositPercentage = data.bookingRules?.advanceDepositPercentage ?? 0;
  const btnGold: CSSProperties = {
    backgroundColor: gold,
    color: '#141414',
  };

  return (
    <div className={`relative bg-black border shadow-xl flex flex-col overflow-hidden transition-all duration-500 origin-top mx-auto h-full ${siteFrameClass(mode)} ${mode === 'mobile' ? 'site-has-mobile-dock' : ''}`} style={{ borderColor: line }}>
      {/* Browser/Phone Header Bar (mock chrome — not part of the website) */}
      {mode !== 'mobile' ? (
        <div className="h-10 border-b flex items-center px-4 gap-2 shrink-0 bg-[#0c0c0c]" style={{ borderColor: '#262626' }}>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          </div>
          <div className="mx-auto px-4 py-1 rounded text-[10px] border font-mono tracking-wide text-neutral-500 bg-[#141414]" style={{ borderColor: '#262626' }}>
            {ownerPreview && !(data.websiteSlug || '').trim()
              ? OWNER_PREVIEW_EMPTY.websiteAddress
              : publicWebsiteHref((data.websiteSlug || '').trim() ? data.websiteSlug : slugifySalonName(data.salonName) || 'yoursalon', DEFAULT_BRAND_CONFIG.platform.websiteUrl)}
          </div>
        </div>
      ) : (
        <div className="h-6 w-full flex justify-center items-start bg-black shrink-0">
          <div className="w-24 h-4 rounded-b-xl" style={{ backgroundColor: '#262626' }}></div>
        </div>
      )}

      {/* Scrollable Website Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar site-scroll pb-20" style={{ backgroundColor: t.page, color: text }}>
        <SiteSeo themeId="barber_mens_grooming" data={data} mode={mode} />
        <SiteAnnouncementBar themeId="barber_mens_grooming" data={data} />
        <SiteHeader themeId="barber_mens_grooming" data={data} mode={headerMode} />

        {/* Hero — PHASE 11.1: dedicated barber hero (cinematic slab) */}
        <BarberHero data={data} mode={mode} />

        {/* Trust / Stats — PHASE 12.1: real, configured data only */}
        <SiteTrust themeId="barber_mens_grooming" data={data} mode={mode} />

        {/* Featured Services — PHASE 12.2: theme-specific suggested services only */}
        <SiteFeaturedServices themeId="barber_mens_grooming" data={data} mode={mode} />

        {/* Services — complete directory (PHASE 12.4: theme-scoped categories + search + sort) */}
        <SiteServiceDirectory themeId="barber_mens_grooming" data={data} mode={mode} />

        {/* Offers & Discounts */}
        <SiteOffers themeId="barber_mens_grooming" data={data} mode={mode} />

        {/* Combos & Packages */}
        <SiteCombos themeId="barber_mens_grooming" data={data} mode={mode} />

        {/* Gallery — PHASE 14.1: theme-scoped portfolio (featured, filter, lightbox, before/after) */}
        <SiteGallery themeId="barber_mens_grooming" data={data} mode={mode} />

        <SiteVideoGallery themeId="barber_mens_grooming" data={data} mode={mode} />

        {/* About Salon */}
        <div {...sectionProps('about', aboutState)} className="site-section px-6 py-14" style={{ backgroundColor: charcoal }}>
          <div className="max-w-2xl mx-auto text-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: accentText }}>{S.aboutEyebrow}</span>
            <h3 className="text-2xl md:text-3xl font-black uppercase tracking-[0.05em] mt-2" style={{ color: textStrong }}>{S.aboutTitle}</h3>
            <p className="text-xs md:text-sm mt-4 leading-relaxed" style={{ color: muted }}>{data.about || (ownerPreview ? OWNER_PREVIEW_EMPTY.about : S.heroFallbackAbout)}</p>
          </div>
        </div>

        {/* Owner / Founder */}
        <div {...sectionProps('owner', ownerState)} className="site-section px-6 py-12 border-y" style={{ backgroundColor: charcoalSoft, borderColor: line }}>
          {ownerState === 'ready' ? (
            <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
              {shouldShowOwnerPhoto(data) && (
                <div className="w-28 h-28 rounded-full overflow-hidden shrink-0 border-2 shadow-lg" style={{ borderColor: gold }}>
                  <OwnerAvatar photoUrl={data.ownerPhotoUrl} name={data.ownerName} className="w-full h-full text-3xl" alt="Founder" />
                </div>
              )}
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: accentText }}>{data.ownerRole || S.ownerFallbackRole}</span>
                <h3 className="text-2xl font-black uppercase tracking-[0.05em] mt-1 break-words" style={{ color: textStrong }}>{data.ownerName}</h3>
                <p className="text-xs mt-2 leading-relaxed italic" style={{ color: muted }}>“{data.reviewedContent?.ownerIntro || S.ownerFallbackIntro}”</p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto"><SectionStatePanel status={ownerState} copy={X} palette={palette} emptyTitle={S.ownerEmptyTitle} emptyBody={S.ownerEmptyBody} /></div>
          )}
        </div>

        {/* Meet the Staff */}
        <div {...sectionProps('team', teamState)} className="site-section px-6 py-14" style={{ backgroundColor: charcoal }}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <span className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: accentText }}>{S.teamEyebrow}</span>
              <h3 className="text-2xl md:text-3xl font-black uppercase tracking-[0.05em] mt-2" style={{ color: textStrong }}>{S.teamTitle}</h3>
              <div className="h-px w-16 mx-auto mt-4" style={{ backgroundColor: gold }}></div>
            </div>
            {teamState === 'ready' ? (
              <div className={`grid gap-5 ${siteGrid(mode, { desktop: 2, tablet: 2, mobile: 1 })}`}>
                {teamItems.map((member) => {
                  const pub = getPublicStaffData(member);
                  return (
                    <div key={pub.id} className="border hover:border-[#c9a227]/70 transition-colors p-5 flex flex-col gap-4 min-w-0" style={{ backgroundColor: card, borderColor: line, contain: 'content' }}>
                      <div className="flex items-start gap-4">
                        <SiteImage src={pub.imageUrl} alt={pub.name} className="w-16 h-16 object-cover border-2 shrink-0" style={{ borderColor: gold }} context="team" aspectRatio="1/1" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-base uppercase tracking-wider break-words" style={{ color: textStrong }}>{pub.name}</h4>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-1" style={{ color: accentText }}>{pub.role}</p>
                          {pub.phone && (
                            <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: muted }}>
                              <Phone className="w-3 h-3" />{pub.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      {pub.specialties && pub.specialties.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {pub.specialties.map((spec, i) => (
                            <span key={i} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 border" style={{ color: muted, borderColor: chipLine }}>
                              {spec}
                            </span>
                          ))}
                        </div>
                      )}
                      {pub.bio && (
                        <p className="text-xs line-clamp-2 italic p-3 border" style={{ color: muted, backgroundColor: well, borderColor: line }}>
                          “{pub.bio}”
                        </p>
                      )}
                      <button data-open-booking="true" onClick={openSiteBooking} className="site-touch w-full py-2.5 text-xs font-black uppercase tracking-[0.2em] transition-all hover:brightness-110 mt-auto" style={btnGold}>
                        {S['common.bookWith'].replace('{name}', pub.name.split(' ')[0])}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <SectionStatePanel status={teamState} copy={X} palette={palette} />
            )}
          </div>
        </div>

        <SiteReviews themeId="barber_mens_grooming" data={data} mode={mode} />

        {/* Location + Contact */}
        <div {...sectionProps('location', locationState)} className="site-section px-6 py-14 border-t" style={{ backgroundColor: charcoalSoft, borderColor: line }}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <span className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: accentText }}>{S.visitEyebrow}</span>
              <h3 className="text-2xl md:text-3xl font-black uppercase tracking-[0.05em] mt-2" style={{ color: textStrong }}>{S['common.visitTitle']}</h3>
            </div>

            <div className={`grid gap-6 ${siteGrid(mode, { desktop: 2, tablet: 2, mobile: 1 })}`}>
              <div className="p-6 border space-y-4" style={{ backgroundColor: card, borderColor: line }}>
                <h4 className="font-black text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: textStrong }}>
                  <MapPin className="w-4 h-4" style={{ color: gold }} /> {S.addressLabel}
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
                    className="site-touch w-full py-2.5 text-xs font-black uppercase tracking-[0.2em] border transition-all hover:brightness-110 flex items-center justify-center gap-2"
                    style={btnGold}
                  >
                    <Navigation className="w-3.5 h-3.5" /> {S['common.getDirections']}
                  </a>
                )}
              </div>

              <div className="p-6 border space-y-3" style={{ backgroundColor: card, borderColor: line }}>
                <h4 className="font-black text-sm uppercase tracking-wider flex items-center gap-2" style={{ color: textStrong }}>
                  <Clock className="w-4 h-4" style={{ color: gold }} /> {S['common.openingHours']}
                </h4>
                <SiteSalonStatus themeId="barber_mens_grooming" data={data} placement="contact" />
                <div className="space-y-2 text-xs" style={{ color: muted }}>
                  {data.openingHours && Object.keys(data.openingHours).length > 0 ? (
                    Object.entries(data.openingHours).map(([day, sch]) => (
                      <div key={day} className="flex justify-between border-b pb-1.5" style={{ borderColor: line }}>
                        <span className="font-bold" style={{ color: textStrong }}>{dayLabel(day, locale)}</span>
                        {sch.open ? <span>{sch.startTime} – {sch.endTime}</span> : <span className="font-black" style={{ color: accentText }}>{S['common.closed']}</span>}
                      </div>
                    ))
                  ) : ownerPreview ? (
                    <p>{OWNER_PREVIEW_EMPTY.hours}</p>
                  ) : (
                    <div className="flex justify-between"><span>Mon - Sat</span><span>10:00 AM - 9:00 PM</span></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact & Booking */}
        <div id="section-contact" className="px-6 py-14 text-center" style={{ backgroundColor: charcoal }}>
          <div className="max-w-xl mx-auto">
            <div className="w-12 h-12 mx-auto flex items-center justify-center border mb-4" style={{ borderColor: gold }}>
              <CalendarCheck className="w-6 h-6" style={{ color: gold }} />
            </div>
            <h3 className="text-2xl md:text-3xl font-black uppercase tracking-[0.05em] mb-6" style={{ color: textStrong }}>{S.contactTitle}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {canCall(data) && (
                <SiteProtectedContactAction action="call" data={data} themeId="barber_mens_grooming" testId="theme-contact-call" className="site-touch py-3 border hover:border-[#c9a227] font-black text-[11px] uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-colors" style={{ backgroundColor: card, borderColor: line, color: textStrong }}>
                  <Phone className="w-4 h-4" style={{ color: gold }} /> {S['common.callNow']}
                </SiteProtectedContactAction>
              )}
              {canWhatsApp(data) && (
                <SiteProtectedContactAction action="whatsapp" data={data} themeId="barber_mens_grooming" testId="theme-contact-whatsapp" className="py-3 text-white font-black text-[11px] uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all hover:brightness-110" style={{ backgroundColor: '#25D366' }}>
                  <MessageCircle className="w-4 h-4" /> {S['common.whatsApp']}
                </SiteProtectedContactAction>
              )}
              <button data-open-booking="true" onClick={openSiteBooking} className="py-3 font-black text-[11px] uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all hover:brightness-110" style={btnGold}>
                <CalendarCheck className="w-4 h-4" /> {S['common.bookOnline']}
              </button>
            </div>

            {(!ownerPreview || depositPercentage > 0) && (
              <div className="p-4 border text-left text-xs space-y-2" style={{ backgroundColor: card, borderColor: line }}>
                <div className="flex items-center justify-between font-black">
                  <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]" style={{ color: textStrong }}>
                    <CreditCard className="w-4 h-4" style={{ color: gold }} /> {S.depositTitle}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-black uppercase" style={{ backgroundColor: goldSoft, color: goldBright }}>
                    {ownerPreview ? `${depositPercentage}% advance` : S['common.advanceAdvance']}
                  </span>
                </div>
                <p style={{ color: muted }}>{ownerPreview ? `A ${depositPercentage}% advance deposit is configured for online booking.` : S.depositBody}</p>
              </div>
            )}
          </div>
        </div>

        <FinalBookingCta themeId="barber_mens_grooming" data={data} title={S.bookingTitle} body={S.bookingBody} cta={S['struct.bookCta']} palette={{ ...palette, accent: gold }} sharp />
        <SiteFooter themeId="barber_mens_grooming" data={data} />
        {mode === 'mobile' && (
          <>
            <div className="site-mobile-action-bar-spacer" aria-hidden />
            <div className="site-mobile-dock-spacer" aria-hidden />
          </>
        )}
      </div>
      <SiteFloatingActions themeId="barber_mens_grooming" data={data} mode={mode} />
      <SiteMobileActionBar themeId="barber_mens_grooming" data={data} mode={mode} />
      <SiteBookingHost themeId="barber_mens_grooming" data={data} />
      <SiteContactLockNotice themeId="barber_mens_grooming" data={data} />
    </div>
  );
}
