/**
 * PHASE 12.3 — Featured Services card copy (English / हिन्दी).
 *
 * Only the NEW badge + price labels added on top of Phase 12.2. Section
 * eyebrow/title and the Book CTA still come from the existing siteText /
 * structureText tables.
 */
import type { AppLocale } from './locale';

export interface FeaturedCardCopy {
  suggested: string;
  popular: string;
  /** "From ₹X" / "₹X से" prefix for a starting price. */
  from: string;
}

const EN: FeaturedCardCopy = {
  suggested: 'Suggested',
  popular: 'Popular',
  from: 'From',
};

const HI: FeaturedCardCopy = {
  suggested: 'सुझाया गया',
  popular: 'लोकप्रिय',
  from: 'से',
};

export function featuredCardText(locale: AppLocale): FeaturedCardCopy {
  return locale === 'hi' ? HI : EN;
}

/** "From ₹900" (en) / "₹900 से" (hi) starting-price label. */
export function startingPriceLabel(price: string, locale: AppLocale): string {
  return locale === 'hi' ? `${price} ${featuredCardText(locale).from}` : `${featuredCardText(locale).from} ${price}`;
}
