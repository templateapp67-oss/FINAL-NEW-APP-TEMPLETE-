import { Monitor, Smartphone, Phone, Sparkles, Instagram, Youtube, Facebook, Video, Heart, ExternalLink, MapPin, Clock, Navigation, MessageCircle, CalendarCheck, CreditCard } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { SalonData, getPublicStaffData } from '../types';
import { getSalonNameStyle } from '../lib/brandIdentity';
import { normalizeThemeId, BARBER_THEME, HAIR_STUDIO_THEME, BEAUTY_SPA_THEME } from '../lib/themeServices';
import CustomerBookingPreview from './CustomerBookingPreview';
import OwnerAvatar from './OwnerAvatar';
import { ServicePrice } from './PromotionalPricing';
import FamilyFullServiceTemplateRenderer from './FamilyFullServiceTemplateRenderer';
import NailLashStudioTemplateRenderer from './NailLashStudioTemplateRenderer';

export default function PreviewPane({ data, step, activeStaffId }: { data: SalonData, step: number, activeStaffId?: string }) {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const teamSectionRef = useRef<HTMLDivElement>(null);
  const gallerySectionRef = useRef<HTMLDivElement>(null);
  const socialSectionRef = useRef<HTMLDivElement>(null);
  const locationSectionRef = useRef<HTMLDivElement>(null);
  const contactSectionRef = useRef<HTMLDivElement>(null);

  const [showBookingWidget, setShowBookingWidget] = useState(step === 8);
  /**
   * PAYMENT INTEGRATION SWITCH — testing phase.
   * Keep `advancePaymentSuccessful = true` so Call Now / WhatsApp / Book Online
   * stay ACTIVE while testing. When the real payment integration goes live,
   * flip this to `false` and the buttons will require a successful 25% advance
   * deposit before unlocking (see the `!advancePaymentSuccessful` branches below).
   * No real gateway is wired yet — the booking flow remains the existing mock.
   */
  const [advancePaymentSuccessful, setAdvancePaymentSuccessful] = useState(true);
  const [lockedActionMessage, setLockedActionMessage] = useState<string | null>(null);
  const lastStepRef = useRef(step);

  useEffect(() => {
    if (lastStepRef.current !== step) {
      if (step === 8) {
        setShowBookingWidget(true);
      } else {
        setShowBookingWidget(false);
      }
      lastStepRef.current = step;
    }
  }, [step]);

  const templateId = normalizeThemeId(data.templateId);
  const isBarber = templateId === 'barber_mens_grooming';
  const isHairStudio = templateId === 'hair_studio_color_bar';
  const isBeautySpa = templateId === 'beauty_skin_spa';
  const isFamilyFullService = templateId === 'family_full_service';
  const isNailLashStudio = templateId === 'nail_lash_studio';

  // Template styles configuration
  const templateConfig = {
    barber_mens_grooming: {
      navBg: 'bg-[#0c0c0c] text-neutral-200 border-neutral-800',
      heroBg: 'bg-[#141414] text-white',
      primaryBtn: 'bg-[#c9a227] hover:brightness-110 text-[#141414] font-black',
      accentColor: BARBER_THEME.gold,
      accentText: 'text-[#c9a227]',
      badgeBg: 'bg-[#3a3016] text-[#e8c95c] border-[#c9a227]/40',
      fontFamily: 'font-sans',
      cardBg: 'bg-[#1a1a1a] border-neutral-800 text-neutral-100',
      subText: 'text-neutral-400',
      headingFont: 'font-sans font-black uppercase tracking-wider',
    },
    hair: {
      navBg: 'bg-white text-gray-900 border-gray-100',
      heroBg: 'bg-gray-900 text-white',
      primaryBtn: 'bg-[#ac0053] hover:bg-[#ba005b] text-white',
      accentColor: '#ac0053',
      accentText: 'text-[#ac0053]',
      badgeBg: 'bg-[#ffd9e1]/50 text-[#ac0053]',
      fontFamily: 'font-sans',
      cardBg: 'bg-white border-gray-100 text-gray-900',
      subText: 'text-gray-500',
      headingFont: 'font-serif',
    },
    hair_studio_color_bar: {
      navBg: 'bg-white text-neutral-900 border-neutral-200',
      heroBg: 'bg-[#f1ede7] text-neutral-900',
      primaryBtn: 'bg-[#b76e79] hover:brightness-110 text-white',
      accentColor: HAIR_STUDIO_THEME.rose,
      accentText: 'text-[#9d5a63]',
      badgeBg: 'bg-[#f4e5e7] text-[#9d5a63]',
      fontFamily: 'font-serif',
      cardBg: 'bg-white border-neutral-200 text-neutral-900',
      subText: 'text-neutral-500',
      headingFont: 'font-serif',
    },
    beauty_skin_spa: {
      navBg: 'bg-white text-neutral-800 border-[#ece6dc]',
      heroBg: 'bg-[#f7f1e8] text-neutral-800',
      primaryBtn: 'bg-[#1e7a63] hover:brightness-105 text-white',
      accentColor: BEAUTY_SPA_THEME.emerald,
      accentText: 'text-[#15594a]',
      badgeBg: 'bg-[#e2f0ea] text-[#15594a]',
      fontFamily: 'font-serif',
      cardBg: 'bg-white border-[#ece6dc] text-neutral-800',
      subText: 'text-[#72837c]',
      headingFont: 'font-serif',
    },
    'family_full_service': {
      navBg: 'bg-white text-[#15324b] border-[#dcebf4]',
      heroBg: 'bg-[#eaf6ff] text-[#12385b]',
      primaryBtn: 'bg-[#079f9a] hover:bg-[#087a78] text-white',
      accentColor: '#1769d2',
      accentText: 'text-[#1769d2]',
      badgeBg: 'bg-[#d9f5f1] text-[#087a78]',
      fontFamily: 'font-sans',
      cardBg: 'bg-white border-[#dcebf4] text-[#15324b]',
      subText: 'text-[#5d7387]',
      headingFont: 'font-sans font-extrabold',
    },
    'nail_lash_studio': {
      navBg: 'bg-[#fffaf7] text-[#211b24] border-[#eadbd5]',
      heroBg: 'bg-[#211b24] text-white',
      primaryBtn: 'bg-[#ff2d8d] hover:bg-[#d70f68] text-white',
      accentColor: '#ff2d8d',
      accentText: 'text-[#d70f68]',
      badgeBg: 'bg-[#ffe5f1] text-[#d70f68]',
      fontFamily: 'font-sans',
      cardBg: 'bg-[#fffaf7] border-[#eadbd5] text-[#211b24]',
      subText: 'text-[#806c74]',
      headingFont: 'font-sans font-extrabold',
    }
  }[templateId];

  // Accent tokens for the step-aware preview. Existing themes keep their exact
  // current look (pink for Hair); Barber swaps to vintage gold, Hair Studio to
  // rose-gold and Beauty/Spa to emerald.
  const accentTextCls = isBarber ? 'text-[#c9a227]' : isHairStudio ? 'text-[#9d5a63]' : isBeautySpa ? 'text-[#15594a]' : 'text-[#ac0053]';
  const accentBgCls = isBarber ? 'bg-[#c9a227]' : isHairStudio ? 'bg-[#b76e79]' : isBeautySpa ? 'bg-[#1e7a63]' : 'bg-[#ac0053]';
  const accentBg10Cls = isBarber ? 'bg-[#c9a227]/10' : isHairStudio ? 'bg-[#b76e79]/10' : isBeautySpa ? 'bg-[#1e7a63]/10' : 'bg-[#ac0053]/10';
  const accentSoftBgCls = isBarber ? 'bg-[#c9a227]/15' : isHairStudio ? 'bg-[#f4e5e7]' : isBeautySpa ? 'bg-[#e2f0ea]' : 'bg-[#ffd9e1]';
  const accentSoftBg10Cls = isBarber ? 'bg-[#c9a227]/10' : isHairStudio ? 'bg-[#f4e5e7]/60' : isBeautySpa ? 'bg-[#e2f0ea]/60' : 'bg-[#ffd9e1]/10';
  const accentSoftBg30Cls = isBarber ? 'bg-[#c9a227]/15' : isHairStudio ? 'bg-[#f4e5e7]' : isBeautySpa ? 'bg-[#e2f0ea]' : 'bg-[#ffd9e1]/30';
  const accentSoftText800Cls = isBarber ? 'text-[#e8c95c]' : isHairStudio ? 'text-[#9d5a63]' : isBeautySpa ? 'text-[#15594a]' : 'text-[#80003c]';
  const accentBadgeCls = isBarber ? 'bg-[#3a3016] text-[#e8c95c]' : isHairStudio ? 'bg-[#f4e5e7] text-[#9d5a63]' : isBeautySpa ? 'bg-[#e2f0ea] text-[#15594a]' : 'bg-[#ffd9e1] text-[#ac0053]';
  const accentBorderCls = isBarber ? 'border-[#c9a227]' : isHairStudio ? 'border-[#b76e79]' : isBeautySpa ? 'border-[#1e7a63]' : 'border-[#ac0053]';
  const accentBorder20Cls = isBarber ? 'border-[#c9a227]/20' : isHairStudio ? 'border-[#b76e79]/30' : isBeautySpa ? 'border-[#1e7a63]/30' : 'border-[#ac0053]/20';
  const accentRingCls = isBarber ? 'ring-[#c9a227]/30' : isHairStudio ? 'ring-[#b76e79]/30' : isBeautySpa ? 'ring-[#1e7a63]/30' : 'ring-[#ac0053]/30';
  const accentRing40Cls = isBarber ? 'ring-[#c9a227]/40' : isHairStudio ? 'ring-[#b76e79]/40' : isBeautySpa ? 'ring-[#1e7a63]/40' : 'ring-[#ac0053]/40';
  const accentBorderHoverCls = isBarber ? 'hover:border-[#c9a227]' : isHairStudio ? 'hover:border-[#b76e79]' : isBeautySpa ? 'hover:border-[#1e7a63]' : 'hover:border-[#ac0053]';
  const accentHoverTextCls = isBarber ? 'hover:text-[#c9a227]' : isHairStudio ? 'hover:text-[#b76e79]' : isBeautySpa ? 'hover:text-[#1e7a63]' : 'hover:text-[#ac0053]';
  const accentTopGradientCls = isBarber
    ? 'from-[#c9a227] to-[#e8c95c]'
    : isHairStudio
    ? 'from-[#b76e79] to-[#d8a0a8]'
    : isBeautySpa
    ? 'from-[#1e7a63] to-[#4aa88f]'
    : 'from-[#ac0053] to-[#ffb1c4]';

  // Auto-scroll/focus to the relevant section when step or data/activeStaffId changes (Section-Aware Live Preview)
  useEffect(() => {
    if (step === 4 && teamSectionRef.current) {
      setTimeout(() => {
        if (activeStaffId) {
          const el = document.getElementById(`preview-staff-${activeStaffId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
          }
        }
        teamSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else if (step === 5 && gallerySectionRef.current) {
      setTimeout(() => {
        gallerySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else if (step === 6 && socialSectionRef.current) {
      setTimeout(() => {
        socialSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else if (step === 7 && locationSectionRef.current) {
      setTimeout(() => {
        locationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else if (step === 8 && contactSectionRef.current) {
      setTimeout(() => {
        contactSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [step, activeStaffId, data.team, data.socialVideos, data.address, data.openingHours, data.contactOptions, data.bookingRules]);

  // Determine dynamic section title based on services/salon context
  const getTeamTitle = () => {
    const serviceNames = data.services.map(s => (s.name + ' ' + s.category).toLowerCase()).join(' ');
    const salonLower = data.salonName.toLowerCase();
    
    if (serviceNames.includes('barber') || serviceNames.includes('fade') || serviceNames.includes('beard') || salonLower.includes('barber')) {
      return 'Meet Our Barbers';
    }
    if (serviceNames.includes('hair') || serviceNames.includes('color') || serviceNames.includes('stylist') || salonLower.includes('hair') || salonLower.includes('salon')) {
      return 'Meet Our Stylists';
    }
    if (serviceNames.includes('facial') || serviceNames.includes('spa') || serviceNames.includes('massage') || serviceNames.includes('skin')) {
      return 'Our Experts';
    }
    return 'Meet Our Experts & Stylists';
  };

  if (isFamilyFullService) {
    return (
      <div className="w-full h-full bg-[#f3f3f4] flex items-start justify-center overflow-hidden p-2 md:p-4">
        <FamilyFullServiceTemplateRenderer data={data} mode={mode} />
      </div>
    );
  }
  if (isNailLashStudio) {
    return (
      <div className="w-full h-full bg-[#f3f3f4] flex items-start justify-center overflow-hidden p-2 md:p-4">
        <NailLashStudioTemplateRenderer data={data} mode={mode} />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#f3f3f4] flex flex-col border-l border-gray-200 relative">
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${accentTopGradientCls} z-20`}></div>
      
      {showBookingWidget ? (
        <CustomerBookingPreview 
          data={data} 
          onBackToWebsite={() => setShowBookingWidget(false)}
          onAdvancePaymentSuccess={() => setAdvancePaymentSuccessful(true)}
        />
      ) : (
        <>
          <div className="flex items-center justify-between p-4 md:p-6 shrink-0 z-10">
            <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Live Website Preview</span>
          {step === 4 && (
            <span className={`${accentBadgeCls} text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1`}>
              <Sparkles className="w-2.5 h-2.5" /> Team Section
            </span>
          )}
          {step === 5 && (
            <span className={`${accentBadgeCls} text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1`}>
              <Sparkles className="w-2.5 h-2.5" /> Photos & Gallery
            </span>
          )}
          {step === 6 && (
            <span className={`${accentBadgeCls} text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1`}>
              <Sparkles className="w-2.5 h-2.5" /> Social Connectivity
            </span>
          )}
        </div>
        <div className="flex bg-gray-200/50 p-1 rounded-lg">
          <button 
            onClick={() => setMode('desktop')}
            className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm font-medium transition-colors ${mode === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <Monitor className="w-4 h-4" /> Desktop
          </button>
          <button 
            onClick={() => setMode('mobile')}
            className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm font-medium transition-colors ${mode === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <Smartphone className="w-4 h-4" /> Mobile
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4 md:p-6 pt-0 flex justify-center items-start">
        <div className={`
          bg-white shadow-xl border border-gray-200 flex flex-col overflow-hidden transition-all duration-500 origin-top mx-auto h-full
          ${mode === 'desktop' ? 'w-full max-w-[900px] rounded-xl' : 'w-[375px] max-h-[812px] rounded-[2rem] border-[8px] border-gray-100'}
        `}>
          {/* Browser/Phone Header */}
          {mode === 'desktop' ? (
            <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center px-4 gap-2 shrink-0">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
              </div>
              <div className="mx-auto bg-white px-4 py-1 rounded text-[10px] text-gray-500 border border-gray-200 font-mono tracking-wide">
                {data.salonName.toLowerCase().replace(/\s+/g, '') || 'yoursalon'}.nexora.site
              </div>
            </div>
          ) : (
            <div className="h-6 w-full flex justify-center items-start bg-white shrink-0">
              <div className="w-24 h-4 bg-gray-100 rounded-b-xl"></div>
            </div>
          )}

          {/* Preview Content Area */}
          <div className="flex-1 overflow-y-auto bg-white custom-scrollbar pb-16">
            {/* Nav */}
            <div className={`px-6 py-4 flex items-center justify-between border-b sticky top-0 backdrop-blur-md z-30 transition-colors ${templateConfig.navBg}`}>
              <div className="flex items-center gap-2">
                {data.logoUrl ? (
                  <img src={data.logoUrl} alt="Logo" className="h-7 w-auto object-contain max-w-[120px]" />
                ) : (
                  <Sparkles className="w-5 h-5" style={{ color: templateConfig.accentColor }} />
                )}
                <span className="font-bold text-lg" style={getSalonNameStyle(data)}>{data.salonName || 'Your Salon'}</span>
              </div>
              {mode === 'desktop' && (
                <div className={`flex gap-6 text-xs font-medium opacity-90`}>
                  <span className="font-bold">Home</span>
                  <span>Services</span>
                  <span className={step === 4 ? 'underline decoration-2 underline-offset-4 font-bold' : ''}>Team</span>
                  <span className={step === 5 ? 'underline decoration-2 underline-offset-4 font-bold' : ''}>Gallery</span>
                </div>
              )}
            </div>

            {/* Hero */}
            <div className={`px-6 py-12 text-center relative overflow-hidden min-h-[260px] flex items-center justify-center ${templateConfig.heroBg}`}>
              {data.heroImageUrl && (
                <img
                  src={data.heroImageUrl}
                  alt="Hero Banner"
                  className={`absolute inset-0 w-full h-full object-cover opacity-40 ${
                    data.heroPosition === 'Top' ? 'object-top' : data.heroPosition === 'Bottom' ? 'object-bottom' : 'object-center'
                  }`}
                />
              )}
              <div className={`relative z-10 max-w-xl mx-auto ${isHairStudio || isBeautySpa ? 'text-neutral-900' : 'text-white'}`}>
                <h1 className={`text-2xl md:text-3xl font-bold mb-2 ${templateConfig.headingFont}`}>{data.tagline || 'Elevating your natural beauty'}</h1>
                <p className={`text-xs mb-6 max-w-md mx-auto leading-relaxed ${isHairStudio || isBeautySpa ? 'text-neutral-500' : 'text-gray-200'}`}>{data.about || 'A brief description of your services and ambiance.'}</p>
                <button 
                  onClick={() => setShowBookingWidget(true)}
                  className={`px-6 py-2.5 rounded-lg font-bold text-xs shadow-md transition-all ${templateConfig.primaryBtn}`}
                >
                  Book Appointment
                </button>
              </div>
            </div>

            {/* Content based on step */}
            {(step >= 2 || data.ownerName) && (
               <div className="px-6 py-12 flex flex-col items-center text-center max-w-xl mx-auto">
                 <div className="w-32 h-32 bg-gray-100 rounded-full mb-6 overflow-hidden border-4 border-white shadow-xl">
                    <OwnerAvatar photoUrl={data.ownerPhotoUrl} name={data.ownerName} className="w-full h-full text-3xl" alt="Founder" />
                 </div>
                 <h2 className={`text-xs font-bold uppercase tracking-widest ${accentTextCls} mb-2`}>Meet the Founder</h2>
                 <h3 className="text-2xl font-serif font-bold text-gray-900 mb-1">{data.ownerName || 'Owner Name'}</h3>
                 <p className="text-xs font-semibold text-gray-500 tracking-wide">{data.ownerRole || 'Role'}</p>
               </div>
            )}

            {(step >= 3 || (data.services && data.services.length > 0)) && (
              <div className="px-6 py-12 max-w-2xl mx-auto border-b border-gray-100">
                <h3 className="text-2xl font-bold text-center mb-8 font-serif">Our Services</h3>
                <div className={`grid gap-4 ${mode === 'desktop' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {data.services.map(s => (
                    <div key={s.id} className="p-5 rounded-xl border border-gray-100 shadow-2xs bg-white hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-gray-900 text-sm">{s.name}</h4>
                        <ServicePrice service={s} offers={data.offers} className={`font-bold ${accentTextCls} text-sm`} compact />
                      </div>
                      <p className="text-xs text-gray-500 mb-4">{s.description}</p>
                      <button 
                        onClick={() => setShowBookingWidget(true)}
                        className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-lg font-semibold text-xs transition-colors border border-gray-200"
                      >
                        Book • {s.duration} min
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Step 4: Focus on Team Section */}
            {(step >= 4 || (data.team && data.team.length > 0)) && (
              <div id="team-preview-section" ref={teamSectionRef} className={`px-6 py-12 bg-gray-50/80 scroll-mt-12 border-t-2 ${accentBorder20Cls}`}>
                <div className="max-w-3xl mx-auto">
                  <div className="text-center mb-10">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${accentTextCls}`}>Expert Professionals</span>
                    <h3 className="text-2xl md:text-3xl font-bold font-serif text-gray-900 mt-1">{getTeamTitle()}</h3>
                    <p className="text-xs text-gray-500 mt-1">Book your tailored experience with our talented specialists.</p>
                  </div>

                  <div className={`grid gap-6 ${mode === 'desktop' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {data.team.map(member => {
                      const pub = getPublicStaffData(member);
                      const isActive = activeStaffId === pub.id;
                      return (
                        <div 
                          key={pub.id} 
                          id={`preview-staff-${pub.id}`}
                          className={`bg-white rounded-xl border p-5 transition-all ${
                            isActive 
                              ? `${accentBorderCls} ring-2 ${accentRingCls} shadow-md ${accentSoftBg10Cls}` 
                              : 'border-gray-200/80 shadow-xs hover:shadow-md'
                          } flex flex-col gap-4`}
                        >
                          <div className="flex items-start gap-4">
                            <img 
                              src={pub.imageUrl} 
                              alt={pub.name} 
                              className={`w-16 h-16 rounded-full object-cover border-2 ${accentSoftBgCls} shrink-0 shadow-xs`} 
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-gray-900 text-base leading-tight">{pub.name}</h4>
                              <p className={`text-xs font-bold ${accentTextCls} uppercase tracking-wider mt-0.5`}>{pub.role}</p>
                              
                              {pub.phone && (
                                <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-1">
                                  <Phone className="w-3 h-3 text-gray-400" /> {pub.phone}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Specialties / Skills Bullets / Chips */}
                          {pub.specialties && pub.specialties.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {pub.specialties.map((spec, i) => (
                                <span key={i} className={`${accentSoftBg30Cls} ${accentSoftText800Cls} border ${accentSoftBgCls} text-[11px] font-semibold px-2 py-0.5 rounded-full`}>
                                  {spec}
                                </span>
                              ))}
                            </div>
                          )}

                          {pub.bio && (
                            <p className="text-xs text-gray-600 leading-relaxed font-sans line-clamp-3 bg-gray-50 p-2.5 rounded-lg border border-gray-100 italic">
                              "{pub.bio}"
                            </p>
                          )}

                          <button 
                            onClick={() => setShowBookingWidget(true)}
                            className="w-full py-2 bg-[#1a1c1c] hover:bg-black text-white text-xs font-semibold rounded-lg transition-colors mt-auto"
                          >
                            Book with {pub.name.split(' ')[0]}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            
            {/* Gallery Section */}
            <div ref={gallerySectionRef} className={`px-6 py-12 bg-white scroll-mt-12 border-t-2 ${accentBorder20Cls}`}>
              <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${accentTextCls}`}>Visual Gallery</span>
                  <h3 className="text-2xl font-serif font-bold text-gray-900 mt-1">Our Space & Work</h3>
                  <p className="text-xs text-gray-500 mt-1">Explore our salon interior, styling details, and client transformations.</p>
                </div>

                {data.gallery && data.gallery.length > 0 ? (
                  <div className={`grid gap-3 ${mode === 'desktop' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {data.gallery.map((item) => (
                      <div key={item.id} className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 shadow-2xs bg-gray-100">
                        <img
                          src={item.url}
                          alt={item.alt || 'Gallery photo'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-end">
                          <span className={`text-[10px] font-bold text-white ${accentBgCls} px-2 py-0.5 rounded-md inline-block w-fit`}>
                            {item.category || 'General'}
                          </span>
                          {item.alt && (
                            <p className="text-[10px] text-gray-200 line-clamp-1 mt-0.5">{item.alt}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-400 text-xs">
                    No gallery photos added yet. Upload images in Step 06.
                  </div>
                )}
              </div>
            </div>

            {/* Social Connectivity Section */}
            <div ref={socialSectionRef} className={`px-6 py-12 bg-gray-50 scroll-mt-12 border-t-2 ${accentBorder20Cls}`}>
              <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${accentTextCls} flex items-center justify-center gap-1`}>
                    <Video className="w-3 h-3" /> Social Feed & Work
                  </span>
                  <h3 className="text-2xl font-serif font-bold text-gray-900 mt-1">See Our Latest Looks</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                    Follow us on Instagram and YouTube for daily inspiration, reels, and behind-the-scenes transformations.
                  </p>
                </div>

                {/* Social Profiles Chips */}
                {data.socialProfiles && (data.socialProfiles.instagram || data.socialProfiles.facebook || data.socialProfiles.youtube || data.socialProfiles.tiktok) && (
                  <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                    {data.socialProfiles.instagram && (
                      <a href={data.socialProfiles.instagram} target="_blank" rel="noreferrer" className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-800 ${accentBorderHoverCls} ${accentHoverTextCls} shadow-2xs transition-colors`}>
                        <Instagram className="w-3.5 h-3.5 text-pink-600" /> Instagram
                      </a>
                    )}
                    {data.socialProfiles.facebook && (
                      <a href={data.socialProfiles.facebook} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-800 hover:border-blue-600 hover:text-blue-600 shadow-2xs transition-colors">
                        <Facebook className="w-3.5 h-3.5 text-blue-600" /> Facebook
                      </a>
                    )}
                    {data.socialProfiles.youtube && (
                      <a href={data.socialProfiles.youtube} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-800 hover:border-red-600 hover:text-red-600 shadow-2xs transition-colors">
                        <Youtube className="w-3.5 h-3.5 text-red-600" /> YouTube
                      </a>
                    )}
                    {data.socialProfiles.tiktok && (
                      <a href={data.socialProfiles.tiktok} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-800 hover:border-black shadow-2xs transition-colors">
                        <Video className="w-3.5 h-3.5 text-black" /> TikTok
                      </a>
                    )}
                  </div>
                )}

                {/* Social Videos Grid */}
                {data.socialVideos && data.socialVideos.length > 0 ? (
                  <div className={`grid gap-4 ${mode === 'desktop' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {data.socialVideos.map((video) => (
                      <div key={video.id} className="relative aspect-[9/16] rounded-xl overflow-hidden group border border-gray-200 shadow-xs bg-gray-900 cursor-pointer">
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90"></div>
                        
                        {/* Platform Icon Badge */}
                        <div className="absolute top-2.5 right-2.5 bg-black/50 backdrop-blur-xs rounded-full p-1.5 text-white">
                          {video.platform === 'youtube' ? (
                            <Youtube className="w-3.5 h-3.5 text-red-500" />
                          ) : video.platform === 'facebook' ? (
                            <Facebook className="w-3.5 h-3.5 text-blue-500" />
                          ) : (
                            <Instagram className="w-3.5 h-3.5 text-pink-500" />
                          )}
                        </div>

                        {/* Title & Stats Overlay */}
                        <div className="absolute bottom-3 left-3 right-3 text-white">
                          <p className="text-xs font-bold line-clamp-2 leading-snug">{video.title}</p>
                          <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-300">
                            {video.likesCount && (
                              <span className="flex items-center gap-1 font-semibold">
                                <Heart className="w-3 h-3 text-pink-500 fill-pink-500" /> {video.likesCount}
                              </span>
                            )}
                            {video.dateAdded && (
                              <span className="text-gray-400">{video.dateAdded}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-400 text-xs">
                    No social videos connected yet. Add Reels or Shorts in Step 07.
                  </div>
                )}

                {data.socialProfiles?.instagram && (
                  <div className="mt-8 text-center">
                    <a
                      href={data.socialProfiles.instagram}
                      target="_blank"
                      rel="noreferrer"
                      className={`${accentTextCls} text-xs font-bold hover:underline inline-flex items-center gap-1`}
                    >
                      View all on Instagram <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Location & Opening Hours Section ("Find Us") */}
            <div 
              ref={locationSectionRef}
              id="location-section" 
              className={`pt-12 mt-12 border-t border-gray-100 transition-all ${step === 7 ? `ring-2 ${accentRing40Cls} p-4 rounded-2xl ${accentSoftBg10Cls}` : ''}`}
            >
              <div className="text-center mb-8">
                <div className={`w-12 h-12 ${accentBg10Cls} ${accentTextCls} rounded-full mx-auto flex items-center justify-center mb-3`}>
                  <MapPin className="w-6 h-6" />
                </div>
                <span className={`text-xs font-bold ${accentTextCls} uppercase tracking-wider`}>Visit Us</span>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">Our Location & Opening Hours</h3>
              </div>

              <div className="grid md:grid-cols-2 gap-8 items-start">
                {/* Address Block */}
                <div className="space-y-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <MapPin className={`w-4 h-4 ${accentTextCls}`} /> Address
                  </h4>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {data.address?.fullAddress || 'Shop 14, Linking Road, Bandra West, Mumbai, Maharashtra 400050'}
                  </p>
                  
                  {/* Map visual card */}
                  <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 group">
                    <img
                      src="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?q=80&w=600&auto=format&fit=crop"
                      alt="Map location"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <div className={`w-8 h-8 ${accentBgCls} rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white`}>
                        <MapPin className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  <button className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs">
                    <Navigation className="w-3.5 h-3.5" /> Get Directions
                  </button>
                </div>

                {/* Hours Block */}
                <div className="space-y-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${accentTextCls}`} /> Opening Hours
                  </h4>
                  <div className="space-y-2 text-xs text-gray-600">
                    {data.openingHours ? (
                      Object.entries(data.openingHours).map(([day, schedule]) => (
                        <div key={day} className="flex justify-between items-center border-b border-gray-200/60 pb-2 capitalize">
                          <span className="font-medium text-gray-900">{day}</span>
                          {schedule.open ? (
                            <span className="font-semibold text-gray-700">{schedule.startTime} – {schedule.endTime}</span>
                          ) : (
                            <span className={`font-bold ${accentTextCls}`}>Closed</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="flex justify-between border-b border-gray-200/60 pb-2"><span className="font-medium text-gray-900">Monday – Saturday</span><span>10:00 AM – 08:00 PM</span></div>
                        <div className="flex justify-between border-b border-gray-200/60 pb-2"><span className="font-medium text-gray-900">Sunday</span><span className={`${accentTextCls} font-bold`}>Closed</span></div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Contact & Booking Section ("Contact & Book") */}
            <div 
              ref={contactSectionRef}
              id="contact-booking-section"
              className={`pt-12 mt-12 border-t border-gray-100 transition-all ${step === 8 ? `ring-2 ${accentRing40Cls} p-4 rounded-2xl ${accentSoftBg10Cls}` : ''}`}
            >
              <div className="text-center mb-8">
                <div className={`w-12 h-12 ${accentBg10Cls} ${accentTextCls} rounded-full mx-auto flex items-center justify-center mb-3`}>
                  <CalendarCheck className="w-6 h-6" />
                </div>
                <span className={`text-xs font-bold ${accentTextCls} uppercase tracking-wider`}>Contact & Book</span>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">Book Your Appointment</h3>
              </div>

              <div className="max-w-xl mx-auto space-y-6">
                {/* Contact Action Buttons: enabled only after the existing booking payment succeeds. */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(!data.contactOptions || data.contactOptions.callNow) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!advancePaymentSuccessful) {
                          setLockedActionMessage('Please pay 25% advance first.');
                          return;
                        }
                        window.location.href = `tel:${data.phone || ''}`;
                      }}
                      className={`w-full py-3 bg-white border border-gray-200 text-gray-900 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-all ${advancePaymentSuccessful ? accentBorderHoverCls : 'opacity-60'}`}
                    >
                      <Phone className={`w-4 h-4 ${accentTextCls}`} /> Call Now
                    </button>
                  )}
                  {(!data.contactOptions || data.contactOptions.whatsapp) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!advancePaymentSuccessful) {
                          setLockedActionMessage('Please pay 25% advance first.');
                          return;
                        }
                        const phone = (data.whatsappPhone || data.phone || '').replace(/\D/g, '');
                        window.open(phone ? `https://wa.me/${phone}` : 'https://wa.me/', '_blank', 'noopener,noreferrer');
                      }}
                      className={`w-full py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-all ${advancePaymentSuccessful ? '' : 'opacity-60'}`}
                    >
                      <MessageCircle className="w-4 h-4" /> WhatsApp
                    </button>
                  )}
                  {(!data.contactOptions || data.contactOptions.bookNow) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!advancePaymentSuccessful) {
                          setLockedActionMessage('Please pay 25% advance first.');
                          return;
                        }
                        setShowBookingWidget(true);
                      }}
                      className={`w-full py-3 ${accentBgCls} hover:brightness-110 text-white font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-all ${advancePaymentSuccessful ? '' : 'opacity-60'}`}
                    >
                      <CalendarCheck className="w-4 h-4" /> Book Online
                    </button>
                  )}
                </div>
                {!advancePaymentSuccessful && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p>{lockedActionMessage || 'Please pay 25% advance first.'}</p>
                    <button
                      type="button"
                      onClick={() => { setLockedActionMessage(null); setShowBookingWidget(true); }}
                      className={`mt-2 rounded-lg ${accentBgCls} px-3 py-1.5 font-bold text-white hover:brightness-110`}
                    >
                      Pay 25% Advance
                    </button>
                  </div>
                )}

                {/* 25% Deposit Banner Box in Preview */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-900 flex items-center gap-1.5">
                      <CreditCard className={`w-4 h-4 ${accentTextCls}`} /> Online Booking Deposit
                    </span>
                    <span className={`${accentSoftBgCls} ${accentTextCls} font-bold px-2 py-0.5 rounded-full text-[10px]`}>
                      25% Deposit
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Pay 25% in advance to lock your time slot. Remaining amount is payable at salon after service.
                  </p>

                  <div className="bg-gray-50 p-3 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Example (Signature Haircut):</span>
                      <span className="font-semibold text-gray-800">₹500</span>
                    </div>
                    <div className={`flex justify-between ${accentTextCls} font-bold`}>
                      <span>Advance (25%):</span>
                      <span>-₹125</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                      <span>Pay at Salon:</span>
                      <span className={accentTextCls}>₹375</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
