/**
 * STANDALONE LOGIN PAGE — route `/auth/login`
 *
 * One destination for expired protected owner sessions and for same-origin
 * login after email confirmation. It reuses the root auth modal. The explicit
 * account intent prevents a public customer login from provisioning or entering
 * an owner workspace.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Lock, Scissors, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useAuthModal } from './AuthModalProvider';
import { isSupabaseConfigured } from '../lib/supabase';
import { isDemoAuthBypassAvailable, enterDemoOwnerWorkspace } from '../lib/demoAuth';
import {
  getAuthRedirectOrigin,
  normalizeAuthIntent,
  safeAuthContinuation,
} from '../lib/authRedirect';

function ownerContinuation(value: string | null): string {
  const path = safeAuthContinuation(value, '/dashboard');
  return (
    path === '/dashboard'
    || path === '/builder'
    || path.startsWith('/dashboard/')
    || path.startsWith('/builder/')
  ) ? path : '/dashboard';
}

export default function AuthLoginPage() {
  const { user, loading } = useAuth();
  const { openAuth } = useAuthModal();
  const redirected = useRef(false);
  const settledWithoutUser = useRef(false);

  const context = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const accountIntent = normalizeAuthIntent(params.get('intent'));
    const next = accountIntent === 'customer'
      ? safeAuthContinuation(params.get('next'), '/')
      : ownerContinuation(params.get('next'));
    return { accountIntent, next };
  }, []);
  const isCustomer = context.accountIntent === 'customer';

  const openLogin = () => openAuth('login', {
    accountIntent: context.accountIntent,
    returnTo: context.next,
  });

  useEffect(() => {
    openLogin();
    // Context is immutable for this route instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Customer-mode modal intentionally performs no navigation. Once the shared
  // validated session appears, this page returns to the guarded public path.
  // Owner mode uses the same continuation; replace is idempotent if the modal's
  // owner navigation has already started.
  useEffect(() => {
    if (redirected.current || loading) return;
    if (!user) {
      settledWithoutUser.current = true;
      return;
    }
    // For a newly signed-in owner, LoginModal first completes idempotent owner
    // provisioning and then navigates. Do not race that boundary. A session
    // that already existed on page load may proceed to the protected route,
    // whose hydration performs the same canonical workspace resolution.
    if (!isCustomer && settledWithoutUser.current) return;
    redirected.current = true;
    window.location.replace(context.next);
  }, [context.next, isCustomer, user, loading]);

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-[#ac0053] to-[#ff2d8d]">
          <Scissors className="h-5 w-5 text-white" />
        </div>
        <h1 className="mt-4 text-xl font-bold">
          {isCustomer ? 'Log in to continue your booking' : 'Log in to open your salon workspace'}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {isCustomer
            ? 'Your Supabase account keeps your bookings and confirmations tied to you.'
            : 'Dashboard ownership is resolved from your authenticated Supabase account and organization membership.'}
        </p>
        {isSupabaseConfigured ? (
          loading ? (
            <button
              disabled
              className="mt-5 w-full rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white opacity-70"
            >
              Checking your session…
            </button>
          ) : (
            <button
              data-testid="auth-login-page-open-btn"
              onClick={openLogin}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white"
            >
              <Lock className="h-4 w-4" /> Open log in
            </button>
          )
        ) : (
          /* No backend configured: never a dead end. Offer the same local
             preview bypass the protected routes use (ProtectedApp renders
             the app without an auth gate in this exact case). This never
             fires for a configured-but-unreachable backend. */
          isDemoAuthBypassAvailable() ? (
            <>
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                Supabase is not connected, so real accounts are unavailable
                here. You can still explore the {isCustomer ? 'salon experience' : 'workspace'} in
                local preview mode.
              </p>
              <button
                data-testid="auth-login-page-demo-btn"
                onClick={() => {
                  if (isCustomer) {
                    window.location.assign(context.next || '/');
                    return;
                  }
                  enterDemoOwnerWorkspace();
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white"
              >
                <ArrowRight className="h-4 w-4" />
                {isCustomer ? 'Continue in preview mode' : 'Open workspace preview'}
              </button>
            </>
          ) : null
        )}
        <a
          href={isCustomer ? `${context.next}#book` : '/signup'}
          className="mt-3 block text-sm font-semibold text-[#ac0053]"
        >
          {isCustomer ? 'Return to the salon' : 'Create an account'}
        </a>
        <a
          href={getAuthRedirectOrigin()}
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-gray-600"
        >
          Return to public site <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </section>
    </main>
  );
}
