/** PHASE 17.9 — shared real-data filters for Owner Dashboard sections. */
import { useEffect, useMemo, useState } from 'react';
import { Filter, RotateCcw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import {
  DEFAULT_OWNER_FILTERS,
  ownerActiveFilterCount,
  readOwnerFilterOptions,
} from '../lib/ownerDashboardFilters';
import type { OwnerDashboardFilterState } from '../lib/ownerDashboardFilters';
import type { BookingActorContext } from '../lib/bookingManagement';
import { bookingManageDeniedKey } from '../lib/bookingManagement';
import { bookingManagementText } from '../lib/bookingManagementI18n';
import { ownerDashboardTranslator } from '../lib/ownerDashboardI18n';
import { PAYMENT_EVENT } from '../lib/siteBookingPayment';
import type { AppointmentPalette } from './OwnerAppointmentRow';
import { useSiteLocale } from './SiteHeader';

interface Props {
  actor: BookingActorContext;
  businessIds: readonly string[];
  themeIds: readonly string[];
  filters: OwnerDashboardFilterState;
  onChange: (filters: OwnerDashboardFilterState) => void;
  palette: AppointmentPalette;
}

export default function OwnerDashboardFilters({
  actor,
  businessIds,
  themeIds,
  filters,
  onChange,
  palette,
}: Props) {
  const locale = useSiteLocale();
  const t = useMemo(() => ownerDashboardTranslator(locale), [locale]);
  const bookingCopy = useMemo(() => bookingManagementText(locale), [locale]);
  const [version, setVersion] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener(PAYMENT_EVENT, refresh);
    return () => window.removeEventListener(PAYMENT_EVENT, refresh);
  }, []);

  const businessKey = businessIds.join('|');
  const themeKey = themeIds.join('|');
  const result = useMemo(
    () => readOwnerFilterOptions(actor, businessIds, themeIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actor, businessKey, themeKey, version],
  );

  if (!result.ok) {
    const key = bookingManageDeniedKey(result.reason);
    return (
      <div
        data-testid="owner-filters-denied"
        role="alert"
        className="flex items-start gap-2 rounded-xl border p-3"
        style={{ backgroundColor: palette.panel, borderColor: palette.line, color: palette.muted }}
      >
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: palette.accent }} />
        <span className="text-[11px] font-bold">
          {key ? bookingCopy[key as keyof typeof bookingCopy] : bookingCopy['manage.denied.error']}
        </span>
      </div>
    );
  }

  const activeCount = ownerActiveFilterCount(filters);
  const update = <K extends keyof OwnerDashboardFilterState>(key: K, value: OwnerDashboardFilterState[K]) => {
    onChange({ ...filters, [key]: value });
  };
  const selectClass = 'min-h-11 w-full rounded-xl border bg-transparent px-3 py-2 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

  const controls = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider" style={{ color: palette.muted }}>
          {t('filters.date')}
        </span>
        <select
          data-testid="owner-filter-date"
          value={filters.dateRange}
          onChange={(event) => update('dateRange', event.target.value as OwnerDashboardFilterState['dateRange'])}
          className={selectClass}
          style={{ borderColor: palette.line, color: palette.text, backgroundColor: palette.panel }}
        >
          {(['all', 'today', '7d', '30d'] as const).map((value) => (
            <option key={value} value={value}>{t(`filters.date.${value}`)}</option>
          ))}
        </select>
      </label>

      <label className="min-w-0">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider" style={{ color: palette.muted }}>
          {t('filters.bookingStatus')}
        </span>
        <select
          data-testid="owner-filter-booking-status"
          value={filters.bookingStatus}
          onChange={(event) => update('bookingStatus', event.target.value as OwnerDashboardFilterState['bookingStatus'])}
          className={selectClass}
          style={{ borderColor: palette.line, color: palette.text, backgroundColor: palette.panel }}
        >
          <option value="all">{t('filters.allBookingStatuses')}</option>
          {result.options.bookingStatuses.map((status) => (
            <option key={status} value={status}>{bookingCopy[`status.${status}` as keyof typeof bookingCopy]}</option>
          ))}
        </select>
      </label>

      <label className="min-w-0">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider" style={{ color: palette.muted }}>
          {t('filters.paymentStatus')}
        </span>
        <select
          data-testid="owner-filter-payment-status"
          value={filters.paymentStatus}
          onChange={(event) => update('paymentStatus', event.target.value as OwnerDashboardFilterState['paymentStatus'])}
          className={selectClass}
          style={{ borderColor: palette.line, color: palette.text, backgroundColor: palette.panel }}
        >
          <option value="all">{t('filters.allPaymentStatuses')}</option>
          {result.options.paymentStatuses.map((status) => (
            <option key={status} value={status}>{bookingCopy[`payment.${status}` as keyof typeof bookingCopy]}</option>
          ))}
        </select>
      </label>

      <label className="min-w-0">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider" style={{ color: palette.muted }}>
          {t('filters.service')}
        </span>
        <select
          data-testid="owner-filter-service"
          value={filters.serviceId}
          onChange={(event) => update('serviceId', event.target.value)}
          className={selectClass}
          style={{ borderColor: palette.line, color: palette.text, backgroundColor: palette.panel }}
        >
          <option value="all">{t('filters.allServices')}</option>
          {result.options.services.map((service) => (
            <option key={service.id} value={service.id}>{service.name}</option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <section
      data-testid="owner-dashboard-filters"
      aria-label={t('filters.title')}
      className="rounded-2xl border p-3 sm:p-4"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          data-testid="owner-filters-mobile-toggle"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((value) => !value)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-xs font-extrabold md:pointer-events-none"
          style={{ color: palette.text }}
        >
          <SlidersHorizontal className="h-4 w-4" style={{ color: palette.accent }} />
          {t('filters.title')}
          {activeCount > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ backgroundColor: palette.accent, color: palette.accentText }}>
              {activeCount}
            </span>
          )}
        </button>
        <button
          type="button"
          data-testid="owner-filters-reset"
          disabled={activeCount === 0}
          onClick={() => onChange({ ...DEFAULT_OWNER_FILTERS })}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-extrabold outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45"
          style={{ borderColor: palette.line, color: palette.text, backgroundColor: palette.panelSoft }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('filters.reset')}
        </button>
      </div>
      <div className={`${mobileOpen ? 'block' : 'hidden'} mt-3 md:block`}>
        {controls}
        <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: palette.muted }} aria-live="polite">
          <Filter className="h-3 w-3" />
          {activeCount > 0
            ? t('filters.active').replace('{count}', String(activeCount))
            : t('filters.none')}
        </p>
      </div>
    </section>
  );
}
