/** PHASE 17.5 — Customers section of the authenticated Owner Dashboard. */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  Inbox,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  filterOwnerCustomers,
  readOwnerCustomers,
} from '../lib/ownerCustomers';
import type { OwnerCustomer } from '../lib/ownerCustomers';
import type { OwnerDashboardFilterState } from '../lib/ownerDashboardFilters';
import { ownerFiltersActive } from '../lib/ownerDashboardFilters';
import { bookingManageDeniedKey } from '../lib/bookingManagement';
import type { BookingActorContext } from '../lib/bookingManagement';
import { bookingManagementText } from '../lib/bookingManagementI18n';
import { ownerDashboardTranslator } from '../lib/ownerDashboardI18n';
import { todayStatusGroup } from '../lib/ownerTodayAppointments';
import { formatMinutesLabel, PAYMENT_EVENT } from '../lib/siteBookingPayment';
import type { AppLocale } from '../lib/locale';
import { useSiteLocale } from './SiteHeader';
import { statusChipStyle } from './OwnerAppointmentRow';
import type { AppointmentPalette } from './OwnerAppointmentRow';

interface Props {
  /** Session-resolved actor and salon tenant keys — never owner-entered. */
  actor: BookingActorContext;
  businessIds: readonly string[];
  themeIds: readonly string[];
  palette: AppointmentPalette;
  forcedState?: 'loading' | 'error' | 'ready';
  filters?: OwnerDashboardFilterState;
}

function dateLabel(dateKey: string, locale: AppLocale): string {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function OwnerCustomers({
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
  const [version, setVersion] = useState(0);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener(PAYMENT_EVENT, refresh);
    return () => window.removeEventListener(PAYMENT_EVENT, refresh);
  }, []);

  const businessKey = businessIds.join('|');
  const themeKey = themeIds.join('|');
  const result = useMemo(
    () => readOwnerCustomers(actor, businessIds, themeIds, filters),
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
        data-testid="owner-customers-denied"
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
      <div data-testid="owner-customers-loading" aria-busy="true" role="status" className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: palette.muted }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: palette.accent }} />
          {t('customers.loading')}
        </div>
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-36 animate-pulse rounded-2xl border"
            style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }}
          />
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div
        data-testid="owner-customers-error"
        className="space-y-3 rounded-2xl border p-5"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <div className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <AlertCircle className="h-4 w-4" style={{ color: palette.accent }} />
          {t('customers.error.title')}
        </div>
        <p className="text-xs font-semibold" style={{ color: palette.muted }}>{t('customers.error.body')}</p>
        <button
          type="button"
          data-testid="owner-customers-retry"
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

  const customers = result.customers;
  const visibleCustomers = filterOwnerCustomers(customers, query);

  const header = (
    <div
      data-testid="owner-customers-header"
      className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-end sm:justify-between"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <div>
        <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <Users className="h-4 w-4" style={{ color: palette.accent }} />
          {t('customers.heading')}
        </h3>
        <p className="mt-0.5 text-[11px] font-bold" style={{ color: palette.muted }}>
          {t('customers.subtitle')}
        </p>
      </div>
      {customers.length > 0 && (
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">{t('customers.search.label')}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: palette.muted }}
          />
          <input
            data-testid="owner-customers-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('customers.search.placeholder')}
            className="min-h-10 w-full rounded-xl border bg-transparent py-2 pl-9 pr-9 text-xs font-semibold outline-none focus:ring-2"
            style={{ borderColor: palette.line, color: palette.text }}
          />
          {query && (
            <button
              type="button"
              data-testid="owner-customers-search-clear"
              onClick={() => setQuery('')}
              aria-label={t('customers.search.clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1"
              style={{ color: palette.muted }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
      )}
    </div>
  );

  if (customers.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <div
          data-testid={filters && ownerFiltersActive(filters) ? 'owner-customers-filtered-empty' : 'owner-customers-empty'}
          className="space-y-2 rounded-2xl border p-8 text-center"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <Inbox className="mx-auto h-6 w-6" style={{ color: palette.muted }} />
          <p className="text-sm font-extrabold" style={{ color: palette.text }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.title') : t('customers.empty.title')}
          </p>
          <p className="text-xs font-semibold" style={{ color: palette.muted }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.body') : t('customers.empty.body')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="owner-customers" className="space-y-4">
      {header}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-bold" style={{ color: palette.muted }}>
        <span data-testid="owner-customers-count">
          {t('customers.count')}: {visibleCustomers.length}
        </span>
        {query && <span>{t('customers.search.results')}</span>}
      </div>

      {visibleCustomers.length === 0 ? (
        <div
          data-testid="owner-customers-no-results"
          className="rounded-2xl border p-7 text-center"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <Search className="mx-auto h-5 w-5" style={{ color: palette.muted }} />
          <p className="mt-2 text-xs font-bold" style={{ color: palette.text }}>{t('customers.search.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-3" role="list">
          {visibleCustomers.map((customer) => (
            <CustomerCard
              key={customer.customerId}
              customer={customer}
              expanded={expandedCustomerId === customer.customerId}
              onToggle={() => setExpandedCustomerId((current) =>
                current === customer.customerId ? null : customer.customerId)}
              palette={palette}
              locale={locale}
              t={t}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomerCard({
  customer,
  expanded,
  onToggle,
  palette,
  locale,
  t,
}: {
  /** React list identity; the value remains the existing persisted customer id. */
  key?: string;
  customer: OwnerCustomer;
  expanded: boolean;
  onToggle: () => void;
  palette: AppointmentPalette;
  locale: AppLocale;
  t: (key: string) => string;
}) {
  const recent = customer.recentBooking;
  return (
    <li>
      <article
        data-testid={`owner-customer-${customer.customerId}`}
        className="space-y-4 rounded-2xl border p-4 md:p-5"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: palette.accentSoft, color: palette.accent }}
              >
                <User className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h4 className="truncate text-sm font-extrabold" style={{ color: palette.text }}>
                  {customer.name || t('customers.nameUnavailable')}
                </h4>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: palette.muted }}>
                  {t('customers.totalBookings')}: {customer.totalBookings}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[11px] font-semibold" style={{ color: palette.muted }}>
              {customer.phone && (
                <p className="flex items-center gap-1.5" data-testid={`owner-customer-phone-${customer.customerId}`}>
                  <Phone className="h-3.5 w-3.5" style={{ color: palette.accent }} />
                  {customer.phone}
                </p>
              )}
              {customer.email && (
                <p className="flex items-center gap-1.5 break-all" data-testid={`owner-customer-email-${customer.customerId}`}>
                  <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: palette.accent }} />
                  {customer.email}
                </p>
              )}
            </div>
          </div>

          <div
            data-testid={`owner-customer-recent-${customer.customerId}`}
            className="space-y-2 rounded-xl border p-3"
            style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }}
          >
            <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: palette.muted }}>
              {t('customers.recentBooking')}
            </p>
            <p className="flex items-center gap-1.5 text-xs font-extrabold" style={{ color: palette.text }}>
              <Calendar className="h-3.5 w-3.5" style={{ color: palette.accent }} />
              {dateLabel(recent.dateKey, locale)} · {formatMinutesLabel(recent.startMinutes, locale)}
            </p>
            <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold" style={{ color: palette.muted }}>
              <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: palette.accent }} />
              {recent.serviceNames.join(' + ')}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className="inline-flex rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
                style={statusChipStyle(todayStatusGroup(recent.bookingStatus), palette)}
              >
                {t(`today.status.${recent.bookingStatus}`)}
              </span>
              <span className="text-[10px] font-bold" style={{ color: palette.muted }}>
                {t('today.field.bookingId')}: {recent.bookingId}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-testid={`owner-customer-history-toggle-${customer.customerId}`}
            onClick={onToggle}
            aria-expanded={expanded}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-extrabold"
            style={{ borderColor: palette.line, color: palette.text, backgroundColor: palette.panelSoft }}
          >
            <History className="h-3.5 w-3.5" style={{ color: palette.accent }} />
            {t('customers.viewHistory')}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {expanded && (
          <div
            data-testid={`owner-customer-history-${customer.customerId}`}
            className="space-y-2 border-t pt-4"
            style={{ borderColor: palette.line }}
          >
            <h5 className="text-xs font-extrabold" style={{ color: palette.text }}>{t('customers.history')}</h5>
            <ul className="space-y-2" role="list">
              {customer.bookingHistory.map((booking) => (
                <li
                  key={booking.id}
                  data-testid={`owner-customer-history-booking-${booking.bookingId}`}
                  className="grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-extrabold" style={{ color: palette.text }}>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" style={{ color: palette.accent }} />
                        {dateLabel(booking.dateKey, locale)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" style={{ color: palette.accent }} />
                        {formatMinutesLabel(booking.startMinutes, locale)} – {formatMinutesLabel(booking.endMinutes, locale)}
                      </span>
                    </p>
                    <p className="mt-1 truncate text-[11px] font-semibold" style={{ color: palette.muted }}>
                      {booking.serviceNames.join(' + ')} · {t('today.field.bookingId')}: {booking.bookingId}
                    </p>
                  </div>
                  <span
                    className="justify-self-start rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider sm:justify-self-end"
                    style={statusChipStyle(todayStatusGroup(booking.bookingStatus), palette)}
                  >
                    {t(`today.status.${booking.bookingStatus}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </li>
  );
}
