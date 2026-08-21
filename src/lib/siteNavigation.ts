/**
 * PHASE 10.1 — GLOBAL HEADER & NAVIGATION
 *
 * The ONE navigation structure shared by all five website themes
 * (barber_mens_grooming, hair_studio_color_bar, beauty_skin_spa,
 * family_full_service, nail_lash_studio).
 *
 * Header order is fixed and theme-independent:
 *
 *   Logo / Salon Name → Home → Services → Offers → Gallery → Videos → About
 *   → Team → Contact → Language → Dark Mode → Book Appointment
 *
 * Only the STRUCTURE lives here — labels, order, section targets and the
 * small persistence helpers for the Language and Dark Mode controls. Every
 * visual decision (colors, typography, shapes, hover states, mobile drawer
 * treatment) lives in `src/components/SiteHeader.tsx`, keyed per theme, so no
 * two themes share the same visual header.
 *
 * No database reads or writes happen here; visibility rules only mirror the
 * sections each existing theme renderer already shows (e.g. Gallery renders
 * only when gallery photos exist).
 */
import type { SalonData, WebsiteAppearance } from '../types';
import { persistLocale, readStoredLocale } from './locale';
import type { AppLocale } from './locale';
import { normalizeThemeId } from './themeServices';

/** Ordered navigation keys — the canonical global header order. */
export const SITE_NAV_KEYS = [
  'home',
  'services',
  'offers',
  'gallery',
  'videos',
  'about',
  'team',
  'contact',
] as const;

export type SiteNavKey = (typeof SITE_NAV_KEYS)[number];

export interface SiteNavItem {
  key: SiteNavKey;
  /** `id` of the website section to scroll to (no leading '#'). */
  targetId: string;
}

/** Nav labels in every supported locale (header instant-switches on locale). */
export const SITE_NAV_LABELS: Record<SiteNavKey, Record<AppLocale, string>> = {
  home: { en: 'Home', hi: 'होम' },
  services: { en: 'Services', hi: 'सेवाएँ' },
  offers: { en: 'Offers', hi: 'ऑफ़र' },
  gallery: { en: 'Gallery', hi: 'गैलरी' },
  videos: { en: 'Videos', hi: 'वीडियो' },
  about: { en: 'About', hi: 'हमारे बारे में' },
  team: { en: 'Team', hi: 'टीम' },
  contact: { en: 'Contact', hi: 'संपर्क' },
};

export const SITE_HEADER_LABELS = {
  bookAppointment: { en: 'Book Appointment', hi: 'अपॉइंटमेंट बुक करें' },
  menu: { en: 'Menu', hi: 'मेन्यू' },
  language: { en: 'Language', hi: 'भाषा' },
  darkMode: { en: 'Dark Mode', hi: 'डार्क मोड' },
} as const satisfies Record<string, Record<AppLocale, string>>;

/** Book Appointment always lands on the theme's contact/booking section. */
export const BOOK_APPOINTMENT_TARGET = 'section-contact';

function nonEmpty(list: readonly unknown[] | undefined): boolean {
  return Array.isArray(list) && list.length > 0;
}

/**
 * Builds the visible nav items for a theme + salon payload, preserving the
 * canonical SITE_NAV_KEYS order at all times.
 *
 * Items are omitted only when the underlying theme section genuinely does not
 * render for the current data (matching each renderer's existing conditions):
 *
 *  - Gallery: family/nail themes ship an always-on showcase; barber/hair/
 *    beauty render it only when the owner added photos.
 *  - Videos: barber/hair/beauty render a social-videos section when videos
 *    exist; the family and nail themes have no video section in their
 *    current design, so the item is skipped there.
 *  - About: barber/hair/beauty render the founder/about block once an owner
 *    name is set; family/nail have an always-on About section.
 *  - Team: barber/hair/beauty render team only when members exist; family/
 *    nail render the section (with an empty-state card) regardless.
 *  - Offers: barber/hair/beauty jump to the packages/pricing block once it
 *    exists, otherwise to the services menu where live offer badges render;
 *    family jumps to Combos, nail to the Studio menu.
 */
export function buildSiteNavItems(themeId: string | undefined, data: SalonData): SiteNavItem[] {
  const theme = normalizeThemeId(themeId);
  const availability: Record<SiteNavKey, string | null> = (() => {
    if (theme === 'family_full_service') {
      return {
        home: 'section-hero',
        services: 'section-services',
        offers: 'section-combos',
        gallery: 'section-gallery',
        videos: null,
        about: 'section-about',
        team: 'section-team',
        contact: 'section-contact',
      };
    }
    if (theme === 'nail_lash_studio') {
      return {
        home: 'section-hero',
        services: 'section-featured-services',
        offers: 'section-service-menu',
        gallery: 'section-gallery',
        videos: null,
        about: 'section-about',
        team: 'section-team',
        contact: 'section-contact',
      };
    }
    if (theme === 'barber_mens_grooming' || theme === 'hair_studio_color_bar' || theme === 'beauty_skin_spa') {
      return {
        home: 'section-hero',
        services: 'section-services',
        offers: nonEmpty(data.packages) ? 'section-offers' : 'section-services',
        gallery: nonEmpty(data.gallery) ? 'section-gallery' : null,
        videos: nonEmpty(data.socialVideos) ? 'section-social' : null,
        about: data.ownerName ? 'section-owner' : null,
        team: nonEmpty(data.team) ? 'section-team' : null,
        contact: 'section-contact',
      };
    }
    // Legacy `hair` template — keeps its current conservative behaviour.
    return {
      home: 'section-hero',
      services: 'section-services',
      offers: nonEmpty(data.packages) ? 'section-services' : null,
      gallery: nonEmpty(data.gallery) ? 'section-gallery' : null,
      videos: nonEmpty(data.socialVideos) ? 'section-social' : null,
      about: null,
      team: nonEmpty(data.team) ? 'section-team' : null,
      contact: 'section-contact',
    };
  })();

  return SITE_NAV_KEYS.flatMap((key) => {
    const targetId = availability[key];
    return targetId ? [{ key, targetId }] : [];
  });
}

/** Smoothly scrolls the website preview to a section. Safe in jsdom/SSR. */
export function scrollToSiteSection(targetId: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(targetId);
  if (!el || typeof el.scrollIntoView !== 'function') return;
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // Older engines without ScrollOptions support.
    el.scrollIntoView();
  }
}

/* ------------------------------------------------------------------ */
/* Language + appearance preference channels (header control wiring).  */
/* ------------------------------------------------------------------ */

/** Custom event names dispatched on `window` so every mounted renderer and
 *  header re-reads the new preference (renderers subscribe via hooks in
 *  `SiteHeader.tsx`). */
export const SITE_LOCALE_EVENT = 'nexora:site-locale';
export const SITE_APPEARANCE_EVENT = 'nexora:site-appearance';

const SITE_APPEARANCE_KEY = 'nexora_site_appearance';

export type SiteAppearance = 'light' | 'dark';

export function setSiteLocale(locale: AppLocale): void {
  persistLocale(locale);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SITE_LOCALE_EVENT));
  }
}

/** Read the header language (shared `nexora_locale` key used by Step 05). */
export function readSiteLocale(): AppLocale {
  return readStoredLocale();
}

export function isSiteAppearance(value: unknown): value is SiteAppearance {
  return value === 'light' || value === 'dark';
}

/**
 * Reads the site's appearance override: explicit visitor choice (stored) wins
 * over the owner's saved `websiteAppearance`, then over the theme default.
 */
export function readSiteAppearance(
  ownerDefault: WebsiteAppearance | undefined,
  themeDefault: SiteAppearance,
): SiteAppearance {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(SITE_APPEARANCE_KEY);
      if (isSiteAppearance(stored)) return stored;
    } catch {
      // Ignore private-mode storage failures.
    }
  }
  if (ownerDefault === 'dark' || ownerDefault === 'light') return ownerDefault;
  return themeDefault;
}

export function setSiteAppearance(appearance: SiteAppearance): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SITE_APPEARANCE_KEY, appearance);
    } catch {
      // Ignore private-mode storage failures.
    }
    window.dispatchEvent(new Event(SITE_APPEARANCE_EVENT));
  }
}

export const SITE_HEADER_THEME_IDS = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
] as const;

export type SiteHeaderThemeId = (typeof SITE_HEADER_THEME_IDS)[number];

export function isSiteHeaderTheme(value: string | undefined): value is SiteHeaderThemeId {
  return !!value && (SITE_HEADER_THEME_IDS as readonly string[]).includes(value);
}
