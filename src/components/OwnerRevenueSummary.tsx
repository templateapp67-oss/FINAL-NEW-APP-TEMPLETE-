/** PHASE 17.6 — Revenue & Payment Summary for the authenticated owner. */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  CreditCard,
  FlaskConical,
  Inbox,
  IndianRupee,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  WalletCards,
} from 'lucide-react';
import {
  OWNER_PAYMENT_DATA_MODE,
  readOwnerRevenueSummary,
  REVENUE_DATE_RANGES,
} from '../lib/ownerRevenueSummary';
import type { PaymentSummaryBucket, RevenueDateRange } from '../lib/ownerRevenueSummary';
import type { BookingActorContext } from '../lib/bookingManagement';
import type { OwnerDashboardFilterState } from '../lib/ownerDashboardFilters';
import { ownerFiltersActive } from '../lib/ownerDashboardFilters';
import { bookingManageDeniedKey } from '../lib/bookingManagement';
import { bookingManagementText } from '../lib/bookingManagementI18n';
import { ownerDashboardTranslator } from '../lib/ownerDashboardI18n';
import { formatCurrency } from '../lib/pricing';
import { PAYMENT_EVENT } from '../lib/siteBookingPayment';
import type { AppointmentPalette } from './OwnerAppointmentRow';
import { useSiteLocale } from './SiteHeader';

interface Props {
  actor: BookingActorContext;
  /** Session-resolved tenant candidates; never owner-entered. */
  businessIds: readonly string[];
  themeIds: readonly string[];
  palette: AppointmentPalette;
  forcedState?: 'loading' | 'error' | 'ready';
  filters?: OwnerDashboardFilterState;
}

function SummaryCard({
  testId,
  icon,
  label,
  amount,
  detail,
  palette,
  tone = 'default',
}: {
  testId: string;
  icon: ReactNode;
  label: string;
  amount: number;
  detail?: string;
  palette: AppointmentPalette;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const colour = tone === 'success'
    ? '#0f9b6c'
    : tone === 'warning'
      ? '#d08700'
      : tone === 'danger'
        ? '#dc2626'
        : palette.accent;
  return (
    <div
      data-testid={testId}
      className="min-w-0 rounded-2xl border p-4"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: palette.muted }}>{label}</p>
          <p className="mt-2 truncate text-xl font-black" style={{ color: palette.text }}>{formatCurrency(amount)}</p>
          {detail && <p className="mt-1 text-[11px] font-bold" style={{ color: palette.muted }}>{detail}</p>}
        </div>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${colour}18`, color: colour }}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

function paymentDetail(bucket: PaymentSummaryBucket, transactionLabel: string): string {
  return `${bucket.count} ${transactionLabel}`;
}

export default function OwnerRevenueSummary({
  actor,
  businessIds,
  themeIds,
  palette,
  forcedState,
  filters,
}: Props) {
  const locale = useSiteLocale();
  const t = useMemo(() => ownerDashboardTranslator(locale), [locale]);
  const bookingCopy = useMemo(() => bookingManagementText(locale), [locale]);
  const [range, setRange] = useState<RevenueDateRange>('all');
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
    () => readOwnerRevenueSummary(actor, businessIds, themeIds, filters ? 'all' : range, undefined, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actor, businessKey, themeKey, range, version, retry, filters],
  );
  const state = forcedState ?? 'ready';

  if (!result.ok) {
    const key = bookingManageDeniedKey(result.reason);
    const message = key
      ? bookingCopy[key as keyof typeof bookingCopy]
      : bookingCopy['manage.denied.error'];
    return (
      <div
        data-testid="owner-revenue-denied"
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
      <div data-testid="owner-revenue-loading" role="status" aria-busy="true" className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: palette.muted }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: palette.accent }} />
          {t('revenue.loading')}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-2xl border"
              style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div
        data-testid="owner-revenue-error"
        className="space-y-3 rounded-2xl border p-5"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <div className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <AlertCircle className="h-4 w-4" style={{ color: palette.accent }} />
          {t('revenue.error.title')}
        </div>
        <p className="text-xs font-semibold" style={{ color: palette.muted }}>{t('revenue.error.body')}</p>
        <button
          type="button"
          data-testid="owner-revenue-retry"
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

  const summary = result.summary;
  const transactionLabel = t('revenue.transactions');

  const header = (
    <div
      data-testid="owner-revenue-header"
      className="flex flex-col gap-3 rounded-2xl border p-4 lg:flex-row lg:items-end lg:justify-between"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <div>
        <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: palette.text }}>
          <WalletCards className="h-4 w-4" style={{ color: palette.accent }} />
          {t('revenue.heading')}
        </h3>
        <p className="mt-0.5 text-[11px] font-bold" style={{ color: palette.muted }}>{t('revenue.subtitle')}</p>
      </div>
      {!filters && (
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t('revenue.range.label')}>
          {REVENUE_DATE_RANGES.map((value) => {
            const active = value === range;
            return (
              <button
                key={value}
                type="button"
                data-testid={`owner-revenue-range-${value}`}
                aria-pressed={active}
                onClick={() => setRange(value)}
                className="min-h-9 shrink-0 rounded-xl border px-3 py-2 text-[11px] font-extrabold outline-none focus-visible:ring-2"
                style={{
                  backgroundColor: active ? palette.accent : palette.panelSoft,
                  borderColor: active ? palette.accent : palette.line,
                  color: active ? palette.accentText : palette.text,
                }}
              >
                {t(`revenue.range.${value}`)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  if (result.records.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <MockModeNotice palette={palette} t={t} />
        <div
          data-testid={filters && ownerFiltersActive(filters) ? 'owner-revenue-no-results' : 'owner-revenue-empty'}
          className="space-y-2 rounded-2xl border p-8 text-center"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <Inbox className="mx-auto h-6 w-6" style={{ color: palette.muted }} />
          <p className="text-sm font-extrabold" style={{ color: palette.text }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.title') : t('revenue.empty.title')}
          </p>
          <p className="text-xs font-semibold" style={{ color: palette.muted }}>
            {filters && ownerFiltersActive(filters) ? t('filters.noResults.body') : t('revenue.empty.body')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="owner-revenue" data-payment-mode={OWNER_PAYMENT_DATA_MODE} className="space-y-4">
      {header}
      <MockModeNotice palette={palette} t={t} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          testId="owner-revenue-total-value"
          icon={<IndianRupee className="h-4 w-4" />}
          label={t('revenue.totalValue')}
          amount={summary.totalBookingValue}
          detail={`${summary.recordsCount} ${t('revenue.bookingRecords')}`}
          palette={palette}
        />
        <SummaryCard
          testId="owner-revenue-received"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label={t('revenue.received')}
          amount={summary.receivedAmount}
          detail={paymentDetail(summary.paid, transactionLabel)}
          palette={palette}
          tone="success"
        />
        <SummaryCard
          testId="owner-revenue-remaining"
          icon={<Clock3 className="h-4 w-4" />}
          label={t('revenue.remaining')}
          amount={summary.remainingAmount}
          detail={t('revenue.remainingHint')}
          palette={palette}
          tone="warning"
        />
        <SummaryCard
          testId="owner-revenue-paid"
          icon={<CreditCard className="h-4 w-4" />}
          label={t('revenue.paid')}
          amount={summary.paid.amount}
          detail={paymentDetail(summary.paid, transactionLabel)}
          palette={palette}
          tone="success"
        />
        <SummaryCard
          testId="owner-revenue-pending"
          icon={<Clock3 className="h-4 w-4" />}
          label={t('revenue.pending')}
          amount={summary.pending.amount}
          detail={paymentDetail(summary.pending, transactionLabel)}
          palette={palette}
          tone="warning"
        />
        <SummaryCard
          testId="owner-revenue-failed"
          icon={<Ban className="h-4 w-4" />}
          label={t('revenue.failed')}
          amount={summary.failed.amount}
          detail={paymentDetail(summary.failed, transactionLabel)}
          palette={palette}
          tone="danger"
        />
        {summary.unpaid.count > 0 && (
          <SummaryCard
            testId="owner-revenue-unpaid"
            icon={<CreditCard className="h-4 w-4" />}
            label={t('revenue.unpaid')}
            amount={summary.unpaid.amount}
            detail={paymentDetail(summary.unpaid, transactionLabel)}
            palette={palette}
            tone="warning"
          />
        )}
        {summary.cancelled.count > 0 && (
          <SummaryCard
            testId="owner-revenue-cancelled"
            icon={<Ban className="h-4 w-4" />}
            label={t('revenue.cancelled')}
            amount={summary.cancelled.amount}
            detail={paymentDetail(summary.cancelled, transactionLabel)}
            palette={palette}
            tone="danger"
          />
        )}
        {summary.refunded.count > 0 && (
          <SummaryCard
            testId="owner-revenue-refunded"
            icon={<RotateCcw className="h-4 w-4" />}
            label={t('revenue.refunded')}
            amount={summary.refunded.amount}
            detail={paymentDetail(summary.refunded, transactionLabel)}
            palette={palette}
            tone="warning"
          />
        )}
        {summary.cancelledPaidExcluded.count > 0 && (
          <SummaryCard
            testId="owner-revenue-cancelled-paid-excluded"
            icon={<Ban className="h-4 w-4" />}
            label={t('revenue.cancelledPaidExcluded')}
            amount={summary.cancelledPaidExcluded.amount}
            detail={paymentDetail(summary.cancelledPaidExcluded, transactionLabel)}
            palette={palette}
            tone="danger"
          />
        )}
      </div>

      <div
        data-testid="owner-revenue-rules-note"
        className="rounded-xl border px-4 py-3 text-[11px] font-semibold leading-relaxed"
        style={{ backgroundColor: palette.panelSoft, borderColor: palette.line, color: palette.muted }}
      >
        {t('revenue.rulesNote')}
      </div>
    </div>
  );
}

function MockModeNotice({ palette, t }: { palette: AppointmentPalette; t: (key: string) => string }) {
  return (
    <div
      data-testid="owner-revenue-mock-mode"
      role="note"
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{ backgroundColor: palette.accentSoft, borderColor: palette.line }}
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" style={{ color: palette.accent }} />
      <div>
        <p className="text-xs font-extrabold" style={{ color: palette.text }}>{t('revenue.mock.title')}</p>
        <p className="mt-0.5 text-[11px] font-semibold" style={{ color: palette.muted }}>{t('revenue.mock.body')}</p>
      </div>
    </div>
  );
}
