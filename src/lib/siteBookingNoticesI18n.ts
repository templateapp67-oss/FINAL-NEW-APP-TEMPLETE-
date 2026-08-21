/**
 * PHASE 16.9 — BOOKING NOTIFICATIONS & UX · English / हिन्दी copy.
 *
 * Follows the established convention (10.3/10.5/10.6/10.7/16.6/16.7):
 * new copy lives in its own namespaced file; existing i18n tables are
 * not rewritten. One shared table covers all five themes — feedback
 * meaning is identical everywhere; theme identity comes from the visual
 * surfaces the presenter resolves.
 *
 * Privacy: every message is generic. No notice ever carries customer
 * details, salon contact data or payment identifiers — only the
 * customer's own booking reference (already shown across the flow).
 */
import type { AppLocale } from './locale';

const EN = {
  /* presenter chrome */
  'notice.dismiss': 'Dismiss notification',

  /* feedback messages */
  'notice.bookingConfirmed': 'Booking confirmed — your reference is {reference}.',
  'notice.paymentSuccess': 'Payment successful — your booking is confirmed.',
  'notice.paymentPending': 'Processing your payment — please do not close this window.',
  'notice.completePayment': 'This booking is not confirmed yet — complete the payment to confirm your slot.',
  'notice.paymentFailed': 'Payment failed — {reason}',
  'notice.paymentFailedNoReason': 'Payment failed — please try again.',
  'notice.paymentTimedOut': 'Payment timed out — your booking is not confirmed yet.',
  'notice.paymentCancelled': 'Payment cancelled — no money was charged.',
} as const;

const HI: Record<keyof typeof EN, string> = {
  /* presenter chrome */
  'notice.dismiss': 'सूचना बंद करें',

  /* feedback messages */
  'notice.bookingConfirmed': 'बुकिंग पक्की हो गई — आपका संदर्भ {reference} है।',
  'notice.paymentSuccess': 'भुगतान सफल — आपकी बुकिंग पक्की हो गई है।',
  'notice.paymentPending': 'आपका भुगतान प्रोसेस हो रहा है — कृपया यह विंडो बंद न करें।',
  'notice.completePayment': 'यह बुकिंग अभी पक्की नहीं है — स्लॉट पक्का करने के लिए भुगतान पूरा करें।',
  'notice.paymentFailed': 'भुगतान विफल — {reason}',
  'notice.paymentFailedNoReason': 'भुगतान विफल — कृपया फिर से कोशिश करें।',
  'notice.paymentTimedOut': 'भुगतान का समय समाप्त हो गया — आपकी बुकिंग अभी पक्की नहीं है।',
  'notice.paymentCancelled': 'भुगतान रद्द — कोई पैसा नहीं कटा।',
} as const;

export type SiteBookingNoticesI18nKey = keyof typeof EN;

export function bookingNoticesText(locale: AppLocale): Record<SiteBookingNoticesI18nKey, string> {
  return locale === 'hi' ? HI : EN;
}

/** Formats a notice message with placeholders (same convention as the other tables). */
export function fillNoticeText(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    template,
  );
}
