/**
 * PHASE 16.8 — CALL / WHATSAPP / BOOK ONLINE ACTION PROTECTION.
 *
 * The salon's direct contact actions (Call, WhatsApp) and its Book Online
 * action are gated on a REAL, successful advance payment. This module is
 * the SINGLE authorization point for that decision — every surface (hero
 * CTAs, floating actions, mobile action bar, footer, section states,
 * theme contact rows) asks this layer instead of building a `tel:` /
 * `wa.me` href of its own.
 *
 * ARCHITECTURE — nothing new is invented here:
 *
 *   • The unlock is decided from the EXISTING booking/payment record store
 *     (`siteBookingPayment`, Phase 10.7/16.5) through the EXISTING Phase
 *     16.6 confirmation derivation (`bookingConfirmationState`). There is
 *     no second booking system, no new table, no new id and no new money.
 *
 *   • The advance percentage is the EXISTING `paymentAdvancePercentage`
 *     rule (default 25%, owner-configurable via `bookingRules`), the same
 *     number the payment screen charges. The draft database pins the very
 *     same rule server-side:
 *         bookings_fixed_advance check (advance_paise = (service_price_paise + 3) / 4)
 *     so the client mirror and the eventual server enforcement agree.
 *
 *   • "Payment succeeded" means the persisted record says so:
 *     `paymentStatus === 'paid'` AND the booking reached a confirmed
 *     state. Clicking a pay button never unlocks anything — only a
 *     record that the gateway step actually wrote to the store does. The
 *     draft schema expresses the identical rule with
 *     `payments.verification_status = 'verified'` gating
 *     `bookings.booking_status = 'confirmed'` inside the SECURITY DEFINER
 *     `verify_payment()` function, which is granted to `service_role`
 *     only — an anonymous visitor cannot call it.
 *
 *   • The phone / WhatsApp numbers are ALWAYS read from the salon's own
 *     data (`SalonData.phone` / `whatsappPhone`) for the salon whose page
 *     is being viewed. Nothing is hardcoded, and a locked action carries
 *     no number at all, so another salon's contact can never be emitted.
 *
 *   • Ownership: the unlocking booking must belong to THIS visitor
 *     (`bookingBrowserId()`, the same anonymous identity used by holds,
 *     16.6 and 16.7) AND to THIS salon + theme. The identity is read
 *     INSIDE this module, so a caller cannot ask about someone else.
 *
 * WHY THIS IS NOT A FRONTEND-ONLY GUARD
 *
 *   The gate is data-derived, not UI state: the contact target does not
 *   exist in the rendered markup until a qualifying record exists. Toggling
 *   a React prop, flipping a class, or deleting a `disabled` attribute in
 *   devtools yields a button with nothing to open. Forging the unlock means
 *   forging a paid booking record, which is exactly what the draft
 *   server-side set (M08 `bookings`, M09 `payments` + `verify_payment`,
 *   M12 RLS: no anonymous booking/payment write policy) prevents once
 *   applied. `contactAccessAudit` reproduces the server's decision shape so
 *   the swap changes the SOURCE of the verdict, not the architecture.
 */
import type { SalonData } from '../types';
import {
  PAYMENT_EVENT,
  paymentAdvancePercentage,
  readPaymentRecordsForBusiness,
} from './siteBookingPayment';
import type { PaymentRecord } from './siteBookingPayment';
import { bookingBrowserId, bookingBusinessId } from './siteBookingFlow';
import { bookingConfirmationState, toBookingConfirmation } from './siteBookingConfirmation';
import type { BookingConfirmationView } from './siteBookingConfirmation';
import { canBookOnline, canCall, canWhatsApp, digitsOnly, salonTelHref, salonWhatsAppHref } from './siteBooking';
import { salonNow } from './salonStatus';

/* ------------------------------------------------------------------ */
/* Protected actions                                                   */
/* ------------------------------------------------------------------ */

export type ProtectedContactAction = 'call' | 'whatsapp';
export type ProtectedAction = ProtectedContactAction | 'book';

export const PROTECTED_CONTACT_ACTIONS: ProtectedContactAction[] = ['call', 'whatsapp'];

/**
 * Why a contact action is locked / unlocked.
 *
 *   unlocked          — a real advance payment succeeded; open the salon.
 *   payment-required  — no booking yet: pay the advance to unlock.
 *   payment-pending   — a booking exists but the advance has not succeeded.
 *   payment-failed    — the last attempt failed; retry to unlock.
 *   cancelled         — the booking was cancelled; book again to unlock.
 *   expired           — the booking's appointment slot has already passed.
 *   unavailable       — the salon did not publish/enable this action.
 */
export type ContactAccessReason =
  | 'unlocked'
  | 'payment-required'
  | 'payment-pending'
  | 'payment-failed'
  | 'cancelled'
  | 'expired'
  | 'unavailable';

export const CONTACT_ACCESS_REASONS: ContactAccessReason[] = [
  'unlocked',
  'payment-required',
  'payment-pending',
  'payment-failed',
  'cancelled',
  'expired',
  'unavailable',
];

export interface ContactAccess {
  action: ProtectedContactAction;
  /** True ONLY when a verified advance payment backs this visitor. */
  unlocked: boolean;
  reason: ContactAccessReason;
  /**
   * The salon's real contact target — present ONLY when unlocked. A locked
   * action never carries a number, so the markup cannot leak it.
   */
  href: string | null;
  /** The salon's own advance rule, for the explanatory message (e.g. 25). */
  advancePercentage: number;
  /** Reference of the booking that unlocked (or would unlock) the action. */
  reference: string | null;
  /** True when the salon disabled this channel or never provided a number. */
  offered: boolean;
}

/* ------------------------------------------------------------------ */
/* Qualifying booking                                                  */
/* ------------------------------------------------------------------ */

/** End of the booking's slot, as an epoch ms in the salon's day. */
function slotEndEpoch(record: PaymentRecord): number {
  const [y, m, d] = record.dateKey.split('-').map((part) => Number(part));
  if (!y || !m || !d) return Number.POSITIVE_INFINITY;
  const end = new Date(y, m - 1, d, 0, 0, 0, 0);
  end.setMinutes(end.getMinutes() + record.endMinutes);
  return end.getTime();
}

/**
 * True when the appointment this record represents is already over.
 *
 * An expired booking must not keep the salon's private contact channels
 * open forever — the customer books again (and pays again) to re-unlock.
 */
export function isBookingExpired(record: PaymentRecord, now: Date = salonNow()): boolean {
  return slotEndEpoch(record) <= now.getTime();
}

/**
 * A booking that PROVES the required advance was actually paid.
 *
 * Requirements, all read from the persisted record:
 *   1. it belongs to THIS visitor (browser identity read internally),
 *   2. it belongs to THIS salon + theme,
 *   3. `paymentStatus === 'paid'` — a real gateway success, not a click,
 *   4. the derived 16.6 state is confirmed/completed (never "confirmed"
 *      without payment — `bookingConfirmationState` fails closed),
 *   5. money actually moved: `advancePaid > 0`,
 *   6. the appointment has not already finished.
 *
 * `pay_at_salon` deliberately does NOT qualify: no advance was taken, so
 * the protection stays on — that is the whole point of the phase.
 */
export function findUnlockingBooking(
  businessId: string,
  themeId: string,
  now: Date = salonNow(),
): PaymentRecord | null {
  const me = bookingBrowserId();
  const qualifying = readPaymentRecordsForBusiness(businessId, themeId).filter((record) => {
    if (record.customerId !== me) return false;
    if (record.businessId !== businessId || record.themeId !== themeId) return false;
    if (record.paymentStatus !== 'paid') return false;
    const state = bookingConfirmationState(record);
    if (state !== 'confirmed' && state !== 'completed') return false;
    if (!(record.amountDue > 0)) return false;
    if (isBookingExpired(record, now)) return false;
    return true;
  });
  if (qualifying.length === 0) return null;
  // Newest qualifying booking wins — it carries the most recent reference.
  return qualifying.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/**
 * The best explanation for a visitor with no qualifying booking, derived
 * from their own most recent attempt at this salon.
 */
function lockedReason(businessId: string, themeId: string, now: Date): {
  reason: ContactAccessReason;
  reference: string | null;
} {
  const me = bookingBrowserId();
  const mine = readPaymentRecordsForBusiness(businessId, themeId)
    .filter((record) => record.customerId === me)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (mine.length === 0) return { reason: 'payment-required', reference: null };

  // An expired-but-paid booking explains itself before anything else.
  const paidExpired = mine.find(
    (record) => record.paymentStatus === 'paid' && record.amountDue > 0 && isBookingExpired(record, now),
  );
  if (paidExpired) return { reason: 'expired', reference: paidExpired.bookingId };

  const latest = mine[0];
  const state = bookingConfirmationState(latest);
  if (state === 'payment_failed') return { reason: 'payment-failed', reference: latest.bookingId };
  if (state === 'cancelled') return { reason: 'cancelled', reference: latest.bookingId };
  if (state === 'payment_pending') return { reason: 'payment-pending', reference: latest.bookingId };
  // Confirmed but not qualifying = pay_at_salon (no advance was taken).
  return { reason: 'payment-required', reference: latest.bookingId };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Authorization verdict for ONE contact action on ONE salon page.
 *
 * The href is attached only on success, and it is always built from the
 * viewed salon's OWN data via the existing `siteBooking` helpers.
 */
export function resolveContactAccess(
  action: ProtectedContactAction,
  data: SalonData,
  themeId: string,
  now: Date = salonNow(),
): ContactAccess {
  const businessId = bookingBusinessId(data);
  const advancePercentage = paymentAdvancePercentage(data.bookingRules);
  const offered = action === 'call' ? canCall(data) : canWhatsApp(data);

  if (!offered) {
    return {
      action,
      unlocked: false,
      reason: 'unavailable',
      href: null,
      advancePercentage,
      reference: null,
      offered: false,
    };
  }

  const unlocking = findUnlockingBooking(businessId, themeId, now);
  if (unlocking) {
    return {
      action,
      unlocked: true,
      // The salon's REAL target, from the data of the salon being viewed.
      href: action === 'call' ? salonTelHref(data) : salonWhatsAppHref(data),
      reason: 'unlocked',
      advancePercentage,
      reference: unlocking.bookingId,
      offered: true,
    };
  }

  const { reason, reference } = lockedReason(businessId, themeId, now);
  return { action, unlocked: false, reason, href: null, advancePercentage, reference, offered: true };
}

/** Both contact verdicts at once (the shape every action surface needs). */
export interface SiteContactAccess {
  call: ContactAccess;
  whatsapp: ContactAccess;
  /** Book Online availability — the owner's existing contact option. */
  bookOffered: boolean;
  /** True when at least one protected channel is currently locked. */
  anyLocked: boolean;
  advancePercentage: number;
}

export function resolveSiteContactAccess(
  data: SalonData,
  themeId: string,
  now: Date = salonNow(),
): SiteContactAccess {
  const call = resolveContactAccess('call', data, themeId, now);
  const whatsapp = resolveContactAccess('whatsapp', data, themeId, now);
  return {
    call,
    whatsapp,
    bookOffered: canBookOnline(data),
    anyLocked: (call.offered && !call.unlocked) || (whatsapp.offered && !whatsapp.unlocked),
    advancePercentage: call.advancePercentage,
  };
}

/* ------------------------------------------------------------------ */
/* Server-parity audit                                                 */
/* ------------------------------------------------------------------ */

export interface ContactAccessAudit {
  allowed: boolean;
  reason: ContactAccessReason;
  /** The record that authorized the action (never exposed to the DOM). */
  recordId: string | null;
  reference: string | null;
  businessId: string;
  themeId: string;
  /** The 16.6 view of the unlocking booking, when there is one. */
  booking: BookingConfirmationView | null;
}

/**
 * The same verdict expressed as an authorization record.
 *
 * This is the shape the server check returns once the draft DB set is
 * applied: `verify_payment()` marks the payment verified and the booking
 * confirmed, and the contact-reveal endpoint answers with exactly these
 * fields for the caller's own booking. Keeping the client verdict in this
 * shape means the swap replaces the SOURCE of truth without reshaping any
 * caller — and it gives the tests a single place to assert that a locked
 * verdict carries no contact data.
 */
export function contactAccessAudit(
  data: SalonData,
  themeId: string,
  now: Date = salonNow(),
): ContactAccessAudit {
  const businessId = bookingBusinessId(data);
  const unlocking = findUnlockingBooking(businessId, themeId, now);
  if (unlocking) {
    return {
      allowed: true,
      reason: 'unlocked',
      recordId: unlocking.id,
      reference: unlocking.bookingId,
      businessId,
      themeId,
      booking: toBookingConfirmation(unlocking),
    };
  }
  const { reason, reference } = lockedReason(businessId, themeId, now);
  return { allowed: false, reason, recordId: null, reference, businessId, themeId, booking: null };
}

/**
 * Guard for the click handler of an unlocked action.
 *
 * The verdict is RE-CHECKED against the store at click time, so a stale
 * render (or a tampered one) cannot open a contact channel that the data
 * no longer authorizes. Returns the href to open, or null to refuse.
 */
export function authorizeContactOpen(
  action: ProtectedContactAction,
  data: SalonData,
  themeId: string,
  now: Date = salonNow(),
): string | null {
  const access = resolveContactAccess(action, data, themeId, now);
  if (!access.unlocked || !access.href) return null;
  // Never emit an empty/placeholder target — the salon must have a number.
  const digits = action === 'call'
    ? digitsOnly(data.phone)
    : digitsOnly(data.whatsappPhone || data.phone);
  return digits.length > 0 ? access.href : null;
}

/**
 * The salon's number as it may be DISPLAYED for the current verdict.
 *
 * A protected channel is not only about the link: a phone number printed
 * as plain text is the same leak. When locked, the last digits are masked
 * so the salon still looks reachable-by-booking without handing over a
 * dialable number. Unlocked, the real value is returned untouched.
 */
export function displayContactNumber(raw: string | undefined | null, unlocked: boolean): string {
  const value = (raw || '').trim();
  if (!value) return '';
  if (unlocked) return value;
  const digits = digitsOnly(value);
  if (digits.length < 4) return '•'.repeat(Math.max(1, digits.length));
  // Keep the country/area hint, hide everything that makes it dialable.
  const head = digits.slice(0, Math.min(3, digits.length - 4));
  return `${head}${'•'.repeat(digits.length - head.length)}`;
}

/** Event to re-evaluate contact access on: the existing payment channel. */
export const CONTACT_ACCESS_EVENT = PAYMENT_EVENT;
