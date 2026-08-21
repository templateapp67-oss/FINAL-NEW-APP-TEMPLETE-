import type { CSSProperties } from 'react';
import type { Package, Service, ServiceOffer } from '../types';
import {
  bestBundleOffer,
  bestServiceOffer,
  discountedPrice,
  formatCurrency,
} from '../lib/pricing';

interface ServicePriceProps {
  service: Service;
  offers?: ServiceOffer[];
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
  dark?: boolean;
}

const badgeStyle = (dark: boolean): CSSProperties => ({
  backgroundColor: dark ? 'rgba(255,255,255,0.12)' : '#fff1f4',
  color: dark ? '#ffffff' : '#8e0045',
  border: `1px solid ${dark ? 'rgba(255,255,255,0.2)' : '#f8c8dc'}`,
});

/** Dynamic badge + offer + variable-price renderer shared by all five themes. */
export function ServicePrice({
  service,
  offers = [],
  className = '',
  style,
  compact = false,
  dark = false,
}: ServicePriceProps) {
  const variants = (service.pricingVariants ?? []).filter((variant) => variant.status === 'active');
  const prices = [service.price, ...variants.map((variant) => variant.price)];
  const lowestBase = Math.min(...prices);
  const offer = bestServiceOffer(service, offers, lowestBase);
  const finalPrice = discountedPrice(lowestBase, offer);
  const badges = Array.from(new Set([
    service.promotionalBadge,
    offer?.promotionalBadge,
  ].filter((badge): badge is string => Boolean(badge))));

  return (
    <div className={`text-right shrink-0 ${className}`} style={style}>
      {badges.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1 mb-1" title={offer?.title}>
          {badges.map((badge) => (
            <span
              key={badge}
              className="inline-block rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide whitespace-nowrap"
              style={badgeStyle(dark)}
            >
              {badge}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
        {offer && (
          <span className="text-[10px] line-through opacity-55">{formatCurrency(lowestBase)}</span>
        )}
        <span className={compact ? 'text-xs font-extrabold' : 'text-sm font-extrabold'}>
          {variants.length > 0 && !offer ? 'From ' : ''}{formatCurrency(finalPrice)}
        </span>
      </div>
      {variants.length > 0 && (
        <p className="mt-0.5 text-[8px] font-semibold opacity-60 whitespace-nowrap" title={variants.map((variant) => `${variant.name}: ${formatCurrency(variant.price)}`).join(' · ')}>
          {variants.length} price option{variants.length === 1 ? '' : 's'}
        </p>
      )}
      {offer && !compact && (
        <p className="mt-0.5 text-[8px] font-semibold opacity-65 max-w-[150px] ml-auto">{offer.title}</p>
      )}
    </div>
  );
}

interface BundlePriceProps {
  bundle: Package;
  offers?: ServiceOffer[];
  className?: string;
  style?: CSSProperties;
  dark?: boolean;
}

export function BundlePrice({ bundle, offers = [], className = '', style, dark = false }: BundlePriceProps) {
  const offer = bestBundleOffer(bundle, offers);
  const finalPrice = discountedPrice(bundle.price, offer);
  const originalPrice = offer ? bundle.price : bundle.originalPrice;
  const badges = Array.from(new Set([
    bundle.promotionalBadge,
    offer?.promotionalBadge,
  ].filter((badge): badge is string => Boolean(badge))));

  return (
    <div className={`text-right shrink-0 ${className}`} style={style}>
      {badges.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1 mb-1" title={offer?.title}>
          {badges.map((badge) => (
            <span key={badge} className="rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase whitespace-nowrap" style={badgeStyle(dark)}>
              {badge}
            </span>
          ))}
        </div>
      )}
      <div className="flex justify-end items-baseline gap-1.5 whitespace-nowrap">
        {originalPrice !== undefined && originalPrice > finalPrice && (
          <span className="text-[10px] line-through opacity-55">{formatCurrency(originalPrice)}</span>
        )}
        <span className="text-lg font-extrabold">{formatCurrency(finalPrice)}</span>
      </div>
      {bundle.includedServices && bundle.includedServices.length > 0 && (
        <p className="mt-0.5 text-[8px] font-semibold opacity-60">
          {bundle.includedServices.length} services included
        </p>
      )}
    </div>
  );
}
