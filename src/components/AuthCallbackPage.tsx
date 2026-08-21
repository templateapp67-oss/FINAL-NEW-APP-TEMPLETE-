import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

export default function AuthCallbackPage() {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      if (!supabase) {
        setError('Authentication is not configured.');
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get('error_description') || params.get('error');
      if (providerError) {
        setError(providerError.replace(/\+/g, ' '));
        return;
      }
      const code = params.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError && !/already.*exchang/i.test(exchangeError.message)) {
          setError(exchangeError.message);
          return;
        }
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        setError('The authentication callback is invalid or expired.');
        return;
      }
      window.location.replace(safeNext(params.get('next')));
    };
    void run();
  }, []);

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        {error ? (
          <>
            <TriangleAlert className="mx-auto h-9 w-9 text-red-600" />
            <h1 className="mt-4 text-lg font-bold">Sign-in could not be completed</h1>
            <p className="mt-2 text-sm text-gray-600">{error}</p>
            <a href="/" className="mt-5 inline-flex rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white">Return to login</a>
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
