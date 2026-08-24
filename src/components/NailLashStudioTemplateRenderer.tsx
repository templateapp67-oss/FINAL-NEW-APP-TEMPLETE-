import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SalonData } from '../types';
import { getPublicStaffData } from '../types';
import { DEFAULT_BRAND_CONFIG } from '../config/brandConfig';
import { NAIL_LASH_STUDIO_THEME } from '../lib/themeServices';
import SiteHeader, { useSiteLocale, useThemeAppearance } from './SiteHeader';
import OwnerAvatar from './OwnerAvatar';
import { BundlePrice } from './PromotionalPricing';
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
import NailLashHero from './heroes/NailLashHero';
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
import { NAIL_LASH_SURFACES, surfacesOf } from '../lib/themeSurfaces';
import { shouldShowOwnerPhoto } from '../lib/templateConfig';
import { setOwnerAppearanceDefault } from '../lib/siteNavigation';
import type { NailLashSurface } from '../lib/themeSurfaces';
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
  Award,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Clock3,
  Eye,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Star,
  UserRound,
  Users,
} from 'lucide-react';

interface Props {
  data: SalonData;
  mode: ViewportMode;
}

/**
 * NAIL & LASH STUDIO — independent visual renderer (Theme ID:
 * nail_lash_studio).
 *
 * Phase 6.1 is presentation-only. These are visual showcase cards, not
 * service records or suggested-service data; this renderer never mutates or
 * persists salon state.
 *
 * PHASE 10.2: dark mode = deep plum with neon-pink glow (NAIL_LASH_SURFACES);
 * all customer-facing copy flows from the global siteText() table (nail
 * namespace) in English / हिन्दी.
 */

const NAIL_ART = [
  {
    name: 'Chrome Aura',
    detail: 'Mirror chrome · soft glow',
    image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=900&auto=format&fit=crop',
  },
  {
    name: 'Pink French',
    detail: 'Sheer nude · neon edge',
    image: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=900&auto=format&fit=crop',
  },
  {
    name: 'Liquid Marble',
    detail: 'Glossy lines · custom art',
    image: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=900&auto=format&fit=crop',
  },
  {
    name: 'Aura Bloom',
    detail: 'Petal wash · high shine',
    image: 'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?q=80&w=900&auto=format&fit=crop',
  },
  {
    name: 'Glass Tips',
    detail: 'Transparent edge · crystal detail',
    image: 'https://images.unsplash.com/photo-1571290274554-6a2eaa771e5f?q=80&w=900&auto=format&fit=crop',
  },
  {
    name: 'After Dark',
    detail: 'Ink black · hot pink flash',
    image: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=900&auto=format&fit=crop',
  },
];

const GEL_ACRYLIC = [
  { name: 'Gel Finish', detail: 'Flexible, glass-like shine', image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1000&auto=format&fit=crop' },
  { name: 'Acrylic Sculpt', detail: 'Structured length, made to last', image: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1000&auto=format&fit=crop' },
  { name: 'Builder Strength', detail: 'Natural support, polished finish', image: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=1000&auto=format&fit=crop' },
];

const LASH_BROW = [
  { name: 'Lash Lift', detail: 'Wide-awake curl, no extensions', image: 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?q=80&w=900&auto=format&fit=crop' },
  { name: 'Soft Volume', detail: 'Lightweight, seamless definition', image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=900&auto=format&fit=crop' },
  { name: 'Brow Shape', detail: 'Clean arch, brushed-up finish', image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=900&auto=format&fit=crop' },
];

function SectionTitle({
  eyebrow,
  title,
  body,
  light = false,
  center = false,
  t,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  light?: boolean;
  center?: boolean;
  t: NailLashSurface;
}) {
  return (
    <div className={`${center ? 'text-center mx-auto' : ''} max-w-xl`}>
      <span className="inline-flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.28em]" style={{ color: light ? t.pinkGlow : t.pinkDeep }}>
        <span className="w-5 h-px" style={{ backgroundColor: light ? t.pinkGlow : t.pink }} />
        {eyebrow}
      </span>
      <h2 className="mt-3 text-2xl md:text-3xl font-extrabold leading-tight tracking-[-0.02em]" style={{ color: light ? '#ffffff' : t.ink }}>{title}</h2>
      {body && <p className="mt-4 text-xs md:text-sm leading-relaxed" style={{ color: light ? 'rgba(255,255,255,0.65)' : t.muted }}>{body}</p>}
    </div>
  );
}

function Button({ href, children, primary = false, t, book = false }: { href: string; children: ReactNode; primary?: boolean; t: NailLashSurface; book?: boolean }) {
  return (
    <a
      href={href}
      data-open-booking={book ? 'true' : undefined}
      onClick={book ? (e) => { e.preventDefault(); openSiteBooking(); } : undefined}
      className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[9px] font-extrabold uppercase tracking-[0.2em] transition-all hover:-translate-y-0.5"
      style={primary ? { backgroundColor: t.pink, color: '#ffffff', boxShadow: `0 10px 24px ${t.pink}42` } : { backgroundColor: t.card, color: t.ink, border: `1px solid ${t.line}` }}
    >
      {children}
    </a>
  );
}

function ImageShowcaseCard({ item, index, compact = false }: { item: { name: string; detail: string; image: string }; index: number; compact?: boolean; key?: string }) {
  const { pinkGlow } = NAIL_LASH_STUDIO_THEME;
  return (
    <article className={`relative overflow-hidden group ${compact ? 'rounded-[1.5rem] min-h-[170px]' : 'rounded-[1.75rem] min-h-[230px]'}`}>
      <img src={item.image} alt={item.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#211b24]/85 via-[#211b24]/10 to-transparent" />
      <div className="absolute left-4 right-4 bottom-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: pinkGlow }}>{String(index + 1).padStart(2, '0')}</p>
          <h3 className="text-sm font-extrabold text-white mt-1">{item.name}</h3>
          <p className="text-[9px] mt-1 text-white/65">{item.detail}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-white/80 transition-transform group-hover:translate-x-1" />
      </div>
    </article>
  );
}

function TeamCard({ member, t }: { member: ReturnType<typeof getPublicStaffData>; key?: string; t: NailLashSurface }) {
  return (
    <article className="rounded-[1.5rem] overflow-hidden border" style={{ borderColor: t.line, backgroundColor: t.card }}>
      <div className="h-36 relative" style={{ background: `linear-gradient(135deg, ${t.pinkSoft}, ${t.sand})` }}>
        {member.imageUrl ? <img src={member.imageUrl} alt={member.name} className="w-full h-full object-cover" /> : <UserRound className="absolute w-12 h-12 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: t.pinkDeep }} />}
        {member.rating && <span className="absolute right-3 top-3 px-2 py-1 rounded-full text-[9px] font-extrabold flex items-center gap-1" style={{ color: t.ink, backgroundColor: t.card }}><Star className="w-3 h-3" style={{ color: t.pink, fill: t.pink }} /> {member.rating.toFixed(1)}</span>}
      </div>
      <div className="p-4"><h3 className="text-sm font-extrabold" style={{ color: t.ink }}>{member.name}</h3><p className="text-[9px] font-bold uppercase tracking-[0.14em] mt-1" style={{ color: t.pinkDeep }}>{member.role}</p>{member.specialties.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{member.specialties.slice(0, 2).map((specialty) => <span key={specialty} className="rounded-full px-2 py-1 text-[8px] font-bold" style={{ backgroundColor: t.pinkSoft, color: t.pinkDeep }}>{specialty}</span>)}</div>}</div>
    </article>
  );
}

function ContactAction({ href, icon: Icon, children, primary = false, book = false, t }: { href?: string; icon: typeof Phone; children: ReactNode; primary?: boolean; book?: boolean; t: NailLashSurface }) {
  const className = "site-touch flex items-center justify-center gap-2 rounded-xl py-3 text-[9px] font-extrabold uppercase tracking-[0.15em] transition-transform hover:-translate-y-0.5";
  const style = primary ? { backgroundColor: t.pink, color: '#ffffff' } : { backgroundColor: t.card, color: t.ink };
  if (book) {
    return <button type="button" data-testid="theme-contact-booking" data-open-booking="true" onClick={openSiteBooking} className={className} style={style}>{children}<Icon className="w-3.5 h-3.5" /></button>;
  }
  return <a href={href} className={className} style={style}>{children}<Icon className="w-3.5 h-3.5" /></a>;
}

export default function NailLashStudioTemplateRenderer({ data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  // Live locale + appearance: re-render when the header controls switch.
  const locale = useSiteLocale();
  setOwnerAppearanceDefault(data.websiteAppearance);
  const appearance = useThemeAppearance('nail_lash_studio');
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  const { ink, pink, pinkDeep, pinkGlow, pinkSoft, sand, sandDeep, nude, cream, muted, line, white } = t;
  const S = { ...siteText('nail_lash_studio', locale), ...structureText('nail_lash_studio', locale) };
  const X = structureCopyFrom(S);
  const palette = { accent: pink, text: ink, muted, card: t.card, line, invert: '#ffffff' };
  const headerMode = headerModeOf(mode);
  // PHASE 10.12 — performance optimization: clear stale data, marks, memoize
  useEffect(() => {
    setActiveTheme('nail_lash_studio');
    markPerformance('nail_lash_studio-render-start');
    return () => { markPerformance('nail_lash_studio-render-end'); };
  }, []);
  const offersState = resolveSectionState('offers', data.packages);
  const teamState = resolveSectionState('team', data.team);
  const ownerState = resolveSectionState('owner', data.ownerName ? [data.ownerName] : []);
  const aboutState = resolveSectionState('about', data.about ? [data.about] : (!ownerPreview ? ['fallback'] : []));
  const hasAddress = hasSalonAddress(data, ownerPreview);
  const locationState = resolveSectionState('location', hasAddress ? [data.address?.fullAddress] : []);

  const publicTeam = (data.team || []).map(getPublicStaffData);
  const nailContactAccess = resolveSiteContactAccess(data, 'nail_lash_studio');
  const studioImage = data.heroImageUrl || (!ownerPreview ? 'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?q=80&w=1200&auto=format&fit=crop' : '');
  const hours = data.openingHours && Object.keys(data.openingHours).length > 0
    ? Object.entries(data.openingHours).slice(0, 5)
    : ownerPreview
      ? []
      : [['monday', { open: true, startTime: '10:00 AM', endTime: '08:00 PM' }], ['tuesday', { open: true, startTime: '10:00 AM', endTime: '08:00 PM' }], ['wednesday', { open: true, startTime: '10:00 AM', endTime: '08:00 PM' }], ['thursday', { open: true, startTime: '10:00 AM', endTime: '08:00 PM' }], ['friday', { open: true, startTime: '10:00 AM', endTime: '09:00 PM' }]];

  return (
    <div className={`relative shadow-2xl border flex flex-col overflow-hidden transition-all duration-500 origin-top mx-auto h-full ${siteFrameClass(mode, 'rounded-2xl')} ${mode === 'mobile' ? 'rounded-[2rem] border-[8px] site-has-mobile-dock' : ''}`} style={{ borderColor: mode === 'mobile' ? ink : line, backgroundColor: t.page }}>
      {mode !== 'mobile' ? (
        <div className="h-10 flex items-center gap-2 px-4 shrink-0" style={{ backgroundColor: sand, borderBottom: `1px solid ${line}` }}>
          <div className="flex gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#ff8073]" /><span className="w-2.5 h-2.5 rounded-full bg-[#ffd166]" /><span className="w-2.5 h-2.5 rounded-full bg-[#65cf98]" /></div>
          <div className="mx-auto rounded-lg border px-5 py-1 text-[10px] font-mono tracking-wide" style={{ borderColor: line, color: muted, backgroundColor: t.card }}>
            {ownerPreview && !(data.websiteSlug || '').trim()
              ? OWNER_PREVIEW_EMPTY.websiteAddress
              : `${DEFAULT_BRAND_CONFIG.platform.websiteUrl.replace(/^https?:\/\//, '')}/${data.websiteSlug || data.salonName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'nailandlash'}`}
          </div>
        </div>
      ) : <div className="h-6 w-full flex justify-center items-start shrink-0" style={{ backgroundColor: t.footerBg }}><div className="w-24 h-4 rounded-b-xl" style={{ backgroundColor: '#09070b' }} /></div>}

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar site-scroll" style={{ backgroundColor: cream, color: ink }}>
        <SiteSeo themeId="nail_lash_studio" data={data} mode={mode} />
        <SiteAnnouncementBar themeId="nail_lash_studio" data={data} />
        <SiteHeader themeId="nail_lash_studio" data={data} mode={headerMode} />

        {/* Hero — PHASE 11.1: glam card-shelf hero */}
        <NailLashHero data={data} mode={mode} />

        {/* Trust / Stats — PHASE 12.1: real, configured data only */}
        <SiteTrust themeId="nail_lash_studio" data={data} mode={mode} />

        {/* Featured Services — PHASE 12.2: theme-specific suggested services only */}
        <SiteFeaturedServices themeId="nail_lash_studio" data={data} mode={mode} />

        {/* Services — complete directory (PHASE 12.4: theme-scoped categories + search + sort) */}
        <SiteServiceDirectory themeId="nail_lash_studio" data={data} mode={mode} />

        {/* Offers & Discounts */}
        <SiteOffers themeId="nail_lash_studio" data={data} mode={mode} />

        {/* Combos & Packages */}
        <SiteCombos themeId="nail_lash_studio" data={data} mode={mode} />

        {ownerPreview ? (
          <OwnerPreviewTemplateNotice
            title="Nail and lash showcase design"
            detail="Add your real portfolio media and services to replace this template setup state without showing sample treatments or stock work."
            accent={pink}
            background={t.artBand}
            color={ink}
          />
        ) : (
          <>
        {/* Nail Art Showcase */}
        <section id="section-nail-art" className="px-5 md:px-8 py-12" style={{ backgroundColor: t.artBand }}><div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8"><SectionTitle eyebrow={S.nailArtEyebrow} title={S.nailArtTitle} body={S.nailArtBody} light t={t} /><a href="#section-contact" data-open-booking="true" onClick={(e) => { e.preventDefault(); openSiteBooking(); }} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[9px] font-extrabold uppercase tracking-[0.18em] self-start" style={{ backgroundColor: pink, color: '#ffffff' }}>{S.startYourSet} <ArrowRight className="w-3.5 h-3.5" /></a></div><div className={`grid gap-3 ${siteGrid(mode, { desktop: 3, tablet: 2, mobile: 2 })}`}>{NAIL_ART.map((item, index) => <ImageShowcaseCard key={item.name} item={item} index={index} />)}</div></section>

        {/* Gel / Acrylic Showcase */}
        <section id="section-gel-acrylic" className="px-5 md:px-8 py-12" style={{ backgroundColor: sand }}><div className="grid md:grid-cols-[0.82fr_1.18fr] gap-8 items-center"><div><SectionTitle eyebrow={S.gelEyebrow} title={S.gelTitle} body={S.gelBody} t={t} /><div className="flex flex-wrap gap-2 mt-6"><span className="rounded-full px-3 py-2 text-[9px] font-extrabold" style={{ backgroundColor: t.card, color: pinkDeep }}>{S.gelChip1}</span><span className="rounded-full px-3 py-2 text-[9px] font-extrabold" style={{ backgroundColor: t.card, color: pinkDeep }}>{S.gelChip2}</span><span className="rounded-full px-3 py-2 text-[9px] font-extrabold" style={{ backgroundColor: t.card, color: pinkDeep }}>{S.gelChip3}</span></div></div><div className="grid gap-2 grid-cols-2 md:grid-cols-3">{GEL_ACRYLIC.map((item, index) => <ImageShowcaseCard key={item.name} item={item} index={index} compact />)}</div></div></section>

        {/* Manicure / Pedicure */}
        <section id="section-mani-pedi" className="px-5 md:px-8 py-12" style={{ backgroundColor: cream }}><div className="text-center mb-8"><SectionTitle eyebrow={S.maniEyebrow} title={S.maniTitle} body={S.maniBody} center t={t} /></div><div className="grid md:grid-cols-2 gap-4"><article className="relative min-h-[255px] rounded-[2rem] overflow-hidden group"><img src="https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1100&auto=format&fit=crop" alt="Manicure detail" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" /><div className="absolute inset-0 bg-gradient-to-t from-[#211b24]/90 to-transparent" /><div className="absolute left-5 right-5 bottom-5"><span className="text-[9px] font-extrabold uppercase tracking-[0.24em]" style={{ color: pinkGlow }}>{S.maniCard1Eyebrow}</span><h3 className="text-2xl font-extrabold text-white mt-2">{S.maniCard1Title}</h3><p className="text-[10px] mt-2 text-white/65 max-w-xs">{S.maniCard1Body}</p></div></article><article className="relative min-h-[255px] rounded-[2rem] overflow-hidden group"><img src="https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1100&auto=format&fit=crop" alt="Pedicure detail" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" /><div className="absolute inset-0 bg-gradient-to-t from-[#211b24]/90 to-transparent" /><div className="absolute left-5 right-5 bottom-5"><span className="text-[9px] font-extrabold uppercase tracking-[0.24em]" style={{ color: pinkGlow }}>{S.maniCard2Eyebrow}</span><h3 className="text-2xl font-extrabold text-white mt-2">{S.maniCard2Title}</h3><p className="text-[10px] mt-2 text-white/65 max-w-xs">{S.maniCard2Body}</p></div></article></div></section>

        {/* Lash & Brow */}
        <section id="section-lash-brow" className="px-5 md:px-8 py-12" style={{ backgroundColor: pinkSoft }}><div className="grid md:grid-cols-[1fr_1.2fr] gap-8 items-center"><div><SectionTitle eyebrow={S.lashEyebrow} title={S.lashTitle} body={S.lashBody} t={t} /><div className="mt-6 rounded-2xl p-4 border" style={{ borderColor: line, backgroundColor: t.card }}><div className="flex items-center gap-3"><span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.artBand, color: pink }}><Eye className="w-4 h-4" /></span><div><p className="text-xs font-extrabold" style={{ color: ink }}>{S.lashNoteTitle}</p><p className="text-[9px] mt-1" style={{ color: muted }}>{S.lashNoteBody}</p></div></div></div></div><div className="grid gap-2 grid-cols-2 md:grid-cols-3">{LASH_BROW.map((item, index) => <ImageShowcaseCard key={item.name} item={item} index={index} compact />)}</div></div></section>
          </>
        )}

        {/* Gallery */}
        {/* Gallery — PHASE 14.1: theme-scoped portfolio (featured, filter, lightbox, before/after) */}
        <SiteGallery themeId="nail_lash_studio" data={data} mode={mode} />


        <SiteVideoGallery themeId="nail_lash_studio" data={data} mode={mode} />

        {ownerPreview ? (
          data.about ? (
            <section {...sectionProps('about', aboutState)} className="site-section px-5 md:px-8 py-12" style={{ backgroundColor: sand }}>
              <div className="max-w-2xl mx-auto"><SectionTitle eyebrow={S.aboutEyebrow} title={S.aboutTitle} body={data.about} t={t} /></div>
            </section>
          ) : (
            <OwnerPreviewTemplateNotice
              title="About section setup"
              detail={OWNER_PREVIEW_EMPTY.about}
              accent={pink}
              background={sand}
              color={ink}
            />
          )
        ) : (
          <>
        {/* About Studio */}
        <section {...sectionProps('about', aboutState)} className="px-5 md:px-8 py-12" style={{ backgroundColor: sand }}><div className="grid md:grid-cols-[1fr_1fr] gap-8 items-center"><div className="relative min-h-[275px]"><div className="absolute left-3 right-3 top-3 bottom-[-8px] rounded-[2rem] rotate-3" style={{ backgroundColor: pink }} /><img src={studioImage} alt="Inside the Nail & Lash Studio" className="relative w-full h-[275px] object-cover rounded-[2rem] border-4 border-white shadow-xl -rotate-2" /><div className="absolute left-[-5px] top-10 rounded-2xl px-3 py-2.5 shadow-lg border" style={{ borderColor: line, backgroundColor: t.card }}><Award className="w-4 h-4" style={{ color: pink }} /><p className="text-[9px] font-extrabold mt-1" style={{ color: ink }}>{S.aboutBadge1}<br />{S.aboutBadge2}</p></div></div><div><SectionTitle eyebrow={S.aboutEyebrow} title={S.aboutTitle} body={data.about || S.aboutFallbackBody} t={t} /><div className="grid gap-2 grid-cols-2 md:grid-cols-3 mt-7">{[{ value: '01', label: S.aboutStat1Label }, { value: '∞', label: S.aboutStat2Label }, { value: '5★', label: S.aboutStat3Label }].map((stat) => <div key={stat.label} className="rounded-2xl p-3 border" style={{ borderColor: line, backgroundColor: t.card }}><p className="text-xl font-extrabold" style={{ color: pinkDeep }}>{stat.value}</p><p className="text-[8px] uppercase tracking-[0.12em] font-bold mt-1" style={{ color: muted }}>{stat.label}</p></div>)}</div></div></div></section>
          </>
        )}

        <section {...sectionProps('owner', ownerState)} className="site-section px-5 md:px-8 py-12" style={{ backgroundColor: white }}>
          {ownerState === 'ready' ? (
            <div className="max-w-2xl mx-auto flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
              {shouldShowOwnerPhoto(data) && (
                <div className="w-24 h-24 rounded-full overflow-hidden shrink-0 border-4" style={{ borderColor: pinkSoft }}>
                  <OwnerAvatar photoUrl={data.ownerPhotoUrl} name={data.ownerName} className="w-full h-full text-3xl" alt="Founder" />
                </div>
              )}
              <div className="min-w-0">
                {(!ownerPreview || data.ownerRole) && (
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: pinkDeep }}>{data.ownerRole || S.ownerEmptyTitle}</p>
                )}
                <h3 className="text-2xl font-extrabold mt-1 break-words" style={{ color: ink }}>{data.ownerName}</h3>
                {(!ownerPreview || data.reviewedContent?.ownerIntro || data.about) && (
                  <p className="text-xs mt-2" style={{ color: muted }}>{data.reviewedContent?.ownerIntro || data.about || S.aboutFallbackBody}</p>
                )}
              </div>
            </div>
          ) : <SectionStatePanel status={ownerState} copy={X} palette={palette} emptyTitle={S.ownerEmptyTitle} emptyBody={S.ownerEmptyBody} />}
        </section>

        {/* Team */}
        <section {...sectionProps('team', teamState)} className="px-5 md:px-8 py-12" style={{ backgroundColor: cream }}><div className="flex items-end justify-between gap-4 mb-7"><SectionTitle eyebrow={S.teamEyebrow} title={S.teamTitle} body={S.teamSubtitle} t={t} /><BadgeCheck className="hidden md:block w-8 h-8" style={{ color: pink }} /></div>{teamState !== 'ready' ? <SectionStatePanel status={teamState} copy={X} palette={palette} emptyTitle={S.teamEmptyTitle} emptyBody={S.teamEmptyBody} /> : publicTeam.length > 0 ? <div className={`grid gap-3 ${siteGrid(mode, { desktop: 3, tablet: 2, mobile: 2 })}`}>{publicTeam.slice(0, 6).map((member) => <TeamCard key={member.id} member={member} t={t} />)}</div> : <div className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: sandDeep, backgroundColor: sand }}><Users className="w-8 h-8 mx-auto" style={{ color: pinkDeep }} /><p className="text-sm font-extrabold mt-3" style={{ color: ink }}>{S.teamEmptyTitle}</p><p className="text-xs mt-1" style={{ color: muted }}>{S.teamEmptyBody}</p></div>}</section>

        <SiteReviews themeId="nail_lash_studio" data={data} mode={mode} />

        {/* Contact */}
        <section {...sectionProps('location', locationState, 'section-contact')} className="site-section px-5 md:px-8 py-12" style={{ backgroundColor: t.bandBg }}>
          <div className="grid md:grid-cols-[0.9fr_1.1fr] gap-8">
            <div>
              <SectionTitle eyebrow={S.contactEyebrow} title={S.contactTitle} body={ownerPreview ? undefined : S.contactBody} light t={t} />
              <div className="grid gap-2 grid-cols-2 md:grid-cols-3 mt-7">
                {canCall(data) && <SiteProtectedContactAction action="call" data={data} themeId="nail_lash_studio" testId="theme-contact-call" ariaLabel={S.call} className="site-touch flex items-center justify-center gap-2 rounded-xl py-3 text-[9px] font-extrabold uppercase tracking-[0.15em] transition-transform hover:-translate-y-0.5" style={{ backgroundColor: t.card, color: t.ink }} showLockIcon={false}>{S.call}<Phone className="w-3.5 h-3.5" /></SiteProtectedContactAction>}
                {canWhatsApp(data) && <SiteProtectedContactAction action="whatsapp" data={data} themeId="nail_lash_studio" testId="theme-contact-whatsapp" ariaLabel={S['common.whatsApp']} className="site-touch flex items-center justify-center gap-2 rounded-xl py-3 text-[9px] font-extrabold uppercase tracking-[0.15em] transition-transform hover:-translate-y-0.5" style={{ backgroundColor: t.card, color: t.ink }} showLockIcon={false}>{S['common.whatsApp']}<MessageCircle className="w-3.5 h-3.5" /></SiteProtectedContactAction>}
                <ContactAction icon={CalendarDays} primary book t={t}>{S.bookOnline}</ContactAction>
              </div>
            </div>
            <div className="rounded-[1.75rem] p-5 md:p-6" style={{ backgroundColor: 'rgba(33,27,36,0.9)' }}>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-white flex items-center gap-2"><MapPin className="w-4 h-4" style={{ color: pinkGlow }} /> {S.visitTheEdit}</h3>
                  <p className="text-xs leading-relaxed mt-3 text-white/65">{hasAddress ? data.address?.fullAddress : OWNER_PREVIEW_EMPTY.address}</p>
                  {hasAddress && <a data-testid="theme-contact-directions" href={salonMapsHref(data, ownerPreview)} target="_blank" rel="noreferrer" className="site-touch inline-flex items-center gap-1.5 mt-4 text-[9px] font-extrabold text-white">{S['common.getDirections']} <Navigation className="w-3.5 h-3.5" /></a>}
                </div>
                <div>
                  <h3 className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-white flex items-center gap-2"><Clock3 className="w-4 h-4" style={{ color: pinkGlow }} /> {S.studioHours}</h3>
                  <div className="mt-3"><SiteSalonStatus themeId="nail_lash_studio" data={data} placement="contact" inverted /></div>
                  <div className="space-y-2 mt-3">
                    {hours.length > 0 ? hours.map(([day, schedule]) => <div key={day} className="flex justify-between gap-2 text-[9px] border-b pb-1.5 text-white/65" style={{ borderColor: 'rgba(255,255,255,0.14)' }}><span>{dayLabel(day as string, locale)}</span><span>{schedule.open ? `${schedule.startTime} – ${schedule.endTime}` : S['common.closed']}</span></div>) : <p className="text-[9px] text-white/65">{OWNER_PREVIEW_EMPTY.hours}</p>}
                  </div>
                </div>
              </div>
              <div className="mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-2 text-[9px] text-white/55" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
                {(data.email || !ownerPreview) && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" style={{ color: pinkGlow }} /> {data.email || 'hello@theglowedit.com'}</span>}
                {(data.phone || !ownerPreview) && <span data-testid="theme-contact-phone">{data.phone ? displayContactNumber(data.phone, nailContactAccess.call.unlocked) : S.contactPhoneFallback}</span>}
              </div>
            </div>
          </div>
        </section>

        <FinalBookingCta themeId="nail_lash_studio" data={data} title={S.bookingTitle} body={S.bookingBody} cta={S['struct.bookCta']} palette={palette} />
        <SiteFooter themeId="nail_lash_studio" data={data} />
        {mode === 'mobile' && (
          <>
            <div className="site-mobile-action-bar-spacer" aria-hidden />
            <div className="site-mobile-dock-spacer" aria-hidden />
          </>
        )}
      </div>
      <SiteFloatingActions themeId="nail_lash_studio" data={data} mode={mode} />
      <SiteMobileActionBar themeId="nail_lash_studio" data={data} mode={mode} />
      <SiteBookingHost themeId="nail_lash_studio" data={data} />
      <SiteContactLockNotice themeId="nail_lash_studio" data={data} />
    </div>
  );
}
