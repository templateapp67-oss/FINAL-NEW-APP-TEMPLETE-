/**
 * PHASE 10.12 — Skeleton Loading States for all dynamic sections
 *
 * - Services, Offers, Gallery, Videos, Reviews, Staff, Owner, Location
 * - Prevent layout shift via fixed aspect ratios
 * - Theme-aware? Uses generic gray but can be themed via parent
 */

import type { ViewportMode } from '../lib/siteStructure';
import { siteGrid } from '../lib/siteStructure';

type SkeletonType = 'services' | 'offers' | 'gallery' | 'videos' | 'reviews' | 'staff' | 'owner' | 'location' | 'generic';

interface Props {
  type: SkeletonType;
  count?: number;
  mode?: ViewportMode;
  className?: string;
}

function shimmer(base: string = 'bg-gray-100') {
  return `${base} animate-pulse`;
}

export default function SiteSkeleton({ type, count, mode = 'desktop', className = '' }: Props) {
  const c = count ?? (type === 'gallery' ? 6 : type === 'videos' ? 4 : type === 'services' ? 4 : type === 'reviews' ? 3 : type === 'staff' ? 4 : 2);

  if (type === 'services') {
    return (
      <div data-testid="site-skeleton-services" className={`grid gap-3 ${siteGrid(mode, { desktop: 2, tablet: 2, mobile: 1 })} ${className}`}>
        {Array.from({ length: c }).map((_, i) => (
          <div key={i} data-testid="site-skeleton-service" className={`p-4 border rounded-2xl ${shimmer()}`} style={{ aspectRatio: '16/9' }}>
            <div className="flex justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
                <div className="h-3 w-1/2 bg-gray-200 rounded" />
              </div>
              <div className="h-8 w-16 bg-gray-200 rounded" />
            </div>
            <div className="mt-3 space-y-1">
              <div className="h-3 w-full bg-gray-200 rounded" />
              <div className="h-3 w-5/6 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'offers') {
    return (
      <div data-testid="site-skeleton-offers" className={`grid gap-4 grid-cols-1 ${className}`}>
        {Array.from({ length: c }).map((_, i) => (
          <div key={i} data-testid="site-skeleton-offer" className={`p-5 border rounded-2xl flex justify-between gap-4 ${shimmer()}`} style={{ minHeight: '88px' }}>
            <div className="space-y-2 flex-1">
              <div className="h-4 w-1/2 bg-gray-200 rounded" />
              <div className="h-3 w-3/4 bg-gray-200 rounded" />
            </div>
            <div className="h-8 w-20 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'gallery') {
    return (
      <div data-testid="site-skeleton-gallery" className={`grid gap-3 ${siteGrid(mode, { desktop: 3, tablet: 3, mobile: 2 })} ${className}`}>
        {Array.from({ length: c }).map((_, i) => (
          <div key={i} data-testid="site-skeleton-gallery-item" className={`aspect-square rounded-xl ${shimmer()}`} />
        ))}
      </div>
    );
  }

  if (type === 'videos') {
    return (
      <div data-testid="site-skeleton-videos" className={`grid gap-4 ${siteGrid(mode, { desktop: 3, tablet: 3, mobile: 2 })} ${className}`}>
        {Array.from({ length: c }).map((_, i) => (
          <div key={i} data-testid="site-skeleton-video" className={`aspect-[9/16] rounded-xl ${shimmer()}`} />
        ))}
      </div>
    );
  }

  if (type === 'reviews') {
    return (
      <div data-testid="site-skeleton-reviews" className={`grid gap-4 ${siteGrid(mode, { desktop: 3, tablet: 2, mobile: 1 })} ${className}`}>
        {Array.from({ length: c }).map((_, i) => (
          <div key={i} data-testid="site-skeleton-review" className={`p-5 border rounded-2xl space-y-3 ${shimmer()}`}>
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="w-3.5 h-3.5 bg-gray-200 rounded-full" />
              ))}
            </div>
            <div className="h-3 w-full bg-gray-200 rounded" />
            <div className="h-3 w-5/6 bg-gray-200 rounded" />
            <div className="pt-3 border-t border-gray-100 space-y-1">
              <div className="h-3 w-1/3 bg-gray-200 rounded" />
              <div className="h-2 w-1/4 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'staff') {
    return (
      <div data-testid="site-skeleton-staff" className={`grid gap-5 ${siteGrid(mode, { desktop: 2, tablet: 2, mobile: 1 })} ${className}`}>
        {Array.from({ length: c }).map((_, i) => (
          <div key={i} data-testid="site-skeleton-staff-card" className={`p-5 border rounded-2xl flex flex-col gap-4 ${shimmer()}`}>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gray-200" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-1/2 bg-gray-200 rounded" />
                <div className="h-3 w-1/3 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'owner') {
    return (
      <div data-testid="site-skeleton-owner" className={`flex flex-col md:flex-row items-center gap-8 max-w-2xl mx-auto ${className}`}>
        <div className="w-28 h-28 rounded-full bg-gray-200 animate-pulse" />
        <div className="space-y-3 flex-1 min-w-0 w-full">
          <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-5/6 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (type === 'location') {
    return (
      <div data-testid="site-skeleton-location" className={`grid gap-6 ${siteGrid(mode, { desktop: 2, tablet: 2, mobile: 1 })} ${className}`}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} data-testid="site-skeleton-location-card" className={`p-6 border rounded-2xl space-y-4 ${shimmer()}`}>
            <div className="h-4 w-1/3 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-200 rounded" />
            <div className="h-3 w-5/6 bg-gray-200 rounded" />
            <div className="h-10 w-full bg-gray-200 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  // generic
  return (
    <div data-testid="site-skeleton-generic" className={`space-y-3 ${className}`}>
      {Array.from({ length: c }).map((_, i) => (
        <div key={i} className={`h-4 w-full bg-gray-200 rounded animate-pulse`} style={{ width: `${70 + (i % 3) * 10}%` }} />
      ))}
    </div>
  );
}
