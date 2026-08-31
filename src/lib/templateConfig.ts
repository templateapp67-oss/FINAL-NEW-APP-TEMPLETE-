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
import type { SalonData, TemplateConfigs, WebsiteAppearance } from '../types';
import { assertTemplateSwitchPreservesBusiness } from './templateSwitchInvariants';

export const OWNER_TEMPLATES: ReadonlyArray<{
  id: ThemeId;
  name: string;
  category: string;
  tagline: string;
  accent: string;
  image: string;
}> = [
  {
    id: 'barber_mens_grooming',
    name: THEME_LABELS.barber_mens_grooming,
    category: 'Barber Shop',
    tagline: 'Bold dark aesthetics, precision fades, beard sculpting and hot towel shaves.',
    accent: BARBER_THEME.gold,
    image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600&auto=format&fit=crop',
  },
  {
    id: 'hair_studio_color_bar',
    name: THEME_LABELS.hair_studio_color_bar,
    category: 'Premium Studio',
    tagline: 'Editorial warm minimalism, master balayage and vibrant color bar.',
    accent: HAIR_STUDIO_THEME.rose,
    image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop',
  },
  {
    id: 'beauty_skin_spa',
    name: THEME_LABELS.beauty_skin_spa,
    category: 'Spa & Wellness',
    tagline: 'Serene botanical sanctuary, holistic facials and rejuvenating rituals.',
    accent: BEAUTY_SPA_THEME.emerald,
    image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=600&auto=format&fit=crop',
  },
  {
    id: 'family_full_service',
    name: THEME_LABELS.family_full_service,
    category: 'Family Care',
    tagline: 'Welcoming community destination for multi-generational care and styling.',
    accent: FAMILY_FULL_SERVICE_THEME.blue,
    image: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?q=80&w=600&auto=format&fit=crop',
  },
  {
    id: 'nail_lash_studio',
    name: THEME_LABELS.nail_lash_studio,
    category: 'Nail & Boutique',
    tagline: 'Chic modern boutique specializing in custom nail art and lash extensions.',
    accent: NAIL_LASH_STUDIO_THEME.pink,
    image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=600&auto=format&fit=crop',
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

export type TemplateConfigField = keyof TemplateConfig;

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  appearance: 'light',
  accentColor: BARBER_THEME.gold,
  salonNameFont: 'elegant-serif',
  salonNameColor: '#1a1c1c',
  heroPosition: 'Center',
  showOwnerPhoto: true,
};

const COMMON_TEMPLATE_CONFIG_FIELDS = [
  'appearance',
  'accentColor',
  'salonNameFont',
  'salonNameColor',
] as const satisfies readonly TemplateConfigField[];

/**
 * Fail-closed capability matrix. A setting is copied, edited, and persisted
 * only when the target renderer supports it. Gallery/layout keys are not part
 * of this matrix and are therefore discarded rather than copied across themes.
 */
export const TEMPLATE_CONFIG_CAPABILITIES: Readonly<Record<ThemeId, readonly TemplateConfigField[]>> = {
  barber_mens_grooming: [...COMMON_TEMPLATE_CONFIG_FIELDS, 'heroPosition'],
  hair_studio_color_bar: [...COMMON_TEMPLATE_CONFIG_FIELDS, 'showOwnerPhoto'],
  beauty_skin_spa: [...COMMON_TEMPLATE_CONFIG_FIELDS, 'showOwnerPhoto'],
  family_full_service: [...COMMON_TEMPLATE_CONFIG_FIELDS, 'showOwnerPhoto'],
  nail_lash_studio: [...COMMON_TEMPLATE_CONFIG_FIELDS, 'showOwnerPhoto'],
};

const HERO_POSITIONS = new Set(['Top', 'Center', 'Bottom']);

export function templateSupportsConfig(
  templateId: ThemeId | string | null | undefined,
  field: TemplateConfigField,
): boolean {
  return TEMPLATE_CONFIG_CAPABILITIES[normalizeThemeId(templateId)].includes(field);
}

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

/** Strip unknown and target-incompatible values before writing JSONB. */
export function sanitizeTemplateConfigForTemplate(
  raw: Partial<TemplateConfig> | Record<string, unknown> | null | undefined,
  templateId: ThemeId | string | null | undefined,
): Partial<TemplateConfig> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const id = normalizeThemeId(templateId);
  const normalized = normalizeTemplateConfig(raw as Partial<TemplateConfig>, id);
  const sanitized: Partial<TemplateConfig> = {};
  for (const field of TEMPLATE_CONFIG_CAPABILITIES[id]) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      Object.assign(sanitized, { [field]: normalized[field] });
    }
  }
  return sanitized;
}

/** Sanitize the complete per-template map loaded from JSONB or local storage. */
export function normalizeTemplateConfigs(raw: unknown): TemplateConfigs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const normalized: TemplateConfigs = {};
  for (const templateId of THEME_IDS) {
    const value = source[templateId];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    normalized[templateId] = sanitizeTemplateConfigForTemplate(
      value as Record<string, unknown>,
      templateId,
    );
  }
  return normalized;
}

/** Resolve the active overlay, including backwards-compatible top-level aliases. */
export function activeTemplateConfigFromSalon(data: SalonData): TemplateConfig {
  return normalizeTemplateConfig({
    ...data.templateConfig,
    appearance: data.websiteAppearance ?? data.templateConfig?.appearance,
    accentColor: data.brandColor ?? data.templateConfig?.accentColor,
    salonNameFont: data.salonNameFont ?? data.templateConfig?.salonNameFont,
    salonNameColor: data.salonNameColor ?? data.templateConfig?.salonNameColor,
    heroPosition: data.heroPosition ?? data.templateConfig?.heroPosition,
  }, data.templateId);
}

function compatibleConfigForNewTemplate(
  current: TemplateConfig,
  currentTemplate: ThemeId,
  nextTemplate: ThemeId,
): Partial<TemplateConfig> {
  const sourceCapabilities = new Set(TEMPLATE_CONFIG_CAPABILITIES[currentTemplate]);
  const compatible: Partial<TemplateConfig> = {};
  for (const field of TEMPLATE_CONFIG_CAPABILITIES[nextTemplate]) {
    if (sourceCapabilities.has(field)) Object.assign(compatible, { [field]: current[field] });
  }
  return compatible;
}

/** Owner photo is presentation-only and is hidden when unsupported or disabled. */
export function shouldShowOwnerPhoto(data: Pick<SalonData, 'templateConfig' | 'templateId'>): boolean {
  return templateSupportsConfig(data.templateId, 'showOwnerPhoto')
    && normalizeTemplateConfig(data.templateConfig, data.templateId).showOwnerPhoto;
}

export function heroObjectPosition(data: Pick<SalonData, 'heroPosition' | 'templateConfig'>): string {
  const pos = data.heroPosition || data.templateConfig?.heroPosition || 'Center';
  if (pos === 'Top') return 'center top';
  if (pos === 'Bottom') return 'center bottom';
  return 'center center';
}

/** Merge supported config into salon presentation fields without touching business arrays. */
export function applyTemplateConfigToSalon(
  data: SalonData,
  config: Partial<TemplateConfig>,
): SalonData {
  const templateId = normalizeThemeId(data.templateId);
  const supportedPatch = sanitizeTemplateConfigForTemplate(config, templateId);
  const next = normalizeTemplateConfig({
    ...activeTemplateConfigFromSalon(data),
    ...supportedPatch,
  }, templateId);
  return {
    ...data,
    templateConfig: next,
    templateConfigs: {
      ...normalizeTemplateConfigs(data.templateConfigs),
      [templateId]: sanitizeTemplateConfigForTemplate(next, templateId),
    },
    websiteAppearance: next.appearance,
    brandColor: next.accentColor,
    salonNameFont: next.salonNameFont,
    salonNameColor: next.salonNameColor,
    heroPosition: templateSupportsConfig(templateId, 'heroPosition') ? next.heroPosition : undefined,
  };
}

/**
 * Restore one template directly from its saved per-template entry. This is
 * used during hydration because template_key can be newer than the legacy
 * top-level aliases when a page reload lands between the switch RPC and the
 * debounced visual-config save.
 */
export function restoreSavedTemplatePresentation(
  data: SalonData,
  template: ThemeId | OwnerTemplateKey | string,
): SalonData | null {
  const templateId = normalizeThemeId(template);
  const savedConfigs = normalizeTemplateConfigs(data.templateConfigs);
  const saved = savedConfigs[templateId];
  if (!saved) return null;
  const config = normalizeTemplateConfig(saved, templateId);
  const restored: SalonData = {
    ...data,
    templateId,
    templateConfig: config,
    templateConfigs: {
      ...savedConfigs,
      [templateId]: sanitizeTemplateConfigForTemplate(config, templateId),
    },
    brandColor: config.accentColor,
    websiteAppearance: config.appearance,
    salonNameFont: config.salonNameFont,
    salonNameColor: config.salonNameColor,
    heroPosition: templateSupportsConfig(templateId, 'heroPosition') ? config.heroPosition : undefined,
  };
  assertTemplateSwitchPreservesBusiness(data, restored);
  return restored;
}

/**
 * Presentation-only template switch on the SAME salon. The outgoing template
 * keeps its own sanitized config; a previously visited target restores its
 * saved config, while a first visit receives only settings supported by both
 * renderers. No business/content field is cloned or recreated.
 */
export function switchSalonTemplatePresentation(
  data: SalonData,
  nextTemplate: ThemeId | OwnerTemplateKey | string,
): SalonData {
  const currentTemplate = normalizeThemeId(data.templateId);
  const templateId = normalizeThemeId(nextTemplate);
  if (templateId === currentTemplate) return data;
  const currentConfig = activeTemplateConfigFromSalon(data);
  const savedConfigs = normalizeTemplateConfigs(data.templateConfigs);
  const configsWithCurrent: TemplateConfigs = {
    ...savedConfigs,
    [currentTemplate]: sanitizeTemplateConfigForTemplate(currentConfig, currentTemplate),
  };
  const savedTarget = savedConfigs[templateId];
  const targetSeed = savedTarget ?? compatibleConfigForNewTemplate(
    currentConfig,
    currentTemplate,
    templateId,
  );
  const config = normalizeTemplateConfig(targetSeed, templateId);
  const switched: SalonData = {
    ...data,
    templateId,
    templateConfig: config,
    templateConfigs: {
      ...configsWithCurrent,
      [templateId]: sanitizeTemplateConfigForTemplate(config, templateId),
    },
    brandColor: config.accentColor,
    websiteAppearance: config.appearance,
    salonNameFont: config.salonNameFont,
    salonNameColor: config.salonNameColor,
    heroPosition: templateSupportsConfig(templateId, 'heroPosition') ? config.heroPosition : undefined,
  };

  // Fail closed at runtime if this helper ever starts changing a business field.
  assertTemplateSwitchPreservesBusiness(data, switched);
  return switched;
}

export function assertFiveTemplates(): ThemeId[] {
  if (THEME_IDS.length !== 5) {
    throw new Error('Phase 1-B requires exactly five owner templates.');
  }
  return [...THEME_IDS];
}

export { DEFAULT_THEME_ID, THEME_IDS, THEME_LABELS, normalizeThemeId };
export type { ThemeId };
