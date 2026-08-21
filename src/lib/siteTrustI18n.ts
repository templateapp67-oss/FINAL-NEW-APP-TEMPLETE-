/**
 * PHASE 12.1 — Trust/Stats copy (English / हिन्दी).
 *
 * Only the NEW stat labels + empty-state copy. The section eyebrow and title
 * keep flowing from the existing Phase 10.3 `structureText()` table so the
 * theme voice ("The shop standard", "Why families stay", …) is preserved.
 */
import type { AppLocale } from './locale';
import type { TrustStatKind } from './siteTrust';

const LABELS_EN: Record<TrustStatKind, string> = {
  rating: 'Customer Rating',
  reviewCount: 'Review Count',
  yearsExperience: 'Years of Experience',
  happyCustomers: 'Happy Customers',
  services: 'Services Available',
  salonStatus: 'Salon Status',
};

const LABELS_HI: Record<TrustStatKind, string> = {
  rating: 'ग्राहक रेटिंग',
  reviewCount: 'रिव्यू की संख्या',
  yearsExperience: 'अनुभव के वर्ष',
  happyCustomers: 'खुश ग्राहक',
  services: 'उपलब्ध सेवाएँ',
  salonStatus: 'सैलून स्थिति',
};

export interface TrustCopy {
  label: (kind: TrustStatKind) => string;
  /** Rating scale suffix, e.g. "out of 5". */
  ratingOf: string;
  emptyTitle: string;
  emptyBody: string;
}

export function trustText(locale: AppLocale): TrustCopy {
  if (locale === 'hi') {
    return {
      label: (kind) => LABELS_HI[kind],
      ratingOf: '5 में से',
      emptyTitle: 'अभी कोई सैलून आँकड़े नहीं',
      emptyBody: 'रेटिंग, अनुभव और सेवा गिनती जुड़ते ही यहाँ दिखेंगे।',
    };
  }
  return {
    label: (kind) => LABELS_EN[kind],
    ratingOf: 'out of 5',
    emptyTitle: 'No salon stats yet',
    emptyBody: 'Ratings, experience and service counts will appear here once the salon adds them.',
  };
}
