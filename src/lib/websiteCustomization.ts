export interface BrandColorPreset {
  name: string;
  value: string;
}

/** Shared by onboarding and the published website editor so both stay in sync. */
export const BRAND_COLORS: BrandColorPreset[] = [
  { name: 'Charcoal', value: '#1a1c1c' },
  { name: 'Nexora Pink', value: '#ac0053' },
  { name: 'Warm Taupe', value: '#8b6f61' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Royal Blue', value: '#2563eb' },
];

export const DEFAULT_BRAND_COLOR = '#ac0053';

export const TAGLINE_CATEGORIES: Record<string, Record<string, string[]>> = {
  Salon: {
    'Hair Salon': [
      'Where your best look begins.',
      'Style that feels unmistakably you.',
      'Expert care for beautiful hair.',
      'Your everyday beauty, elevated.',
      'Confidence in every strand.',
    ],
    'Unisex Salon': [
      'Modern style for every expression.',
      'One salon, every kind of style.',
      'Made for your look and lifestyle.',
      'Feel good. Look your best.',
      'Personal style, professionally finished.',
    ],
    'Luxury Salon': [
      'Where luxury meets your signature style.',
      'An elevated salon experience, made for you.',
      'Refined beauty. Exceptional care.',
      'Luxury styling with a personal touch.',
      'Your signature look, beautifully crafted.',
    ],
  },
  Beauty: {
    'Beauty Parlour': [
      'Beautiful moments, beautifully made.',
      'Your beauty, our signature.',
      'Care that brings your glow to life.',
      'Feel radiant, every day.',
      'Personalized beauty for you.',
    ],
    Makeup: [
      'Make every moment your moment.',
      'Artistry for your most beautiful days.',
      'Your features, beautifully amplified.',
      'Makeup that moves with you.',
      'Glow with confidence.',
    ],
    Skincare: [
      'Healthy skin. Timeless confidence.',
      'Nourish your glow naturally.',
      'Thoughtful care for radiant skin.',
      'Your skin, at its most beautiful.',
      'A better glow starts with better care.',
    ],
  },
  Spa: {
    'Day Spa': [
      'Pause, breathe, and feel renewed.',
      'Your time to restore and reconnect.',
      'Wellness that stays with you.',
      'A calmer way to feel your best.',
      'Relaxation, thoughtfully perfected.',
    ],
    'Wellness Spa': [
      'Wellness for your body, mind, and soul.',
      'Restore your balance. Renew your energy.',
      'A deeper kind of self-care.',
      'Feel better from the inside out.',
      'Your wellbeing, beautifully supported.',
    ],
    'Medical Spa': [
      'Advanced care for your natural confidence.',
      'Expert wellness, beautifully personalized.',
      'Science-backed care, naturally you.',
      'Where innovation meets wellbeing.',
      'Your most confident self, supported.',
    ],
  },
};

export const TAGLINE_SUBCATEGORIES: Record<string, string[]> = Object.fromEntries(
  Object.entries(TAGLINE_CATEGORIES).map(([category, subcategories]) => [category, Object.keys(subcategories)]),
);

/** Add an alpha channel to a six-digit hex color. Falls back safely for invalid saved values. */
export function withHexAlpha(color: string | undefined, alpha: string): string {
  const normalized = color?.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized || '')
    ? `${normalized}${alpha}`
    : `${DEFAULT_BRAND_COLOR}${alpha}`;
}

/** Choose readable text for a user-selected button/background color. */
export function getReadableTextColor(color: string | undefined): '#ffffff' | '#111827' {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return '#ffffff';

  const value = color!.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance > 150 ? '#111827' : '#ffffff';
}
