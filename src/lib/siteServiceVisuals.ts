/**
 * PHASE 12.7 — SERVICE IMAGES & VISUALS helpers (all five themes).
 *
 * Resolves the visuals for a service from its EXISTING configured media only
 * (`Service.media.imageUrl` / `iconUrl` / `bannerUrl`). Nothing here invents a
 * media URL or falls back to a hardcoded image — a service with no configured
 * media gets the themed category glyph from the caller instead.
 *
 *   - `url`       → hero visual, preference order image → banner → icon.
 *   - `iconUrl`   → a distinct icon thumbnail (when `iconUrl` is not already
 *                   the hero) — the "Icon" slot.
 *   - `galleryUrl`→ the `bannerUrl` when it is not already the hero — the
 *                   "Optional Gallery Image" slot.
 */
import type { Service } from '../types';
import type { AppLocale } from './locale';
import { displayService } from './displayService';
import type { LucideIcon } from 'lucide-react';
import {
  Baby,
  Droplets,
  Eye,
  Flower2,
  Hand,
  Package as PackageIcon,
  Palette,
  Scissors,
  Sparkles,
} from 'lucide-react';

export type ServiceVisualKind = 'image' | 'banner' | 'icon' | 'none';

export interface ServiceVisuals {
  url: string;
  kind: ServiceVisualKind;
  /** Localized service name — used as the image alt text. */
  alt: string;
  /** `iconUrl` when distinct from the hero (the Icon slot). */
  iconUrl: string | null;
  /** `bannerUrl` when distinct from the hero (the Optional Gallery slot). */
  galleryUrl: string | null;
}

export function serviceVisuals(service: Service, locale: AppLocale): ServiceVisuals {
  const shown = displayService(service, locale);
  const alt = shown.name;
  const url = shown.imageUrl || shown.bannerUrl || shown.iconUrl || '';
  const kind: ServiceVisualKind = shown.imageUrl
    ? 'image'
    : shown.bannerUrl
      ? 'banner'
      : shown.iconUrl
        ? 'icon'
        : 'none';
  return {
    url,
    kind,
    alt,
    iconUrl: shown.iconUrl && shown.iconUrl !== url ? shown.iconUrl : null,
    galleryUrl: shown.bannerUrl && shown.bannerUrl !== url ? shown.bannerUrl : null,
  };
}

/**
 * Theme-scoped category → glyph map. Because every category label belongs to
 * exactly one theme, the glyph is inherently theme-correct and can never mix a
 * barber visual into the nail/lash theme (and vice versa).
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // Barber
  Haircuts: Scissors,
  'Beard & Shave': Sparkles,
  'Grooming & Treatments': Droplets,
  // Hair Studio
  'Styling & Cuts': Scissors,
  'Hair Color': Palette,
  Treatments: Droplets,
  // Beauty / Spa
  'Facial & Skincare': Sparkles,
  'Spa & Body': Droplets,
  'Waxing & Threading': Flower2,
  Makeup: Palette,
  // Family Salon
  "Men's Services": Scissors,
  "Women's Services": Sparkles,
  'Kids Special': Baby,
  Combos: PackageIcon,
  // Nail & Lash
  'Nail Art & Gel': Palette,
  'Pedicure & Manicure': Hand,
  'Lash & Brow': Eye,
};

export function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category] || Sparkles;
}
