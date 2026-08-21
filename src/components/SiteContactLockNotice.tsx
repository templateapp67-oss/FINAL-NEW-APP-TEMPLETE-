/**
 * PHASE 16.8 — the message a visitor sees when a protected action is
 * blocked, and the confirmation they see once it unlocks.
 *
 * Mounted once per site (next to `SiteBookingHost`). It listens for the
 * blocked-attempt event raised by `SiteProtectedContactAction` and shows
 * a clear, localized explanation of the advance-payment requirement with
 * a direct route into the EXISTING booking flow. It also announces the
 * unlock, so a successful payment visibly changes the site.
 */
import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Lock, X } from 'lucide-react';
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { openSiteBooking } from '../lib/siteBooking';
import { paymentSurfaces } from '../lib/siteBookingPaymentTheme';
import { CONTACT_ACCESS_EVENT, resolveSiteContactAccess } from '../lib/siteContactAccess';
import { contactAccessText, fillContactCopy } from '../lib/siteContactAccessI18n';
import { CONTACT_LOCK_EVENT } from './SiteProtectedContactAction';
import type { ContactLockDetail } from './SiteProtectedContactAction';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';

export default function SiteContactLockNotice({
  themeId,
  data,
}: {
  themeId: SiteHeaderThemeId;
  data: SalonData;
}) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const T = contactAccessText(locale);
  const s = paymentSurfaces(themeId, appearance);

  const [notice, setNotice] = useState<ContactLockDetail | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  // Blocked attempt → explain.
  useEffect(() => {
    const onLock = (event: Event) => {
      const detail = (event as CustomEvent<ContactLockDetail>).detail;
      if (detail) setNotice(detail);
    };
    window.addEventListener(CONTACT_LOCK_EVENT, onLock);
    return () => window.removeEventListener(CONTACT_LOCK_EVENT, onLock);
  }, []);

  // Payment success → announce the unlock and drop any stale lock notice.
  useEffect(() => {
    const sync = () => {
      const access = resolveSiteContactAccess(data, themeId);
      const nowUnlocked = access.call.unlocked || access.whatsapp.unlocked;
      setUnlocked(nowUnlocked);
      setReference(access.call.reference || access.whatsapp.reference);
      if (nowUnlocked) setNotice(null);
    };
    sync();
    window.addEventListener(CONTACT_ACCESS_EVENT, sync);
    return () => window.removeEventListener(CONTACT_ACCESS_EVENT, sync);
  }, [data, themeId]);

  if (notice) {
    const message = fillContactCopy(
      T[`reason.${notice.reason}`] || T['reason.payment-required'],
      { percent: notice.advancePercentage },
    );
    const ctaKey = notice.reason === 'payment-pending'
      ? 'action.completePayment'
      : notice.reason === 'payment-failed'
        ? 'action.retryPayment'
        : notice.reason === 'cancelled' || notice.reason === 'expired'
          ? 'action.bookAgain'
          : 'common.bookNow';

    return (
      <div
        data-testid="contact-lock-notice"
        data-reason={notice.reason}
        data-action={notice.action}
        data-theme={themeId}
        data-appearance={appearance}
        data-locale={locale}
        role="alertdialog"
        aria-labelledby="contact-lock-title"
        className="absolute inset-x-0 bottom-0 z-[80] p-3 sm:p-4 md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm"
      >
        <div
          className="rounded-2xl border p-4 shadow-xl"
          style={{ backgroundColor: s.card, borderColor: s.warning, color: s.text }}
        >
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: s.warningSoft, color: s.warning }}
            >
              <Lock className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3
                id="contact-lock-title"
                data-testid="contact-lock-title"
                className="text-[11px] font-extrabold uppercase tracking-[0.14em]"
                style={{ color: s.textStrong }}
              >
                {T['lock.title']}
              </h3>
              <p data-testid="contact-lock-message" className="mt-1.5 text-xs leading-relaxed" style={{ color: s.muted }}>
                {message}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="contact-lock-book"
                  onClick={() => {
                    setNotice(null);
                    openSiteBooking();
                  }}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-[10px] font-extrabold uppercase tracking-[0.14em]"
                  style={{ backgroundColor: s.accent, color: s.accentText }}
                >
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {T[ctaKey]}
                </button>
                <button
                  type="button"
                  data-testid="contact-lock-dismiss"
                  onClick={() => setNotice(null)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ borderColor: s.line, color: s.muted }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden /> {T['common.dismiss']}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (unlocked) {
    return (
      <div
        data-testid="contact-unlocked-banner"
        data-theme={themeId}
        data-appearance={appearance}
        data-locale={locale}
        data-reference={reference || ''}
        role="status"
        className="sr-only"
      >
        <span data-testid="contact-unlocked-title">{T['unlocked.title']}</span>
        <span data-testid="contact-unlocked-body">
          {fillContactCopy(T['unlocked.body'], {
            percent: resolveSiteContactAccess(data, themeId).advancePercentage,
            reference,
          })}
        </span>
        <CheckCircle2 className="hidden" aria-hidden />
      </div>
    );
  }

  return null;
}
