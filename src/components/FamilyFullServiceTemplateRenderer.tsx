import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SalonData, Service, ServiceOffer } from '../types';
import { getPublicStaffData } from '../types';
import { DEFAULT_BRAND_CONFIG } from '../config/brandConfig';
import SiteHeader, { useSiteLocale, useThemeAppearance } from './SiteHeader';
import OwnerAvatar from './OwnerAvatar';
import { BundlePrice, ServicePrice } from './PromotionalPricing';
import { FinalBookingCta, SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import SiteFooter from './SiteFooter';
import SiteFloatingActions from './SiteFloatingActions';
import SiteMobileActionBar from './SiteMobileActionBar';
import SiteBookingHost from './SiteBookingHost';
import SiteProtectedContactAction from './SiteProtectedContactAction';
import SiteContactLockNotice from './SiteContactLockNotice';
import { displayContactNumber, resolveSiteContactAccess } from '../lib/siteContactAccess';
import SiteSeo from './SiteSeo';
import { setActiveTheme, markPerformance } from '../lib/sitePerformance';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import FamilyHero from './heroes/FamilyHero';
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
import OwnerPreviewTemplateNotice from './OwnerPreviewTemplateNotice';
import { displayService } from '../lib/displayService';
import { galleryThemeMedia } from '../lib/siteGallery';
import { FAMILY_SURFACES, surfacesOf } from '../lib/themeSurfaces';
import { shouldShowOwnerPhoto } from '../lib/templateConfig';
import { setOwnerAppearanceDefault } from '../lib/siteNavigation';
import type { FamilySurface } from '../lib/themeSurfaces';
import { dayLabel, siteText } from '../lib/siteI18n';
import { structureText } from '../lib/siteStructureI18n';
import {
  headerModeOf,
  resolveSectionState,
  sectionProps,
  siteFrameClass,
  siteGrid,
} from '../lib/siteStructure';
import type { ViewportMode } from '../lib/siteStructure';
import {
  ArrowRight,
  Baby,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HeartHandshake,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Package as PackageIcon,
  Phone,
  Scissors,
  ShieldCheck,
  Smile,
  Sparkles,
  Star,
  UserRound,
  Users,
} from 'lucide-react';

/**
 * FULL-SERVICE FAMILY SALON — independent visual renderer (Theme ID:
 * family_full_service).
 *
 * Presentation renderer: it reads the owner's salon data and the family
 * catalogue, but does not create records or persist state. Empty menu areas
 * remain honest when the owner has not configured services yet.
 *
 * PHASE 10.2: surfaces come from FAMILY_SURFACES (light = the bright sky/
 * white design, dark = night-sky navy); all customer-facing copy flows from
 * the global siteText() table (family namespace) in English / हिन्दी.
 */
interface Props {
  data: SalonData;
  mode: ViewportMode;
}


type FocusItem = { label: string; icon: typeof Scissors };

function getServiceGroups(data: SalonData) {
  const services = data.services || [];
  const isMen = (service: Service) => /men|beard|groom|shave|barber|fade|executive/i.test(`${service.name} ${service.category}`);
  const isKids = (service: Service) => /kid|child|teen|junior/i.test(`${service.name} ${service.category}`);

  return {
    men: services.filter(isMen),
    kids: services.filter(isKids),
    women: services.filter((service) => !isMen(service) && !isKids(service)),
    combos: data.packages || [],
  };
}

function SectionIntro({
  eyebrow,
  title,
  body,
  align = 'left',
  light = false,
  t,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: 'left' | 'center';
  light?: boolean;
  t: FamilySurface;
}) {
  return (
    <div className={`${align === 'center' ? 'text-center mx-auto' : ''} max-w-xl`}>
      <span
        className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em]"
        style={{ color: light ? t.skyDeep : t.tealDeep }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: light ? t.sun : t.teal }} />
        {eyebrow}
      </span>
      <h2
        className="mt-3 text-2xl md:text-3xl font-extrabold leading-tight tracking-[-0.03em]"
        style={{ color: light ? '#ffffff' : t.heading }}
      >
        {title}
      </h2>
      {body && (
        <p className="mt-3 text-xs md:text-sm leading-relaxed" style={{ color: light ? 'rgba(255,255,255,0.72)' : t.muted }}>
          {body}
        </p>
      )}
    </div>
  );
}

function FocusStrip({ items, light = false, t }: { items: readonly FocusItem[]; light?: boolean; t: FamilySurface }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-7">
      {items.map(({ label, icon: Icon }) => (
        <div
          key={label}
          className="rounded-2xl border px-3 py-3 min-h-[82px] flex flex-col justify-between"
          style={{
            borderColor: light ? 'rgba(255,255,255,0.18)' : t.line,
            backgroundColor: light ? 'rgba(255,255,255,0.08)' : t.card,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: light ? t.sun : t.blue }} />
          <span className="text-[10px] font-bold leading-tight" style={{ color: light ? '#ffffff' : t.ink }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ServiceRow({ service, offers = [], dark = false, t, minsLabel }: { service: Service; offers?: ServiceOffer[]; dark?: boolean; key?: string; t: FamilySurface; minsLabel: string }) {
  // Live locale: re-renders when the header Language control switches EN/हिन्दी.
  const shown = displayService(service, useSiteLocale());
  return (
    <div
      className="flex items-center justify-between gap-4 py-4 border-b last:border-b-0 min-w-0"
      style={{ borderColor: dark ? 'rgba(255,255,255,0.14)' : t.line }}
    >
      {shown.iconUrl && <img src={shown.iconUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />}
      <div className="min-w-0">
        <h4 className="text-xs md:text-sm font-extrabold break-words" style={{ color: dark ? '#ffffff' : t.ink }}>
          {shown.name}
        </h4>
        <p className="mt-1 text-[10px] leading-relaxed line-clamp-2 break-words" style={{ color: dark ? 'rgba(255,255,255,0.62)' : t.muted }}>
          {shown.description}
        </p>
      </div>
      <div className="text-right shrink-0">
        <ServicePrice service={service} offers={offers} style={{ color: dark ? t.sun : t.blue }} compact dark={dark} />
        <p className="mt-1 text-[9px] font-semibold" style={{ color: dark ? 'rgba(255,255,255,0.52)' : t.muted }}>
          {service.duration} {minsLabel}
        </p>
      </div>
    </div>
  );
}

function EmptyMenu({
  title,
  body,
  focuses,
  dark = false,
  t,
}: {
  title: string;
  body: string;
  focuses: readonly FocusItem[];
  dark?: boolean;
  t: FamilySurface;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        borderColor: dark ? 'rgba(255,255,255,0.14)' : t.line,
        backgroundColor: dark ? 'rgba(255,255,255,0.06)' : t.card,
      }}
    >
      <p className="text-xs font-extrabold" style={{ color: dark ? '#ffffff' : t.ink }}>
        {title}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed" style={{ color: dark ? 'rgba(255,255,255,0.58)' : t.muted }}>
        {body}
      </p>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {focuses.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl px-2 py-3 text-center border"
            style={{ borderColor: dark ? 'rgba(255,255,255,0.14)' : t.line }}
          >
            <Icon className="w-4 h-4 mx-auto" style={{ color: dark ? t.sun : t.teal }} />
            <span className="block text-[9px] font-bold leading-tight mt-2" style={{ color: dark ? '#ffffff' : t.ink }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamCard({ member, t }: { member: ReturnType<typeof getPublicStaffData>; key?: string; t: FamilySurface }) {
  return (
    <div className="rounded-[1.5rem] border overflow-hidden" style={{ backgroundColor: t.card, borderColor: t.line }}>
      <div className="relative h-36" style={{ backgroundColor: t.skyDeep }}>
        {member.imageUrl ? (
          <img src={member.imageUrl} alt={member.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: t.blue }}>
            <UserRound className="w-12 h-12" />
          </div>
        )}
        {member.rating && (
          <span className="absolute right-3 top-3 rounded-full px-2 py-1 text-[9px] font-extrabold flex items-center gap-1" style={{ color: t.ink, backgroundColor: t.card }}>
            <Star className="w-3 h-3" style={{ color: '#f2b243', fill: '#f2b243' }} /> {member.rating.toFixed(1)}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-extrabold text-sm" style={{ color: t.ink }}>{member.name}</h3>
        <p className="text-[10px] font-bold mt-1" style={{ color: t.tealDeep }}>{member.role}</p>
        {member.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {member.specialties.slice(0, 2).map((specialty) => (
              <span key={specialty} className="rounded-full px-2 py-1 text-[9px] font-bold" style={{ backgroundColor: t.sky, color: t.blue }}>
                {specialty}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactButton({ href, icon: Icon, children, primary = false, t }: { href: string; icon: typeof Phone; children: ReactNode; primary?: boolean; t: FamilySurface }) {
  return (
    <a
      href={href}
      className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.13em] transition-all hover:-translate-y-0.5"
      style={primary ? { backgroundColor: t.sun, color: '#12385b' } : { backgroundColor: t.card, color: t.ink }}
    >
      <Icon className="w-4 h-4" />
      {children}
    </a>
  );
}

export default function FamilyFullServiceTemplateRenderer({ data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  // Live locale + appearance: re-render when the header controls switch.
  const locale = useSiteLocale();
  setOwnerAppearanceDefault(data.websiteAppearance);
  const appearance = useThemeAppearance('family_full_service');
  const t = surfacesOf(FAMILY_SURFACES, appearance);
  const { navy, blue, sky, skyDeep, teal, tealDeep, tealSoft, sun, sunSoft, coral, ink, muted, line, white } = t;
  const S = { ...siteText('family_full_service', locale), ...structureText('family_full_service', locale) };
  const X = structureCopyFrom(S);
  const palette = { accent: teal, text: ink, muted, card: t.card, line, invert: '#ffffff' };
  const headerMode = headerModeOf(mode);
  // PHASE 10.12 — performance optimization: clear stale data, marks, memoize
  useEffect(() => {
    setActiveTheme('family_full_service');
    markPerformance('family_full_service-render-start');
    return () => { markPerformance('family_full_service-render-end'); };
  }, []);

  const MENU_FOCUSES: { men: FocusItem[]; women: FocusItem[]; kids: FocusItem[]; combos: FocusItem[] } = {
    men: [
      { label: S.focusMen1, icon: Scissors },
      { label: S.focusMen2, icon: UserRound },
      { label: S.focusMen3, icon: Sparkles },
    ],
    women: [
      { label: S.focusWomen1, icon: Scissors },
      { label: S.focusWomen2, icon: Sparkles },
      { label: S.focusWomen3, icon: HeartHandshake },
    ],
    kids: [
      { label: S.focusKids1, icon: Scissors },
      { label: S.focusKids2, icon: Smile },
      { label: S.focusKids3, icon: HeartHandshake },
    ],
    combos: [
      { label: S.focusCombos1, icon: Users },
      { label: S.focusCombos2, icon: HeartHandshake },
      { label: S.focusCombos3, icon: Sparkles },
    ],
  };

  const groups = getServiceGroups(data);
  const publicTeam = (data.team || []).map(getPublicStaffData);
  const offersState = resolveSectionState('offers', (data.packages || []));
  const teamState = resolveSectionState('team', publicTeam);
  const ownerState = resolveSectionState('owner', data.ownerName ? [data.ownerName] : []);
  const aboutState = resolveSectionState('about', data.about ? [data.about] : (!ownerPreview ? ['fallback'] : []));
  const hasAddress = hasSalonAddress(data, ownerPreview);
  const locationState = resolveSectionState('location', hasAddress ? [data.address?.fullAddress] : []);
  const secondaryImage = data.gallery?.[1]?.url || (!ownerPreview ? galleryThemeMedia('family_full_service')[1]?.src : '') || '';
  const familyContactAccess = resolveSiteContactAccess(data, 'family_full_service');
  const hours = data.openingHours && Object.keys(data.openingHours).length > 0
    ? Object.entries(data.openingHours)
    : ownerPreview
      ? []
      : [['monday', { open: true, startTime: '10:00', endTime: '20:00' }], ['tuesday', { open: true, startTime: '10:00', endTime: '20:00' }], ['wednesday', { open: true, startTime: '10:00', endTime: '20:00' }], ['thursday', { open: true, startTime: '10:00', endTime: '20:00' }]];

  const renderServiceMenu = (items: Service[], focuses: readonly FocusItem[], dark = false) => (
    items.length > 0 ? (
      <div className="rounded-2xl px-5" style={{ backgroundColor: dark ? 'rgba(255,255,255,0.06)' : t.card }}>
        {items.map((service) => <ServiceRow key={service.id} service={service} offers={data.offers} dark={dark} t={t} minsLabel={S['common.minutes']} />)}
      </div>
    ) : (
      <EmptyMenu title={S.emptyMenuTitle} body={S.emptyMenuBody} focuses={focuses} dark={dark} t={t} />
    )
  );

  return (
    <div
      className={`relative shadow-2xl border flex flex-col overflow-hidden transition-all duration-500 origin-top mx-auto h-full ${siteFrameClass(mode, 'rounded-2xl')} ${mode === 'mobile' ? 'rounded-[2rem] border-[8px] site-has-mobile-dock' : ''}`}
      style={{ borderColor: mode === 'mobile' ? '#10243a' : line, backgroundColor: white }}
    >
      {/* Browser / phone chrome (mock chrome — not part of the website) */}
      {mode !== 'mobile' ? (
        <div className="h-10 flex items-center gap-2 px-4 shrink-0" style={{ backgroundColor: appearance === 'dark' ? '#071627' : '#f4f9fc', borderBottom: `1px solid ${line}` }}>
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff8073]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffd166]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#4ecb8d]" />
          </div>
          <div className="mx-auto rounded-lg border px-5 py-1 text-[10px] font-mono tracking-wide" style={{ borderColor: line, color: muted, backgroundColor: mode === 'desktop' ? t.card : t.card }}>
            {ownerPreview && !(data.websiteSlug || '').trim()
              ? OWNER_PREVIEW_EMPTY.websiteAddress
              : `${DEFAULT_BRAND_CONFIG.platform.websiteUrl.replace(/^https?:\/\//, '')}/${data.websiteSlug || data.salonName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'familysalon'}`}
          </div>
        </div>
      ) : (
        <div className="h-6 w-full flex justify-center items-start shrink-0" style={{ backgroundColor: navy }}>
          <div className="w-24 h-4 bg-[#071b2e] rounded-b-xl" />
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar site-scroll" style={{ backgroundColor: t.page, color: ink }}>
        <SiteSeo themeId="family_full_service" data={data} mode={mode} />
        <SiteAnnouncementBar themeId="family_full_service" data={data} />
        <SiteHeader themeId="family_full_service" data={data} mode={headerMode} />

        {/* Hero — PHASE 11.1: bright family action-card hero */}
        <FamilyHero data={data} mode={mode} />

        {/* Trust / Stats — PHASE 12.1: real, configured data only */}
        <SiteTrust themeId="family_full_service" data={data} mode={mode} />

        {/* Featured Services — PHASE 12.2: theme-specific suggested services only */}
        <SiteFeaturedServices themeId="family_full_service" data={data} mode={mode} />

        {/* Services — complete directory (PHASE 12.4: theme-scoped categories + search + sort) */}
        <SiteServiceDirectory themeId="family_full_service" data={data} mode={mode} />

        {ownerPreview ? (
          <OwnerPreviewTemplateNotice
            title="Family service menu design"
            detail="Your real services appear in the directory above. Add and categorize services to populate the family menu areas without sample offerings."
            accent={teal}
            background={sky}
            color={ink}
          />
        ) : (
          <>
        {/* Men's services */}
        <section id="section-men-services" className="px-5 md:px-8 py-12" style={{ backgroundColor: sky }}>
          <div className="grid md:grid-cols-[0.82fr_1.18fr] gap-7 items-start">
            <div>
              <SectionIntro eyebrow={S.menEyebrow} title={S.menTitle} body={S.menBody} t={t} />
              <FocusStrip items={MENU_FOCUSES.men} t={t} />
              <a href="#section-contact" data-open-booking="true" onClick={(e) => { e.preventDefault(); openSiteBooking(); }} className="inline-flex items-center gap-2 mt-6 text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: blue }}>{S.menCta} <ArrowRight className="w-3.5 h-3.5" /></a>
            </div>
            <div className="rounded-[1.75rem] p-5 md:p-6" style={{ backgroundColor: t.menBand }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-white/70">{S.menMenuLabel}</span>
                <Scissors className="w-5 h-5" style={{ color: sun }} />
              </div>
              {renderServiceMenu(groups.men, MENU_FOCUSES.men, true)}
            </div>
          </div>
        </section>

        {/* Women's services */}
        <section id="section-women-services" className="px-5 md:px-8 py-12" style={{ backgroundColor: white }}>
          <div className="grid md:grid-cols-[1.16fr_0.84fr] gap-7 items-center">
            <div className="rounded-[1.75rem] p-5 md:p-6 border" style={{ borderColor: line, backgroundColor: t.well }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[9px] font-extrabold uppercase tracking-[0.2em]" style={{ color: tealDeep }}>{S.womenMenuLabel}</span>
                <Sparkles className="w-5 h-5" style={{ color: coral }} />
              </div>
              {renderServiceMenu(groups.women, MENU_FOCUSES.women)}
            </div>
            <div>
              <SectionIntro eyebrow={S.womenEyebrow} title={S.womenTitle} body={S.womenBody} t={t} />
              <FocusStrip items={MENU_FOCUSES.women} t={t} />
              <a href="#section-contact" data-open-booking="true" onClick={(e) => { e.preventDefault(); openSiteBooking(); }} className="inline-flex items-center gap-2 mt-6 text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: tealDeep }}>{S.womenCta} <ArrowRight className="w-3.5 h-3.5" /></a>
            </div>
          </div>
        </section>

        {/* Kids section */}
        <section id="section-kids" className="px-5 md:px-8 py-12" style={{ backgroundColor: sunSoft }}>
          <div className="relative rounded-[2rem] overflow-hidden p-6 md:p-8" style={{ backgroundColor: appearance === 'dark' ? '#332c1c' : '#fff9e8', border: `1px solid ${sun}` }}>
            <div className="absolute -right-8 -top-10 w-36 h-36 rounded-full border-[18px]" style={{ borderColor: 'rgba(255,209,102,0.36)' }} />
            <div className="relative z-10 grid md:grid-cols-[0.9fr_1.1fr] gap-7 items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ backgroundColor: sun, color: '#12385b' }}><Baby className="w-3.5 h-3.5" /> {S.kidsBadge}</span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.04em]" style={{ color: t.heading }}>{S.kidsTitle1}<br /><span style={{ color: coral }}>{S.kidsTitle2}</span></h2>
                <p className="mt-3 text-xs leading-relaxed max-w-sm" style={{ color: muted }}>{S.kidsBody}</p>
                <div className="flex items-center gap-2 mt-5 text-[10px] font-extrabold" style={{ color: tealDeep }}><CheckCircle2 className="w-4 h-4" /> {S.kidsNote}</div>
              </div>
              <div>
                {renderServiceMenu(groups.kids, MENU_FOCUSES.kids)}
              </div>
            </div>
          </div>
        </section>
          </>
        )}

        {/* Offers & Discounts */}
        <SiteOffers themeId="family_full_service" data={data} mode={mode} />

        {/* Combos & Packages */}
        <SiteCombos themeId="family_full_service" data={data} mode={mode} />

        {/* Gallery — PHASE 14.1: theme-scoped portfolio (featured, filter, lightbox, before/after) */}
        <SiteGallery themeId="family_full_service" data={data} mode={mode} />

        <SiteVideoGallery themeId="family_full_service" data={data} mode={mode} />

        {ownerPreview ? (
          data.about ? (
            <section {...sectionProps('about', aboutState)} className="site-section px-5 md:px-8 py-12" style={{ backgroundColor: t.well }}>
              <div className="max-w-2xl mx-auto">
                <SectionIntro eyebrow={S.aboutEyebrow} title={S.aboutTitle} body={data.about} t={t} />
              </div>
            </section>
          ) : (
            <OwnerPreviewTemplateNotice
              title="About section setup"
              detail={OWNER_PREVIEW_EMPTY.about}
              accent={teal}
              background={t.well}
              color={ink}
            />
          )
        ) : (
          <>
        {/* About */}
        <section {...sectionProps('about', aboutState)} className="site-section px-5 md:px-8 py-12" style={{ backgroundColor: t.well }}>
          <div className="grid md:grid-cols-[0.92fr_1.08fr] gap-8 items-center">
            <div className="relative min-h-[260px]">
              <div className="absolute inset-4 rounded-[2rem] rotate-3" style={{ backgroundColor: tealSoft }} />
              <img src={secondaryImage} alt="Inside the family salon" className="relative w-full h-[260px] object-cover rounded-[2rem] border-4 shadow-lg -rotate-2" style={{ borderColor: t.card }} />
              <div className="absolute -bottom-3 right-0 md:-right-4 rounded-2xl px-4 py-3 shadow-lg border" style={{ borderColor: line, backgroundColor: t.card }}><p className="text-xl font-extrabold" style={{ color: blue }}>{S.aboutBadgeValue}</p><p className="text-[9px] font-bold uppercase tracking-[0.13em]" style={{ color: muted }}>{S.aboutBadgeLabel1}<br />{S.aboutBadgeLabel2}</p></div>
            </div>
            <div>
              <SectionIntro eyebrow={S.aboutEyebrow} title={S.aboutTitle} body={data.about || S.aboutFallbackBody} t={t} />
              <div className="grid grid-cols-3 gap-2 mt-7">
                {[{ value: S.aboutStat1Value, label: S.aboutStat1Label }, { value: S.aboutStat2Value, label: S.aboutStat2Label }, { value: S.aboutStat3Value, label: S.aboutStat3Label }].map((stat) => <div key={stat.label} className="rounded-2xl p-3 border" style={{ borderColor: line, backgroundColor: t.card }}><p className="text-xl font-extrabold" style={{ color: teal }}>{stat.value}</p><p className="text-[9px] font-bold leading-tight mt-1" style={{ color: muted }}>{stat.label}</p></div>)}
              </div>
            </div>
          </div>
        </section>
          </>
        )}

        <section {...sectionProps('owner', ownerState)} className="site-section px-5 md:px-8 py-12" style={{ backgroundColor: white }}>
          {ownerState === 'ready' ? (
            <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
              {shouldShowOwnerPhoto(data) && (
              <div className="w-24 h-24 rounded-full overflow-hidden shrink-0 border-4" style={{ borderColor: tealSoft }}>
                <OwnerAvatar photoUrl={data.ownerPhotoUrl} name={data.ownerName} className="w-full h-full text-3xl" alt="Founder" />
              </div>
              )}
              <div className="min-w-0">
                {(!ownerPreview || data.ownerRole) && (
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: tealDeep }}>{data.ownerRole || S.ownerEmptyTitle}</p>
                )}
                <h3 className="text-2xl font-extrabold mt-1 break-words" style={{ color: t.heading }}>{data.ownerName}</h3>
                {(!ownerPreview || data.reviewedContent?.ownerIntro || data.about) && (
                  <p className="text-xs mt-2 leading-relaxed" style={{ color: muted }}>{data.reviewedContent?.ownerIntro || data.about || S.aboutFallbackBody}</p>
                )}
              </div>
            </div>
          ) : <SectionStatePanel status={ownerState} copy={X} palette={palette} emptyTitle={S.ownerEmptyTitle} emptyBody={S.ownerEmptyBody} />}
        </section>

        {/* Team */}
        <section {...sectionProps('team', teamState)} className="site-section px-5 md:px-8 py-12" style={{ backgroundColor: white }}>
          <div className="flex items-end justify-between gap-4 mb-7"><SectionIntro eyebrow={S.teamEyebrow} title={S.teamTitle} body={S.teamBody} t={t} /><BadgeCheck className="hidden md:block w-8 h-8" style={{ color: teal }} /></div>
          {teamState !== 'ready' ? <SectionStatePanel status={teamState} copy={X} palette={palette} emptyTitle={S.teamEmptyTitle} emptyBody={S.teamEmptyBody} /> : publicTeam.length > 0 ? (
            <div className={`grid gap-3 ${siteGrid(mode, { desktop: 3, tablet: 2, mobile: 2 })}`}>{publicTeam.slice(0, 6).map((member) => <TeamCard key={member.id} member={member} t={t} />)}</div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: skyDeep, backgroundColor: sky }}><Users className="w-8 h-8 mx-auto" style={{ color: blue }} /><p className="text-sm font-extrabold mt-3" style={{ color: ink }}>{S.teamEmptyTitle}</p><p className="text-xs mt-1" style={{ color: muted }}>{S.teamEmptyBody}</p></div>
          )}
        </section>

        <SiteReviews themeId="family_full_service" data={data} mode={mode} />

        {/* Contact */}
        <section id="section-contact" data-site-section="location" data-section-state={locationState} className="site-section px-5 md:px-8 py-12" style={{ backgroundColor: t.contactBand }}>
          <div className="grid md:grid-cols-[1fr_1fr] gap-8">
            <div>
              <SectionIntro eyebrow={S.contactEyebrow} title={S.contactTitle} body={S.contactBody} light t={t} />
              <div className="grid grid-cols-3 gap-2 mt-7">
                {canCall(data) && <SiteProtectedContactAction action="call" data={data} themeId="family_full_service" testId="theme-contact-call" ariaLabel={S.contactCall} className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.13em] transition-all hover:-translate-y-0.5" style={{ backgroundColor: t.card, color: t.ink }} showLockIcon={false}><Phone className="w-4 h-4" />{S.contactCall}</SiteProtectedContactAction>}
                {canWhatsApp(data) && <SiteProtectedContactAction action="whatsapp" data={data} themeId="family_full_service" testId="theme-contact-whatsapp" ariaLabel={S['common.whatsApp']} className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.13em] transition-all hover:-translate-y-0.5" style={{ backgroundColor: t.card, color: t.ink }} showLockIcon={false}><MessageCircle className="w-4 h-4" />{S['common.whatsApp']}</SiteProtectedContactAction>}
                <button type="button" data-open-booking="true" onClick={openSiteBooking} className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.13em] transition-all hover:-translate-y-0.5" style={{ backgroundColor: t.sun, color: '#12385b' }}><CalendarDays className="w-4 h-4" />{S.contactBookOnline}</button>
              </div>
              {!ownerPreview && <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6 text-[10px] font-bold text-white/75"><span className="flex items-center gap-1.5"><HeartHandshake className="w-3.5 h-3.5" style={{ color: sun }} /> {S.contactNote1}</span><span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" style={{ color: sun }} /> {S.contactNote2}</span></div>}
            </div>
            <div className="rounded-[1.75rem] p-5 md:p-6" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white flex items-center gap-2"><MapPin className="w-4 h-4" style={{ color: sun }} /> {S.contactVisitLabel}</h3>
                  <p className="text-xs leading-relaxed mt-3 text-white/75">{hasAddress ? data.address?.fullAddress : OWNER_PREVIEW_EMPTY.address}</p>
                  {hasAddress && <a data-testid="theme-contact-directions" href={salonMapsHref(data, ownerPreview)} target="_blank" rel="noreferrer" className="site-touch inline-flex items-center gap-1.5 mt-4 text-[10px] font-extrabold text-white">{S['common.getDirections']} <Navigation className="w-3.5 h-3.5" /></a>}
                </div>
                <div>
                  <h3 className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white flex items-center gap-2"><Clock3 className="w-4 h-4" style={{ color: sun }} /> {S.contactHoursLabel}</h3>
                  <div className="mt-3"><SiteSalonStatus themeId="family_full_service" data={data} placement="contact" inverted /></div>
                  <div className="space-y-2 mt-3">
                    {hours.length > 0 ? hours.slice(0, 5).map(([day, schedule]) => <div key={day} className="flex justify-between gap-2 text-[10px] border-b pb-1.5 text-white/75" style={{ borderColor: 'rgba(255,255,255,0.16)' }}><span className="capitalize">{dayLabel(day as string, locale)}</span><span>{schedule.open ? `${schedule.startTime} – ${schedule.endTime}` : S['common.closed']}</span></div>) : <p className="text-[10px] text-white/75">{OWNER_PREVIEW_EMPTY.hours}</p>}
                  </div>
                </div>
              </div>
              <div className="mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/70" style={{ borderColor: 'rgba(255,255,255,0.16)' }}>
                {(data.email || !ownerPreview) && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" style={{ color: sun }} /> {data.email || 'hello@familysalon.com'}</span>}
                {(data.phone || !ownerPreview) && <span data-testid="theme-contact-phone">{data.phone ? displayContactNumber(data.phone, familyContactAccess.call.unlocked) : S.contactPhoneFallback}</span>}
              </div>
            </div>
          </div>
        </section>

        <FinalBookingCta themeId="family_full_service" data={data} title={S.bookingTitle} body={S.bookingBody} cta={S['struct.bookCta']} palette={palette} />
        <SiteFooter themeId="family_full_service" data={data} />
        {mode === 'mobile' && (
          <>
            <div className="site-mobile-action-bar-spacer" aria-hidden />
            <div className="site-mobile-dock-spacer" aria-hidden />
          </>
        )}
      </div>
      <SiteFloatingActions themeId="family_full_service" data={data} mode={mode} />
      <SiteMobileActionBar themeId="family_full_service" data={data} mode={mode} />
      <SiteBookingHost themeId="family_full_service" data={data} />
      <SiteContactLockNotice themeId="family_full_service" data={data} />
    </div>
  );
}
