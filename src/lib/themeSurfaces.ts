/**
 * PHASE 10.2 — GLOBAL DARK MODE · per-theme surface palettes.
 *
 * ONE global implementation (`themeSurfaces(themeId, appearance)`) drives the
 * light/dark appearance of every section of all five themed website
 * renderers: Header, Hero, Services, Offers, Gallery, Videos, About/Owner,
 * Team/Staff, Reviews, Contact and Footer.
 *
 * Each theme keeps its OWN identity in dark mode — these are five separate,
 * hand-mapped palettes, not one shared dark scheme:
 *
 *   - barber_mens_grooming   dark = its native charcoal/gold design;
 *                            light = a warm "day shift" cream barbershop.
 *   - hair_studio_color_bar  dark = espresso ink with brighter rose-gold.
 *   - beauty_skin_spa        dark = deep forest emerald / night spa.
 *   - family_full_service    dark = night-sky navy with sky + sun accents.
 *   - nail_lash_studio       dark = deep plum with neon-pink glow.
 *
 * The objects extend each theme's existing design tokens with the extra
 * surface keys the renderers need (`page`, `line`, `text`, `textStrong`,
 * `card`, `well`, `chipLine`). Light palettes preserve the exact pre-10.2
 * values, so DEFAULT RENDERING IS UNCHANGED.
 */
import type { WebsiteAppearance } from '../types';
import {
  BARBER_THEME,
  BEAUTY_SPA_THEME,
  FAMILY_FULL_SERVICE_THEME,
  HAIR_STUDIO_THEME,
  NAIL_LASH_STUDIO_THEME,
} from './themeServices';

/* ------------------------------------------------------------------ */
/* Extended token shapes (existing base tokens + surface keys).        */
/* ------------------------------------------------------------------ */

export interface BarberSurface {
  gold: string; goldBright: string; goldSoft: string;
  charcoal: string; charcoalSoft: string; charcoalCard: string;
  cream: string; muted: string;
  page: string; line: string; text: string; textStrong: string;
  card: string; well: string; chipLine: string; accentText: string;
  footerBg: string;
}

export interface HairStudioSurface {
  ink: string; inkSoft: string; paper: string; paperDeep: string;
  rose: string; roseBright: string; roseSoft: string; roseDeep: string;
  line: string; muted: string;
  page: string; text: string; textStrong: string; card: string; well: string;
  chipLine: string; footerBg: string; frame: string;
}

export interface BeautySpaSurface {
  emerald: string; emeraldDeep: string; emeraldMid: string; emeraldSoft: string;
  beige: string; beigeSoft: string; cream: string; blush: string; sage: string;
  text: string; muted: string; line: string;
  page: string; textStrong: string; card: string; well: string; chipLine: string;
  bandBg: string; bandText: string; bandMuted: string; footerBg: string;
}

export interface FamilySurface {
  navy: string; blue: string; blueBright: string; sky: string; skyDeep: string;
  teal: string; tealDeep: string; tealSoft: string; sun: string; sunSoft: string;
  coral: string; ink: string; muted: string; line: string; white: string;
  page: string; heading: string; textStrong: string; card: string; well: string; chipLine: string;
  footerBg: string; stripBg: string; bandBg: string; menBand: string; contactBand: string;
}

export interface NailLashSurface {
  ink: string; inkSoft: string; pink: string; pinkDeep: string; pinkGlow: string;
  pinkSoft: string; sand: string; sandDeep: string; nude: string; nudeSoft: string;
  cream: string; muted: string; line: string; white: string;
  page: string; text: string; textStrong: string; card: string; well: string; chipLine: string;
  bandBg: string; stripBg: string; footerBg: string; overlay: string; artBand: string;
}

/* ------------------------------------------------------------------ */
/* Barber — dark native charcoal/gold; light = warm day-shift cream.   */
/* ------------------------------------------------------------------ */

export const BARBER_SURFACES: Record<'light' | 'dark', BarberSurface> = {
  dark: {
    ...BARBER_THEME,
    page: '#0c0c0c',
    line: '#262626',
    text: '#d4d4d0',
    textStrong: '#ffffff',
    card: BARBER_THEME.charcoalCard,
    well: '#101010',
    chipLine: '#2a2a2a',
    accentText: BARBER_THEME.gold,
    footerBg: '#0c0c0c',
  },
  light: {
    gold: BARBER_THEME.gold,
    goldBright: '#8a7118',
    goldSoft: '#efe3bd',
    charcoal: '#f1ead8',
    charcoalSoft: '#faf5ea',
    charcoalCard: '#fdfaf1',
    cream: '#1b1a17',
    muted: '#6e6552',
    page: '#f5efe0',
    line: '#ddd2b8',
    text: '#454032',
    textStrong: '#1b1a17',
    card: '#fdfaf1',
    well: '#efe7d2',
    chipLine: '#d8cbaa',
    accentText: '#8a7118',
    footerBg: '#241f14',
  },
};

/* ------------------------------------------------------------------ */
/* Hair Studio — light warm paper; dark = espresso ink, rose-gold.     */
/* ------------------------------------------------------------------ */

export const HAIR_STUDIO_SURFACES: Record<'light' | 'dark', HairStudioSurface> = {
  light: {
    ...HAIR_STUDIO_THEME,
    page: '#faf8f5',
    text: '#4c4742',
    textStrong: HAIR_STUDIO_THEME.ink,
    card: '#ffffff',
    well: '#faf8f5',
    chipLine: HAIR_STUDIO_THEME.line,
    footerBg: HAIR_STUDIO_THEME.ink,
    frame: '#ffffff',
  },
  dark: {
    ink: '#f2ece5',
    inkSoft: '#3a332e',
    paper: '#171311',
    paperDeep: '#1f1a17',
    rose: '#c98f99',
    roseBright: '#e0adb5',
    roseSoft: '#38262a',
    roseDeep: '#e3b3ba',
    line: '#392f2a',
    muted: '#a2968b',
    page: '#131010',
    text: '#cfc4ba',
    textStrong: '#f2ece5',
    card: '#221c19',
    well: '#1a1512',
    chipLine: '#3b322c',
    footerBg: '#0e0b0a',
    frame: '#1c1714',
  },
};

/* ------------------------------------------------------------------ */
/* Beauty Spa — light cream sanctuary; dark = deep forest night spa.   */
/* ------------------------------------------------------------------ */

export const BEAUTY_SPA_SURFACES: Record<'light' | 'dark', BeautySpaSurface> = {
  light: {
    ...BEAUTY_SPA_THEME,
    page: BEAUTY_SPA_THEME.cream,
    textStrong: '#1d322d',
    card: '#ffffff',
    well: BEAUTY_SPA_THEME.beigeSoft,
    chipLine: BEAUTY_SPA_THEME.line,
    bandBg: BEAUTY_SPA_THEME.emerald,
    bandText: '#ffffff',
    bandMuted: 'rgba(255,255,255,0.78)',
    footerBg: BEAUTY_SPA_THEME.emeraldDeep,
  },
  dark: {
    emerald: '#33ab8d',
    emeraldDeep: '#a7dcd0',
    emeraldMid: '#4aa88f',
    emeraldSoft: '#1c4136',
    beige: '#13382e',
    beigeSoft: '#10261f',
    cream: '#0b1d17',
    blush: '#261b16',
    sage: '#14231b',
    text: '#c8ddd3',
    muted: '#8fae9f',
    line: '#23463a',
    page: '#081711',
    textStrong: '#eef7f2',
    card: '#133028',
    well: '#0f2a21',
    chipLine: '#2b5044',
    bandBg: '#0f352a',
    bandText: '#eef7f2',
    bandMuted: '#9cc3b6',
    footerBg: '#061009',
  },
};

/* ------------------------------------------------------------------ */
/* Family — light bright sky; dark = night-sky navy with sun accents.  */
/* ------------------------------------------------------------------ */

export const FAMILY_SURFACES: Record<'light' | 'dark', FamilySurface> = {
  light: {
    ...FAMILY_FULL_SERVICE_THEME,
    page: '#ffffff',
    heading: FAMILY_FULL_SERVICE_THEME.navy,
    textStrong: FAMILY_FULL_SERVICE_THEME.navy,
    card: '#ffffff',
    well: '#f8fcff',
    chipLine: FAMILY_FULL_SERVICE_THEME.skyDeep,
    footerBg: FAMILY_FULL_SERVICE_THEME.navy,
    stripBg: FAMILY_FULL_SERVICE_THEME.navy,
    bandBg: FAMILY_FULL_SERVICE_THEME.navy,
    menBand: FAMILY_FULL_SERVICE_THEME.blue,
    contactBand: FAMILY_FULL_SERVICE_THEME.teal,
  },
  dark: {
    navy: '#0b2c47',
    blue: '#4c9bf0',
    blueBright: '#6cb2ff',
    sky: '#0d2d45',
    skyDeep: '#8fc7ee',
    teal: '#17b8b2',
    tealDeep: '#8adcd8',
    tealSoft: '#12404e',
    sun: '#ffd166',
    sunSoft: '#3a3324',
    coral: '#ff9180',
    ink: '#e8f4ff',
    muted: '#93aec0',
    line: '#1d4258',
    white: '#0a2438',
    page: '#071b2e',
    heading: '#ddf0ff',
    textStrong: '#e8f4ff',
    card: '#0e2c42',
    well: '#0b263b',
    chipLine: '#29506b',
    footerBg: '#04121f',
    stripBg: '#04121f',
    bandBg: '#092237',
    menBand: '#10406e',
    contactBand: '#0a3d3d',
  },
};

/* ------------------------------------------------------------------ */
/* Nail & Lash — light warm sand; dark = deep plum with neon glow.     */
/* ------------------------------------------------------------------ */

export const NAIL_LASH_SURFACES: Record<'light' | 'dark', NailLashSurface> = {
  light: {
    ...NAIL_LASH_STUDIO_THEME,
    page: NAIL_LASH_STUDIO_THEME.cream,
    text: NAIL_LASH_STUDIO_THEME.ink,
    textStrong: NAIL_LASH_STUDIO_THEME.ink,
    card: '#ffffff',
    well: NAIL_LASH_STUDIO_THEME.sand,
    chipLine: NAIL_LASH_STUDIO_THEME.line,
    bandBg: NAIL_LASH_STUDIO_THEME.pink,
    stripBg: NAIL_LASH_STUDIO_THEME.pink,
    footerBg: NAIL_LASH_STUDIO_THEME.ink,
    overlay: 'rgba(33,27,36,0.75)',
    artBand: NAIL_LASH_STUDIO_THEME.ink,
  },
  dark: {
    ink: '#f6eef4',
    inkSoft: '#46344a',
    pink: '#ff4da0',
    pinkDeep: '#ff8ac2',
    pinkGlow: '#ffa3cd',
    pinkSoft: '#472038',
    sand: '#221a29',
    sandDeep: '#52405a',
    nude: '#d8aea2',
    nudeSoft: '#382931',
    cream: '#19131f',
    muted: '#b39daa',
    line: '#41304a',
    white: '#241c2b',
    page: '#120e17',
    text: '#e4d8e4',
    textStrong: '#f6eef4',
    card: '#221a29',
    well: '#1d1624',
    chipLine: '#4b3853',
    bandBg: '#3d1430',
    stripBg: '#3d1430',
    footerBg: '#0b0810',
    overlay: 'rgba(10,7,13,0.72)',
    artBand: '#151019',
  },
};

/* ------------------------------------------------------------------ */
/* Resolver — the single global entry point. Renderers call:           */
/*   const t = surfacesOf(BARBER_SURFACES, appearance)                 */
/* and get a fully-typed per-theme palette for the active appearance.  */
/* ------------------------------------------------------------------ */

export type ThemeSurfaces =
  | BarberSurface
  | HairStudioSurface
  | BeautySpaSurface
  | FamilySurface
  | NailLashSurface;

export function surfacesOf<T>(pair: Record<'light' | 'dark', T>, appearance: WebsiteAppearance | undefined): T {
  return pair[appearance === 'dark' ? 'dark' : 'light'];
}
