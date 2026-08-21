/**
 * PHASE 16.6 — BOOKING CONFIRMATION · English / हिन्दी copy.
 *
 * Follows the established convention (10.3 / 10.5 / 10.6 / 10.7 / 16.7):
 * new copy lives in its own namespaced file; the existing i18n tables are
 * not rewritten. One shared table covers all five themes — theme identity
 * comes from the visual surfaces, not from the wording.
 */
import type { AppLocale } from './locale';

const EN = {
  /* screen */
  'screen.title': 'Booking Confirmation',
  'screen.subtitle': 'Your booking details and payment summary.',
  'screen.loading': 'Loading your booking…',
  'screen.error': 'Your booking could not be loaded. Please try again.',
  'screen.retry': 'Retry',
  'screen.notFound': 'We could not find this booking for your account.',

  /* states */
  'state.confirmed': 'Confirmed',
  'state.payment_pending': 'Payment pending',
  'state.payment_failed': 'Payment failed',
  'state.cancelled': 'Cancelled',
  'state.completed': 'Completed',

  'state.confirmed.headline': 'Your booking is confirmed',
  'state.payment_pending.headline': 'Payment pending',
  'state.payment_failed.headline': 'Payment failed',
  'state.cancelled.headline': 'Booking cancelled',
  'state.completed.headline': 'Booking completed',

  'state.confirmed.body': 'Your advance payment succeeded and your slot is reserved. Please arrive 10 minutes early.',
  'state.payment_pending.body': 'This booking is not confirmed yet. Complete the required advance payment to confirm your slot.',
  'state.payment_failed.body': 'The payment did not go through, so this booking is not confirmed. You can retry without losing your details.',
  'state.cancelled.body': 'This booking was cancelled. No slot is reserved for it.',
  'state.completed.body': 'This appointment has been completed. Thank you for visiting us.',

  'state.paidAtSalonNote': 'No advance was required — pay the full amount at the salon.',
  'state.pendingWarning': 'Not confirmed until payment succeeds.',

  /* fields */
  'field.reference': 'Booking reference',
  'field.status': 'Booking status',
  'field.salon': 'Salon',
  'field.services': 'Service(s)',
  'field.date': 'Date',
  'field.time': 'Time',
  'field.duration': 'Duration',
  'field.total': 'Total amount',
  'field.advancePaid': 'Advance paid',
  'field.remaining': 'Remaining amount',
  'field.paymentStatus': 'Payment status',
  'field.paymentMethod': 'Payment method',
  'field.gatewayRef': 'Payment reference',
  'field.customer': 'Customer',
  'field.mobile': 'Mobile',
  'field.staff': 'Staff',
  'field.anyStaff': 'Anyone available',
  'field.failureReason': 'Reason',

  /* payment status */
  'payment.paid': 'Paid',
  'payment.pending': 'Pending',
  'payment.unpaid': 'Unpaid',
  'payment.failed': 'Failed',
  'payment.cancelled': 'Cancelled',
  'payment.refunded': 'Refunded',

  /* actions */
  'action.viewReceipt': 'View summary / receipt',
  'action.hideReceipt': 'Hide summary',
  'action.download': 'Download summary',
  'action.retryPayment': 'Retry payment',
  'action.close': 'Close',
  'action.backToBookings': 'Back to my bookings',

  /* history */
  'history.title': 'Booking summary',
  'history.subtitle': 'Open the full summary of any booking you made here.',
  'history.open': 'View summary',
  'history.badgeSaved': 'Saved to your booking history',

  /* receipt */
  'receipt.title': 'BOOKING SUMMARY',
  'receipt.issued': 'Issued',

  /* duplicate protection */
  'duplicate.notice': 'You already have this booking — showing your existing booking instead of creating a new one.',

  /* common */
  'common.minutes': 'minutes',
  'common.min': 'min',
} as const;

const HI: Record<keyof typeof EN, string> = {
  /* screen */
  'screen.title': 'बुकिंग पुष्टि',
  'screen.subtitle': 'आपकी बुकिंग का विवरण और भुगतान सारांश।',
  'screen.loading': 'आपकी बुकिंग लोड हो रही है…',
  'screen.error': 'आपकी बुकिंग लोड नहीं हो सकी। कृपया फिर से कोशिश करें।',
  'screen.retry': 'फिर से कोशिश करें',
  'screen.notFound': 'आपके खाते के लिए यह बुकिंग नहीं मिली।',

  /* states */
  'state.confirmed': 'पक्की',
  'state.payment_pending': 'भुगतान लंबित',
  'state.payment_failed': 'भुगतान विफल',
  'state.cancelled': 'रद्द',
  'state.completed': 'पूर्ण',

  'state.confirmed.headline': 'आपकी बुकिंग पक्की हो गई है',
  'state.payment_pending.headline': 'भुगतान लंबित है',
  'state.payment_failed.headline': 'भुगतान विफल रहा',
  'state.cancelled.headline': 'बुकिंग रद्द हो गई',
  'state.completed.headline': 'बुकिंग पूरी हो गई',

  'state.confirmed.body': 'आपका एडवांस भुगतान सफल रहा और आपका स्लॉट सुरक्षित है। कृपया 10 मिनट पहले पहुँचें।',
  'state.payment_pending.body': 'यह बुकिंग अभी पक्की नहीं है। स्लॉट पक्का करने के लिए ज़रूरी एडवांस भुगतान पूरा करें।',
  'state.payment_failed.body': 'भुगतान पूरा नहीं हुआ, इसलिए यह बुकिंग पक्की नहीं है। आप अपना विवरण खोए बिना फिर कोशिश कर सकते हैं।',
  'state.cancelled.body': 'यह बुकिंग रद्द कर दी गई थी। इसके लिए कोई स्लॉट सुरक्षित नहीं है।',
  'state.completed.body': 'यह अपॉइंटमेंट पूरी हो चुकी है। हमारे यहाँ आने के लिए धन्यवाद।',

  'state.paidAtSalonNote': 'कोई एडवांस ज़रूरी नहीं था — पूरी राशि सैलून पर चुकाएँ।',
  'state.pendingWarning': 'भुगतान सफल होने तक पक्की नहीं।',

  /* fields */
  'field.reference': 'बुकिंग संदर्भ',
  'field.status': 'बुकिंग स्थिति',
  'field.salon': 'सैलून',
  'field.services': 'सेवाएँ',
  'field.date': 'तारीख़',
  'field.time': 'समय',
  'field.duration': 'अवधि',
  'field.total': 'कुल राशि',
  'field.advancePaid': 'दिया गया एडवांस',
  'field.remaining': 'शेष राशि',
  'field.paymentStatus': 'भुगतान स्थिति',
  'field.paymentMethod': 'भुगतान विधि',
  'field.gatewayRef': 'भुगतान संदर्भ',
  'field.customer': 'ग्राहक',
  'field.mobile': 'मोबाइल',
  'field.staff': 'स्टाफ',
  'field.anyStaff': 'कोई भी उपलब्ध',
  'field.failureReason': 'कारण',

  /* payment status */
  'payment.paid': 'भुगतान हुआ',
  'payment.pending': 'लंबित',
  'payment.unpaid': 'बिना भुगतान',
  'payment.failed': 'विफल',
  'payment.cancelled': 'रद्द',
  'payment.refunded': 'वापसी हुई',

  /* actions */
  'action.viewReceipt': 'सारांश / रसीद देखें',
  'action.hideReceipt': 'सारांश छिपाएँ',
  'action.download': 'सारांश डाउनलोड करें',
  'action.retryPayment': 'भुगतान फिर करें',
  'action.close': 'बंद करें',
  'action.backToBookings': 'मेरी बुकिंग पर वापस',

  /* history */
  'history.title': 'बुकिंग सारांश',
  'history.subtitle': 'यहाँ की गई किसी भी बुकिंग का पूरा सारांश खोलें।',
  'history.open': 'सारांश देखें',
  'history.badgeSaved': 'आपकी बुकिंग हिस्ट्री में सहेजा गया',

  /* receipt */
  'receipt.title': 'बुकिंग सारांश',
  'receipt.issued': 'जारी',

  /* duplicate protection */
  'duplicate.notice': 'यह बुकिंग पहले से मौजूद है — नई बनाने के बजाय आपकी मौजूदा बुकिंग दिखाई जा रही है।',

  /* common */
  'common.minutes': 'मिनट',
  'common.min': 'मि',
};

export type BookingConfirmationI18nKey = keyof typeof EN;

export function bookingConfirmationText(locale: AppLocale): Record<BookingConfirmationI18nKey, string> {
  return (locale === 'hi' ? HI : EN) as Record<BookingConfirmationI18nKey, string>;
}
