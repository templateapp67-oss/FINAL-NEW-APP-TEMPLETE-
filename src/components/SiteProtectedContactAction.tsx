/**
 * PHASE 16.8 — the ONE control every Call / WhatsApp surface renders.
 *
 * Hero CTAs, floating actions, the mobile action bar, the footer, the
 * section-state cards and the theme contact rows all render THIS
 * component instead of building their own `tel:` / `wa.me` anchor. That
 * is what makes the protection un-bypassable by construction: there is a
 * single place where a contact target can be emitted, and it emits one
 * only when `siteContactAccess` authorizes it.
 *
 * Locked  → a <button> with NO href and NO number anywhere in the markup;
 *           clicking it explains that the advance payment is required and
 *           offers the existing Book Online flow.
 * Unlocked → the real <a href> for the salon being viewed, re-verified
 *           against the store at click time.
 *
 * Callers keep their own look: `className`, `style` and `children` are
 * passed straight through, and the caller's existing `data-testid` stays
 * on the element in both states so every earlier phase still finds it.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Lock } from 'lucide-react';
import type { SalonData } from '../types';
import {
  CONTACT_ACCESS_EVENT,
  authorizeContactOpen,
  resolveContactAccess,
} from '../lib/siteContactAccess';
import type { ContactAccess, ProtectedContactAction } from '../lib/siteContactAccess';
import { contactAccessText, fillContactCopy } from '../lib/siteContactAccessI18n';
import { useSiteLocale } from './SiteHeader';

/* ------------------------------------------------------------------ */
/* Access hook — re-evaluates whenever a payment record changes.        */
/* ------------------------------------------------------------------ */

export function useContactAccess(
  action: ProtectedContactAction,
  data: SalonData,
  themeId: string,
): ContactAccess {
  const [access, setAccess] = useState<ContactAccess>(() => resolveContactAccess(action, data, themeId));

  useEffect(() => {
    const sync = () => setAccess(resolveContactAccess(action, data, themeId));
    sync();
    // The EXISTING payment channel — a successful payment unlocks live.
    window.addEventListener(CONTACT_ACCESS_EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener(CONTACT_ACCESS_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, [action, data, themeId]);

  return access;
}

/* ------------------------------------------------------------------ */
/* Lock notice channel                                                 */
/* ------------------------------------------------------------------ */

export const CONTACT_LOCK_EVENT = 'nexora:contact-locked';

export interface ContactLockDetail {
  action: ProtectedContactAction;
  reason: ContactAccess['reason'];
  advancePercentage: number;
  reference: string | null;
}

/** Announces a blocked attempt so the shared notice can explain it. */
export function announceContactLock(detail: ContactLockDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ContactLockDetail>(CONTACT_LOCK_EVENT, { detail }));
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export interface SiteProtectedContactActionProps {
  action: ProtectedContactAction;
  data: SalonData;
  themeId: string;
  /** Test id kept identical in both states so existing queries still work. */
  testId?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** Accessible label; the locked state appends the reason automatically. */
  ariaLabel?: string;
  /** Render nothing at all when the salon did not enable this channel. */
  hideWhenUnavailable?: boolean;
  /** Show the small padlock glyph in the locked state (default true). */
  showLockIcon?: boolean;
}

export default function SiteProtectedContactAction({
  action,
  data,
  themeId,
  testId,
  className,
  style,
  children,
  ariaLabel,
  hideWhenUnavailable = true,
  showLockIcon = true,
}: SiteProtectedContactActionProps) {
  const locale = useSiteLocale();
  const T = contactAccessText(locale);
  const access = useContactAccess(action, data, themeId);

  const label = ariaLabel || T[`action.${action}`];

  const onLockedClick = useCallback(
    (event: { preventDefault: () => void }) => {
      event.preventDefault();
      announceContactLock({
        action,
        reason: access.reason,
        advancePercentage: access.advancePercentage,
        reference: access.reference,
      });
    },
    [action, access.reason, access.advancePercentage, access.reference],
  );

  // Salon disabled the channel (or never gave a number) — existing behaviour.
  if (!access.offered && hideWhenUnavailable) return null;

  if (access.unlocked && access.href) {
    return (
      <a
        data-testid={testId}
        data-action={action}
        data-locked="false"
        data-lock-reason={access.reason}
        href={access.href}
        {...(action === 'whatsapp' ? { target: '_blank', rel: 'noreferrer' } : {})}
        aria-label={label}
        className={className}
        style={style}
        onClick={(event) => {
          // Re-verify at click time: a stale or tampered render must not open.
          const href = authorizeContactOpen(action, data, themeId);
          if (!href) onLockedClick(event);
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      data-testid={testId}
      data-action={action}
      data-locked="true"
      data-lock-reason={access.reason}
      /* Theme treatment is emitted BEFORE the long lock copy so the markup
         stays recognisably per-theme for the existing signature tests. */
      className={className}
      style={style}
      aria-label={fillContactCopy(T['lock.ariaLocked'], {
        percent: access.advancePercentage,
        action: label,
      })}
      title={fillContactCopy(T[`reason.${access.reason}`] || T['reason.payment-required'], {
        percent: access.advancePercentage,
      })}
      onClick={onLockedClick}
    >
      {showLockIcon && <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden data-testid={testId ? `${testId}-lock-icon` : undefined} />}
      {children}
    </button>
  );
}
