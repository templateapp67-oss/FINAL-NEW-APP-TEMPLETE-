/**
 * Brand Identity presets for the salon name.
 *
 * The owner picks one font style and one text color for the salon name.
 * The selection is stored on `SalonData.salonNameFont` / `SalonData.salonNameColor`
 * and applied to the salon name wherever it is rendered on the public website
 * (TemplateRenderer, PreviewPane, CustomerBookingPreview).
 */
import type { CSSProperties } from 'react';

export interface SalonNameFontPreset {
  id: string;
  label: string;
  fontFamily: string;
  fontWeight: number;
  letterSpacing?: string;
  textTransform?: 'uppercase';
}

export interface SalonNameColorPreset {
  label: string;
  value: string;
}

/** 5 bold font/text style options for the salon name. */
export const SALON_NAME_FONTS: SalonNameFontPreset[] = [
  {
    id: 'elegant-serif',
    label: 'Elegant Serif',
    fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
    fontWeight: 700,
  },
  {
    id: 'modern-sans',
    label: 'Modern Sans',
    fontFamily: "'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontWeight: 800,
  },
  {
    id: 'luxury-script',
    label: 'Luxury Script',
    fontFamily: "'Great Vibes', 'Snell Roundhand', 'Brush Script MT', cursive",
    fontWeight: 400,
  },
  {
    id: 'bold-display',
    label: 'Bold Display',
    fontFamily: "'Oswald', 'Arial Narrow', Impact, sans-serif",
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  {
    id: 'editorial-slab',
    label: 'Editorial Slab',
    fontFamily: "'Arvo', 'Rockwell', 'Courier New', Georgia, serif",
    fontWeight: 700,
  },
];

/** 5 theme-matching text color options for the salon name. */
export const SALON_NAME_COLORS: SalonNameColorPreset[] = [
  { label: 'Charcoal', value: '#1a1c1c' },
  { label: 'Nexora Pink', value: '#ac0053' },
  { label: 'Deep Gold', value: '#b45309' },
  { label: 'Emerald', value: '#047857' },
  { label: 'Royal Blue', value: '#1d4ed8' },
];

export function getFontPreset(fontId?: string): SalonNameFontPreset | undefined {
  return SALON_NAME_FONTS.find(f => f.id === fontId);
}

/**
 * Build inline CSS styles for the salon name from the saved selection.
 * Returns an empty-ish style when nothing is selected so existing looks are preserved.
 */
export function getSalonNameStyle(data: { salonNameFont?: string; salonNameColor?: string }): CSSProperties {
  const style: CSSProperties = {};
  const font = getFontPreset(data.salonNameFont);
  if (font) {
    style.fontFamily = font.fontFamily;
    style.fontWeight = font.fontWeight;
    if (font.letterSpacing) style.letterSpacing = font.letterSpacing;
    if (font.textTransform) style.textTransform = font.textTransform;
  }
  if (data.salonNameColor) style.color = data.salonNameColor;
  return style;
}
