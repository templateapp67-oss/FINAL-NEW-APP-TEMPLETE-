/**
 * PHASE 17.2 — TODAY'S APPOINTMENTS section of the Owner Dashboard.
 *
 * Renders the OWNER's OWN salon's REAL bookings for today, read through
 * `ownerTodayAppointments.ts` (which re-checks the actor's permission and
 * does a tenant-keyed read over the EXISTING 10.7/16.5 booking records).
 *
 * The salon identity is NOT a prop this component can be tricked with: the
 * host (`OwnerDashboard`) passes the session-resolved actor + tenant keys
 * that came from the existing organization_members → salons chain, and the
 * data layer re-validates them. There is no salon picker or id input.
 *
 * Nothing is invented: every value on screen is read from a persisted record.
 * When there are no bookings for today the empty state renders — a fake row
 * is never synthesised.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Clock,
  CreditCard,
  Inbox,
  Loader2,
  Phone,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import {
  countByStatusGroup,
  readTodayAppointments,
  TODAY_STATUS_GROUPS,
} from '../lib/ownerTodayAppointments';
import OwnerAppointmentRow, { statusChipStyle } from './OwnerAppointmentRow';
import type { AppointmentPalette } from './OwnerAppointmentRow';
import type { TodayAppointment, TodayStatusGroup } from '../lib/ownerTodayAppointments';
import { bookingManageDeniedKey } from '../lib/bookingManagement';
import type { BookingActorContext } from '../lib/bookingManagement';
import { PAYMENT_EVENT } from '../lib/siteBookingPayment';
import { SALON_CLOCK_EVENT } from '../lib/salonStatus';
import { ownerDashboardTranslator } from '../lib/ownerDashboardI18n';
import { bookingManagementText } from '../lib/bookingManagementI18n';
import { useSiteLocale } from './SiteHeader';
import type { AppLocale } from '../lib/locale';
import type { OwnerDashboardFilterState } from '../lib/ownerDashboardFilters';
import { ownerFiltersActive } from '../lib/ownerDashboardFilters';

/** The dashboard palette — shared with the appointment row component. */
export type TodayPalette = AppointmentPalette;

interface Props {
  /** Session-resolved actor — the host ran the auth/ownership chain. */
  actor: BookingActorContext;
  /** Tenant keys of the OWNER's own salon (session-resolved, never typed). */
  businessIds: readonly string[];
  themeIds: readonly string[];
  palette: TodayPalette;
  /** Test seam so the suite can exercise loading/error without mocking IO. */
  forcedState?: 'loading' | 'error' | 'ready';
  filters?: OwnerDashboardFilterState;
}

export default function OwnerTodayAppointments({
  actor,
  businessIds,
  themeIds,
  palette,
  forcedState,
  filters,
}: Props) {
  const locale: AppLocale = useSiteLocale();
  const t = useMemo(() => ownerDashboardTranslator(locale), [locale]);
  const bookingCopy = useMemo(() => bookingManagementText(locale), [locale]);

  // Re-read whenever a booking changes or the salon clock moves past midnight
  // — the EXISTING events, no polling and no second store.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(PAYMENT_EVENT, bump);
    window.addEventListener(SALON_CLOCK_EVENT, bump);
    return () => {
      window.removeEventListener(PAYMENT_EVENT, bump);
      window.removeEventListener(SALON_CLOCK_EVENT, bump);
    };
  }, []);

  const [retry, setRetry] = useState(0);

  const businessKey = businessIds.join('|');
  const themeKey = themeIds.join('|');
  const result = useMemo(
    () => readTodayAppointments(actor, businessIds, themeIds, undefined, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actor, businessKey, themeKey, version, retry, filters],
  );

  const state = forcedState ?? 'ready';

  /* ---- unauthorized: the data layer refused ---- */
  if (!result.ok) {
    const key = bookingManageDeniedKey(result.reason);
    const message = key
      ? bookingCopy[key as keyof typeof bookingCopy]
      : bookingCopy['manage.denied.error'];
    return (
      <div
        data-testid="today-appointments-denied"
        role="alert"
        className="flex items-start gap-3 rounded-2xl border p-5"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" style={{ color: palette.accent }} />
        <p className="text-xs font-bold" style={{ color: palette.muted }}>
          {message}
        </p>
      </div>
    );
  }

  const appointments = result.appointments;
  const counts = countByStatusGroup(appointments);

  const dateLabel = new Date(`${result.dateKey}T12:00:00`).toLocaleDateString(
    locale === 'hi' ? 'hi-IN' : 'en-IN',
    { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' },
  );

  /* ---- loading ---- */
  if (state === 'loading') {
    return (
      <div data-testid="today-appointments-loading" aria-busy="true" role="status" className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: palette.muted }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: palette.accent }} />
          {t('today.loading')}
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border"
            style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }}
          />
        ))}
      </div>
    );
  }

  /* ---- error ---- */
  if (state === 'error') {
    return (
      <div
        data-testid="today-appointments-error"
        className="space-y-3 rounded-2xl border p-5"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <div className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <AlertCircle className="h-4 w-4" style={{ color: palette.accent }} />
          {t('today.error.title')}
        </div>
        <p className="text-xs font-semibold" style={{ color: palette.muted }}>
          {t('today.error.body')}
        </p>
        <button
          type="button"
          data-testid="today-appointments-retry"
          onClick={() => setRetry((v) => v + 1)}
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold"
          style={{ backgroundColor: palette.accent, color: palette.accentText }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('state.retry')}
        </button>
      </div>
    );
  }

  const header = (
    <div
      data-testid="today-appointments-header"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <CalendarClock className="h-4 w-4" style={{ color: palette.accent }} />
          {t('today.heading')}
        </h3>
        <p className="mt-0.5 text-[11px] font-bold" style={{ color: palette.muted }}>
          {t('today.dateLabel')}: <span data-testid="today-appointments-date">{dateLabel}</span>
        </p>
      </div>
      {appointments.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="today-appointments-counts">
          <span
            data-testid="today-count-total"
            className="rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
            style={{ backgroundColor: palette.accentSoft, color: palette.accent }}
          >
            {t('today.count.total')}: {counts.total}
          </span>
          {TODAY_STATUS_GROUPS.filter((group) => counts[group] > 0).map((group) => (
            <span
              key={group}
              data-testid={`today-count-${group}`}
              className="rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
              style={statusChipStyle(group, palette)}
            >
              {t(`today.count.${group}`)}: {counts[group]}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  /* ---- empty ---- */
  if (appointments.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <div
          data-testid={filters && ownerFiltersActive(filters) ? 'today-appointments-no-results' : 'today-appointments-empty'}
          className="space-y-2 rounded-2xl border p-8 text-center"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <Inbox className="mx-auto h-6 w-6" style={{ color: palette.muted }} />
          <p className="text-sm font-extrabold" style={{ color: palette.text }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.title') : t('today.empty.title')}
          </p>
          <p className="text-xs font-semibold" style={{ color: palette.muted }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.body') : t('today.empty.body')}
          </p>
        </div>
      </div>
    );
  }

  /* ---- list (chronological) ---- */
  return (
    <div className="space-y-4" data-testid="today-appointments">
      {header}
      <ul className="space-y-3" role="list">
        {appointments.map((row: TodayAppointment) => (
          <li key={row.id}>
            <OwnerAppointmentRow
              row={row}
              actor={actor}
              palette={palette}
              locale={locale}
              t={t}
              testIdPrefix="today"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
