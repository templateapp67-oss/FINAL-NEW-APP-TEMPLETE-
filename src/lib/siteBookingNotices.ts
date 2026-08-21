/**
 * PHASE 16.9 — BOOKING NOTIFICATIONS & UX · notice model.
 *
 * The booking flow's notification architecture is the EXISTING
 * `onShowToast` seam every booking surface (entry flow, payment flow,
 * confirmation, my-bookings) already carries. This module only upgrades
 * the payload carried on that seam from a plain string to a typed notice
 * (`kind` + `message`) so one presenter can colour-code the feedback:
 *
 *   - success  — booking confirmed / payment succeeded
 *   - warning  — booking or payment cancelled
 *   - error    — payment failed / slot lost / action refused
 *   - info     — processing, resume and duplicate-protection hints
 *
 * Plain strings stay fully supported (normalized to `info`), so every
 * pre-16.9 call site and every earlier-phase test harness keeps working
 * byte-identically. No new notification bus, event or store is invented —
 * notices still travel through the existing component props.
 */

export type BookingNoticeKind = 'success' | 'warning' | 'error' | 'info';

export interface BookingNotice {
  kind: BookingNoticeKind;
  message: string;
}

/** What the existing `onShowToast` seam now accepts. */
export type BookingNoticeInput = string | BookingNotice;

export type BookingNoticeSink = (input: BookingNoticeInput) => void;

/** Builds a typed notice. */
export function makeNotice(kind: BookingNoticeKind, message: string): BookingNotice {
  return { kind, message };
}

/** Normalizes the seam payload (legacy strings become `info` notices). */
export function normalizeNotice(input: BookingNoticeInput): BookingNotice {
  if (typeof input === 'string') return { kind: 'info', message: input };
  return { kind: input.kind, message: input.message };
}

/** Extracts the message from any seam payload (used by string-only sinks). */
export function noticeMessage(input: BookingNoticeInput): string {
  return normalizeNotice(input).message;
}

/* ------------------------------------------------------------------ */
/* Auto-dismiss duration (overridable for tests only)                  */
/* ------------------------------------------------------------------ */

export const BOOKING_NOTICE_DURATION_MS = 6500;

let noticeDurationOverride: number | null = null;

/** Test-only override for the auto-dismiss timer. */
export function setBookingNoticeDurationForTests(ms: number | null): void {
  noticeDurationOverride = ms;
}

export function bookingNoticeDurationMs(): number {
  return noticeDurationOverride ?? BOOKING_NOTICE_DURATION_MS;
}

/** Unique id for a rendered notice. */
export function newBookingNoticeId(): string {
  return `not-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
