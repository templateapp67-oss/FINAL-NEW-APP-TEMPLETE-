import { lazy, Suspense, useEffect, useState } from 'react';
import type { SalonData } from '../types';

// The full Service → Date → Time → Details → Summary → Payment → Gateway →
// Result → Confirmation → Receipt flow is ~190 kB of source across
// SiteBookingFullFlow / SiteBookingFlow / SiteBookingPaymentFlow. This host
// already returns null until a Book CTA fires, so the chunk is not even
// requested until a visitor actually starts a booking.
const SiteBookingFullFlow = lazy(() => import('./SiteBookingFullFlow'));
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import {
  BOOKING_TRIGGER_ATTR,
  SITE_BOOKING_CLOSE_EVENT,
  SITE_BOOKING_EVENT,
  closeSiteBooking,
  openSiteBooking,
} from '../lib/siteBooking';

/**
 * PHASE 10.7 — public-site booking host.
 *
 * There is still exactly ONE booking architecture: header / final /
 * floating Book CTAs dispatch `nexora:open-booking` (and
 * `data-open-booking` clicks), and this host mounts the full
 * Service → Date → Time → Details → Summary → Payment Option →
 * Gateway → Result → Confirmation → Receipt flow for the ACTIVE theme.
 *
 * `themeId` comes from the renderer so the flow inherits the exact theme
 * identity (services, surfaces, language, dark mode) of the page it
 * opened on. Phase 10.6's entry-only flow is now the first half of
 * this orchestrator; the payment + confirmation + receipt screens are
 * added in Phase 10.7.
 */
export default function SiteBookingHost({ themeId, data }: { themeId: SiteHeaderThemeId; data: SalonData }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    const hide = () => setOpen(false);
    window.addEventListener(SITE_BOOKING_EVENT, show);
    window.addEventListener(SITE_BOOKING_CLOSE_EVENT, hide);
    return () => {
      window.removeEventListener(SITE_BOOKING_EVENT, show);
      window.removeEventListener(SITE_BOOKING_CLOSE_EVENT, hide);
    };
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      const trigger = target.closest(`[${BOOKING_TRIGGER_ATTR}]`);
      if (!trigger) return;
      event.preventDefault();
      openSiteBooking();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!open) return null;

  return (
    <div
      data-testid="site-booking-flow"
      className="absolute inset-0 z-[70] flex flex-col overflow-hidden"
      style={{ transform: 'translateZ(0)' }}
    >
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#ffd9e1] border-t-[#ac0053]" />
          </div>
        }
      >
        <SiteBookingFullFlow themeId={themeId} data={data} />
      </Suspense>
    </div>
  );
}
