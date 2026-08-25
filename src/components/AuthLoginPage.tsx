/**
 * STANDALONE LOGIN PAGE — route `/auth/login`
 *
 * Single destination for invalid/expired sessions redirected out of the
 * protected owner workspace (`/dashboard`, `/builder`). It reuses the ONE
 * root auth modal (AuthModalProvider) — it is not a second auth system —
 * and returns the owner to the route they were on (`?next=/dashboard`).
 */
import React, { useEffect, useRef } from 'react';
import { Lock, Scissors, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useAuthModal } from './AuthModalProvider';
import { isSupabaseConfigured } from '../lib/supabase';
import { getAuthRedirectOrigin } from '../lib/authRedirect';

export default function AuthLoginPage() {
  const { user, loading } = useAuth();
  const { openAuth } = useAuthModal();
  const redirected = useRef(false);
  const next = useRef('/dashboard');

  // Read the guarded `?next=` (only allow known workspace paths) once.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('next') || '';
    if (
      param === '/dashboard' ||
      param === '/builder' ||
      param.startsWith('/dashboard/') ||
      param.startsWith('/builder/')
    ) {
      next.current = param;
    }
    // Open the shared login dialog after first paint.
    openAuth('login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a successful sign-in the shared session shows up here; return the
  // owner to the workspace they tried to open (guarded, no loops: this page
  // itself never redirects an anonymous visitor away).
  useEffect(() => {
    if (redirected.current) return;
    if (loading) return;
    if (user) {
      redirected.current = true;
      window.location.replace(next.current);
    }
  }, [user, loading]);

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-[#ac0053] to-[#ff2d8d]">
          <Scissors className="h-5 w-5 text-white" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Log in to open your salon workspace</h1>
        <p className="mt-2 text-sm text-gray-600">
          Dashboard ownership is resolved from your authenticated Supabase account
          and organization membership.
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
              onClick={() => openAuth('login')}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white"
            >
              <Lock className="h-4 w-4" /> Open log in
            </button>
          )
        ) : null}
        <a
          href="/signup"
          className="mt-3 block text-sm font-semibold text-[#ac0053]"
        >
          Create an account
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
