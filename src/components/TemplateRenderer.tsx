import { useEffect, useState } from 'react';
import { SalonData, getPublicStaffData, type SocialVideo } from '../types';
import { getSalonNameStyle } from '../lib/brandIdentity';
import { getReadableTextColor, withHexAlpha } from '../lib/websiteCustomization';
import { normalizeThemeId } from '../lib/themeServices';
import { DEFAULT_BRAND_CONFIG } from '../config/brandConfig';
import { digitsOnly, salonMapsHref } from '../lib/siteBooking';
import {
  type BookingContext,
  type BookingExpertOption,
  type BookingServiceOption,
  type DayScheduleInfo,
  fetchBookingContext,
  normalizeHHMM,
} from '../lib/websiteBooking';
import BookingModal, { type BookingPrefill } from './BookingModal';
import OwnerAvatar from './OwnerAvatar';
import ReelsVideoPlayer from './ReelsVideoPlayer';
import BarberTemplateRenderer from './BarberTemplateRenderer';
import HairStudioTemplateRenderer from './HairStudioTemplateRenderer';
import BeautySpaTemplateRenderer from './BeautySpaTemplateRenderer';
import FamilyFullServiceTemplateRenderer from './FamilyFullServiceTemplateRenderer';
import NailLashStudioTemplateRenderer from './NailLashStudioTemplateRenderer';
import { BundlePrice, ServicePrice } from './PromotionalPricing';
import { resolveWebsiteCopy, buildWhatsAppHref } from '../lib/websiteCopy';
import { scrollToSiteSection } from '../lib/siteNavigation';
import { Sparkles, Phone, MessageCircle, CalendarCheck, MapPin, Clock, Navigation, Instagram, Facebook, Youtube, Video, Heart, ExternalLink, CreditCard, Play } from 'lucide-react';

interface Props {
  data: SalonData;
  mode: 'desktop' | 'tablet' | 'mobile';
}

export default function TemplateRenderer({ data, mode }: Props) {
  const templateId = normalizeThemeId(data.templateId);

  /* ------------------------------------------------------------------ */
  /* M41 — dynamic booking wiring (legacy public templates).             */
  /*                                                                     */
  /* 1. Every Book button opens ONE shared BookingModal (name, phone,    */
  /*    date, time slot) pre-filled with the clicked Service/Bundle/     */
  /*    Stylist. Submitting POSTs to /api/bookings (guest pipeline).     */
  /* 2. Services, experts and available slots are fetched from the       */
  /*    database API on component load (useEffect below); page data is   */
  /*    only an offline fallback.                                        */
  /* ------------------------------------------------------------------ */
  const [bookingPrefill, setBookingPrefill] = useState<BookingPrefill | null>(null);
  const [liveContext, setLiveContext] = useState<BookingContext | null>(null);
  const [playingVideo, setPlayingVideo] = useState<SocialVideo | null>(null);
  const publicSlug = (data.websiteSlug || '').trim().toLowerCase();

  useEffect(() => {
    if (!publicSlug) return;
    let active = true;
    fetchBookingContext(publicSlug)
      .then((context) => { if (active) setLiveContext(context); })
      .catch(() => { if (active) setLiveContext(null); });
    return () => { active = false; };
  }, [publicSlug]);

  const openBooking = (prefill: BookingPrefill) => setBookingPrefill(prefill);

  // White-label copy — every customer-facing string in this template resolves
  // through data.websiteCopy (CMS) with safe built-in defaults.
  const copy = resolveWebsiteCopy(data);

  // Direct actions — Call Now / WhatsApp use the salon's real number.
  const brandPhone = DEFAULT_BRAND_CONFIG.defaultSalon.phone;
  const rawPhone = (data.phone || '').trim() || brandPhone;
  const callDigits = digitsOnly(rawPhone) || digitsOnly(brandPhone);
  const telHref = callDigits ? `tel:${rawPhone.startsWith('+') ? '+' : ''}${callDigits}` : 'tel:';
  const whatsappHref = buildWhatsAppHref(data, copy);

  // Smooth-scroll navigation: navbar links point at the section IDs
  // (#home, #services, #team, #gallery, #videos, #contact). `scroll-behavior:
  // smooth` (index.css) covers native anchor jumps; the handler makes the
  // in-frame preview scroller move smoothly and updates the URL hash.
  const handleNavClick = (event: { preventDefault: () => void; currentTarget: EventTarget & HTMLAnchorElement }, targetId: string) => {
    event.preventDefault();
    scrollToSiteSection(targetId);
    try {
      history.replaceState(null, '', `#${targetId}`);
    } catch {
      /* some preview iframes disallow history writes — ignore */
    }
  };

  // Offline fallbacks for the modal (local draft / preview without API).
  const fallbackServices: BookingServiceOption[] = (data.services || []).map((service) => ({
    id: service.id, name: service.name, price: service.price, duration: service.duration, featured: service.featured,
  }));
  const fallbackExperts: BookingExpertOption[] = (data.team || []).map((member) => ({
    id: member.id, name: member.name, role: member.role || 'Stylist',
  }));
  const fallbackHours: Record<string, DayScheduleInfo> | null = data.openingHours
    ? Object.fromEntries(
        Object.entries(data.openingHours).map(([day, schedule]) => [
          day,
          { open: schedule.open, startTime: normalizeHHMM(schedule.startTime), endTime: normalizeHHMM(schedule.endTime) },
        ]),
      )
    : null;

  // The Barber, Hair Studio and Beauty/Spa themes are fully separate renderers —
  // not colour variations of the other themes. Render each through its own component.
  if (templateId === 'barber_mens_grooming') {
    return <BarberTemplateRenderer data={data} mode={mode} />;
  }
  if (templateId === 'hair_studio_color_bar') {
    return <HairStudioTemplateRenderer data={data} mode={mode} />;
  }
  if (templateId === 'beauty_skin_spa') {
    return <BeautySpaTemplateRenderer data={data} mode={mode} />;
  }
  if (templateId === 'family_full_service') {
    return <FamilyFullServiceTemplateRenderer data={data} mode={mode} />;
  }
  if (templateId === 'nail_lash_studio') {
    return <NailLashStudioTemplateRenderer data={data} mode={mode} />;
  }

  // Template-specific styling configurations (remaining themes).
  // The five canonical Phase 1 themes return their own dedicated renderer
  // above; this block is the legacy generic fallback (formerly keyed by the
  // retired 'hair' starter theme) and applies the same defaults for any
  // unknown/legacy templateId.
  const config: {
    navBg: string;
    heroBg: string;
    accentColor: string;
    headingFont: string;
    cardBg: string;
    footerBg: string;
  } = {
    navBg: 'bg-white text-gray-900 border-gray-100',
    heroBg: 'bg-gray-900 text-white',
    accentColor: '#ac0053',
    headingFont: 'font-serif',
    cardBg: 'bg-white border-gray-100 text-gray-900',
    footerBg: 'bg-[#1a1c1c] text-white',
  };
  const brandColor = data.brandColor || config.accentColor;
  const isDark = data.websiteAppearance === 'dark';
  const brandButtonStyle = {
    backgroundColor: brandColor,
    color: getReadableTextColor(brandColor),
  };
  const accentStyle = { color: brandColor };
  const darkCard = isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : config.cardBg;
  // Note: the dynamic team title ("Meet Our Barbers" / "Our Experts" /
  // "Meet Our Stylists") is resolved by resolveWebsiteCopy → copy.teamTitle.

  return (
    <div className={`${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'} shadow-xl border flex flex-col overflow-hidden transition-all duration-500 origin-top mx-auto h-full ${
      mode === 'desktop' ? 'w-full max-w-[950px] rounded-xl' : 'w-[375px] max-w-full max-h-[812px] rounded-[2rem] border-[8px] border-gray-900'
    }`}>
      {/* Browser/Phone Header Bar */}
      {mode === 'desktop' ? (
        <div className={`h-10 border-b flex items-center px-4 gap-2 shrink-0 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'}`}>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          </div>
          <div className={`mx-auto px-4 py-1 rounded text-[10px] border font-mono tracking-wide ${isDark ? 'bg-zinc-950 text-zinc-400 border-zinc-700' : 'bg-white text-gray-500 border-gray-200'}`}>
            {DEFAULT_BRAND_CONFIG.platform.websiteUrl.replace(/^https?:\/\//, '')}/{data.websiteSlug || data.salonName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'yoursalon'}
          </div>
        </div>
      ) : (
        <div className="h-6 w-full flex justify-center items-start bg-gray-900 shrink-0">
          <div className="w-24 h-4 bg-black rounded-b-xl"></div>
        </div>
      )}

      {/* Scrollable Website Content */}
      <div className={`site-legacy-scroll flex-1 overflow-y-auto custom-scrollbar pb-16 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-white'}`}>
        
        {/* Navigation Header — links point at the section IDs below
            (#home, #services, #team, #gallery, #videos, #contact). */}
        <div id="section-header" className={`px-6 py-4 flex items-center justify-between border-b sticky top-0 backdrop-blur-md z-30 transition-colors ${isDark ? 'bg-zinc-950/95 text-zinc-100 border-zinc-800' : config.navBg}`}>
          <button
            type="button"
            aria-label={`${data.salonName || 'Your Salon'} — ${copy.nav.home}`}
            onClick={() => scrollToSiteSection('home')}
            className="flex items-center gap-2 text-left cursor-pointer"
          >
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="Logo" className="h-7 w-auto object-contain max-w-[120px]" />
            ) : (
              <Sparkles className="w-5 h-5" style={{ color: brandColor }} />
            )}
            <span className="font-bold text-lg" style={getSalonNameStyle(data)}>{data.salonName || 'Your Salon'}</span>
          </button>
          {mode === 'desktop' && (
            <nav className="flex gap-6 text-xs font-medium opacity-90" aria-label="Website navigation">
              <a href="#home" data-testid="nav-home" onClick={(event) => handleNavClick(event, 'home')} className="font-bold hover:opacity-75 transition-opacity">
                {copy.nav.home}
              </a>
              <a href="#services" data-testid="nav-services" onClick={(event) => handleNavClick(event, 'services')} className="hover:opacity-75 transition-opacity">
                {copy.nav.services}
              </a>
              {data.team && data.team.length > 0 && (
                <a href="#team" data-testid="nav-team" onClick={(event) => handleNavClick(event, 'team')} className="hover:opacity-75 transition-opacity">
                  {copy.nav.team}
                </a>
              )}
              {data.gallery && data.gallery.length > 0 && (
                <a href="#gallery" data-testid="nav-gallery" onClick={(event) => handleNavClick(event, 'gallery')} className="hover:opacity-75 transition-opacity">
                  {copy.nav.gallery}
                </a>
              )}
              {data.socialVideos && data.socialVideos.length > 0 && (
                <a href="#videos" data-testid="nav-videos" onClick={(event) => handleNavClick(event, 'videos')} className="hover:opacity-75 transition-opacity">
                  {copy.nav.videos}
                </a>
              )}
              <a href="#contact" data-testid="nav-contact" onClick={(event) => handleNavClick(event, 'contact')} className="hover:opacity-75 transition-opacity">
                {copy.nav.contact}
              </a>
            </nav>
          )}
        </div>

        {/* Hero Section */}
        <div id="home" className={`px-6 py-16 text-center relative overflow-hidden min-h-[300px] flex items-center justify-center scroll-mt-20 ${config.heroBg}`}>
          {data.heroImageUrl && (
            <img
              src={data.heroImageUrl}
              alt="Hero Banner"
              className={`absolute inset-0 w-full h-full object-cover opacity-45 ${
                data.heroPosition === 'Top' ? 'object-top' : data.heroPosition === 'Bottom' ? 'object-bottom' : 'object-center'
              }`}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent"></div>
          <div className="relative z-10 max-w-xl mx-auto text-white">
            <>
              <span
                className="inline-block px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider mb-3"
                style={{ color: brandColor, backgroundColor: withHexAlpha(brandColor, '22'), borderColor: withHexAlpha(brandColor, '55') }}
              >
                {copy.heroBadge}
              </span>
              <h1 className={`text-2xl md:text-4xl font-bold mb-3 ${config.headingFont}`}>
                {copy.heroHeadline}
              </h1>
              <p className="text-xs md:text-sm text-gray-200 mb-6 max-w-md mx-auto leading-relaxed opacity-90">
                {copy.heroSubline}
              </p>
              <button
                type="button"
                data-testid="hero-book-cta"
                onClick={() => openBooking({ kind: 'general' })}
                className={`px-6 py-3 rounded-xl font-bold text-xs shadow-lg transition-transform active:scale-95 hover:brightness-90`}
                style={brandButtonStyle}
              >
                {copy.bookNowCta}
              </button>
            </>
          </div>
        </div>

        {/* Services Section */}
        <div id="services" className={`px-6 py-12 max-w-3xl mx-auto scroll-mt-20 ${isDark ? 'text-zinc-100' : ''}`}>
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: brandColor }}>
              {copy.servicesEyebrow}
            </span>
            <h2 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>
              {copy.servicesTitle}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {copy.servicesBody}
            </p>
          </div>

          <div className={`grid gap-4 ${mode === 'desktop' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {data.services && data.services.map(s => (
              <div
                key={s.id}
                className={`p-5 border shadow-2xs hover:shadow-md transition-all ${darkCard} rounded-2xl`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-sm">{s.name}</h4>
                  <ServicePrice service={s} offers={data.offers} className="font-bold text-sm" style={accentStyle} />
                </div>
                <p className="text-xs opacity-75 mb-4 line-clamp-2">{s.description}</p>
                <div className="flex justify-between items-center pt-2 border-t border-gray-100/20 text-[11px]">
                  <span className="opacity-60 font-medium">{s.duration} mins</span>
                  <button
                    type="button"
                    data-testid="book-slot-cta"
                    onClick={() => openBooking({ kind: 'service', item: { id: s.id, name: s.name, price: s.price, duration: s.duration } })}
                    className="font-bold text-xs transition-colors hover:brightness-90 px-4 py-1.5 rounded-lg"
                    style={brandButtonStyle}
                  >
                    {copy.bookSlotCta}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Packages Section (Value Packages & Bundles) */}
          {data.packages && data.packages.length > 0 && (
            <div className="mt-12 pt-10 border-t border-gray-200/40">
              <div className="text-center mb-8">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={accentStyle}>{copy.packagesEyebrow}</span>
                <h3 className={`text-xl font-bold mt-1 ${config.headingFont}`}>{copy.packagesTitle}</h3>
                <p className="text-xs text-gray-500 mt-1">{copy.packagesBody}</p>
              </div>

              <div className="grid gap-4 grid-cols-1">
                {data.packages.map(p => (
                  <div key={p.id} className={`p-5 rounded-2xl border border-dashed hover:border-solid transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${darkCard}`}>
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm">{p.name}</h4>
                        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">{copy.bestValueBadge}</span>
                      </div>
                      <p className="text-xs opacity-75 leading-relaxed">{p.description}</p>
                      <div className="text-[10px] opacity-50 font-bold uppercase tracking-wider flex items-center gap-2 pt-1">
                        <span>🕒 {p.duration} mins</span>
                        <span>•</span>
                        <span>Complete Bundle</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between md:flex-col md:items-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-0 border-gray-150">
                      <BundlePrice bundle={p} offers={data.offers} className="font-extrabold text-base md:text-lg" style={accentStyle} dark={isDark} />
                      <button
                        type="button"
                        data-testid="book-bundle-cta"
                        onClick={() => openBooking({ kind: 'bundle', item: { id: p.id, name: p.name, price: p.price, duration: p.duration } })}
                        className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-colors hover:brightness-90`}
                        style={brandButtonStyle}
                      >
                        {copy.bookBundleCta}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Owner / Founder Section */}
        {data.ownerName && (
          <div id="section-owner" className={`px-6 py-10 border-y ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-50 border-gray-100'}`}>
            <div className="max-w-xl mx-auto flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-md shrink-0">
                <OwnerAvatar
                  photoUrl={data.ownerPhotoUrl}
                  name={data.ownerName}
                  className="w-full h-full text-2xl"
                  alt="Founder"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={accentStyle}>{data.ownerRole || copy.ownerRoleFallback}</span>
                <h3 className={`text-xl font-bold mt-0.5 ${isDark ? 'text-white' : 'text-gray-900'}`}>{data.ownerName}</h3>
                <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-gray-600'}`}>
                  "{data.reviewedContent?.ownerIntro || copy.ownerIntroFallback}"
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Team Section (Conditional: Hide if no team members) */}
        {data.team && data.team.length > 0 && (
          <div id="team" className={`px-6 py-12 max-w-3xl mx-auto scroll-mt-20 ${isDark ? 'text-zinc-100' : ''}`}>
            <div className="text-center mb-8">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={accentStyle}>{copy.teamEyebrow}</span>
              <h3 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>{copy.teamTitle}</h3>
              <p className="text-xs text-gray-500 mt-1">{copy.teamBody}</p>
            </div>

            <div className={`grid gap-5 ${mode === 'desktop' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {data.team.map(member => {
                const pub = getPublicStaffData(member);
                return (
                  <div key={pub.id} className={`rounded-2xl border p-5 shadow-xs hover:shadow-md transition-all flex flex-col gap-3 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200/80'}`}>
                    <div className="flex items-start gap-4">
                      <img src={pub.imageUrl} alt={pub.name} className="w-14 h-14 rounded-full object-cover border-2 border-gray-100 shrink-0 shadow-xs" />
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-bold text-base ${isDark ? 'text-white' : 'text-gray-900'}`}>{pub.name}</h4>
                        <p className="text-xs font-bold uppercase tracking-wider mt-0.5" style={accentStyle}>{pub.role}</p>
                        {pub.phone && <p className={`text-[11px] mt-1 flex items-center gap-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}><Phone className="w-3 h-3" />{pub.phone}</p>}
                      </div>
                    </div>
                    {pub.specialties && pub.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {pub.specialties.map((spec, i) => (
                          <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-zinc-800 text-zinc-200' : 'bg-gray-100 text-gray-800'}`}>
                            {spec}
                          </span>
                        ))}
                      </div>
                    )}
                    {pub.bio && (
                      <p className={`text-xs line-clamp-2 italic p-2.5 rounded-lg border ${isDark ? 'text-zinc-300 bg-zinc-950 border-zinc-800' : 'text-gray-600 bg-gray-50 border-gray-100'}`}>
                        "{pub.bio}"
                      </p>
                    )}
                    <button
                      type="button"
                      data-testid="book-with-stylist-cta"
                      onClick={() => openBooking({ kind: 'stylist', stylist: { id: member.id, name: pub.name, role: pub.role } })}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-colors mt-auto hover:brightness-90`}
                      style={brandButtonStyle}
                    >
                      {copy.bookWithLabel(pub.name)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Gallery Section (Conditional: Hide if empty) */}
        {data.gallery && data.gallery.length > 0 && (
          <div id="gallery" className={`px-6 py-12 border-t scroll-mt-20 ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-gray-50 border-gray-100'}`}>
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-8">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={accentStyle}>{copy.galleryEyebrow}</span>
                <h3 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>{copy.galleryTitle}</h3>
                <p className="text-xs text-gray-500 mt-1">{copy.galleryBody}</p>
              </div>
              <div className={`grid gap-3 ${mode === 'desktop' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {data.gallery.map(item => (
                  <div key={item.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 shadow-2xs group">
                    <img src={item.url} alt={item.alt || 'Gallery photo'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-end">
                      <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-md w-fit">
                        {item.category || copy.galleryCategoryFallback}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Reels & Styling Videos — interactive thumbnails open the video
            player (YouTube/Instagram embeds, HTML5 <video> for direct
            files, original-platform fallback otherwise). */}
        {data.socialVideos && data.socialVideos.length > 0 && (
          <div id="videos" className={`px-6 py-12 max-w-3xl mx-auto scroll-mt-20 ${isDark ? 'text-zinc-100' : ''}`}>
            <div className="text-center mb-8">
              <span className="text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1" style={accentStyle}>
                <Video className="w-3 h-3" /> {copy.videosEyebrow}
              </span>
              <h3 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>{copy.videosTitle}</h3>
            </div>
            <div className={`grid gap-4 ${mode === 'desktop' ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {data.socialVideos.map(video => (
                <button
                  key={video.id}
                  type="button"
                  data-testid="reel-card"
                  aria-label={`Play video: ${video.title}`}
                  onClick={() => setPlayingVideo(video)}
                  className="relative aspect-[9/16] rounded-xl overflow-hidden group border border-gray-200 shadow-xs bg-gray-900 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ ['--tw-ring-color' as string]: brandColor }}
                >
                  <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  {/* Play affordance */}
                  <span className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                    <span className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-[2px] border border-white/40 flex items-center justify-center group-hover:scale-110 group-hover:bg-black/70 transition-all duration-300">
                      <Play className="w-5 h-5 fill-white text-white translate-x-[1px]" />
                    </span>
                  </span>
                  <div className="absolute bottom-3 left-3 right-3 text-white z-20">
                    <p className="text-xs font-bold line-clamp-2">{video.title}</p>
                    {video.likesCount && (
                      <span className="flex items-center gap-1 text-[10px] text-pink-400 font-semibold mt-1">
                        <Heart className="w-3 h-3 fill-pink-400" /> {video.likesCount}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lightbox player for the selected reel */}
        {playingVideo && (
          <ReelsVideoPlayer
            video={playingVideo}
            salonName={data.salonName}
            onClose={() => setPlayingVideo(null)}
          />
        )}

        {/* Location & Opening Hours Section */}
        <div id="section-location" className={`px-6 py-12 border-t ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-gray-50 border-gray-100'}`}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={accentStyle}>{copy.visitEyebrow}</span>
              <h3 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>{copy.visitTitle}</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className={`p-6 rounded-2xl border shadow-xs space-y-4 ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200/80'}`}>
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4" style={accentStyle} /> {copy.addressLabel}
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-gray-600'}`}>
                  {copy.address}
                </p>
                <a
                  data-testid="get-directions"
                  href={salonMapsHref(data)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Navigation className="w-3.5 h-3.5" /> {copy.directionsCta}
                </a>
              </div>

              <div className={`p-6 rounded-2xl border shadow-xs space-y-3 ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200/80'}`}>
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" style={accentStyle} /> {copy.hoursLabel}
                </h4>
                <div className={`space-y-2 text-xs ${isDark ? 'text-zinc-300' : 'text-gray-600'}`}>
                  {data.openingHours ? (
                    Object.entries(data.openingHours).map(([day, sch]) => (
                      <div key={day} className={`flex justify-between border-b pb-1.5 capitalize ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                        <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{day}</span>
                        {sch.open ? <span>{sch.startTime} – {sch.endTime}</span> : <span className="text-red-500 font-bold">{copy.closedLabel}</span>}
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between"><span>{copy.defaultHoursDay}</span><span>{copy.defaultHoursTime}</span></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact & Booking Options Section */}
        <div id="contact" className={`px-6 py-12 max-w-xl mx-auto text-center scroll-mt-20 ${isDark ? 'text-zinc-100' : ''}`}>
          <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ backgroundColor: withHexAlpha(brandColor, '1a') }}>
            <CalendarCheck className="w-6 h-6" style={accentStyle} />
          </div>
          <h3 className={`text-2xl font-bold mb-6 ${config.headingFont}`}>{copy.contactTitle}</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <a
              data-testid="call-now"
              href={telHref}
              className="py-3 bg-white border border-gray-200 hover:border-gray-400 text-gray-900 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" style={accentStyle} /> {copy.callCta}
            </a>
            <a
              data-testid="whatsapp-cta"
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="py-3 bg-[#25D366] text-white font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" /> {copy.whatsappCta}
            </a>
            <button
              type="button"
              data-testid="book-online-cta"
              onClick={() => openBooking({ kind: 'general' })}
              className={`py-3 text-white font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2 hover:brightness-90`}
              style={brandButtonStyle}
            >
              <CalendarCheck className="w-4 h-4" /> {copy.bookOnlineCta}
            </button>
          </div>

          <div className={`p-4 rounded-xl border text-left text-xs space-y-2 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
            <div className={`flex items-center justify-between font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <span className="flex items-center gap-1.5"><CreditCard className="w-4 h-4" style={accentStyle} /> {copy.depositTitle}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ color: brandColor, backgroundColor: withHexAlpha(brandColor, '1a') }}>{copy.depositBadge}</span>
            </div>
            <p className={isDark ? 'text-zinc-400' : 'text-gray-500'}>{copy.depositBody}</p>
          </div>
        </div>

        {/* Footer */}
        <footer id="section-footer" className={`px-6 py-8 text-center text-xs border-t border-gray-800 ${config.footerBg}`}>
          <p className="font-bold text-sm mb-1" style={getSalonNameStyle(data)}>{data.salonName || 'Your Salon'}</p>
          <p className="opacity-70 mb-4">{data.tagline || copy.footerTagline}</p>
          <p className="opacity-50 text-[10px]">© {new Date().getFullYear()} {data.salonName || 'Salon'}. {DEFAULT_BRAND_CONFIG.platform.poweredByText}.</p>
        </footer>

        {/* M41 — shared booking modal for all Book CTAs (database-backed). */}
        <BookingModal
          prefill={bookingPrefill}
          initialContext={liveContext}
          salonSlug={publicSlug}
          salonName={data.salonName}
          brandColor={brandColor}
          fallbackServices={fallbackServices}
          fallbackExperts={fallbackExperts}
          fallbackHours={fallbackHours}
          phoneHref={telHref}
          whatsappHref={whatsappHref}
          onClose={() => setBookingPrefill(null)}
        />

      </div>
    </div>
  );
}
