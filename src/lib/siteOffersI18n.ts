import type { SiteHeaderThemeId } from './siteNavigation';
import type { AppLocale } from './locale';

export interface OffersI18nCopy {
  eyebrow: string;
  title: string;
  validityLabel: string;
  applicableServiceLabel: string;
  originalPriceLabel: string;
  discountedPriceLabel: string;
  bookOfferCta: string;
  emptyTitle: string;
  emptyBody: string;
  loadingText: string;
  errorTitle: string;
  errorBody: string;
  retryButton: string;
}

export const OFFERS_TEXT: Record<SiteHeaderThemeId, Record<AppLocale, OffersI18nCopy>> = {
  barber_mens_grooming: {
    en: {
      eyebrow: 'EXCLUSIVE OFFERS',
      title: "LIMITED-TIME GENTLEMAN'S DEALS",
      validityLabel: 'Validity:',
      applicableServiceLabel: 'Applicable Service:',
      originalPriceLabel: 'Original:',
      discountedPriceLabel: 'Special Price:',
      bookOfferCta: 'BOOK OFFER',
      emptyTitle: 'No active offers right now',
      emptyBody: 'Check back soon for seasonal barbering promotions and discounts.',
      loadingText: 'Loading barber offers...',
      errorTitle: 'Unable to load offers',
      errorBody: 'Please try again to view active barbering discounts.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'विशेष फ़ायदे',
      title: 'सीमित समय के बार्बर ऑफ़र',
      validityLabel: 'वैधता:',
      applicableServiceLabel: 'लागू सेवा:',
      originalPriceLabel: 'मूल मूल्य:',
      discountedPriceLabel: 'विशेष मूल्य:',
      bookOfferCta: 'ऑफ़र बुक करें',
      emptyTitle: 'अभी कोई सक्रिय ऑफ़र नहीं हैं',
      emptyBody: 'सीज़न ऑफ़र और छूट के लिए जल्द ही फिर देखें।',
      loadingText: 'ऑफ़र लोड हो रहे हैं...',
      errorTitle: 'ऑफ़र लोड करने में असमर्थ',
      errorBody: 'सक्रिय छूट देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },

  hair_studio_color_bar: {
    en: {
      eyebrow: 'STUDIO SPECIALS',
      title: 'CURATED HAIR & COLOR OFFERS',
      validityLabel: 'Validity:',
      applicableServiceLabel: 'Applicable Service:',
      originalPriceLabel: 'Original:',
      discountedPriceLabel: 'Special Price:',
      bookOfferCta: 'BOOK OFFER',
      emptyTitle: 'No active studio specials right now',
      emptyBody: 'Check back soon for seasonal hair coloring and cut offers.',
      loadingText: 'Loading studio offers...',
      errorTitle: 'Unable to load offers',
      errorBody: 'Please try again to view active hair studio discounts.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'स्टूडियो स्पेशल',
      title: 'चुनिंदा हेयर एवं कलर ऑफ़र',
      validityLabel: 'वैधता:',
      applicableServiceLabel: 'लागू सेवा:',
      originalPriceLabel: 'मूल मूल्य:',
      discountedPriceLabel: 'विशेष मूल्य:',
      bookOfferCta: 'ऑफ़र बुक करें',
      emptyTitle: 'अभी कोई सक्रिय ऑफ़र नहीं हैं',
      emptyBody: 'हेयर और कलर ऑफ़र के लिए जल्द ही फिर देखें।',
      loadingText: 'ऑफ़र लोड हो रहे हैं...',
      errorTitle: 'ऑफ़र लोड करने में असमर्थ',
      errorBody: 'सक्रिय छूट देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },

  beauty_skin_spa: {
    en: {
      eyebrow: 'SPA & GLOW OFFERS',
      title: 'WELLNESS & SKIN CARE SPECIALS',
      validityLabel: 'Validity:',
      applicableServiceLabel: 'Applicable Service:',
      originalPriceLabel: 'Original:',
      discountedPriceLabel: 'Special Price:',
      bookOfferCta: 'BOOK OFFER',
      emptyTitle: 'No active spa specials right now',
      emptyBody: 'Check back soon for seasonal facial and wellness offers.',
      loadingText: 'Loading spa offers...',
      errorTitle: 'Unable to load offers',
      errorBody: 'Please try again to view active spa discounts.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'स्पा एवं ग्लो फ़ायदे',
      title: 'वेलनेस एवं स्किन केयर स्पेशल',
      validityLabel: 'वैधता:',
      applicableServiceLabel: 'लागू सेवा:',
      originalPriceLabel: 'मूल मूल्य:',
      discountedPriceLabel: 'विशेष मूल्य:',
      bookOfferCta: 'ऑफ़र बुक करें',
      emptyTitle: 'अभी कोई सक्रिय ऑफ़र नहीं हैं',
      emptyBody: 'फेशियल और वेलनेस ऑफ़र के लिए जल्द ही फिर देखें।',
      loadingText: 'ऑफ़र लोड हो रहे हैं...',
      errorTitle: 'ऑफ़र लोड करने में असमर्थ',
      errorBody: 'सक्रिय छूट देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },

  family_full_service: {
    en: {
      eyebrow: 'FAMILY OFFERS & DISCOUNTS',
      title: 'SAVINGS FOR THE WHOLE FAMILY',
      validityLabel: 'Validity:',
      applicableServiceLabel: 'Applicable Service:',
      originalPriceLabel: 'Original:',
      discountedPriceLabel: 'Special Price:',
      bookOfferCta: 'BOOK OFFER',
      emptyTitle: 'No active family offers right now',
      emptyBody: 'Check back soon for family savings and multi-service discounts.',
      loadingText: 'Loading family offers...',
      errorTitle: 'Unable to load offers',
      errorBody: 'Please try again to view active family discounts.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'फ़ैमिली ऑफ़र एवं छूट',
      title: 'पूरे परिवार के लिए बचत',
      validityLabel: 'वैधता:',
      applicableServiceLabel: 'लागू सेवा:',
      originalPriceLabel: 'मूल मूल्य:',
      discountedPriceLabel: 'विशेष मूल्य:',
      bookOfferCta: 'ऑफ़र बुक करें',
      emptyTitle: 'अभी कोई सक्रिय फ़ैमिली ऑफ़र नहीं हैं',
      emptyBody: 'पारिवारिक छूट और ऑफ़र के लिए जल्द ही फिर देखें।',
      loadingText: 'ऑफ़र लोड हो रहे हैं...',
      errorTitle: 'ऑफ़र लोड करने में असमर्थ',
      errorBody: 'सक्रिय छूट देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },

  nail_lash_studio: {
    en: {
      eyebrow: 'GLAM & LASH DEALS',
      title: 'STUDIO NAILS & BEAUTY OFFERS',
      validityLabel: 'Validity:',
      applicableServiceLabel: 'Applicable Service:',
      originalPriceLabel: 'Original:',
      discountedPriceLabel: 'Special Price:',
      bookOfferCta: 'BOOK OFFER',
      emptyTitle: 'No active glam deals right now',
      emptyBody: 'Check back soon for nail art, lash and brow specials.',
      loadingText: 'Loading studio offers...',
      errorTitle: 'Unable to load offers',
      errorBody: 'Please try again to view active nail studio discounts.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'ग्लैम एवं लैश डील',
      title: 'स्टूडियो नेल्स एवं ब्यूटी ऑफ़र',
      validityLabel: 'वैधता:',
      applicableServiceLabel: 'लागू सेवा:',
      originalPriceLabel: 'मूल मूल्य:',
      discountedPriceLabel: 'विशेष मूल्य:',
      bookOfferCta: 'ऑफ़र बुक करें',
      emptyTitle: 'अभी कोई सक्रिय ऑफ़र नहीं हैं',
      emptyBody: 'नेल्स और लैश ऑफ़र के लिए जल्द ही फिर देखें।',
      loadingText: 'ऑफ़र लोड हो रहे हैं...',
      errorTitle: 'ऑफ़र लोड करने में असमर्थ',
      errorBody: 'सक्रिय छूट देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },
};

export function siteOffersText(themeId: SiteHeaderThemeId, locale: AppLocale = 'en'): OffersI18nCopy {
  return OFFERS_TEXT[themeId]?.[locale] || OFFERS_TEXT[themeId]?.en || OFFERS_TEXT.barber_mens_grooming.en;
}
