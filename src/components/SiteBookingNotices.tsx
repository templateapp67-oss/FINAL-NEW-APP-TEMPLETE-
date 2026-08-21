/**
 * PHASE 16.9 — BOOKING NOTIFICATIONS & UX · notice presenter.
 *
 * Renders the typed notices produced on the EXISTING `onShowToast` seam
 * inside the booking host (`SiteBookingFullFlow` wires the seam to this
 * presenter — the pre-16.9 host dropped those messages on the floor).
 *
 *   - One `role="status"` item per notice inside a polite live region,
 *     so arrivals are announced to screen readers without stealing focus.
 *   - Four kinds (success / warning / error / info) colour-coded from the
 *     EXISTING payment surfaces, so Light/Dark and all five themes work
 *     with no new palette.
 *   - Auto-dismiss (paused on hover/focus), a labelled dismiss button and
 *     a soft entrance animation that is disabled under
 *     `prefers-reduced-motion`.
 *   - Mobile-first: full-width strip above the action bar on phones,
 *     right-aligned column on `sm:` screens and up.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { paymentSurfaces } from '../lib/siteBookingPaymentTheme';
import type { PaymentFlowSurface } from '../lib/siteBookingPaymentTheme';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { bookingNoticesText } from '../lib/siteBookingNoticesI18n';
import { bookingNoticeDurationMs } from '../lib/siteBookingNotices';
import type { BookingNotice, BookingNoticeKind } from '../lib/siteBookingNotices';

export interface ActiveBookingNotice extends BookingNotice {
  id: string;
}

const KIND_ICONS: Record<BookingNoticeKind, ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />,
  error: <XCircle className="w-4 h-4 shrink-0" aria-hidden />,
  info: <Info className="w-4 h-4 shrink-0" aria-hidden />,
};

export default function SiteBookingNotices({
  themeId,
  notices,
  onDismiss,
}: {
  themeId: SiteHeaderThemeId;
  notices: ActiveBookingNotice[];
  onDismiss: (id: string) => void;
}) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const s = paymentSurfaces(themeId, appearance);
  const T = bookingNoticesText(locale);

  if (notices.length === 0) return null;

  return (
    <div
      data-testid="booking-notices"
      data-theme={themeId}
      data-appearance={appearance}
      data-locale={locale}
      aria-live="polite"
      className="absolute inset-x-3 bottom-[76px] z-[90] flex flex-col items-stretch sm:items-end gap-2 pointer-events-none"
    >
      {notices.map((notice) => (
        <React.Fragment key={notice.id}>
          <BookingNoticeItem
            notice={notice}
            s={s}
            dismissLabel={T['notice.dismiss']}
            onDismiss={onDismiss}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One notice (owns its auto-dismiss timer + pause on hover/focus)     */
/* ------------------------------------------------------------------ */

function BookingNoticeItem({
  notice,
  s,
  dismissLabel,
  onDismiss,
}: {
  notice: ActiveBookingNotice;
  s: PaymentFlowSurface;
  dismissLabel: string;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setTimeout(() => onDismiss(notice.id), bookingNoticeDurationMs());
    return () => window.clearTimeout(timer);
  }, [paused, notice.id, onDismiss]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);
  const dismiss = useCallback(() => onDismiss(notice.id), [notice.id, onDismiss]);

  const { fg, bg, border } = kindColors(notice.kind, s);

  return (
    <div
      data-testid="booking-notice"
      data-kind={notice.kind}
      role="status"
      className="site-booking-notice site-booking-notice-anim pointer-events-auto w-full sm:w-80 flex items-start gap-2.5 border rounded-xl p-3 shadow-lg"
      style={{ backgroundColor: bg, borderColor: border, color: s.text }}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span className="mt-0.5" style={{ color: fg }}>
        {KIND_ICONS[notice.kind]}
      </span>
      <p
        data-testid="booking-notice-message"
        className="flex-1 min-w-0 text-[11px] font-semibold leading-relaxed break-words"
        style={{ color: s.textStrong }}
      >
        {notice.message}
      </p>
      <button
        type="button"
        data-testid="booking-notice-dismiss"
        aria-label={dismissLabel}
        onClick={dismiss}
        className="site-touch -m-1.5 p-1.5 rounded-md shrink-0 hover:opacity-70 transition-opacity"
        style={{ color: s.muted }}
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kind → colour (uses the EXISTING surface tokens only)               */
/* ------------------------------------------------------------------ */

export function noticeKindColors(
  kind: BookingNoticeKind,
  s: PaymentFlowSurface,
): { fg: string; bg: string; border: string } {
  return kindColors(kind, s);
}

function kindColors(
  kind: BookingNoticeKind,
  s: PaymentFlowSurface,
): { fg: string; bg: string; border: string } {
  switch (kind) {
    case 'success':
      return { fg: s.success, bg: s.successSoft, border: s.success };
    case 'warning':
      return { fg: s.warning, bg: s.warningSoft, border: s.warning };
    case 'error':
      return { fg: s.danger, bg: s.dangerSoft, border: s.danger };
    default:
      return { fg: s.accent, bg: s.accentSoft, border: s.accentLine };
  }
}
