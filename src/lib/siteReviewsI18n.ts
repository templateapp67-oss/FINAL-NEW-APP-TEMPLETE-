/**
 * PHASE 10.8 — reviews copy (EN / हिन्दी).
 *
 * New 10.8 strings only. Phase 10.2 `siteI18n.ts` is not rewritten —
 * section titles still come from each theme's existing reviewsTitle /
 * testimonialsTitle so language tests stay green.
 */
import type { AppLocale } from './locale';
import type { SiteHeaderThemeId } from './siteNavigation';
import type { ReviewSubmitError } from './siteReviews';

type ReviewsCopy = {
  write: string;
  cancel: string;
  submit: string;
  nameLabel: string;
  namePlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  ratingLabel: string;
  averageLabel: string;
  countOne: string;
  countMany: string;
  emptyTitle: string;
  emptyBody: string;
  pendingBadge: string;
  pendingTitle: string;
  pendingBody: string;
  thanksTitle: string;
  needBooking: string;
  errors: Record<ReviewSubmitError, string>;
};

const COMMON_EN: ReviewsCopy = {
  write: 'Write a Review',
  cancel: 'Cancel',
  submit: 'Submit review',
  nameLabel: 'Your name',
  namePlaceholder: 'Name as on the booking',
  bodyLabel: 'Your review',
  bodyPlaceholder: 'Tell other guests about your visit.',
  ratingLabel: 'Your rating',
  averageLabel: 'Average rating',
  countOne: '1 review',
  countMany: '{n} reviews',
  emptyTitle: 'No reviews yet',
  emptyBody: 'Reviews appear here after a completed visit is moderated.',
  pendingBadge: 'Pending moderation',
  pendingTitle: 'Thanks — your review is in moderation',
  pendingBody: 'It will appear on this page once it is approved.',
  thanksTitle: 'Review received',
  needBooking: 'Reviews can be submitted after a completed booking at this salon.',
  errors: {
    'invalid-rating': 'Please choose a rating from 1 to 5 stars.',
    'invalid-name': 'Please enter your name.',
    'invalid-body': 'Please write a short review (at least 12 characters).',
    spam: 'That review looks like spam. Please write it in your own words.',
    'rate-limited': 'Please wait a few minutes before submitting another review.',
    'no-eligible-booking': 'Reviews can be submitted after a completed booking at this salon.',
    duplicate: 'A review for this visit has already been submitted.',
  },
};

const COMMON_HI: ReviewsCopy = {
  write: 'रिव्यू लिखें',
  cancel: 'रद्द करें',
  submit: 'रिव्यू भेजें',
  nameLabel: 'आपका नाम',
  namePlaceholder: 'बुकिंग वाला नाम',
  bodyLabel: 'आपका रिव्यू',
  bodyPlaceholder: 'अपनी विज़िट के बारे में बताएँ।',
  ratingLabel: 'आपकी रेटिंग',
  averageLabel: 'औसत रेटिंग',
  countOne: '1 रिव्यू',
  countMany: '{n} रिव्यू',
  emptyTitle: 'अभी कोई रिव्यू नहीं',
  emptyBody: 'पूरी हुई विज़िट के मॉडरेशन के बाद रिव्यू यहाँ दिखेंगे।',
  pendingBadge: 'मॉडरेशन में',
  pendingTitle: 'धन्यवाद — आपका रिव्यू मॉडरेशन में है',
  pendingBody: 'स्वीकृत होते ही यह इस पेज पर दिखेगा।',
  thanksTitle: 'रिव्यू मिल गया',
  needBooking: 'रिव्यू इसी सैलून की पूरी हुई बुकिंग के बाद भेजा जा सकता है।',
  errors: {
    'invalid-rating': 'कृपया 1 से 5 स्टार की रेटिंग चुनें।',
    'invalid-name': 'कृपया अपना नाम लिखें।',
    'invalid-body': 'कृपया थोड़ा सा रिव्यू लिखें (कम से कम 12 अक्षर)।',
    spam: 'यह रिव्यू स्पैम जैसा लगता है। कृपया अपने शब्दों में लिखें।',
    'rate-limited': 'कृपया कुछ मिनट बाद फिर कोशिश करें।',
    'no-eligible-booking': 'रिव्यू इसी सैलून की पूरी हुई बुकिंग के बाद भेजा जा सकता है।',
    duplicate: 'इस विज़िट का रिव्यू पहले ही भेजा जा चुका है।',
  },
};

const THEME_EMPTY: Record<SiteHeaderThemeId, Record<AppLocale, { emptyTitle: string; emptyBody: string }>> = {
  barber_mens_grooming: {
    en: { emptyTitle: 'No chair-side notes yet', emptyBody: 'Gentlemen leave a word after a completed sit-down.' },
    hi: { emptyTitle: 'अभी कुर्सी की राय नहीं', emptyBody: 'पूरी हुई विज़िट के बाद सज्जन यहाँ लिखते हैं।' },
  },
  hair_studio_color_bar: {
    en: { emptyTitle: 'No studio notes yet', emptyBody: 'Client reviews land here after a finished appointment.' },
    hi: { emptyTitle: 'अभी स्टूडियो नोट नहीं', emptyBody: 'पूरी अपॉइंटमेंट के बाद ग्राहकों की राय यहाँ आती है।' },
  },
  beauty_skin_spa: {
    en: { emptyTitle: 'No guest notes yet', emptyBody: 'Kind words appear after a completed treatment.' },
    hi: { emptyTitle: 'अभी मेहमानों की राय नहीं', emptyBody: 'पूरा ट्रीटमेंट होने के बाद शब्द यहाँ आते हैं।' },
  },
  family_full_service: {
    en: { emptyTitle: 'No family notes yet', emptyBody: 'Reviews from completed family visits will appear here.' },
    hi: { emptyTitle: 'अभी परिवार की राय नहीं', emptyBody: 'पूरी हुई फ़ैमिली विज़िट के रिव्यू यहाँ दिखेंगे।' },
  },
  nail_lash_studio: {
    en: { emptyTitle: 'No afterglow notes yet', emptyBody: 'Reviews appear after a finished set is moderated.' },
    hi: { emptyTitle: 'अभी आफ़्टरग्लो नोट नहीं', emptyBody: 'पूरा सेट मॉडरेशन के बाद यहाँ रिव्यू दिखेगा।' },
  },
};

export function reviewsText(themeId: SiteHeaderThemeId, locale: AppLocale): ReviewsCopy {
  const base = locale === 'hi' ? COMMON_HI : COMMON_EN;
  const themed = THEME_EMPTY[themeId]?.[locale === 'hi' ? 'hi' : 'en'];
  return {
    ...base,
    emptyTitle: themed?.emptyTitle || base.emptyTitle,
    emptyBody: themed?.emptyBody || base.emptyBody,
  };
}

export function reviewCountLabel(copy: ReviewsCopy, count: number): string {
  if (count === 1) return copy.countOne;
  return copy.countMany.replace('{n}', String(count));
}
