import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MailCheck, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { completeOwnerAuthSession } from '../lib/ownerSession';
import {
  normalizeAuthIntent,
  safeAuthContinuation,
  type AuthAccountIntent,
} from '../lib/authRedirect';

type CallbackState =
  | { kind: 'loading' }
  | { kind: 'confirmed' }
  | { kind: 'error'; message: string };

/**
 * Supabase's single shared client owns PKCE URL detection/exchange. This page
 * only observes the validated shared session; it must never call
 * exchangeCodeForSession a second time.
 */
export default function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const processing = useRef(false);
  const [state, setState] = useState<CallbackState>({ kind: 'loading' });

  const context = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const intent: AuthAccountIntent = normalizeAuthIntent(params.get('intent'));
    const fallback = intent === 'customer' ? '/' : '/builder';
    return {
      intent,
      next: safeAuthContinuation(params.get('next'), fallback),
      flow: params.get('flow') || '',
      codePresent: Boolean(params.get('code')),
      providerError: params.get('error_description') || params.get('error'),
    };
  }, []);

  useEffect(() => {
    if (processing.current) return;
    if (context.providerError) {
      processing.current = true;
      setState({
        kind: 'error',
        message: context.providerError.replace(/\+/g, ' '),
      });
      return;
    }
    if (loading) return;

    if (session) {
      processing.current = true;
      const finish = async () => {
        if (context.intent === 'owner') {
          const owner = await completeOwnerAuthSession();
          if ('error' in owner) {
            setState({ kind: 'error', message: owner.error });
            return;
          }
        }
        window.location.replace(context.next);
      };
      void finish();
      return;
    }

    processing.current = true;
    // If a signup email was opened on a different origin, its PKCE verifier is
    // correctly unavailable here. Supabase has nevertheless validated the
    // email before redirecting with an authorization code. Do not claim a
    // session; explicitly send the user through login on this origin.
    if (context.codePresent && context.flow === 'signup') {
      window.history.replaceState({}, document.title, window.location.pathname);
      setState({ kind: 'confirmed' });
      return;
    }

    setState({ kind: 'error', message: 'The authentication callback is invalid or expired.' });
  }, [context, loading, session]);

  const loginHref = `/auth/login?intent=${context.intent}&next=${encodeURIComponent(context.next)}`;
  const isCustomer = context.intent === 'customer';

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        {state.kind === 'error' ? (
          <>
            <TriangleAlert className="mx-auto h-9 w-9 text-red-600" />
            <h1 className="mt-4 text-lg font-bold">Sign-in could not be completed</h1>
            <p className="mt-2 text-sm text-gray-600">{state.message}</p>
            <a
              href={loginHref}
              className="mt-5 inline-flex rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Return to login
            </a>
          </>
        ) : state.kind === 'confirmed' ? (
          <>
            <MailCheck className="mx-auto h-10 w-10 text-emerald-600" />
            <h1 className="mt-4 text-lg font-bold">Email confirmed!</h1>
            <p className="mt-2 text-sm text-gray-600">
              {isCustomer
                ? 'Your customer account is active. Log in to return to the salon and continue your booking.'
                : 'Your account is active. Log in to continue setting up your salon workspace.'}
            </p>
            <a
              href={loginHref}
              className="mt-5 inline-flex rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white"
            >
              {isCustomer ? 'Log in and return to the salon' : 'Log in to your dashboard'}
            </a>
          </>
        ) : (
          <>
            <div className="relative mx-auto h-10 w-10">
              <ShieldCheck className="h-10 w-10 text-[#ac0053]" />
              <Loader2 className="absolute -right-2 -top-2 h-4 w-4 animate-spin text-[#ac0053]" />
            </div>
            <h1 className="mt-4 text-lg font-bold">Completing secure sign-in</h1>
            <p className="mt-2 text-sm text-gray-600">Please keep this page open.</p>
          </>
        )}
      </section>
    </main>
  );
}
