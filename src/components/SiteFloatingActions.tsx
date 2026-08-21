import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SalonData } from '../types';
import type { ViewportMode } from '../lib/siteStructure';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { chromeText } from '../lib/siteChromeI18n';
import {
  SITE_BOOKING_CLOSE_EVENT,
  SITE_BOOKING_EVENT,
  canBookOnline,
  canCall,
  canWhatsApp,
  openSiteBooking,
  scrollSiteToTop,
} from '../lib/siteBooking';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import SiteProtectedContactAction from './SiteProtectedContactAction';
import {
  BARBER_SURFACES,
  BEAUTY_SPA_SURFACES,
  FAMILY_SURFACES,
  HAIR_STUDIO_SURFACES,
  NAIL_LASH_SURFACES,
  surfacesOf,
} from '../lib/themeSurfaces';
import { ArrowUp, CalendarCheck, MessageCircle, Phone } from 'lucide-react';

function fabSkin(themeId: SiteHeaderThemeId, appearance: 'light' | 'dark') {
  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return {
      wrap: '',
      btn: 'site-touch site-fab flex items-center justify-center border-2',
      btnStyle: { backgroundColor: t.charcoal, borderColor: t.gold, color: t.gold } as CSSProperties,
      dock: 'site-mobile-dock grid grid-cols-3 gap-px',
      dockStyle: { backgroundColor: '#0c0c0c', borderTop: `2px solid ${t.gold}` } as CSSProperties,
      dockBtn: 'site-touch flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] font-black uppercase tracking-[0.14em]',
      dockBook: { backgroundColor: t.gold, color: '#141414' } as CSSProperties,
      dockGhost: { backgroundColor: '#141414', color: t.gold } as CSSProperties,
    };
  }
  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return {
      wrap: '',
      btn: 'site-touch site-fab flex items-center justify-center rounded-full border',
      btnStyle: { backgroundColor: t.paper, borderColor: t.rose, color: t.roseDeep } as CSSProperties,
      dock: 'site-mobile-dock grid grid-cols-3 gap-2 px-2 py-2',
      dockStyle: { backgroundColor: t.paper, borderTop: `1px solid ${t.line}` } as CSSProperties,
      dockBtn: 'site-touch flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] uppercase tracking-[0.16em] font-semibold rounded-full',
      dockBook: { backgroundColor: t.rose, color: '#ffffff' } as CSSProperties,
      dockGhost: { backgroundColor: t.roseSoft, color: t.roseDeep } as CSSProperties,
    };
  }
  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return {
      wrap: '',
      btn: 'site-touch site-fab flex items-center justify-center rounded-full shadow-md',
      btnStyle: { backgroundColor: t.emerald, color: '#ffffff' } as CSSProperties,
      dock: 'site-mobile-dock grid grid-cols-3 gap-2 px-3 py-2',
      dockStyle: { backgroundColor: t.cream, borderTop: `1px solid ${t.line}` } as CSSProperties,
      dockBtn: 'site-touch flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] uppercase tracking-[0.14em] font-semibold rounded-full',
      dockBook: { backgroundColor: t.emerald, color: '#ffffff' } as CSSProperties,
      dockGhost: { backgroundColor: t.emeraldSoft, color: t.emeraldDeep } as CSSProperties,
    };
  }
  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return {
      wrap: '',
      btn: 'site-touch site-fab flex items-center justify-center rounded-xl shadow-lg',
      btnStyle: { backgroundColor: t.teal, color: '#ffffff' } as CSSProperties,
      dock: 'site-mobile-dock grid grid-cols-3 gap-2 px-3 py-2',
      dockStyle: { backgroundColor: t.navy } as CSSProperties,
      dockBtn: 'site-touch flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] font-extrabold uppercase tracking-[0.12em] rounded-xl',
      dockBook: { backgroundColor: t.teal, color: '#ffffff' } as CSSProperties,
      dockGhost: { backgroundColor: 'rgba(255,255,255,0.1)', color: '#ffffff' } as CSSProperties,
    };
  }
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  return {
    wrap: '',
    btn: 'site-touch site-fab flex items-center justify-center rounded-full shadow-lg',
    btnStyle: { backgroundImage: `linear-gradient(120deg, ${t.pink} 0%, ${t.pinkDeep} 100%)`, backgroundColor: t.pink, color: '#ffffff' } as CSSProperties,
    dock: 'site-mobile-dock grid grid-cols-3 gap-2 px-3 py-2',
    dockStyle: { backgroundColor: t.ink } as CSSProperties,
    dockBtn: 'site-touch flex flex-col items-center justify-center gap-0.5 py-2 text-[8px] font-extrabold uppercase tracking-[0.14em] rounded-full',
    dockBook: { backgroundImage: `linear-gradient(120deg, ${t.pink} 0%, ${t.pinkDeep} 100%)`, backgroundColor: t.pink, color: '#ffffff' } as CSSProperties,
    dockGhost: { backgroundColor: 'rgba(255,255,255,0.08)', color: t.pinkGlow } as CSSProperties,
  };
}

export default function SiteFloatingActions({
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
  const C = chromeText(themeId, locale);
  const skin = fabSkin(themeId, appearance);
  const [bookingOpen, setBookingOpen] = useState(false);
  const mobile = mode === 'mobile';
  const showCall = canCall(data);
  const showWa = canWhatsApp(data);

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

  if (bookingOpen) return null;

  // PHASE 10.9: mobile bottom bar is now SiteMobileActionBar.
  // Floating actions on mobile only shows Back to Top, so the two bars don't duplicate.
  // Desktop: Call, WhatsApp, Back to Top remain usable.
  if (mobile) {
    return (
      <div
        data-testid="site-floating-actions"
        data-theme={themeId}
        data-mode={mode}
        className="absolute inset-x-0 bottom-0 z-40 pointer-events-none"
      >
        <button
          type="button"
          data-testid="site-back-to-top"
          aria-label={C['chrome.backToTop']}
          onClick={scrollSiteToTop}
          className={`${skin.btn} absolute right-3 -top-14 shadow-md pointer-events-auto`}
          style={skin.btnStyle}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="site-floating-actions"
      data-theme={themeId}
      data-mode={mode}
      className="absolute right-3 bottom-6 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {showCall && (
        <SiteProtectedContactAction
          action="call"
          data={data}
          themeId={themeId}
          testId="site-fab-call"
          ariaLabel={C['chrome.call']}
          className={`${skin.btn} pointer-events-auto`}
          style={skin.btnStyle}
          showLockIcon={false}
        >
          <Phone className="w-4 h-4" />
        </SiteProtectedContactAction>
      )}
      {showWa && (
        <SiteProtectedContactAction
          action="whatsapp"
          data={data}
          themeId={themeId}
          testId="site-fab-whatsapp"
          ariaLabel={C['chrome.whatsapp']}
          className={`${skin.btn} pointer-events-auto`}
          style={skin.btnStyle}
          showLockIcon={false}
        >
          <MessageCircle className="w-4 h-4" />
        </SiteProtectedContactAction>
      )}
      <button
        type="button"
        data-testid="site-back-to-top"
        aria-label={C['chrome.backToTop']}
        onClick={scrollSiteToTop}
        className={`${skin.btn} pointer-events-auto`}
        style={skin.btnStyle}
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
}
