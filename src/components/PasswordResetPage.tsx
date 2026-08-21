import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, Loader2, TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { updatePassword } from '../lib/useAuth';

export default function PasswordResetPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError('Authentication is not configured.');
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setReady(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage('Password updated. You can now return to your dashboard.');
    setPassword('');
    setConfirm('');
  };

  return (
    <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
        <KeyRound className="h-9 w-9 text-[#ac0053]" />
        <h1 className="mt-4 text-xl font-bold">Set a new password</h1>
        <p className="mt-1 text-sm text-gray-600">Recovery links are verified by Supabase before an update is accepted.</p>
        {!ready && !error && <p className="mt-5 flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Verifying recovery session…</p>}
        {error && <p className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><TriangleAlert className="h-4 w-4 shrink-0" /> {error}</p>}
        {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        <div className="mt-5 space-y-3">
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" disabled={!ready || busy || Boolean(message)} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm" />
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" disabled={!ready || busy || Boolean(message)} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm" />
          <button disabled={!ready || busy || Boolean(message)} className="w-full rounded-xl bg-[#ac0053] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Updating…' : 'Update password'}</button>
          <a href="/dashboard" className="block text-center text-sm font-semibold text-[#ac0053]">Return to dashboard</a>
        </div>
      </form>
    </main>
  );
}
