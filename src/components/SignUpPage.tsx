/**
 * STANDALONE SIGN-UP PAGE — route `/signup`
 *
 * Target of every referral link (`/signup?ref=NX-[SHORT]-2026`).
 *
 * Referral auto-fill contract:
 *   1. `src/main.tsx` captures `?ref=` into `localStorage['nexora_referral_code']`
 *      before this page renders (see `captureReferralFromUrl`).
 *   2. On load, this page reads that key and PRE-FILLS the Referral Code input.
 *   3. The prefilled code is LOCKED (readonly) and HIGHLIGHTED so the
 *      referral is accurately attributed at account creation.
 *   4. On successful sign-up the entry is recorded in the referral registry
 *      (`recordReferralSignup`) so the referrer's Referral Dashboard shows the
 *      new salon as `Pending` → `Registered` → `Active` in real time.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  AlertCircle,
  MailCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  UserPlus,
  Scissors,
  BadgeCheck,
  LogIn,
  Gift,
} from 'lucide-react';
import { resendConfirmationEmail, signUpWithPassword } from '../lib/useAuth';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { readStoredReferralCode, storeReferralCode } from '../lib/referral';
import { recordReferralSignup } from '../lib/referralDashboard';

export default function SignUpPage() {
  const [salonName, setSalonName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Referral code — auto-filled from `nexora_referral_code` (set by the
  // incoming `?ref=` link). `locked` = code came from the invite link, so it
  // is highlighted and cannot be edited away.
  const [referralCode, setReferralCode] = useState('');
  const [referralLocked, setReferralLocked] = useState(false);

  // Email-confirmation flow (mirrors the auth modal).
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendStatus, setResendStatus] = useState<
    { kind: 'sent' | 'error'; message: string } | null
  >(null);

  // Auto-fill the referral code exactly once, on mount.
  useEffect(() => {
    const stored = readStoredReferralCode();
    if (stored) {
      setReferralCode(stored);
      setReferralLocked(true);
    }
  }, []);

  const codeLocked = referralLocked && referralCode.length > 0;

  const handleResendConfirmation = async () => {
    if (!unconfirmedEmail) return;
    setResendBusy(true);
    setResendStatus(null);
    const result = await resendConfirmationEmail(unconfirmedEmail);
    setResendBusy(false);
    setResendStatus(
      result.error
        ? { kind: 'error', message: result.error }
        : {
            kind: 'sent',
            message:
              'Confirmation email sent — open the newest message. Older links may still point to localhost.',
          },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    if (!mail || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!isSupabaseConfigured) {
      setError(
        'Authentication is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      );
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const { error: err, needsConfirmation } = await signUpWithPassword(mail, password);
      setBusy(false);
      if (err) {
        setError(err);
        return;
      }

      // Track the referral at account creation: the code stays in
      // `nexora_referral_code` (attribution for this account) and the new
      // salon is recorded in the referrer's dashboard registry as Pending.
      const appliedCode = readStoredReferralCode();
      if (appliedCode) {
        storeReferralCode(appliedCode);
        recordReferralSignup({
          email: mail,
          code: appliedCode,
          salonName: salonName || undefined,
        });
      }

      if (needsConfirmation) {
        setError(null);
        setNotice(null);
        setUnconfirmedEmail(mail);
        return;
      }
      setPassword('');
      setNotice(
        'Your account is ready. You can now log in to open your salon workspace.',
      );
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    }
  };

  const heroPoints = useMemo(
    () => [
      'AI-built salon website in minutes',
      'Bookings, staff & revenue in one dashboard',
      'Refer & earn — salon credit on every referral',
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-[#fcfcfc] flex flex-col font-sans text-gray-900">
      {/* Top bar */}
      <header className="w-full border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#ac0053] to-[#ff2d8d] flex items-center justify-center text-white">
              <Scissors className="w-4 h-4" />
            </span>
            <span className="font-black tracking-tight text-sm">
              Nexora <span className="text-[#ac0053]">Salon Builder</span>
            </span>
          </a>
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#ac0053] transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" /> Log in
          </a>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden border border-gray-200 shadow-xl bg-white">
          {/* Left: value prop */}
          <div className="hidden md:flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#3f001a] via-[#6d0b38] to-[#ac0053] text-white p-8">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-[#ffd9e1]/20 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-black uppercase tracking-widest">
                <Gift className="w-3.5 h-3.5" /> Refer & Earn
              </div>
              <h2 className="mt-5 text-2xl font-black leading-snug">
                Join {`Nexora`} and get your salon
                <span className="bg-gradient-to-r from-[#ffd9e1] to-white bg-clip-text text-transparent">
                  {' '}online in minutes
                </span>
                .
              </h2>
              <ul className="mt-6 space-y-3">
                {heroPoints.map((point) => (
                  <li key={point} className="flex items-center gap-2.5 text-xs font-semibold text-white/80">
                    <BadgeCheck className="w-4 h-4 text-[#ffd9e1] shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <p className="relative text-[10px] text-white/50 font-semibold uppercase tracking-wider">
              No credit card required
            </p>
          </div>

          {/* Right: form */}
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ffd9e1]/50 text-[#ac0053]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-base font-bold">Create your shop account</h1>
                  <p className="text-xs text-gray-500">
                    Get started with your AI-powered salon website.
                  </p>
                </div>
              </div>
            </div>

            {unconfirmedEmail ? (
              /* Email confirmation panel */
              <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50/50 p-5 text-center" data-testid="signup-confirm-email-panel">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ac0053]/10">
                  <MailCheck className="h-6 w-6 text-[#ac0053]" />
                </div>
                <h3 className="mt-3 text-sm font-bold">Confirm your email</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
                  We sent a confirmation link to{' '}
                  <span className="font-semibold break-all">{unconfirmedEmail}</span>.
                  Click the link in the email to activate your account.
                </p>
                <button
                  type="button"
                  onClick={() => void handleResendConfirmation()}
                  disabled={resendBusy}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#ac0053]/30 bg-white px-4 py-2.5 text-xs font-semibold text-[#ac0053] transition-colors hover:bg-[#ac0053]/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resendBusy ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="h-3.5 w-3.5" />
                      <span>Resend confirmation email</span>
                    </>
                  )}
                </button>
                {resendStatus && (
                  <p
                    className={`mt-2.5 rounded-lg px-3 py-2 text-[11px] font-medium ${
                      resendStatus.kind === 'sent'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {resendStatus.message}
                  </p>
                )}
                <a href="/" className="mt-3 inline-block text-[11px] font-semibold text-[#ac0053] hover:underline">
                  I&apos;ve confirmed my email — Go to log in
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-3.5" noValidate data-testid="signup-form">
                {/* Referral code — auto-filled from the invite link */}
                <div data-testid="signup-referral-block">
                  <div className="mb-1 flex items-center justify-between">
                    <label
                      htmlFor="signup-referral-input"
                      className="block text-xs font-semibold"
                    >
                      Referral Code
                    </label>
                    {codeLocked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#ac0053]/10 border border-[#ac0053]/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#ac0053]">
                        <Lock className="h-2.5 w-2.5" /> Applied from invite
                      </span>
                    )}
                  </div>
                  <div
                    className={`relative ${
                      codeLocked
                        ? 'rounded-xl ring-2 ring-[#ac0053] ring-offset-1 bg-[#ffd9e1]/25 border border-[#ac0053]/40'
                        : ''
                    }`}
                  >
                    <Gift
                      className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 ${
                        codeLocked ? 'text-[#ac0053]' : 'text-gray-400'
                      }`}
                    />
                    <input
                      id="signup-referral-input"
                      name="referralCode"
                      data-testid="signup-referral-input"
                      type="text"
                      autoComplete="off"
                      value={referralCode}
                      onChange={(e) => {
                        setReferralCode(e.target.value.toUpperCase());
                        setReferralLocked(false);
                        // Keep the storage key in sync so the account
                        // attribute matches what the owner typed.
                        storeReferralCode(e.target.value);
                      }}
                      placeholder="e.g. NX-ROYAL-2026"
                      disabled={busy || codeLocked}
                      readOnly={codeLocked}
                      className={`w-full rounded-xl border pl-10 pr-10 py-2.5 text-sm font-mono font-bold tracking-wider outline-none transition-all placeholder:text-gray-400 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal ${
                        codeLocked
                          ? 'border-[#ac0053]/40 bg-[#ffd9e1]/25 text-[#3f001a] select-all'
                          : 'border-gray-200 bg-gray-50/50 text-gray-900 focus:border-[#ac0053] focus:bg-white focus:ring-2 focus:ring-[#ffd9e1]'
                      } ${busy || codeLocked ? 'opacity-90' : ''}`}
                    />
                    {codeLocked && (
                      <Lock className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#ac0053]" />
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500">
                    {codeLocked
                      ? 'This code was shared with you — it stays locked so your referral is credited correctly.'
                      : 'Optional — use your friend\u2019s code to unlock 10% off your first service.'}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="signup-salon-input"
                    className="mb-1 block text-xs font-semibold"
                  >
                    Salon / Business Name
                  </label>
                  <div className="relative">
                    <Scissors className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      id="signup-salon-input"
                      name="salonName"
                      data-testid="signup-salon-input"
                      type="text"
                      autoComplete="organization"
                      value={salonName}
                      onChange={(e) => setSalonName(e.target.value)}
                      placeholder="e.g. Royal Hair Studio"
                      disabled={busy}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 py-2.5 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-[#ac0053] focus:bg-white focus:ring-2 focus:ring-[#ffd9e1] disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-email-input" className="mb-1 block text-xs font-semibold">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      id="signup-email-input"
                      name="email"
                      data-testid="signup-email-input"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@salon.com"
                      disabled={busy}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 py-2.5 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-[#ac0053] focus:bg-white focus:ring-2 focus:ring-[#ffd9e1] disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="signup-password-input" className="block text-xs font-semibold">
                      Password
                    </label>
                    <span className="text-[11px] font-medium text-gray-500">Min 6 characters</span>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      id="signup-password-input"
                      name="password"
                      data-testid="signup-password-input"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      disabled={busy}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-10 py-2.5 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-[#ac0053] focus:bg-white focus:ring-2 focus:ring-[#ffd9e1] disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {notice && (
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800" data-testid="signup-notice-banner">
                    <MailCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{notice}</span>
                  </div>
                )}
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800" data-testid="signup-error-banner">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}

                {!isSupabaseConfigured && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900" data-testid="signup-warning-banner">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-semibold">Supabase Not Connected</p>
                      <p className="mt-0.5 text-amber-800">
                        Authentication form is ready, but Supabase is not connected. Configure
                        VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the app.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  data-testid="signup-submit-btn"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ac0053] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#ba005b] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Please wait...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Sign Up</span>
                    </>
                  )}
                </button>

                <div className="pt-1 text-center">
                  <a
                    href="/"
                    className="text-xs text-gray-500 hover:text-[#ac0053] transition-colors"
                  >
                    Already have an account?{' '}
                    <span className="font-semibold text-[#ac0053]">Log in</span>
                  </a>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
