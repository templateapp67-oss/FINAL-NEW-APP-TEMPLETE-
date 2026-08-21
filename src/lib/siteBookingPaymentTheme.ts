/**
 * PHASE 10.7 — PAYMENT + CONFIRMATION + RECEIPT · per-theme design tokens.
 *
 * The Phase 10.6 booking entry flow already defined a per-theme surface
 * resolver (`bookingSurfaces(themeId, appearance)`). The payment /
 * confirmation / receipt screens extend it with a small additional token
 * set the gateway + receipt need — success green, failure red, warning
 * amber, plus a soft receipt paper texture.
 *
 *   - All five themes use the SAME `paymentSurfaces(themeId, appearance)`
 *     resolver, so the payment flow inherits each theme's identity
 *     visually without per-theme re-mapping.
 *   - The base palette comes from the Phase 10.6 `bookingSurfaces` so the
 *     payment screens feel like a continuation of the entry flow, never a
 *     second design.
 *   - The "receipt paper" tone shifts subtly with each theme (barber =
 *     cream engraving paper, hair = warm linen, spa = herbal mist, family
 *     = bright sky, nail = blush blush) so the receipt visually matches
 *     the salon it belongs to.
 */
import type { WebsiteAppearance } from '../types';
import type { SiteHeaderThemeId } from './siteNavigation';
import { bookingSurfaces } from './siteBookingTheme';
import type { BookingFlowSurface } from './siteBookingTheme';

export interface PaymentFlowSurface extends BookingFlowSurface {
  /** Success / paid / confirmed accent (matches the success state from the entry flow). */
  success: string;
  successSoft: string;
  successText: string;
  /** Failure / declined / error accent. */
  danger: string;
  dangerSoft: string;
  /** Warning / pending / processing accent. */
  warning: string;
  warningSoft: string;
  /** Receipt paper background. */
  receiptPaper: string;
  /** Receipt hairline / border. */
  receiptLine: string;
  /** Receipt strong text. */
  receiptText: string;
  /** Receipt muted text. */
  receiptMuted: string;
}

const FALLBACK_SUCCESS = '#16a34a';
const FALLBACK_SUCCESS_SOFT = 'rgba(22,163,74,0.12)';
const FALLBACK_DANGER = '#dc2626';
const FALLBACK_DANGER_SOFT = 'rgba(220,38,38,0.12)';
const FALLBACK_WARNING = '#d97706';
const FALLBACK_WARNING_SOFT = 'rgba(217,119,6,0.12)';

function extend(
  base: BookingFlowSurface,
  extra: Partial<PaymentFlowSurface> = {},
): PaymentFlowSurface {
  return {
    ...base,
    success: extra.success || FALLBACK_SUCCESS,
    successSoft: extra.successSoft || FALLBACK_SUCCESS_SOFT,
    successText: extra.successText || '#ffffff',
    danger: extra.danger || FALLBACK_DANGER,
    dangerSoft: extra.dangerSoft || FALLBACK_DANGER_SOFT,
    warning: extra.warning || FALLBACK_WARNING,
    warningSoft: extra.warningSoft || FALLBACK_WARNING_SOFT,
    receiptPaper: extra.receiptPaper || base.card,
    receiptLine: extra.receiptLine || base.line,
    receiptText: extra.receiptText || base.textStrong,
    receiptMuted: extra.receiptMuted || base.muted,
  };
}

export function paymentSurfaces(
  themeId: SiteHeaderThemeId,
  appearance: WebsiteAppearance | undefined,
): PaymentFlowSurface {
  const base = bookingSurfaces(themeId, appearance);
  const mode = appearance === 'dark' ? 'dark' : 'light';

  if (themeId === 'barber_mens_grooming') {
    return mode === 'dark'
      ? extend(base, {
          success: base.success,
          successSoft: 'rgba(22,163,74,0.18)',
          successText: '#ffffff',
          danger: '#ef4444',
          dangerSoft: 'rgba(239,68,68,0.18)',
          warning: '#f59e0b',
          warningSoft: 'rgba(245,158,11,0.18)',
          receiptPaper: '#0e0e0e',
          receiptLine: base.line,
          receiptText: base.textStrong,
          receiptMuted: base.muted,
        })
      : extend(base, {
          success: '#15803d',
          successSoft: 'rgba(21,128,61,0.10)',
          successText: '#ffffff',
          danger: '#b91c1c',
          dangerSoft: 'rgba(185,28,28,0.10)',
          warning: '#b45309',
          warningSoft: 'rgba(180,83,9,0.10)',
          receiptPaper: '#fdfaf1',
          receiptLine: base.line,
          receiptText: '#1c1814',
          receiptMuted: '#7a6f5a',
        });
  }

  if (themeId === 'hair_studio_color_bar') {
    return mode === 'dark'
      ? extend(base, {
          success: base.success,
          successSoft: 'rgba(22,163,74,0.18)',
          successText: '#ffffff',
          danger: '#ef4444',
          dangerSoft: 'rgba(239,68,68,0.18)',
          warning: '#f59e0b',
          warningSoft: 'rgba(245,158,11,0.18)',
          receiptPaper: '#1d1815',
          receiptLine: base.line,
          receiptText: base.textStrong,
          receiptMuted: base.muted,
        })
      : extend(base, {
          success: '#0f766e',
          successSoft: 'rgba(15,118,110,0.10)',
          successText: '#ffffff',
          danger: '#be123c',
          dangerSoft: 'rgba(190,18,60,0.10)',
          warning: '#a16207',
          warningSoft: 'rgba(161,98,7,0.10)',
          receiptPaper: '#fbf6ee',
          receiptLine: base.line,
          receiptText: '#2b1d1a',
          receiptMuted: '#7a6c66',
        });
  }

  if (themeId === 'beauty_skin_spa') {
    return mode === 'dark'
      ? extend(base, {
          success: base.success,
          successSoft: 'rgba(22,163,74,0.20)',
          successText: '#04130c',
          danger: '#f87171',
          dangerSoft: 'rgba(248,113,113,0.18)',
          warning: '#fbbf24',
          warningSoft: 'rgba(251,191,36,0.18)',
          receiptPaper: '#0e2a22',
          receiptLine: base.line,
          receiptText: base.textStrong,
          receiptMuted: base.muted,
        })
      : extend(base, {
          success: '#0f766e',
          successSoft: 'rgba(15,118,110,0.12)',
          successText: '#ffffff',
          danger: '#b91c1c',
          dangerSoft: 'rgba(185,28,28,0.10)',
          warning: '#b45309',
          warningSoft: 'rgba(180,83,9,0.10)',
          receiptPaper: '#f3efe4',
          receiptLine: base.line,
          receiptText: '#0f2a22',
          receiptMuted: '#5d7f73',
        });
  }

  if (themeId === 'family_full_service') {
    return mode === 'dark'
      ? extend(base, {
          success: base.success,
          successSoft: 'rgba(255,209,102,0.18)',
          successText: '#04121f',
          danger: '#f87171',
          dangerSoft: 'rgba(248,113,113,0.18)',
          warning: '#fbbf24',
          warningSoft: 'rgba(251,191,36,0.18)',
          receiptPaper: '#0b263b',
          receiptLine: base.line,
          receiptText: base.textStrong,
          receiptMuted: base.muted,
        })
      : extend(base, {
          success: '#0d9488',
          successSoft: 'rgba(13,148,136,0.12)',
          successText: '#ffffff',
          danger: '#b91c1c',
          dangerSoft: 'rgba(185,28,28,0.10)',
          warning: '#a16207',
          warningSoft: 'rgba(161,98,7,0.10)',
          receiptPaper: '#f5fbff',
          receiptLine: base.line,
          receiptText: '#0b1f33',
          receiptMuted: '#55788f',
        });
  }

  // nail_lash_studio
  return mode === 'dark'
    ? extend(base, {
        success: base.success,
        successSoft: 'rgba(22,163,74,0.18)',
        successText: '#19131f',
        danger: '#f472b6',
        dangerSoft: 'rgba(244,114,182,0.18)',
        warning: '#fbbf24',
        warningSoft: 'rgba(251,191,36,0.18)',
        receiptPaper: '#1c1622',
        receiptLine: base.line,
        receiptText: base.textStrong,
        receiptMuted: base.muted,
      })
    : extend(base, {
        success: '#be185d',
        successSoft: 'rgba(190,24,93,0.10)',
        successText: '#ffffff',
        danger: '#9f1239',
        dangerSoft: 'rgba(159,18,57,0.10)',
        warning: '#a16207',
        warningSoft: 'rgba(161,98,7,0.10)',
        receiptPaper: '#fff5f9',
        receiptLine: base.line,
        receiptText: '#2b0e1f',
        receiptMuted: '#9f6c83',
      });
}
