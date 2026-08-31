/**
 * PHASE 16.7 & PHASE 3 — CUSTOMER "MY BOOKINGS" · public-site surface.
 *
 * Lists THIS customer's own real bookings from Supabase Auth / backend API:
 *   - business
 *   - service
 *   - date
 *   - time
 *   - total
 *   - 25% advance
 *   - remaining amount
 *   - booking status
 *   - payment status
 *
 * Strict multi-tenant security: Customer can only see their own bookings.
 * RLS enforces customer_id = auth.uid().
 */
import { useMemo, useState, useEffect } from 'react';
import { Calendar, CalendarX, Clock, CreditCard, MapPin, ReceiptText, RefreshCw, ShieldAlert, Sparkles, User, LogIn, UserPlus } from 'lucide-react';
import { formatDistanceKm } from '../lib/location';
import type { SalonData } from '../types';
import { formatCurrency } from '../lib/pricing';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { bookingSurfaces } from '../lib/siteBookingTheme';
import { bookingManagementText } from '../lib/bookingManagementI18n';
import {
  bookingMoney,
  bookingServiceNames,
  customerCanCancel,
  customerCancelBooking,
  readMyBookings,
  sortBookingsForList,
} from '../lib/bookingManagement';
import { formatMinutesLabel, PAYMENT_EVENT } from '../lib/siteBookingPayment';
import type { PaymentRecord, BookingStatus, PaymentStatus } from '../lib/siteBookingPayment';
import { injectedSectionStatus } from '../lib/siteStructure';
import { salonDisplayName } from '../lib/siteBooking';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import SiteBookingConfirmation from './SiteBookingConfirmation';
import { readBookingConfirmation } from '../lib/siteBookingConfirmation';
import type { BookingConfirmationView } from '../lib/siteBookingConfirmation';
import { bookingConfirmationText } from '../lib/siteBookingConfirmationI18n';
import type { BookingNoticeInput } from '../lib/siteBookingNotices';
import { useAuth } from '../lib/useAuth';
import { useAuthModalOptional } from './AuthModalProvider';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { fetchCustomerBookings, cancelCustomerBooking as apiCancelCustomerBooking, type CustomerBookingItem } from '../lib/authoritativeBooking';
import { publicSalonAuthContinuation } from '../lib/authRedirect';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  businessId: string;
  /** PHASE 16.9 — typed notices on the EXISTING toast seam. */
  onShowToast?: (input: BookingNoticeInput) => void;
}

export default function SiteMyBookings({ themeId, data, businessId, onShowToast }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const T = bookingManagementText(locale);
  const s = bookingSurfaces(themeId, appearance);
  const CT = bookingConfirmationText(locale);

  const { user } = useAuth();
  const { openAuth } = useAuthModalOptional();
  const openCustomerAuth = (mode: 'login' | 'signup') => openAuth(mode, {
    accountIntent: 'customer',
    returnTo: publicSalonAuthContinuation(data.websiteSlug),
  });

  const [version, setVersion] = useState(0);
  const [retry, setRetry] = useState(0);
  const [openReference, setOpenReference] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [remoteBookings, setRemoteBookings] = useState<CustomerBookingItem[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(PAYMENT_EVENT, bump);
    return () => window.removeEventListener(PAYMENT_EVENT, bump);
  }, []);

  // Fetch real customer bookings when user is authenticated with Supabase
  useEffect(() => {
    if (!isSupabaseConfigured || !user) {
      setRemoteBookings(null);
      setRemoteLoading(false);
      return;
    }

    let active = true;
    setRemoteLoading(true);
    setRemoteError(null);

    fetchCustomerBookings()
      .then((items) => {
        if (active) {
          setRemoteBookings(items);
          setRemoteLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load remote customer bookings:', err);
          setRemoteError(err instanceof Error ? err.message : 'Unable to load bookings.');
          setRemoteLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user, version, retry]);

  // Shared seam: loading / error forceable exactly like the other booking states.
  const forcedState = useMemo(() => {
    const forced = injectedSectionStatus('booking');
    if (forced === 'loading' || forced === 'error') return forced;
    return null;
  }, [retry, version]);

  // Local offline fallback bookings
  const localBookings = useMemo(
    () => sortBookingsForList(
      readMyBookings().filter((r) => r.businessId === businessId && r.themeId === themeId),
    ),
    [businessId, themeId, version],
  );

  // Normalized display records
  const displayRecords = useMemo(() => {
    if (remoteBookings !== null) {
      return remoteBookings.map((b) => {
        const startDate = new Date(b.appointmentStart);
        const startMin = startDate.getHours() * 60 + startDate.getMinutes();
        const endDate = new Date(b.appointmentEnd || (startDate.getTime() + 30 * 60000));
        const endMin = endDate.getHours() * 60 + endDate.getMinutes();

        return {
          id: b.id,
          bookingId: b.bookingId,
          businessName: b.businessName,
          serviceNames: b.serviceNames.length > 0 ? b.serviceNames : ['Salon Service'],
          dateKey: b.dateKey,
          startMinutes: startMin,
          endMinutes: endMin,
          total: b.totalAmount,
          advancePaid: b.advanceAmount,
          remaining: b.remainingAmount,
          bookingStatus: b.status as BookingStatus,
          paymentStatus: b.paymentStatus as PaymentStatus,
          isRemote: true,
          // HOME SERVICE — server-verified fulfillment facts.
          fulfillmentMode: b.fulfillmentMode || 'at_salon',
          serviceAddress: b.serviceAddress || null,
          serviceDistanceKm: b.serviceDistanceKm ?? null,
          homeServiceCharge: Math.round((b.homeServiceChargePaise || 0) / 100),
        };
      });
    }

    return localBookings.map((record) => {
      const money = bookingMoney(record);
      return {
        id: record.id,
        bookingId: record.bookingId,
        businessName: salonDisplayName(data, themeId),
        serviceNames: bookingServiceNames(record),
        dateKey: record.dateKey,
        startMinutes: record.startMinutes,
        endMinutes: record.endMinutes,
        total: money.total,
        advancePaid: money.advancePaid,
        remaining: money.remaining,
        bookingStatus: record.bookingStatus,
        paymentStatus: record.paymentStatus,
        isRemote: false,
        rawRecord: record,
        // HOME SERVICE — local sandbox fulfillment snapshot (optional).
        fulfillmentMode: record.fulfillment?.mode || 'at_salon',
        serviceAddress: record.fulfillment?.address || null,
        serviceDistanceKm: record.fulfillment?.distanceKm ?? null,
        homeServiceCharge: record.fulfillment?.homeServiceCharge || 0,
      };
    });
  }, [remoteBookings, localBookings, data, themeId]);

  const openSummary: BookingConfirmationView | null = useMemo(() => {
    if (!openReference) return null;
    const found = readBookingConfirmation(openReference, businessId, themeId);
    return found.ok ? found.view : null;
  }, [openReference, businessId, themeId, version]);

  const handleCancelBooking = async (record: { bookingId: string; isRemote: boolean; rawRecord?: PaymentRecord }) => {
    try {
      if (record.isRemote) {
        await apiCancelCustomerBooking(record.bookingId);
        onShowToast?.({ kind: 'warning', message: T['customer.cancelled'] });
      } else if (record.rawRecord) {
        const result = customerCancelBooking(businessId, themeId, record.bookingId);
        onShowToast?.(result.ok
          ? { kind: 'warning', message: T['customer.cancelled'] }
          : { kind: 'error', message: T['customer.cancelFailed'] });
      }
    } catch (err) {
      onShowToast?.({
        kind: 'error',
        message: err instanceof Error ? err.message : T['customer.cancelFailed'],
      });
    }
    setConfirmingId(null);
    setVersion((v) => v + 1);
  };

  const dateLabel = (dateKey: string) =>
    new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });

  const isLoading = forcedState === 'loading' || remoteLoading;
  const isError = forcedState === 'error' || Boolean(remoteError);

  if (!isLoading && !isError && displayRecords.length === 0 && !user) {
    return null;
  }

  return (
    <div
      data-testid="my-bookings"
      className="p-4 md:p-5 flex flex-col gap-3 border rounded-xl"
      style={{ backgroundColor: s.card, borderColor: s.line }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-extrabold" style={{ color: s.textStrong }}>{T['customer.title']}</h2>
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: s.muted }}>{T['customer.subtitle']}</p>
        </div>
        {user ? (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{ borderColor: s.chipLine, color: s.muted }}>
            {user.email}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="my-bookings-login-btn"
              onClick={() => openCustomerAuth('login')}
              className="text-[10px] font-bold px-2.5 py-1 rounded-md border inline-flex items-center gap-1"
              style={{ borderColor: s.accent, color: s.accent }}
            >
              <LogIn className="w-3 h-3" />
              {locale === 'hi' ? 'लॉग इन' : 'Log in'}
            </button>
            <button
              type="button"
              data-testid="my-bookings-signup-btn"
              onClick={() => openCustomerAuth('signup')}
              className="text-[10px] font-bold px-2.5 py-1 rounded-md border inline-flex items-center gap-1"
              style={{ borderColor: s.accent, color: s.accent }}
            >
              <UserPlus className="w-3 h-3" />
              {locale === 'hi' ? 'साइन अप' : 'Sign up'}
            </button>
          </div>
        )}
      </div>

      {isLoading && (
        <div data-testid="my-bookings-loading" aria-busy="true" className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-lg animate-pulse" style={{ backgroundColor: s.well }} />
          ))}
          <p className="text-xs font-semibold" style={{ color: s.muted }}>{T['customer.loading']}</p>
        </div>
      )}

      {isError && (
        <div data-testid="my-bookings-error" className="flex flex-col items-start gap-2">
          <p className="text-xs font-semibold" style={{ color: s.danger }}>{remoteError || T['customer.error']}</p>
          <button
            type="button"
            data-testid="my-bookings-retry"
            onClick={() => setRetry((v) => v + 1)}
            className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border rounded-lg cursor-pointer inline-flex items-center gap-1.5"
            style={{ borderColor: s.chipLine, color: s.text, backgroundColor: 'transparent' }}
          >
            <RefreshCw className="w-3 h-3" />
            {T['customer.retry']}
          </button>
        </div>
      )}

      {!isLoading && !isError && displayRecords.length === 0 && user && (
        <div className="py-6 text-center text-xs" style={{ color: s.muted }}>
          <p className="font-semibold">No bookings found for your account at this salon yet.</p>
        </div>
      )}

      {!isLoading && !isError && displayRecords.map((record) => {
        const statusKey = `status.${record.bookingStatus}` as keyof typeof T;
        const payKey = `payment.${record.paymentStatus}` as keyof typeof T;
        const isTerminal = record.bookingStatus === 'cancelled' || record.bookingStatus === 'failed';
        const canCancel = record.bookingStatus === 'pending' || record.bookingStatus === 'pending_payment' || record.bookingStatus === 'confirmed' || record.bookingStatus === 'pay_at_salon';

        return (
          <div
            key={record.id}
            data-testid={`my-booking-${record.bookingId}`}
            data-status={record.bookingStatus}
            className="border rounded-lg p-3 flex flex-col gap-2"
            style={{
              backgroundColor: isTerminal ? s.well : s.card,
              borderColor: isTerminal ? s.chipLine : s.line,
              opacity: isTerminal ? 0.75 : 1,
            }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold" style={{ color: s.muted }}>
                {T['field.bookingId']}: <span style={{ color: s.textStrong }}>{record.bookingId}</span>
              </span>
              <div className="flex items-center gap-2">
                <span
                  data-testid={`my-booking-status-${record.bookingId}`}
                  className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: record.bookingStatus === 'completed' || record.bookingStatus === 'confirmed' || record.bookingStatus === 'pay_at_salon'
                      ? s.successSoft
                      : isTerminal ? s.chip : s.accentSoft,
                    color: record.bookingStatus === 'completed' || record.bookingStatus === 'confirmed' || record.bookingStatus === 'pay_at_salon'
                      ? s.success
                      : isTerminal ? s.muted : s.accent,
                  }}
                >
                  {T[statusKey] || record.bookingStatus}
                </span>
                <span
                  data-testid={`my-booking-payment-${record.bookingId}`}
                  className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                  style={{ borderColor: s.chipLine, color: s.muted }}
                >
                  {T[payKey] || record.paymentStatus}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-xs font-semibold" style={{ color: s.text }}>
              <span className="flex items-center gap-1.5" data-testid={`my-booking-business-${record.bookingId}`}>
                <User className="w-3 h-3 shrink-0" style={{ color: s.accent }} />
                <b>{record.businessName}</b>
              </span>
              <span className="flex items-center gap-1.5" data-testid={`my-booking-service-${record.bookingId}`}>
                <Sparkles className="w-3 h-3 shrink-0" style={{ color: s.accent }} />
                {record.serviceNames.join(' + ')}
              </span>
              <span className="flex items-center gap-1.5" data-testid={`my-booking-datetime-${record.bookingId}`}>
                <Calendar className="w-3 h-3 shrink-0" style={{ color: s.accent }} />
                {dateLabel(record.dateKey)}
                <Clock className="w-3 h-3 shrink-0 ml-1" style={{ color: s.accent }} />
                {formatMinutesLabel(record.startMinutes, locale)} – {formatMinutesLabel(record.endMinutes, locale)}
              </span>
              {/* HOME SERVICE — mode + address + distance + charge. */}
              <span className="flex items-center gap-1.5 flex-wrap" data-testid={`my-booking-fulfillment-${record.bookingId}`}>
                <MapPin className="w-3 h-3 shrink-0" style={{ color: s.accent }} />
                <b style={{ color: s.textStrong }}>
                  {record.fulfillmentMode === 'home_service' ? 'Home Service' : 'At Salon'}
                </b>
                {record.fulfillmentMode === 'home_service' && record.serviceAddress && (
                  <span className="truncate max-w-[240px]">· {record.serviceAddress}</span>
                )}
                {record.fulfillmentMode === 'home_service' && record.serviceDistanceKm != null && (
                  <span>· {formatDistanceKm(record.serviceDistanceKm)}</span>
                )}
                {record.fulfillmentMode === 'home_service' && record.homeServiceCharge > 0 && (
                  <span>· +{formatCurrency(record.homeServiceCharge)}</span>
                )}
              </span>
              <span className="flex items-center gap-1.5 flex-wrap" data-testid={`my-booking-amounts-${record.bookingId}`}>
                <CreditCard className="w-3 h-3 shrink-0" style={{ color: s.accent }} />
                <span>{T['field.total']}: <b style={{ color: s.textStrong }}>{formatCurrency(record.total)}</b></span>
                <span>· {T['field.advance']}: <b style={{ color: s.textStrong }}>{formatCurrency(record.advancePaid)}</b></span>
                <span>· {T['field.remaining']}: <b style={{ color: s.textStrong }}>{formatCurrency(record.remaining)}</b></span>
                <span>· {T['field.paymentStatus']}: <b style={{ color: s.textStrong }}>{T[payKey] || record.paymentStatus}</b></span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid={`my-booking-summary-${record.bookingId}`}
                aria-expanded={openReference === record.bookingId}
                onClick={() => setOpenReference((current) => (current === record.bookingId ? null : record.bookingId))}
                className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                style={{ borderColor: s.accent, color: s.accent, backgroundColor: 'transparent' }}
              >
                <ReceiptText className="w-3 h-3" />
                {openReference === record.bookingId ? CT['action.hideReceipt'] : CT['history.open']}
              </button>

              {canCancel && !isTerminal && (
                <button
                  type="button"
                  data-testid={`my-booking-cancel-${record.bookingId}`}
                  aria-expanded={confirmingId === record.bookingId}
                  onClick={() => setConfirmingId((current) => (current === record.bookingId ? null : record.bookingId))}
                  className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                  style={{ borderColor: s.danger, color: s.danger, backgroundColor: 'transparent' }}
                >
                  <CalendarX className="w-3 h-3" />
                  {T['customer.cancel']}
                </button>
              )}

              {confirmingId === record.bookingId && canCancel && (
                <div
                  data-testid={`my-booking-cancel-confirm-${record.bookingId}`}
                  role="alertdialog"
                  aria-label={T['customer.cancelConfirm']}
                  className="flex flex-wrap items-center gap-2 border rounded-lg p-2.5"
                  style={{ backgroundColor: s.card, borderColor: s.danger }}
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: s.danger }} aria-hidden />
                  <span className="flex-1 min-w-[12rem] text-[10px] font-bold leading-relaxed" style={{ color: s.text }}>
                    {T['customer.cancelConfirm']}
                  </span>
                  <button
                    type="button"
                    data-testid={`my-booking-cancel-keep-${record.bookingId}`}
                    autoFocus
                    onClick={() => setConfirmingId(null)}
                    className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                    style={{ borderColor: s.accent, color: s.accent, backgroundColor: 'transparent' }}
                  >
                    {T['customer.keepBooking']}
                  </button>
                  <button
                    type="button"
                    data-testid={`my-booking-cancel-yes-${record.bookingId}`}
                    onClick={() => void handleCancelBooking(record)}
                    className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 border rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                    style={{ borderColor: s.danger, color: '#ffffff', backgroundColor: s.danger }}
                  >
                    <CalendarX className="w-3 h-3" />
                    {T['customer.cancel']}
                  </button>
                </div>
              )}
            </div>

            {openReference === record.bookingId && openSummary && (
              <div data-testid={`my-booking-summary-panel-${record.bookingId}`} className="pt-1">
                <SiteBookingConfirmation
                  themeId={themeId}
                  data={data}
                  view={openSummary}
                  variant="history"
                  onShowToast={onShowToast}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
