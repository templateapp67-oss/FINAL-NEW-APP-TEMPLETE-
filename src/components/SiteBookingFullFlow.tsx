import { useCallback, useEffect, useRef, useState } from 'react';
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
import { findPaymentRecord, readPaymentRecordsForBusiness } from '../lib/siteBookingPayment';
import type { BookingNoticeInput } from '../lib/siteBookingNotices';
import { newBookingNoticeId, normalizeNotice } from '../lib/siteBookingNotices';
import { bookingConfirmationText } from '../lib/siteBookingConfirmationI18n';
import { bookingFlowText } from '../lib/siteBookingI18n';
import { bookingSurfaces } from '../lib/siteBookingTheme';

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
  const existingConfirmed = readPaymentRecordsForBusiness(businessId, themeId).find(
    (r) => r.bookingStatus === 'confirmed' || r.bookingStatus === 'pay_at_salon',
  ) || null;
  // Only use the auto-resumed record when the user hasn't already
  // chosen a different path in this session.
  const shouldAutoResume = existingConfirmed && !summary;
  const initialRecord = shouldAutoResume
    ? existingConfirmed
    : (phase === 'payment' && summary
        ? readPaymentRecordsForBusiness(businessId, themeId).find(
            (r) => r.serviceId === summary.serviceId && r.dateKey === summary.dateKey && r.startMinutes === summary.startMinutes
              && (r.bookingStatus === 'confirmed' || r.bookingStatus === 'pay_at_salon'),
          ) || null
        : null);

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
      className="absolute inset-0 z-[70] flex flex-col overflow-hidden"
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
      )}
      {/* PHASE 16.9 — the notice presenter for the whole journey. */}
      <SiteBookingNotices themeId={themeId} notices={notices} onDismiss={dismissNotice} />
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
