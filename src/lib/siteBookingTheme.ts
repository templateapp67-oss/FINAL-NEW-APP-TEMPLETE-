/**
 * PHASE 10.6 — BOOK APPOINTMENT ENTRY FLOW · per-theme surface tokens.
 *
 * ONE global resolver (`bookingSurfaces(themeId, appearance)`) feeds the
 * booking flow on every theme, reusing the Phase 10.2 light/dark surface
 * palettes (`themeSurfaces.ts`) as the single source of truth. The booking
 * flow adds nothing new to the theme identities — it only re-maps the
 * existing tokens onto the small set of keys a wizard needs (page, card,
 * accent, chips, inputs, disabled/taken, success).
 *
 * Theme visuals inside the flow remain distinct:
 *   - barber_mens_grooming  gold-on-charcoal (dark native) / warm cream
 *   - hair_studio_color_bar  editorial rose-gold on paper / espresso
 *   - beauty_skin_spa        emerald sanctuary / deep forest
 *   - family_full_service    bright sky-blue / night-sky navy
 *   - nail_lash_studio       neon-pink on sand / deep plum
 */
import type { WebsiteAppearance } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import {
  BARBER_SURFACES,
  BEAUTY_SPA_SURFACES,
  FAMILY_SURFACES,
  HAIR_STUDIO_SURFACES,
  NAIL_LASH_SURFACES,
  surfacesOf,
} from './themeSurfaces';

export interface BookingFlowSurface {
  /** Whole-flow backdrop. */
  page: string;
  /** Card / panel background. */
  card: string;
  /** Card / hairline borders. */
  line: string;
  /** Primary text. */
  text: string;
  /** Stronger heading text. */
  textStrong: string;
  /** Secondary text. */
  muted: string;
  /** Input / inset well background. */
  well: string;
  /** Primary accent (buttons, selected chips, progress). */
  accent: string;
  /** Text drawn on the accent. */
  accentText: string;
  /** Hover-brightened accent. */
  accentHover: string;
  /** Soft wash behind selected / highlighted content. */
  accentSoft: string;
  /** Selected-item border. */
  accentLine: string;
  /** Disabled / taken / past slots. */
  disabled: string;
  disabledText: string;
  /** Success / held-by-you state. */
  success: string;
  successSoft: string;
  /** Neutral chip background. */
  chip: string;
  chipLine: string;
  /** Error / validation text. */
  danger: string;
}

function withDefaults(
  base: Partial<BookingFlowSurface> & Pick<BookingFlowSurface, 'page' | 'card' | 'text' | 'muted' | 'accent' | 'accentText'>,
  extra: Partial<BookingFlowSurface> = {},
): BookingFlowSurface {
  return {
    line: base.line || 'rgba(127,127,127,0.28)',
    textStrong: base.textStrong || base.text,
    well: base.well || base.page,
    accentHover: base.accentHover || base.accent,
    accentSoft: base.accentSoft || base.accent,
    accentLine: base.accentLine || base.accent,
    disabled: '#8a8a8a',
    disabledText: '#a3a3a3',
    success: '#16a34a',
    successSoft: 'rgba(22,163,74,0.12)',
    chip: base.chip || base.well || base.page,
    chipLine: base.chipLine || base.line,
    danger: '#dc2626',
    ...base,
    ...extra,
  };
}

export function bookingSurfaces(
  themeId: SiteHeaderThemeId,
  appearance: WebsiteAppearance | undefined,
): BookingFlowSurface {
  const mode = appearance === 'dark' ? 'dark' : 'light';

  /* 1 · BARBER — gold on charcoal (dark native) / warm day-shift cream. */
  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return mode === 'dark'
      ? withDefaults({
          page: t.page,
          card: t.charcoalCard,
          line: t.line,
          text: t.text,
          textStrong: t.textStrong,
          muted: t.muted,
          well: t.well,
          accent: t.gold,
          accentText: '#141414',
          accentHover: t.goldBright,
          accentSoft: 'rgba(201,162,39,0.12)',
          accentLine: 'rgba(201,162,39,0.55)',
          chip: '#151515',
          chipLine: '#2c2c2c',
          disabled: '#33302a',
          disabledText: '#5c554a',
        })
      : withDefaults({
          page: t.page,
          card: t.card,
          line: t.line,
          text: t.text,
          textStrong: t.textStrong,
          muted: t.muted,
          well: t.well,
          accent: t.goldBright,
          accentText: '#fdfaf1',
          accentHover: '#7a6214',
          accentSoft: 'rgba(138,113,24,0.10)',
          accentLine: 'rgba(138,113,24,0.45)',
          chip: '#efe7d2',
          chipLine: t.chipLine,
          disabled: '#e3d9c0',
          disabledText: '#b3a77f',
        });
  }

  /* 2 · HAIR STUDIO — editorial rose-gold / espresso ink. */
  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return mode === 'dark'
      ? withDefaults({
          page: t.page,
          card: t.card,
          line: t.line,
          text: t.text,
          textStrong: t.textStrong,
          muted: t.muted,
          well: t.well,
          accent: t.roseBright,
          accentText: '#171311',
          accentHover: '#f0c3ca',
          accentSoft: t.roseSoft,
          accentLine: 'rgba(224,173,181,0.5)',
          chip: '#221c19',
          chipLine: t.chipLine,
          disabled: '#2e2623',
          disabledText: '#6f6259',
        })
      : withDefaults({
          page: t.page,
          card: t.card,
          line: t.line,
          text: t.text,
          textStrong: t.textStrong,
          muted: t.muted,
          well: t.well,
          accent: t.rose,
          accentText: '#ffffff',
          accentHover: t.roseDeep,
          accentSoft: t.roseSoft,
          accentLine: 'rgba(176,120,131,0.45)',
          chip: '#f4efe9',
          chipLine: t.chipLine,
          disabled: '#eee7de',
          disabledText: '#c0b4a8',
        });
  }

  /* 3 · BEAUTY SPA — emerald sanctuary / deep forest night spa. */
  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return mode === 'dark'
      ? withDefaults({
          page: t.page,
          card: t.card,
          line: t.line,
          text: t.text,
          textStrong: t.textStrong,
          muted: t.muted,
          well: t.well,
          accent: t.emerald,
          accentText: '#071c15',
          accentHover: '#3fbd9d',
          accentSoft: t.emeraldSoft,
          accentLine: 'rgba(51,171,141,0.5)',
          chip: '#12352c',
          chipLine: t.chipLine,
          disabled: '#1d3c33',
          disabledText: '#5d7f73',
        })
      : withDefaults({
          page: t.page,
          card: t.card,
          line: t.line,
          text: t.text,
          textStrong: t.textStrong,
          muted: t.muted,
          well: t.well,
          accent: t.emerald,
          accentText: '#ffffff',
          accentHover: t.emeraldDeep,
          accentSoft: t.emeraldSoft,
          accentLine: 'rgba(38,124,98,0.4)',
          chip: '#f3efe4',
          chipLine: t.chipLine,
          disabled: '#e8e2d2',
          disabledText: '#bcb399',
        });
  }

  /* 4 · FAMILY — bright sky-blue / night-sky navy. */
  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return mode === 'dark'
      ? withDefaults({
          page: t.page,
          card: t.card,
          line: t.line,
          text: t.ink,
          textStrong: t.heading,
          muted: t.muted,
          well: t.well,
          accent: t.blueBright,
          accentText: '#04121f',
          accentHover: '#8cc6ff',
          accentSoft: 'rgba(108,178,255,0.14)',
          accentLine: 'rgba(108,178,255,0.5)',
          chip: '#0b263b',
          chipLine: t.chipLine,
          disabled: '#123046',
          disabledText: '#55788f',
          success: t.sun,
          successSoft: 'rgba(255,209,102,0.16)',
        })
      : withDefaults({
          page: t.page,
          card: t.card,
          line: t.line,
          text: t.ink,
          textStrong: t.heading,
          muted: t.muted,
          well: t.well,
          accent: t.blue,
          accentText: '#ffffff',
          accentHover: t.blueBright,
          accentSoft: t.sky,
          accentLine: t.skyDeep,
          chip: '#f0f9ff',
          chipLine: t.chipLine,
          disabled: '#e8f2f8',
          disabledText: '#aac3d4',
          success: t.tealDeep,
          successSoft: t.tealSoft,
        });
  }

  /* 5 · NAIL & LASH — neon pink on sand / deep plum glow. */
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  return mode === 'dark'
    ? withDefaults({
        page: t.page,
        card: t.card,
        line: t.line,
        text: t.text,
        textStrong: t.text,
        muted: t.muted,
        well: t.well,
        accent: t.pink,
        accentText: '#19131f',
        accentHover: t.pinkGlow,
        accentSoft: t.pinkSoft,
        accentLine: 'rgba(255,77,160,0.55)',
        chip: '#2a2133',
        chipLine: t.chipLine,
        disabled: '#332a3d',
        disabledText: '#77657f',
      })
    : withDefaults({
        page: t.page,
        card: t.card,
        line: t.line,
        text: t.text,
        textStrong: t.text,
        muted: t.muted,
        well: t.well,
        accent: t.pinkDeep,
        accentText: '#ffffff',
        accentHover: t.pink,
        accentSoft: t.pinkSoft,
        accentLine: 'rgba(240,84,163,0.45)',
        chip: '#fdeef4',
        chipLine: t.chipLine,
        disabled: '#f3e3e7',
        disabledText: '#cdb0ba',
      });
}
