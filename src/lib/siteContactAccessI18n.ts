/**
 * PHASE 16.8 — EN/HI copy for Call / WhatsApp / Book action protection.
 *
 * Every string the protection surfaces can show, in both supported
 * languages, in lockstep (the test suite asserts identical key sets and
 * real Devanagari for every Hindi value). `{percent}` is substituted with
 * the salon's OWN advance rule — never a hardcoded number.
 */
import type { AppLocale } from './locale';

export type ContactAccessCopy = Record<string, string>;

const EN: ContactAccessCopy = {
  /* Action labels (mirror the existing chrome labels). */
  'action.call': 'Call Now',
  'action.whatsapp': 'WhatsApp',
  'action.book': 'Book Online',
  'action.bookToUnlock': 'Book & pay {percent}% to unlock',
  'action.completePayment': 'Complete payment to unlock',
  'action.retryPayment': 'Retry payment to unlock',
  'action.bookAgain': 'Book again to unlock',

  /* Lock affordance. */
  'lock.badge': 'Locked',
  'lock.unlocked': 'Unlocked',
  'lock.title': 'Advance payment required',
  'lock.ariaLocked': '{action} is locked until the {percent}% advance payment is completed',

  /* Reason messages — shown verbatim to the visitor. */
  'reason.payment-required':
    'Call and WhatsApp open after you book and pay the {percent}% advance. Your booking is confirmed the moment the payment succeeds.',
  'reason.payment-pending':
    'Your booking is waiting for the {percent}% advance payment. The salon\u2019s Call and WhatsApp open as soon as the payment succeeds.',
  'reason.payment-failed':
    'Your last payment did not go through, so Call and WhatsApp are still locked. Retry the {percent}% advance to unlock them.',
  'reason.cancelled':
    'This booking was cancelled, so Call and WhatsApp are locked. Book again and pay the {percent}% advance to unlock them.',
  'reason.expired':
    'Your appointment has already finished, so Call and WhatsApp are locked again. Book your next visit to unlock them.',
  'reason.unavailable': 'The salon has not enabled this contact option.',
  'reason.unlocked': 'Advance payment received — you can contact the salon directly.',

  /* Confirmation / success surface. */
  'unlocked.title': 'Contact unlocked',
  'unlocked.body': 'Your {percent}% advance for booking {reference} was received. You can now call or message the salon directly.',
  'unlocked.reference': 'Booking {reference}',

  /* Book Online. */
  'book.title': 'Book Online',
  'book.body': 'Choose your service and slot, then pay the {percent}% advance to confirm your booking.',
  'book.unavailable': 'Online booking is not available for this salon right now.',

  /* Shared. */
  'common.whyLocked': 'Why is this locked?',
  'common.dismiss': 'Got it',
  'common.bookNow': 'Book Now',
};

const HI: ContactAccessCopy = {
  'action.call': 'अभी कॉल करें',
  'action.whatsapp': 'व्हाट्सएप',
  'action.book': 'ऑनलाइन बुक करें',
  'action.bookToUnlock': 'अनलॉक करने के लिए बुक करें और {percent}% भुगतान करें',
  'action.completePayment': 'अनलॉक करने के लिए भुगतान पूरा करें',
  'action.retryPayment': 'अनलॉक करने के लिए भुगतान दोबारा करें',
  'action.bookAgain': 'अनलॉक करने के लिए दोबारा बुक करें',

  'lock.badge': 'लॉक',
  'lock.unlocked': 'अनलॉक',
  'lock.title': 'अग्रिम भुगतान आवश्यक है',
  'lock.ariaLocked': '{percent}% अग्रिम भुगतान पूरा होने तक {action} लॉक है',

  'reason.payment-required':
    'कॉल और व्हाट्सएप तब खुलते हैं जब आप बुकिंग करके {percent}% अग्रिम भुगतान कर देते हैं। भुगतान सफल होते ही आपकी बुकिंग पक्की हो जाती है।',
  'reason.payment-pending':
    'आपकी बुकिंग {percent}% अग्रिम भुगतान की प्रतीक्षा में है। भुगतान सफल होते ही सैलून के कॉल और व्हाट्सएप खुल जाएंगे।',
  'reason.payment-failed':
    'आपका पिछला भुगतान पूरा नहीं हुआ, इसलिए कॉल और व्हाट्सएप अभी लॉक हैं। अनलॉक करने के लिए {percent}% अग्रिम भुगतान दोबारा करें।',
  'reason.cancelled':
    'यह बुकिंग रद्द कर दी गई थी, इसलिए कॉल और व्हाट्सएप लॉक हैं। अनलॉक करने के लिए दोबारा बुक करें और {percent}% अग्रिम भुगतान करें।',
  'reason.expired':
    'आपका अपॉइंटमेंट पूरा हो चुका है, इसलिए कॉल और व्हाट्सएप फिर से लॉक हैं। अनलॉक करने के लिए अगली विज़िट बुक करें।',
  'reason.unavailable': 'सैलून ने यह संपर्क विकल्प चालू नहीं किया है।',
  'reason.unlocked': 'अग्रिम भुगतान मिल गया — अब आप सैलून से सीधे संपर्क कर सकते हैं।',

  'unlocked.title': 'संपर्क अनलॉक हो गया',
  'unlocked.body': 'बुकिंग {reference} के लिए आपका {percent}% अग्रिम भुगतान मिल गया है। अब आप सैलून को सीधे कॉल या संदेश कर सकते हैं।',
  'unlocked.reference': 'बुकिंग {reference}',

  'book.title': 'ऑनलाइन बुक करें',
  'book.body': 'अपनी सेवा और समय चुनें, फिर बुकिंग पक्की करने के लिए {percent}% अग्रिम भुगतान करें।',
  'book.unavailable': 'इस सैलून के लिए ऑनलाइन बुकिंग अभी उपलब्ध नहीं है।',

  'common.whyLocked': 'यह लॉक क्यों है?',
  'common.dismiss': 'समझ गए',
  'common.bookNow': 'अभी बुक करें',
};

/** The copy table for `locale` (Hindi falls back to English only if absent). */
export function contactAccessText(locale: AppLocale): ContactAccessCopy {
  return locale === 'hi' ? { ...EN, ...HI } : EN;
}

/** Substitutes `{percent}`, `{reference}` and `{action}` placeholders. */
export function fillContactCopy(
  template: string,
  values: { percent?: number; reference?: string | null; action?: string },
): string {
  return template
    .replace(/\{percent\}/g, String(values.percent ?? ''))
    .replace(/\{reference\}/g, values.reference || '')
    .replace(/\{action\}/g, values.action || '');
}
