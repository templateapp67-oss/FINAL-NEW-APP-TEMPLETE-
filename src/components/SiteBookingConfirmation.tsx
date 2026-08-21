/**
 * PHASE 16.6 — BOOKING CONFIRMATION · shared confirmation / summary panel.
 *
 * ONE panel renders the confirmation everywhere it is needed:
 *   - inside the existing payment flow's confirmation step (variant
 *     `flow`), right after the Phase 10.7/16.5 engine resolved the
 *     booking, and
 *   - from the customer's booking history (variant `history`, mounted by
 *     `SiteMyBookings`), so a customer can re-open the same summary /
 *     receipt at any time.
 *
 * Everything shown here is READ from the EXISTING booking record through
 * `siteBookingConfirmation.ts` — salon, services, date, time, duration,
 * total, advance paid, remaining, payment status and the booking
 * reference produced by the existing engine. Nothing is invented, and the
 * panel NEVER claims "Confirmed" unless the derived state says the
 * required payment actually succeeded.
 *
 * Theming: the panel uses the existing per-theme payment surfaces (which
 * extend the 10.6 booking surfaces), so it inherits each theme's identity
 * plus light/dark automatically. Copy is EN/HI through the 16.6 table.
 * Layout is mobile-first and stacks to two columns from `sm` upward, so
 * it works on desktop, tablet and mobile.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CalendarX,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Hash,
  Hourglass,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Wallet,
} from 'lucide-react';
import type { SalonData } from '../types';
import { formatCurrency } from '../lib/pricing';
import { salonDisplayName } from '../lib/siteBooking';
import { bookingSurfaces } from '../lib/siteBookingTheme';
import { paymentSurfaces } from '../lib/siteBookingPaymentTheme';
import type { PaymentFlowSurface } from '../lib/siteBookingPaymentTheme';
import { formatMinutesLabel } from '../lib/siteBookingPayment';
import {
  bookingConfirmationReceiptText,
  isConfirmedState,
} from '../lib/siteBookingConfirmation';
import type {
  BookingConfirmationState,
  BookingConfirmationView,
} from '../lib/siteBookingConfirmation';
import { bookingConfirmationText } from '../lib/siteBookingConfirmationI18n';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  view: BookingConfirmationView;
  /** `flow` sits under the payment flow's own status banner. */
  variant?: 'flow' | 'history';
  /** The payment flow keeps its own banner + reference chip + receipt step. */
  showStatusBanner?: boolean;
  showReference?: boolean;
  showReceiptToggle?: boolean;
  showActions?: boolean;
  /** Test id of the details card (the flow keeps its 10.7 id). */
  detailsTestId?: string;
  /** Offered only for the non-confirmed states that can still be paid. */
  onRetryPayment?: () => void;
  onShowToast?: (msg: string) => void;
}

/* ------------------------------------------------------------------ */
/* State → colour mapping (uses the existing theme tokens only)        */
/* ------------------------------------------------------------------ */

export function confirmationStateColors(
  state: BookingConfirmationState,
  s: PaymentFlowSurface,
): { fg: string; bg: string; border: string } {
  switch (state) {
    case 'confirmed':
    case 'completed':
      return { fg: s.success, bg: s.successSoft, border: s.success };
    case 'payment_pending':
      return { fg: s.warning, bg: s.warningSoft, border: s.warning };
    case 'payment_failed':
      return { fg: s.danger, bg: s.dangerSoft, border: s.danger };
    default:
      return { fg: s.muted, bg: s.chip, border: s.chipLine };
  }
}

function stateIcon(state: BookingConfirmationState, color: string): ReactNode {
  if (state === 'confirmed' || state === 'completed') {
    return <CheckCircle2 className="w-8 h-8" style={{ color }} />;
  }
  if (state === 'payment_pending') return <Hourglass className="w-8 h-8" style={{ color }} />;
  if (state === 'payment_failed') return <AlertTriangle className="w-8 h-8" style={{ color }} />;
  return <CalendarX className="w-8 h-8" style={{ color }} />;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export default function SiteBookingConfirmation({
  themeId,
  data,
  view,
  variant = 'history',
  showStatusBanner = true,
  showReference = true,
  showReceiptToggle = true,
  showActions = true,
  detailsTestId = 'booking-confirmation-details',
  onRetryPayment,
  onShowToast,
}: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const T = bookingConfirmationText(locale);
  const s = paymentSurfaces(themeId, appearance);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const colors = confirmationStateColors(view.state, s);
  const confirmed = isConfirmedState(view.state);
  const salonName = salonDisplayName(data, themeId);

  const dateLabel = useMemo(
    () => new Date(`${view.dateKey}T12:00:00`).toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    }),
    [view.dateKey, locale],
  );
  const timeLabel = `${formatMinutesLabel(view.startMinutes, locale)} – ${formatMinutesLabel(view.endMinutes, locale)}`;

  const receiptText = useMemo(
    () => bookingConfirmationReceiptText(view, T, locale, salonName),
    [view, T, locale, salonName],
  );

  const copyReference = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(view.reference).then(
        () => onShowToast?.(view.reference),
        () => onShowToast?.(view.reference),
      );
      return;
    }
    onShowToast?.(view.reference);
  };

  const downloadSummary = () => {
    try {
      const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexora-booking-${view.reference}.txt`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
    } catch {
      onShowToast?.(T['action.download']);
    }
  };

  return (
    <div
      data-testid="booking-confirmation"
      data-variant={variant}
      data-state={view.state}
      data-confirmed={confirmed}
      data-reference={view.reference}
      data-theme={themeId}
      data-appearance={appearance}
      data-locale={locale}
      className="flex flex-col gap-3 w-full"
    >
      {showStatusBanner && (
        <div
          data-testid="booking-confirmation-banner"
          className="flex flex-col items-center text-center gap-2 p-4 md:p-5 border rounded-xl"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          {stateIcon(view.state, colors.fg)}
          <h2 className="text-base md:text-lg font-extrabold" style={{ color: s.textStrong }}>
            {T[`state.${view.state}.headline` as keyof typeof T]}
          </h2>
          <p className="text-[11px] font-semibold max-w-md" style={{ color: s.muted }}>
            {T[`state.${view.state}.body` as keyof typeof T]}
          </p>
          <span
            data-testid="booking-confirmation-state"
            data-state={view.state}
            className="text-[9px] font-extrabold uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
            style={{ backgroundColor: colors.fg, color: '#ffffff' }}
          >
            {T[`state.${view.state}` as keyof typeof T]}
          </span>
          {!confirmed && view.advanceRequired && (
            <p
              data-testid="booking-confirmation-pending-warning"
              className="text-[10px] font-extrabold"
              style={{ color: colors.fg }}
            >
              {T['state.pendingWarning']}
            </p>
          )}
          {confirmed && view.payAtSalon && (
            <p className="text-[10px] font-semibold" style={{ color: s.muted }}>
              {T['state.paidAtSalonNote']}
            </p>
          )}
        </div>
      )}

      {/* ---- reference ---- */}
      {showReference && (
      <div
        data-testid="booking-confirmation-reference"
        data-reference={view.reference}
        className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border rounded-xl"
        style={{ backgroundColor: s.well, borderColor: s.chipLine }}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: s.muted }}>
          <Hash className="w-3 h-3" style={{ color: s.accent }} />
          {T['field.reference']}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-extrabold" style={{ color: s.accent }}>{view.reference}</span>
          <button
            type="button"
            data-testid="booking-confirmation-copy-reference"
            onClick={copyReference}
            className="text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer"
            style={{ color: s.muted }}
          >
            <Copy className="w-3 h-3" />
          </button>
        </span>
      </div>
      )}

      {/* ---- details ---- */}
      <div
        data-testid={detailsTestId}
        className="p-3 md:p-4 border rounded-xl flex flex-col"
        style={{ backgroundColor: s.card, borderColor: s.line }}
      >
        <DetailRow
          s={s}
          testid="booking-confirmation-salon"
          icon={<Building2 className="w-3.5 h-3.5" />}
          label={T['field.salon']}
          value={salonName}
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-services"
          icon={<Sparkles className="w-3.5 h-3.5" />}
          label={T['field.services']}
          value={view.serviceNames.join(' + ')}
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-date"
          icon={<Calendar className="w-3.5 h-3.5" />}
          label={T['field.date']}
          value={dateLabel}
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-time"
          icon={<Clock className="w-3.5 h-3.5" />}
          label={T['field.time']}
          value={timeLabel}
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-staff"
          icon={<Sparkles className="w-3.5 h-3.5" />}
          label={T['field.staff']}
          value={view.staffName || T['field.anyStaff']}
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-duration"
          icon={<Hourglass className="w-3.5 h-3.5" />}
          label={T['field.duration']}
          value={`${view.durationMinutes} ${T['common.minutes']}`}
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-total"
          icon={<ReceiptText className="w-3.5 h-3.5" />}
          label={T['field.total']}
          value={formatCurrency(view.totalAmount)}
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-advance"
          icon={<Wallet className="w-3.5 h-3.5" />}
          label={T['field.advancePaid']}
          value={formatCurrency(view.advancePaid)}
          valueColor={view.advancePaid > 0 ? s.success : undefined}
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-remaining"
          icon={<Wallet className="w-3.5 h-3.5" />}
          label={T['field.remaining']}
          value={formatCurrency(view.remainingAmount)}
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-payment-status"
          icon={<ReceiptText className="w-3.5 h-3.5" />}
          label={T['field.paymentStatus']}
          value={T[`payment.${view.paymentStatus}` as keyof typeof T] || view.paymentStatus}
          valueColor={
            view.paymentStatus === 'paid'
              ? s.success
              : view.paymentStatus === 'pending'
                ? s.warning
                : view.paymentStatus === 'failed' || view.paymentStatus === 'cancelled'
                  ? s.danger
                  : undefined
          }
        />
        <DetailRow
          s={s}
          testid="booking-confirmation-status"
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          label={T['field.status']}
          value={T[`state.${view.state}` as keyof typeof T]}
          valueColor={colors.fg}
        />
        {view.gatewayRef && (
          <DetailRow
            s={s}
            testid="booking-confirmation-gateway-ref"
            icon={<Hash className="w-3.5 h-3.5" />}
            label={T['field.gatewayRef']}
            value={view.gatewayRef}
          />
        )}
      </div>

      {view.failureReason && !confirmed && (
        <p
          data-testid="booking-confirmation-failure-reason"
          className="text-[10px] font-semibold px-3 py-2 border rounded-xl"
          style={{ backgroundColor: s.dangerSoft, borderColor: s.danger, color: s.danger }}
        >
          {T['field.failureReason']}: {view.failureReason}
        </p>
      )}

      {/* ---- actions ---- */}
      {showActions && (
      <div className="flex flex-wrap items-center gap-2">
        {showReceiptToggle && (
          <button
            type="button"
            data-testid="booking-confirmation-toggle-receipt"
            aria-expanded={receiptOpen}
            onClick={() => setReceiptOpen((open) => !open)}
            className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border rounded-lg cursor-pointer inline-flex items-center gap-1.5"
            style={{ borderColor: s.accent, color: s.accent, backgroundColor: 'transparent' }}
          >
            <ReceiptText className="w-3 h-3" />
            {receiptOpen ? T['action.hideReceipt'] : T['action.viewReceipt']}
          </button>
        )}
        <button
          type="button"
          data-testid="booking-confirmation-download"
          onClick={downloadSummary}
          className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border rounded-lg cursor-pointer inline-flex items-center gap-1.5"
          style={{ borderColor: s.chipLine, color: s.text, backgroundColor: 'transparent' }}
        >
          <Download className="w-3 h-3" />
          {T['action.download']}
        </button>
        {onRetryPayment && !confirmed && view.state !== 'cancelled' && (
          <button
            type="button"
            data-testid="booking-confirmation-retry-payment"
            onClick={onRetryPayment}
            className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border rounded-lg cursor-pointer inline-flex items-center gap-1.5"
            style={{ borderColor: s.accent, color: s.accentText, backgroundColor: s.accent }}
          >
            <RefreshCw className="w-3 h-3" />
            {T['action.retryPayment']}
          </button>
        )}
      </div>
      )}

      {showActions && showReceiptToggle && receiptOpen && (
        <pre
          data-testid="booking-confirmation-receipt"
          className="text-[10px] leading-relaxed whitespace-pre-wrap p-3 border rounded-xl overflow-x-auto"
          style={{ backgroundColor: s.receiptPaper, borderColor: s.receiptLine, color: s.receiptText }}
        >
          {receiptText}
        </pre>
      )}
    </div>
  );
}

function DetailRow({
  s,
  icon,
  label,
  value,
  valueColor,
  testid,
}: {
  s: PaymentFlowSurface;
  icon: ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  testid: string;
}) {
  return (
    <div
      data-testid={testid}
      className="flex items-start justify-between gap-3 py-1.5 border-b last:border-b-0"
      style={{ borderColor: s.line }}
    >
      <span className="flex items-center gap-2 shrink-0" style={{ color: s.muted }}>
        <span style={{ color: s.accent }}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </span>
      <span
        className="text-right text-xs font-extrabold break-words min-w-0"
        style={{ color: valueColor || s.textStrong }}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared states (loading / error / not-found) for confirmation hosts  */
/* ------------------------------------------------------------------ */

export function BookingConfirmationStateCard({
  themeId,
  state,
  onRetry,
}: {
  themeId: SiteHeaderThemeId;
  state: 'loading' | 'error' | 'not-found';
  onRetry?: () => void;
}) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const T = bookingConfirmationText(locale);
  const s = bookingSurfaces(themeId, appearance);

  if (state === 'loading') {
    return (
      <div
        data-testid="booking-confirmation-loading"
        aria-busy="true"
        className="flex flex-col gap-2 p-3 border rounded-xl"
        style={{ backgroundColor: s.card, borderColor: s.line }}
      >
        <div className="h-14 rounded-lg animate-pulse" style={{ backgroundColor: s.well }} />
        <div className="h-24 rounded-lg animate-pulse" style={{ backgroundColor: s.well }} />
        <p className="text-xs font-semibold" style={{ color: s.muted }}>{T['screen.loading']}</p>
      </div>
    );
  }

  return (
    <div
      data-testid={state === 'error' ? 'booking-confirmation-error' : 'booking-confirmation-not-found'}
      className="flex flex-col items-start gap-2 p-3 border rounded-xl"
      style={{ backgroundColor: s.card, borderColor: s.line }}
    >
      <p className="text-xs font-semibold" style={{ color: s.danger }}>
        {state === 'error' ? T['screen.error'] : T['screen.notFound']}
      </p>
      {state === 'error' && onRetry && (
        <button
          type="button"
          data-testid="booking-confirmation-retry"
          onClick={onRetry}
          className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border rounded-lg cursor-pointer inline-flex items-center gap-1.5"
          style={{ borderColor: s.chipLine, color: s.text, backgroundColor: 'transparent' }}
        >
          <RefreshCw className="w-3 h-3" />
          {T['screen.retry']}
        </button>
      )}
    </div>
  );
}
