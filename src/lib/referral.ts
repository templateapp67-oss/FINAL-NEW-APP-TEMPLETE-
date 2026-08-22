/**
 * CENTRAL REFERRAL SYSTEM
 *
 * Single source of truth for:
 *   - Dynamic referral code generation: `NX-[WEBSITE_SHORT_NAME]-<YEAR>`
 *     (e.g. "Royal Hair Studio" → `NX-ROYAL-2026`).
 *   - Referral link construction pointing at the Sign-Up page:
 *     `https://final-new-app-templete.vercel.app/signup?ref=NX-ROYAL-2026`
 *   - Persisting an incoming `?ref=` code into localStorage under the key
 *     `nexora_referral_code` so the Sign-Up page can auto-fill (and lock)
 *     the Referral Code input before the account is created.
 *
 * Every Referral Dashboard component, marketing copy string and share link
 * MUST go through these helpers so the code updates everywhere at once when
 * the salon/website name changes.
 */

import { getBrandConfig } from '../config/brandConfig';
import { getAuthRedirectOrigin } from './authRedirect';

/** localStorage key the whole app reads for an incoming referral code. */
export const REFERRAL_STORAGE_KEY = 'nexora_referral_code';

/** Stopwords that are not useful as a code fragment ("The Royal Studio"). */
const SHORT_NAME_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'at', 'in', 'on', 'my', 'our',
]);

/**
 * Derive the short website/salon name used inside the referral code.
 *
 * Rules (deterministic — same name always yields the same code):
 *   1. First "meaningful" word (skips articles/stopwords), upper-cased.
 *      "Royal Hair Studio"        → "ROYAL"   → NX-ROYAL-2026
 *      "The Barber Collective"    → "BARBER"  → NX-BARBER-2026
 *   2. If every word is a stopword, fall back to the acronym of the first
 *      three words ("RHS" style).
 *   3. If the name has no latin letters/digits, fall back to "SALON".
 */
export function deriveSalonShortName(salonName: string | undefined | null): string {
  const words = (salonName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = words.find((w) => !SHORT_NAME_STOPWORDS.has(w.toLowerCase()));
  if (meaningful) return meaningful.slice(0, 10);

  if (words.length > 0) {
    const acronym = words
      .slice(0, 3)
      .map((w) => w.charAt(0))
      .join('');
    if (acronym.length > 0) return acronym;
  }
  return 'SALON';
}

/**
 * Dynamic referral code in the standard format `NX-[SHORT_NAME]-<YEAR>`.
 * The prefix comes from the white-label brand config (default `NX`) and the
 * year is generated from the current date, so codes stay format-stable.
 */
export function getReferralCode(salonName: string | undefined | null): string {
  const prefix = (getBrandConfig().platform.referralPrefix || 'NX').toUpperCase();
  const short = deriveSalonShortName(salonName);
  const year = new Date().getFullYear();
  return `${prefix}-${short}-${year}`;
}

/**
 * Canonical referral link — always targets the Sign-Up page with the code in
 * the `ref` query parameter, e.g.
 * `https://final-new-app-templete.vercel.app/signup?ref=NX-ROYAL-2026`.
 *
 * The origin resolves to the canonical Vercel deployment in dev/preview
 * (via `getAuthRedirectOrigin`) and to the real origin in production, so the
 * link works from both.
 */
export function buildReferralLink(salonName: string | undefined | null): string {
  const code = getReferralCode(salonName);
  const origin = getAuthRedirectOrigin();
  try {
    const url = new URL(`${origin}/signup`);
    url.searchParams.set('ref', code);
    return url.toString();
  } catch {
    return `${origin}/signup?ref=${encodeURIComponent(code)}`;
  }
}

/**
 * Sanitize an externally supplied code (URL param, form input). Returns the
 * normalized code or null when it is empty / not code-shaped.
 * Accepts the full standard format (`NX-ROYAL-2026`, case-insensitive) or a
 * plain alphanumeric fragment.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Trim outer whitespace only — any inner whitespace (or other character)
  // makes the value invalid, so pasted junk is rejected, not mangled.
  const cleaned = String(raw).trim().toUpperCase();
  if (!cleaned) return null;
  if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(cleaned)) return null;
  return cleaned;
}

/** Read the stored referral code (set by an incoming `?ref=` link). */
export function readStoredReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeReferralCode(localStorage.getItem(REFERRAL_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist a referral code so the Sign-Up page can auto-fill it. */
export function storeReferralCode(code: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const normalized = normalizeReferralCode(code);
  try {
    if (normalized) localStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
    else localStorage.removeItem(REFERRAL_STORAGE_KEY);
    return Boolean(normalized);
  } catch {
    return false;
  }
}

/**
 * Parse the `ref` query parameter from `window.location.search` and persist
 * it under `nexora_referral_code`.
 *
 * Called once at app startup (before React renders) from `src/main.tsx`.
 * Query parameters are read from `location.search` only — `location.pathname`
 * is never consulted here, so `/royal-hair-studio?ref=...` keeps resolving
 * its slug cleanly without 404s / "Salon Not Found" errors.
 *
 * Returns the stored code when one was captured, else null.
 */
export function captureReferralFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const incoming = params.get('ref');
    const normalized = normalizeReferralCode(incoming);
    if (normalized) {
      storeReferralCode(normalized);
      return normalized;
    }
  } catch (err) {
    console.warn('Failed to capture referral code from URL:', err);
  }
  return null;
}

/**
 * Marketing copy shared by WhatsApp / native share sheets. Built here so the
 * dynamic code never drifts between surfaces.
 */
export function buildReferralShareText(
  salonName: string | undefined | null,
  code?: string,
  link?: string,
): string {
  const name = (salonName || 'Nexora Lumina').trim();
  const c = code || getReferralCode(salonName);
  const l = link || buildReferralLink(salonName);
  return `Book your next service at ${name} and get 10% off — use my referral code ${c}! Sign up with the link: ${l}`;
}

/**
 * Best-effort native share. Falls back to clipboard + a friendly message so
 * unsupported devices (older iOS/desktop without Web Share) never dead-end.
 * Returns 'shared' | 'copied' | 'failed'.
 */
export async function shareReferralNatively(
  salonName: string | undefined | null,
): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator === 'undefined') return 'failed';
  const link = buildReferralLink(salonName);
  const text = buildReferralShareText(salonName);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Nexora Refer & Earn', text, url: link });
      return 'shared';
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'failed'; // user closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${link}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Open the Facebook sharer dialog for a URL (popup window). */
export function shareToFacebook(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const sharer = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const w = 600;
  const h = 520;
  const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
  const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
  const popup = window.open(
    sharer,
    'nexora_fb_share',
    `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
  );
  return Boolean(popup);
}
