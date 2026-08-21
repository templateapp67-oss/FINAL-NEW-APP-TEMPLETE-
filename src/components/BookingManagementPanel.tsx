/**
 * PHASE 16.7 — OWNER BOOKING MANAGEMENT panel.
 *
 * One management surface over the EXISTING booking/payment records for the
 * OWNER's OWN salon only (no duplicate booking system):
 *
 *   - The salon identity comes from the session-resolved actor context
 *     (`useAuth` + `resolveOwnerSalonId` chain, resolved by the host
 *     screen) — the panel never accepts a salon-id input a user could
 *     type. The tenant keys it reads with are the same ones every booking
 *     row was stamped with at creation (16.1 `bookingBusinessId`).
 *   - Every read/mutation goes through `bookingManagement.ts`, which
 *     re-checks the permission AND row ownership inside the helper —
 *     hiding buttons here is only cosmetic.
 *   - Status machine: pending → confirm/cancel; confirmed/pay-at-salon →
 *     complete/cancel; terminal rows are read-only. Completing settles the
 *     remaining balance as collected at the salon (16.5 money snapshot).
 *   - Customer details render per the EXISTING permission model: the owner
 *     of the salon sees the customer snapshot their own booking rows carry
 *     (same data the 10.7 receipt already shows the salon).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarCheck,
  CalendarX,
  Check,
  Clock,
  CreditCard,
  Phone,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  User,
} from 'lucide-react';
import { formatCurrency } from '../lib/pricing';
import { useSiteLocale } from './SiteHeader';
import { bookingManagementText } from '../lib/bookingManagementI18n';
import {
  bookingActorCanManage,
  bookingManageDeniedKey,
  bookingMoney,
  bookingServiceNames,
  ownerAllowedTransitionsForRecord,
  ownerUpdateBookingStatus,
  readSalonBookings,
  sortBookingsForList,
} from '../lib/bookingManagement';
import type { BookingActorContext } from '../lib/bookingManagement';
import { formatMinutesLabel, PAYMENT_EVENT } from '../lib/siteBookingPayment';
import type { BookingStatus, PaymentRecord } from '../lib/siteBookingPayment';
import { injectedSectionStatus } from '../lib/siteStructure';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';

interface Props {
  /** Session-resolved actor (host screen runs the auth/ownership chain). */
  actor: BookingActorContext;
  /** Tenant of the owner's salon — session-resolved, never user-typed. */
  businessId: string;
  themeId: SiteHeaderThemeId;
  onShowToast?: (msg: string) => void;
}

type StatusFilter = 'all' | BookingStatus;

const FILTERS: StatusFilter[] = ['all', 'pending_payment', 'confirmed', 'completed', 'cancelled'];

export default function BookingManagementPanel({ actor, businessId, themeId, onShowToast }: Props) {
  const locale = useSiteLocale();
  const T = bookingManagementText(locale);

  const [version, setVersion] = useState(0);
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>('all');
  // PHASE 16.9 — cancellation asks for an inline confirmation first; the
  // booking row is untouched until the explicit confirm button runs.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(PAYMENT_EVENT, bump);
    return () => window.removeEventListener(PAYMENT_EVENT, bump);
  }, []);

  // Shared seam — loading / error forceable for tests + future async sources.
  const state: 'loading' | 'error' | 'ready' = useMemo(() => {
    const forced = injectedSectionStatus('booking');
    if (forced === 'loading' || forced === 'error') return forced;
    return 'ready';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry, version]);

  // The data-layer read re-checks the permission; a denied actor gets the
  // denial (never a foreign salon's rows, never a silent empty list).
  const readResult = useMemo(
    () => readSalonBookings(actor, businessId, themeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actor, businessId, themeId, version],
  );

  const records = useMemo(() => {
    if (!readResult.ok) return [];
    const sorted = sortBookingsForList(readResult.records);
    if (filter === 'all') return sorted;
    if (filter === 'confirmed') {
      return sorted.filter((r) => r.bookingStatus === 'confirmed' || r.bookingStatus === 'pay_at_salon');
    }
    return sorted.filter((r) => r.bookingStatus === filter);
  }, [readResult, filter]);

  const changeStatus = useCallback((record: PaymentRecord, next: BookingStatus) => {
    const result = ownerUpdateBookingStatus(actor, businessId, themeId, record.bookingId, next);
    onShowToast?.(
      result.ok
        ? (next === 'cancelled' ? T['owner.cancelled'] : T['owner.updated'])
        : T['owner.updateFailed'],
    );
    setConfirmingId(null);
    setVersion((v) => v + 1);
  }, [actor, businessId, themeId, onShowToast, T]);

  /* ---- denied ---- */
  if (!bookingActorCanManage(actor)) {
    const key = bookingManageDeniedKey(actor.permission);
    return (
      <div
        data-testid="booking-management-denied"
        className="bg-white rounded-2xl border border-gray-200 p-6 flex items-start gap-3"
      >
        <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-gray-600">
          {key ? T[key as keyof typeof T] : T['manage.denied.error']}
        </p>
      </div>
    );
  }

  const dateLabel = (dateKey: string) =>
    new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });

  const statusChipClass = (status: BookingStatus): string => {
    if (status === 'confirmed' || status === 'pay_at_salon') return 'bg-emerald-50 text-emerald-700';
    if (status === 'completed') return 'bg-blue-50 text-blue-700';
    if (status === 'pending_payment') return 'bg-amber-50 text-amber-700';
    return 'bg-gray-100 text-gray-500';
  };

  const filterLabel = (value: StatusFilter): string => {
    if (value === 'all') return T['owner.filter.all'];
    return T[`status.${value}` as keyof typeof T];
  };

  return (
    <div data-testid="booking-management" className="space-y-4">
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
        <h3 className="font-bold text-gray-900 text-sm">{T['owner.title']}</h3>
        <p className="text-xs text-gray-400">{T['owner.subtitle']}</p>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`booking-filter-${value}`}
              onClick={() => setFilter(value)}
              className={`text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                filter === value ? 'bg-[#ac0053] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {filterLabel(value)}
            </button>
          ))}
        </div>
      </div>

      {state === 'loading' && (
        <div data-testid="booking-management-loading" aria-busy="true" className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
          <p className="text-xs font-semibold text-gray-400">{T['owner.loading']}</p>
        </div>
      )}

      {state === 'error' && (
        <div data-testid="booking-management-error" className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-start gap-3">
          <p className="text-xs font-bold text-red-600">{T['owner.error']}</p>
          <button
            type="button"
            data-testid="booking-management-retry"
            onClick={() => setRetry((v) => v + 1)}
            className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 inline-flex items-center gap-1.5 hover:bg-gray-50"
          >
            <RefreshCw className="w-3 h-3" />
            {T['owner.retry']}
          </button>
        </div>
      )}

      {state === 'ready' && records.length === 0 && (
        <div data-testid="booking-management-empty" className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-xs font-bold text-gray-400">{T['owner.empty']}</p>
        </div>
      )}

      {state === 'ready' && records.map((record) => {
        const money = bookingMoney(record);
        const names = bookingServiceNames(record);
        const transitions = ownerAllowedTransitionsForRecord(record);
        const isTerminal = transitions.length === 0;
        return (
          <div
            key={record.id}
            data-testid={`owner-booking-${record.bookingId}`}
            data-status={record.bookingStatus}
            className={`bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-3 ${isTerminal ? 'opacity-75' : ''}`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold text-gray-400">
                {T['field.bookingId']}: <span className="text-gray-800">{record.bookingId}</span>
              </span>
              <span
                data-testid={`owner-booking-status-${record.bookingId}`}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase ${statusChipClass(record.bookingStatus)}`}
              >
                {T[`status.${record.bookingStatus}` as keyof typeof T]}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-semibold text-gray-600">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#ac0053] shrink-0" />
                <span className="truncate">{names.join(' + ')}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-[#ac0053] shrink-0" />
                {dateLabel(record.dateKey)}
                <Clock className="w-3 h-3 text-[#ac0053] shrink-0 ml-1" />
                {formatMinutesLabel(record.startMinutes, locale)} – {formatMinutesLabel(record.endMinutes, locale)}
              </span>
              <span className="flex items-center gap-1.5">
                <User className="w-3 h-3 text-[#ac0053] shrink-0" />
                {record.customer.name}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-[#ac0053] shrink-0" />
                {record.customer.mobile}
              </span>
            </div>

            <div className="border-t border-gray-100 pt-2 flex items-center gap-4 flex-wrap text-[11px] font-semibold text-gray-600">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3 h-3 text-[#ac0053]" />
                {T['field.total']}: <b className="text-gray-900">{formatCurrency(money.total)}</b>
              </span>
              <span>{T['field.advance']}: <b className="text-gray-900">{formatCurrency(money.advancePaid)}</b></span>
              <span>{T['field.remaining']}: <b className="text-gray-900">{formatCurrency(money.remaining)}</b></span>
              <span>
                {T['field.paymentStatus']}:{' '}
                <b className="text-gray-900">{T[`payment.${record.paymentStatus}` as keyof typeof T]}</b>
              </span>
            </div>

            {transitions.length > 0 && (
              <div className="flex gap-2 flex-wrap pt-1">
                {transitions.includes('confirmed') && (
                  <button
                    type="button"
                    data-testid={`owner-booking-confirm-${record.bookingId}`}
                    onClick={() => changeStatus(record, 'confirmed')}
                    className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5"
                  >
                    <Check className="w-3 h-3" />
                    {T['owner.confirm']}
                  </button>
                )}
                {transitions.includes('completed') && (
                  <button
                    type="button"
                    data-testid={`owner-booking-complete-${record.bookingId}`}
                    onClick={() => changeStatus(record, 'completed')}
                    className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
                  >
                    <CalendarCheck className="w-3 h-3" />
                    {T['owner.complete']}
                  </button>
                )}
                {transitions.includes('cancelled') && (
                  <button
                    type="button"
                    data-testid={`owner-booking-cancel-${record.bookingId}`}
                    aria-expanded={confirmingId === record.bookingId}
                    onClick={() => setConfirmingId((current) => (current === record.bookingId ? null : record.bookingId))}
                    className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"
                  >
                    <CalendarX className="w-3 h-3" />
                    {T['owner.cancel']}
                  </button>
                )}
              </div>
            )}

            {/* PHASE 16.9 — confirmation before the destructive
                owner-side cancellation; the row is untouched until
                the explicit confirm button runs. */}
            {confirmingId === record.bookingId && transitions.includes('cancelled') && (
              <div
                data-testid={`owner-booking-cancel-confirm-${record.bookingId}`}
                role="alertdialog"
                aria-label={T['owner.cancelConfirm']}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-2.5"
              >
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" aria-hidden />
                <span className="flex-1 min-w-[12rem] text-[10px] font-bold text-gray-700 leading-relaxed">
                  {T['owner.cancelConfirm']}
                </span>
                <button
                  type="button"
                  data-testid={`owner-booking-cancel-keep-${record.bookingId}`}
                  autoFocus
                  onClick={() => setConfirmingId(null)}
                  className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1.5"
                >
                  {T['owner.keepBooking']}
                </button>
                <button
                  type="button"
                  data-testid={`owner-booking-cancel-yes-${record.bookingId}`}
                  onClick={() => changeStatus(record, 'cancelled')}
                  className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 inline-flex items-center gap-1.5"
                >
                  <CalendarX className="w-3 h-3" />
                  {T['owner.cancel']}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
