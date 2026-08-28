import type { Express, Request, Response } from 'express';
import { getSupabaseAdmin, requireAuthenticatedUser } from './supabaseAdmin';
import {
  createRazorpayOrder,
  createRazorpayRefund,
  getRazorpayServerConfig,
  isRazorpayProviderConfigured,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from './razorpay';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;

type RequestWithRawBody = Request & { rawBody?: Buffer };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/Authentication is required|session is invalid|does not belong|not found|already paid|awaiting payment/i.test(message)) {
    return message;
  }
  console.error('Payment API error:', error);
  return 'Unable to process the payment request right now.';
}

function rpcRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const row = value[0];
    return row && typeof row === 'object' ? row as Record<string, unknown> : null;
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function setupPaymentRoutes(app: Express): void {
  /**
   * M60 — owner-initiated refund. The actor must be the authenticated owner
   * (or manager) of the payment's salon; authorization happens inside the
   * actor-bound RPC, never from a request-supplied salon id. The amount is
   * validated against the database ledger, executed at the provider when
   * Razorpay keys are configured, and settled idempotently. Preview/test
   * deployments without provider keys must opt in explicitly via
   * NEXORA_ALLOW_LOCAL_REFUNDS so mock and real payment behavior can never be
   * confused (audit gap §7).
   */
  app.post('/api/payments/refund', async (req: Request, res: Response) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const paymentId = text(req.body?.paymentId);
      const amountPaise = Number(req.body?.amountPaise);
      const idempotencyKey = text(req.body?.idempotencyKey);
      const reason = text(req.body?.reason).slice(0, 500) || null;

      if (!UUID_PATTERN.test(paymentId)) {
        return res.status(400).json({ error: 'A valid payment id is required.' });
      }
      if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
        return res.status(400).json({ error: 'A positive refund amount (paise) is required.' });
      }
      if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
        return res.status(400).json({ error: 'A valid idempotency key is required.' });
      }

      const providerConfigured = isRazorpayProviderConfigured();
      if (!providerConfigured && process.env.NEXORA_ALLOW_LOCAL_REFUNDS !== '1') {
        return res.status(409).json({
          error: 'Refunds require configured Razorpay credentials. Preview deployments can set NEXORA_ALLOW_LOCAL_REFUNDS=1 for deterministic local refunds.',
        });
      }

      const admin = getSupabaseAdmin();
      const { data: created, error: createError } = await admin.rpc('create_payment_refund_for_actor', {
        p_actor_user_id: user.id,
        p_payment_id: paymentId,
        p_amount_paise: amountPaise,
        p_idempotency_key: idempotencyKey,
        p_reason: reason,
      });
      if (createError) throw createError;
      const refundRow = rpcRow(created);
      const refundId = text(refundRow?.refund_id);
      if (!refundId) throw new Error('The refund RPC returned no refund id.');

      // Already-settled idempotent replay: return the original state.
      if (refundRow?.status === 'processed' || refundRow?.status === 'failed') {
        return res.json({
          refundId,
          status: refundRow.status,
          amountPaise: Number(refundRow.amount_paise),
          providerRefundId: text(refundRow.provider_refund_id) || null,
          reused: true,
        });
      }

      let providerRefundId: string | null = null;
      if (providerConfigured) {
        const payment = await admin
          .from('payments')
          .select('provider_payment_id')
          .eq('id', paymentId)
          .maybeSingle();
        const providerPaymentId = text(payment.data?.provider_payment_id);
        if (!providerPaymentId) throw new Error('The payment has no provider payment id to refund.');
        const providerRefund = await createRazorpayRefund({
          providerPaymentId,
          amountPaise,
          notes: { payment_id: paymentId, refund_id: refundId },
          receipt: `rfnd_${refundId.replaceAll('-', '').slice(0, 24)}`,
        });
        providerRefundId = providerRefund.id;
      }

      const { data: marked, error: markError } = await admin.rpc('mark_payment_refund_result', {
        p_status: 'processed',
        p_refund_id: refundId,
        p_provider_refund_id: providerRefundId,
        p_provider_response: null,
      });
      if (markError) throw markError;
      const settled = rpcRow(marked);

      return res.status(201).json({
        refundId,
        status: text(settled?.status) || 'processed',
        paymentStatus: text(settled?.payment_status) || null,
        amountPaise,
        providerRefundId,
        reused: false,
      });
    } catch (error) {
      const message = publicError(error);
      const code = (error as { code?: string })?.code;
      const status = /Authentication is required|session/i.test(message) ? 401
        : code === '42501' ? 403
          : code === 'P0002' ? 404
            : code === '22023' || /amount|payment id|idempotency|provider/i.test(message) ? 400 : 409;
      return res.status(status).json({ error: message });
    }
  });

  /** M60 — owner refund ledger read (actor-bound, salon-scoped). */
  app.get('/api/payments/refunds', async (req: Request, res: Response) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const bookingId = text(req.query.bookingId);
      if (bookingId && !UUID_PATTERN.test(bookingId)) {
        return res.status(400).json({ error: 'A valid booking id is required.' });
      }
      const { data, error } = await getSupabaseAdmin().rpc('get_payment_refunds_for_actor', {
        p_actor_user_id: user.id,
        p_booking_id: bookingId || null,
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      return res.json({
        refunds: rows.map((row: Record<string, unknown>) => ({
          refundId: row.refund_id,
          bookingId: row.booking_id,
          paymentId: row.payment_id,
          providerRefundId: row.provider_refund_id || null,
          amountPaise: Number(row.amount_paise),
          currency: row.currency,
          status: row.status,
          reason: row.reason || null,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      const message = publicError(error);
      const status = /Authentication is required|session/i.test(message) ? 401 : 409;
      return res.status(status).json({ error: message });
    }
  });


  /** Create a provider order from the database booking amount, never body amount. */
  app.post('/api/payments/razorpay/orders', async (req: Request, res: Response) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const bookingId = text(req.body?.bookingId);
      if (!UUID_PATTERN.test(bookingId)) {
        return res.status(400).json({ error: 'A valid booking id is required.' });
      }

      const admin = getSupabaseAdmin();
      const { data: quoteData, error: quoteError } = await admin.rpc('get_booking_payment_quote', {
        p_user_id: user.id,
        p_booking_id: bookingId,
      });
      if (quoteError) throw quoteError;
      const quote = rpcRow(quoteData);
      const amountPaise = Number(quote?.amount_paise);
      const currency = text(quote?.currency);
      const salonId = text(quote?.salon_id);
      if (!quote || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || currency !== 'INR') {
        throw new Error('The database returned an invalid payment quote.');
      }

      // Idempotent retry: return the existing active order before contacting
      // Razorpay. RLS is bypassed only by this trusted server after auth check.
      const { data: existing, error: existingError } = await admin
        .from('payment_orders')
        .select('provider_order_id,amount_paise,currency,status')
        .eq('booking_id', bookingId)
        .eq('status', 'created')
        .maybeSingle();
      if (existingError) throw existingError;
      const keyId = getRazorpayServerConfig().keyId;
      if (existing) {
        return res.json({
          keyId,
          orderId: existing.provider_order_id,
          amount: Number(existing.amount_paise),
          currency: existing.currency,
          bookingId,
          reused: true,
        });
      }

      const providerOrder = await createRazorpayOrder({
        amountPaise,
        currency: 'INR',
        receipt: `booking_${bookingId.replaceAll('-', '').slice(0, 24)}`,
        notes: { booking_id: bookingId, salon_id: salonId },
      });

      const { data: savedOrder, error: saveError } = await admin.rpc('record_razorpay_order', {
        p_user_id: user.id,
        p_booking_id: bookingId,
        p_provider_order_id: providerOrder.id,
        p_provider_amount_paise: providerOrder.amount,
        p_provider_currency: providerOrder.currency,
        p_expires_at: null,
      });
      if (saveError) throw saveError;
      const saved = rpcRow(savedOrder);

      return res.status(201).json({
        keyId,
        orderId: text(saved?.provider_order_id) || providerOrder.id,
        amount: Number(saved?.amount_paise ?? providerOrder.amount),
        currency: text(saved?.currency) || providerOrder.currency,
        bookingId,
        reused: false,
      });
    } catch (error) {
      const message = publicError(error);
      const status = /Authentication|session/i.test(message) ? 401 : /valid booking/i.test(message) ? 400 : 409;
      return res.status(status).json({ error: message });
    }
  });

  /** Verify browser checkout evidence server-side and atomically confirm DB state. */
  app.post('/api/payments/razorpay/verify', async (req: Request, res: Response) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const providerOrderId = text(req.body?.razorpay_order_id);
      const providerPaymentId = text(req.body?.razorpay_payment_id);
      const signature = text(req.body?.razorpay_signature);
      const method = text(req.body?.method) || null;
      if (!PROVIDER_ID_PATTERN.test(providerOrderId)
        || !PROVIDER_ID_PATTERN.test(providerPaymentId)
        || !SIGNATURE_PATTERN.test(signature)) {
        return res.status(400).json({ error: 'Invalid payment verification payload.' });
      }

      const valid = await verifyRazorpayPaymentSignature({
        providerOrderId,
        providerPaymentId,
        signature,
      });
      if (!valid) return res.status(400).json({ error: 'Payment signature verification failed.' });

      const { data, error } = await getSupabaseAdmin().rpc('confirm_verified_razorpay_payment', {
        p_user_id: user.id,
        p_provider_order_id: providerOrderId,
        p_provider_payment_id: providerPaymentId,
        p_signature: signature,
        p_method: method,
      });
      if (error) throw error;
      return res.json({ verified: true, paymentId: data });
    } catch (error) {
      const message = publicError(error);
      const status = /Authentication|session/i.test(message) ? 401 : 409;
      return res.status(status).json({ error: message });
    }
  });

  /** Razorpay raw-body webhook. Never mount a JSON re-serializer in front of it. */
  app.post('/api/payments/razorpay/webhook', async (req: RequestWithRawBody, res: Response) => {
    try {
      const signature = text(req.header('x-razorpay-signature'));
      const rawBody = req.rawBody;
      if (!rawBody || !SIGNATURE_PATTERN.test(signature)) {
        return res.status(400).json({ error: 'Missing webhook signature or raw body.' });
      }
      const valid = await verifyRazorpayWebhookSignature({ rawBody, signature });
      if (!valid) return res.status(400).json({ error: 'Webhook signature verification failed.' });

      const payload = req.body && typeof req.body === 'object' ? req.body as Record<string, any> : null;
      const eventType = text(payload?.event);
      if (!payload || !eventType) return res.status(400).json({ error: 'Invalid webhook payload.' });
      const eventId = text(req.header('x-razorpay-event-id')) || `razorpay:${signature}`;
      const admin = getSupabaseAdmin();

      const { data: ingressId, error: ingressError } = await admin.rpc('ingest_verified_payment_webhook', {
        p_provider: 'razorpay',
        p_event_type: eventType,
        p_payload: payload,
        p_signature: signature,
        p_idempotency_key: eventId,
      });
      if (ingressError) throw ingressError;

      const paymentEntity = payload?.payload?.payment?.entity;
      const providerOrderId = text(paymentEntity?.order_id);
      const providerPaymentId = text(paymentEntity?.id);
      const refundEntity = payload?.payload?.refund?.entity;
      if (eventType === 'payment.captured' && providerOrderId && providerPaymentId) {
        const { error: confirmError } = await admin.rpc('confirm_verified_razorpay_payment', {
          p_user_id: null,
          p_provider_order_id: providerOrderId,
          p_provider_payment_id: providerPaymentId,
          p_signature: signature,
          p_method: text(paymentEntity?.method) || null,
        });
        if (confirmError && !/already paid/i.test(confirmError.message)) throw confirmError;
      } else if (eventType === 'payment.failed' && providerOrderId) {
        const { error: failureError } = await admin.rpc('record_razorpay_payment_failure', {
          p_provider_order_id: providerOrderId,
          p_provider_payment_id: providerPaymentId || null,
          p_reason: text(paymentEntity?.error_description) || null,
        });
        if (failureError) throw failureError;
      } else if (
        (eventType === 'refund.processed' || eventType === 'refund.failed')
        && refundEntity && typeof refundEntity.id === 'string'
      ) {
        // M60 reconciliation: provider-settled refunds update the ledger by
        // provider refund id, so replays and out-of-order events stay exact.
        const { error: refundMarkError } = await admin.rpc('mark_payment_refund_result', {
          p_status: eventType === 'refund.processed' ? 'processed' : 'failed',
          p_provider_refund_id: text(refundEntity.id),
          p_provider_response: { amount: refundEntity.amount ?? null, status: text(refundEntity.status) || eventType },
        });
        if (refundMarkError && refundMarkError.code !== 'P0002') throw refundMarkError;
      }

      const { error: processError } = await admin.rpc('process_payment_webhook', {
        p_webhook_event_id: ingressId,
        p_idempotency_key: eventId,
      });
      if (processError) throw processError;
      return res.json({ received: true });
    } catch (error) {
      console.error('Razorpay webhook processing failed:', error);
      return res.status(500).json({ error: 'Webhook processing failed.' });
    }
  });
}
