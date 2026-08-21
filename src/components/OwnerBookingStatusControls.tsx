/**
 * PHASE 17.4 — owner booking-status controls.
 *
 * This component is intentionally only a UI adapter. Every mutation is sent
 * through `ownerUpdateBookingStatus`, which re-checks the actor, tenant keys,
 * current persisted row, payment prerequisite and transition. Hiding a button
 * here is never treated as authorization.
 */
import { useMemo, useState } from 'react';
import { Check, CheckCircle2, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import {
  ownerAllowedTransitionsForRecord,
  ownerUpdateBookingStatus,
} from '../lib/bookingManagement';
import type { BookingActorContext, BookingUpdateFailure } from '../lib/bookingManagement';
import type { TodayAppointment } from '../lib/ownerTodayAppointments';
import type { BookingStatus } from '../lib/siteBookingPayment';
import type { AppointmentPalette } from './OwnerAppointmentRow';

interface Props {
  actor: BookingActorContext;
  row: TodayAppointment;
  palette: AppointmentPalette;
  t: (key: string) => string;
  testIdPrefix: string;
}

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function failureMessage(reason: BookingUpdateFailure | undefined, t: (key: string) => string): string {
  if (reason === 'advance-payment-required') return t('status.error.paymentRequired');
  if (reason === 'not-authenticated') return t('status.error.login');
  if (
    reason === 'no-ownership'
    || reason === 'ambiguous'
    || reason === 'permission-denied'
  ) return t('status.error.permission');
  if (reason === 'not-found') return t('status.error.notFound');
  if (reason === 'duplicate-update') return t('status.error.duplicate');
  return t('status.error.invalid');
}

export default function OwnerBookingStatusControls({ actor, row, palette, t, testIdPrefix }: Props) {
  const [busy, setBusy] = useState<BookingStatus | null>(null);
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const transitions = useMemo(
    () => ownerAllowedTransitionsForRecord({
      bookingStatus: row.status,
      paymentStatus: row.paymentStatus,
      paymentOption: row.paymentOption,
    }),
    [row.status, row.paymentStatus, row.paymentOption],
  );

  if (transitions.length === 0 && !feedback) return null;

  const update = async (nextStatus: BookingStatus) => {
    if (busy) return;
    setBusy(nextStatus);
    setFeedback(null);

    // Yield once so assistive technology and the browser can paint the loading
    // state before the synchronous local-store adapter completes. A database
    // adapter can replace this call without changing this UI contract.
    await Promise.resolve();
    const result = ownerUpdateBookingStatus(
      actor,
      row.businessId,
      row.themeId,
      row.bookingId,
      nextStatus,
    );

    setBusy(null);
    setConfirmCancellation(false);
    setFeedback(result.ok
      ? {
          kind: 'success',
          message: nextStatus === 'cancelled'
            ? t('status.success.cancelled')
            : nextStatus === 'completed'
              ? t('status.success.completed')
              : t('status.success.confirmed'),
        }
      : { kind: 'error', message: failureMessage(result.reason, t) });
  };

  const buttonStyle = (primary = false) => ({
    backgroundColor: primary ? palette.accent : palette.panelSoft,
    borderColor: primary ? palette.accent : palette.line,
    color: primary ? palette.accentText : palette.text,
  });

  return (
    <div
      data-testid={`${testIdPrefix}-status-controls-${row.bookingId}`}
      className="space-y-2 border-t pt-3"
      style={{ borderColor: palette.line }}
    >
      {confirmCancellation ? (
        <div
          data-testid={`${testIdPrefix}-cancel-confirmation-${row.bookingId}`}
          role="alertdialog"
          aria-label={t('status.cancelConfirm')}
          className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }}
        >
          <p className="text-xs font-bold" style={{ color: palette.text }}>
            {t('status.cancelConfirm')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirmCancellation(false)}
              className="rounded-lg border px-3 py-2 text-[11px] font-extrabold disabled:opacity-50"
              style={buttonStyle(false)}
            >
              {t('status.keep')}
            </button>
            <button
              type="button"
              data-testid={`${testIdPrefix}-cancel-confirm-${row.bookingId}`}
              disabled={busy !== null}
              onClick={() => void update('cancelled')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50"
            >
              {busy === 'cancelled' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              {busy === 'cancelled' ? t('status.updating') : t('status.cancelConfirmAction')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="me-auto text-[10px] font-bold uppercase tracking-wider" style={{ color: palette.muted }}>
            {t('status.manage')}
          </span>
          {transitions.includes('confirmed') && (
            <button
              type="button"
              data-testid={`${testIdPrefix}-confirm-${row.bookingId}`}
              disabled={busy !== null}
              onClick={() => void update('confirmed')}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
              style={buttonStyle(true)}
            >
              {busy === 'confirmed' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {busy === 'confirmed' ? t('status.updating') : t('status.confirm')}
            </button>
          )}
          {transitions.includes('completed') && (
            <button
              type="button"
              data-testid={`${testIdPrefix}-complete-${row.bookingId}`}
              disabled={busy !== null}
              onClick={() => void update('completed')}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
              style={buttonStyle(true)}
            >
              {busy === 'completed' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {busy === 'completed' ? t('status.updating') : t('status.complete')}
            </button>
          )}
          {transitions.includes('cancelled') && (
            <button
              type="button"
              data-testid={`${testIdPrefix}-cancel-${row.bookingId}`}
              disabled={busy !== null}
              onClick={() => {
                setFeedback(null);
                setConfirmCancellation(true);
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
              style={buttonStyle(false)}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t('status.cancel')}
            </button>
          )}
        </div>
      )}

      {feedback && (
        <p
          data-testid={`${testIdPrefix}-status-feedback-${row.bookingId}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className="flex items-center gap-1.5 text-[11px] font-bold"
          style={{ color: feedback.kind === 'error' ? '#dc2626' : '#0f9b6c' }}
        >
          {feedback.kind === 'error'
            ? <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
          {feedback.message}
        </p>
      )}
    </div>
  );
}
