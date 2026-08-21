/**
 * PHASE 10.8 — per-theme review / rating visuals.
 *
 * Structure is shared; every token below is hand-mapped so the five
 * review sections stay pairwise distinct (barber slab, hair editorial,
 * spa pills, family rounded cards, nail neon).
 */
import type { CSSProperties } from 'react';
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

export interface ReviewVisual {
  sectionBg: string;
  cardBg: string;
  cardLine: string;
  text: string;
  textStrong: string;
  muted: string;
  accent: string;
  star: string;
  invert: string;
  radius: string;
  headingClass: string;
  eyebrowClass: string;
  buttonClass: string;
  buttonStyle: CSSProperties;
  ghostStyle: CSSProperties;
  inverted: boolean;
  inputBg: string;
}

export function reviewVisuals(themeId: SiteHeaderThemeId, appearance: WebsiteAppearance | undefined): ReviewVisual {
  const mode = appearance === 'dark' ? 'dark' : 'light';

  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return {
      sectionBg: t.charcoalSoft,
      cardBg: t.card,
      cardLine: t.line,
      text: t.muted,
      textStrong: t.textStrong,
      muted: t.muted,
      accent: t.gold,
      star: t.gold,
      invert: '#141414',
      radius: '',
      headingClass: 'text-2xl md:text-3xl font-black uppercase tracking-[0.05em]',
      eyebrowClass: 'text-[10px] font-bold uppercase tracking-[0.35em]',
      buttonClass: 'site-touch px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.18em]',
      buttonStyle: { backgroundColor: t.gold, color: '#141414' },
      ghostStyle: { border: `1px solid ${t.gold}`, color: t.gold, backgroundColor: 'transparent' },
      inverted: false,
      inputBg: t.well,
    };
  }

  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return {
      sectionBg: t.paperDeep,
      cardBg: t.card,
      cardLine: t.line,
      text: t.text,
      textStrong: t.textStrong,
      muted: t.muted,
      accent: t.roseDeep,
      star: t.rose,
      invert: mode === 'dark' ? '#241d1b' : '#ffffff',
      radius: '',
      headingClass: 'text-2xl md:text-3xl font-serif',
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      buttonClass: 'site-touch px-6 py-2.5 text-[10px] uppercase tracking-[0.22em] font-semibold border',
      buttonStyle: { borderColor: t.rose, color: t.roseDeep, backgroundColor: 'transparent' },
      ghostStyle: { border: `1px solid ${t.line}`, color: t.ink, backgroundColor: 'transparent' },
      inverted: false,
      inputBg: t.well,
    };
  }

  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return {
      sectionBg: t.beigeSoft,
      cardBg: t.card,
      cardLine: t.line,
      text: t.text,
      textStrong: t.textStrong,
      muted: t.muted,
      accent: t.emerald,
      star: t.emeraldMid,
      invert: '#ffffff',
      radius: 'rounded-3xl',
      headingClass: 'text-2xl md:text-3xl font-serif',
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      buttonClass: 'site-touch px-6 py-2.5 rounded-full text-[10px] uppercase tracking-[0.2em] font-semibold',
      buttonStyle: { backgroundColor: t.emerald, color: '#ffffff' },
      ghostStyle: { border: `1px solid ${t.emerald}`, color: t.emerald, backgroundColor: 'transparent' },
      inverted: false,
      inputBg: t.well,
    };
  }

  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return {
      sectionBg: t.white,
      cardBg: t.well,
      cardLine: t.line,
      text: t.ink,
      textStrong: t.heading,
      muted: t.muted,
      accent: t.teal,
      star: '#f2b243',
      invert: '#ffffff',
      radius: 'rounded-[1.5rem]',
      headingClass: 'text-2xl md:text-3xl font-extrabold tracking-[-0.03em]',
      eyebrowClass: 'text-[10px] font-extrabold uppercase tracking-[0.24em]',
      buttonClass: 'site-touch rounded-xl px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em]',
      buttonStyle: { backgroundColor: t.teal, color: '#ffffff' },
      ghostStyle: { border: `1px solid ${t.line}`, color: t.ink, backgroundColor: t.card },
      inverted: false,
      inputBg: t.card,
    };
  }

  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  const inverted = mode === 'light';
  return {
    sectionBg: t.artBand,
    cardBg: inverted ? 'rgba(255,255,255,0.06)' : t.card,
    cardLine: inverted ? 'rgba(255,255,255,0.14)' : t.line,
    text: inverted ? 'rgba(255,255,255,0.80)' : t.text,
    textStrong: inverted ? '#ffffff' : t.ink,
    muted: inverted ? 'rgba(255,255,255,0.55)' : t.muted,
    accent: t.pink,
    star: t.pink,
    invert: '#ffffff',
    radius: 'rounded-[1.5rem]',
    headingClass: 'text-2xl md:text-3xl font-extrabold tracking-[-0.02em]',
    eyebrowClass: 'text-[9px] font-extrabold uppercase tracking-[0.28em]',
    buttonClass: 'site-touch rounded-full px-5 py-2.5 text-[9px] font-extrabold uppercase tracking-[0.18em]',
    buttonStyle: { backgroundColor: t.pink, color: '#ffffff' },
    ghostStyle: {
      border: `1px solid ${inverted ? 'rgba(255,255,255,0.28)' : t.line}`,
      color: inverted ? '#ffffff' : t.ink,
      backgroundColor: 'transparent',
    },
    inverted,
    inputBg: inverted ? 'rgba(255,255,255,0.08)' : t.well,
  };
}
