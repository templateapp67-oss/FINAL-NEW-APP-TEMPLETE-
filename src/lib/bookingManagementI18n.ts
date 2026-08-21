/**
 * PHASE 16.7 — BOOKING MANAGEMENT · English / हिन्दी copy.
 *
 * Follows the established convention (10.3/10.5/10.6/10.7): new copy in a
 * new namespaced file; existing i18n tables untouched.
 */
import type { AppLocale } from './locale';

const EN = {
  'customer.title': 'My Bookings',
  'customer.subtitle': 'Your appointments at this salon, newest first.',
  'customer.empty': 'You have no bookings yet.',
  'customer.error': 'Your bookings could not be loaded. Please try again.',
  'customer.loading': 'Loading your bookings…',
  'customer.retry': 'Retry',
  'customer.cancel': 'Cancel booking',
  'customer.cancelConfirm': 'Cancel this booking? This cannot be undone.',
  'customer.keepBooking': 'Keep my booking',
  'customer.cancelled': 'Your booking was cancelled.',
  'customer.cancelFailed': 'This booking can no longer be cancelled.',

  'owner.title': 'Salon Bookings',
  'owner.subtitle': 'Bookings made on your website — your salon only.',
  'owner.empty': 'No bookings yet. New website bookings appear here.',
  'owner.error': 'Bookings could not be loaded. Please try again.',
  'owner.loading': 'Loading bookings…',
  'owner.retry': 'Retry',
  'owner.confirm': 'Confirm',
  'owner.complete': 'Mark completed',
  'owner.cancel': 'Cancel booking',
  'owner.cancelConfirm': 'Cancel this booking? This cannot be undone.',
  'owner.keepBooking': 'Keep booking',
  'owner.updated': 'Booking updated.',
  'owner.cancelled': 'Booking cancelled.',
  'owner.updateFailed': 'This change is not allowed for the booking\u2019s current status.',
  'owner.filter.all': 'All',

  'manage.denied.login': 'Please log in to manage bookings.',
  'manage.denied.noSalon': 'Your account is not linked to a salon.',
  'manage.denied.ambiguous': 'Your account is linked to more than one salon. Contact support.',
  'manage.denied.permission': 'You do not have permission to view these bookings.',
  'manage.denied.error': 'Bookings could not be loaded. Please try again.',

  'status.pending_payment': 'Pending',
  'status.confirmed': 'Confirmed',
  'status.pay_at_salon': 'Confirmed · Pay at salon',
  'status.completed': 'Completed',
  'status.cancelled': 'Cancelled',
  'status.failed': 'Payment failed',

  'payment.paid': 'Paid',
  'payment.pending': 'Pending',
  'payment.unpaid': 'Unpaid',
  'payment.failed': 'Failed',
  'payment.cancelled': 'Cancelled',
  'payment.refunded': 'Refunded',

  'field.salon': 'Salon',
  'field.services': 'Services',
  'field.date': 'Date',
  'field.time': 'Time',
  'field.customer': 'Customer',
  'field.mobile': 'Mobile',
  'field.total': 'Total amount',
  'field.advance': 'Advance paid',
  'field.remaining': 'Remaining',
  'field.paymentStatus': 'Payment status',
  'field.bookingId': 'Booking ID',
} as const;

const HI: Record<keyof typeof EN, string> = {
  'customer.title': 'मेरी बुकिंग',
  'customer.subtitle': 'इस सैलून में आपकी अपॉइंटमेंट, नई सबसे पहले।',
  'customer.empty': 'आपकी अभी कोई बुकिंग नहीं है।',
  'customer.error': 'आपकी बुकिंग लोड नहीं हो सकीं। कृपया फिर से कोशिश करें।',
  'customer.loading': 'आपकी बुकिंग लोड हो रही हैं…',
  'customer.retry': 'फिर से कोशिश करें',
  'customer.cancel': 'बुकिंग रद्द करें',
  'customer.cancelConfirm': 'यह बुकिंग रद्द करें? इसे पूर्ववत नहीं किया जा सकता।',
  'customer.keepBooking': 'मेरी बुकिंग रखें',
  'customer.cancelled': 'आपकी बुकिंग रद्द कर दी गई।',
  'customer.cancelFailed': 'यह बुकिंग अब रद्द नहीं की जा सकती।',

  'owner.title': 'सैलून बुकिंग',
  'owner.subtitle': 'आपकी वेबसाइट से हुई बुकिंग — केवल आपका सैलून।',
  'owner.empty': 'अभी कोई बुकिंग नहीं। नई वेबसाइट बुकिंग यहाँ दिखेंगी।',
  'owner.error': 'बुकिंग लोड नहीं हो सकीं। कृपया फिर से कोशिश करें।',
  'owner.loading': 'बुकिंग लोड हो रही हैं…',
  'owner.retry': 'फिर से कोशिश करें',
  'owner.confirm': 'पक्का करें',
  'owner.complete': 'पूर्ण करें',
  'owner.cancel': 'बुकिंग रद्द करें',
  'owner.cancelConfirm': 'यह बुकिंग रद्द करें? इसे पूर्ववत नहीं किया जा सकता।',
  'owner.keepBooking': 'बुकिंग रखें',
  'owner.updated': 'बुकिंग अपडेट हो गई।',
  'owner.cancelled': 'बुकिंग रद्द कर दी गई।',
  'owner.updateFailed': 'बुकिंग की वर्तमान स्थिति में यह बदलाव संभव नहीं है।',
  'owner.filter.all': 'सभी',

  'manage.denied.login': 'बुकिंग प्रबंधित करने के लिए कृपया लॉग इन करें।',
  'manage.denied.noSalon': 'आपका खाता किसी सैलून से जुड़ा नहीं है।',
  'manage.denied.ambiguous': 'आपका खाता एक से अधिक सैलून से जुड़ा है। सहायता से संपर्क करें।',
  'manage.denied.permission': 'आपको ये बुकिंग देखने की अनुमति नहीं है।',
  'manage.denied.error': 'बुकिंग लोड नहीं हो सकीं। कृपया फिर से कोशिश करें।',

  'status.pending_payment': 'लंबित',
  'status.confirmed': 'पक्की',
  'status.pay_at_salon': 'पक्की · सैलून पर भुगतान',
  'status.completed': 'पूर्ण',
  'status.cancelled': 'रद्द',
  'status.failed': 'भुगतान विफल',

  'payment.paid': 'भुगतान हुआ',
  'payment.pending': 'लंबित',
  'payment.unpaid': 'बिना भुगतान',
  'payment.failed': 'विफल',
  'payment.cancelled': 'रद्द',
  'payment.refunded': 'वापसी हुई',

  'field.salon': 'सैलून',
  'field.services': 'सेवाएँ',
  'field.date': 'तारीख़',
  'field.time': 'समय',
  'field.customer': 'ग्राहक',
  'field.mobile': 'मोबाइल',
  'field.total': 'कुल राशि',
  'field.advance': 'दिया गया एडवांस',
  'field.remaining': 'शेष राशि',
  'field.paymentStatus': 'भुगतान स्थिति',
  'field.bookingId': 'बुकिंग आईडी',
};

export type BookingManagementI18nKey = keyof typeof EN;

export function bookingManagementText(locale: AppLocale): Record<BookingManagementI18nKey, string> {
  return locale === 'hi' ? HI : EN;
}
