/**
 * PHASE 11.6 — HERO CTA NAVIGATION.
 *
 * Conversion wiring for the hero's in-page CTAs. This is a thin wrapper over
 * the EXISTING Phase 10 navigation/booking systems — it adds no route, no
 * section and no second booking flow:
 *
 *   - Section ids resolve through the Phase 10.3 registry
 *     (`siteSectionDomId`), so a theme that aliases a section still lands on
 *     the right element instead of a hardcoded guess.
 *   - Scrolling honours `prefers-reduced-motion`: smooth for everyone else,
 *     an instant jump for visitors who asked for less motion. The shared
 *     Phase 10.1 `scrollToSiteSection()` is left exactly as it is.
 *   - In-page CTAs become real links (`href="#section-…"`), so they are
 *     keyboard-activatable, focusable, announced as links and openable in a
 *     new tab — while still scrolling smoothly on click.
 */
import type { MouseEvent } from 'react';
import type { SiteHeaderThemeId } from './siteNavigation';
import { scrollToSiteSection } from './siteNavigation';
import { siteSectionDomId } from './siteStructure';
import type { SiteSectionKey } from './siteStructure';
import { prefersReducedMotion } from './siteHeroMedia';

/** The in-page destinations a hero CTA may target. */
export type HeroNavTarget = Extract<SiteSectionKey, 'services' | 'gallery' | 'offers'>;

/** Resolves the real DOM id for a hero destination on a given theme. */
export function heroTargetId(themeId: SiteHeaderThemeId, key: SiteSectionKey): string {
  return siteSectionDomId(themeId, key);
}

/**
 * Scrolls to a hero destination. Falls back to the shared Phase 10 helper
 * when the visitor has not asked for reduced motion.
 */
export function heroScrollTo(targetId: string, reducedMotion = prefersReducedMotion()): void {
  if (typeof document === 'undefined') return;
  if (!reducedMotion) {
    scrollToSiteSection(targetId);
    return;
  }
  const el = document.getElementById(targetId);
  if (!el || typeof el.scrollIntoView !== 'function') return;
  try {
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
  } catch {
    el.scrollIntoView();
  }
}

export interface HeroLinkProps {
  href: string;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Props for an in-page hero CTA. Renders as a real anchor so the destination
 * is visible, keyboard-operable and openable in a new tab; the click handler
 * upgrades it to a (motion-aware) smooth scroll.
 */
export function heroLinkProps(
  themeId: SiteHeaderThemeId,
  key: SiteSectionKey,
  reducedMotion: boolean,
): HeroLinkProps {
  const targetId = heroTargetId(themeId, key);
  return {
    href: `#${targetId}`,
    onClick: (event) => {
      // Let modified clicks (new tab / new window) behave natively.
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) {
        return;
      }
      event.preventDefault();
      heroScrollTo(targetId, reducedMotion);
    },
  };
}

/**
 * Per-theme CTA motion signature. Each theme animates in its OWN language
 * (see `.site-hero-cta--*` in `index.css`); this only names the class so a
 * theme can never inherit another theme's interaction feel.
 */
export const HERO_CTA_MOTION: Record<SiteHeaderThemeId, string> = {
  barber_mens_grooming: 'site-hero-cta--barber',
  hair_studio_color_bar: 'site-hero-cta--hair',
  beauty_skin_spa: 'site-hero-cta--spa',
  family_full_service: 'site-hero-cta--family',
  nail_lash_studio: 'site-hero-cta--nail',
};

/** Full class string for a hero CTA: touch target + base states + theme feel. */
export function heroCtaClass(themeId: SiteHeaderThemeId, extra = ''): string {
  return `site-touch site-hero-cta ${HERO_CTA_MOTION[themeId]} ${extra}`.trim();
}
