import type { SiteHeaderThemeId } from './siteNavigation';
import type { AppLocale } from './locale';

export interface CombosI18nCopy {
  eyebrow: string;
  title: string;
  includedServicesLabel: string;
  regularTotalLabel: string;
  comboPriceLabel: string;
  saveDiscountLabel: string;
  bookComboCta: string;
  emptyTitle: string;
  emptyBody: string;
  loadingText: string;
  errorTitle: string;
  errorBody: string;
  retryButton: string;
}

export const COMBOS_TEXT: Record<SiteHeaderThemeId, Record<AppLocale, CombosI18nCopy>> = {
  barber_mens_grooming: {
    en: {
      eyebrow: 'GROOMING COMBOS & PACKAGES',
      title: 'CURATED BARBER COMBOS',
      includedServicesLabel: 'Included Services:',
      regularTotalLabel: 'Regular Total:',
      comboPriceLabel: 'Combo Price:',
      saveDiscountLabel: 'Save ₹{amount}',
      bookComboCta: 'BOOK COMBO',
      emptyTitle: 'No active barber combos right now',
      emptyBody: 'Check back soon for bundled haircut and grooming specials.',
      loadingText: 'Loading barber packages...',
      errorTitle: 'Unable to load packages',
      errorBody: 'Please try again to view active grooming packages.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'ग्रूमिंग कॉम्बो एवं पैकेज',
      title: 'चुनिंदा बार्बर कॉम्बो',
      includedServicesLabel: 'शामिल सेवाएँ:',
      regularTotalLabel: 'सामान्य कुल:',
      comboPriceLabel: 'कॉम्बो मूल्य:',
      saveDiscountLabel: '₹{amount} की बचत',
      bookComboCta: 'कॉम्बो बुक करें',
      emptyTitle: 'अभी कोई सक्रिय बार्बर कॉम्बो नहीं हैं',
      emptyBody: 'हेयरकट और ग्रूमिंग पैकेज के लिए जल्द ही फिर देखें।',
      loadingText: 'पैकेज लोड हो रहे हैं...',
      errorTitle: 'पैकेज लोड करने में असमर्थ',
      errorBody: 'सक्रिय पैकेज देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },

  hair_studio_color_bar: {
    en: {
      eyebrow: 'STUDIO COMBOS & PACKAGES',
      title: 'EDITORIAL HAIR & COLOR PACKAGES',
      includedServicesLabel: 'Included Services:',
      regularTotalLabel: 'Regular Total:',
      comboPriceLabel: 'Combo Price:',
      saveDiscountLabel: 'Save ₹{amount}',
      bookComboCta: 'BOOK COMBO',
      emptyTitle: 'No active studio packages right now',
      emptyBody: 'Check back soon for bundled hair color and styling packages.',
      loadingText: 'Loading studio packages...',
      errorTitle: 'Unable to load packages',
      errorBody: 'Please try again to view active hair studio packages.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'स्टूडियो कॉम्बो एवं पैकेज',
      title: 'हेयर एवं कलर पैकेज',
      includedServicesLabel: 'शामिल सेवाएँ:',
      regularTotalLabel: 'सामान्य कुल:',
      comboPriceLabel: 'कॉम्बो मूल्य:',
      saveDiscountLabel: '₹{amount} की बचत',
      bookComboCta: 'कॉम्बो बुक करें',
      emptyTitle: 'अभी कोई सक्रिय पैकेज नहीं हैं',
      emptyBody: 'हेयर और कलर पैकेज के लिए जल्द ही फिर देखें।',
      loadingText: 'पैकेज लोड हो रहे हैं...',
      errorTitle: 'पैकेज लोड करने में असमर्थ',
      errorBody: 'सक्रिय पैकेज देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },

  beauty_skin_spa: {
    en: {
      eyebrow: 'SPA & WELLNESS COMBOS',
      title: 'CURATED SKIN & SPA RETREATS',
      includedServicesLabel: 'Included Services:',
      regularTotalLabel: 'Regular Total:',
      comboPriceLabel: 'Combo Price:',
      saveDiscountLabel: 'Save ₹{amount}',
      bookComboCta: 'BOOK COMBO',
      emptyTitle: 'No active spa retreats right now',
      emptyBody: 'Check back soon for bundled facial and massage rituals.',
      loadingText: 'Loading spa retreats...',
      errorTitle: 'Unable to load packages',
      errorBody: 'Please try again to view active spa retreats.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'स्पा एवं वेलनेस कॉम्बो',
      title: 'चुनिंदा स्किन एवं स्पा पैकेज',
      includedServicesLabel: 'शामिल सेवाएँ:',
      regularTotalLabel: 'सामान्य कुल:',
      comboPriceLabel: 'कॉम्बो मूल्य:',
      saveDiscountLabel: '₹{amount} की बचत',
      bookComboCta: 'कॉम्बो बुक करें',
      emptyTitle: 'अभी कोई सक्रिय स्पा पैकेज नहीं हैं',
      emptyBody: 'फेशियल और मसाज पैकेज के लिए जल्द ही फिर देखें।',
      loadingText: 'पैकेज लोड हो रहे हैं...',
      errorTitle: 'पैकेज लोड करने में असमर्थ',
      errorBody: 'सक्रिय पैकेज देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },

  family_full_service: {
    en: {
      eyebrow: 'FAMILY COMBOS & PACKAGES',
      title: 'EVERYONE UNDER ONE VISIT',
      includedServicesLabel: 'Included Services:',
      regularTotalLabel: 'Regular Total:',
      comboPriceLabel: 'Combo Price:',
      saveDiscountLabel: 'Save ₹{amount}',
      bookComboCta: 'BOOK COMBO',
      emptyTitle: 'No active family packages right now',
      emptyBody: 'Check back soon for family multi-service packages.',
      loadingText: 'Loading family packages...',
      errorTitle: 'Unable to load packages',
      errorBody: 'Please try again to view active family packages.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'फ़ैमिली कॉम्बो एवं पैकेज',
      title: 'एक ही विज़िट में सब कुछ',
      includedServicesLabel: 'शामिल सेवाएँ:',
      regularTotalLabel: 'सामान्य कुल:',
      comboPriceLabel: 'कॉम्बो मूल्य:',
      saveDiscountLabel: '₹{amount} की बचत',
      bookComboCta: 'कॉम्बो बुक करें',
      emptyTitle: 'अभी कोई सक्रिय फ़ैमिली पैकेज नहीं हैं',
      emptyBody: 'पारिवारिक कॉम्बो पैकेज के लिए जल्द ही फिर देखें।',
      loadingText: 'पैकेज लोड हो रहे हैं...',
      errorTitle: 'पैकेज लोड करने में असमर्थ',
      errorBody: 'सक्रिय पैकेज देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },

  nail_lash_studio: {
    en: {
      eyebrow: 'NAIL & LASH COMBOS',
      title: 'GLAM ART & LASH PACKAGES',
      includedServicesLabel: 'Included Services:',
      regularTotalLabel: 'Regular Total:',
      comboPriceLabel: 'Combo Price:',
      saveDiscountLabel: 'Save ₹{amount}',
      bookComboCta: 'BOOK COMBO',
      emptyTitle: 'No active glam packages right now',
      emptyBody: 'Check back soon for bundled nail art, pedicure and lash sets.',
      loadingText: 'Loading studio packages...',
      errorTitle: 'Unable to load packages',
      errorBody: 'Please try again to view active studio packages.',
      retryButton: 'RETRY',
    },
    hi: {
      eyebrow: 'नेल्स एवं लैश कॉम्बो',
      title: 'ग्लैम आर्ट एवं लैश पैकेज',
      includedServicesLabel: 'शामिल सेवाएँ:',
      regularTotalLabel: 'सामान्य कुल:',
      comboPriceLabel: 'कॉम्बो मूल्य:',
      saveDiscountLabel: '₹{amount} की बचत',
      bookComboCta: 'कॉम्बो बुक करें',
      emptyTitle: 'अभी कोई सक्रिय पैकेज नहीं हैं',
      emptyBody: 'नेल्स और लैश कॉम्बो के लिए जल्द ही फिर देखें।',
      loadingText: 'पैकेज लोड हो रहे हैं...',
      errorTitle: 'पैकेज लोड करने में असमर्थ',
      errorBody: 'सक्रिय पैकेज देखने के लिए कृपया पुनः प्रयास करें।',
      retryButton: 'पुनः प्रयास करें',
    },
  },
};

export function siteCombosText(themeId: SiteHeaderThemeId, locale: AppLocale = 'en'): CombosI18nCopy {
  return COMBOS_TEXT[themeId]?.[locale] || COMBOS_TEXT[themeId]?.en || COMBOS_TEXT.barber_mens_grooming.en;
}
