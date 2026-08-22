import { useEffect, useRef, useState } from 'react';
import { Loader2, MailCheck, ShieldCheck, TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

type CallbackState =
  | { kind: 'loading' }
  | { kind: 'confirmed' }
  | { kind: 'error'; message: string };

export default function AuthCallbackPage() {
  const started = useRef(false);
  const [state, setState] = useState<CallbackState>({ kind: 'loading' });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      if (!supabase) {
        setState({ kind: 'error', message: 'Authentication is not configured.' });
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get('error_description') || params.get('error');
      if (providerError) {
        setState({ kind: 'error', message: providerError.replace(/\+/g, ' ') });
        return;
      }
      const code = params.get('code');
      let exchangeErrorMessage: string | null = null;
      if (code) {
        try {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError && !/already.*exchang/i.test(exchangeError.message)) {
            exchangeErrorMessage = exchangeError.message;
            // A confirmation email can be requested in a preview but opened on
            // the canonical domain. In that case the PKCE verifier remains in
            // preview-domain storage even though Supabase already confirmed the
            // email before redirecting here.
            console.error('Code exchange failed:', exchangeError.message);
          }
        } catch (exchangeError) {
          exchangeErrorMessage =
            exchangeError instanceof Error ? exchangeError.message : 'Code exchange failed.';
          console.error('Code exchange failed:', exchangeErrorMessage);
        }
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!sessionError && data.session) {
        window.location.replace(safeNext(params.get('next')));
        return;
      }

      // A cross-origin preview → canonical-domain confirmation cannot reuse the
      // preview's PKCE verifier. Supabase has already consumed the email token
      // before issuing this code, so show the confirmed/log-in state rather
      // than rejecting the user because no session could be created here.
      const isSignupCallback =
        params.get('flow') === 'signup' || window.location.pathname === '/';
      if (
        code &&
        isSignupCallback &&
        exchangeErrorMessage &&
        /code verifier|pkce/i.test(exchangeErrorMessage)
      ) {
        window.history.replaceState({}, document.title, window.location.pathname);
        setState({ kind: 'confirmed' });
        return;
      }

      // No session: the most common benign case is that the user just clicked
      // the email confirmation link. If their email is now confirmed, welcome
      // them back to the login screen instead of showing a dead-end error.
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (user && (user.email_confirmed_at || user.confirmed_at)) {
        setState({ kind: 'confirmed' });
        return;
      }
      setState({ kind: 'error', message: 'The authentication callback is invalid or expired.' });
    };
    void run();
  }, []);

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        {state.kind === 'error' ? (
          <>
            <TriangleAlert className="mx-auto h-9 w-9 text-red-600" />
            <h1 className="mt-4 text-lg font-bold">Sign-in could not be completed</h1>
            <p className="mt-2 text-sm text-gray-600">{state.message}</p>
            <a
              href="/"
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
              Your account is active. You can now log in and start building your
              salon website.
            </p>
            <a
              href="/dashboard"
              className="mt-5 inline-flex rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Log in to your dashboard
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
