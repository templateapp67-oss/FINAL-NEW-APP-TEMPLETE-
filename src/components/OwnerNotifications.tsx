/** PHASE 17.8 — Owner Notifications section. */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import {
  readOwnerNotifications,
} from '../lib/ownerNotifications';
import type { OwnerNotification, OwnerNotificationType } from '../lib/ownerNotifications';
import type { BookingActorContext } from '../lib/bookingManagement';
import type { OwnerDashboardFilterState } from '../lib/ownerDashboardFilters';
import { ownerFiltersActive } from '../lib/ownerDashboardFilters';
import { bookingManageDeniedKey } from '../lib/bookingManagement';
import { bookingManagementText } from '../lib/bookingManagementI18n';
import { ownerDashboardTranslator } from '../lib/ownerDashboardI18n';
import { toTodayAppointment } from '../lib/ownerTodayAppointments';
import { formatCurrency } from '../lib/pricing';
import { PAYMENT_EVENT } from '../lib/siteBookingPayment';
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

type NotificationFilter = 'all' | 'bookings' | 'payments' | 'status';
const FILTERS: NotificationFilter[] = ['all', 'bookings', 'payments', 'status'];

function filterMatches(type: OwnerNotificationType, filter: NotificationFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'payments') return type === 'payment_received' || type === 'payment_failed';
  if (filter === 'status') return type === 'status_changed';
  return type === 'new_booking' || type === 'booking_cancelled';
}

function notificationIcon(type: OwnerNotificationType) {
  if (type === 'new_booking') return <CalendarPlus className="h-4 w-4" />;
  if (type === 'payment_received') return <CircleDollarSign className="h-4 w-4" />;
  if (type === 'payment_failed' || type === 'booking_cancelled') return <XCircle className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function notificationColour(type: OwnerNotificationType, palette: AppointmentPalette): string {
  if (type === 'payment_received' || type === 'status_changed') return '#0f9b6c';
  if (type === 'payment_failed' || type === 'booking_cancelled') return '#dc2626';
  return palette.accent;
}

function notificationTime(timestamp: number, locale: AppLocale): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function OwnerNotifications({
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
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener(PAYMENT_EVENT, refresh);
    return () => window.removeEventListener(PAYMENT_EVENT, refresh);
  }, []);

  const businessKey = businessIds.join('|');
  const themeKey = themeIds.join('|');
  const result = useMemo(
    () => readOwnerNotifications(actor, businessIds, themeIds, filters),
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
        data-testid="owner-notifications-denied"
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
      <div data-testid="owner-notifications-loading" role="status" aria-busy="true" className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: palette.muted }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: palette.accent }} />
          {t('notifications.loading')}
        </div>
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-2xl border" style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }} />
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div data-testid="owner-notifications-error" className="space-y-3 rounded-2xl border p-5" style={{ backgroundColor: palette.panel, borderColor: palette.line }}>
        <div className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <AlertCircle className="h-4 w-4" style={{ color: palette.accent }} />
          {t('notifications.error.title')}
        </div>
        <p className="text-xs font-semibold" style={{ color: palette.muted }}>{t('notifications.error.body')}</p>
        <button
          type="button"
          data-testid="owner-notifications-retry"
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

  const visible = result.notifications.filter((notification) => filterMatches(notification.type, filter));
  const selectedRecord = selectedRecordId
    ? result.records.find((record) => record.id === selectedRecordId) ?? null
    : null;

  const header = (
    <div
      data-testid="owner-notifications-header"
      className="flex flex-col gap-3 rounded-2xl border p-4 lg:flex-row lg:items-end lg:justify-between"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <div>
        <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <Bell className="h-4 w-4" style={{ color: palette.accent }} />
          {t('notifications.heading')}
        </h3>
        <p className="mt-0.5 text-[11px] font-bold" style={{ color: palette.muted }}>{t('notifications.subtitle')}</p>
      </div>
      {result.notifications.length > 0 && (
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t('notifications.filter.label')}>
          {FILTERS.map((value) => {
            const active = value === filter;
            return (
              <button
                key={value}
                type="button"
                data-testid={`owner-notifications-filter-${value}`}
                aria-pressed={active}
                onClick={() => setFilter(value)}
                className="min-h-9 shrink-0 rounded-xl border px-3 py-2 text-[11px] font-extrabold"
                style={{
                  backgroundColor: active ? palette.accent : palette.panelSoft,
                  borderColor: active ? palette.accent : palette.line,
                  color: active ? palette.accentText : palette.text,
                }}
              >
                {t(`notifications.filter.${value}`)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  if (result.notifications.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <div
          data-testid={filters && ownerFiltersActive(filters) ? 'owner-notifications-filtered-empty' : 'owner-notifications-empty'}
          className="space-y-2 rounded-2xl border p-8 text-center"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <Inbox className="mx-auto h-6 w-6" style={{ color: palette.muted }} />
          <p className="text-sm font-extrabold" style={{ color: palette.text }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.title') : t('notifications.empty.title')}
          </p>
          <p className="text-xs font-semibold" style={{ color: palette.muted }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.body') : t('notifications.empty.body')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="owner-notifications" className="space-y-4">
      {header}
      <div
        data-testid="owner-notifications-source-note"
        className="rounded-xl border px-4 py-3 text-[11px] font-semibold"
        style={{ backgroundColor: palette.panelSoft, borderColor: palette.line, color: palette.muted }}
      >
        {t('notifications.sourceNote')}
      </div>

      {visible.length === 0 ? (
        <div data-testid="owner-notifications-no-results" className="rounded-2xl border p-7 text-center text-xs font-bold" style={{ backgroundColor: palette.panel, borderColor: palette.line, color: palette.muted }}>
          {t('notifications.filter.empty')}
        </div>
      ) : (
        <ul className="space-y-2" role="list" data-testid="owner-notifications-list">
          {visible.map((notification) => (
            <NotificationItem
              key={notification.key}
              notification={notification}
              palette={palette}
              locale={locale}
              t={t}
              onSelect={() => setSelectedRecordId(notification.recordId)}
            />
          ))}
        </ul>
      )}

      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" data-testid="owner-notification-details-overlay">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('notifications.details.title')}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border p-4 sm:rounded-2xl sm:p-5"
            style={{ backgroundColor: palette.panel, borderColor: palette.line }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold" style={{ color: palette.text }}>{t('notifications.details.title')}</h3>
              <button
                type="button"
                data-testid="owner-notification-details-close"
                onClick={() => setSelectedRecordId(null)}
                aria-label={t('notifications.details.close')}
                className="rounded-xl border p-2"
                style={{ borderColor: palette.line, color: palette.text }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <OwnerAppointmentRow
              row={toTodayAppointment(selectedRecord)}
              actor={actor}
              palette={palette}
              locale={locale}
              t={t}
              testIdPrefix="notification-details"
              dateLabel={new Date(`${selectedRecord.dateKey}T12:00:00`).toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  palette,
  locale,
  t,
  onSelect,
}: {
  key?: string;
  notification: OwnerNotification;
  palette: AppointmentPalette;
  locale: AppLocale;
  t: (key: string) => string;
  onSelect: () => void;
}) {
  const colour = notificationColour(notification.type, palette);
  const message = notificationMessage(notification, t);
  return (
    <li>
      <button
        type="button"
        data-testid={`owner-notification-${notification.key}`}
        data-notification-type={notification.type}
        onClick={onSelect}
        className="flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${colour}18`, color: colour }}>
          {notificationIcon(notification.type)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-2">
            <span className="text-xs font-extrabold" style={{ color: palette.text }}>{t(`notifications.type.${notification.type}`)}</span>
            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: palette.muted }}>
              <Clock3 className="h-3 w-3" />
              {notificationTime(notification.occurredAt, locale)}
            </span>
          </span>
          <span className="mt-1 block text-[11px] font-semibold leading-relaxed" style={{ color: palette.muted }}>{message}</span>
          <span className="mt-2 block text-[10px] font-black uppercase tracking-wider" style={{ color: palette.accent }}>
            {t('notifications.bookingRef')}: {notification.bookingId}
          </span>
          {notification.isRead !== undefined && (
            <span className="mt-1 block text-[10px] font-bold" style={{ color: palette.muted }}>
              {notification.isRead ? t('notifications.read') : t('notifications.unread')}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function notificationMessage(notification: OwnerNotification, t: (key: string) => string): string {
  const services = notification.serviceNames.join(' + ');
  if (notification.type === 'payment_received') {
    return t('notifications.message.payment_received')
      .replace('{amount}', formatCurrency(notification.amount))
      .replace('{services}', services);
  }
  if (notification.type === 'payment_failed') {
    return t('notifications.message.payment_failed').replace('{services}', services);
  }
  if (notification.type === 'booking_cancelled') {
    return t('notifications.message.booking_cancelled').replace('{services}', services);
  }
  if (notification.type === 'status_changed') {
    return t('notifications.message.status_changed')
      .replace('{status}', t(`today.status.${notification.bookingStatus}`))
      .replace('{services}', services);
  }
  return t('notifications.message.new_booking').replace('{services}', services);
}
