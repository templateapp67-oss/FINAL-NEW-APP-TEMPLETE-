/**
 * PHASE 10.4 copy — footer, legal, floating actions, final CTA extras.
 * Phase 10.2 `siteI18n.ts` is left untouched.
 */
import type { AppLocale } from './locale';
import type { SiteHeaderThemeId } from './siteNavigation';

const COMMON_EN = {
  'chrome.quickLinks': 'Quick Links',
  'chrome.services': 'Services',
  'chrome.contact': 'Contact',
  'chrome.address': 'Address',
  'chrome.hours': 'Opening Hours',
  'chrome.follow': 'Follow',
  'chrome.privacy': 'Privacy Policy',
  'chrome.terms': 'Terms & Conditions',
  'chrome.cancel': 'Cancellation / Refund Policy',
  'chrome.backToTop': 'Back to top',
  'chrome.call': 'Call',
  'chrome.callNow': 'Call Now',
  'chrome.whatsapp': 'WhatsApp',
  'chrome.directions': 'Directions',
  'chrome.getDirections': 'Get Directions',
  'chrome.book': 'Book',
  'chrome.bookNow': 'Book Now',
  'chrome.legalClose': 'Close',
  'chrome.copyright': 'All rights reserved.',
  'chrome.noServices': 'Menu coming soon',
  'chrome.fallbackHours': 'Mon – Sat · 10:00 – 20:00',
  'chrome.emailFallback': 'hello@final-new-app-templete.vercel.app',
};

const COMMON_HI: Record<keyof typeof COMMON_EN, string> = {
  'chrome.quickLinks': 'त्वरित लिंक',
  'chrome.services': 'सेवाएँ',
  'chrome.contact': 'संपर्क',
  'chrome.address': 'पता',
  'chrome.hours': 'खुलने का समय',
  'chrome.follow': 'फ़ॉलो करें',
  'chrome.privacy': 'गोपनीयता नीति',
  'chrome.terms': 'नियम और शर्तें',
  'chrome.cancel': 'रद्दीकरण / रिफंड नीति',
  'chrome.backToTop': 'ऊपर जाएँ',
  'chrome.call': 'कॉल',
  'chrome.callNow': 'कॉल करें',
  'chrome.whatsapp': 'व्हाट्सऐप',
  'chrome.directions': 'रास्ता',
  'chrome.getDirections': 'रास्ता देखें',
  'chrome.book': 'बुक',
  'chrome.bookNow': 'बुक करें',
  'chrome.legalClose': 'बंद करें',
  'chrome.copyright': 'सर्वाधिकार सुरक्षित।',
  'chrome.noServices': 'मेनू जल्द आएगा',
  'chrome.fallbackHours': 'सोम – शनि · 10:00 – 20:00',
  'chrome.emailFallback': 'hello@final-new-app-templete.vercel.app',
};

type ThemeChrome = {
  privacyTitle: string;
  privacyBody: string;
  termsTitle: string;
  termsBody: string;
  cancelTitle: string;
  cancelBody: string;
  ctaCall: string;
  ctaWhatsapp: string;
};

const THEME: Record<SiteHeaderThemeId, Record<AppLocale, ThemeChrome>> = {
  barber_mens_grooming: {
    en: {
      privacyTitle: 'Privacy Policy',
      privacyBody: 'We collect only what we need to book your chair — name, phone and appointment details. We never sell your information. Visit notes stay with the shop and are used to give you a better cut next time.',
      termsTitle: 'Terms & Conditions',
      termsBody: 'Bookings are confirmed once the 25% advance is received. Please arrive on time; late arrivals may be shortened so the next gentleman is not kept waiting. Services are provided at the shop listed on this site.',
      cancelTitle: 'Cancellation / Refund Policy',
      cancelBody: 'Cancel or reschedule at least 4 hours before your slot and the advance is credited to a future visit. Same-day no-shows forfeit the deposit. Remaining balance is always paid at the shop after service.',
      ctaCall: 'Call the shop',
      ctaWhatsapp: 'WhatsApp the chair',
    },
    hi: {
      privacyTitle: 'गोपनीयता नीति',
      privacyBody: 'हम सिर्फ़ आपकी कुर्सी बुक करने के लिए नाम, फ़ोन और अपॉइंटमेंट की जानकारी लेते हैं। हम आपकी जानकारी नहीं बेचते। विज़िट नोट्स दुकान पर रहते हैं ताकि अगली बार कट और बेहतर हो।',
      termsTitle: 'नियम और शर्तें',
      termsBody: '25% एडवांस मिलते ही बुकिंग पक्की होती है। समय पर आएँ; देर होने पर सेवा छोटी हो सकती है ताकि अगला सज्जन इंतज़ार न करे। सेवाएँ इसी साइट पर लिखी दुकान पर मिलती हैं।',
      cancelTitle: 'रद्दीकरण / रिफंड नीति',
      cancelBody: 'स्लॉट से कम से कम 4 घंटे पहले रद्द या बदलें तो एडवांस अगली विज़िट में जमा हो जाएगा। उसी दिन न आने पर डिपॉज़िट नहीं लौटेगा। बाकी राशि सेवा के बाद दुकान पर चुकाएँ।',
      ctaCall: 'दुकान पर कॉल करें',
      ctaWhatsapp: 'कुर्सी के लिए व्हाट्सऐप',
    },
  },
  hair_studio_color_bar: {
    en: {
      privacyTitle: 'Privacy Policy',
      privacyBody: 'Consultation notes, colour formulas and contact details stay inside the studio. We use them only to prepare your next appointment and never share them with advertisers.',
      termsTitle: 'Terms & Conditions',
      termsBody: 'A 25% advance reserves your consultation. Colour and chemical services may run longer than the listed time when the canvas needs it — we will always confirm before we begin.',
      cancelTitle: 'Cancellation / Refund Policy',
      cancelBody: 'Give us 12 hours’ notice and your deposit rolls to another date. Same-day cancellations on colour services are non-refundable. The remaining balance is due at the studio.',
      ctaCall: 'Call the studio',
      ctaWhatsapp: 'Message the studio',
    },
    hi: {
      privacyTitle: 'गोपनीयता नीति',
      privacyBody: 'कंसल्टेशन नोट्स, कलर फ़ॉर्मूला और संपर्क डिटेल स्टूडियो के अंदर रहते हैं। हम इन्हें सिर्फ़ अगली अपॉइंटमेंट तैयार करने के लिए उपयोग करते हैं, विज्ञापनदाताओं से साझा नहीं करते।',
      termsTitle: 'नियम और शर्तें',
      termsBody: '25% एडवांस से आपकी कंसल्टेशन रिज़र्व होती है। कलर और केमिकल सेवाएँ लिखे समय से लंबी हो सकती हैं — शुरू करने से पहले हम हमेशा पुष्टि करेंगे।',
      cancelTitle: 'रद्दीकरण / रिफंड नीति',
      cancelBody: '12 घंटे पहले बताएँ तो डिपॉज़िट दूसरी तारीख पर चला जाएगा। कलर सेवाओं की उसी दिन की कैंसिल गैर-वापसी हैं। बाकी राशि स्टूडियो में देय है।',
      ctaCall: 'स्टूडियो को कॉल करें',
      ctaWhatsapp: 'स्टूडियो को मैसेज करें',
    },
  },
  beauty_skin_spa: {
    en: {
      privacyTitle: 'Privacy Policy',
      privacyBody: 'Skin notes and guest preferences are kept confidential and used only to tailor your next ritual. We do not sell or trade guest data.',
      termsTitle: 'Terms & Conditions',
      termsBody: 'Please arrive 10 minutes early so your treatment can begin unhurried. A 25% advance holds your room. Inform us of allergies or skin conditions before we start.',
      cancelTitle: 'Cancellation / Refund Policy',
      cancelBody: 'Cancellations made 8 hours ahead move your deposit to a future visit. Late cancellations may retain the advance. Pay the remainder at the sanctuary after your treatment.',
      ctaCall: 'Call the spa',
      ctaWhatsapp: 'WhatsApp the spa',
    },
    hi: {
      privacyTitle: 'गोपनीयता नीति',
      privacyBody: 'स्किन नोट्स और मेहमान की पसंद गोपनीय रहती हैं और सिर्फ़ अगला रिचुअल बेहतर बनाने के लिए उपयोग होती हैं। हम डेटा नहीं बेचते।',
      termsTitle: 'नियम और शर्तें',
      termsBody: 'ट्रीटमेंट बिना जल्दबाज़ी शुरू हो सके, इसलिए 10 मिनट पहले आएँ। 25% एडवांस आपका कमरा होल्ड करता है। एलर्जी या स्किन स्थिति हमें शुरू से पहले बताएँ।',
      cancelTitle: 'रद्दीकरण / रिफंड नीति',
      cancelBody: '8 घंटे पहले कैंसिल करने पर डिपॉज़िट अगली विज़िट में चला जाता है। देर से कैंसिल पर एडवांस रुक सकता है। बाकी राशि ट्रीटमेंट के बाद चुकाएँ।',
      ctaCall: 'स्पा को कॉल करें',
      ctaWhatsapp: 'स्पा को व्हाट्सऐप करें',
    },
  },
  family_full_service: {
    en: {
      privacyTitle: 'Privacy Policy',
      privacyBody: 'We keep family contact details and kids’ visit notes only so the next appointment is easier. We never share them outside the salon.',
      termsTitle: 'Terms & Conditions',
      termsBody: 'One booking can cover several chairs. Please tell us every guest’s name when you book. A 25% advance holds the whole visit. Walk-ins are welcome when a chair is free.',
      cancelTitle: 'Cancellation / Refund Policy',
      cancelBody: 'Change a family booking up to 3 hours before and the deposit stays on the account. Missed slots lose the advance for those chairs. Pay the rest at the salon after the visit.',
      ctaCall: 'Call us',
      ctaWhatsapp: 'WhatsApp us',
    },
    hi: {
      privacyTitle: 'गोपनीयता नीति',
      privacyBody: 'हम परिवार के संपर्क और बच्चों की विज़िट नोट्स सिर्फ़ इसलिए रखते हैं ताकि अगली अपॉइंटमेंट आसान हो। सैलून के बाहर हम इन्हें साझा नहीं करते।',
      termsTitle: 'नियम और शर्तें',
      termsBody: 'एक बुकिंग में कई कुर्सियाँ हो सकती हैं। बुक करते समय हर मेहमान का नाम बताएँ। 25% एडवांस पूरी विज़िट होल्ड करता है। कुर्सी खाली हो तो वॉक-इन स्वागत है।',
      cancelTitle: 'रद्दीकरण / रिफंड नीति',
      cancelBody: 'फ़ैमिली बुकिंग 3 घंटे पहले बदलें तो डिपॉज़िट अकाउंट पर रहता है। छूटी कुर्सियों का एडवांस नहीं लौटेगा। बाकी राशि विज़िट के बाद सैलून में दें।',
      ctaCall: 'हमें कॉल करें',
      ctaWhatsapp: 'हमें व्हाट्सऐप करें',
    },
  },
  nail_lash_studio: {
    en: {
      privacyTitle: 'Privacy Policy',
      privacyBody: 'Reference photos, set formulas and booking details stay in the studio diary. We use them to recreate your favourite edit — never for ads.',
      termsTitle: 'Terms & Conditions',
      termsBody: 'Please come with clean, product-free nails or lashes unless we have planned a removal. A 25% advance holds your artist. Extra art may add time and is confirmed first.',
      cancelTitle: 'Cancellation / Refund Policy',
      cancelBody: 'Give 6 hours’ notice and your deposit moves to another slot. Same-day no-shows keep the advance. Remaining balance is paid at the studio after your set.',
      ctaCall: 'Call the edit',
      ctaWhatsapp: 'WhatsApp the studio',
    },
    hi: {
      privacyTitle: 'गोपनीयता नीति',
      privacyBody: 'रेफ़रेंस फ़ोटो, सेट फ़ॉर्मूला और बुकिंग डिटेल स्टूडियो डायरी में रहते हैं। हम इन्हें आपका पसंदीदा एडिट दोहराने के लिए उपयोग करते हैं — विज्ञापन के लिए नहीं।',
      termsTitle: 'नियम और शर्तें',
      termsBody: 'साफ़, प्रॉडक्ट-फ़्री नेल्स या लैशेज़ लेकर आएँ, जब तक हम रिमूवल प्लान न करें। 25% एडवांस आपका आर्टिस्ट होल्ड करता है। अतिरिक्त आर्ट का समय पहले कन्फ़र्म होता है।',
      cancelTitle: 'रद्दीकरण / रिफंड नीति',
      cancelBody: '6 घंटे पहले बताएँ तो डिपॉज़िट दूसरे स्लॉट पर चला जाएगा। उसी दिन न आने पर एडवांस नहीं लौटेगा। बाकी राशि सेट के बाद स्टूडियो में दें।',
      ctaCall: 'एडिट को कॉल करें',
      ctaWhatsapp: 'स्टूडियो को व्हाट्सऐप करें',
    },
  },
};

export function chromeText(themeId: SiteHeaderThemeId, locale: AppLocale): Record<string, string> {
  const common = locale === 'hi' ? COMMON_HI : COMMON_EN;
  const themed = THEME[themeId]?.[locale === 'hi' ? 'hi' : 'en'] || THEME.barber_mens_grooming.en;
  return { ...common, ...themed };
}
