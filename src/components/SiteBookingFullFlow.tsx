import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SalonData } from '../types';
import SiteBookingFlow from './SiteBookingFlow';
import SiteBookingPaymentFlow from './SiteBookingPaymentFlow';
import SiteBookingNotices from './SiteBookingNotices';
import type { ActiveBookingNotice } from './SiteBookingNotices';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { closeSiteBooking } from '../lib/siteBooking';
import { releaseBookingSlot, bookingSlotKey, bookingBusinessId } from '../lib/siteBookingFlow';
import { clearBookingDraft } from '../lib/siteBookingDraft';
import type { PaymentRecord, PaymentServiceLine } from '../lib/siteBookingPayment';
import { findPaymentRecord, readPaymentRecordsForBusiness, formatMinutesLabel } from '../lib/siteBookingPayment';
import type { BookingNoticeInput } from '../lib/siteBookingNotices';
import { newBookingNoticeId, normalizeNotice } from '../lib/siteBookingNotices';
import { bookingConfirmationText } from '../lib/siteBookingConfirmationI18n';
import { bookingFlowText } from '../lib/siteBookingI18n';
import { bookingSurfaces } from '../lib/siteBookingTheme';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { createBookingAndPay } from '../lib/authoritativeBooking';
import { useAuthModalOptional } from './AuthModalProvider';
import { useAuth } from '../lib/useAuth';
import { formatCurrency } from '../lib/pricing';
import { publicSalonAuthContinuation } from '../lib/authRedirect';
import { fulfillmentCharge, isHomeServiceFulfillment, type BookingFulfillment } from '../lib/homeService';
import { formatDistanceKm } from '../lib/location';
import { CheckCircle2, Copy, Download, Calendar, Clock, CreditCard, IndianRupee, Shield, Building2, User, Phone, Mail, Bookmark, Receipt } from 'lucide-react';

/**
 * PHASE 10.7 — orchestrator for the full booking + payment + confirmation
 * journey.
 *
 *   - Mounts the Phase 10.6 entry flow (Service → Date → Time → Details
 *     → Summary) for the active theme.
 *   - When the user confirms in the Summary step, swaps the entry flow
 *     for the Phase 10.7 payment flow (Option → Gateway → Result →
 *     Confirmation → Receipt), passing the same selections forward.
 *   - Preserves slot holds across the swap (so a user that backs out
 *     of the payment screen does not lose their slot).
 *
 * NOTE: this component assumes the host has already decided to render it
 * (the `open` state lives in `SiteBookingHost`, which mounts this only
 * when the booking widget should be visible).
 */
export default function SiteBookingFullFlow({ themeId, data }: { themeId: SiteHeaderThemeId; data: SalonData }) {
  const [phase, setPhase] = useState<'entry' | 'payment'>('entry');
  const [summary, setSummary] = useState<null | {
    serviceId: string;
    /** PHASE 16.5 — every selected service line (offer-aware). */
    serviceLines?: PaymentServiceLine[];
    dateKey: string;
    startMinutes: number;
    endMinutes: number;
    customer: { name: string; mobile: string; email: string; notes: string };
    /** HOME SERVICE — validated fulfillment snapshot from the entry flow. */
    fulfillment?: BookingFulfillment;
  }>(null);

  /* ------------------------------------------------------------------ */
  /* PHASE 16.9 — booking notices.                                       */
  /*                                                                     */
  /* The EXISTING `onShowToast` seam every booking surface already calls */
  /* is finally wired to a visible presenter here in the host — before   */
  /* 16.9 the public site dropped those messages on the floor. Kinds     */
  /* (success / warning / error / info) come from the call sites; legacy */
  /* strings keep working as `info`. No new notification system.         */
  /* ------------------------------------------------------------------ */
  const [notices, setNotices] = useState<ActiveBookingNotice[]>([]);
  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((notice) => notice.id !== id));
  }, []);
  const showNotice = useCallback((input: BookingNoticeInput) => {
    const notice = normalizeNotice(input);
    setNotices((prev) => {
      // Keep the stack readable: cap at 4, drop the oldest first.
      const next = prev.length >= 4 ? prev.slice(prev.length - 3) : prev;
      return [...next, { id: newBookingNoticeId(), kind: notice.kind, message: notice.message }];
    });
  }, []);

  // PHASE 16.9 — duplicate-submission guard on the summary hand-off: two
  // rapid clicks on Confirm must not double-fire the phase switch.
  const confirmLockRef = useRef(false);
  useEffect(() => {
    confirmLockRef.current = false;
  }, [phase]);

  const handleConfirmEntry = useCallback((payload: {
    service: { id: string };
    serviceLines?: Array<{ serviceId: string; serviceName: string; price: number; durationMinutes: number }>;
    dateKey: string;
    startMinutes: number;
    endMinutes: number;
    customer: { name: string; mobile: string; email: string; notes: string };
    fulfillment?: BookingFulfillment;
  }) => {
    if (confirmLockRef.current) return;
    confirmLockRef.current = true;
    setSummary({
      serviceId: payload.service.id,
      serviceLines: payload.serviceLines,
      dateKey: payload.dateKey,
      startMinutes: payload.startMinutes,
      endMinutes: payload.endMinutes,
      customer: payload.customer,
      fulfillment: payload.fulfillment,
    });
    setPhase('payment');
  }, []);

  // PHASE 16.5 — backing out of payment returns to the SUMMARY (selection
  // restored from the 16.1 draft), not to the start of the wizard.
  const [resumeAtSummary, setResumeAtSummary] = useState(false);
  const handleBackToSummary = useCallback(() => {
    setResumeAtSummary(true);
    setPhase('entry');
  }, []);

  const handleBookingConfirmed = useCallback((record: PaymentRecord) => {
    // PHASE 16.1 — the entry-flow draft has served its purpose once the
    // existing Phase 10.7 confirmation owns the record; drop it so a
    // later plain open starts fresh instead of resuming stale progress.
    clearBookingDraft(record.businessId, record.themeId);
  }, []);

  const handleStartNewBooking = useCallback(() => {
    setSummary(null);
    setPhase('entry');
  }, []);

  // PHASE 16.1 — single tenant-resolution rule shared with the entry flow.
  const businessId = bookingBusinessId(data);
  // Resume a confirmed booking for the same business+theme so a refresh
  // during confirmation does not lose the user's confirmed row. The
  // most-recent confirmed/pay_at_salon record for this business+theme
  // is auto-resumed.
  const existingConfirmed = isSupabaseConfigured ? null : (readPaymentRecordsForBusiness(businessId, themeId).find(
    (r) => r.bookingStatus === 'confirmed' || r.bookingStatus === 'pay_at_salon',
  ) || null);
  // Only use the auto-resumed record when the user hasn't already
  // chosen a different path in this session.
  const shouldAutoResume = existingConfirmed && !summary;
  const initialRecord = isSupabaseConfigured ? null : (shouldAutoResume
    ? existingConfirmed
    : (phase === 'payment' && summary
        ? readPaymentRecordsForBusiness(businessId, themeId).find(
            (r) => r.serviceId === summary.serviceId && r.dateKey === summary.dateKey && r.startMinutes === summary.startMinutes
              && (r.bookingStatus === 'confirmed' || r.bookingStatus === 'pay_at_salon'),
          ) || null
        : null));

  const locale = useSiteLocale();

  // If the host should auto-resume, swap into the payment phase.
  useEffect(() => {
    if (shouldAutoResume && existingConfirmed) {
      setSummary({
        serviceId: existingConfirmed.serviceId,
        // PHASE 16.5 — resumed records restore their persisted line items.
        serviceLines: existingConfirmed.services,
        dateKey: existingConfirmed.dateKey,
        startMinutes: existingConfirmed.startMinutes,
        endMinutes: existingConfirmed.endMinutes,
        customer: existingConfirmed.customer,
      });
      setPhase('payment');
      // PHASE 16.9 — refresh recovery announced (no new record is made).
      showNotice({
        kind: 'info',
        message: bookingConfirmationText(locale)['duplicate.notice'],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-testid="site-booking-flow-orchestrator"
      data-phase={phase}
      className="absolute inset-0 z-[70] flex flex-col overflow-hidden booking-container"
      style={{ transform: 'translateZ(0)' }}
    >
      {phase === 'entry' && (
        <SiteBookingFlow
          themeId={themeId}
          data={data}
          onBackToWebsite={closeSiteBooking}
          onShowToast={showNotice}
          onProceedToPayment={handleConfirmEntry}
          resumeAtSummary={resumeAtSummary}
        />
      )}
      {phase === 'payment' && summary && (
        isSupabaseConfigured ? (
          <AuthoritativeBookingPayment
            data={data}
            summary={summary}
            onBack={handleBackToSummary}
            onClose={closeSiteBooking}
            onShowToast={showNotice}
          />
        ) : (
          <SiteBookingPaymentFlowWrapper
            themeId={themeId}
            data={data}
            summary={summary}
            initialRecord={initialRecord}
            onBackToSummary={handleBackToSummary}
            onBookingConfirmed={handleBookingConfirmed}
            onBackToWebsite={closeSiteBooking}
            onStartNewBooking={handleStartNewBooking}
            onShowToast={showNotice}
          />
        )
      )}
      {/* PHASE 16.9 — the notice presenter for the whole journey. */}
      <SiteBookingNotices themeId={themeId} notices={notices} onDismiss={dismissNotice} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Configured deployments: persisted booking + real verified checkout. */
/* ------------------------------------------------------------------ */

function AuthoritativeBookingPayment({ data, summary, onBack, onClose, onShowToast }: {
  data: SalonData;
  summary: {
    serviceId: string;
    serviceLines?: PaymentServiceLine[];
    dateKey: string;
    startMinutes: number;
    endMinutes: number;
    customer: { name: string; mobile: string; email: string; notes: string };
    fulfillment?: BookingFulfillment;
  };
  onBack: () => void;
  onClose: () => void;
  onShowToast: (input: BookingNoticeInput) => void;
}) {
  const [state, setState] = useState<'ready' | 'processing' | 'verified'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<{
    bookingId: string;
    paymentId: string;
    totalAmountPaise: number;
    advanceAmountPaise: number;
    remainingAmountPaise: number;
    appointmentEnd: string;
  } | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const { user } = useAuth();
  const { openAuth } = useAuthModalOptional();
  const openCustomerAuth = (mode: 'login' | 'signup') => openAuth(mode, {
    accountIntent: 'customer',
    returnTo: publicSalonAuthContinuation(data.websiteSlug),
  });

  // Calculate total and 25% advance for display. HOME SERVICE — the flat
  // surcharge preview joins the display total; the SERVER recomputes the
  // authoritative amounts (services + verified charge) at booking time.
  const isHomeService = isHomeServiceFulfillment(summary.fulfillment);
  const homeCharge = fulfillmentCharge(summary.fulfillment);
  const totalAmount = useMemo(() => {
    const serviceTotal = summary.serviceLines && summary.serviceLines.length > 0
      ? summary.serviceLines.reduce((acc, line) => acc + line.price, 0)
      : ((data.services || []).find((svc) => svc.id === summary.serviceId)?.price ?? 0);
    return serviceTotal + homeCharge;
  }, [summary, data.services, homeCharge]);

  const advanceAmount = Math.round(totalAmount * 0.25);
  const remainingAmount = totalAmount - advanceAmount;

  const pay = async () => {
    if (state === 'processing') return;
    if (!data.salonId) {
      setError('This salon is not connected to a persisted booking profile.');
      return;
    }
    if (!user) {
      setError('Please log in or create an account to secure your booking.');
      openCustomerAuth('login');
      return;
    }
    const [year, month, day] = summary.dateKey.split('-').map(Number);
    const start = new Date(year, month - 1, day, Math.floor(summary.startMinutes / 60), summary.startMinutes % 60);
    if (!Number.isFinite(start.getTime())) {
      setError('The selected appointment time is invalid.');
      return;
    }
    const serviceIds = summary.serviceLines?.length
      ? summary.serviceLines.map((line) => line.serviceId)
      : [summary.serviceId];
    if (!idempotencyKey.current) idempotencyKey.current = `booking:${crypto.randomUUID()}`;

    setState('processing');
    setError(null);
    onShowToast({ kind: 'info', message: 'Creating a secure, server-priced booking (25% advance)…' });
    try {
      const result = await createBookingAndPay({
        salonId: data.salonId,
        serviceIds,
        appointmentStart: start.toISOString(),
        idempotencyKey: idempotencyKey.current,
        // HOME SERVICE — only the mode + raw address travel; the server
        // geocodes, measures and prices authoritatively.
        fulfillmentMode: isHomeService ? 'home_service' : 'at_salon',
        ...(isHomeService && summary.fulfillment?.address
          ? { serviceAddress: summary.fulfillment.address }
          : {}),
      }, {
        name: summary.customer.name,
        email: summary.customer.email || user.email,
        phone: summary.customer.mobile,
      });
      setVerified({
        bookingId: result.bookingId,
        paymentId: result.paymentId,
        totalAmountPaise: result.totalAmountPaise ?? Math.round(totalAmount * 100),
        advanceAmountPaise: result.advanceAmountPaise ?? Math.round(advanceAmount * 100),
        remainingAmountPaise: result.remainingAmountPaise ?? Math.round(remainingAmount * 100),
        appointmentEnd: result.appointmentEnd,
      });
      setState('verified');
      onShowToast({ kind: 'success', message: 'Payment verified and booking confirmed.' });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Secure checkout could not be completed.';
      setError(message);
      setState('ready');
      onShowToast({ kind: 'error', message });
    }
  };

  return (
    <main className="absolute inset-0 overflow-auto bg-[#fcfcfc] p-5 sm:p-8" data-testid="authoritative-booking-payment">
      <section className="mx-auto mt-8 max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={onBack} disabled={state === 'processing'} className="text-sm font-semibold text-gray-600 disabled:opacity-50">← Back</button>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">25% Advance Checkout</span>
        </div>
        <h2 className="mt-6 text-2xl font-bold text-gray-950">Confirm and pay 25% advance</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">The 25% advance amount is calculated server-side from active database services. A booking is confirmed only after Razorpay payment verification.</p>
        
        <dl className="mt-5 space-y-2.5 rounded-xl bg-gray-50 p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Salon</dt><dd className="font-semibold text-right">{data.salonName}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Date</dt><dd className="font-semibold text-right">{summary.dateKey}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Services</dt><dd className="font-semibold text-right">{summary.serviceLines?.length || 1}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-gray-500">Service mode</dt><dd className="font-semibold text-right" data-testid="checkout-service-mode">{isHomeService ? 'Home Service' : 'At Salon'}</dd></div>
          {isHomeService && summary.fulfillment?.address && (
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Address</dt><dd className="font-semibold text-right max-w-[60%]" data-testid="checkout-service-address">{summary.fulfillment.address}</dd></div>
          )}
          {isHomeService && summary.fulfillment?.distanceKm != null && (
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Distance</dt><dd className="font-semibold text-right" data-testid="checkout-service-distance">{formatDistanceKm(summary.fulfillment.distanceKm)}</dd></div>
          )}
          {homeCharge > 0 && (
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Home Service charge</dt><dd className="font-semibold text-right" data-testid="checkout-home-charge">{formatCurrency(homeCharge)}</dd></div>
          )}
          <div className="border-t border-gray-200 pt-2.5 flex justify-between gap-4"><dt className="text-gray-500">Total Amount</dt><dd className="font-bold text-right" data-testid="checkout-total-amount">{formatCurrency(totalAmount)}</dd></div>
          <div className="flex justify-between gap-4 text-[#ac0053] font-bold"><dt>25% Advance (Payable Now)</dt><dd className="text-right" data-testid="checkout-advance-amount">{formatCurrency(advanceAmount)}</dd></div>
          <div className="flex justify-between gap-4 text-gray-600"><dt>Remaining (Pay {isHomeService ? 'on Service' : 'at Salon'})</dt><dd className="font-semibold text-right" data-testid="checkout-remaining-amount">{formatCurrency(remainingAmount)}</dd></div>
        </dl>

        {!user && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
            <p className="font-bold mb-2">Customer Account Required</p>
            <p className="mb-3">Please log in or sign up with Supabase Auth to track and manage your booking.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => openCustomerAuth('login')} className="px-3 py-1.5 bg-[#ac0053] text-white font-bold rounded-lg text-xs">Log in</button>
              <button type="button" onClick={() => openCustomerAuth('signup')} className="px-3 py-1.5 bg-white border border-gray-300 font-bold rounded-lg text-xs text-gray-800">Sign up</button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <p>{error}</p>
            {/auth|log in|session/i.test(error) && (
              <button type="button" onClick={() => openCustomerAuth('login')} className="mt-2 font-bold underline">Log in to continue</button>
            )}
          </div>
        )}

        {state === 'verified' && verified ? (
          <BookingConfirmationView
            data={data}
            summary={summary}
            verified={verified}
            totalAmount={totalAmount}
            advanceAmount={advanceAmount}
            remainingAmount={remainingAmount}
            onClose={onClose}
            copiedRef={copiedRef}
            setCopiedRef={setCopiedRef}
          />
        ) : (
          <button
            type="button"
            onClick={() => void pay()}
            disabled={state === 'processing' || !data.salonId}
            className="mt-5 w-full rounded-xl bg-[#ac0053] px-5 py-3 text-sm font-bold text-white disabled:opacity-50 cursor-pointer"
          >
            {state === 'processing' ? 'Opening secure checkout…' : `Pay 25% Advance (${formatCurrency(advanceAmount)})`}
          </button>
        )}
        <p className="mt-3 text-center text-xs text-gray-500">Amount calculated by server. Never trusts frontend payment amounts.</p>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* PHASE 4 — Full booking confirmation after verified payment.         */
/* ------------------------------------------------------------------ */

function BookingConfirmationView({
  data,
  summary,
  verified,
  totalAmount,
  advanceAmount,
  remainingAmount,
  onClose,
  copiedRef,
  setCopiedRef,
}: {
  data: SalonData;
  summary: {
    serviceId: string;
    serviceLines?: PaymentServiceLine[];
    dateKey: string;
    startMinutes: number;
    endMinutes: number;
    customer: { name: string; mobile: string; email: string; notes: string };
    fulfillment?: BookingFulfillment;
  };
  verified: {
    bookingId: string;
    paymentId: string;
    totalAmountPaise: number;
    advanceAmountPaise: number;
    remainingAmountPaise: number;
    appointmentEnd: string;
  };
  totalAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  onClose: () => void;
  copiedRef: boolean;
  setCopiedRef: (v: boolean) => void;
}) {
  const serviceNames = useMemo(() => {
    if (summary.serviceLines && summary.serviceLines.length > 0) {
      return summary.serviceLines.map((l) => l.serviceName).join(', ');
    }
    const svc = (data.services || []).find((s) => s.id === summary.serviceId);
    return svc?.name || 'Salon Service';
  }, [summary, data.services]);

  const timeLabel = `${formatMinutesLabel(summary.startMinutes)} – ${formatMinutesLabel(summary.endMinutes)}`;
  const durationMinutes = Math.max(0, summary.endMinutes - summary.startMinutes);
  const bookingRef = verified.bookingId.slice(0, 8).toUpperCase();
  const paymentRef = verified.paymentId.slice(0, 12).toUpperCase();

  const handleCopyRef = async () => {
    try {
      await navigator.clipboard.writeText(verified.bookingId);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="mt-5 space-y-4" data-testid="booking-confirmation-view">
      {/* Success Banner */}
      <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
        <div>
          <h3 className="text-lg font-bold text-emerald-800">BOOKING CONFIRMED</h3>
          <p className="text-xs text-emerald-600 mt-0.5">Payment verified server-side via Razorpay</p>
        </div>
      </div>

      {/* Booking Reference */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Booking Reference</span>
          </div>
          <button
            type="button"
            onClick={handleCopyRef}
            className="flex items-center gap-1 text-xs font-semibold text-[#ac0053] hover:underline"
            aria-label="Copy booking reference"
          >
            <Copy className="w-3 h-3" />
            {copiedRef ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="mt-2 text-xl font-black tracking-wider text-gray-900" data-testid="confirmation-booking-ref">
          {bookingRef}
        </p>
      </div>

      {/* Business & Service Details */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5" /> Booking Details
        </h4>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <span className="text-gray-500">Business</span>
          <span className="font-semibold text-right" data-testid="confirmation-business">{data.salonName}</span>
          <span className="text-gray-500">Service</span>
          <span className="font-semibold text-right" data-testid="confirmation-service">{serviceNames}</span>
          <span className="text-gray-500">Date</span>
          <span className="font-semibold text-right flex items-center justify-end gap-1" data-testid="confirmation-date">
            <Calendar className="w-3.5 h-3.5 text-gray-400" /> {summary.dateKey}
          </span>
          <span className="text-gray-500">Time</span>
          <span className="font-semibold text-right flex items-center justify-end gap-1" data-testid="confirmation-time">
            <Clock className="w-3.5 h-3.5 text-gray-400" /> {timeLabel} ({durationMinutes} min)
          </span>
          <span className="text-gray-500">Customer</span>
          <span className="font-semibold text-right">{summary.customer.name}</span>
          {summary.customer.mobile && (
            <>
              <span className="text-gray-500">Phone</span>
              <span className="font-semibold text-right">{summary.customer.mobile}</span>
            </>
          )}
          <span className="text-gray-500">Service mode</span>
          <span className="font-semibold text-right" data-testid="confirmation-service-mode">
            {isHomeServiceFulfillment(summary.fulfillment) ? 'Home Service' : 'At Salon'}
          </span>
          {isHomeServiceFulfillment(summary.fulfillment) && summary.fulfillment?.address && (
            <>
              <span className="text-gray-500">Service address</span>
              <span className="font-semibold text-right" data-testid="confirmation-service-address">{summary.fulfillment.address}</span>
            </>
          )}
          {isHomeServiceFulfillment(summary.fulfillment) && summary.fulfillment?.distanceKm != null && (
            <>
              <span className="text-gray-500">Distance</span>
              <span className="font-semibold text-right" data-testid="confirmation-service-distance">{formatDistanceKm(summary.fulfillment.distanceKm)}</span>
            </>
          )}
        </div>
      </div>

      {/* Payment Summary */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
          <CreditCard className="w-3.5 h-3.5" /> Payment Summary
        </h4>
        <div className="space-y-2 text-sm">
          {fulfillmentCharge(summary.fulfillment) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Home Service charge (included)</span>
              <span className="font-semibold" data-testid="confirmation-home-charge">{formatCurrency(fulfillmentCharge(summary.fulfillment))}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500 flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Total Amount</span>
            <span className="font-bold text-gray-900" data-testid="confirmation-total">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold">
            <span>25% Advance Paid</span>
            <span data-testid="confirmation-advance">{formatCurrency(advanceAmount)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Remaining (Pay {isHomeServiceFulfillment(summary.fulfillment) ? 'on Service' : 'at Salon'})</span>
            <span className="font-semibold" data-testid="confirmation-remaining">{formatCurrency(remainingAmount)}</span>
          </div>
          <div className="border-t border-gray-100 pt-2 flex justify-between text-xs">
            <span className="text-gray-400 flex items-center gap-1"><Receipt className="w-3 h-3" /> Payment Ref</span>
            <span className="font-mono font-semibold text-gray-600" data-testid="confirmation-payment-ref">{paymentRef}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Status</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">CONFIRMED</span>
          </div>
        </div>
      </div>

      {/* Security Badge */}
      <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
        <Shield className="w-3.5 h-3.5" />
        <span>Payment verified server-side. Amount calculated by backend — never trusted from browser.</span>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
          data-testid="confirmation-return-btn"
        >
          Return to salon
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inner wrapper that resolves the service record for the summary data */
/* ------------------------------------------------------------------ */

function SiteBookingPaymentFlowWrapper({
  themeId,
  data,
  summary,
  initialRecord,
  onBackToSummary,
  onBookingConfirmed,
  onBackToWebsite,
  onStartNewBooking,
  onShowToast,
}: {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  summary: {
    serviceId: string;
    serviceLines?: PaymentServiceLine[];
    dateKey: string;
    startMinutes: number;
    endMinutes: number;
    customer: { name: string; mobile: string; email: string; notes: string };
    fulfillment?: BookingFulfillment;
  };
  initialRecord: PaymentRecord | null;
  onBackToSummary: () => void;
  onBookingConfirmed: (record: PaymentRecord) => void;
  onBackToWebsite: () => void;
  onStartNewBooking: () => void;
  onShowToast?: (input: BookingNoticeInput) => void;
}) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const T = bookingFlowText(locale);
  const s = bookingSurfaces(themeId, appearance);

  const service = (data.services || []).find((s) => s.id === summary.serviceId);
  if (!service) {
    // PHASE 16.9 — booking-error state: the service vanished from the
    // salon's catalog. Localized, themed, keyboard-accessible recovery.
    return (
      <div
        data-testid="payment-service-missing"
        data-locale={locale}
        data-appearance={appearance}
        className="absolute inset-0 z-[70] flex items-center justify-center p-4"
        style={{ backgroundColor: s.page }}
      >
        <div
          className="max-w-sm w-full p-5 flex flex-col items-center text-center gap-3 border rounded-2xl"
          style={{ backgroundColor: s.card, borderColor: s.danger }}
        >
          <p className="text-xs font-semibold" style={{ color: s.danger }}>
            {T['summary.serviceMissing']}
          </p>
          <button
            type="button"
            data-testid="payment-service-missing-back"
            onClick={onBackToSummary}
            className="px-4 py-2 text-[11px] font-bold border rounded-lg cursor-pointer"
            style={{ backgroundColor: s.accent, color: s.accentText, borderColor: s.accent }}
          >
            {T.back}
          </button>
        </div>
      </div>
    );
  }
  return (
    <SiteBookingPaymentFlow
      themeId={themeId}
      data={data}
      service={service}
      serviceLines={summary.serviceLines}
      dateKey={summary.dateKey}
      startMinutes={summary.startMinutes}
      endMinutes={summary.endMinutes}
      staffId={null}
      staffName={null}
      customer={summary.customer}
      fulfillment={summary.fulfillment}
      initialRecord={initialRecord}
      onBackToSummary={onBackToSummary}
      onBookingConfirmed={onBookingConfirmed}
      onBackToWebsite={onBackToWebsite}
      onStartNewBooking={onStartNewBooking}
      onShowToast={onShowToast}
    />
  );
}

/* ---- helpers exposed for tests ---- */
export function releaseSlotHoldForTests(themeId: string, serviceId: string, dateKey: string, startMinutes: number): void {
  releaseBookingSlot(bookingSlotKey(themeId, serviceId, dateKey, startMinutes));
}
export function findRecordForTests(bookingId: string, businessId: string, themeId: string): PaymentRecord | null {
  return findPaymentRecord(bookingId, businessId, themeId);
}
