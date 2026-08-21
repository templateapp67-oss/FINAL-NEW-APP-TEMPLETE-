import type { SiteHeaderThemeId } from './siteNavigation';
import type { AppLocale } from './locale';

export interface VariantsI18nCopy {
  selectVariantLabel: string;
  variantPriceLabel: string;
  variantDurationLabel: string;
  variantSelectedBadge: string;
}

export const VARIANTS_TEXT: Record<SiteHeaderThemeId, Record<AppLocale, VariantsI18nCopy>> = {
  barber_mens_grooming: {
    en: {
      selectVariantLabel: 'Select Barber Level / Option:',
      variantPriceLabel: 'Price:',
      variantDurationLabel: 'Duration:',
      variantSelectedBadge: 'Selected',
    },
    hi: {
      selectVariantLabel: 'बार्बर स्तर / विकल्प चुनें:',
      variantPriceLabel: 'मूल्य:',
      variantDurationLabel: 'अवधि:',
      variantSelectedBadge: 'चुना गया',
    },
  },

  hair_studio_color_bar: {
    en: {
      selectVariantLabel: 'Select Hair Length / Option:',
      variantPriceLabel: 'Price:',
      variantDurationLabel: 'Duration:',
      variantSelectedBadge: 'Selected',
    },
    hi: {
      selectVariantLabel: 'बालों की लंबाई / विकल्प चुनें:',
      variantPriceLabel: 'मूल्य:',
      variantDurationLabel: 'अवधि:',
      variantSelectedBadge: 'चुना गया',
    },
  },

  beauty_skin_spa: {
    en: {
      selectVariantLabel: 'Select Duration / Spa Intensity:',
      variantPriceLabel: 'Price:',
      variantDurationLabel: 'Duration:',
      variantSelectedBadge: 'Selected',
    },
    hi: {
      selectVariantLabel: 'अवधि / स्पा स्तर चुनें:',
      variantPriceLabel: 'मूल्य:',
      variantDurationLabel: 'अवधि:',
      variantSelectedBadge: 'चुना गया',
    },
  },

  family_full_service: {
    en: {
      selectVariantLabel: 'Select Stylist Level / Service Option:',
      variantPriceLabel: 'Price:',
      variantDurationLabel: 'Duration:',
      variantSelectedBadge: 'Selected',
    },
    hi: {
      selectVariantLabel: 'स्टाइलिस्ट स्तर / विकल्प चुनें:',
      variantPriceLabel: 'मूल्य:',
      variantDurationLabel: 'अवधि:',
      variantSelectedBadge: 'चुना गया',
    },
  },

  nail_lash_studio: {
    en: {
      selectVariantLabel: 'Select Length / Lash Volume Set:',
      variantPriceLabel: 'Price:',
      variantDurationLabel: 'Duration:',
      variantSelectedBadge: 'Selected',
    },
    hi: {
      selectVariantLabel: 'लंबाई / वॉल्यूम सेट चुनें:',
      variantPriceLabel: 'मूल्य:',
      variantDurationLabel: 'अवधि:',
      variantSelectedBadge: 'चुना गया',
    },
  },
};

export function siteVariantsText(themeId: SiteHeaderThemeId, locale: AppLocale = 'en'): VariantsI18nCopy {
  return VARIANTS_TEXT[themeId]?.[locale] || VARIANTS_TEXT[themeId]?.en || VARIANTS_TEXT.barber_mens_grooming.en;
}
