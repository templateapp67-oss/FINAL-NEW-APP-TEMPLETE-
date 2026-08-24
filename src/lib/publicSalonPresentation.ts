/**
 * Public site resolution: Business → Active Template → Template Configuration.
 *
 * `template_key` from get_public_salon_website is the only template authority.
 * Visual overlay comes from the field-limited public_config (never a hardcoded
 * theme and never a stale config.templateId).
 */

import type { SalonData } from '../types';
import {
  applyTemplateConfigToSalon,
  normalizeTemplateConfigs,
  restoreSavedTemplatePresentation,
  sanitizeTemplateConfigForTemplate,
  type TemplateConfig,
} from './templateConfig';
import { DEFAULT_THEME_ID, normalizeThemeId, type ThemeId } from './themeServices';

const PUBLIC_TEMPLATE_KEYS = new Set<ThemeId>([
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
]);

export function publicTemplateIdFromWebsite(templateKey: unknown): ThemeId {
  if (typeof templateKey === 'string' && PUBLIC_TEMPLATE_KEYS.has(templateKey as ThemeId)) {
    return templateKey as ThemeId;
  }
  return normalizeThemeId(typeof templateKey === 'string' ? templateKey : DEFAULT_THEME_ID);
}

export function applyPublicTemplateConfiguration(
  data: SalonData,
  publicConfig: Partial<SalonData> | Record<string, unknown>,
  templateKey: unknown,
): SalonData {
  const templateId = publicTemplateIdFromWebsite(templateKey);
  const raw = publicConfig && typeof publicConfig === 'object' && !Array.isArray(publicConfig)
    ? publicConfig as Partial<SalonData>
    : {};
  const withTemplate: SalonData = {
    ...data,
    ...raw,
    templateId,
    templateConfig: sanitizeTemplateConfigForTemplate(raw.templateConfig, templateId),
    templateConfigs: normalizeTemplateConfigs(raw.templateConfigs),
  };
  const restored = restoreSavedTemplatePresentation(withTemplate, templateId);
  if (restored) return restored;
  return applyTemplateConfigToSalon(withTemplate, (raw.templateConfig || {}) as Partial<TemplateConfig>);
}
