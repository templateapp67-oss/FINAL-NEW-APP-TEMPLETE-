/**
 * PHASE 10.8 — per-theme social / latest-work visuals.
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

export interface SocialVisual {
  sectionBg: string;
  cardLine: string;
  textStrong: string;
  muted: string;
  accent: string;
  chipBg: string;
  radius: string;
  headingClass: string;
  eyebrowClass: string;
  viewClass: string;
  viewStyle: CSSProperties;
  overlay: string;
}

export function socialVisuals(themeId: SiteHeaderThemeId, appearance: WebsiteAppearance | undefined): SocialVisual {
  if (themeId === 'barber_mens_grooming') {
    const t = surfacesOf(BARBER_SURFACES, appearance);
    return {
      sectionBg: t.charcoalSoft,
      cardLine: t.line,
      textStrong: t.textStrong,
      muted: t.muted,
      accent: t.gold,
      chipBg: t.card,
      radius: '',
      headingClass: 'text-2xl md:text-3xl font-black uppercase tracking-[0.05em]',
      eyebrowClass: 'text-[10px] font-bold uppercase tracking-[0.35em]',
      viewClass: 'site-touch px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em]',
      viewStyle: { backgroundColor: t.gold, color: '#141414' },
      overlay: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
    };
  }
  if (themeId === 'hair_studio_color_bar') {
    const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
    return {
      sectionBg: t.paperDeep,
      cardLine: t.line,
      textStrong: t.textStrong,
      muted: t.muted,
      accent: t.roseDeep,
      chipBg: t.card,
      radius: '',
      headingClass: 'text-2xl md:text-3xl font-serif',
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      viewClass: 'site-touch px-3 py-1.5 text-[9px] uppercase tracking-[0.18em] font-semibold border',
      viewStyle: { borderColor: t.rose, color: '#ffffff', backgroundColor: 'transparent' },
      overlay: 'linear-gradient(to top, rgba(25,24,23,0.85), transparent)',
    };
  }
  if (themeId === 'beauty_skin_spa') {
    const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
    return {
      sectionBg: t.beigeSoft,
      cardLine: t.line,
      textStrong: t.textStrong,
      muted: t.muted,
      accent: t.emerald,
      chipBg: t.card,
      radius: 'rounded-[1.5rem]',
      headingClass: 'text-2xl md:text-3xl font-serif',
      eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
      viewClass: 'site-touch px-3 py-1.5 rounded-full text-[9px] uppercase tracking-[0.16em] font-semibold',
      viewStyle: { backgroundColor: t.emerald, color: '#ffffff' },
      overlay: 'linear-gradient(to top, rgba(21,89,74,0.85), transparent)',
    };
  }
  if (themeId === 'family_full_service') {
    const t = surfacesOf(FAMILY_SURFACES, appearance);
    return {
      sectionBg: t.white,
      cardLine: t.line,
      textStrong: t.heading,
      muted: t.muted,
      accent: t.teal,
      chipBg: t.well,
      radius: 'rounded-[1.5rem]',
      headingClass: 'text-2xl md:text-3xl font-extrabold tracking-[-0.03em]',
      eyebrowClass: 'text-[10px] font-extrabold uppercase tracking-[0.24em]',
      viewClass: 'site-touch rounded-xl px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em]',
      viewStyle: { backgroundColor: t.teal, color: '#ffffff' },
      overlay: 'linear-gradient(to top, rgba(18,56,91,0.80), transparent)',
    };
  }
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  return {
    sectionBg: t.cream,
    cardLine: t.line,
    textStrong: t.ink,
    muted: t.muted,
    accent: t.pink,
    chipBg: t.card,
    radius: 'rounded-[1.5rem]',
    headingClass: 'text-2xl md:text-3xl font-extrabold tracking-[-0.02em]',
    eyebrowClass: 'text-[9px] font-extrabold uppercase tracking-[0.28em]',
    viewClass: 'site-touch rounded-full px-3 py-1.5 text-[8px] font-extrabold uppercase tracking-[0.16em]',
    viewStyle: { backgroundColor: t.pink, color: '#ffffff' },
    overlay: 'linear-gradient(to top, rgba(33,27,36,0.80), transparent)',
  };
}
