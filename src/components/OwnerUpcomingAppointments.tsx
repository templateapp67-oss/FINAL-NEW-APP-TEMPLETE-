/**
 * PHASE 17.3 — UPCOMING APPOINTMENTS section of the Owner Dashboard.
 *
 * Future bookings for the OWNER's OWN salon, read through
 * `ownerUpcomingAppointments.ts` (permission re-checked inside, tenant-keyed
 * over the EXISTING 10.7/16.5 booking records) and rendered with the SHARED
 * `OwnerAppointmentRow` the 17.2 Today list uses — one row renderer, not two.
 *
 * The salon identity is not a prop a user can tamper with: the host passes
 * session-resolved tenant keys from the existing organization_members →
 * salons chain, and the data layer re-validates them.
 *
 * Rows are grouped by their own appointment date, nearest day first. Days with
 * no bookings are never emitted, and no appointment is ever synthesised.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  countUpcoming,
  formatGroupDate,
  readUpcomingAppointments,
} from '../lib/ownerUpcomingAppointments';
import type { UpcomingGroup } from '../lib/ownerUpcomingAppointments';
import { TODAY_STATUS_GROUPS } from '../lib/ownerTodayAppointments';
import OwnerAppointmentRow, { statusChipStyle } from './OwnerAppointmentRow';
import type { AppointmentPalette } from './OwnerAppointmentRow';
import { bookingManageDeniedKey } from '../lib/bookingManagement';
import type { BookingActorContext } from '../lib/bookingManagement';
import { PAYMENT_EVENT } from '../lib/siteBookingPayment';
import { SALON_CLOCK_EVENT } from '../lib/salonStatus';
import { ownerDashboardCount, ownerDashboardTranslator } from '../lib/ownerDashboardI18n';
import { bookingManagementText } from '../lib/bookingManagementI18n';
import { useSiteLocale } from './SiteHeader';
import type { AppLocale } from '../lib/locale';
import type { OwnerDashboardFilterState } from '../lib/ownerDashboardFilters';
import { ownerFiltersActive } from '../lib/ownerDashboardFilters';

interface Props {
  /** Session-resolved actor — the host ran the auth/ownership chain. */
  actor: BookingActorContext;
  /** Tenant keys of the OWNER's own salon (session-resolved, never typed). */
  businessIds: readonly string[];
  themeIds: readonly string[];
  palette: AppointmentPalette;
  /** Test seam so the suite can exercise loading/error without mocking IO. */
  forcedState?: 'loading' | 'error' | 'ready';
  filters?: OwnerDashboardFilterState;
}

/** Relative label for a day group — only real offsets, no invented buckets. */
function groupBadge(group: UpcomingGroup, locale: AppLocale, t: (k: string) => string): string {
  if (group.daysAhead <= 1) return t('upcoming.group.tomorrow');
  if (group.kind === 'this-week') return ownerDashboardCount(locale, 'upcoming.group.inDays', group.daysAhead);
  return t('upcoming.group.later');
}

export default function OwnerUpcomingAppointments({
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

  // Re-read on the EXISTING events (a new booking, or the clock crossing
  // midnight so "upcoming" shifts). No polling, no second store.
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
    () => readUpcomingAppointments(actor, businessIds, themeIds, undefined, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actor, businessKey, themeKey, version, retry, filters],
  );

  const state = forcedState ?? 'ready';

  /* ---- unauthorized ---- */
  if (!result.ok) {
    const key = bookingManageDeniedKey(result.reason);
    const message = key
      ? bookingCopy[key as keyof typeof bookingCopy]
      : bookingCopy['manage.denied.error'];
    return (
      <div
        data-testid="upcoming-appointments-denied"
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

  const groups = result.groups;
  const counts = countUpcoming(groups);

  /* ---- loading ---- */
  if (state === 'loading') {
    return (
      <div data-testid="upcoming-appointments-loading" aria-busy="true" role="status" className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: palette.muted }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: palette.accent }} />
          {t('upcoming.loading')}
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
        data-testid="upcoming-appointments-error"
        className="space-y-3 rounded-2xl border p-5"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <div className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <AlertCircle className="h-4 w-4" style={{ color: palette.accent }} />
          {t('upcoming.error.title')}
        </div>
        <p className="text-xs font-semibold" style={{ color: palette.muted }}>
          {t('upcoming.error.body')}
        </p>
        <button
          type="button"
          data-testid="upcoming-appointments-retry"
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
      data-testid="upcoming-appointments-header"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <CalendarClock className="h-4 w-4" style={{ color: palette.accent }} />
          {t('upcoming.heading')}
        </h3>
        <p className="mt-0.5 text-[11px] font-bold" style={{ color: palette.muted }}>
          {t('upcoming.subtitle')}
        </p>
      </div>
      {counts.total > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="upcoming-appointments-counts">
          <span
            data-testid="upcoming-count-total"
            className="rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
            style={{ backgroundColor: palette.accentSoft, color: palette.accent }}
          >
            {t('upcoming.count.total')}: {counts.total}
          </span>
          <span
            data-testid="upcoming-count-days"
            className="rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
            style={{ backgroundColor: palette.panelSoft, color: palette.muted }}
          >
            {t('upcoming.count.days')}: {counts.days}
          </span>
          {TODAY_STATUS_GROUPS.filter((group) => counts[group] > 0).map((group) => (
            <span
              key={group}
              data-testid={`upcoming-count-${group}`}
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
  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <div
          data-testid={filters && ownerFiltersActive(filters) ? 'upcoming-appointments-no-results' : 'upcoming-appointments-empty'}
          className="space-y-2 rounded-2xl border p-8 text-center"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <Inbox className="mx-auto h-6 w-6" style={{ color: palette.muted }} />
          <p className="text-sm font-extrabold" style={{ color: palette.text }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.title') : t('upcoming.empty.title')}
          </p>
          <p className="text-xs font-semibold" style={{ color: palette.muted }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.body') : t('upcoming.empty.body')}
          </p>
        </div>
      </div>
    );
  }

  /* ---- grouped list, nearest day first ---- */
  return (
    <div className="space-y-4" data-testid="upcoming-appointments">
      {header}
      {groups.map((group) => {
        const count = group.appointments.length;
        return (
          <section
            key={group.dateKey}
            data-testid={`upcoming-group-${group.dateKey}`}
            data-days-ahead={group.daysAhead}
            data-kind={group.kind}
            className="space-y-3"
          >
            <div
              className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: palette.panelSoft }}
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0" style={{ color: palette.accent }} />
              <h4
                className="text-xs font-extrabold"
                style={{ color: palette.text }}
                data-testid={`upcoming-group-date-${group.dateKey}`}
              >
                {formatGroupDate(group.dateKey, locale)}
              </h4>
              <span
                data-testid={`upcoming-group-badge-${group.dateKey}`}
                className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
                style={{ backgroundColor: palette.accentSoft, color: palette.accent }}
              >
                {groupBadge(group, locale, t)}
              </span>
              <span className="ms-auto text-[10px] font-bold" style={{ color: palette.muted }}>
                {count === 1
                  ? t('upcoming.group.count.one')
                  : ownerDashboardCount(locale, 'upcoming.group.count.other', count)}
              </span>
            </div>

            <ul className="space-y-3" role="list">
              {group.appointments.map((row) => (
                <li key={row.id}>
                  <OwnerAppointmentRow
                    row={row}
                    actor={actor}
                    palette={palette}
                    locale={locale}
                    t={t}
                    testIdPrefix="upcoming"
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
