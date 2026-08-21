export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: string;
  created_at: number;
}

export interface RazorpayServerConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
}

export function getRazorpayServerConfig(options: { requireWebhook?: boolean } = {}): RazorpayServerConfig {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim() || null;
  if (!keyId || !keySecret) throw new Error('Razorpay order credentials are not configured.');
  if (options.requireWebhook && !webhookSecret) {
    throw new Error('The Razorpay webhook secret is not configured.');
  }
  return { keyId, keySecret, webhookSecret };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 supported by Node and Cloudflare/WebCrypto runtimes. */
export async function hmacSha256Hex(secret: string, payload: string | Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = typeof payload === 'string' ? encoder.encode(payload) : payload;
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return bytesToHex(new Uint8Array(signature));
}

/** Constant-work comparison after normalizing provider hex signatures. */
export function constantTimeHexEqual(expected: string, received: string): boolean {
  const left = expected.trim().toLowerCase();
  const right = received.trim().toLowerCase();
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export async function verifyRazorpayPaymentSignature(input: {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
  keySecret?: string;
}): Promise<boolean> {
  const secret = input.keySecret || getRazorpayServerConfig().keySecret;
  const expected = await hmacSha256Hex(
    secret,
    `${input.providerOrderId}|${input.providerPaymentId}`,
  );
  return constantTimeHexEqual(expected, input.signature);
}

export async function verifyRazorpayWebhookSignature(input: {
  rawBody: Uint8Array;
  signature: string;
  webhookSecret?: string;
}): Promise<boolean> {
  const secret = input.webhookSecret
    || getRazorpayServerConfig({ requireWebhook: true }).webhookSecret;
  if (!secret) return false;
  const expected = await hmacSha256Hex(secret, input.rawBody);
  return constantTimeHexEqual(expected, input.signature);
}

export async function createRazorpayOrder(input: {
  amountPaise: number;
  currency: 'INR';
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error('The authoritative payment amount is invalid.');
  }
  const config = getRazorpayServerConfig();
  const authorization = Buffer.from(`${config.keyId}:${config.keySecret}`, 'utf8').toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt.slice(0, 40),
      notes: input.notes || {},
    }),
  });

  const payload = await response.json().catch(() => null) as RazorpayOrder | { error?: unknown } | null;
  if (!response.ok || !payload || !('id' in payload) || typeof payload.id !== 'string') {
    throw new Error(`Razorpay order creation failed (${response.status}).`);
  }
  if (payload.amount !== input.amountPaise || payload.currency !== input.currency) {
    throw new Error('Razorpay returned an order with mismatched amount or currency.');
  }
  return payload;
}
