import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SalonData, WebsiteAppearance } from '../types';
import { getSalonNameStyle } from '../lib/brandIdentity';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '../lib/locale';
import type { AppLocale } from '../lib/locale';
import {
  BARBER_THEME,
  BEAUTY_SPA_THEME,
  FAMILY_FULL_SERVICE_THEME,
  HAIR_STUDIO_THEME,
  NAIL_LASH_STUDIO_THEME,
} from '../lib/themeServices';
import {
  BOOK_APPOINTMENT_TARGET,
  SITE_APPEARANCE_EVENT,
  SITE_HEADER_LABELS,
  SITE_LOCALE_EVENT,
  SITE_NAV_LABELS,
  buildSiteNavItems,
  readSiteAppearance,
  readSiteLocale,
  scrollToSiteSection,
  setSiteAppearance,
  setSiteLocale,
} from '../lib/siteNavigation';
import type { SiteAppearance, SiteHeaderThemeId, SiteNavItem } from '../lib/siteNavigation';
import { useAuth, signOut } from '../lib/useAuth';
import { useAuthModalOptional } from './AuthModalProvider';
import { openSiteBooking } from '../lib/siteBooking';
import { OWNER_PREVIEW_EMPTY } from '../lib/ownerPreview';
import { publicSalonAuthContinuation } from '../lib/authRedirect';
import { useIsOwnerPreview } from './SiteRenderContext';
import { LogIn, LogOut, User as UserIcon, CalendarCheck2 } from 'lucide-react';
import {
  ArrowRight,
  Globe,
  Leaf,
  Menu,
  Moon,
  Scissors,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react';

interface Props {
  /** One of the five database-backed theme ids. */
  themeId: SiteHeaderThemeId;
  data: SalonData;
  mode: 'desktop' | 'mobile';
}

/* --------------------------------------------------------------------- */
/* Preference hooks — subscribed by headers AND renderers so Language /  */
/* Dark Mode changes repaint localized service content too.              */
/* --------------------------------------------------------------------- */

/** Current header/site locale; re-renders whenever the visitor switches. */
export function useSiteLocale(): AppLocale {
  const [locale, setLocale] = useState<AppLocale>(() => readSiteLocale());
  useEffect(() => {
    const sync = () => setLocale(readSiteLocale());
    window.addEventListener(SITE_LOCALE_EVENT, sync);
    return () => window.removeEventListener(SITE_LOCALE_EVENT, sync);
  }, []);
  return locale;
}

/**
 * PHASE 10.2 — subscribes a whole renderer to the global Dark Mode control.
 * Returns the active appearance; the barber theme is dark by design, the
 * other four default to light. The site-wide toggle/ persistence lives in
 * `siteNavigation.ts`. */
export function useThemeAppearance(themeId: SiteHeaderThemeId): SiteAppearance {
  const themeDefault: SiteAppearance = themeId === 'barber_mens_grooming' ? 'dark' : 'light';
  const [appearance] = useSiteAppearance(undefined, themeDefault);
  return appearance;
}

/**
 * Site appearance ('light' | 'dark') for the header chrome and its toggle.
 * Priority: explicit visitor toggle (persisted) → owner's websiteAppearance →
 * per-theme design default (the barber theme is dark by design).
 */
export function useSiteAppearance(
  ownerDefault: WebsiteAppearance | undefined,
  themeDefault: SiteAppearance,
): [SiteAppearance, () => void] {
  const [appearance, setAppearance] = useState<SiteAppearance>(() =>
    readSiteAppearance(ownerDefault, themeDefault),
  );
  useEffect(() => {
    const sync = () => setAppearance(readSiteAppearance(ownerDefault, themeDefault));
    window.addEventListener(SITE_APPEARANCE_EVENT, sync);
    return () => window.removeEventListener(SITE_APPEARANCE_EVENT, sync);
  }, [ownerDefault, themeDefault]);
  const toggle = useCallback(() => {
    setSiteAppearance(readSiteAppearance(ownerDefault, themeDefault) === 'dark' ? 'light' : 'dark');
  }, [ownerDefault, themeDefault]);
  return [appearance, toggle];
}

/* --------------------------------------------------------------------- */
/* Per-theme design tokens. Navigation STRUCTURE is shared; every visual */
/* below is intentionally different per theme.                           */
/* --------------------------------------------------------------------- */

type Design = {
  /** Sticky offset for the whole header (the beauty pill floats with a gap). */
  stickyClass: string;
  /** Bar (the sticky row). */
  barClass: string;
  barStyle: (a: SiteAppearance) => CSSProperties;
  /** Optional utility strip above the bar (kept from the original themes). */
  utilityStrip?: (a: SiteAppearance) => ReactNode;
  /** Brand lockup (logo mark + salon name). */
  brand: (data: SalonData, a: SiteAppearance) => ReactNode;
  /** Desktop nav link. */
  linkClass: string;
  linkStyle: (a: SiteAppearance, active: boolean) => CSSProperties;
  /** Desktop Book Appointment CTA. */
  bookClass: string;
  bookStyle: (a: SiteAppearance) => CSSProperties;
  bookSuffix?: ReactNode;
  /** Language segmented control. */
  langWrapClass: string;
  langWrapStyle: (a: SiteAppearance) => CSSProperties;
  langOptionClass: string;
  langOptionStyle: (a: SiteAppearance, active: boolean) => CSSProperties;
  /** Dark mode toggle button. */
  modeButtonClass: string;
  modeButtonStyle: (a: SiteAppearance) => CSSProperties;
  modeIconColor: (a: SiteAppearance) => string;
  /** Hamburger button. */
  menuButtonClass: string;
  menuButtonStyle: (a: SiteAppearance) => CSSProperties;
  /** Mobile drawer. */
  drawerClass: string;
  drawerStyle: (a: SiteAppearance) => CSSProperties;
  drawerRowClass: string;
  drawerRowStyle: (a: SiteAppearance, active: boolean) => CSSProperties;
  drawerRowPrefix?: (index: string, a: SiteAppearance, active: boolean) => ReactNode;
  drawerRowSuffix?: (a: SiteAppearance) => ReactNode;
  drawerMetaClass: string;
  drawerMetaStyle: (a: SiteAppearance) => CSSProperties;
  drawerBookClass: string;
  drawerBookStyle: (a: SiteAppearance) => CSSProperties;
  /** Default appearance when neither visitor nor owner chose one. */
  defaultAppearance: SiteAppearance;
};

const B = BARBER_THEME;
const H = HAIR_STUDIO_THEME;
const S = BEAUTY_SPA_THEME;
const F = FAMILY_FULL_SERVICE_THEME;
const N = NAIL_LASH_STUDIO_THEME;

const DESIGNS: Record<SiteHeaderThemeId, Design> = {
  /* ---------------------------------------------------------------- */
  /* 1 · BARBER — hard charcoal slab, gold rules, uppercase engraving. */
  /* ---------------------------------------------------------------- */
  barber_mens_grooming: {
    defaultAppearance: 'dark',
    stickyClass: 'top-0',
    barClass: 'backdrop-blur-md border-b-2',
    barStyle: (a) =>
      a === 'dark'
        ? { backgroundColor: 'rgba(12,12,12,0.97)', borderColor: B.gold }
        : { backgroundColor: 'rgba(245,239,224,0.97)', borderColor: '#b19123' },
    brand: (data, a) => {
      const nameStyle = { ...getSalonNameStyle(data) };
      if (!nameStyle.color) nameStyle.color = a === 'dark' ? B.cream : '#1b1a17';
      return (
        <div className="flex items-center gap-2.5 min-w-0">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="Logo" className="h-8 w-auto object-contain max-w-[110px]" />
          ) : (
            <div
              className="w-9 h-9 flex items-center justify-center border-2 shrink-0"
              style={{ borderColor: B.gold, backgroundColor: a === 'dark' ? 'transparent' : B.goldSoft }}
            >
              <Scissors className="w-4 h-4" style={{ color: B.gold }} />
            </div>
          )}
          <div className="leading-tight min-w-0">
            <span className="block text-sm md:text-base font-black uppercase tracking-[0.18em] truncate" style={nameStyle}>
              {data.salonName || 'The Grooming Co.'}
            </span>
            <span
              className="block text-[8px] uppercase tracking-[0.4em] font-semibold"
              style={{ color: a === 'dark' ? B.muted : '#6e6552' }}
            >
              Barber · Grooming Lounge
            </span>
          </div>
        </div>
      );
    },
    linkClass: 'px-1.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] border-b-2 border-transparent transition-colors',
    linkStyle: (a, active) => ({
      color: active ? B.gold : a === 'dark' ? '#d4d4d0' : '#3a352c',
      borderColor: active ? B.gold : 'transparent',
    }),
    bookClass: 'px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all hover:brightness-110 active:scale-95',
    bookStyle: () => ({ backgroundColor: B.gold, color: '#141414' }),
    langWrapClass: 'flex items-stretch border',
    langWrapStyle: (a) => ({ borderColor: a === 'dark' ? 'rgba(201,162,39,0.45)' : '#b19123' }),
    langOptionClass: 'px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] transition-colors',
    langOptionStyle: (a, active) =>
      active
        ? { backgroundColor: B.gold, color: '#141414' }
        : { backgroundColor: 'transparent', color: a === 'dark' ? B.muted : '#6e6552' },
    modeButtonClass: 'p-2 border transition-colors',
    modeButtonStyle: (a) => ({ borderColor: a === 'dark' ? 'rgba(201,162,39,0.45)' : '#b19123' }),
    modeIconColor: () => B.gold,
    menuButtonClass: 'p-2 border transition-colors',
    menuButtonStyle: (a) => ({ borderColor: a === 'dark' ? 'rgba(201,162,39,0.45)' : '#b19123' }),
    drawerClass: 'border-b-2',
    drawerStyle: (a) => ({
      backgroundColor: a === 'dark' ? '#101010' : B.cream,
      borderColor: B.gold,
    }),
    drawerRowClass: 'w-full flex items-center justify-between px-6 py-3.5 border-b text-left text-[11px] font-black uppercase tracking-[0.2em] transition-colors',
    drawerRowStyle: (a, active) => ({
      borderColor: a === 'dark' ? '#232323' : 'rgba(177,145,35,0.25)',
      color: active ? B.gold : a === 'dark' ? '#d4d4d0' : '#3a352c',
      backgroundColor: active ? (a === 'dark' ? 'rgba(201,162,39,0.08)' : 'rgba(201,162,39,0.12)') : 'transparent',
    }),
    drawerRowPrefix: (index, a, active) => (
      <span
        className="mr-3 text-[9px] font-black"
        style={{ color: active ? B.gold : a === 'dark' ? '#55534c' : '#a08c4f' }}
      >
        {index}
      </span>
    ),
    drawerMetaClass: 'text-[9px] font-black uppercase tracking-[0.25em]',
    drawerMetaStyle: (a) => ({ color: a === 'dark' ? B.muted : '#6e6552' }),
    drawerBookClass: 'w-full py-3.5 text-[11px] font-black uppercase tracking-[0.22em] transition-all hover:brightness-110 active:scale-[0.99]',
    drawerBookStyle: () => ({ backgroundColor: B.gold, color: '#141414' }),
  },

  /* ---------------------------------------------------------------- */
  /* 2 · HAIR STUDIO — editorial hairlines, serif mark, rose-gold ink. */
  /* ---------------------------------------------------------------- */
  hair_studio_color_bar: {
    defaultAppearance: 'light',
    stickyClass: 'top-0',
    barClass: 'backdrop-blur-md border-b',
    barStyle: (a) =>
      a === 'dark'
        ? { backgroundColor: 'rgba(25,24,23,0.94)', borderColor: H.inkSoft }
        : { backgroundColor: 'rgba(250,248,245,0.92)', borderColor: H.line },
    brand: (data, a) => {
      const nameStyle = { ...getSalonNameStyle(data) };
      if (!nameStyle.color) nameStyle.color = a === 'dark' ? '#faf8f5' : H.ink;
      return (
        <div className="flex items-center gap-3 min-w-0">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="Logo" className="h-8 w-auto object-contain max-w-[120px]" />
          ) : (
            <Scissors className="w-4 h-4 shrink-0" style={{ color: a === 'dark' ? H.roseBright : H.rose }} />
          )}
          <div className="leading-tight min-w-0">
            <span className="block text-base md:text-lg font-serif tracking-wide truncate" style={nameStyle}>
              {data.salonName || 'Atelier Hair Studio'}
            </span>
            <span
              className="block text-[8px] uppercase tracking-[0.4em] font-medium"
              style={{ color: a === 'dark' ? '#a39d97' : H.muted }}
            >
              Hair Studio · Color Bar
            </span>
          </div>
        </div>
      );
    },
    linkClass: 'pb-1 text-[10px] font-medium uppercase tracking-[0.2em] border-b transition-colors',
    linkStyle: (a, active) => ({
      color: active ? (a === 'dark' ? H.roseBright : H.roseDeep) : a === 'dark' ? '#cfcac4' : '#6f6a65',
      borderColor: active ? (a === 'dark' ? H.roseBright : H.roseDeep) : 'transparent',
    }),
    bookClass: 'px-5 py-2 text-[10px] uppercase tracking-[0.22em] font-semibold border transition-colors',
    bookStyle: (a) => ({
      borderColor: a === 'dark' ? H.roseBright : H.rose,
      color: a === 'dark' ? H.roseBright : H.rose,
      backgroundColor: 'transparent',
    }),
    langWrapClass: 'flex items-center gap-1.5',
    langWrapStyle: () => ({}),
    langOptionClass: 'text-[9px] font-semibold uppercase tracking-[0.2em] pb-0.5 border-b transition-colors',
    langOptionStyle: (a, active) => ({
      color: active ? (a === 'dark' ? H.roseBright : H.roseDeep) : a === 'dark' ? '#8f8984' : H.muted,
      borderColor: active ? (a === 'dark' ? H.roseBright : H.roseDeep) : 'transparent',
    }),
    modeButtonClass: 'p-2 transition-colors',
    modeButtonStyle: () => ({}),
    modeIconColor: (a) => (a === 'dark' ? H.roseBright : H.roseDeep),
    menuButtonClass: 'p-2 border transition-colors',
    menuButtonStyle: (a) => ({ borderColor: a === 'dark' ? H.inkSoft : H.line }),
    drawerClass: 'border-b',
    drawerStyle: (a) => ({ backgroundColor: a === 'dark' ? '#1e1c1b' : H.paper, borderColor: a === 'dark' ? H.inkSoft : H.line }),
    drawerRowClass: 'w-full flex items-baseline gap-4 px-8 py-3.5 border-b text-left text-[10px] font-medium uppercase tracking-[0.24em] transition-colors',
    drawerRowStyle: (a, active) => ({
      borderColor: a === 'dark' ? '#292624' : H.line,
      color: active ? (a === 'dark' ? H.roseBright : H.roseDeep) : a === 'dark' ? '#d9d4ce' : '#4c4742',
    }),
    drawerRowPrefix: (index, a) => (
      <span className="text-[9px] font-serif italic" style={{ color: a === 'dark' ? '#7d7671' : H.muted }}>
        {index}
      </span>
    ),
    drawerMetaClass: 'text-[9px] font-medium uppercase tracking-[0.3em]',
    drawerMetaStyle: (a) => ({ color: a === 'dark' ? '#8f8984' : H.muted }),
    drawerBookClass: 'w-full py-3.5 text-[10px] uppercase tracking-[0.28em] font-semibold border transition-colors',
    drawerBookStyle: (a) => ({ borderColor: a === 'dark' ? H.roseBright : H.rose, color: a === 'dark' ? H.roseBright : H.roseDeep, backgroundColor: a === 'dark' ? 'rgba(216,160,168,0.08)' : H.roseSoft }),
  },

  /* ----------------------------------------------------------------- */
  /* 3 · BEAUTY SPA — floating soft pill, emerald wash, rounded forms. */
  /* ----------------------------------------------------------------- */
  beauty_skin_spa: {
    defaultAppearance: 'light',
    stickyClass: 'top-2',
    barClass: 'mx-2 rounded-full border shadow-sm backdrop-blur-md',
    barStyle: (a) =>
      a === 'dark'
        ? { backgroundColor: 'rgba(21,89,74,0.95)', borderColor: 'rgba(255,255,255,0.14)' }
        : { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: S.line },
    brand: (data, a) => {
      const nameStyle = { ...getSalonNameStyle(data) };
      if (!nameStyle.color) nameStyle.color = a === 'dark' ? '#fbf9f5' : S.emeraldDeep;
      return (
        <div className="flex items-center gap-3 min-w-0 pl-1">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="Logo" className="h-8 w-auto object-contain max-w-[120px]" />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: a === 'dark' ? 'rgba(255,255,255,0.14)' : S.emeraldSoft }}
            >
              <Leaf className="w-4 h-4" style={{ color: a === 'dark' ? '#bfe3d6' : S.emerald }} />
            </div>
          )}
          <div className="leading-tight min-w-0">
            <span className="block text-base md:text-lg font-serif tracking-wide truncate" style={nameStyle}>
              {data.salonName || 'Serenity Beauty & Spa'}
            </span>
            <span
              className="block text-[8px] uppercase tracking-[0.4em] font-medium"
              style={{ color: a === 'dark' ? 'rgba(255,255,255,0.55)' : S.muted }}
            >
              Beauty · Skin · Spa
            </span>
          </div>
        </div>
      );
    },
    linkClass: 'px-3 py-2 rounded-full text-[10px] font-medium uppercase tracking-[0.18em] transition-colors',
    linkStyle: (a, active) => ({
      color: active ? (a === 'dark' ? '#ffffff' : S.emerald) : a === 'dark' ? 'rgba(255,255,255,0.72)' : S.muted,
      backgroundColor: active ? (a === 'dark' ? 'rgba(255,255,255,0.14)' : S.emeraldSoft) : 'transparent',
    }),
    bookClass: 'px-6 py-2.5 rounded-full text-[10px] uppercase tracking-[0.2em] font-semibold text-white transition-all hover:brightness-105 shadow-md active:scale-95',
    bookStyle: () => ({ backgroundColor: S.emerald }),
    langWrapClass: 'flex items-center rounded-full p-0.5',
    langWrapStyle: (a) => ({ backgroundColor: a === 'dark' ? 'rgba(255,255,255,0.12)' : S.emeraldSoft }),
    langOptionClass: 'px-2.5 py-1 rounded-full text-[9px] font-semibold uppercase tracking-[0.14em] transition-colors',
    langOptionStyle: (a, active) =>
      active
        ? { backgroundColor: a === 'dark' ? '#0f3f33' : '#ffffff', color: a === 'dark' ? '#cfe3dd' : S.emerald, boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
        : { color: a === 'dark' ? 'rgba(255,255,255,0.6)' : S.muted },
    modeButtonClass: 'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
    modeButtonStyle: (a) => ({ backgroundColor: a === 'dark' ? 'rgba(255,255,255,0.12)' : S.emeraldSoft }),
    modeIconColor: (a) => (a === 'dark' ? '#cfe3dd' : S.emerald),
    menuButtonClass: 'w-9 h-9 rounded-full flex items-center justify-center transition-colors',
    menuButtonStyle: (a) => ({ backgroundColor: a === 'dark' ? 'rgba(255,255,255,0.12)' : S.emeraldSoft }),
    drawerClass: 'mx-2 mt-1 rounded-3xl border shadow-lg overflow-hidden',
    drawerStyle: (a) => ({ backgroundColor: a === 'dark' ? '#15594a' : S.cream, borderColor: a === 'dark' ? 'rgba(255,255,255,0.14)' : S.line }),
    drawerRowClass: 'w-11/12 mx-auto text-center rounded-full py-3 text-[10px] font-semibold uppercase tracking-[0.22em] transition-colors',
    drawerRowStyle: (a, active) => ({
      color: active ? (a === 'dark' ? '#15594a' : '#ffffff') : a === 'dark' ? 'rgba(255,255,255,0.78)' : S.text,
      backgroundColor: active ? (a === 'dark' ? '#e2f0ea' : S.emerald) : 'transparent',
    }),
    drawerMetaClass: 'text-[9px] font-semibold uppercase tracking-[0.28em] text-center',
    drawerMetaStyle: (a) => ({ color: a === 'dark' ? 'rgba(255,255,255,0.55)' : S.muted }),
    drawerBookClass: 'w-full py-3.5 rounded-full text-[10px] uppercase tracking-[0.24em] font-semibold text-white transition-all hover:brightness-105',
    drawerBookStyle: () => ({ backgroundColor: S.emerald }),
  },

  /* --------------------------------------------------------------- */
  /* 4 · FAMILY — navy utility strip + bright white wayfinding bar.   */
  /* --------------------------------------------------------------- */
  family_full_service: {
    defaultAppearance: 'light',
    stickyClass: 'top-0',
    barClass: 'backdrop-blur-md border-b',
    barStyle: (a) =>
      a === 'dark'
        ? { backgroundColor: 'rgba(7,27,46,0.96)', borderColor: 'rgba(255,255,255,0.14)' }
        : { backgroundColor: 'rgba(255,255,255,0.94)', borderColor: F.line },
    utilityStrip: (a) => (
      <div
        className="px-5 md:px-8 py-2 flex items-center justify-between text-[9px] font-bold"
        style={{ backgroundColor: a === 'dark' ? '#071b2e' : F.navy, color: 'rgba(255,255,255,0.76)' }}
      >
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" style={{ color: F.sun }} /> Easy bookings for every generation
        </span>
        <span className="hidden sm:inline">Open 7 days · Walk-ins welcome</span>
      </div>
    ),
    brand: (data, a) => {
      const nameStyle = { ...getSalonNameStyle(data) };
      if (!nameStyle.color) nameStyle.color = a === 'dark' ? '#ffffff' : F.navy;
      return (
        <div className="flex items-center gap-2.5 min-w-0">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="Logo" className="h-8 w-auto max-w-[110px] object-contain" />
          ) : (
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: a === 'dark' ? 'rgba(205,234,255,0.14)' : F.tealSoft, color: a === 'dark' ? F.skyDeep : F.tealDeep }}
            >
              <Users className="w-5 h-5" />
            </span>
          )}
          <span className="font-extrabold text-sm md:text-base truncate" style={nameStyle}>
            {data.salonName || 'The Family Salon'}
          </span>
        </div>
      );
    },
    linkClass: 'px-2.5 py-2 rounded-lg text-[10px] font-extrabold transition-colors',
    linkStyle: (a, active) => ({
      color: active ? (a === 'dark' ? F.skyDeep : F.blue) : a === 'dark' ? 'rgba(255,255,255,0.72)' : F.muted,
      backgroundColor: active ? (a === 'dark' ? 'rgba(205,234,255,0.12)' : F.sky) : 'transparent',
    }),
    bookClass: 'rounded-xl px-4 py-2.5 flex items-center gap-1.5 text-[10px] font-extrabold transition-all hover:brightness-105 active:scale-95',
    bookStyle: () => ({ backgroundColor: F.blue, color: F.white }),
    bookSuffix: <ArrowRight className="w-3.5 h-3.5" />,
    langWrapClass: 'flex items-center gap-0.5 rounded-lg border p-0.5',
    langWrapStyle: (a) => ({ borderColor: a === 'dark' ? 'rgba(255,255,255,0.2)' : F.line, backgroundColor: a === 'dark' ? 'rgba(255,255,255,0.06)' : '#f7fcff' }),
    langOptionClass: 'px-2 py-1 rounded-md text-[9px] font-extrabold transition-colors',
    langOptionStyle: (a, active) =>
      active
        ? { backgroundColor: a === 'dark' ? F.skyDeep : F.sky, color: a === 'dark' ? '#071b2e' : F.blue }
        : { color: a === 'dark' ? 'rgba(255,255,255,0.6)' : F.muted },
    modeButtonClass: 'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
    modeButtonStyle: (a) => ({ backgroundColor: a === 'dark' ? 'rgba(255,209,102,0.16)' : F.sunSoft }),
    modeIconColor: (a) => (a === 'dark' ? F.sun : F.blue),
    menuButtonClass: 'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
    menuButtonStyle: (a) => ({ backgroundColor: a === 'dark' ? 'rgba(255,255,255,0.1)' : F.sky }),
    drawerClass: 'border-b shadow-lg',
    drawerStyle: (a) => ({ backgroundColor: a === 'dark' ? '#0a2438' : '#ffffff', borderColor: a === 'dark' ? 'rgba(255,255,255,0.12)' : F.line }),
    drawerRowClass: 'w-full flex items-center justify-between px-5 py-3 rounded-xl text-left text-[11px] font-extrabold transition-colors',
    drawerRowStyle: (a, active) => ({
      color: active ? (a === 'dark' ? '#071b2e' : F.white) : a === 'dark' ? 'rgba(255,255,255,0.82)' : F.ink,
      backgroundColor: active ? (a === 'dark' ? F.skyDeep : F.blue) : 'transparent',
    }),
    drawerRowSuffix: (a) => <ArrowRight className="w-3.5 h-3.5 opacity-70" style={{ color: a === 'dark' ? 'currentColor' : F.blue }} />,
    drawerMetaClass: 'text-[9px] font-extrabold uppercase tracking-[0.2em]',
    drawerMetaStyle: (a) => ({ color: a === 'dark' ? F.skyDeep : F.muted }),
    drawerBookClass: 'w-full rounded-xl py-3.5 text-[10px] font-extrabold uppercase tracking-[0.16em] flex items-center justify-center gap-2 transition-all hover:brightness-105',
    drawerBookStyle: () => ({ backgroundColor: F.teal, color: F.white }),
  },

  /* --------------------------------------------------------------- */
  /* 5 · NAIL & LASH — pink flash strip + playful cream polish bar.   */
  /* --------------------------------------------------------------- */
  nail_lash_studio: {
    defaultAppearance: 'light',
    stickyClass: 'top-0',
    barClass: 'backdrop-blur-md border-b',
    barStyle: (a) =>
      a === 'dark'
        ? { backgroundColor: 'rgba(33,27,36,0.96)', borderColor: 'rgba(255,45,141,0.35)' }
        : { backgroundColor: 'rgba(255,250,247,0.94)', borderColor: N.line },
    utilityStrip: (a) => (
      <div
        className="px-5 md:px-8 py-2 flex items-center justify-between text-[8px] font-extrabold uppercase tracking-[0.18em]"
        style={{ backgroundColor: a === 'dark' ? N.inkSoft : N.pink, color: N.white }}
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Your beauty appointment, elevated
        </span>
        <span className="hidden sm:inline">Appointments · Art · Afterglow</span>
      </div>
    ),
    brand: (data, a) => {
      const nameStyle = { ...getSalonNameStyle(data) };
      if (!nameStyle.color) nameStyle.color = a === 'dark' ? '#fffaf7' : N.ink;
      return (
        <div className="flex items-center gap-2.5 min-w-0">
          {data.logoUrl ? (
            <img src={data.logoUrl} alt="Logo" className="h-8 w-auto max-w-[110px] object-contain" />
          ) : (
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: a === 'dark' ? N.pink : N.ink, color: a === 'dark' ? N.ink : N.pink }}
            >
              <Sparkles className="w-4 h-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-extrabold truncate" style={nameStyle}>
              {data.salonName || 'The Glow Edit'}
            </p>
            <p className="text-[8px] uppercase tracking-[0.25em] font-bold" style={{ color: a === 'dark' ? N.pinkGlow : N.pinkDeep }}>
              Nail · Lash · Brow
            </p>
          </div>
        </div>
      );
    },
    linkClass: 'px-3 py-2 rounded-full text-[9px] font-extrabold uppercase tracking-[0.14em] transition-colors',
    linkStyle: (a, active) => ({
      color: active ? (a === 'dark' ? '#211b24' : '#ffffff') : a === 'dark' ? 'rgba(255,250,247,0.66)' : N.muted,
      backgroundColor: active ? (a === 'dark' ? N.pinkGlow : N.pink) : 'transparent',
    }),
    bookClass: 'px-5 py-2.5 rounded-full text-[9px] font-extrabold uppercase tracking-[0.14em] text-white transition-all hover:brightness-110 hover:shadow-lg active:scale-95',
    bookStyle: () => ({ backgroundImage: `linear-gradient(120deg, ${N.pink} 0%, ${N.pinkDeep} 100%)`, backgroundColor: N.pink }),
    langWrapClass: 'flex items-center rounded-full p-0.5',
    langWrapStyle: (a) => ({ backgroundColor: a === 'dark' ? 'rgba(255,121,183,0.16)' : N.pinkSoft }),
    langOptionClass: 'px-2.5 py-1 rounded-full text-[9px] font-extrabold transition-colors',
    langOptionStyle: (a, active) =>
      active
        ? { backgroundColor: N.pink, color: '#ffffff' }
        : { color: a === 'dark' ? N.pinkGlow : N.pinkDeep },
    modeButtonClass: 'w-8 h-8 rounded-full flex items-center justify-center border transition-colors',
    modeButtonStyle: (a) => ({
      backgroundColor: a === 'dark' ? 'rgba(255,121,183,0.14)' : '#ffffff',
      borderColor: a === 'dark' ? 'rgba(255,121,183,0.4)' : N.line,
    }),
    modeIconColor: (a) => (a === 'dark' ? N.pinkGlow : N.ink),
    menuButtonClass: 'w-9 h-9 rounded-full flex items-center justify-center border transition-colors',
    menuButtonStyle: (a) => ({
      backgroundColor: a === 'dark' ? 'rgba(255,121,183,0.14)' : '#ffffff',
      borderColor: a === 'dark' ? 'rgba(255,121,183,0.4)' : N.line,
    }),
    drawerClass: 'border-b shadow-lg',
    drawerStyle: (a) => ({ backgroundColor: a === 'dark' ? '#2c2330' : '#fffaf7', borderColor: a === 'dark' ? 'rgba(255,45,141,0.3)' : N.line }),
    drawerRowClass: 'w-full flex items-center justify-between px-5 py-3 rounded-2xl text-left text-[10px] font-extrabold uppercase tracking-[0.14em] transition-colors',
    drawerRowStyle: (a, active) => ({
      color: active ? '#ffffff' : a === 'dark' ? 'rgba(255,250,247,0.8)' : N.ink,
      backgroundColor: active ? N.pink : 'transparent',
    }),
    drawerRowSuffix: (a) => (
      <Sparkles className="w-3 h-3" style={{ color: a === 'dark' ? N.pinkGlow : N.pinkDeep }} />
    ),
    drawerMetaClass: 'text-[8px] font-extrabold uppercase tracking-[0.24em]',
    drawerMetaStyle: (a) => ({ color: a === 'dark' ? N.pinkGlow : N.pinkDeep }),
    drawerBookClass: 'w-full rounded-full py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white transition-all hover:brightness-110',
    drawerBookStyle: () => ({ backgroundImage: `linear-gradient(120deg, ${N.pink} 0%, ${N.pinkDeep} 100%)`, backgroundColor: N.pink }),
  },
};

/* --------------------------------------------------------------------- */
/* Shared interactive header shell (behaviour common; visuals per theme). */
/* --------------------------------------------------------------------- */

export default function SiteHeader({ themeId, data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  const design = DESIGNS[themeId];
  const locale = useSiteLocale();
  const brandData = ownerPreview && !(data.salonName || '').trim()
    ? { ...data, salonName: OWNER_PREVIEW_EMPTY.salonName }
    : data;
  // The five themed templates own their surface design (the barber theme is
  // dark by design), so the header resolves from the theme default — never
  // the legacy `websiteAppearance` field those renderers intentionally ignore.
  const [appearance, toggleAppearance] = useSiteAppearance(undefined, design.defaultAppearance);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string>('home');
  const { user } = useAuth();
  const { openAuth } = useAuthModalOptional();
  const openCustomerAuth = (authMode: 'login' | 'signup') => openAuth(authMode, {
    accountIntent: 'customer',
    returnTo: publicSalonAuthContinuation(data.websiteSlug),
  });

  const items = useMemo(() => buildSiteNavItems(themeId, data), [themeId, data]);
  const labels = (key: SiteNavItem['key']) => SITE_NAV_LABELS[key][locale];
  const bookLabel = SITE_HEADER_LABELS.bookAppointment[locale];

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const go = useCallback((item: SiteNavItem) => {
    setActiveKey(item.key);
    setMenuOpen(false);
    scrollToSiteSection(item.targetId);
  }, []);

  const goBook = useCallback(() => {
    setMenuOpen(false);
    scrollToSiteSection(BOOK_APPOINTMENT_TARGET);
  }, []);

  const languageControl = (testIdPrefix: string) => (
    <div
      className={design.langWrapClass}
      style={design.langWrapStyle(appearance)}
      role="group"
      aria-label={SITE_HEADER_LABELS.language.en}
      data-testid={`${testIdPrefix}-language`}
    >
      <Globe className="w-3 h-3 mx-1 shrink-0" style={{ color: design.modeIconColor(appearance) }} aria-hidden />
      {SUPPORTED_LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`${testIdPrefix}-lang-${option}`}
          aria-pressed={locale === option}
          className={design.langOptionClass}
          style={design.langOptionStyle(appearance, locale === option)}
          onClick={() => setSiteLocale(option)}
        >
          {option === 'en' ? 'EN' : LOCALE_LABELS[option]}
        </button>
      ))}
    </div>
  );

  const darkControl = (testIdPrefix: string) => (
    <button
      type="button"
      data-testid={`${testIdPrefix}-dark-toggle`}
      aria-pressed={appearance === 'dark'}
      aria-label={SITE_HEADER_LABELS.darkMode.en}
      title={SITE_HEADER_LABELS.darkMode[locale]}
      className={design.modeButtonClass}
      style={design.modeButtonStyle(appearance)}
      onClick={toggleAppearance}
    >
      {appearance === 'dark' ? (
        <Sun className="w-3.5 h-3.5" style={{ color: design.modeIconColor(appearance) }} />
      ) : (
        <Moon className="w-3.5 h-3.5" style={{ color: design.modeIconColor(appearance) }} />
      )}
    </button>
  );

  return (
    <>
      {/* Sample utility claims are design copy, not owner business facts. */}
      {!ownerPreview && design.utilityStrip?.(appearance)}
      <header
        id="section-header"
        data-site-section="header"
        data-section-state="ready"
        data-testid="site-header"
        data-theme={themeId}
        data-appearance={appearance}
        className={`sticky ${design.stickyClass} z-40`}
      >
      <div
        className={`${design.barClass} px-5 md:px-8 py-3.5 flex items-center justify-between gap-4 relative`}
        style={design.barStyle(appearance)}
      >
        {/* Logo / Salon Name — always first in the global header order. */}
        <button
          type="button"
          data-testid="site-brand"
          className="min-w-0 text-left cursor-pointer"
          onClick={() => go({ key: 'home', targetId: 'section-hero' })}
          aria-label={`${brandData.salonName || OWNER_PREVIEW_EMPTY.salonName} — ${SITE_NAV_LABELS.home.en}`}
        >
          {design.brand(brandData, appearance)}
        </button>

        {/* Desktop navigation */}
        {mode === 'desktop' && (
          <nav
            data-testid="site-nav-desktop"
            className="flex items-center gap-1 md:gap-2 lg:gap-3 flex-wrap justify-end"
            aria-label="Website navigation"
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                data-testid={`nav-${item.key}`}
                aria-current={activeKey === item.key ? 'page' : undefined}
                className={design.linkClass}
                style={design.linkStyle(appearance, activeKey === item.key)}
                onClick={() => go(item)}
              >
                {labels(item.key)}
              </button>
            ))}
            {user ? (
              <>
                <button
                  type="button"
                  data-testid="site-header-my-bookings"
                  className={design.linkClass}
                  style={design.linkStyle(appearance, false)}
                  onClick={() => openSiteBooking()}
                >
                  {locale === 'hi' ? 'मेरी बुकिंग' : 'My Bookings'}
                </button>
                <button
                  type="button"
                  data-testid="site-header-logout"
                  className={design.linkClass}
                  style={design.linkStyle(appearance, false)}
                  onClick={() => void signOut()}
                >
                  {locale === 'hi' ? 'लॉग आउट' : 'Logout'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="site-header-login"
                  className={design.linkClass}
                  style={design.linkStyle(appearance, false)}
                  onClick={() => openCustomerAuth('login')}
                >
                  {locale === 'hi' ? 'लॉग इन' : 'Login'}
                </button>
                <button
                  type="button"
                  data-testid="site-header-signup"
                  className={design.linkClass}
                  style={design.linkStyle(appearance, false)}
                  onClick={() => openCustomerAuth('signup')}
                >
                  {locale === 'hi' ? 'साइन अप' : 'Sign Up'}
                </button>
              </>
            )}
            {languageControl('site-header')}
            {darkControl('site-header')}
            <button
              type="button"
              data-testid="site-book-cta"
              className={design.bookClass}
              style={design.bookStyle(appearance)}
              onClick={goBook}
            >
              {bookLabel} {design.bookSuffix || null}
            </button>
          </nav>
        )}

        {/* Mobile navigation — compact controls + hamburger drawer. */}
        {mode === 'mobile' && (
          <div className="flex items-center gap-2">
            {darkControl('site-header-mobile')}
            <button
              type="button"
              data-testid="site-menu-button"
              aria-expanded={menuOpen}
              aria-label={SITE_HEADER_LABELS.menu[locale]}
              className={design.menuButtonClass}
              style={design.menuButtonStyle(appearance)}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X className="w-4 h-4" style={{ color: design.modeIconColor(appearance) }} />
              ) : (
                <Menu className="w-4 h-4" style={{ color: design.modeIconColor(appearance) }} />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {mode === 'mobile' && menuOpen && (
        <div
          data-testid="site-mobile-drawer"
          className={`absolute inset-x-0 top-full z-40 ${design.drawerClass}`}
          style={design.drawerStyle(appearance)}
        >

          <nav className="px-4 py-4 flex flex-col gap-1 max-h-[420px] overflow-y-auto custom-scrollbar" aria-label="Mobile navigation">
            {items.map((item, i) => (
              <button
                key={item.key}
                type="button"
                data-testid={`nav-mobile-${item.key}`}
                aria-current={activeKey === item.key ? 'page' : undefined}
                className={design.drawerRowClass}
                style={design.drawerRowStyle(appearance, activeKey === item.key)}
                onClick={() => go(item)}
              >
                <span className="flex items-center min-w-0">
                  {design.drawerRowPrefix?.(String(i + 1).padStart(2, '0'), appearance, activeKey === item.key)}
                  {labels(item.key)}
                </span>
                {design.drawerRowSuffix?.(appearance)}
              </button>
            ))}
            {user ? (
                <>
                  <button
                    type="button"
                    data-testid="site-drawer-my-bookings"
                    className={design.drawerRowClass}
                    style={design.drawerRowStyle(appearance, false)}
                    onClick={() => { setMenuOpen(false); openSiteBooking(); }}
                  >
                    <span className="flex items-center gap-2">
                      <CalendarCheck2 className="w-3.5 h-3.5" />
                      {locale === 'hi' ? 'मेरी बुकिंग' : 'My Bookings'}
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid="site-drawer-logout"
                    className={design.drawerRowClass}
                    style={design.drawerRowStyle(appearance, false)}
                    onClick={() => { setMenuOpen(false); void signOut(); }}
                  >
                    <span className="flex items-center gap-2">
                      <LogOut className="w-3.5 h-3.5" />
                      {locale === 'hi' ? 'लॉग आउट' : 'Logout'}
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="site-drawer-login"
                    className={design.drawerRowClass}
                    style={design.drawerRowStyle(appearance, false)}
                    onClick={() => { setMenuOpen(false); openCustomerAuth('login'); }}
                  >
                    <span className="flex items-center gap-2">
                      <LogIn className="w-3.5 h-3.5" />
                      {locale === 'hi' ? 'लॉग इन' : 'Login'}
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid="site-drawer-signup"
                    className={design.drawerRowClass}
                    style={design.drawerRowStyle(appearance, false)}
                    onClick={() => { setMenuOpen(false); openCustomerAuth('signup'); }}
                  >
                    <span className="flex items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5" />
                      {locale === 'hi' ? 'साइन अप' : 'Sign Up'}
                    </span>
                  </button>
                </>
              )}
            </nav>
          <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-3">
            <span className={design.drawerMetaClass} style={design.drawerMetaStyle(appearance)}>
              {SITE_HEADER_LABELS.language[locale]}
            </span>
            {languageControl('site-drawer')}
          </div>
          <div className="px-5 pb-2 flex items-center justify-between gap-3">
            <span className={design.drawerMetaClass} style={design.drawerMetaStyle(appearance)}>
              {SITE_HEADER_LABELS.darkMode[locale]}
            </span>
            {darkControl('site-drawer')}
          </div>
          <div className="px-5 pb-5 pt-2">
            <button
              type="button"
              data-testid="site-book-cta-mobile"
              className={design.drawerBookClass}
              style={design.drawerBookStyle(appearance)}
              onClick={goBook}
            >
              {bookLabel}
            </button>
          </div>
        </div>
      )}
      </header>
    </>
  );
}

export { BOOK_APPOINTMENT_TARGET };
