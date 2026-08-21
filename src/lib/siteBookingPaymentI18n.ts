/**
 * PHASE 10.7 — ADVANCE PAYMENT & BOOKING CONFIRMATION · English / हिन्दी copy.
 *
 * New copy lives in its own namespaced file (Phase 10.3 / 10.5 / 10.6
 * convention). The Phase 10.2 `siteI18n.ts` and Phase 10.6
 * `siteBookingI18n.ts` tables are not rewritten.
 *
 * One shared table covers all five themes — the meaning of "Pay at Salon",
 * "Advance", "Full Payment", "Booking confirmed", "Receipt", "WhatsApp" is
 * identical everywhere. Theme identity in the payment / confirmation /
 * receipt UI comes from the per-theme visual design table
 * (`siteBookingPaymentTheme.ts`).
 */
import type { AppLocale } from './locale';
import type { PaymentMethod, PaymentOption } from './siteBookingPayment';

const EN = {
  /* stepper */
  'step.option': 'Payment',
  'step.gateway': 'Pay',
  'step.result': 'Result',
  'step.confirm': 'Confirmation',
  'step.receipt': 'Receipt',

  /* payment options */
  'option.title': 'How would you like to pay?',
  'option.subtitle': 'Choose a payment method — you can change this before paying.',
  'option.payAtSalon.title': 'Pay at Salon',
  'option.payAtSalon.body': 'Confirm now and pay the full amount when you arrive. No advance needed.',
  'option.advance.title': 'Advance / Token',
  'option.advance.body': 'Pay a small advance now to lock your slot. The rest is due at the salon.',
  'option.full.title': 'Full Payment',
  'option.full.body': 'Pay the entire amount now for a fully confirmed booking.',
  'option.recommended': 'Recommended',
  'option.summary': 'Booking total',
  'summary.servicesCount': '{count} services',
  'summary.totalAmount': 'Total booking amount',
  'summary.advanceAmount': 'Advance to pay now',
  'summary.remainingAmount': 'Remaining at salon',
  'option.dueNow': 'Due now',
  'option.dueAtSalon': 'Due at salon',
  'option.advancePct': '{pct}% advance',
  'option.continue': 'Continue to payment',
  'option.backToSummary': 'Back to summary',
  'option.secureNote': 'Your booking is reserved for 15 minutes while you pay.',

  /* gateway */
  'gateway.title': 'Secure payment',
  'gateway.subtitle': 'Choose a payment method to complete your booking.',
  'gateway.method': 'Payment method',
  'gateway.method.card': 'Card',
  'gateway.method.upi': 'UPI',
  'gateway.method.netbanking': 'Net Banking',
  'gateway.method.wallet': 'Wallet',
  'gateway.amount': 'Amount',
  'gateway.processing': 'Processing payment…',
  'gateway.processingHint': 'Please don\'t close this window or refresh the page.',
  'gateway.payNow': 'Pay {amount} now',
  'gateway.cancel': 'Cancel payment',
  'gateway.cancelConfirm': 'Cancel this payment? Your booking will not be confirmed.',
  'gateway.keepWaiting': 'Keep waiting',
  'gateway.confirmCancel': 'Yes, cancel payment',
  'gateway.timeout': 'Taking too long?',
  'gateway.timeoutHint': 'Your session will expire in {seconds}s. You can retry without losing your booking.',
  'gateway.sandboxNote': 'Sandbox gateway · no real money is moved.',
  'gateway.cardLabel': 'Card number',
  'gateway.cardHolder': 'Name on card',
  'gateway.cardExpiry': 'MM / YY',
  'gateway.cardCvv': 'CVV',
  'gateway.upiLabel': 'UPI ID',
  'gateway.bankLabel': 'Select bank',
  'gateway.walletLabel': 'Select wallet',

  /* result */
  'result.success.title': 'Payment successful',
  'result.success.subtitle': 'Your booking is confirmed. We\'ve held your slot.',
  'result.failure.title': 'Payment failed',
  'result.failure.subtitle': 'Your booking is preserved — you can retry without losing your slot.',
  'result.cancelled.title': 'Payment cancelled',
  'result.cancelled.subtitle': 'No money was charged. You can try again with a different method.',
  'result.timeout.title': 'Payment timed out',
  'result.timeout.subtitle': 'Your booking is still reserved. Please retry to complete payment.',
  'result.retry': 'Retry payment',
  'result.tryDifferent': 'Try a different method',
  'result.backToOptions': 'Change payment option',
  'result.reason': 'Reason',

  /* confirmation */
  'confirm.title': 'Booking confirmed',
  'confirm.subtitle': 'We can\'t wait to see you.',
  'confirm.bookingId': 'Booking ID',
  'confirm.copyId': 'Copy ID',
  'confirm.copied': 'Booking ID copied',
  'confirm.calendar': 'Add to calendar',
  'confirm.viewReceipt': 'View receipt',
  'confirm.whatsapp': 'Send on WhatsApp',
  'confirm.whatsappHint': 'We\'ll only share the essentials — date, time, salon, booking ID.',
  'confirm.backToWebsite': 'Back to website',
  'confirm.newBooking': 'Book another appointment',
  'confirm.success': 'Confirmed',
  'confirm.payAtSalon': 'Pay at salon',
  'confirm.advance': 'Advance paid',
  'confirm.full': 'Paid in full',
  'confirm.salon': 'Salon',
  'confirm.service': 'Service',
  'confirm.date': 'Date',
  'confirm.time': 'Time',
  'confirm.staff': 'Staff',
  'confirm.anyStaff': 'Anyone available',
  'confirm.amount': 'Amount',
  'confirm.paymentStatus': 'Payment status',
  'confirm.bookingIdLabel': 'Booking ID',

  /* receipt */
  'receipt.title': 'Receipt',
  'receipt.subtitle': 'Payment & booking details',
  'receipt.booking': 'Booking details',
  'receipt.payment': 'Payment details',
  'receipt.service': 'Service',
  'receipt.salon': 'Salon',
  'receipt.date': 'Date',
  'receipt.time': 'Time',
  'receipt.staff': 'Staff',
  'receipt.bookingId': 'Booking ID',
  'receipt.customer': 'Customer',
  'receipt.name': 'Name',
  'receipt.mobile': 'Mobile',
  'receipt.email': 'Email',
  'receipt.amount': 'Amount',
  'receipt.subtotal': 'Service total',
  'receipt.paid': 'Paid now',
  'receipt.due': 'Due at salon',
  'receipt.option': 'Payment option',
  'receipt.method': 'Payment method',
  'receipt.methodCard': 'Card',
  'receipt.methodUpi': 'UPI',
  'receipt.methodNetbanking': 'Net Banking',
  'receipt.methodWallet': 'Wallet',
  'receipt.methodSalon': 'Pay at salon',
  'receipt.status': 'Payment status',
  'receipt.statusPaid': 'Paid',
  'receipt.statusPending': 'Pending',
  'receipt.statusFailed': 'Failed',
  'receipt.statusCancelled': 'Cancelled',
  'receipt.statusPayAtSalon': 'Pay at salon',
  'receipt.gatewayRef': 'Reference',
  'receipt.print': 'Print',
  'receipt.download': 'Download',
  'receipt.close': 'Close',
  'receipt.issued': 'Issued',
  'receipt.thanks': 'Thank you for booking with us!',

  /* payment status labels */
  'status.paid': 'Paid',
  'status.unpaid': 'Unpaid',
  'status.pending': 'Pending',
  'status.failed': 'Failed',
  'status.cancelled': 'Cancelled',
  'status.refunded': 'Refunded',
  'status.payAtSalon': 'Pay at salon',

  /* common */
  'common.loading': 'Loading…',
  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.tryAgain': 'Try again',
  'common.min': 'min',
  'common.minutes': 'minutes',
  'common.suffixIn': 'in',
} as const;

const HI: Record<keyof typeof EN, string> = {
  /* stepper */
  'step.option': 'भुगतान',
  'step.gateway': 'भुगतान करें',
  'step.result': 'परिणाम',
  'step.confirm': 'पुष्टि',
  'step.receipt': 'रसीद',

  /* payment options */
  'option.title': 'आप कैसे भुगतान करना चाहेंगे?',
  'option.subtitle': 'भुगतान का तरीका चुनें — भुगतान से पहले आप बदल सकते हैं।',
  'option.payAtSalon.title': 'सैलून पर भुगतान',
  'option.payAtSalon.body': 'अभी पुष्टि करें और पहुँचने पर पूरी राशि चुकाएँ। कोई एडवांस नहीं।',
  'option.advance.title': 'एडवांस / टोकन',
  'option.advance.body': 'अपना स्लॉट पक्का करने के लिए अभी थोड़ा एडवांस दें। बाकी सैलून पर।',
  'option.full.title': 'पूरा भुगतान',
  'option.full.body': 'पूरी तरह पुष्ट बुकिंग के लिए अभी पूरी राशि चुकाएँ।',
  'option.recommended': 'सुझाव',
  'option.summary': 'बुकिंग कुल',
  'summary.servicesCount': '{count} सेवाएँ',
  'summary.totalAmount': 'कुल बुकिंग राशि',
  'summary.advanceAmount': 'अभी देने योग्य एडवांस',
  'summary.remainingAmount': 'सैलून पर शेष राशि',
  'option.dueNow': 'अभी देय',
  'option.dueAtSalon': 'सैलून पर देय',
  'option.advancePct': '{pct}% एडवांस',
  'option.continue': 'भुगतान जारी रखें',
  'option.backToSummary': 'सारांश पर वापस',
  'option.secureNote': 'भुगतान करते समय आपकी बुकिंग 15 मिनट के लिए आरक्षित है।',

  /* gateway */
  'gateway.title': 'सुरक्षित भुगतान',
  'gateway.subtitle': 'अपनी बुकिंग पूरी करने के लिए भुगतान विधि चुनें।',
  'gateway.method': 'भुगतान विधि',
  'gateway.method.card': 'कार्ड',
  'gateway.method.upi': 'UPI',
  'gateway.method.netbanking': 'नेट बैंकिंग',
  'gateway.method.wallet': 'वॉलेट',
  'gateway.amount': 'राशि',
  'gateway.processing': 'भुगतान हो रहा है…',
  'gateway.processingHint': 'कृपया यह विंडो बंद न करें या पेज रिफ्रेश न करें।',
  'gateway.payNow': 'अभी {amount} भुगतान करें',
  'gateway.cancel': 'भुगतान रद्द करें',
  'gateway.cancelConfirm': 'क्या आप यह भुगतान रद्द करना चाहते हैं? आपकी बुकिंग पक्की नहीं होगी।',
  'gateway.keepWaiting': 'प्रतीक्षा करते रहें',
  'gateway.confirmCancel': 'हाँ, भुगतान रद्द करें',
  'gateway.timeout': 'बहुत समय लग रहा है?',
  'gateway.timeoutHint': 'आपका सत्र {seconds}s में समाप्त हो जाएगा। बुकिंग खोए बिना फिर से कोशिश कर सकते हैं।',
  'gateway.sandboxNote': 'सैंडबॉक्स गेटवे · कोई असली पैसा नहीं चलता।',
  'gateway.cardLabel': 'कार्ड नंबर',
  'gateway.cardHolder': 'कार्ड पर नाम',
  'gateway.cardExpiry': 'माह / वर्ष',
  'gateway.cardCvv': 'सीवीवी',
  'gateway.upiLabel': 'UPI आईडी',
  'gateway.bankLabel': 'बैंक चुनें',
  'gateway.walletLabel': 'वॉलेट चुनें',

  /* result */
  'result.success.title': 'भुगतान सफल',
  'result.success.subtitle': 'आपकी बुकिंग पक्की हो गई है। हमने आपका स्लॉट रोक दिया है।',
  'result.failure.title': 'भुगतान विफल',
  'result.failure.subtitle': 'आपकी बुकिंग सुरक्षित है — आप स्लॉट खोए बिना फिर कोशिश कर सकते हैं।',
  'result.cancelled.title': 'भुगतान रद्द',
  'result.cancelled.subtitle': 'कोई पैसा नहीं कटा। आप दूसरी विधि से फिर कोशिश कर सकते हैं।',
  'result.timeout.title': 'भुगतान का समय समाप्त',
  'result.timeout.subtitle': 'आपकी बुकिंग अभी भी आरक्षित है। पूरा करने के लिए फिर कोशिश करें।',
  'result.retry': 'फिर कोशिश करें',
  'result.tryDifferent': 'दूसरी विधि आज़माएँ',
  'result.backToOptions': 'भुगतान विकल्प बदलें',
  'result.reason': 'कारण',

  /* confirmation */
  'confirm.title': 'बुकिंग पक्की',
  'confirm.subtitle': 'हम आपसे मिलने का इंतज़ार कर रहे हैं।',
  'confirm.bookingId': 'बुकिंग आईडी',
  'confirm.copyId': 'आईडी कॉपी करें',
  'confirm.copied': 'बुकिंग आईडी कॉपी हो गई',
  'confirm.calendar': 'कैलेंडर में जोड़ें',
  'confirm.viewReceipt': 'रसीद देखें',
  'confirm.whatsapp': 'व्हाट्सऐप पर भेजें',
  'confirm.whatsappHint': 'हम केवल ज़रूरी बातें साझा करेंगे — तारीख़, समय, सैलून, बुकिंग आईडी।',
  'confirm.backToWebsite': 'वेबसाइट पर वापस',
  'confirm.newBooking': 'दूसरी अपॉइंटमेंट बुक करें',
  'confirm.success': 'पक्की',
  'confirm.payAtSalon': 'सैलून पर भुगतान',
  'confirm.advance': 'एडवांस चुकाया',
  'confirm.full': 'पूरा भुगतान',
  'confirm.salon': 'सैलून',
  'confirm.service': 'सेवा',
  'confirm.date': 'तारीख़',
  'confirm.time': 'समय',
  'confirm.staff': 'स्टाफ',
  'confirm.anyStaff': 'कोई भी उपलब्ध',
  'confirm.amount': 'राशि',
  'confirm.paymentStatus': 'भुगतान स्थिति',
  'confirm.bookingIdLabel': 'बुकिंग आईडी',

  /* receipt */
  'receipt.title': 'रसीद',
  'receipt.subtitle': 'भुगतान और बुकिंग विवरण',
  'receipt.booking': 'बुकिंग विवरण',
  'receipt.payment': 'भुगतान विवरण',
  'receipt.service': 'सेवा',
  'receipt.salon': 'सैलून',
  'receipt.date': 'तारीख़',
  'receipt.time': 'समय',
  'receipt.staff': 'स्टाफ',
  'receipt.bookingId': 'बुकिंग आईडी',
  'receipt.customer': 'ग्राहक',
  'receipt.name': 'नाम',
  'receipt.mobile': 'मोबाइल',
  'receipt.email': 'ईमेल',
  'receipt.amount': 'राशि',
  'receipt.subtotal': 'सेवा कुल',
  'receipt.paid': 'अभी चुकाया',
  'receipt.due': 'सैलून पर देय',
  'receipt.option': 'भुगतान विकल्प',
  'receipt.method': 'भुगतान विधि',
  'receipt.methodCard': 'कार्ड',
  'receipt.methodUpi': 'UPI',
  'receipt.methodNetbanking': 'नेट बैंकिंग',
  'receipt.methodWallet': 'वॉलेट',
  'receipt.methodSalon': 'सैलून पर भुगतान',
  'receipt.status': 'भुगतान स्थिति',
  'receipt.statusPaid': 'भुगतान हो गया',
  'receipt.statusPending': 'लंबित',
  'receipt.statusFailed': 'विफल',
  'receipt.statusCancelled': 'रद्द',
  'receipt.statusPayAtSalon': 'सैलून पर भुगतान',
  'receipt.gatewayRef': 'संदर्भ',
  'receipt.print': 'प्रिंट',
  'receipt.download': 'डाउनलोड',
  'receipt.close': 'बंद करें',
  'receipt.issued': 'जारी',
  'receipt.thanks': 'हमारे साथ बुकिंग के लिए धन्यवाद!',

  /* payment status labels */
  'status.paid': 'भुगतान हो गया',
  'status.unpaid': 'अभी बकाया',
  'status.pending': 'लंबित',
  'status.failed': 'विफल',
  'status.cancelled': 'रद्द',
  'status.refunded': 'वापस',
  'status.payAtSalon': 'सैलून पर भुगतान',

  /* common */
  'common.loading': 'लोड हो रहा है…',
  'common.cancel': 'रद्द करें',
  'common.continue': 'आगे बढ़ें',
  'common.back': 'वापस',
  'common.close': 'बंद करें',
  'common.tryAgain': 'फिर कोशिश करें',
  'common.min': 'मि',
  'common.minutes': 'मिनट',
  'common.suffixIn': 'में',
} as const;

export type SiteBookingPaymentI18nKey = keyof typeof EN;

export function paymentFlowText(locale: AppLocale): Record<SiteBookingPaymentI18nKey, string> {
  return (locale === 'hi' ? HI : EN) as Record<SiteBookingPaymentI18nKey, string>;
}

export function fillPaymentText(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    template,
  );
}

export function paymentMethodLabel(method: PaymentMethod | null, locale: AppLocale): string {
  if (!method) return locale === 'hi' ? 'सैलून पर भुगतान' : 'Pay at Salon';
  const T = paymentFlowText(locale);
  if (method === 'card') return T['gateway.method.card'];
  if (method === 'upi') return T['gateway.method.upi'];
  if (method === 'netbanking') return T['gateway.method.netbanking'];
  if (method === 'wallet') return T['gateway.method.wallet'];
  return T['gateway.method.card'];
}

export function paymentOptionLabel(option: PaymentOption, locale: AppLocale): string {
  const T = paymentFlowText(locale);
  if (option === 'pay_at_salon') return T['option.payAtSalon.title'];
  if (option === 'advance') return T['option.advance.title'];
  return T['option.full.title'];
}
