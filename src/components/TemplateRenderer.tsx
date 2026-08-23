import { useEffect, useState } from 'react';
import { SalonData, getPublicStaffData } from '../types';
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
import BarberTemplateRenderer from './BarberTemplateRenderer';
import HairStudioTemplateRenderer from './HairStudioTemplateRenderer';
import BeautySpaTemplateRenderer from './BeautySpaTemplateRenderer';
import FamilyFullServiceTemplateRenderer from './FamilyFullServiceTemplateRenderer';
import NailLashStudioTemplateRenderer from './NailLashStudioTemplateRenderer';
import { BundlePrice, ServicePrice } from './PromotionalPricing';
import { Sparkles, Phone, MessageCircle, CalendarCheck, MapPin, Clock, Navigation, Instagram, Facebook, Youtube, Video, Heart, ExternalLink, CreditCard } from 'lucide-react';

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

  // Direct actions — Call Now / WhatsApp use the salon's real number.
  const brandPhone = DEFAULT_BRAND_CONFIG.defaultSalon.phone;
  const rawPhone = (data.phone || '').trim() || brandPhone;
  const callDigits = digitsOnly(rawPhone) || digitsOnly(brandPhone);
  const telHref = callDigits ? `tel:${rawPhone.startsWith('+') ? '+' : ''}${callDigits}` : 'tel:';
  const waDigits = digitsOnly(data.whatsappPhone || data.phone) || digitsOnly(brandPhone);
  const whatsappHref = waDigits ? `https://wa.me/${waDigits}` : 'https://wa.me/';

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

  // Template-specific styling configurations (remaining themes)
  const config = {
    hair: {
      navBg: 'bg-white text-gray-900 border-gray-100',
      heroBg: 'bg-gray-900 text-white',
      accentColor: '#ac0053',
      headingFont: 'font-serif',
      cardBg: 'bg-white border-gray-100 text-gray-900',
      footerBg: 'bg-[#1a1c1c] text-white',
    },
  }[templateId];
  const brandColor = data.brandColor || config.accentColor;
  const isDark = data.websiteAppearance === 'dark';
  const brandButtonStyle = {
    backgroundColor: brandColor,
    color: getReadableTextColor(brandColor),
  };
  const accentStyle = { color: brandColor };
  const darkCard = isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : config.cardBg;

  // Dynamic team title
  const getTeamTitle = () => {
    const serviceNames = data.services.map(s => (s.name + ' ' + s.category).toLowerCase()).join(' ');
    const salonLower = data.salonName.toLowerCase();
    if (serviceNames.includes('barber') || serviceNames.includes('fade') || serviceNames.includes('beard') || salonLower.includes('barber')) {
      return 'Meet Our Barbers';
    }
    if (serviceNames.includes('facial') || serviceNames.includes('spa') || serviceNames.includes('massage') || serviceNames.includes('skin')) {
      return 'Our Experts';
    }
    return 'Meet Our Stylists';
  };

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
      <div className={`flex-1 overflow-y-auto custom-scrollbar pb-16 ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-white'}`}>
        
        {/* Navigation Header */}
        <div id="section-header" className={`px-6 py-4 flex items-center justify-between border-b sticky top-0 backdrop-blur-md z-30 transition-colors ${isDark ? 'bg-zinc-950/95 text-zinc-100 border-zinc-800' : config.navBg}`}>
          <div className="flex items-center gap-2">
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="Logo" className="h-7 w-auto object-contain max-w-[120px]" />
            ) : (
              <Sparkles className="w-5 h-5" style={{ color: brandColor }} />
            )}
            <span className="font-bold text-lg" style={getSalonNameStyle(data)}>{data.salonName || 'Your Salon'}</span>
          </div>
          {mode === 'desktop' && (
            <div className="flex gap-6 text-xs font-medium opacity-90">
              <span className="font-bold cursor-pointer">Home</span>
              <span className="cursor-pointer">Services</span>
              {data.team && data.team.length > 0 && <span className="cursor-pointer">Team</span>}
              {data.gallery && data.gallery.length > 0 && <span className="cursor-pointer">Gallery</span>}
              <span className="cursor-pointer">Contact</span>
            </div>
          )}
        </div>

        {/* Hero Section */}
        <div id="section-hero" className={`px-6 py-16 text-center relative overflow-hidden min-h-[300px] flex items-center justify-center ${config.heroBg}`}>
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
                Premier Hair & Beauty
              </span>
              <h1 className={`text-2xl md:text-4xl font-bold mb-3 ${config.headingFont}`}>
                {data.tagline || 'Elevating your natural beauty and style'}
              </h1>
              <p className="text-xs md:text-sm text-gray-200 mb-6 max-w-md mx-auto leading-relaxed opacity-90">
                {data.about || 'Experience world-class care, top-tier styling, and ultimate relaxation in our studio.'}
              </p>
              <button
                type="button"
                onClick={() => openBooking({ kind: 'general' })}
                className={`px-6 py-3 rounded-xl font-bold text-xs shadow-lg transition-transform active:scale-95 hover:brightness-90`}
                style={brandButtonStyle}
              >
                Book Appointment Now
              </button>
            </>
          </div>
        </div>

        {/* Services Section */}
        <div id="section-services" className={`px-6 py-12 max-w-3xl mx-auto ${isDark ? 'text-zinc-100' : ''}`}>
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: brandColor }}>
              Our Offerings
            </span>
            <h2 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>
              Signature Services & Pricing
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Transparent pricing with secure advance booking options.
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
                    onClick={() => openBooking({ kind: 'service', item: { id: s.id, name: s.name, price: s.price, duration: s.duration } })}
                    className="font-bold text-xs transition-colors hover:brightness-90 px-4 py-1.5 rounded-lg"
                    style={brandButtonStyle}
                  >
                    Book Slot
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Packages Section (Value Packages & Bundles) */}
          {data.packages && data.packages.length > 0 && (
            <div className="mt-12 pt-10 border-t border-gray-200/40">
              <div className="text-center mb-8">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={accentStyle}>Special Combos</span>
                <h3 className={`text-xl font-bold mt-1 ${config.headingFont}`}>Value Packages & Bundles</h3>
                <p className="text-xs text-gray-500 mt-1">Bundled treatments designed to save you time and money.</p>
              </div>

              <div className="grid gap-4 grid-cols-1">
                {data.packages.map(p => (
                  <div key={p.id} className={`p-5 rounded-2xl border border-dashed hover:border-solid transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${darkCard}`}>
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm">{p.name}</h4>
                        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Best Value</span>
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
                        onClick={() => openBooking({ kind: 'bundle', item: { id: p.id, name: p.name, price: p.price, duration: p.duration } })}
                        className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-colors hover:brightness-90`}
                        style={brandButtonStyle}
                      >
                        Book Bundle
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
                <span className="text-[10px] font-bold uppercase tracking-wider" style={accentStyle}>{data.ownerRole || "Founder & Master Stylist"}</span>
                <h3 className={`text-xl font-bold mt-0.5 ${isDark ? 'text-white' : 'text-gray-900'}`}>{data.ownerName}</h3>
                <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-zinc-300' : 'text-gray-600'}`}>
                  "{data.reviewedContent?.ownerIntro || "We believe in personalized artistry and exceptional client care to ensure you leave feeling confident and rejuvenated."}"
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Team Section (Conditional: Hide if no team members) */}
        {data.team && data.team.length > 0 && (
          <div id="section-team" className={`px-6 py-12 max-w-3xl mx-auto ${isDark ? 'text-zinc-100' : ''}`}>
            <div className="text-center mb-8">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={accentStyle}>Talented Professionals</span>
              <h3 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>{getTeamTitle()}</h3>
              <p className="text-xs text-gray-500 mt-1">Book your preferred expert for a tailored experience.</p>
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
                      onClick={() => openBooking({ kind: 'stylist', stylist: { id: member.id, name: pub.name, role: pub.role } })}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-colors mt-auto hover:brightness-90`}
                      style={brandButtonStyle}
                    >
                      Book with {pub.name.split(' ')[0]}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Gallery Section (Conditional: Hide if empty) */}
        {data.gallery && data.gallery.length > 0 && (
          <div id="section-gallery" className={`px-6 py-12 border-t ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-gray-50 border-gray-100'}`}>
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-8">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={accentStyle}>Visual Showcase</span>
                <h3 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>Our Space & Work Gallery</h3>
                <p className="text-xs text-gray-500 mt-1">Explore our salon ambience and client transformations.</p>
              </div>
              <div className={`grid gap-3 ${mode === 'desktop' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {data.gallery.map(item => (
                  <div key={item.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 shadow-2xs group">
                    <img src={item.url} alt={item.alt || 'Gallery photo'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-end">
                      <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-md w-fit">
                        {item.category || 'General'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Social Videos Section (Conditional: Hide if no social videos) */}
        {data.socialVideos && data.socialVideos.length > 0 && (
          <div id="section-social" className={`px-6 py-12 max-w-3xl mx-auto ${isDark ? 'text-zinc-100' : ''}`}>
            <div className="text-center mb-8">
              <span className="text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1" style={accentStyle}>
                <Video className="w-3 h-3" /> Social Feed
              </span>
              <h3 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>Reels & Styling Videos</h3>
            </div>
            <div className={`grid gap-4 ${mode === 'desktop' ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {data.socialVideos.map(video => (
                <div key={video.id} className="relative aspect-[9/16] rounded-xl overflow-hidden group border border-gray-200 shadow-xs bg-gray-900">
                  <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <p className="text-xs font-bold line-clamp-2">{video.title}</p>
                    {video.likesCount && (
                      <span className="flex items-center gap-1 text-[10px] text-pink-400 font-semibold mt-1">
                        <Heart className="w-3 h-3 fill-pink-400" /> {video.likesCount}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Location & Opening Hours Section */}
        <div id="section-location" className={`px-6 py-12 border-t ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-gray-50 border-gray-100'}`}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={accentStyle}>Visit Us</span>
              <h3 className={`text-2xl font-bold mt-1 ${config.headingFont}`}>Location & Hours</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className={`p-6 rounded-2xl border shadow-xs space-y-4 ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200/80'}`}>
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4" style={accentStyle} /> Studio Address
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-gray-600'}`}>
                  {data.address?.fullAddress || 'Shop 14, Linking Road, Bandra West, Mumbai, Maharashtra 400050'}
                </p>
                <a
                  href={salonMapsHref(data)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Navigation className="w-3.5 h-3.5" /> Get Directions
                </a>
              </div>

              <div className={`p-6 rounded-2xl border shadow-xs space-y-3 ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200/80'}`}>
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" style={accentStyle} /> Opening Hours
                </h4>
                <div className={`space-y-2 text-xs ${isDark ? 'text-zinc-300' : 'text-gray-600'}`}>
                  {data.openingHours ? (
                    Object.entries(data.openingHours).map(([day, sch]) => (
                      <div key={day} className={`flex justify-between border-b pb-1.5 capitalize ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                        <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{day}</span>
                        {sch.open ? <span>{sch.startTime} – {sch.endTime}</span> : <span className="text-red-500 font-bold">Closed</span>}
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between"><span>Mon - Sat</span><span>10:00 AM - 8:00 PM</span></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact & Booking Options Section */}
        <div id="section-contact" className={`px-6 py-12 max-w-xl mx-auto text-center ${isDark ? 'text-zinc-100' : ''}`}>
          <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ backgroundColor: withHexAlpha(brandColor, '1a') }}>
            <CalendarCheck className="w-6 h-6" style={accentStyle} />
          </div>
          <h3 className={`text-2xl font-bold mb-6 ${config.headingFont}`}>Ready to Transform Your Look?</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <a
              href={telHref}
              className="py-3 bg-white border border-gray-200 hover:border-gray-400 text-gray-900 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" style={accentStyle} /> Call Now
            </a>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="py-3 bg-[#25D366] text-white font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
            <button
              type="button"
              onClick={() => openBooking({ kind: 'general' })}
              className={`py-3 text-white font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2 hover:brightness-90`}
              style={brandButtonStyle}
            >
              <CalendarCheck className="w-4 h-4" /> Book Online
            </button>
          </div>

          <div className={`p-4 rounded-xl border text-left text-xs space-y-2 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
            <div className={`flex items-center justify-between font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <span className="flex items-center gap-1.5"><CreditCard className="w-4 h-4" style={accentStyle} /> Online Booking Deposit</span>
              <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ color: brandColor, backgroundColor: withHexAlpha(brandColor, '1a') }}>25% Advance</span>
            </div>
            <p className={isDark ? 'text-zinc-400' : 'text-gray-500'}>Secure your appointment instantly with a 25% advance deposit. Remaining payable at salon.</p>
          </div>
        </div>

        {/* Footer */}
        <footer id="section-footer" className={`px-6 py-8 text-center text-xs border-t border-gray-800 ${config.footerBg}`}>
          <p className="font-bold text-sm mb-1" style={getSalonNameStyle(data)}>{data.salonName || 'Your Salon'}</p>
          <p className="opacity-70 mb-4">{data.tagline || 'Excellence in Hair & Beauty'}</p>
          <p className="opacity-50 text-[10px]">© 2026 {data.salonName || 'Salon'}. {DEFAULT_BRAND_CONFIG.platform.poweredByText}.</p>
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
