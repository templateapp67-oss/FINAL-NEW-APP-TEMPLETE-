/**
 * PHASE 10.9 — mobile quick-action system
 *
 * Bottom sticky bar: Call Now | WhatsApp | Directions | Book
 *
 * - Mobile-first, hidden on desktop (mode !== 'mobile')
 * - Remains accessible while scrolling (absolute overlay)
 * - Respects safe-area/insets (env(safe-area-inset-bottom))
 * - Does not cover content (spacer handled by renderers/CSS)
 * - Uses existing phone, WhatsApp, saved location data
 * - Directions opens existing saved salon location (maps href)
 * - Book opens existing booking flow (openSiteBooking)
 * - Large touch-friendly (min 44px, py-3, icons + labels)
 * - Theme-specific visual styling
 * - EN/HI + Light/Dark support
 *
 * No duplicate booking/contact logic, no invented data.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SalonData } from '../types';
import type { ViewportMode } from '../lib/siteStructure';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { mobileBarText } from '../lib/siteMobileBarI18n';
import {
  SITE_BOOKING_CLOSE_EVENT,
  SITE_BOOKING_EVENT,
  canBookOnline,
  canCall,
  canWhatsApp,
  hasSalonAddress,
  openSiteBooking,
  salonMapsHref,
} from '../lib/siteBooking';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import SiteProtectedContactAction from './SiteProtectedContactAction';
import { useIsOwnerPreview } from './SiteRenderContext';
import {
  BARBER_SURFACES,
  BEAUTY_SPA_SURFACES,
  FAMILY_SURFACES,
  HAIR_STUDIO_SURFACES,
  NAIL_LASH_SURFACES,
  surfacesOf,
} from '../lib/themeSurfaces';
import { CalendarCheck, MapPin, MessageCircle, Phone } from 'lucide-react';

type Skin = {
  containerClass: string;
  containerStyle: CSSProperties;
  buttonBase: string;
  callStyle: CSSProperties;
  waStyle: CSSProperties;
  dirStyle: CSSProperties;
  bookStyle: CSSProperties;
  iconSize: string;
};

function skinOf(themeId: SiteHeaderThemeId, appearance: 'light' | 'dark'): Skin {
  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return {
      containerClass:
        'site-mobile-action-bar grid grid-cols-4 divide-x border-t-2 shadow-[0_-8px_24px_rgba(0,0,0,0.25)]',
      containerStyle: {
        backgroundColor: appearance === 'dark' ? '#0c0c0c' : '#fdfaf1',
        borderColor: t.gold,
        // @ts-ignore divider color
        borderTopColor: t.gold,
      } as CSSProperties,
      buttonBase:
        'site-touch flex flex-col items-center justify-center gap-1 py-3 px-1 text-[10px] font-black uppercase tracking-[0.12em] min-h-[64px]',
      callStyle: {
        backgroundColor: appearance === 'dark' ? '#141414' : '#f5efe0',
        color: appearance === 'dark' ? t.gold : '#1b1a17',
      },
      waStyle: {
        backgroundColor: appearance === 'dark' ? '#141414' : '#f5efe0',
        color: appearance === 'dark' ? t.gold : '#1b1a17',
      },
      dirStyle: {
        backgroundColor: appearance === 'dark' ? '#141414' : '#f5efe0',
        color: appearance === 'dark' ? t.gold : '#1b1a17',
      },
      bookStyle: {
        backgroundColor: t.gold,
        color: '#141414',
      },
      iconSize: 'w-[18px] h-[18px]',
    };
  }
  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return {
      containerClass:
        'site-mobile-action-bar grid grid-cols-4 gap-2 px-2 border-t backdrop-blur-md shadow-[0_-6px_20px_rgba(0,0,0,0.06)]',
      containerStyle: {
        backgroundColor: appearance === 'dark' ? 'rgba(25,24,23,0.96)' : 'rgba(250,248,245,0.96)',
        borderColor: t.line,
      },
      buttonBase:
        'site-touch flex flex-col items-center justify-center gap-1 py-3 rounded-full text-[9px] uppercase tracking-[0.16em] font-semibold min-h-[60px]',
      callStyle: {
        backgroundColor: appearance === 'dark' ? 'rgba(216,160,168,0.14)' : t.roseSoft,
        color: appearance === 'dark' ? t.roseBright : t.roseDeep,
      },
      waStyle: {
        backgroundColor: appearance === 'dark' ? 'rgba(216,160,168,0.14)' : t.roseSoft,
        color: appearance === 'dark' ? t.roseBright : t.roseDeep,
      },
      dirStyle: {
        backgroundColor: appearance === 'dark' ? 'rgba(216,160,168,0.14)' : t.roseSoft,
        color: appearance === 'dark' ? t.roseBright : t.roseDeep,
      },
      bookStyle: {
        backgroundColor: t.rose,
        color: '#ffffff',
      },
      iconSize: 'w-[18px] h-[18px]',
    };
  }
  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return {
      containerClass:
        'site-mobile-action-bar grid grid-cols-4 gap-2 px-3 border-t backdrop-blur-md',
      containerStyle: {
        backgroundColor: appearance === 'dark' ? 'rgba(19,48,40,0.96)' : 'rgba(255,255,255,0.96)',
        borderColor: t.line,
      },
      buttonBase:
        'site-touch flex flex-col items-center justify-center gap-1 py-3 rounded-2xl text-[9px] uppercase tracking-[0.16em] font-semibold min-h-[64px]',
      callStyle: {
        backgroundColor: appearance === 'dark' ? 'rgba(255,255,255,0.08)' : t.emeraldSoft,
        color: appearance === 'dark' ? '#cfe3dd' : t.emeraldDeep,
      },
      waStyle: {
        backgroundColor: appearance === 'dark' ? 'rgba(255,255,255,0.08)' : t.emeraldSoft,
        color: appearance === 'dark' ? '#cfe3dd' : t.emeraldDeep,
      },
      dirStyle: {
        backgroundColor: appearance === 'dark' ? 'rgba(255,255,255,0.08)' : t.emeraldSoft,
        color: appearance === 'dark' ? '#cfe3dd' : t.emeraldDeep,
      },
      bookStyle: {
        backgroundColor: t.emerald,
        color: '#ffffff',
      },
      iconSize: 'w-[18px] h-[18px]',
    };
  }
  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return {
      containerClass:
        'site-mobile-action-bar grid grid-cols-4 gap-2 px-3 border-t shadow-[0_-8px_24px_rgba(0,0,0,0.18)]',
      containerStyle: {
        backgroundColor: t.navy,
        borderColor: 'rgba(255,255,255,0.12)',
      },
      buttonBase:
        'site-touch flex flex-col items-center justify-center gap-1 py-3 rounded-xl text-[9px] font-extrabold uppercase tracking-[0.12em] min-h-[64px]',
      callStyle: {
        backgroundColor: 'rgba(255,255,255,0.10)',
        color: '#ffffff',
      },
      waStyle: {
        backgroundColor: 'rgba(255,255,255,0.10)',
        color: '#ffffff',
      },
      dirStyle: {
        backgroundColor: 'rgba(255,255,255,0.10)',
        color: '#ffffff',
      },
      bookStyle: {
        backgroundColor: t.teal,
        color: '#ffffff',
      },
      iconSize: 'w-[18px] h-[18px]',
    };
  }
  // nail_lash_studio
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  return {
    containerClass:
      'site-mobile-action-bar grid grid-cols-4 gap-2 px-3 border-t backdrop-blur-md shadow-[0_-8px_28px_rgba(0,0,0,0.30)]',
    containerStyle: {
      backgroundColor: appearance === 'dark' ? 'rgba(33,27,36,0.96)' : 'rgba(33,27,36,0.96)',
      borderColor: 'rgba(255,45,141,0.20)',
    },
    buttonBase:
      'site-touch flex flex-col items-center justify-center gap-1 py-3 rounded-full text-[8px] font-extrabold uppercase tracking-[0.14em] min-h-[64px]',
    callStyle: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      color: t.pinkGlow,
    },
    waStyle: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      color: t.pinkGlow,
    },
    dirStyle: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      color: t.pinkGlow,
    },
    bookStyle: {
      backgroundImage: `linear-gradient(120deg, ${t.pink} 0%, ${t.pinkDeep} 100%)`,
      backgroundColor: t.pink,
      color: '#ffffff',
    },
    iconSize: 'w-[18px] h-[18px]',
  };
}

export default function SiteMobileActionBar({
  themeId,
  data,
  mode,
}: {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  mode: ViewportMode;
}) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const ownerPreview = useIsOwnerPreview();
  const T = mobileBarText(themeId, locale);
  const skin = skinOf(themeId, appearance);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    const on = () => setBookingOpen(true);
    const off = () => setBookingOpen(false);
    window.addEventListener(SITE_BOOKING_EVENT, on);
    window.addEventListener(SITE_BOOKING_CLOSE_EVENT, off);
    return () => {
      window.removeEventListener(SITE_BOOKING_EVENT, on);
      window.removeEventListener(SITE_BOOKING_CLOSE_EVENT, off);
    };
  }, []);

  if (mode !== 'mobile') return null;
  if (bookingOpen) return null;

  const showCall = canCall(data);
  const showWa = canWhatsApp(data);
  const showBook = canBookOnline(data);
  // Public sites retain the existing product fallback. In an owner preview,
  // however, Directions must only resolve from the owner's saved address.
  const showDir = !ownerPreview || hasSalonAddress(data, true);
  const mapsHref = salonMapsHref(data, ownerPreview);

  return (
    <div
      data-testid="site-mobile-action-bar"
      data-theme={themeId}
      data-mode={mode}
      data-locale={locale}
      data-appearance={appearance}
      className="absolute inset-x-0 bottom-0 z-50"
      // Ensure safe-area is respected and bar stays above iOS home indicator
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' } as CSSProperties}
    >
      <nav
        aria-label="Quick actions"
        data-testid="site-mobile-bar-nav"
        className={skin.containerClass}
        style={{
          ...skin.containerStyle,
          // Additional safe-area handling inside
          paddingBottom: `max(0.65rem, env(safe-area-inset-bottom, 0px))`,
          paddingTop: '0.5rem',
        }}
      >
        {showCall ? (
          <SiteProtectedContactAction
            action="call"
            data={data}
            themeId={themeId}
            testId="site-mobile-bar-call"
            className={skin.buttonBase}
            style={skin.callStyle}
            ariaLabel={T.callNow}
            showLockIcon={false}
          >
            <Phone className={skin.iconSize} />
            <span className="leading-none text-center">{T.callNowShort}</span>
          </SiteProtectedContactAction>
        ) : (
          <span
            data-testid="site-mobile-bar-call-disabled"
            className={`${skin.buttonBase} opacity-40`}
            style={skin.callStyle}
            aria-hidden
          >
            <Phone className={skin.iconSize} />
            <span className="leading-none text-center">{T.callNowShort}</span>
          </span>
        )}

        {showWa ? (
          <SiteProtectedContactAction
            action="whatsapp"
            data={data}
            themeId={themeId}
            testId="site-mobile-bar-whatsapp"
            className={skin.buttonBase}
            style={skin.waStyle}
            ariaLabel={T.whatsapp}
            showLockIcon={false}
          >
            <MessageCircle className={skin.iconSize} />
            <span className="leading-none text-center">{T.whatsapp}</span>
          </SiteProtectedContactAction>
        ) : (
          <span
            data-testid="site-mobile-bar-whatsapp-disabled"
            className={`${skin.buttonBase} opacity-40`}
            style={skin.waStyle}
            aria-hidden
          >
            <MessageCircle className={skin.iconSize} />
            <span className="leading-none text-center">{T.whatsapp}</span>
          </span>
        )}

        {showDir ? (
          <a
            href={mapsHref}
            target={mapsHref.startsWith('http') ? '_blank' : undefined}
            rel={mapsHref.startsWith('http') ? 'noreferrer' : undefined}
            data-testid="site-mobile-bar-directions"
            data-action="directions"
            className={skin.buttonBase}
            style={skin.dirStyle}
            aria-label={T.directions}
          >
            <MapPin className={skin.iconSize} />
            <span className="leading-none text-center">{T.directions}</span>
          </a>
        ) : (
          <span
            data-testid="site-mobile-bar-directions-disabled"
            className={`${skin.buttonBase} opacity-40`}
            style={skin.dirStyle}
            aria-hidden
          >
            <MapPin className={skin.iconSize} />
            <span className="leading-none text-center">{T.directions}</span>
          </span>
        )}

        {showBook ? (
          <button
            type="button"
            data-testid="site-mobile-bar-book"
            data-open-booking="true"
            data-action="book"
            onClick={openSiteBooking}
            className={skin.buttonBase}
            style={skin.bookStyle}
            aria-label={T.bookNow}
          >
            <CalendarCheck className={skin.iconSize} />
            <span className="leading-none text-center">{T.book}</span>
          </button>
        ) : (
          <span
            data-testid="site-mobile-bar-book-disabled"
            className={`${skin.buttonBase} opacity-40`}
            style={skin.bookStyle}
            aria-hidden
          >
            <CalendarCheck className={skin.iconSize} />
            <span className="leading-none text-center">{T.book}</span>
          </span>
        )}
      </nav>
    </div>
  );
}
