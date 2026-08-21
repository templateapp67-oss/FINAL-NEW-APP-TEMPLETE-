import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  constantTimeHexEqual,
  hmacSha256Hex,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '../server/razorpay.ts';

const secret = 'unit-test-only-secret';
const orderId = 'order_phase1a_test';
const paymentId = 'pay_phase1a_test';
const expectedCheckout = createHmac('sha256', secret)
  .update(`${orderId}|${paymentId}`, 'utf8')
  .digest('hex');
assert.equal(await hmacSha256Hex(secret, `${orderId}|${paymentId}`), expectedCheckout);
assert.equal(await verifyRazorpayPaymentSignature({
  providerOrderId: orderId,
  providerPaymentId: paymentId,
  signature: expectedCheckout,
  keySecret: secret,
}), true);
assert.equal(await verifyRazorpayPaymentSignature({
  providerOrderId: orderId,
  providerPaymentId: `${paymentId}_tampered`,
  signature: expectedCheckout,
  keySecret: secret,
}), false);
console.log('PASS checkout HMAC accepts exact order/payment pair and rejects tampering');

const rawBody = new TextEncoder().encode('{"event":"payment.captured","amount":50000}');
const expectedWebhook = createHmac('sha256', secret).update(rawBody).digest('hex');
assert.equal(await verifyRazorpayWebhookSignature({
  rawBody,
  signature: expectedWebhook,
  webhookSecret: secret,
}), true);
const reserialized = new TextEncoder().encode('{"amount":50000,"event":"payment.captured"}');
assert.equal(await verifyRazorpayWebhookSignature({
  rawBody: reserialized,
  signature: expectedWebhook,
  webhookSecret: secret,
}), false);
console.log('PASS webhook HMAC uses exact raw bytes and rejects reserialization');

assert.equal(constantTimeHexEqual('Aa00ff', 'aa00FF'), true);
assert.equal(constantTimeHexEqual('aa00ff', 'aa00fe'), false);
assert.equal(constantTimeHexEqual('aa00ff', 'aa00ff00'), false);
console.log('PASS normalized fixed-work signature comparison rejects value/length mismatch');
console.log('Phase 1A payment crypto tests: 3/3 passed');
