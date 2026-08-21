/** PHASE 17.7 — Calendar / Schedule section of the Owner Dashboard. */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import {
  groupScheduleByDates,
  initialScheduleDate,
  moveScheduleDate,
  readOwnerSchedule,
  scheduleDatesForView,
} from '../lib/ownerCalendarSchedule';
import type { CalendarView, ScheduleAppointment, SchedulePeriodState } from '../lib/ownerCalendarSchedule';
import type { BookingActorContext } from '../lib/bookingManagement';
import type { OwnerDashboardFilterState } from '../lib/ownerDashboardFilters';
import { ownerFiltersActive } from '../lib/ownerDashboardFilters';
import { bookingManageDeniedKey } from '../lib/bookingManagement';
import { bookingManagementText } from '../lib/bookingManagementI18n';
import { ownerDashboardTranslator } from '../lib/ownerDashboardI18n';
import { formatDurationLabel } from '../lib/ownerTodayAppointments';
import { formatMinutesLabel, PAYMENT_EVENT } from '../lib/siteBookingPayment';
import { SALON_CLOCK_EVENT } from '../lib/salonStatus';
import type { AppLocale } from '../lib/locale';
import OwnerAppointmentRow from './OwnerAppointmentRow';
import type { AppointmentPalette } from './OwnerAppointmentRow';
import { useSiteLocale } from './SiteHeader';

interface Props {
  actor: BookingActorContext;
  businessIds: readonly string[];
  themeIds: readonly string[];
  palette: AppointmentPalette;
  forcedState?: 'loading' | 'error' | 'ready';
  filters?: OwnerDashboardFilterState;
}

function periodStyle(state: SchedulePeriodState, palette: AppointmentPalette): CSSProperties {
  if (state === 'completed') {
    return { backgroundColor: 'rgba(59,130,246,0.10)', borderColor: 'rgba(59,130,246,0.38)' };
  }
  if (state === 'cancelled') {
    return { backgroundColor: palette.panelSoft, borderColor: '#dc262666' };
  }
  return { backgroundColor: palette.panel, borderColor: `${palette.accent}55` };
}

function stateIcon(state: SchedulePeriodState) {
  if (state === 'completed') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (state === 'cancelled') return <XCircle className="h-3.5 w-3.5" />;
  return <CircleDashed className="h-3.5 w-3.5" />;
}

function localDateLabel(date: Date, locale: AppLocale, long = false): string {
  return date.toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', long
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function OwnerCalendarSchedule({
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
  const [view, setView] = useState<CalendarView>('week');
  const [selectedDate, setSelectedDate] = useState(() => initialScheduleDate());
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener(PAYMENT_EVENT, refresh);
    window.addEventListener(SALON_CLOCK_EVENT, refresh);
    return () => {
      window.removeEventListener(PAYMENT_EVENT, refresh);
      window.removeEventListener(SALON_CLOCK_EVENT, refresh);
    };
  }, []);

  const businessKey = businessIds.join('|');
  const themeKey = themeIds.join('|');
  const result = useMemo(
    () => readOwnerSchedule(actor, businessIds, themeIds, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actor, businessKey, themeKey, version, retry, filters],
  );
  const state = forcedState ?? 'ready';

  if (!result.ok) {
    const key = bookingManageDeniedKey(result.reason);
    const message = key
      ? bookingCopy[key as keyof typeof bookingCopy]
      : bookingCopy['manage.denied.error'];
    return (
      <div
        data-testid="owner-calendar-denied"
        role="alert"
        className="flex items-start gap-3 rounded-2xl border p-5"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" style={{ color: palette.accent }} />
        <p className="text-xs font-bold" style={{ color: palette.muted }}>{message}</p>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div data-testid="owner-calendar-loading" role="status" aria-busy="true" className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: palette.muted }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: palette.accent }} />
          {t('calendar.loading')}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
          {[0, 1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-2xl border" style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }} />
          ))}
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div data-testid="owner-calendar-error" className="space-y-3 rounded-2xl border p-5" style={{ backgroundColor: palette.panel, borderColor: palette.line }}>
        <div className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <AlertCircle className="h-4 w-4" style={{ color: palette.accent }} />
          {t('calendar.error.title')}
        </div>
        <p className="text-xs font-semibold" style={{ color: palette.muted }}>{t('calendar.error.body')}</p>
        <button
          type="button"
          data-testid="owner-calendar-retry"
          onClick={() => setRetry((value) => value + 1)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold"
          style={{ backgroundColor: palette.accent, color: palette.accentText }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('state.retry')}
        </button>
      </div>
    );
  }

  const dates = scheduleDatesForView(selectedDate, view);
  const days = groupScheduleByDates(result.appointments, dates);
  const visibleCount = days.reduce((count, day) => count + day.appointments.length, 0);
  const selectedAppointment = selectedRecordId
    ? result.appointments.find((appointment) => appointment.id === selectedRecordId) ?? null
    : null;
  const rangeLabel = view === 'day'
    ? localDateLabel(dates[0], locale, true)
    : `${localDateLabel(dates[0], locale)} – ${localDateLabel(dates[dates.length - 1], locale)}`;

  return (
    <div data-testid="owner-calendar" data-view={view} className="space-y-4">
      <div
        data-testid="owner-calendar-header"
        className="space-y-4 rounded-2xl border p-4"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
              <CalendarDays className="h-4 w-4" style={{ color: palette.accent }} />
              {t('calendar.heading')}
            </h3>
            <p className="mt-0.5 text-[11px] font-bold" style={{ color: palette.muted }}>{rangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border p-1" style={{ borderColor: palette.line }} role="group" aria-label={t('calendar.view.label')}>
              {(['day', 'week'] as CalendarView[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`owner-calendar-view-${value}`}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className="min-h-9 rounded-lg px-3 py-2 text-[11px] font-extrabold"
                  style={{
                    backgroundColor: view === value ? palette.accent : 'transparent',
                    color: view === value ? palette.accentText : palette.text,
                  }}
                >
                  {t(`calendar.view.${value}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              data-testid="owner-calendar-previous"
              onClick={() => setSelectedDate((date) => moveScheduleDate(date, view, -1))}
              aria-label={t('calendar.previous')}
              className="min-h-9 rounded-xl border p-2"
              style={{ borderColor: palette.line, color: palette.text }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              data-testid="owner-calendar-today"
              onClick={() => setSelectedDate(initialScheduleDate())}
              className="min-h-9 rounded-xl border px-3 py-2 text-[11px] font-extrabold"
              style={{ borderColor: palette.line, color: palette.text, backgroundColor: palette.panelSoft }}
            >
              {t('calendar.today')}
            </button>
            <button
              type="button"
              data-testid="owner-calendar-next"
              onClick={() => setSelectedDate((date) => moveScheduleDate(date, view, 1))}
              aria-label={t('calendar.next')}
              className="min-h-9 rounded-xl border p-2"
              style={{ borderColor: palette.line, color: palette.text }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <CalendarLegend palette={palette} t={t} />
      </div>

      {visibleCount === 0 && (
        <div
          data-testid={filters && ownerFiltersActive(filters) ? 'owner-calendar-no-results' : 'owner-calendar-empty'}
          className="space-y-2 rounded-2xl border p-7 text-center"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <Inbox className="mx-auto h-6 w-6" style={{ color: palette.muted }} />
          <p className="text-sm font-extrabold" style={{ color: palette.text }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.title') : t('calendar.empty.title')}
          </p>
          <p className="text-xs font-semibold" style={{ color: palette.muted }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.body') : t('calendar.empty.body')}
          </p>
        </div>
      )}

      <div
        data-testid="owner-calendar-grid"
        className={view === 'week'
          ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7'
          : 'grid grid-cols-1 gap-3'}
      >
        {days.map((day) => (
          <section
            key={day.dateKey}
            data-testid={`owner-calendar-day-${day.dateKey}`}
            className="min-w-0 rounded-2xl border p-3"
            style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="text-xs font-extrabold" style={{ color: palette.text }}>{localDateLabel(day.date, locale)}</h4>
              <span className="rounded-lg px-2 py-0.5 text-[10px] font-black" style={{ backgroundColor: palette.accentSoft, color: palette.accent }}>
                {day.appointments.length}
              </span>
            </div>
            {day.appointments.length === 0 ? (
              <p className="py-6 text-center text-[11px] font-semibold" style={{ color: palette.muted }}>{t('calendar.day.empty')}</p>
            ) : (
              <ul className="space-y-2" role="list">
                {day.appointments.map((appointment) => (
                  <SchedulePeriod
                    key={appointment.id}
                    appointment={appointment}
                    palette={palette}
                    locale={locale}
                    t={t}
                    onSelect={() => setSelectedRecordId(appointment.id)}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" data-testid="owner-calendar-details-overlay">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('calendar.details.title')}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border p-4 sm:rounded-2xl sm:p-5"
            style={{ backgroundColor: palette.panel, borderColor: palette.line }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold" style={{ color: palette.text }}>{t('calendar.details.title')}</h3>
              <button
                type="button"
                data-testid="owner-calendar-details-close"
                onClick={() => setSelectedRecordId(null)}
                aria-label={t('calendar.details.close')}
                className="rounded-xl border p-2"
                style={{ borderColor: palette.line, color: palette.text }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <OwnerAppointmentRow
              row={selectedAppointment}
              actor={actor}
              palette={palette}
              locale={locale}
              t={t}
              testIdPrefix="calendar-details"
              dateLabel={localDateLabel(dates.find((date) => selectedAppointment.dateKey === dayKey(date)) ?? selectedDate, locale, true)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function SchedulePeriod({
  appointment,
  palette,
  locale,
  t,
  onSelect,
}: {
  key?: string;
  appointment: ScheduleAppointment;
  palette: AppointmentPalette;
  locale: AppLocale;
  t: (key: string) => string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-testid={`owner-calendar-appointment-${appointment.bookingId}`}
        data-period-state={appointment.periodState}
        onClick={onSelect}
        className={`w-full rounded-xl border p-3 text-left transition-transform hover:-translate-y-0.5 ${appointment.periodState === 'cancelled' ? 'border-dashed opacity-75' : ''}`}
        style={periodStyle(appointment.periodState, palette)}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[11px] font-black" style={{ color: palette.text }}>
            <Clock3 className="h-3.5 w-3.5" style={{ color: palette.accent }} />
            {formatMinutesLabel(appointment.startMinutes, locale)} – {formatMinutesLabel(appointment.endMinutes, locale)}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-black uppercase" style={{ color: palette.muted }}>
            {stateIcon(appointment.periodState)}
            {t(`calendar.period.${appointment.periodState}`)}
          </span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] font-extrabold" style={{ color: palette.text }}>
          <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: palette.accent }} />
          {appointment.serviceNames.join(' + ')}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold" style={{ color: palette.muted }}>
          <span>{formatDurationLabel(appointment.durationMinutes, t('today.unit.hour'), t('today.unit.minute'))}</span>
          <span>{t(`today.status.${appointment.status}`)}</span>
          <span>{t(`today.payment.${appointment.paymentStatus}`)}</span>
        </div>
        {appointment.releasedForAvailability && (
          <span
            data-testid={`owner-calendar-released-${appointment.bookingId}`}
            className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black"
            style={{ backgroundColor: 'rgba(16,185,129,0.14)', color: '#0f9b6c' }}
          >
            <CircleDashed className="h-3 w-3" />
            {t('calendar.period.availableAgain')}
          </span>
        )}
      </button>
    </li>
  );
}

function CalendarLegend({ palette, t }: { palette: AppointmentPalette; t: (key: string) => string }) {
  const items = [
    ['available', '#0f9b6c'],
    ['booked', palette.accent],
    ['cancelled', '#dc2626'],
    ['completed', '#3b82f6'],
  ] as const;
  return (
    <div data-testid="owner-calendar-legend" className="flex flex-wrap gap-2 text-[10px] font-bold" style={{ color: palette.muted }}>
      {items.map(([key, colour]) => (
        <span key={key} className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1" style={{ borderColor: palette.line }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colour }} />
          {t(`calendar.legend.${key}`)}
        </span>
      ))}
    </div>
  );
}
