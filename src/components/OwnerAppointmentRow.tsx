/**
 * PHASE 17.3 — the SHARED owner-dashboard appointment row.
 *
 * Extracted from the Phase 17.2 Today list so the Today (17.2) and Upcoming
 * (17.3) sections render appointments through ONE component instead of two
 * drifting copies. Phase 17.4 adds the same guarded owner status controls to
 * both sections here.
 *
 * It renders values that were READ from a persisted booking record — it never
 * computes, defaults or invents a business fact.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Calendar, Clock, CreditCard, Phone, Sparkles, User, Users } from 'lucide-react';
import type { TodayAppointment, TodayStatusGroup } from '../lib/ownerTodayAppointments';
import { formatDurationLabel, hasAdvancePaid, hasRemainingBalance } from '../lib/ownerTodayAppointments';
import { formatMinutesLabel } from '../lib/siteBookingPayment';
import { formatCurrency } from '../lib/pricing';
import type { AppLocale } from '../lib/locale';
import type { BookingActorContext } from '../lib/bookingManagement';
import OwnerBookingStatusControls from './OwnerBookingStatusControls';

export interface AppointmentPalette {
  panel: string;
  panelSoft: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  accentText: string;
}

/** Status chip colours — one per EXISTING status group, readable in both modes. */
export function statusChipStyle(
  group: TodayStatusGroup,
  palette: AppointmentPalette,
): CSSProperties {
  switch (group) {
    case 'confirmed':
      return { backgroundColor: 'rgba(16,185,129,0.14)', color: '#0f9b6c' };
    case 'completed':
      return { backgroundColor: 'rgba(59,130,246,0.14)', color: '#3b82f6' };
    case 'pending':
      return { backgroundColor: 'rgba(245,158,11,0.16)', color: '#d08700' };
    case 'cancelled':
    default:
      return { backgroundColor: palette.panelSoft, color: palette.muted };
  }
}

export function Field({
  icon,
  label,
  children,
  palette,
  testId,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  palette: AppointmentPalette;
  testId?: string;
}) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <span
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: palette.muted }}
      >
        {icon}
        {label}
      </span>
      <span className="mt-0.5 block truncate text-xs font-extrabold" style={{ color: palette.text }}>
        {children}
      </span>
    </div>
  );
}

interface Props {
  row: TodayAppointment;
  /** Session-resolved owner actor; mutations re-check it in the data layer. */
  actor: BookingActorContext;
  palette: AppointmentPalette;
  locale: AppLocale;
  t: (key: string) => string;
  /** `today` (17.2) or `upcoming` (17.3) — keeps each section's test ids. */
  testIdPrefix: string;
  /** i18n namespace for the field labels ('today' — one shared copy table). */
  copyPrefix?: string;
  /** Optional date line, shown by sections that span more than one day. */
  dateLabel?: string;
}

export default function OwnerAppointmentRow({
  row,
  actor,
  palette,
  locale,
  t,
  testIdPrefix,
  copyPrefix = 'today',
  dateLabel,
}: Props) {
  return (
    <article
      data-testid={`${testIdPrefix}-appointment-${row.bookingId}`}
      data-status={row.status}
      data-status-group={row.statusGroup}
      data-start={row.startMinutes}
      data-date={row.dateKey}
      className="space-y-3 rounded-2xl border p-4"
      style={{
        backgroundColor: palette.panel,
        borderColor: palette.line,
        opacity: row.cancelled ? 0.7 : 1,
      }}
    >
      {/* time + status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="flex items-center gap-1.5 text-sm font-extrabold"
          style={{ color: palette.text }}
          data-testid={`${testIdPrefix}-time-${row.bookingId}`}
        >
          <Clock className="h-4 w-4" style={{ color: palette.accent }} />
          <span style={row.cancelled ? { textDecoration: 'line-through' } : undefined}>
            {formatMinutesLabel(row.startMinutes, locale)} – {formatMinutesLabel(row.endMinutes, locale)}
          </span>
        </span>
        <span
          data-testid={`${testIdPrefix}-status-${row.bookingId}`}
          className="rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
          style={statusChipStyle(row.statusGroup, palette)}
        >
          {t(`${copyPrefix}.status.${row.status}`)}
        </span>
      </div>

      {/* details grid — 1 col mobile, 2 tablet, 4 desktop */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          palette={palette}
          testId={`${testIdPrefix}-customer-${row.bookingId}`}
          icon={<User className="h-3 w-3" />}
          label={t(`${copyPrefix}.field.customer`)}
        >
          {row.customerName || t(`${copyPrefix}.noCustomerName`)}
        </Field>
        <Field
          palette={palette}
          testId={`${testIdPrefix}-services-${row.bookingId}`}
          icon={<Sparkles className="h-3 w-3" />}
          label={t(`${copyPrefix}.field.services`)}
        >
          {row.serviceNames.join(' + ')}
        </Field>
        {dateLabel ? (
          <Field
            palette={palette}
            testId={`${testIdPrefix}-date-${row.bookingId}`}
            icon={<Calendar className="h-3 w-3" />}
            label={t('upcoming.field.date')}
          >
            {dateLabel}
          </Field>
        ) : null}
        <Field
          palette={palette}
          testId={`${testIdPrefix}-duration-${row.bookingId}`}
          icon={<Clock className="h-3 w-3" />}
          label={t(`${copyPrefix}.field.duration`)}
        >
          {formatDurationLabel(
            row.durationMinutes,
            t(`${copyPrefix}.unit.hour`),
            t(`${copyPrefix}.unit.minute`),
          )}
        </Field>
        <Field
          palette={palette}
          testId={`${testIdPrefix}-payment-${row.bookingId}`}
          icon={<CreditCard className="h-3 w-3" />}
          label={t(`${copyPrefix}.field.paymentStatus`)}
        >
          {t(`${copyPrefix}.payment.${row.paymentStatus}`)}
        </Field>
      </div>

      {/* money + contact */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2 text-[11px] font-semibold"
        style={{ borderColor: palette.line, color: palette.muted }}
      >
        <span data-testid={`${testIdPrefix}-total-${row.bookingId}`}>
          {t(`${copyPrefix}.field.total`)}:{' '}
          <b style={{ color: palette.text }}>{formatCurrency(row.total)}</b>
        </span>
        {hasAdvancePaid(row) && (
          <span data-testid={`${testIdPrefix}-advance-${row.bookingId}`}>
            {t(`${copyPrefix}.field.advance`)}:{' '}
            <b style={{ color: palette.text }}>{formatCurrency(row.advancePaid)}</b>
          </span>
        )}
        {hasRemainingBalance(row) && (
          <span data-testid={`${testIdPrefix}-remaining-${row.bookingId}`}>
            {t(`${copyPrefix}.field.remaining`)}:{' '}
            <b style={{ color: palette.text }}>{formatCurrency(row.remaining)}</b>
          </span>
        )}
        {row.customerMobile && (
          <span className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" style={{ color: palette.accent }} />
            {row.customerMobile}
          </span>
        )}
        {row.staffName && (
          <span className="flex items-center gap-1.5" data-testid={`${testIdPrefix}-staff-${row.bookingId}`}>
            <Users className="h-3 w-3" style={{ color: palette.accent }} />
            {row.staffName}
          </span>
        )}
        <span className="ms-auto">
          {t(`${copyPrefix}.field.bookingId`)}:{' '}
          <b style={{ color: palette.text }}>{row.bookingId}</b>
        </span>
      </div>

      {row.cancelled && (
        <p
          data-testid={`${testIdPrefix}-cancelled-note-${row.bookingId}`}
          className="text-[11px] font-bold"
          style={{ color: palette.muted }}
        >
          {t(`${copyPrefix}.cancelledNote`)}
        </p>
      )}

      <OwnerBookingStatusControls
        actor={actor}
        row={row}
        palette={palette}
        t={t}
        testIdPrefix={testIdPrefix}
      />
    </article>
  );
}
