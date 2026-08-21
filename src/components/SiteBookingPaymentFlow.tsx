import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Calendar,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Copy,
  CreditCard,
  Download,
  FileText,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  Printer,
  Receipt as ReceiptIcon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Smartphone,
  User,
  Wallet,
  X,
  XCircle,
  Building2,
  Hourglass,
} from 'lucide-react';
import type { SalonData, Service } from '../types';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { salonDisplayName } from '../lib/siteBooking';
import { displayService } from '../lib/displayService';
import { formatCurrency } from '../lib/pricing';
import { getSalonNameStyle } from '../lib/brandIdentity';

import { paymentSurfaces } from '../lib/siteBookingPaymentTheme';
import type { PaymentFlowSurface } from '../lib/siteBookingPaymentTheme';
import SiteBookingConfirmation, { confirmationStateColors } from './SiteBookingConfirmation';
import {
  bookingConfirmationState,
  findActiveBookingForContext,
  isConfirmedState,
  toBookingConfirmation,
} from '../lib/siteBookingConfirmation';
import { bookingConfirmationText } from '../lib/siteBookingConfirmationI18n';
import { authorizeContactOpen } from '../lib/siteContactAccess';
import {
  fillPaymentText,
  paymentFlowText,
  paymentMethodLabel,
  paymentOptionLabel,
} from '../lib/siteBookingPaymentI18n';
import {
  PAYMENT_EVENT,
  calculatePaymentAmounts,
  createPayAtSalonRecord,
  createPendingBookingRecord,
  findPaymentRecord,
  formatMinutesLabel,
  generateBookingId,
  maskPaymentForm,
  paymentGatewayTimeoutMs,
  retryPayment,
  simulateGateway,
  toReceiptView,
} from '../lib/siteBookingPayment';
import type {
  GatewayAttempt,
  GatewayAttemptResult,
  GatewayForm,
  PaymentMethod,
  PaymentOption,
  PaymentRecord,
  PaymentServiceLine,
  ReceiptView,
} from '../lib/siteBookingPayment';
import type { BookingNoticeInput } from '../lib/siteBookingNotices';
import { bookingNoticesText, fillNoticeText } from '../lib/siteBookingNoticesI18n';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  /** Pricing context passed in from the entry flow. */
  service: Service;
  /**
   * PHASE 16.5 — full multi-service selection (optional + additive).
   * When present, the booking total is the sum of these offer-aware line
   * prices (computed by the EXISTING 16.2 selection engine) and the 25%
   * advance derives from that real total. Absent = single-service booking,
   * byte-identical to the 10.7 behaviour.
   */
  serviceLines?: PaymentServiceLine[];
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  staffId?: string | null;
  staffName?: string | null;
  customer: { name: string; mobile: string; email: string; notes: string };
  /** Called when the visitor backs out of payment back into the summary. */
  onBackToSummary: () => void;
  /** Called when the visitor reaches the final confirmation step. */
  onBookingConfirmed: (record: PaymentRecord) => void;
  /** Called when the visitor closes the flow entirely. */
  onBackToWebsite: () => void;
  /** Called when the visitor starts a new booking from the confirmation screen. */
  onStartNewBooking: () => void;
  /**
   * PHASE 16.9 — the EXISTING toast seam, upgraded to typed notices.
   * Used for duplicate-payment / refresh / retry hints and every payment
   * outcome; plain strings keep working and render as `info`.
   */
  onShowToast?: (input: BookingNoticeInput) => void;
  /** Tests can stub the gateway scenario. */
  initialScenario?: 'all_success' | 'mixed' | 'force_failure' | 'force_timeout';
  /** Resumes a previously-persisted payment/booking row (e.g. on refresh). */
  initialRecord?: PaymentRecord | null;
}

/* ------------------------------------------------------------------ */
/* Per-theme visual design (structure is common, visuals are NOT).     */
/* ------------------------------------------------------------------ */

interface PaymentDesign {
  card: string;
  chip: string;
  primary: string;
  primaryShadow: string;
  secondary: string;
  stepTitle: string;
  stepChip: string;
  stepChipDone: string;
  input: string;
  optionCard: string;
  receiptCard: string;
  label: string;
  successCard: string;
  failureCard: string;
  pendingCard: string;
  flourish: (s: PaymentFlowSurface) => ReactNode;
  primaryStyle: (s: PaymentFlowSurface) => CSSProperties;
  primarySuccessStyle: (s: PaymentFlowSurface) => CSSProperties;
  primaryFailureStyle: (s: PaymentFlowSurface) => CSSProperties;
  optionSelectedStyle: (s: PaymentFlowSurface) => CSSProperties;
  optionIdleStyle: (s: PaymentFlowSurface) => CSSProperties;
  methodSelectedStyle: (s: PaymentFlowSurface) => CSSProperties;
  methodIdleStyle: (s: PaymentFlowSurface) => CSSProperties;
}

const PAYMENT_DESIGNS: Record<SiteHeaderThemeId, PaymentDesign> = {
  /* 1 · BARBER */
  barber_mens_grooming: {
    card: 'border rounded-none shadow-sm',
    chip: 'border rounded-none',
    primary: 'rounded-none font-black uppercase tracking-[0.18em] text-[11px] py-3.5 transition-all hover:brightness-110 active:scale-[0.99]',
    primaryShadow: 'none',
    secondary: 'rounded-none border font-black uppercase tracking-[0.18em] text-[11px] py-3 transition-colors',
    stepTitle: 'font-black uppercase tracking-[0.08em]',
    stepChip: 'rounded-none border font-black uppercase text-[9px] tracking-[0.2em]',
    stepChipDone: 'rounded-none font-black uppercase text-[9px] tracking-[0.2em]',
    input: 'rounded-none border',
    optionCard: 'border-2 rounded-none',
    receiptCard: 'border rounded-none',
    label: 'text-[9px] font-black uppercase tracking-[0.3em]',
    successCard: 'border-2 rounded-none',
    failureCard: 'border-2 rounded-none',
    pendingCard: 'border-2 rounded-none',
    flourish: (s) => <Sparkles className="w-4 h-4" style={{ color: s.accent }} />,
    primaryStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText }),
    primarySuccessStyle: (s) => ({ backgroundColor: s.success, color: s.successText }),
    primaryFailureStyle: (s) => ({ backgroundColor: s.danger, color: '#ffffff' }),
    optionSelectedStyle: (s) => ({ borderColor: s.accent, backgroundColor: s.accentSoft }),
    optionIdleStyle: (s) => ({ borderColor: s.chipLine, backgroundColor: s.card }),
    methodSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accent, backgroundColor: s.accentSoft }),
    methodIdleStyle: (s) => ({ borderColor: s.chipLine, color: s.muted, backgroundColor: s.chip }),
  },

  /* 2 · HAIR STUDIO */
  hair_studio_color_bar: {
    card: 'border rounded-md shadow-none',
    chip: 'border rounded-md',
    primary: 'rounded-md font-serif font-semibold uppercase tracking-[0.16em] text-xs py-3.5 border transition-colors',
    primaryShadow: 'none',
    secondary: 'rounded-md border font-serif text-xs uppercase tracking-[0.16em] py-3 transition-colors',
    stepTitle: 'font-serif tracking-wide',
    stepChip: 'rounded-full border font-serif text-[9px] uppercase tracking-[0.18em]',
    stepChipDone: 'rounded-full font-serif text-[9px] uppercase tracking-[0.18em]',
    input: 'rounded-md border',
    optionCard: 'border-2 rounded-md',
    receiptCard: 'border rounded-md',
    label: 'text-[9px] font-medium uppercase tracking-[0.28em]',
    successCard: 'border-2 rounded-md',
    failureCard: 'border-2 rounded-md',
    pendingCard: 'border-2 rounded-md',
    flourish: (s) => <span className="font-serif italic text-sm leading-none" style={{ color: s.accent }}>No.</span>,
    primaryStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText, borderColor: s.accent }),
    primarySuccessStyle: (s) => ({ backgroundColor: s.success, color: '#ffffff', borderColor: s.success }),
    primaryFailureStyle: (s) => ({ backgroundColor: s.danger, color: '#ffffff', borderColor: s.danger }),
    optionSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accent, backgroundColor: s.accentSoft }),
    optionIdleStyle: (s) => ({ borderColor: s.chipLine, color: s.muted, backgroundColor: s.card }),
    methodSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accent, backgroundColor: s.accentSoft }),
    methodIdleStyle: (s) => ({ borderColor: s.chipLine, color: s.muted, backgroundColor: s.chip }),
  },

  /* 3 · BEAUTY SPA */
  beauty_skin_spa: {
    card: 'border rounded-3xl shadow-sm',
    chip: 'border rounded-full',
    primary: 'rounded-full uppercase tracking-[0.18em] text-[11px] font-semibold py-3.5 transition-all hover:brightness-105 active:scale-[0.99] shadow-md',
    primaryShadow: 'none',
    secondary: 'rounded-full border text-[11px] font-semibold uppercase tracking-[0.14em] py-3 transition-colors',
    stepTitle: 'font-serif tracking-wide',
    stepChip: 'rounded-full text-[9px] font-semibold uppercase tracking-[0.16em]',
    stepChipDone: 'rounded-full text-[9px] font-semibold uppercase tracking-[0.16em]',
    input: 'rounded-2xl border',
    optionCard: 'border-2 rounded-3xl',
    receiptCard: 'border rounded-3xl',
    label: 'text-[9px] font-semibold uppercase tracking-[0.24em]',
    successCard: 'border-2 rounded-3xl',
    failureCard: 'border-2 rounded-3xl',
    pendingCard: 'border-2 rounded-3xl',
    flourish: (s) => <Sparkles className="w-4 h-4" style={{ color: s.accent }} />,
    primaryStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText }),
    primarySuccessStyle: (s) => ({ backgroundColor: s.success, color: s.successText }),
    primaryFailureStyle: (s) => ({ backgroundColor: s.danger, color: '#ffffff' }),
    optionSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accentText, backgroundColor: s.accent }),
    optionIdleStyle: (s) => ({ borderColor: s.chipLine, color: s.muted, backgroundColor: s.card }),
    methodSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accentText, backgroundColor: s.accent }),
    methodIdleStyle: (s) => ({ borderColor: s.chipLine, color: s.muted, backgroundColor: s.chip }),
  },

  /* 4 · FAMILY */
  family_full_service: {
    card: 'border rounded-2xl shadow-sm',
    chip: 'border rounded-lg',
    primary: 'rounded-xl font-extrabold text-xs py-3.5 transition-all hover:brightness-105 active:scale-[0.99]',
    primaryShadow: 'none',
    secondary: 'rounded-xl border font-extrabold text-xs py-3 transition-colors',
    stepTitle: 'font-extrabold tracking-tight',
    stepChip: 'rounded-lg text-[9px] font-extrabold uppercase tracking-[0.1em]',
    stepChipDone: 'rounded-lg text-[9px] font-extrabold uppercase tracking-[0.1em]',
    input: 'rounded-xl border',
    optionCard: 'border-2 rounded-2xl',
    receiptCard: 'border rounded-2xl',
    label: 'text-[9px] font-extrabold uppercase tracking-[0.18em]',
    successCard: 'border-2 rounded-2xl',
    failureCard: 'border-2 rounded-2xl',
    pendingCard: 'border-2 rounded-2xl',
    flourish: (s) => <Sparkles className="w-4 h-4" style={{ color: s.accent }} />,
    primaryStyle: (s) => ({ backgroundColor: s.accent, color: s.accentText }),
    primarySuccessStyle: (s) => ({ backgroundColor: s.success, color: s.successText }),
    primaryFailureStyle: (s) => ({ backgroundColor: s.danger, color: '#ffffff' }),
    optionSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accentText, backgroundColor: s.accent }),
    optionIdleStyle: (s) => ({ borderColor: s.chipLine, color: s.muted, backgroundColor: s.card }),
    methodSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accentText, backgroundColor: s.accent }),
    methodIdleStyle: (s) => ({ borderColor: s.chipLine, color: s.muted, backgroundColor: s.chip }),
  },

  /* 5 · NAIL & LASH */
  nail_lash_studio: {
    card: 'border rounded-3xl shadow-sm',
    chip: 'border rounded-full',
    primary: 'rounded-full font-extrabold text-[10px] uppercase tracking-[0.14em] py-3.5 transition-all hover:brightness-110 active:scale-[0.99]',
    primaryShadow: '0 6px 18px rgba(240,84,163,0.35)',
    secondary: 'rounded-full border font-extrabold text-[10px] uppercase tracking-[0.14em] py-3 transition-colors',
    stepTitle: 'font-extrabold uppercase tracking-[0.04em]',
    stepChip: 'rounded-full text-[8px] font-extrabold uppercase tracking-[0.16em]',
    stepChipDone: 'rounded-full text-[8px] font-extrabold uppercase tracking-[0.16em]',
    input: 'rounded-2xl border',
    optionCard: 'border-2 rounded-3xl',
    receiptCard: 'border rounded-3xl',
    label: 'text-[8px] font-extrabold uppercase tracking-[0.2em]',
    successCard: 'border-2 rounded-3xl',
    failureCard: 'border-2 rounded-3xl',
    pendingCard: 'border-2 rounded-3xl',
    flourish: (s) => <Sparkles className="w-4 h-4" style={{ color: s.accent }} />,
    primaryStyle: (s) => ({
      backgroundImage: `linear-gradient(120deg, ${s.accent} 0%, ${s.accentHover} 100%)`,
      backgroundColor: s.accent,
      color: s.accentText,
    }),
    primarySuccessStyle: (s) => ({ backgroundColor: s.success, color: s.successText }),
    primaryFailureStyle: (s) => ({ backgroundColor: s.danger, color: '#ffffff' }),
    optionSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accentText, backgroundColor: s.accent }),
    optionIdleStyle: (s) => ({ borderColor: s.chipLine, color: s.muted, backgroundColor: s.card }),
    methodSelectedStyle: (s) => ({ borderColor: s.accent, color: s.accentText, backgroundColor: s.accent }),
    methodIdleStyle: (s) => ({ borderColor: s.chipLine, color: s.muted, backgroundColor: s.chip }),
  },
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const STEPS: Array<{ id: PaymentStepId; key: 'option' | 'gateway' | 'result' | 'confirm' | 'receipt' }> = [
  { id: 'option', key: 'option' },
  { id: 'gateway', key: 'gateway' },
  { id: 'result', key: 'result' },
  { id: 'confirm', key: 'confirm' },
  { id: 'receipt', key: 'receipt' },
];

type PaymentStepId = 'option' | 'gateway' | 'result' | 'confirm' | 'receipt';

const GATEWAY_METHODS: PaymentMethod[] = ['card', 'upi', 'netbanking', 'wallet'];

const METHOD_ICONS: Record<PaymentMethod, ReactNode> = {
  card: <CreditCard className="w-4 h-4" />,
  upi: <Smartphone className="w-4 h-4" />,
  netbanking: <Building2 className="w-4 h-4" />,
  wallet: <Wallet className="w-4 h-4" />,
  salon: <Banknote className="w-4 h-4" />,
};

export default function SiteBookingPaymentFlow(props: Props) {
  const {
    themeId,
    data,
    service,
    serviceLines,
    dateKey,
    startMinutes,
    endMinutes,
    staffId,
    staffName,
    customer,
    onBackToSummary,
    onBookingConfirmed,
    onBackToWebsite,
    onStartNewBooking,
    onShowToast,
    initialRecord,
  } = props;

  // PHASE 16.5 — normalised multi-service context. A single-line array is
  // treated as a plain single-service booking (10.7-identical).
  const multiLines = useMemo(
    () => (serviceLines && serviceLines.length > 1 ? serviceLines : null),
    [serviceLines],
  );

  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const T = paymentFlowText(locale);
  const NT = bookingNoticesText(locale);
  const s = paymentSurfaces(themeId, appearance);
  const D = PAYMENT_DESIGNS[themeId];

  const serviceDisplay = useMemo(() => displayService(service, locale), [service, locale]);

  // -----------------------------------------------------------------
  // Tenant ownership — every persisted record carries the active
  // business + theme so a different salon can never share rows.
  // -----------------------------------------------------------------
  const businessId = (service.businessId as string) || (data as unknown as { businessId?: string }).businessId || 'public-site';

  // Derived display strings used by both the body and the receipt helpers.
  const salonName = salonDisplayName(data, themeId);

  // -----------------------------------------------------------------
  // Wizard state
  // -----------------------------------------------------------------
  const [step, setStep] = useState<PaymentStepId>('option');
  const [option, setOption] = useState<PaymentOption>('advance');
  const [record, setRecord] = useState<PaymentRecord | null>(null);
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [gatewayMethod, setGatewayMethod] = useState<PaymentMethod>('card');
  const [gatewayForm, setGatewayForm] = useState<GatewayForm>({ method: 'card' });
  const [gatewayPhase, setGatewayPhase] = useState<'idle' | 'processing' | 'done'>('idle');
  const [gatewayResult, setGatewayResult] = useState<GatewayAttemptResult | null>(null);
  const [gatewaySecondsLeft, setGatewaySecondsLeft] = useState<number | null>(null);
  const attemptRef = useRef<GatewayAttempt | null>(null);
  const [hasCopiedId, setHasCopiedId] = useState(false);
  // PHASE 16.5 — synchronous double-submit lock: two clicks inside the same
  // render tick can both see gatewayPhase === 'idle', so the guard must not
  // depend on React state alone. Cleared when the attempt resolves.
  const submitLockRef = useRef(false);
  // PHASE 16.9 — same guard for the option step (Pay-at-Salon creates the
  // booking row synchronously on Continue, so double-clicks need the ref).
  const optionLockRef = useRef(false);
  useEffect(() => {
    optionLockRef.current = false;
  }, [step]);
  // PHASE 16.9 — gateway cancellation asks for confirmation first. The
  // confirm prompt resets whenever the gateway leaves the processing state.
  const [cancelArmed, setCancelArmed] = useState(false);
  useEffect(() => {
    if (gatewayPhase !== 'processing') setCancelArmed(false);
  }, [gatewayPhase]);

  // Pre-fill the gateway form with the chosen method so the user doesn't
  // have to re-pick the method every retry.
  useEffect(() => {
    setGatewayForm((prev) => ({ ...prev, method: gatewayMethod }));
  }, [gatewayMethod]);

  // -----------------------------------------------------------------
  // Idempotency: if a record for the same booking + slot + option
  // already exists, reuse it on a refresh / re-entry into the flow.
  // -----------------------------------------------------------------
  useEffect(() => {
    // 1) Host-supplied record (e.g. resumed after a refresh).
    if (initialRecord) {
      setRecord(initialRecord);
      setOption(initialRecord.paymentOption);
      if (initialRecord.paymentMethod) setGatewayMethod(initialRecord.paymentMethod);
      if (initialRecord.bookingStatus === 'confirmed' || initialRecord.bookingStatus === 'pay_at_salon') {
        setReceipt(toReceiptView(initialRecord, locale));
        setStep('confirm');
      } else if (initialRecord.bookingStatus === 'pending_payment') {
        setStep('gateway');
        // PHASE 16.9 — payment-pending feedback on resume (recovery path).
        onShowToast?.({ kind: 'info', message: NT['notice.completePayment'] });
      } else if (initialRecord.bookingStatus === 'failed' || initialRecord.bookingStatus === 'cancelled') {
        setStep('result');
        setGatewayResult({
          outcome: initialRecord.bookingStatus === 'cancelled' ? 'cancellation' : 'failure',
          reason: initialRecord.failureReason,
          method: initialRecord.paymentMethod,
          record: initialRecord,
        });
      }
      return;
    }
    // 2) Look for a record matching this service/date/slot/customer.
    const all = readAllFor(businessId, themeId);
    const found = all.find(
      (r) =>
        r.serviceId === service.id
        && r.dateKey === dateKey
        && r.startMinutes === startMinutes
        && r.customer.mobile === customer.mobile
        && (r.bookingStatus === 'pay_at_salon' || r.bookingStatus === 'confirmed' || r.bookingStatus === 'pending_payment' || r.bookingStatus === 'failed' || r.bookingStatus === 'cancelled'),
    );
    if (found) {
      setRecord(found);
      setOption(found.paymentOption);
      if (found.paymentMethod) setGatewayMethod(found.paymentMethod);
      if (found.bookingStatus === 'confirmed' || found.bookingStatus === 'pay_at_salon') {
        setReceipt(toReceiptView(found, locale));
        setStep('confirm');
      } else if (found.bookingStatus === 'pending_payment') {
        setStep('gateway');
        // PHASE 16.9 — payment-pending feedback on resume (recovery path).
        onShowToast?.({ kind: 'info', message: NT['notice.completePayment'] });
      } else if (found.bookingStatus === 'failed' || found.bookingStatus === 'cancelled') {
        setStep('result');
        setGatewayResult({
          outcome: found.bookingStatus === 'cancelled' ? 'cancellation' : 'failure',
          reason: found.failureReason,
          method: found.paymentMethod,
          record: found,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for store changes (e.g. another tab updates the same row).
  useEffect(() => {
    const sync = () => {
      if (!record) return;
      const refreshed = findPaymentRecord(record.bookingId, businessId, themeId);
      if (refreshed && refreshed.updatedAt !== record.updatedAt) {
        setRecord(refreshed);
        if (refreshed.bookingStatus === 'confirmed' || refreshed.bookingStatus === 'pay_at_salon') {
          setReceipt(toReceiptView(refreshed, locale));
        }
      }
    };
    window.addEventListener(PAYMENT_EVENT, sync);
    return () => window.removeEventListener(PAYMENT_EVENT, sync);
  }, [record, businessId, themeId, locale]);

  // -----------------------------------------------------------------
  // Derived amounts
  // -----------------------------------------------------------------
  const offers = (data.offers as unknown as never) || [];
  const basePrice = useMemo(() => {
    const variant = service.pricingVariants?.find((v) => v.status === 'active');
    return variant?.price ?? service.price;
  }, [service]);
  const finalPrice = useMemo(() => {
    const variant = service.pricingVariants?.find((v) => v.status === 'active');
    const base = variant?.price ?? service.price;
    // Offer-aware best price (mirrors serviceDisplayPrice without circular imports)
    let best = base;
    for (const offer of (Array.isArray(offers) ? offers : []) as Array<{
      status: string;
      effectiveStatus: string;
      themeId: string;
      discountType: string;
      discountValue: number;
    }>) {
      if (offer.status !== 'active' || offer.effectiveStatus !== 'active') continue;
      if (offer.themeId !== themeId) continue;
      if (offer.discountType === 'percentage') {
        best = Math.min(best, Math.round((base * (100 - offer.discountValue)) / 100));
      } else if (offer.discountType === 'fixed') {
        best = Math.min(best, Math.max(0, base - offer.discountValue));
      }
    }
    return best;
  }, [service, offers, themeId]);
  // PHASE 16.5 — the REAL booking total: for a multi-service booking it is
  // the sum of the offer-aware line prices computed by the EXISTING 16.2
  // selection engine (never hardcoded); otherwise the single service price.
  const bookingTotal = useMemo(
    () => (multiLines ? multiLines.reduce((sum, line) => sum + line.price, 0) : finalPrice),
    [multiLines, finalPrice],
  );
  const bookingBaseTotal = useMemo(
    () => (multiLines ? bookingTotal : basePrice),
    [multiLines, bookingTotal, basePrice],
  );
  const amounts = useMemo(
    () => calculatePaymentAmounts(option, { price: bookingBaseTotal, finalPrice: bookingTotal }, data.bookingRules),
    [option, bookingBaseTotal, bookingTotal, data.bookingRules],
  );

  // -----------------------------------------------------------------
  // Handlers — move between steps
  // -----------------------------------------------------------------
  const goToOption = useCallback(() => setStep('option'), []);
  const goToGateway = useCallback(() => setStep('gateway'), []);

  /**
   * PHASE 16.6 — duplicate-booking protection. Before ANY record is
   * created, look for a live booking this visitor already made for the
   * exact same salon + theme + services + date + slot + mobile. A refresh,
   * a retry or a return to the confirmation page then re-uses that row
   * (and its existing reference) instead of creating a second booking.
   */
  const bookingServiceIdsForContext = useMemo(
    () => (multiLines ? multiLines.map((line) => line.serviceId) : [service.id]),
    [multiLines, service.id],
  );
  const findLiveDuplicate = useCallback(
    () => findActiveBookingForContext({
      businessId,
      themeId,
      serviceIds: bookingServiceIdsForContext,
      dateKey,
      startMinutes,
      customerMobile: customer.mobile,
    }),
    [businessId, themeId, bookingServiceIdsForContext, dateKey, startMinutes, customer.mobile],
  );
  /** Re-opens an already-confirmed duplicate instead of booking again. */
  const reuseConfirmedDuplicate = useCallback((existing: PaymentRecord): boolean => {
    if (!isConfirmedState(bookingConfirmationState(existing))) return false;
    setRecord(existing);
    setOption(existing.paymentOption);
    setReceipt(toReceiptView(existing, locale));
    setStep('confirm');
    // PHASE 16.9 — duplicate protection announced through the same seam.
    onShowToast?.({
      kind: 'info',
      message: bookingConfirmationText(locale)['duplicate.notice'],
    });
    onBookingConfirmed(existing);
    return true;
  }, [locale, onShowToast, onBookingConfirmed]);

  const proceedFromOption = useCallback(() => {
    // PHASE 16.9 — duplicate-submission guard on the option step (a
    // double-click must not create a second booking row).
    if (optionLockRef.current) return;
    optionLockRef.current = true;
    // PHASE 16.6 — never create a second booking for the same context.
    const duplicate = record || findLiveDuplicate();
    if (duplicate && reuseConfirmedDuplicate(duplicate)) return;
    if (option === 'pay_at_salon') {
      // No gateway — create the booking row immediately, but use an
      // idempotency key so a refresh / re-entry never creates a second row.
      // PHASE 16.6 — an existing live row for this context also donates
      // its reference, so the customer keeps ONE booking number.
      const bookingId = record?.bookingId || duplicate?.bookingId || generateBookingId();
      const created = createPayAtSalonRecord({
        businessId,
        themeId,
        service,
        ...(multiLines ? { services: multiLines } : {}),
        bookingId,
        dateKey,
        startMinutes,
        endMinutes,
        amounts,
        paymentOption: 'pay_at_salon',
        paymentMethod: null,
        staffId: staffId || null,
        staffName: staffName || null,
        customer: {
          name: customer.name,
          mobile: customer.mobile,
          email: customer.email,
          notes: customer.notes,
        },
      });
      setRecord(created);
      setReceipt(toReceiptView(created, locale));
      setStep('confirm');
      onBookingConfirmed(created);
      // PHASE 16.9 — booking-success feedback derived from the REAL
      // persisted row (pay-at-salon path never invents a payment).
      onShowToast?.({
        kind: 'success',
        message: fillNoticeText(NT['notice.bookingConfirmed'], { reference: created.bookingId }),
      });
      // The lock was only needed for this synchronous branch.
      optionLockRef.current = false;
      return;
    }
    setStep('gateway');
    // Lock released by the step-change effect.
  }, [
    option,
    record,
    businessId,
    themeId,
    service,
    multiLines,
    dateKey,
    startMinutes,
    endMinutes,
    amounts,
    staffId,
    staffName,
    customer,
    locale,
    NT,
    onShowToast,
    onBookingConfirmed,
    findLiveDuplicate,
    reuseConfirmedDuplicate,
  ]);

  // -----------------------------------------------------------------
  // Gateway attempt + timeout
  // -----------------------------------------------------------------
  /**
   * PHASE 16.9 — ONE handler for every attempt outcome (first attempt and
   * retry share it), so success/failure/cancellation/timeout feedback and
   * the busy state can never drift apart. Success claims are made from the
   * PERSISTED row the engine patched — never from UI state alone.
   */
  const handleAttemptResult = useCallback((result: GatewayAttemptResult) => {
    setGatewayResult(result);
    setRecord(result.record);
    if (result.outcome === 'success' && result.record.paymentStatus === 'paid') {
      setReceipt(toReceiptView(result.record, locale));
      setStep('confirm');
      onBookingConfirmed(result.record);
      onShowToast?.({ kind: 'success', message: NT['notice.paymentSuccess'] });
    } else {
      if (result.outcome === 'success') {
        // Engine returned success without a paid row — fail closed.
        onShowToast?.({ kind: 'error', message: NT['notice.paymentFailedNoReason'] });
      } else if (result.outcome === 'cancellation') {
        onShowToast?.({ kind: 'warning', message: NT['notice.paymentCancelled'] });
      } else if (result.outcome === 'timeout') {
        onShowToast?.({ kind: 'error', message: NT['notice.paymentTimedOut'] });
      } else {
        onShowToast?.({
          kind: 'error',
          message: result.reason
            ? fillNoticeText(NT['notice.paymentFailed'], { reason: result.reason })
            : NT['notice.paymentFailedNoReason'],
        });
      }
      setStep('result');
    }
    setGatewayPhase('done');
    submitLockRef.current = false;
    setGatewaySecondsLeft(null);
  }, [locale, onBookingConfirmed, onShowToast, NT]);

  const startGatewayAttempt = useCallback((overrideMethod?: PaymentMethod) => {
    // PHASE 16.5 — duplicate-submission guard (double-click / double-tap):
    // one live attempt at a time, enforced synchronously via a ref.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    // PHASE 16.9 — payment-pending feedback the moment an attempt starts.
    onShowToast?.({ kind: 'info', message: NT['notice.paymentPending'] });
    // PHASE 16.6 — a live booking already exists for this exact context
    // (refresh / retry / returning to the page): re-use it instead of
    // creating a second booking. An already-confirmed one goes straight
    // back to its confirmation screen.
    const liveDuplicate = record || findLiveDuplicate();
    if (!record && liveDuplicate) {
      submitLockRef.current = false;
      if (reuseConfirmedDuplicate(liveDuplicate)) return;
      setRecord(liveDuplicate);
      setOption(liveDuplicate.paymentOption);
      onShowToast?.({
        kind: 'info',
        message: bookingConfirmationText(locale)['duplicate.notice'],
      });
      return;
    }
    if (!record && option !== 'pay_at_salon') {
      // First attempt — create a pending record BEFORE the user sees the
      // payment form, so a refresh during processing still has a row to
      // resume.
      const bookingId = generateBookingId();
      const initial = createPendingBookingRecord({
        businessId,
        themeId,
        service,
        ...(multiLines ? { services: multiLines } : {}),
        bookingId,
        dateKey,
        startMinutes,
        endMinutes,
        amounts,
        paymentOption: option,
        paymentMethod: null,
        staffId: staffId || null,
        staffName: staffName || null,
        customer: {
          name: customer.name,
          mobile: customer.mobile,
          email: customer.email,
          notes: customer.notes,
        },
      });
      setRecord(initial);
    }

    const target = overrideMethod || gatewayMethod;
    setGatewayMethod(target);
    setGatewayForm((prev) => ({ ...prev, method: target }));
    setGatewayPhase('processing');
    setGatewayResult(null);
    setGatewaySecondsLeft(Math.floor(paymentGatewayTimeoutMs() / 1000));

    // Run after the current render so the form state is committed.
    setTimeout(() => {
      // If we don't have a record in state yet (e.g. first attempt), try
      // to find an existing pending record for this slot + option.
      let activeRec = record;
      if (!activeRec) {
        const all = readAllFor(businessId, themeId);
        activeRec = all.find(
          (r) => r.serviceId === service.id
            && r.dateKey === dateKey
            && r.startMinutes === startMinutes
            && r.paymentOption === option
            && r.bookingStatus === 'pending_payment',
        ) || (null as unknown as PaymentRecord);
      }
      if (!activeRec) {
        setGatewayPhase('done');
        submitLockRef.current = false;
        setGatewayResult({
          outcome: 'failure',
          reason: 'Could not start payment session — please try again',
          method: target,
          record: null as unknown as PaymentRecord,
        });
        return;
      }
      const form: Partial<GatewayForm> = { ...gatewayForm, method: target };
      const attempt = simulateGateway(activeRec, form);
      attemptRef.current = attempt;
      attempt.promise.then(handleAttemptResult);
    }, 50);
  }, [
    record,
    option,
    businessId,
    themeId,
    service,
    multiLines,
    dateKey,
    startMinutes,
    endMinutes,
    amounts,
    staffId,
    staffName,
    customer,
    gatewayMethod,
    gatewayForm,
    onShowToast,
    NT,
    handleAttemptResult,
    findLiveDuplicate,
    reuseConfirmedDuplicate,
  ]);

  // Tick the timeout counter for the user-facing timer.
  useEffect(() => {
    if (gatewayPhase !== 'processing') return undefined;
    if (gatewaySecondsLeft == null) return undefined;
    if (gatewaySecondsLeft <= 0) {
      // PHASE 16.9 — an expired attempt is a TIMEOUT (record → failed),
      // distinct from the customer cancelling (record → cancelled).
      attemptRef.current?.cancel('Payment timed out — please retry', 'timeout');
      return undefined;
    }
    const id = window.setTimeout(() => {
      setGatewaySecondsLeft((s) => (s == null ? s : s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [gatewayPhase, gatewaySecondsLeft]);

  const cancelGateway = useCallback(() => {
    // PHASE 16.9 — cancel exactly once; the confirm prompt guards the rest.
    const attempt = attemptRef.current;
    if (!attempt) return;
    attemptRef.current = null;
    attempt.cancel('Payment cancelled by customer');
  }, []);

  const retryGateway = useCallback((method: PaymentMethod) => {
    if (!record) return;
    // PHASE 16.5 — same duplicate-submission guard as the first attempt.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    // PHASE 16.9 — payment-pending feedback on retry too.
    onShowToast?.({ kind: 'info', message: NT['notice.paymentPending'] });
    setGatewayMethod(method);
    setGatewayForm((prev) => ({ ...prev, method }));
    setGatewayPhase('processing');
    // PHASE 16.9 — the previous result stays visible while the retry runs
    // (the result card flips into its busy state), so the visitor never
    // sees a blank screen mid-retry. The new result replaces it on resolve.
    setGatewaySecondsLeft(Math.floor(paymentGatewayTimeoutMs() / 1000));
    setTimeout(() => {
      const attempt = retryPayment(record, { ...gatewayForm, method });
      attemptRef.current = attempt;
      attempt.promise.then(handleAttemptResult);
    }, 50);
  }, [record, gatewayForm, onShowToast, NT, handleAttemptResult]);

  // -----------------------------------------------------------------
  // Receipt helpers
  // -----------------------------------------------------------------
  const downloadReceipt = useCallback(() => {
    if (!receipt) return;
    const text = renderReceiptText(receipt, T, locale, salonName);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexora-receipt-${receipt.bookingId}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }, [receipt, T, locale, salonName]);

  const printReceipt = useCallback(() => {
    if (!receipt) return;
    const text = renderReceiptText(receipt, T, locale, salonName);
    const win = window.open('', 'nexora-receipt', 'width=480,height=720');
    if (!win) {
      // Pop-up blocked — fall back to a download.
      onShowToast?.(T['receipt.print']);
      downloadReceipt();
      return;
    }
    win.document.write(`<title>${T['receipt.title']} · ${receipt.bookingId}</title>`);
    win.document.write('<style>body{font-family:ui-monospace,monospace;padding:24px;color:#111;background:#fdfaf1;}h1{font-size:18px;margin:0 0 4px;}h2{font-size:12px;margin:18px 0 4px;text-transform:uppercase;letter-spacing:.18em;color:#555;}table{width:100%;font-size:12px;border-collapse:collapse;}td{padding:4px 0;vertical-align:top;}hr{border:0;border-top:1px dashed #888;margin:14px 0;}.right{text-align:right;}.muted{color:#666;}</style>');
    win.document.write(`<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(text)}</pre>`);
    win.document.close();
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        downloadReceipt();
      }
    }, 150);
  }, [receipt, T, locale, downloadReceipt, onShowToast]);

  const copyBookingId = useCallback(() => {
    if (!receipt) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(receipt.bookingId).then(
        () => {
          setHasCopiedId(true);
          window.setTimeout(() => setHasCopiedId(false), 1800);
        },
        () => {
          onShowToast?.(T['confirm.copied']);
        },
      );
    } else {
      onShowToast?.(T['confirm.copied']);
    }
  }, [receipt, onShowToast, T]);

  const addToCalendar = useCallback(() => {
    if (!receipt) return;
    const start = minutesToDate(receipt.dateKey, receipt.startLabel);
    const end = minutesToDate(receipt.dateKey, receipt.endLabel);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      `${receipt.serviceName} @ ${salonDisplayName(data, themeId)}`,
    )}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(
      `${T['receipt.bookingId']}: ${receipt.bookingId}\n${T['receipt.amount']}: ${formatCurrency(receipt.totalAmount)}`,
    )}&location=${encodeURIComponent(data.address?.fullAddress || '')}`;
    window.open(url, '_blank', 'noopener');
  }, [receipt, data, themeId, T]);

  const sendOnWhatsApp = useCallback(() => {
    if (!receipt) return;
    const message = buildWhatsAppMessage(receipt, T, locale, salonDisplayName(data, themeId));
    // PHASE 16.8 — the salon's own WhatsApp number is addressed ONLY when the
    // advance payment authorizes it (`pay_at_salon` receipts do not). Without
    // that authorization the receipt is still shareable — just not to the
    // salon's protected number.
    const authorized = authorizeContactOpen('whatsapp', data, themeId);
    const target = authorized
      ? `${authorized}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(target, '_blank', 'noopener');
  }, [receipt, data, themeId, T, locale]);

  // -----------------------------------------------------------------
  // PHASE 16.6 — confirmation view derived from the PERSISTED record.
  // "Confirmed" is never shown from UI state alone: the state comes from
  // the booking + payment status pair the engine actually wrote.
  // -----------------------------------------------------------------
  const CT = bookingConfirmationText(locale);
  const confirmationView = useMemo(
    () => (record ? toBookingConfirmation(record) : null),
    [record],
  );
  const confirmationState = confirmationView
    ? confirmationView.state
    : receipt
      ? bookingConfirmationState({ bookingStatus: receipt.bookingStatus, paymentStatus: receipt.paymentStatus })
      : 'payment_pending';
  const confirmationIsConfirmed = isConfirmedState(confirmationState);
  const confirmationColors = confirmationStateColors(confirmationState, s);

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const nameStyle = { ...getSalonNameStyle(data) };
  if (!nameStyle.color) nameStyle.color = s.textStrong;

  const stepChipStyle = (id: PaymentStepId): CSSProperties => {
    const index = STEPS.findIndex((s) => s.id === id);
    if (index < stepIndex) return { backgroundColor: s.success, color: '#ffffff', borderColor: s.success };
    if (index === stepIndex) return { backgroundColor: s.accent, color: s.accentText, borderColor: s.accent };
    return { backgroundColor: s.chip, color: s.muted, borderColor: s.chipLine };
  };

  const primaryBtnStyle: CSSProperties = { ...D.primaryStyle(s), boxShadow: D.primaryShadow };
  const successBtnStyle: CSSProperties = { ...D.primarySuccessStyle(s), boxShadow: D.primaryShadow };
  const failureBtnStyle: CSSProperties = { ...D.primaryFailureStyle(s), boxShadow: D.primaryShadow };

  return (
    <div
      data-testid="payment-flow"
      data-theme={themeId}
      data-appearance={appearance}
      data-locale={locale}
      data-step={step}
      data-payment-option={option}
      className="absolute inset-0 z-[70] flex flex-col overflow-hidden booking-page-container booking-wrapper step-container booking-container"
      style={{ backgroundColor: s.page, color: s.text }}
    >
      {/* ---- header ---- */}
      <header
        className="shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b"
        style={{ backgroundColor: s.card, borderColor: s.line }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            data-testid="payment-back-to-website"
            onClick={onBackToWebsite}
            className={`${D.secondary} px-3 md:px-3.5 flex items-center gap-1.5 shrink-0 cursor-pointer`}
            style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
            aria-label={T['common.close']}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{T['common.close']}</span>
          </button>
          <span className="truncate text-sm md:text-base font-bold" style={nameStyle}>
            {salonName}
          </span>
        </div>
        <span
          className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: s.well, color: s.muted, border: `1px solid ${s.chipLine}`, borderRadius: 8 }}
        >
          {fillPaymentText(T['step.of'] || 'Step {current} of {total}', { current: stepIndex + 1, total: STEPS.length })}
        </span>
      </header>

      {/* ---- stepper ---- */}
      <div
        data-testid="payment-stepper"
        className="shrink-0 px-4 md:px-6 py-3 border-b flex items-center gap-1.5 md:gap-2 overflow-x-auto"
        style={{ backgroundColor: s.page, borderColor: s.line }}
      >
        {STEPS.map((s2, index) => {
          const isDone = index < stepIndex;
          const isCurrent = index === stepIndex;
          const label = T[`step.${s2.key}` as keyof typeof T];
          return (
            <React.Fragment key={s2.id}>
              {index > 0 && <ChevronRight className="w-3 h-3 shrink-0" style={{ color: s.chipLine }} />}
              <button
                type="button"
                data-testid={`payment-step-${s2.id}`}
                data-state={isDone ? 'done' : isCurrent ? 'current' : 'upcoming'}
                aria-current={isCurrent ? 'step' : undefined}
                disabled
                className={`${isDone ? D.stepChipDone : D.stepChip} px-2.5 md:px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap`}
                style={stepChipStyle(s2.id)}
              >
                {isDone ? <Check className="w-3 h-3" /> : <span>{index + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* ---- body ---- */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar booking-step-content">
        <div
          data-testid="payment-body"
          className="max-w-4xl mx-auto w-full px-4 md:px-6 py-5 md:py-6 flex flex-col gap-5"
        >
          {/* ================== STEP 1 · PAYMENT OPTION ================== */}
          {step === 'option' && (
            <motion.div
              key="payment-option"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center gap-2.5">
                {D.flourish(s)}
                <div>
                  <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                    {T['option.title']}
                  </h1>
                  <p className="text-[11px] mt-0.5 font-medium" style={{ color: s.muted }}>
                    {T['option.subtitle']}
                  </p>
                </div>
              </div>

              <BookingSummaryCard
                D={D}
                s={s}
                T={T}
                locale={locale}
                serviceDisplay={serviceDisplay}
                service={service}
                serviceLines={multiLines}
                data={data}
                dateKey={dateKey}
                startMinutes={startMinutes}
                endMinutes={endMinutes}
                staffName={staffName}
                amounts={amounts}
                option={option}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <PaymentOptionCard
                  D={D}
                  s={s}
                  T={T}
                  locale={locale}
                  testid="payment-option-pay-at-salon"
                  icon={<Banknote className="w-4 h-4" />}
                  title={T['option.payAtSalon.title']}
                  body={T['option.payAtSalon.body']}
                  amountLabel={formatCurrency(amounts.remainingAmount || amounts.baseAmount)}
                  amountCaption={T['option.dueAtSalon']}
                  selected={option === 'pay_at_salon'}
                  onSelect={() => setOption('pay_at_salon')}
                />
                <PaymentOptionCard
                  D={D}
                  s={s}
                  T={T}
                  locale={locale}
                  testid="payment-option-advance"
                  icon={<ShieldCheck className="w-4 h-4" />}
                  title={T['option.advance.title']}
                  body={fillPaymentText(T['option.advance.body'], {})}
                  amountLabel={formatCurrency(amounts.amountDue)}
                  amountCaption={fillPaymentText(T['option.advancePct'], { pct: amounts.advancePercent })}
                  selected={option === 'advance'}
                  onSelect={() => setOption('advance')}
                  recommended
                />
                <PaymentOptionCard
                  D={D}
                  s={s}
                  T={T}
                  locale={locale}
                  testid="payment-option-full"
                  icon={<Lock className="w-4 h-4" />}
                  title={T['option.full.title']}
                  body={T['option.full.body']}
                  amountLabel={formatCurrency(amounts.amountDue)}
                  amountCaption={T['option.dueNow']}
                  selected={option === 'full'}
                  onSelect={() => setOption('full')}
                />
              </div>

              <p
                className="text-[10px] font-semibold p-2.5 border"
                style={{
                  backgroundColor: s.well,
                  borderColor: s.chipLine,
                  color: s.muted,
                  borderRadius: 10,
                }}
                data-testid="payment-option-secure-note"
              >
                <Lock className="inline w-3 h-3 mr-1" style={{ color: s.accent }} />
                {T['option.secureNote']}
              </p>
            </motion.div>
          )}

          {/* ================== STEP 2 · PAYMENT GATEWAY ================== */}
          {step === 'gateway' && (
            <motion.div
              key="payment-gateway"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center gap-2.5">
                {D.flourish(s)}
                <div>
                  <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                    {T['gateway.title']}
                  </h1>
                  <p className="text-[11px] mt-0.5 font-medium" style={{ color: s.muted }}>
                    {T['gateway.subtitle']}
                  </p>
                </div>
              </div>

              <div
                className={`${D.card} p-4 md:p-5 flex flex-col gap-4`}
                style={{ backgroundColor: s.card, borderColor: s.line }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className={`${D.label}`} style={{ color: s.muted }}>
                    {T['gateway.method']}
                  </span>
                  <span
                    className="text-[10px] font-bold px-2 py-1"
                    style={{ backgroundColor: s.well, color: s.muted, borderRadius: 999 }}
                  >
                    {paymentOptionLabel(option, locale)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {GATEWAY_METHODS.map((method) => {
                    const selected = method === gatewayMethod;
                    const processing = gatewayPhase === 'processing';
                    return (
                      <button
                        key={method}
                        type="button"
                        data-testid={`payment-method-${method}`}
                        data-selected={selected}
                        disabled={processing}
                        onClick={() => setGatewayMethod(method)}
                        className={`${D.chip} px-3 py-3 flex flex-col items-center gap-1.5 text-[11px] font-bold ${processing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        style={selected ? D.methodSelectedStyle(s) : D.methodIdleStyle(s)}
                      >
                        {METHOD_ICONS[method]}
                        <span>{paymentMethodLabel(method, locale)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-3 mt-1">
                  {gatewayMethod === 'card' && (
                    <>
                      <FormField D={D} s={s} label={T['gateway.cardLabel']} testid="payment-card-number">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          placeholder="1234 5678 9012 3456"
                          data-testid="payment-card-number"
                          value={gatewayForm.cardNumber || ''}
                          onChange={(e) => setGatewayForm((f) => ({ ...f, cardNumber: e.target.value }))}
                          className={`${D.input} w-full px-3.5 py-2.5 text-xs font-semibold outline-none`}
                          style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.textStrong }}
                        />
                      </FormField>
                      <FormField D={D} s={s} label={T['gateway.cardHolder']} testid="payment-card-holder">
                        <input
                          type="text"
                          autoComplete="cc-name"
                          placeholder="A. Customer"
                          data-testid="payment-card-holder"
                          value={gatewayForm.cardHolder || ''}
                          onChange={(e) => setGatewayForm((f) => ({ ...f, cardHolder: e.target.value }))}
                          className={`${D.input} w-full px-3.5 py-2.5 text-xs font-semibold outline-none`}
                          style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.textStrong }}
                        />
                      </FormField>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField D={D} s={s} label={T['gateway.cardExpiry']} testid="payment-card-expiry">
                          <input
                            type="text"
                            autoComplete="cc-exp"
                            placeholder="12/28"
                            data-testid="payment-card-expiry"
                            value={gatewayForm.cardExpiry || ''}
                            onChange={(e) => setGatewayForm((f) => ({ ...f, cardExpiry: e.target.value }))}
                            className={`${D.input} w-full px-3.5 py-2.5 text-xs font-semibold outline-none`}
                            style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.textStrong }}
                          />
                        </FormField>
                        <FormField D={D} s={s} label={T['gateway.cardCvv']} testid="payment-card-cvv">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            placeholder="•••"
                            data-testid="payment-card-cvv"
                            value={(gatewayForm as { cardCvv?: string }).cardCvv || ''}
                            onChange={(e) => setGatewayForm((f) => ({ ...f, cardCvv: e.target.value }))}
                            className={`${D.input} w-full px-3.5 py-2.5 text-xs font-semibold outline-none`}
                            style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.textStrong }}
                          />
                        </FormField>
                      </div>
                    </>
                  )}
                  {gatewayMethod === 'upi' && (
                    <FormField D={D} s={s} label={T['gateway.upiLabel']} testid="payment-upi-id">
                      <input
                        type="text"
                        placeholder="yourname@bank"
                        data-testid="payment-upi-id"
                        value={gatewayForm.upiId || ''}
                        onChange={(e) => setGatewayForm((f) => ({ ...f, upiId: e.target.value }))}
                        className={`${D.input} w-full px-3.5 py-2.5 text-xs font-semibold outline-none`}
                        style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.textStrong }}
                      />
                    </FormField>
                  )}
                  {gatewayMethod === 'netbanking' && (
                    <FormField D={D} s={s} label={T['gateway.bankLabel']} testid="payment-bank-label">
                      <input
                        type="text"
                        placeholder="HDFC Bank"
                        data-testid="payment-bank-label"
                        value={gatewayForm.bankLabel || ''}
                        onChange={(e) => setGatewayForm((f) => ({ ...f, bankLabel: e.target.value }))}
                        className={`${D.input} w-full px-3.5 py-2.5 text-xs font-semibold outline-none`}
                        style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.textStrong }}
                      />
                    </FormField>
                  )}
                  {gatewayMethod === 'wallet' && (
                    <FormField D={D} s={s} label={T['gateway.walletLabel']} testid="payment-wallet-label">
                      <input
                        type="text"
                        placeholder="Paytm Wallet"
                        data-testid="payment-wallet-label"
                        value={gatewayForm.walletLabel || ''}
                        onChange={(e) => setGatewayForm((f) => ({ ...f, walletLabel: e.target.value }))}
                        className={`${D.input} w-full px-3.5 py-2.5 text-xs font-semibold outline-none`}
                        style={{ backgroundColor: s.well, borderColor: s.chipLine, color: s.textStrong }}
                      />
                    </FormField>
                  )}
                </div>

                <div
                  className="flex items-center justify-between text-xs font-bold"
                  style={{ color: s.textStrong }}
                >
                  <span className={`${D.label}`} style={{ color: s.muted }}>
                    {T['gateway.amount']}
                  </span>
                  <span data-testid="payment-amount" style={{ color: s.accent }}>
                    {formatCurrency(amounts.amountDue)}
                  </span>
                </div>

                {gatewayPhase === 'processing' && (
                  <div
                    data-testid="payment-processing"
                    className="flex flex-col items-center justify-center gap-2 py-6 border"
                    style={{ backgroundColor: s.well, borderColor: s.chipLine, borderRadius: 12 }}
                  >
                    <Hourglass className="w-5 h-5 animate-spin" style={{ color: s.accent }} />
                    <p className="text-[11px] font-bold" style={{ color: s.textStrong }}>
                      {T['gateway.processing']}
                    </p>
                    <p className="text-[10px] font-semibold" style={{ color: s.muted }}>
                      {T['gateway.processingHint']}
                    </p>
                    {gatewaySecondsLeft != null && (
                      <p
                        data-testid="payment-timeout-hint"
                        className="text-[10px] font-semibold mt-1"
                        style={{ color: s.warning }}
                      >
                        {fillPaymentText(T['gateway.timeoutHint'], { seconds: gatewaySecondsLeft })}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-[10px] font-semibold flex items-center gap-1.5" style={{ color: s.muted }}>
                  <Lock className="w-3 h-3" style={{ color: s.accent }} />
                  {T['gateway.sandboxNote']}
                </p>
              </div>
            </motion.div>
          )}

          {/* ================== STEP 3 · PAYMENT RESULT ================== */}
          {step === 'result' && gatewayResult && (
            <motion.div
              key="payment-result"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-4"
            >
              <div
                data-testid="payment-result"
                data-outcome={gatewayResult.outcome}
                className={`${gatewayResult.outcome === 'success' ? D.successCard : gatewayResult.outcome === 'failure' || gatewayResult.outcome === 'timeout' ? D.failureCard : D.pendingCard} p-6 flex flex-col items-center text-center gap-3`}
                style={{
                  backgroundColor:
                    gatewayResult.outcome === 'success'
                      ? s.successSoft
                      : gatewayResult.outcome === 'cancellation'
                        ? s.warningSoft
                        : s.dangerSoft,
                  borderColor:
                    gatewayResult.outcome === 'success'
                      ? s.success
                      : gatewayResult.outcome === 'cancellation'
                        ? s.warning
                        : s.danger,
                }}
              >
                {gatewayResult.outcome === 'success' ? (
                  <CheckCircle2 className="w-12 h-12" style={{ color: s.success }} />
                ) : gatewayResult.outcome === 'cancellation' ? (
                  <XCircle className="w-12 h-12" style={{ color: s.warning }} />
                ) : (
                  <AlertTriangle className="w-12 h-12" style={{ color: s.danger }} />
                )}
                <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                  {T[`result.${gatewayResult.outcome}.title` as keyof typeof T]}
                </h1>
                <p className="text-[11px] max-w-md" style={{ color: s.muted }}>
                  {T[`result.${gatewayResult.outcome}.subtitle` as keyof typeof T]}
                </p>
                {gatewayResult.reason && (
                  <p
                    data-testid="payment-result-reason"
                    className="text-[10px] font-semibold px-2.5 py-1.5 mt-1"
                    style={{
                      backgroundColor: s.card,
                      color: s.muted,
                      borderRadius: 999,
                      border: `1px solid ${s.chipLine}`,
                    }}
                  >
                    {T['result.reason']}: {gatewayResult.reason}
                  </p>
                )}
                {record && (
                  <p className="text-[10px] font-semibold mt-1" style={{ color: s.muted }}>
                    {T['confirm.bookingId']}: <span className="font-extrabold" style={{ color: s.textStrong }}>{record.bookingId}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                {gatewayResult.outcome === 'success' ? (
                  <button
                    type="button"
                    data-testid="payment-result-continue"
                    onClick={() => setStep('confirm')}
                    className={`${D.primary} px-6 flex-1 flex items-center justify-center gap-2 cursor-pointer`}
                    style={successBtnStyle}
                  >
                    <CalendarCheck className="w-4 h-4" />
                    {T['confirm.title']}
                  </button>
                ) : (
                  <>
                    {/* PHASE 16.9 — while a retry is processing, ONLY the
                        retry itself is busy: the other actions disable so
                        the visitor cannot fork a second attempt. */}
                    <button
                      type="button"
                      data-testid="payment-retry"
                      onClick={() => retryGateway(gatewayResult.method)}
                      disabled={gatewayPhase === 'processing'}
                      aria-busy={gatewayPhase === 'processing'}
                      className={`${D.primary} px-6 flex-1 flex items-center justify-center gap-2 ${
                        gatewayPhase === 'processing' ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                      }`}
                      style={primaryBtnStyle}
                    >
                      <RefreshCw className={`w-4 h-4 ${gatewayPhase === 'processing' ? 'animate-spin' : ''}`} />
                      {gatewayPhase === 'processing' ? T['gateway.processing'] : T['result.retry']}
                    </button>
                    <button
                      type="button"
                      data-testid="payment-try-different"
                      onClick={() => setStep('gateway')}
                      disabled={gatewayPhase === 'processing'}
                      className={`${D.secondary} px-6 flex-1 flex items-center justify-center gap-2 ${
                        gatewayPhase === 'processing' ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                      }`}
                      style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                    >
                      <CreditCard className="w-4 h-4" />
                      {T['result.tryDifferent']}
                    </button>
                    <button
                      type="button"
                      data-testid="payment-change-option"
                      onClick={goToOption}
                      disabled={gatewayPhase === 'processing'}
                      className={`${D.secondary} px-6 flex-1 flex items-center justify-center gap-2 ${
                        gatewayPhase === 'processing' ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                      }`}
                      style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                    >
                      {T['result.backToOptions']}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* ================== STEP 4 · CONFIRMATION ================== */}
          {step === 'confirm' && receipt && (
            <motion.div
              key="payment-confirm"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-4"
            >
              {/* PHASE 16.6 — the banner is derived from the REAL persisted
                  status pair: "Confirmed" only after the required payment
                  actually succeeded (or the explicit pay-at-salon path). */}
              <div
                data-testid="payment-confirm"
                data-confirmed={confirmationIsConfirmed}
                data-confirmation-state={confirmationState}
                className={`${D.successCard} p-6 flex flex-col items-center text-center gap-3`}
                style={{ backgroundColor: confirmationColors.bg, borderColor: confirmationColors.border }}
              >
                {confirmationIsConfirmed ? (
                  <CheckCircle2 className="w-12 h-12" style={{ color: confirmationColors.fg }} />
                ) : confirmationState === 'payment_pending' ? (
                  <Hourglass className="w-12 h-12" style={{ color: confirmationColors.fg }} />
                ) : (
                  <AlertTriangle className="w-12 h-12" style={{ color: confirmationColors.fg }} />
                )}
                <h1 className={`text-lg md:text-xl ${D.stepTitle}`} style={{ color: s.textStrong }}>
                  {CT[`state.${confirmationState}.headline` as keyof typeof CT]}
                </h1>
                <p className="text-[11px] max-w-md" style={{ color: s.muted }}>
                  {CT[`state.${confirmationState}.body` as keyof typeof CT]}
                </p>
                <span
                  data-testid="payment-confirm-state-chip"
                  className="text-[9px] font-extrabold uppercase tracking-[0.16em] px-2.5 py-1"
                  style={{ backgroundColor: confirmationColors.fg, color: '#ffffff', borderRadius: 999 }}
                >
                  {CT[`state.${confirmationState}` as keyof typeof CT]}
                </span>
                <div
                  data-testid="payment-confirm-booking-id"
                  className="mt-2 flex items-center gap-2 px-3 py-1.5"
                  style={{
                    backgroundColor: s.card,
                    borderRadius: 10,
                    border: `1px solid ${s.chipLine}`,
                    color: s.textStrong,
                  }}
                >
                  <span className={`${D.label}`} style={{ color: s.muted }}>{T['confirm.bookingId']}</span>
                  <span className="text-sm font-extrabold" style={{ color: s.accent }}>{receipt.bookingId}</span>
                  <button
                    type="button"
                    data-testid="payment-copy-booking-id"
                    onClick={copyBookingId}
                    className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                    style={{ color: s.accent }}
                  >
                    {hasCopiedId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {hasCopiedId ? T['confirm.copied'] : T['confirm.copyId']}
                  </button>
                </div>
              </div>

              {/* PHASE 16.6 — one shared confirmation panel (also used by
                  the booking-history summary view) fed by the SAME record
                  the engine persisted. `payment-confirm-card` keeps its
                  10.7 test id so earlier phases stay intact. */}
              {confirmationView ? (
                <SiteBookingConfirmation
                  themeId={themeId}
                  data={data}
                  view={confirmationView}
                  variant="flow"
                  showStatusBanner={false}
                  showReference={false}
                  showActions={false}
                  detailsTestId="payment-confirm-card"
                />
              ) : (
                <ConfirmationCard D={D} s={s} T={T} locale={locale} receipt={receipt} data={data} staffName={staffName} />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <button
                  type="button"
                  data-testid="payment-view-receipt"
                  onClick={() => setStep('receipt')}
                  className={`${D.primary} px-4 flex items-center justify-center gap-2 cursor-pointer`}
                  style={primaryBtnStyle}
                >
                  <ReceiptIcon className="w-4 h-4" />
                  {T['confirm.viewReceipt']}
                </button>
                <button
                  type="button"
                  data-testid="payment-add-to-calendar"
                  onClick={addToCalendar}
                  className={`${D.secondary} px-4 flex items-center justify-center gap-2 cursor-pointer`}
                  style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                >
                  <Calendar className="w-4 h-4" />
                  {T['confirm.calendar']}
                </button>
                <button
                  type="button"
                  data-testid="payment-whatsapp"
                  onClick={sendOnWhatsApp}
                  className={`${D.secondary} px-4 flex items-center justify-center gap-2 cursor-pointer`}
                  style={{ backgroundColor: '#25D366', color: '#ffffff', borderColor: '#25D366' }}
                >
                  <MessageCircle className="w-4 h-4" />
                  {T['confirm.whatsapp']}
                </button>
                <button
                  type="button"
                  data-testid="payment-new-booking"
                  onClick={onStartNewBooking}
                  className={`${D.secondary} px-4 flex items-center justify-center gap-2 cursor-pointer`}
                  style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                >
                  <Sparkles className="w-4 h-4" />
                  {T['confirm.newBooking']}
                </button>
              </div>

              <p
                className="text-[10px] font-semibold flex items-center gap-1.5"
                style={{ color: s.muted }}
              >
                <Lock className="w-3 h-3" style={{ color: s.accent }} />
                {T['confirm.whatsappHint']}
              </p>

              <button
                type="button"
                data-testid="payment-back-to-website-confirm"
                onClick={onBackToWebsite}
                className={`${D.secondary} w-full px-4 flex items-center justify-center gap-2 cursor-pointer`}
                style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
              >
                {T['confirm.backToWebsite']}
              </button>
            </motion.div>
          )}

          {/* ================== STEP 5 · RECEIPT ================== */}
          {step === 'receipt' && receipt && (
            <motion.div
              key="payment-receipt"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-4"
            >
              <ReceiptCard
                D={D}
                s={s}
                T={T}
                locale={locale}
                receipt={receipt}
                data={data}
                staffName={staffName}
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  data-testid="payment-receipt-print"
                  onClick={printReceipt}
                  className={`${D.primary} px-4 flex items-center justify-center gap-2 cursor-pointer`}
                  style={primaryBtnStyle}
                >
                  <Printer className="w-4 h-4" />
                  {T['receipt.print']}
                </button>
                <button
                  type="button"
                  data-testid="payment-receipt-download"
                  onClick={downloadReceipt}
                  className={`${D.secondary} px-4 flex items-center justify-center gap-2 cursor-pointer`}
                  style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                >
                  <Download className="w-4 h-4" />
                  {T['receipt.download']}
                </button>
                <button
                  type="button"
                  data-testid="payment-receipt-whatsapp"
                  onClick={sendOnWhatsApp}
                  className={`${D.secondary} px-4 flex items-center justify-center gap-2 cursor-pointer`}
                  style={{ backgroundColor: '#25D366', color: '#ffffff', borderColor: '#25D366' }}
                >
                  <MessageCircle className="w-4 h-4" />
                  {T['confirm.whatsapp']}
                </button>
                <button
                  type="button"
                  data-testid="payment-receipt-back"
                  onClick={() => setStep('confirm')}
                  className={`${D.secondary} px-4 flex items-center justify-center gap-2 cursor-pointer`}
                  style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                >
                  {T['common.back']}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* ---- sticky action bar ---- */}
      <footer
        className="shrink-0 border-t px-4 md:px-6 py-3 flex items-center justify-between gap-3 booking-action-bar navigation-footer"
        style={{ backgroundColor: s.card, borderColor: s.line }}
      >
        {step === 'option' && (
          <>
            <button
              type="button"
              data-testid="payment-back-to-summary"
              onClick={onBackToSummary}
              className={`${D.secondary} px-4 flex items-center gap-1.5 cursor-pointer`}
              style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {T['option.backToSummary']}
            </button>
            <button
              type="button"
              data-testid="payment-continue"
              onClick={proceedFromOption}
              className={`${D.primary} px-6 md:px-8 flex items-center gap-2 cursor-pointer`}
              style={primaryBtnStyle}
            >
              {option === 'pay_at_salon' ? <Check className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {option === 'pay_at_salon' ? T['option.payAtSalon.title'] : T['option.continue']}
            </button>
          </>
        )}

        {step === 'gateway' && (
          <>
            <button
              type="button"
              data-testid="payment-gateway-back"
              onClick={goToOption}
              disabled={gatewayPhase === 'processing'}
              className={`${D.secondary} px-4 flex items-center gap-1.5 ${
                gatewayPhase === 'processing' ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
              }`}
              style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {T['option.backToSummary']}
            </button>
            {gatewayPhase === 'idle' && (
              <button
                type="button"
                data-testid="payment-gateway-pay"
                onClick={() => startGatewayAttempt()}
                className={`${D.primary} px-6 md:px-8 flex items-center gap-2 cursor-pointer`}
                style={primaryBtnStyle}
              >
                <Lock className="w-4 h-4" />
                {fillPaymentText(T['gateway.payNow'], { amount: formatCurrency(amounts.amountDue) })}
              </button>
            )}
            {gatewayPhase === 'processing' && !cancelArmed && (
              <button
                type="button"
                data-testid="payment-gateway-cancel"
                onClick={() => setCancelArmed(true)}
                aria-haspopup="dialog"
                className={`${D.secondary} px-6 md:px-8 flex items-center gap-2 cursor-pointer`}
                style={{ backgroundColor: s.dangerSoft, borderColor: s.danger, color: s.danger }}
              >
                <X className="w-4 h-4" />
                {T['gateway.cancel']}
              </button>
            )}
            {/* PHASE 16.9 — confirmation before cancelling an in-flight
                payment (a destructive action on the pending booking). */}
            {gatewayPhase === 'processing' && cancelArmed && (
              <div
                data-testid="payment-gateway-cancel-confirm"
                role="alertdialog"
                aria-label={T['gateway.cancelConfirm']}
                className="flex flex-wrap items-center justify-end gap-2 max-w-full"
              >
                <span className="text-[10px] font-bold text-right" style={{ color: s.danger }}>
                  {T['gateway.cancelConfirm']}
                </span>
                <button
                  type="button"
                  data-testid="payment-gateway-cancel-keep"
                  onClick={() => setCancelArmed(false)}
                  className={`${D.secondary} px-4 flex items-center gap-1.5 cursor-pointer`}
                  style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
                >
                  {T['gateway.keepWaiting']}
                </button>
                <button
                  type="button"
                  data-testid="payment-gateway-cancel-yes"
                  onClick={cancelGateway}
                  className={`${D.secondary} px-4 flex items-center gap-1.5 cursor-pointer`}
                  style={{ backgroundColor: s.dangerSoft, borderColor: s.danger, color: s.danger }}
                >
                  <X className="w-3.5 h-3.5" />
                  {T['gateway.confirmCancel']}
                </button>
              </div>
            )}
          </>
        )}

        {step === 'result' && gatewayResult && (
          <>
            <span className="text-[10px] font-semibold" style={{ color: s.muted }}>
              {T['common.cancel']}
            </span>
            <button
              type="button"
              data-testid="payment-result-back"
              onClick={() => setStep('gateway')}
              className={`${D.secondary} px-4 flex items-center gap-1.5 cursor-pointer`}
              style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
            >
              {T['common.back']}
            </button>
          </>
        )}

        {step === 'confirm' && (
          <>
            <span className="text-[10px] font-semibold" style={{ color: s.muted }}>
              {T['confirm.subtitle']}
            </span>
            <button
              type="button"
              data-testid="payment-confirm-website"
              onClick={onBackToWebsite}
              className={`${D.primary} px-6 flex items-center gap-2 cursor-pointer`}
              style={primaryBtnStyle}
            >
              {T['confirm.backToWebsite']}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {step === 'receipt' && (
          <>
            <span className="text-[10px] font-semibold" style={{ color: s.muted }}>
              {receipt.bookingId}
            </span>
            <button
              type="button"
              data-testid="payment-receipt-close"
              onClick={() => setStep('confirm')}
              className={`${D.secondary} px-4 flex items-center gap-1.5 cursor-pointer`}
              style={{ backgroundColor: 'transparent', borderColor: s.chipLine, color: s.text }}
            >
              {T['receipt.close']}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                     */
/* ------------------------------------------------------------------ */

function PaymentOptionCard({
  D,
  s,
  T,
  locale,
  icon,
  title,
  body,
  amountLabel,
  amountCaption,
  selected,
  onSelect,
  recommended,
  testid,
}: {
  D: PaymentDesign;
  s: PaymentFlowSurface;
  T: Record<string, string>;
  locale: 'en' | 'hi';
  icon: ReactNode;
  title: string;
  body: string;
  amountLabel: string;
  amountCaption: string;
  selected: boolean;
  onSelect: () => void;
  recommended?: boolean;
  testid: string;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      data-selected={selected}
      onClick={onSelect}
      className={`${D.optionCard} text-left p-4 flex flex-col gap-2 cursor-pointer transition-all`}
      style={selected ? D.optionSelectedStyle(s) : D.optionIdleStyle(s)}
    >
      <span className="flex items-center justify-between">
        <span
          className="w-8 h-8 flex items-center justify-center"
          style={{
            backgroundColor: selected ? s.accent : s.chip,
            color: selected ? s.accentText : s.muted,
            borderRadius: 999,
            border: `1px solid ${selected ? s.accent : s.chipLine}`,
          }}
        >
          {icon}
        </span>
        {recommended && (
          <span
            data-testid={`${testid}-recommended`}
            className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5"
            style={{ backgroundColor: s.accent, color: s.accentText, borderRadius: 999 }}
          >
            {T['option.recommended']}
          </span>
        )}
        {selected && (
          <span
            className="ml-auto"
            style={{ color: s.accent }}
          >
            <CircleDot className="w-4 h-4" />
          </span>
        )}
      </span>
      <span className="text-sm font-extrabold" style={{ color: s.textStrong }}>{title}</span>
      <span className="text-[10px] font-semibold leading-relaxed" style={{ color: s.muted }}>{body}</span>
      <span
        className="mt-1 flex items-center justify-between border-t pt-2"
        style={{ borderColor: s.line }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.muted }}>{amountCaption}</span>
        <span className="text-sm font-extrabold" style={{ color: s.textStrong }}>{amountLabel}</span>
      </span>
      <span className="sr-only">{locale === 'hi' ? 'चयनित' : 'selected'}</span>
    </button>
  );
}

function FormField({
  D,
  s,
  label,
  testid,
  children,
}: {
  D: PaymentDesign;
  s: PaymentFlowSurface;
  label: string;
  testid: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={D.label} style={{ color: s.muted }}>{label}</span>
      {children}
    </label>
  );
}

function BookingSummaryCard({
  D,
  s,
  T,
  locale,
  serviceDisplay,
  service,
  serviceLines,
  data,
  dateKey,
  startMinutes,
  endMinutes,
  staffName,
  amounts,
  option,
}: {
  D: PaymentDesign;
  s: PaymentFlowSurface;
  T: Record<string, string>;
  locale: 'en' | 'hi';
  /** PHASE 16.5 — all selected services for a multi-service booking. */
  serviceLines?: PaymentServiceLine[] | null;
  serviceDisplay: { name: string; category: string };
  service: Service;
  data: SalonData;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  staffName: string | null | undefined;
  amounts: { baseAmount: number; amountDue: number; remainingAmount: number; advancePercent: number };
  option: PaymentOption;
}) {
  const date = new Date(`${dateKey}T12:00:00`);
  const dateLabelText = date.toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });
  const startLabel = formatMinutesLabel(startMinutes, locale);
  const endLabel = formatMinutesLabel(endMinutes, locale);
  const salonName = salonDisplayName(data, (data.templateId as never) || 'family_full_service');
  return (
    <div
      data-testid="payment-booking-summary"
      className={`${D.card} p-4 md:p-5 flex flex-col gap-3`}
      style={{ backgroundColor: s.well, borderColor: s.line }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className={`${D.label}`} style={{ color: s.muted }}>{T['option.summary']}</span>
        <span
          className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1"
          style={{ backgroundColor: s.accent, color: s.accentText, borderRadius: 999 }}
        >
          {paymentOptionLabel(option, locale)}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <SummaryRow
          D={D}
          s={s}
          icon={<Sparkles className="w-3.5 h-3.5" />}
          label={T['receipt.service']}
          value={serviceLines && serviceLines.length > 1
            ? fillPaymentText(T['summary.servicesCount'], { count: serviceLines.length })
            : serviceDisplay.name}
        />
        <SummaryRow D={D} s={s} icon={<Calendar className="w-3.5 h-3.5" />} label={T['receipt.date']} value={dateLabelText} />
        <SummaryRow D={D} s={s} icon={<Hourglass className="w-3.5 h-3.5" />} label={T['receipt.time']} value={`${startLabel} – ${endLabel}`} />
        <SummaryRow D={D} s={s} icon={<User className="w-3.5 h-3.5" />} label={T['receipt.staff']} value={staffName || T['confirm.anyStaff']} />
        <SummaryRow D={D} s={s} icon={<Building2 className="w-3.5 h-3.5" />} label={T['receipt.salon']} value={salonName} />
        <SummaryRow D={D} s={s} icon={<ReceiptIcon className="w-3.5 h-3.5" />} label={T['receipt.amount']} value={formatCurrency(amounts.baseAmount)} />
      </div>
      {/* PHASE 16.5 — every selected service with its own price. */}
      {serviceLines && serviceLines.length > 1 && (
        <div
          data-testid="payment-summary-services"
          className="flex flex-col gap-1.5 border-t pt-3"
          style={{ borderColor: s.line }}
        >
          {serviceLines.map((line) => (
            <div
              key={line.serviceId}
              data-testid={`payment-summary-service-${line.serviceId}`}
              className="flex items-center justify-between gap-3 text-xs font-bold"
              style={{ color: s.textStrong }}
            >
              <span className="min-w-0 truncate flex items-center gap-2">
                <span className="truncate">{line.serviceName}</span>
                <span className="text-[10px] font-semibold shrink-0" style={{ color: s.muted }}>
                  {line.durationMinutes} {locale === 'hi' ? 'मिनट' : 'min'}
                </span>
              </span>
              <span className="shrink-0">{formatCurrency(line.price)}</span>
            </div>
          ))}
        </div>
      )}
      {/* PHASE 16.5 — explicit money breakdown: total / advance now / remaining. */}
      <div
        data-testid="payment-amount-breakdown"
        className="flex flex-col gap-1.5 mt-1 border-t pt-3"
        style={{ borderColor: s.line }}
      >
        <div className="flex items-center justify-between text-sm font-extrabold" style={{ color: s.textStrong }}>
          <span className={`${D.label}`} style={{ color: s.muted }}>{T['summary.totalAmount']}</span>
          <span data-testid="payment-total-amount">{formatCurrency(amounts.baseAmount)}</span>
        </div>
        <div className="flex items-center justify-between text-xs font-bold" style={{ color: s.textStrong }}>
          <span className={`${D.label}`} style={{ color: s.muted }}>
            {option === 'advance'
              ? `${T['summary.advanceAmount']} (${fillPaymentText(T['option.advancePct'], { pct: amounts.advancePercent })})`
              : T['option.dueNow']}
          </span>
          <span data-testid="payment-due-now" style={{ color: s.accent }}>{formatCurrency(amounts.amountDue)}</span>
        </div>
        <div className="flex items-center justify-between text-xs font-bold" style={{ color: s.textStrong }}>
          <span className={`${D.label}`} style={{ color: s.muted }}>{T['summary.remainingAmount']}</span>
          <span data-testid="payment-due-at-salon">{formatCurrency(amounts.remainingAmount)}</span>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  D,
  s,
  icon,
  label,
  value,
}: {
  D: PaymentDesign;
  s: PaymentFlowSurface;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="shrink-0" style={{ color: s.accent }}>{icon}</span>
      <span className="flex flex-col min-w-0">
        <span className={D.label} style={{ color: s.muted }}>{label}</span>
        <span className="text-xs font-bold truncate" style={{ color: s.textStrong }}>{value}</span>
      </span>
    </span>
  );
}

function ConfirmationCard({
  D,
  s,
  T,
  locale,
  receipt,
  data,
  staffName,
}: {
  D: PaymentDesign;
  s: PaymentFlowSurface;
  T: Record<string, string>;
  locale: 'en' | 'hi';
  receipt: ReceiptView;
  data: SalonData;
  staffName: string | null | undefined;
}) {
  const date = new Date(`${receipt.dateKey}T12:00:00`);
  const dateLabelText = date.toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });
  const salonName = salonDisplayName(data, (data.templateId as never) || 'family_full_service');
  return (
    <div
      data-testid="payment-confirm-card"
      className={`${D.card} p-4 md:p-5 flex flex-col gap-2`}
      style={{ backgroundColor: s.card, borderColor: s.line }}
    >
      <ConfirmRow D={D} s={s} icon={<Building2 className="w-3.5 h-3.5" />} label={T['confirm.salon']} value={salonName} />
      <ConfirmRow D={D} s={s} icon={<Sparkles className="w-3.5 h-3.5" />} label={T['confirm.service']} value={receipt.serviceName} />
      <ConfirmRow D={D} s={s} icon={<Calendar className="w-3.5 h-3.5" />} label={T['confirm.date']} value={dateLabelText} />
      <ConfirmRow D={D} s={s} icon={<Hourglass className="w-3.5 h-3.5" />} label={T['confirm.time']} value={`${receipt.startLabel} – ${receipt.endLabel}`} />
      <ConfirmRow D={D} s={s} icon={<User className="w-3.5 h-3.5" />} label={T['confirm.staff']} value={staffName || T['confirm.anyStaff']} />
      <ConfirmRow D={D} s={s} icon={<ReceiptIcon className="w-3.5 h-3.5" />} label={T['confirm.amount']} value={formatCurrency(receipt.totalAmount)} />
      <ConfirmRow
        D={D}
        s={s}
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        label={T['confirm.paymentStatus']}
        value={paymentStatusLabel(receipt.paymentStatus, T)}
        valueColor={receipt.paymentStatus === 'paid' ? s.success : receipt.paymentStatus === 'pending' ? s.warning : s.muted}
      />
    </div>
  );
}

function ConfirmRow({
  D,
  s,
  icon,
  label,
  value,
  valueColor,
}: {
  D: PaymentDesign;
  s: PaymentFlowSurface;
  icon: ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0" style={{ borderColor: s.line }}>
      <span className="flex items-center gap-2 shrink-0" style={{ color: s.muted }}>
        {icon}
        <span className={D.label}>{label}</span>
      </span>
      <span
        className="text-right text-xs font-extrabold break-words"
        style={{ color: valueColor || s.textStrong }}
      >
        {value}
      </span>
    </div>
  );
}

function ReceiptCard({
  D,
  s,
  T,
  locale,
  receipt,
  data,
  staffName,
}: {
  D: PaymentDesign;
  s: PaymentFlowSurface;
  T: Record<string, string>;
  locale: 'en' | 'hi';
  receipt: ReceiptView;
  data: SalonData;
  staffName: string | null | undefined;
}) {
  const date = new Date(`${receipt.dateKey}T12:00:00`);
  const dateLabelText = date.toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });
  const salonName = salonDisplayName(data, (data.templateId as never) || 'family_full_service');
  const issuedAt = new Date(receipt.paidAt || receipt.createdAt).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'medium', timeStyle: 'short',
  });
  return (
    <div
      data-testid="payment-receipt"
      data-booking-id={receipt.bookingId}
      data-payment-status={receipt.paymentStatus}
      className={`${D.receiptCard} p-5 md:p-6 flex flex-col gap-4`}
      style={{ backgroundColor: s.receiptPaper, borderColor: s.receiptLine, color: s.receiptText }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base md:text-lg font-extrabold" style={{ color: s.receiptText }}>{T['receipt.title']}</h2>
          <p className="text-[10px] font-semibold" style={{ color: s.receiptMuted }}>{T['receipt.subtitle']}</p>
        </div>
        <div
          className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1"
          style={{
            backgroundColor: receipt.paymentStatus === 'paid' ? s.successSoft : receipt.paymentStatus === 'pending' ? s.warningSoft : s.dangerSoft,
            color: receipt.paymentStatus === 'paid' ? s.success : receipt.paymentStatus === 'pending' ? s.warning : s.danger,
            borderRadius: 999,
          }}
        >
          {paymentStatusLabel(receipt.paymentStatus, T)}
        </div>
      </div>

      <div
        className="text-center py-2"
        style={{ borderTop: `1px dashed ${s.receiptLine}`, borderBottom: `1px dashed ${s.receiptLine}` }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: s.receiptMuted }}>{T['receipt.bookingId']}</p>
        <p className="text-base md:text-lg font-extrabold mt-1" style={{ color: s.receiptText }}>{receipt.bookingId}</p>
      </div>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: s.receiptMuted }}>{T['receipt.booking']}</h3>
        <ReceiptLine s={s} label={T['receipt.salon']} value={salonName} />
        <ReceiptLine s={s} label={T['receipt.service']} value={receipt.serviceName} />
        <ReceiptLine s={s} label={T['receipt.date']} value={dateLabelText} />
        <ReceiptLine s={s} label={T['receipt.time']} value={`${receipt.startLabel} – ${receipt.endLabel} (${receipt.durationMinutes} ${T['common.minutes']})`} />
        <ReceiptLine s={s} label={T['receipt.staff']} value={staffName || T['confirm.anyStaff']} />
        <ReceiptLine s={s} label={T['receipt.customer']} value={receipt.customer.name} />
        <ReceiptLine s={s} label={T['receipt.mobile']} value={receipt.customer.mobile} />
        {receipt.customer.email && <ReceiptLine s={s} label={T['receipt.email']} value={receipt.customer.email} />}
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: s.receiptMuted }}>{T['receipt.payment']}</h3>
        <ReceiptLine s={s} label={T['receipt.option']} value={paymentOptionLabel(receipt.paymentOption, locale)} />
        <ReceiptLine s={s} label={T['receipt.method']} value={receipt.paymentLabel} />
        {receipt.maskedIdentifier && <ReceiptLine s={s} label={T['receipt.method']} value={receipt.maskedIdentifier} />}
        {receipt.gatewayRef && <ReceiptLine s={s} label={T['receipt.gatewayRef']} value={receipt.gatewayRef} />}
        <ReceiptLine s={s} label={T['receipt.subtotal']} value={formatCurrency(receipt.totalAmount)} />
        <ReceiptLine s={s} label={T['receipt.paid']} value={formatCurrency(receipt.amountPaid)} />
        {receipt.amountDueAtSalon > 0 && (
          <ReceiptLine s={s} label={T['receipt.due']} value={formatCurrency(receipt.amountDueAtSalon)} />
        )}
        <ReceiptLine s={s} label={T['receipt.status']} value={paymentStatusLabel(receipt.paymentStatus, T)} />
      </section>

      <div
        className="text-center pt-3"
        style={{ borderTop: `1px dashed ${s.receiptLine}` }}
      >
        <p className="text-[10px] font-semibold" style={{ color: s.receiptMuted }}>{T['receipt.issued']}: {issuedAt}</p>
        <p className="text-[10px] font-semibold mt-1" style={{ color: s.receiptMuted }}>{T['receipt.thanks']}</p>
      </div>
    </div>
  );
}

function ReceiptLine({
  s,
  label,
  value,
}: {
  s: PaymentFlowSurface;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.receiptMuted }}>{label}</span>
      <span className="font-extrabold text-right break-words" style={{ color: s.receiptText }}>{value}</span>
    </div>
  );
}

function paymentStatusLabel(status: string, T: Record<string, string>): string {
  switch (status) {
    case 'paid': return T['status.paid'];
    case 'unpaid': return T['status.unpaid'];
    case 'pending': return T['status.pending'];
    case 'failed': return T['status.failed'];
    case 'cancelled': return T['status.cancelled'];
    case 'refunded': return T['status.refunded'];
    case 'pay_at_salon': return T['status.payAtSalon'];
    default: return status;
  }
}

/* ------------------------------------------------------------------ */
/* Receipt text rendering (download / print)                           */
/* ------------------------------------------------------------------ */

function renderReceiptText(receipt: ReceiptView, T: Record<string, string>, locale: 'en' | 'hi', salonName: string): string {
  const lines: string[] = [];
  lines.push(T['receipt.title'].toUpperCase());
  lines.push('================================');
  lines.push(`${T['receipt.bookingId']}: ${receipt.bookingId}`);
  lines.push(`${T['receipt.status']}: ${paymentStatusLabel(receipt.paymentStatus, T)}`);
  lines.push('');
  lines.push(T['receipt.booking']);
  lines.push('--------------------------------');
  lines.push(`${T['receipt.salon']}: ${salonName}`);
  lines.push(`${T['receipt.service']}: ${receipt.serviceName}`);
  lines.push(`${T['receipt.date']}: ${receipt.dateKey}`);
  lines.push(`${T['receipt.time']}: ${receipt.startLabel} – ${receipt.endLabel} (${receipt.durationMinutes} ${T['common.minutes']})`);
  lines.push(`${T['receipt.staff']}: ${receipt.staffName || T['confirm.anyStaff']}`);
  lines.push(`${T['receipt.name']}: ${receipt.customer.name}`);
  lines.push(`${T['receipt.mobile']}: ${receipt.customer.mobile}`);
  if (receipt.customer.email) lines.push(`${T['receipt.email']}: ${receipt.customer.email}`);
  lines.push('');
  lines.push(T['receipt.payment']);
  lines.push('--------------------------------');
  lines.push(`${T['receipt.option']}: ${paymentOptionLabel(receipt.paymentOption, locale)}`);
  lines.push(`${T['receipt.method']}: ${receipt.paymentLabel}`);
  if (receipt.maskedIdentifier) lines.push(`${T['receipt.method']}: ${receipt.maskedIdentifier}`);
  if (receipt.gatewayRef) lines.push(`${T['receipt.gatewayRef']}: ${receipt.gatewayRef}`);
  lines.push(`${T['receipt.subtotal']}: ${formatCurrency(receipt.totalAmount)}`);
  lines.push(`${T['receipt.paid']}: ${formatCurrency(receipt.amountPaid)}`);
  if (receipt.amountDueAtSalon > 0) lines.push(`${T['receipt.due']}: ${formatCurrency(receipt.amountDueAtSalon)}`);
  lines.push('');
  lines.push(`${T['receipt.issued']}: ${new Date(receipt.paidAt || receipt.createdAt).toISOString()}`);
  lines.push(T['receipt.thanks']);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function minutesToDate(dateKey: string, label: string): Date {
  // Parse "10:30 AM" / "10:30 PM" / "10:30 शाम" etc.
  const match = label.match(/(\d{1,2}):(\d{2})/);
  let hour = 10;
  let minute = 0;
  if (match) {
    hour = Number(match[1]);
    minute = Number(match[2]);
  }
  const isPm = /pm|शाम/i.test(label);
  if (isPm && hour < 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

function buildWhatsAppMessage(receipt: ReceiptView, T: Record<string, string>, locale: 'en' | 'hi', salonName: string): string {
  const lines: string[] = [];
  if (locale === 'hi') {
    lines.push(`🗓️ ${salonName} — बुकिंग पक्की`);
    lines.push('');
    lines.push(`${T['confirm.bookingId']}: ${receipt.bookingId}`);
    lines.push(`${T['receipt.service']}: ${receipt.serviceName}`);
    lines.push(`${T['receipt.date']}: ${receipt.dateKey}`);
    lines.push(`${T['receipt.time']}: ${receipt.startLabel} – ${receipt.endLabel}`);
    lines.push(`${T['receipt.staff']}: ${receipt.staffName || T['confirm.anyStaff']}`);
    lines.push(`${T['receipt.amount']}: ${formatCurrency(receipt.totalAmount)}`);
    lines.push(`${T['confirm.paymentStatus']}: ${paymentStatusLabel(receipt.paymentStatus, T)}`);
  } else {
    lines.push(`🗓️ ${salonName} — Booking confirmed`);
    lines.push('');
    lines.push(`${T['confirm.bookingId']}: ${receipt.bookingId}`);
    lines.push(`${T['receipt.service']}: ${receipt.serviceName}`);
    lines.push(`${T['receipt.date']}: ${receipt.dateKey}`);
    lines.push(`${T['receipt.time']}: ${receipt.startLabel} – ${receipt.endLabel}`);
    lines.push(`${T['receipt.staff']}: ${receipt.staffName || T['confirm.anyStaff']}`);
    lines.push(`${T['receipt.amount']}: ${formatCurrency(receipt.totalAmount)}`);
    lines.push(`${T['confirm.paymentStatus']}: ${paymentStatusLabel(receipt.paymentStatus, T)}`);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Helper: read all records for a tenant (test + runtime)             */
/* ------------------------------------------------------------------ */

function readAllFor(businessId: string, themeId: string): PaymentRecord[] {
  const store = (typeof window === 'undefined')
    ? { version: 1, records: [] as PaymentRecord[] }
    : ((): { version: number; records: PaymentRecord[] } => {
        try {
          const raw = window.localStorage.getItem('nexora_site_payment_records');
          if (!raw) return { version: 1, records: [] };
          const parsed = JSON.parse(raw);
          if (!parsed || !Array.isArray(parsed.records)) return { version: 1, records: [] };
          return parsed;
        } catch {
          return { version: 1, records: [] };
        }
      })();
  return store.records.filter((r) => r.businessId === businessId && r.themeId === themeId);
}
