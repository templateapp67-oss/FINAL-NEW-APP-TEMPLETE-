/**
 * PHASE 10.8 — REVIEWS & RATINGS · single engine for all five themes.
 *
 * Customer reviews live in a local, tenant-scoped store (same pattern as
 * Phase 10.7 payment records). No database schema is added. Reviews never
 * invent names, quotes or ratings — the public list is only what a visitor
 * actually submitted after an eligible booking.
 *
 *   - Eligibility : confirmed / pay-at-salon booking on this business +
 *                   theme, appointment date today or earlier.
 *   - Form        : rating (1–5) + review body + customer name.
 *   - Moderation  : new rows start as `pending` and stay off the public
 *                   list until approved.
 *   - Duplicates  : one review per booking id (pending or approved).
 *   - Spam        : length, repeated-character, identical-body and
 *                   per-browser rate limits.
 *   - Isolation   : every row carries businessId + themeId; a theme can
 *                   never read another theme's reviews.
 */
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import { bookingBrowserId } from './siteBookingFlow';
import { localDateKey, salonNow } from './salonStatus';
import {
  PAYMENT_EVENT,
  readPaymentRecordsForBusiness,
  type PaymentRecord,
} from './siteBookingPayment';

export const REVIEW_STORE_KEY = 'nexora_site_reviews';
export const REVIEW_EVENT = 'nexora:site-reviews';
export const REVIEW_STORE_VERSION = 1;

export const REVIEW_MIN_BODY = 12;
export const REVIEW_MAX_BODY = 800;
export const REVIEW_MIN_NAME = 2;
export const REVIEW_RATE_WINDOW_MS = 10 * 60_000;
export const REVIEW_RATE_MAX = 3;

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type ReviewSubmitError =
  | 'invalid-rating'
  | 'invalid-name'
  | 'invalid-body'
  | 'spam'
  | 'rate-limited'
  | 'no-eligible-booking'
  | 'duplicate';

export interface CustomerReview {
  id: string;
  businessId: string;
  themeId: SiteHeaderThemeId;
  bookingId: string;
  customerId: string;
  customerName: string;
  rating: number;
  body: string;
  serviceName?: string;
  status: ReviewStatus;
  createdAt: number;
  updatedAt: number;
  fingerprint: string;
}

export interface ReviewAttempt {
  browserId: string;
  businessId: string;
  themeId: string;
  at: number;
}

export interface PersistedReviewStore {
  version: number;
  reviews: CustomerReview[];
  attempts: ReviewAttempt[];
}

export interface RatingSummary {
  average: number;
  count: number;
}

export interface SubmitReviewInput {
  businessId: string;
  themeId: SiteHeaderThemeId;
  customerName: string;
  rating: number;
  body: string;
  now?: Date;
}

export interface SubmitReviewResult {
  ok: boolean;
  review?: CustomerReview;
  error?: ReviewSubmitError;
}

const FALLBACK_BUSINESS_ID = 'public-site';

let injectedStore: PersistedReviewStore | null = null;

function emptyStore(): PersistedReviewStore {
  return { version: REVIEW_STORE_VERSION, reviews: [], attempts: [] };
}

function readStore(): PersistedReviewStore {
  if (typeof window === 'undefined') return emptyStore();
  try {
    const raw = window.localStorage.getItem(REVIEW_STORE_KEY);
    if (!raw) return emptyStore();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed || typeof parsed !== 'object'
      || (parsed as PersistedReviewStore).version !== REVIEW_STORE_VERSION
      || !Array.isArray((parsed as PersistedReviewStore).reviews)
    ) {
      return emptyStore();
    }
    const store = parsed as PersistedReviewStore;
    return {
      version: REVIEW_STORE_VERSION,
      reviews: store.reviews,
      attempts: Array.isArray(store.attempts) ? store.attempts : [],
    };
  } catch {
    return emptyStore();
  }
}

function emitEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(REVIEW_EVENT));
  }
}

function writeStore(store: PersistedReviewStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REVIEW_STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable */
  }
  emitEvent();
}

function effectiveStore(): PersistedReviewStore {
  if (injectedStore) return injectedStore;
  return readStore();
}

function effectiveWrite(store: PersistedReviewStore): void {
  if (injectedStore) {
    injectedStore = {
      version: REVIEW_STORE_VERSION,
      reviews: store.reviews.slice(),
      attempts: store.attempts.slice(),
    };
    emitEvent();
    return;
  }
  writeStore(store);
}

export function setReviewStoreForTests(store: PersistedReviewStore | null): void {
  injectedStore = store
    ? { version: REVIEW_STORE_VERSION, reviews: store.reviews.slice(), attempts: (store.attempts || []).slice() }
    : null;
}

export function readReviewStoreForTests(): PersistedReviewStore {
  return effectiveStore();
}

export function reviewBusinessId(data: SalonData): string {
  const fromService = (data.services || []).find((service) => service.businessId)?.businessId;
  if (fromService) return fromService;
  const extra = (data as SalonData & { businessId?: string }).businessId;
  return extra || FALLBACK_BUSINESS_ID;
}

export function normalizeReviewerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function reviewFingerprint(businessId: string, themeId: string, bookingId: string): string {
  return `${businessId}|${themeId}|${bookingId}`;
}

export function isBookingEligibleForReview(record: PaymentRecord, now: Date = salonNow()): boolean {
  if (record.bookingStatus !== 'confirmed' && record.bookingStatus !== 'pay_at_salon') return false;
  return record.dateKey <= localDateKey(now);
}

export function eligibleBookingsForReview(
  businessId: string,
  themeId: string,
  now: Date = salonNow(),
): PaymentRecord[] {
  return readPaymentRecordsForBusiness(businessId, themeId).filter((record) => isBookingEligibleForReview(record, now));
}

export function readReviews(): CustomerReview[] {
  return effectiveStore().reviews.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function readReviewsForTheme(businessId: string, themeId: string): CustomerReview[] {
  return readReviews().filter((review) => review.businessId === businessId && review.themeId === themeId);
}

export function publicReviews(businessId: string, themeId: string): CustomerReview[] {
  return readReviewsForTheme(businessId, themeId).filter((review) => review.status === 'approved');
}

export function visitorReviews(businessId: string, themeId: string, browserId = bookingBrowserId()): CustomerReview[] {
  return readReviewsForTheme(businessId, themeId).filter((review) => review.customerId === browserId);
}

export function ratingSummary(reviews: readonly CustomerReview[]): RatingSummary {
  const rated = reviews.filter((review) => review.status === 'approved' && review.rating >= 1 && review.rating <= 5);
  if (rated.length === 0) return { average: 0, count: 0 };
  const total = rated.reduce((sum, review) => sum + review.rating, 0);
  return { average: Math.round((total / rated.length) * 10) / 10, count: rated.length };
}

function looksLikeSpam(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.length < REVIEW_MIN_BODY || trimmed.length > REVIEW_MAX_BODY) return true;
  const compact = trimmed.replace(/\s+/g, '');
  if (compact.length >= 12 && /^(.)\1+$/.test(compact)) return true;
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 4 && new Set(words).size === 1) return true;
  return false;
}

function isRateLimited(browserId: string, businessId: string, themeId: string, nowMs: number): boolean {
  const windowStart = nowMs - REVIEW_RATE_WINDOW_MS;
  const hits = effectiveStore().attempts.filter(
    (attempt) =>
      attempt.browserId === browserId
      && attempt.businessId === businessId
      && attempt.themeId === themeId
      && attempt.at >= windowStart,
  );
  return hits.length >= REVIEW_RATE_MAX;
}

function recordAttempt(browserId: string, businessId: string, themeId: string, nowMs: number): void {
  const store = effectiveStore();
  const windowStart = nowMs - REVIEW_RATE_WINDOW_MS;
  const attempts = store.attempts
    .filter((attempt) => attempt.at >= windowStart)
    .concat([{ browserId, businessId, themeId, at: nowMs }]);
  effectiveWrite({ version: REVIEW_STORE_VERSION, reviews: store.reviews, attempts });
}

function unusedEligibleBooking(
  businessId: string,
  themeId: SiteHeaderThemeId,
  customerName: string,
  browserId: string,
  now: Date,
): PaymentRecord | null {
  const used = new Set(
    readReviewsForTheme(businessId, themeId)
      .filter((review) => review.status !== 'rejected')
      .map((review) => review.bookingId),
  );
  const eligible = eligibleBookingsForReview(businessId, themeId, now).filter((record) => !used.has(record.bookingId));
  const mine = eligible.find((record) => record.customerId === browserId);
  if (mine) return mine;
  const wanted = normalizeReviewerName(customerName);
  if (!wanted) return null;
  return eligible.find((record) => normalizeReviewerName(record.customer.name) === wanted) || null;
}

export function suggestedReviewerName(businessId: string, themeId: string, now: Date = salonNow()): string {
  const browserId = bookingBrowserId();
  const used = new Set(
    readReviewsForTheme(businessId, themeId)
      .filter((review) => review.status !== 'rejected')
      .map((review) => review.bookingId),
  );
  const mine = eligibleBookingsForReview(businessId, themeId, now).find(
    (record) => record.customerId === browserId && !used.has(record.bookingId),
  );
  return mine?.customer.name || '';
}

export function visitorHasEligibleBooking(
  businessId: string,
  themeId: SiteHeaderThemeId,
  customerName = '',
  now: Date = salonNow(),
): boolean {
  return !!unusedEligibleBooking(businessId, themeId, customerName, bookingBrowserId(), now);
}

function randToken(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function submitReview(input: SubmitReviewInput): SubmitReviewResult {
  const rating = Math.round(Number(input.rating));
  const name = (input.customerName || '').trim();
  const body = (input.body || '').trim();
  const now = input.now || salonNow();
  const nowMs = now.getTime();
  const browserId = bookingBrowserId();

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'invalid-rating' };
  }
  if (name.length < REVIEW_MIN_NAME) {
    return { ok: false, error: 'invalid-name' };
  }
  if (body.length < REVIEW_MIN_BODY || body.length > REVIEW_MAX_BODY) {
    return { ok: false, error: 'invalid-body' };
  }
  if (looksLikeSpam(body)) {
    recordAttempt(browserId, input.businessId, input.themeId, nowMs);
    return { ok: false, error: 'spam' };
  }
  if (isRateLimited(browserId, input.businessId, input.themeId, nowMs)) {
    return { ok: false, error: 'rate-limited' };
  }

  const existingSameBody = readReviewsForTheme(input.businessId, input.themeId).find(
    (review) =>
      review.status !== 'rejected'
      && normalizeReviewerName(review.customerName) === normalizeReviewerName(name)
      && review.body.trim().toLowerCase() === body.toLowerCase(),
  );
  if (existingSameBody) {
    recordAttempt(browserId, input.businessId, input.themeId, nowMs);
    return { ok: false, error: 'duplicate' };
  }

  const booking = unusedEligibleBooking(input.businessId, input.themeId, name, browserId, now);
  if (!booking) {
    const usedIds = new Set(
      readReviewsForTheme(input.businessId, input.themeId)
        .filter((review) => review.status !== 'rejected')
        .map((review) => review.bookingId),
    );
    const alreadyUsed = eligibleBookingsForReview(input.businessId, input.themeId, now).find(
      (record) =>
        usedIds.has(record.bookingId)
        && (record.customerId === browserId || normalizeReviewerName(record.customer.name) === normalizeReviewerName(name)),
    );
    recordAttempt(browserId, input.businessId, input.themeId, nowMs);
    return { ok: false, error: alreadyUsed ? 'duplicate' : 'no-eligible-booking' };
  }

  const fingerprint = reviewFingerprint(input.businessId, input.themeId, booking.bookingId);

  const review: CustomerReview = {
    id: randToken('rev'),
    businessId: input.businessId,
    themeId: input.themeId,
    bookingId: booking.bookingId,
    customerId: browserId,
    customerName: name,
    rating,
    body,
    serviceName: booking.serviceName,
    status: 'pending',
    createdAt: nowMs,
    updatedAt: nowMs,
    fingerprint,
  };
  const store = effectiveStore();
  effectiveWrite({
    version: REVIEW_STORE_VERSION,
    reviews: [review, ...store.reviews],
    attempts: [
      ...store.attempts.filter((attempt) => attempt.at >= nowMs - REVIEW_RATE_WINDOW_MS),
      { browserId, businessId: input.businessId, themeId: input.themeId, at: nowMs },
    ],
  });
  return { ok: true, review };
}

export function setReviewStatus(id: string, status: ReviewStatus): CustomerReview | null {
  const store = effectiveStore();
  const idx = store.reviews.findIndex((review) => review.id === id);
  if (idx < 0) return null;
  const next: CustomerReview = { ...store.reviews[idx], status, updatedAt: Date.now() };
  const reviews = store.reviews.slice();
  reviews[idx] = next;
  effectiveWrite({ version: REVIEW_STORE_VERSION, reviews, attempts: store.attempts });
  return next;
}

export function approveReview(id: string): CustomerReview | null {
  return setReviewStatus(id, 'approved');
}

export function rejectReview(id: string): CustomerReview | null {
  return setReviewStatus(id, 'rejected');
}

/** Test helper: insert an already-approved review without going through submit. */
export function insertReviewForTests(partial: Partial<CustomerReview> & Pick<CustomerReview, 'themeId' | 'customerName' | 'body' | 'rating'>): CustomerReview {
  const businessId = partial.businessId || FALLBACK_BUSINESS_ID;
  const bookingId = partial.bookingId || `NX-TEST-${Math.random().toString(36).slice(2, 7)}`;
  const review: CustomerReview = {
    id: partial.id || randToken('rev'),
    businessId,
    themeId: partial.themeId,
    bookingId,
    customerId: partial.customerId || 'booking-test',
    customerName: partial.customerName,
    rating: partial.rating,
    body: partial.body,
    serviceName: partial.serviceName,
    status: partial.status || 'approved',
    createdAt: partial.createdAt || Date.now(),
    updatedAt: partial.updatedAt || Date.now(),
    fingerprint: partial.fingerprint || reviewFingerprint(businessId, partial.themeId, bookingId),
  };
  const store = effectiveStore();
  effectiveWrite({ version: REVIEW_STORE_VERSION, reviews: [review, ...store.reviews], attempts: store.attempts });
  return review;
}

/** Subscribe to review + booking changes so the section can repaint. */
export const REVIEW_REFRESH_EVENTS = [REVIEW_EVENT, PAYMENT_EVENT] as const;
