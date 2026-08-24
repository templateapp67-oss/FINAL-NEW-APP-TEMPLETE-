/**
 * PHASE 1-B — Template configuration.
 *
 * Visual / presentation settings live in `salon_public_websites.config`
 * (JSONB). They are NOT core business data. Switching templates updates
 * `template_key` / `salons.theme_id` only; this config is preserved and
 * re-applied as presentation overlays.
 *
 * Do not store services, bookings, payments, staff, or ownership here.
 */

import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  THEME_LABELS,
  type ThemeId,
  normalizeThemeId,
  BARBER_THEME,
  HAIR_STUDIO_THEME,
  BEAUTY_SPA_THEME,
  FAMILY_FULL_SERVICE_THEME,
  NAIL_LASH_STUDIO_THEME,
} from './themeServices';
import type { OwnerTemplateKey } from './ownerProvisioning';
import type { SalonData, WebsiteAppearance } from '../types';

export const OWNER_TEMPLATES: ReadonlyArray<{
  id: ThemeId;
  name: string;
  category: string;
  tagline: string;
  accent: string;
}> = [
  {
    id: 'barber_mens_grooming',
    name: THEME_LABELS.barber_mens_grooming,
    category: 'Barber Shop',
    tagline: 'Bold dark aesthetics, precision fades, beard sculpting and hot towel shaves.',
    accent: BARBER_THEME.gold,
  },
  {
    id: 'hair_studio_color_bar',
    name: THEME_LABELS.hair_studio_color_bar,
    category: 'Premium Studio',
    tagline: 'Editorial warm minimalism, master balayage and vibrant color bar.',
    accent: HAIR_STUDIO_THEME.rose,
  },
  {
    id: 'beauty_skin_spa',
    name: THEME_LABELS.beauty_skin_spa,
    category: 'Spa & Wellness',
    tagline: 'Serene botanical sanctuary, holistic facials and rejuvenating rituals.',
    accent: BEAUTY_SPA_THEME.emerald,
  },
  {
    id: 'family_full_service',
    name: THEME_LABELS.family_full_service,
    category: 'Family Care',
    tagline: 'Welcoming community destination for multi-generational care and styling.',
    accent: FAMILY_FULL_SERVICE_THEME.blue,
  },
  {
    id: 'nail_lash_studio',
    name: THEME_LABELS.nail_lash_studio,
    category: 'Nail & Boutique',
    tagline: 'Chic modern boutique specializing in custom nail art and lash extensions.',
    accent: NAIL_LASH_STUDIO_THEME.pink,
  },
];

export function listOwnerTemplates() {
  return OWNER_TEMPLATES;
}

export function defaultAccentForTemplate(id: ThemeId | string | undefined): string {
  const key = normalizeThemeId(id);
  return OWNER_TEMPLATES.find((t) => t.id === key)?.accent || BARBER_THEME.gold;
}

/** Presentation-only fields persisted inside salon_public_websites.config. */
export interface TemplateConfig {
  appearance: WebsiteAppearance;
  accentColor: string;
  salonNameFont: string;
  salonNameColor: string;
  heroPosition: 'Top' | 'Center' | 'Bottom';
  showOwnerPhoto: boolean;
}

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  appearance: 'light',
  accentColor: BARBER_THEME.gold,
  salonNameFont: 'display',
  salonNameColor: '#1a1c1c',
  heroPosition: 'Center',
  showOwnerPhoto: true,
};

const HERO_POSITIONS = new Set(['Top', 'Center', 'Bottom']);

export function normalizeTemplateConfig(
  raw: Partial<TemplateConfig> | null | undefined,
  templateId?: ThemeId | string | null,
): TemplateConfig {
  const fallbackAccent = defaultAccentForTemplate(templateId || DEFAULT_THEME_ID);
  return {
    appearance: raw?.appearance === 'dark' ? 'dark' : 'light',
    accentColor:
      typeof raw?.accentColor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.accentColor)
        ? raw.accentColor
        : fallbackAccent,
    salonNameFont: typeof raw?.salonNameFont === 'string' && raw.salonNameFont.trim()
      ? raw.salonNameFont.trim().slice(0, 40)
      : DEFAULT_TEMPLATE_CONFIG.salonNameFont,
    salonNameColor:
      typeof raw?.salonNameColor === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.salonNameColor)
        ? raw.salonNameColor
        : DEFAULT_TEMPLATE_CONFIG.salonNameColor,
    heroPosition: raw?.heroPosition && HERO_POSITIONS.has(raw.heroPosition)
      ? raw.heroPosition
      : 'Center',
    showOwnerPhoto: raw?.showOwnerPhoto !== false,
  };
}

/** Merge config into salon presentation fields without touching business arrays. */
export function applyTemplateConfigToSalon(
  data: SalonData,
  config: Partial<TemplateConfig>,
): SalonData {
  const next = normalizeTemplateConfig({ ...data.templateConfig, ...config }, data.templateId);
  return {
    ...data,
    templateConfig: next,
    websiteAppearance: next.appearance,
    brandColor: next.accentColor,
    salonNameFont: next.salonNameFont,
    salonNameColor: next.salonNameColor,
    heroPosition: next.heroPosition,
  };
}

/**
 * Presentation-only template switch. Keeps services, packages, team, gallery,
 * bookings-related rules, and identity fields intact.
 */
export function switchSalonTemplatePresentation(
  data: SalonData,
  nextTemplate: ThemeId | OwnerTemplateKey | string,
): SalonData {
  const templateId = normalizeThemeId(nextTemplate);
  const config = normalizeTemplateConfig(
    {
      ...data.templateConfig,
      accentColor: data.templateConfig?.accentColor || defaultAccentForTemplate(templateId),
    },
    templateId,
  );
  return {
    ...data,
    templateId,
    templateConfig: config,
    brandColor: config.accentColor,
    websiteAppearance: config.appearance,
    salonNameFont: config.salonNameFont,
    salonNameColor: config.salonNameColor,
    heroPosition: config.heroPosition,
    services: data.services || [],
    packages: data.packages || [],
    team: data.team || [],
    gallery: data.gallery || [],
    offers: data.offers || [],
  };
}

export function assertFiveTemplates(): ThemeId[] {
  if (THEME_IDS.length !== 5) {
    throw new Error('Phase 1-B requires exactly five owner templates.');
  }
  return [...THEME_IDS];
}

export { DEFAULT_THEME_ID, THEME_IDS, THEME_LABELS, normalizeThemeId };
export type { ThemeId };
