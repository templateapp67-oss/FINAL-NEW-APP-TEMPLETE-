import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SalonData } from '../types';
import { getSalonNameStyle } from '../lib/brandIdentity';
import { dayLabel, siteText } from '../lib/siteI18n';
import { chromeText } from '../lib/siteChromeI18n';
import {
  SITE_NAV_LABELS,
  buildSiteNavItems,
  scrollToSiteSection,
} from '../lib/siteNavigation';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { activeCatalogItems, sectionProps } from '../lib/siteStructure';
import { displayService } from '../lib/displayService';
import {
  BARBER_SURFACES,
  BEAUTY_SPA_SURFACES,
  FAMILY_SURFACES,
  HAIR_STUDIO_SURFACES,
  NAIL_LASH_SURFACES,
  surfacesOf,
} from '../lib/themeSurfaces';
import {
  canCall,
  canWhatsApp,
  hasSalonAddress,
  openSiteBooking,
  salonDisplayName,
  salonMapsHref,
} from '../lib/siteBooking';
import { OWNER_PREVIEW_EMPTY } from '../lib/ownerPreview';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { useIsOwnerPreview } from './SiteRenderContext';
import SiteProtectedContactAction from './SiteProtectedContactAction';
import { displayContactNumber, resolveSiteContactAccess } from '../lib/siteContactAccess';
import {
  Facebook,
  Instagram,
  Leaf,
  Mail,
  Phone,
  Scissors,
  Sparkles,
  Users,
  Youtube,
} from 'lucide-react';

type LegalKey = 'privacy' | 'terms' | 'cancel';

type Skin = {
  mark: ReactNode;
  headingClass: string;
  linkClass: string;
  chipClass: string;
  legalClass: string;
  muted: string;
  text: string;
  accent: string;
  rule: string;
  card?: string;
  radius: string;
};

function skinOf(themeId: SiteHeaderThemeId, appearance: 'light' | 'dark'): Skin {
  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return {
      mark: <Scissors className="w-4 h-4" style={{ color: t.gold }} />,
      headingClass: 'text-[10px] font-black uppercase tracking-[0.22em]',
      linkClass: 'text-[11px] font-bold uppercase tracking-[0.12em] text-left hover:underline underline-offset-4',
      chipClass: 'text-[10px] font-black uppercase tracking-[0.14em] border px-2 py-1',
      legalClass: 'text-[9px] font-black uppercase tracking-[0.16em]',
      muted: '#a6a49b',
      text: '#f5efe0',
      accent: t.gold,
      rule: t.gold,
      radius: '',
    };
  }
  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return {
      mark: <Scissors className="w-4 h-4" style={{ color: t.roseBright }} />,
      headingClass: 'text-[10px] font-medium uppercase tracking-[0.32em]',
      linkClass: 'text-[11px] font-serif text-left hover:underline underline-offset-4',
      chipClass: 'text-[10px] uppercase tracking-[0.16em] border-b pb-0.5',
      legalClass: 'text-[9px] uppercase tracking-[0.2em] font-medium',
      muted: '#cfcac4',
      text: '#faf8f5',
      accent: t.roseBright,
      rule: 'rgba(255,255,255,0.12)',
      radius: '',
    };
  }
  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return {
      mark: <Leaf className="w-4 h-4" style={{ color: '#9fd3c3' }} />,
      headingClass: 'text-[10px] font-semibold uppercase tracking-[0.28em]',
      linkClass: 'text-[11px] text-left rounded-full px-2 py-1 hover:bg-white/10',
      chipClass: 'text-[10px] rounded-full px-2.5 py-1',
      legalClass: 'text-[9px] uppercase tracking-[0.16em] font-semibold',
      muted: '#cfe3dd',
      text: '#f7fbf9',
      accent: '#9fd3c3',
      rule: 'rgba(255,255,255,0.14)',
      card: 'rgba(255,255,255,0.06)',
      radius: 'rounded-2xl',
    };
  }
  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return {
      mark: <Users className="w-4 h-4 text-white" />,
      headingClass: 'text-[10px] font-extrabold uppercase tracking-[0.18em]',
      linkClass: 'text-[11px] font-bold text-left rounded-lg px-2 py-1 hover:bg-white/10',
      chipClass: 'text-[10px] font-extrabold rounded-lg px-2 py-1',
      legalClass: 'text-[9px] font-extrabold uppercase tracking-[0.14em]',
      muted: 'rgba(255,255,255,0.62)',
      text: '#ffffff',
      accent: t.sun,
      rule: 'rgba(255,255,255,0.13)',
      card: 'rgba(255,255,255,0.06)',
      radius: 'rounded-xl',
    };
  }
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  return {
    mark: <Sparkles className="w-4 h-4 text-white" />,
    headingClass: 'text-[9px] font-extrabold uppercase tracking-[0.24em]',
    linkClass: 'text-[11px] font-extrabold text-left rounded-full px-2 py-1 hover:bg-white/10',
    chipClass: 'text-[9px] font-extrabold uppercase tracking-[0.12em] rounded-full px-2.5 py-1',
    legalClass: 'text-[8px] font-extrabold uppercase tracking-[0.16em]',
    muted: 'rgba(255,255,255,0.5)',
    text: '#fffaf7',
    accent: t.pinkGlow,
    rule: 'rgba(255,255,255,0.14)',
    card: 'rgba(255,255,255,0.05)',
    radius: 'rounded-2xl',
  };
}

function footerBgOf(themeId: SiteHeaderThemeId, appearance: 'light' | 'dark'): string {
  if (themeId === 'barber_mens_grooming') return surfacesOf(BARBER_SURFACES, appearance).footerBg;
  if (themeId === 'hair_studio_color_bar') return surfacesOf(HAIR_STUDIO_SURFACES, appearance).footerBg;
  if (themeId === 'beauty_skin_spa') return surfacesOf(BEAUTY_SPA_SURFACES, appearance).footerBg;
  if (themeId === 'family_full_service') return surfacesOf(FAMILY_SURFACES, appearance).footerBg;
  return surfacesOf(NAIL_LASH_SURFACES, appearance).footerBg;
}

function markWrap(themeId: SiteHeaderThemeId, mark: ReactNode, accent: string): ReactNode {
  if (themeId === 'barber_mens_grooming') {
    return (
      <span className="w-9 h-9 flex items-center justify-center border-2 shrink-0" style={{ borderColor: accent }}>
        {mark}
      </span>
    );
  }
  if (themeId === 'hair_studio_color_bar') {
    return <span className="shrink-0">{mark}</span>;
  }
  if (themeId === 'beauty_skin_spa') {
    return (
      <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
        {mark}
      </span>
    );
  }
  if (themeId === 'family_full_service') {
    return (
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#079f9a' }}>
        {mark}
      </span>
    );
  }
  return (
    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#ff2d8d' }}>
      {mark}
    </span>
  );
}

export default function SiteFooter({ themeId, data }: { themeId: SiteHeaderThemeId; data: SalonData }) {
  const ownerPreview = useIsOwnerPreview();
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const C = chromeText(themeId, locale);
  const S = siteText(themeId, locale);
  const skin = skinOf(themeId, appearance);
  const footerBg = footerBgOf(themeId, appearance);
  const name = salonDisplayName(data, themeId, ownerPreview);
  const nameStyle: CSSProperties = { ...getSalonNameStyle(data) };
  if (!nameStyle.color) nameStyle.color = skin.text;
  const description = ownerPreview
    ? (data.about || data.tagline || OWNER_PREVIEW_EMPTY.about).trim()
    : (data.about || data.tagline || S.footerFallbackTagline || '').trim();
  const nav = buildSiteNavItems(themeId, data);
  const footerAccess = resolveSiteContactAccess(data, themeId);
  const services = activeCatalogItems(data.services).slice(0, 5);
  const hours = data.openingHours ? Object.entries(data.openingHours) : [];
  const [legal, setLegal] = useState<LegalKey | null>(null);

  const legalCopy: Record<LegalKey, { title: string; body: string }> = {
    privacy: { title: C.privacyTitle, body: C.privacyBody },
    terms: { title: C.termsTitle, body: C.termsBody },
    cancel: { title: C.cancelTitle, body: C.cancelBody },
  };

  const socials = [
    { key: 'instagram', href: data.socialProfiles?.instagram, Icon: Instagram, label: 'Instagram' },
    { key: 'facebook', href: data.socialProfiles?.facebook, Icon: Facebook, label: 'Facebook' },
    { key: 'youtube', href: data.socialProfiles?.youtube, Icon: Youtube, label: 'YouTube' },
  ];
  const visibleSocials = ownerPreview
    ? socials.filter(({ href }) => Boolean((href || '').trim()))
    : socials;
  const hasAddress = hasSalonAddress(data, ownerPreview);

  return (
    <footer
      {...sectionProps('footer', 'ready')}
      data-testid="site-footer"
      data-theme={themeId}
      className={`site-section px-5 md:px-8 py-10 text-xs ${themeId === 'barber_mens_grooming' ? 'border-t' : ''}`}
      style={{ backgroundColor: footerBg, borderColor: themeId === 'barber_mens_grooming' ? skin.rule : undefined, color: skin.muted }}
    >
      <div className={`grid gap-8 md:grid-cols-4 ${skin.radius}`} style={skin.card ? { backgroundColor: skin.card, padding: '1.25rem' } : undefined}>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="" className="h-8 w-auto max-w-[96px] object-contain" />
            ) : (
              markWrap(themeId, skin.mark, skin.accent)
            )}
            <p className="text-sm font-extrabold truncate" style={nameStyle} data-testid="site-footer-name">
              {name}
            </p>
          </div>
          <p className="mt-3 leading-relaxed text-[11px] max-w-xs" data-testid="site-footer-description" style={{ color: skin.muted }}>
            {description}
          </p>
          {visibleSocials.length > 0 && (
            <div className="flex items-center gap-3 mt-4" data-testid="site-footer-social">
              {visibleSocials.map(({ key, href, Icon, label }) => (
                <a
                  key={key}
                  href={href || '#section-footer'}
                  aria-label={label}
                  target={href ? '_blank' : undefined}
                  rel={href ? 'noreferrer' : undefined}
                  className="hover:opacity-100 opacity-80"
                  style={{ color: skin.muted }}
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div data-testid="site-footer-links">
          <p className={skin.headingClass} style={{ color: skin.accent }}>{C['chrome.quickLinks']}</p>
          <ul className="mt-3 space-y-1.5">
            {nav.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={skin.linkClass}
                  style={{ color: skin.text }}
                  onClick={() => scrollToSiteSection(item.targetId)}
                >
                  {SITE_NAV_LABELS[item.key][locale]}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div data-testid="site-footer-services">
          <p className={skin.headingClass} style={{ color: skin.accent }}>{C['chrome.services']}</p>
          <ul className="mt-3 space-y-1.5">
            {services.length > 0 ? services.map((service) => (
              <li key={service.id}>
                <button
                  type="button"
                  data-open-booking="true"
                  className={skin.linkClass}
                  style={{ color: skin.text }}
                  onClick={openSiteBooking}
                >
                  {displayService(service, locale).name}
                </button>
              </li>
            )) : (
              <li style={{ color: skin.muted }}>{C['chrome.noServices']}</li>
            )}
          </ul>
        </div>

        <div className="space-y-4 min-w-0">
          <div data-testid="site-footer-contact">
            <p className={skin.headingClass} style={{ color: skin.accent }}>{C['chrome.contact']}</p>
            <div className="mt-3 space-y-1.5" style={{ color: skin.text }}>
              {canCall(data) && (
                <SiteProtectedContactAction
                  action="call"
                  data={data}
                  themeId={themeId}
                  testId="site-footer-call"
                  ariaLabel={C['chrome.call']}
                  className="flex items-center gap-2 hover:underline"
                >
                  <Phone className="w-3.5 h-3.5" style={{ color: skin.accent }} />{' '}
                  {displayContactNumber(data.phone, footerAccess.call.unlocked)}
                </SiteProtectedContactAction>
              )}
              {canWhatsApp(data) && (
                <SiteProtectedContactAction
                  action="whatsapp"
                  data={data}
                  themeId={themeId}
                  testId="site-footer-whatsapp"
                  ariaLabel={C['chrome.whatsapp']}
                  className="flex items-center gap-2 hover:underline"
                >
                  {C['chrome.whatsapp']}
                </SiteProtectedContactAction>
              )}
              <p className="flex items-center gap-2 break-all">
                <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: skin.accent }} />
                {data.email || (ownerPreview ? OWNER_PREVIEW_EMPTY.email : C['chrome.emailFallback'])}
              </p>
            </div>
          </div>
          <div data-testid="site-footer-address">
            <p className={skin.headingClass} style={{ color: skin.accent }}>{C['chrome.address']}</p>
            <p className="mt-2 leading-relaxed" style={{ color: skin.text }}>
              {hasAddress
                ? data.address?.fullAddress
                : ownerPreview
                  ? OWNER_PREVIEW_EMPTY.address
                  : 'Address unavailable'}
            </p>
            {hasAddress && (
              <a href={salonMapsHref(data, ownerPreview)} target="_blank" rel="noreferrer" className="inline-block mt-1 hover:underline" style={{ color: skin.accent }}>
                {S['common.getDirections']}
              </a>
            )}
          </div>
          <div data-testid="site-footer-hours">
            <p className={skin.headingClass} style={{ color: skin.accent }}>{C['chrome.hours']}</p>
            <div className="mt-2 space-y-1">
              {hours.length > 0 ? hours.map(([day, sch]) => (
                <div key={day} className="flex justify-between gap-2">
                  <span>{dayLabel(day, locale)}</span>
                  <span>{sch.open ? `${sch.startTime} – ${sch.endTime}` : S['common.closed']}</span>
                </div>
              )) : (
                <p>{ownerPreview ? OWNER_PREVIEW_EMPTY.hours : C['chrome.fallbackHours']}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-8 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
        style={{ borderTop: `1px solid ${skin.rule}` }}
        data-testid="site-footer-legal"
      >
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(['privacy', 'terms', 'cancel'] as const).map((key) => (
            <button
              key={key}
              type="button"
              data-testid={`site-legal-${key}`}
              className={skin.legalClass}
              style={{ color: skin.muted }}
              onClick={() => setLegal(key)}
            >
              {key === 'privacy' ? C['chrome.privacy'] : key === 'terms' ? C['chrome.terms'] : C['chrome.cancel']}
            </button>
          ))}
        </div>
        <p data-testid="site-footer-copyright" className={skin.legalClass}>
          © 2026 {name}. {C['chrome.copyright']} {S['common.poweredBy']}
        </p>
      </div>

      {legal && (
        <div
          data-testid="site-legal-sheet"
          className="mt-5 p-5 border"
          style={{
            borderColor: skin.rule,
            backgroundColor: 'rgba(0,0,0,0.28)',
            color: skin.text,
            borderRadius: themeId === 'barber_mens_grooming' || themeId === 'hair_studio_color_bar' ? 0 : 16,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-sm font-extrabold" style={{ color: skin.accent }}>{legalCopy[legal].title}</h3>
            <button type="button" data-testid="site-legal-close" className={skin.legalClass} onClick={() => setLegal(null)}>
              {C['chrome.legalClose']}
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: skin.muted }}>{legalCopy[legal].body}</p>
        </div>
      )}
    </footer>
  );
}
