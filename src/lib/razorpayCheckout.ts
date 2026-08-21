import { authenticatedApiFetch } from './apiFetch';

interface CheckoutSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: unknown) => void): void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayCheckoutInstance;

declare global {
  interface Window { Razorpay?: RazorpayConstructor }
}

let scriptPromise: Promise<void> | null = null;
function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => window.Razorpay ? resolve() : reject(new Error('Razorpay Checkout did not initialize.'));
    script.onerror = () => reject(new Error('Unable to load Razorpay Checkout.'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Open real Razorpay Checkout for an already-persisted UUID booking.
 * The server derives the amount and verifies the returned signature before the
 * booking can become confirmed.
 */
export async function startRazorpayCheckout(input: {
  bookingId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
}): Promise<{ paymentId: string }> {
  const orderResponse = await authenticatedApiFetch('/api/payments/razorpay/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: input.bookingId }),
  });
  const order = await orderResponse.json() as {
    error?: string;
    keyId?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
  };
  if (!orderResponse.ok || !order.keyId || !order.orderId || !order.amount) {
    throw new Error(order.error || 'Unable to create a payment order.');
  }

  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable.');

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Nexora',
      description: input.description || 'Salon booking payment',
      prefill: {
        name: input.customerName || '',
        email: input.customerEmail || '',
        contact: input.customerPhone || '',
      },
      modal: {
        ondismiss: () => reject(new Error('Payment was cancelled. Your booking was not confirmed.')),
      },
      handler: async (success: CheckoutSuccess) => {
        try {
          const verificationResponse = await authenticatedApiFetch('/api/payments/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(success),
          });
          const verification = await verificationResponse.json() as { error?: string; paymentId?: string };
          if (!verificationResponse.ok || !verification.paymentId) {
            throw new Error(verification.error || 'Payment could not be verified.');
          }
          resolve({ paymentId: verification.paymentId });
        } catch (error) {
          reject(error);
        }
      },
    });
    checkout.on('payment.failed', () => {
      reject(new Error('Payment failed. Your booking was not confirmed.'));
    });
    checkout.open();
  });
}
