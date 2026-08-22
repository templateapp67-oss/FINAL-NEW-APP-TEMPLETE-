import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Loader2,
  AlertCircle,
  LogIn,
  UserPlus,
  MailCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import {
  sendPasswordReset,
  resendConfirmationEmail,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from '../lib/useAuth';
import { isSupabaseConfigured } from '../lib/supabaseClient';

/**
 * Sign in / sign up against the existing Supabase Auth (email + password,
 * which the live project has enabled). Credentials go straight to Supabase —
 * never stored or handled manually, no service_role.
 *
 * Rendered via createPortal(..., document.body) to escape any parent
 * overflow/transform/stacking context clipping.
 */
export type AuthMode = 'login' | 'signup';

export interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onSignedIn?: () => void;
  initialMode?: AuthMode;
}

export default function LoginModal({
  open,
  onClose,
  onSignedIn,
  initialMode = 'login',
}: LoginModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Email-confirmation flow: after signup (or a blocked sign-in) the user is
  // shown a "confirm your email" panel instead of a dead-end error.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendStatus, setResendStatus] = useState<
    { kind: 'sent' | 'error'; message: string } | null
  >(null);

  // Reset transient state and honour the button that opened the form.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError(null);
    setNotice(null);
    setBusy(false);
    setUnconfirmedEmail(null);
    setResendBusy(false);
    setResendStatus(null);
  }, [open, initialMode]);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  // Prevent background body scroll while modal is open
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const isLogin = mode === 'login';

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setNotice(null);
    setUnconfirmedEmail(null);
    setResendBusy(false);
    setResendStatus(null);
  };

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

  const handleConfirmedAndLogin = () => {
    setUnconfirmedEmail(null);
    setResendBusy(false);
    setResendStatus(null);
    setMode('login');
  };

  const handlePasswordReset = async () => {
    const mail = email.trim();
    if (!mail) {
      setError('Enter your email address first.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await sendPasswordReset(mail);
    setBusy(false);
    if (result.error) setError(result.error);
    else setNotice('Password reset link sent. Check your email.');
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogle('/dashboard');
    if (result.error) {
      setBusy(false);
      setError(result.error);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const mail = email.trim();
    if (!mail || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
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
      if (mode === 'login') {
        const { error: err, needsConfirmation } = await signInWithPassword(mail, password);
        setBusy(false);
        if (err) {
          if (needsConfirmation) {
            // Account exists but the email link was never clicked — switch to
            // the confirmation panel with a resend option instead of the raw
            // "Email not confirmed" error.
            setError(null);
            setNotice(null);
            setUnconfirmedEmail(mail);
            return;
          }
          setError(err);
          return;
        }
        setPassword('');
        onSignedIn?.();
        onClose();
        return;
      }

      const { error: err, needsConfirmation } = await signUpWithPassword(mail, password);
      setBusy(false);
      if (err) {
        setError(err);
        return;
      }
      setPassword('');
      if (needsConfirmation) {
        // Account created — Supabase emailed a confirmation link. Guide the
        // user through confirming instead of dropping them at a dead end.
        setError(null);
        setNotice(null);
        setUnconfirmedEmail(mail);
        setMode('login');
        return;
      }
      onSignedIn?.();
      onClose();
    } catch (err: any) {
      setBusy(false);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    }
  };

  const modalContent = (
    <div
      data-testid="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition-opacity"
      style={{ zIndex: 2147483647 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-gray-100 text-left overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ffd9e1]/50 text-[#ac0053]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-base font-bold text-[#1a1c1c]">
                {isLogin ? 'Log in to your shop' : 'Create your shop account'}
              </h2>
              <p className="text-xs text-gray-500">
                {isLogin
                  ? 'Access your salon website, bookings & dashboard.'
                  : 'Get started with your AI-powered salon website.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            data-testid="auth-close-btn"
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Email confirmation panel — shown after signup or when a sign-in is
            blocked because the confirmation link was never clicked. */}
        {unconfirmedEmail ? (
          <div
            data-testid="auth-confirm-email-panel"
            className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/50 p-5 text-center"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ac0053]/10">
              <MailCheck className="h-6 w-6 text-[#ac0053]" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-[#1a1c1c]">Confirm your email</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
              We sent a confirmation link to{' '}
              <span
                data-testid="auth-confirm-email-address"
                className="font-semibold break-all text-[#1a1c1c]"
              >
                {unconfirmedEmail}
              </span>
              . Click the link in the email to activate your account — then come
              back and log in below.
            </p>

            <button
              type="button"
              data-testid="auth-resend-email-btn"
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
                data-testid="auth-resend-email-status"
                className={`mt-2.5 rounded-lg px-3 py-2 text-[11px] font-medium ${
                  resendStatus.kind === 'sent'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {resendStatus.message}
              </p>
            )}

            <button
              type="button"
              data-testid="auth-confirm-email-login-btn"
              onClick={handleConfirmedAndLogin}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ac0053] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#ba005b]"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>I&apos;ve confirmed my email — Log in</span>
            </button>

            <button
              type="button"
              data-testid="auth-confirm-email-different-btn"
              onClick={() => switchMode('signup')}
              className="mt-2 text-[11px] font-semibold text-gray-500 transition-colors hover:text-[#ac0053]"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
        {/* Mode switcher tabs */}
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            data-testid="auth-login-tab"
            onClick={() => switchMode('login')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              isLogin
                ? 'bg-white text-[#ac0053] shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Log In</span>
          </button>
          <button
            type="button"
            data-testid="auth-signup-tab"
            onClick={() => switchMode('signup')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              !isLogin
                ? 'bg-white text-[#ac0053] shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Sign Up</span>
          </button>
        </div>

        {import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === 'true' && (
          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={busy || !isSupabaseConfigured}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Continue with Google
          </button>
        )}

        {/* Missing Supabase Configuration Warning */}
        {!isSupabaseConfigured && (
          <div
            data-testid="auth-warning-banner"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Supabase Not Connected</p>
              <p className="mt-0.5 text-amber-800">
                Authentication form is ready, but Supabase is not connected. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the app.
              </p>
            </div>
          </div>
        )}

        {/* Auth Form */}
        <form
          data-testid="auth-form"
          onSubmit={handleSubmit}
          className="mt-4 space-y-3.5"
          noValidate
        >
          <div>
            <label
              htmlFor="auth-email-input"
              className="mb-1 block text-xs font-semibold text-[#1a1c1c]"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                id="auth-email-input"
                name="email"
                type="email"
                data-testid="auth-email-input"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@salon.com"
                disabled={busy}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-4 py-2.5 text-sm text-[#1a1c1c] outline-none transition-all placeholder:text-gray-400 focus:border-[#ac0053] focus:bg-white focus:ring-2 focus:ring-[#ffd9e1] disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor="auth-password-input"
                className="block text-xs font-semibold text-[#1a1c1c]"
              >
                Password
              </label>
              {isLogin ? (
                <button
                  type="button"
                  onClick={() => void handlePasswordReset()}
                  disabled={busy}
                  className="text-[11px] font-semibold text-[#ac0053] hover:underline disabled:opacity-50"
                >
                  Forgot password?
                </button>
              ) : (
                <span className="text-[11px] font-medium text-gray-500">
                  Min 6 characters
                </span>
              )}
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                id="auth-password-input"
                name="password"
                type={showPassword ? 'text' : 'password'}
                data-testid="auth-password-input"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? 'Enter password' : 'At least 6 characters'}
                disabled={busy}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-10 pr-10 py-2.5 text-sm text-[#1a1c1c] outline-none transition-all placeholder:text-gray-400 focus:border-[#ac0053] focus:bg-white focus:ring-2 focus:ring-[#ffd9e1] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Success / notice banner */}
          {notice && (
            <div
              data-testid="auth-notice-banner"
              className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800"
            >
              <MailCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>{notice}</span>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div
              data-testid="auth-error-banner"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            data-testid="auth-submit-btn"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ac0053] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#ba005b] shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Please wait...</span>
              </>
            ) : isLogin ? (
              <>
                <LogIn className="h-3.5 w-3.5" />
                <span>Log In</span>
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                <span>Sign Up</span>
              </>
            )}
          </button>

          {/* Switch mode bottom link */}
          <div className="pt-1 text-center">
            <button
              type="button"
              data-testid="auth-switch-mode-btn"
              onClick={() => switchMode(isLogin ? 'signup' : 'login')}
              className="text-xs text-gray-500 hover:text-[#ac0053] transition-colors"
            >
              {isLogin ? (
                <>
                  Don&apos;t have an account?{' '}
                  <span className="font-semibold text-[#ac0053]">Sign up</span>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <span className="font-semibold text-[#ac0053]">Log in</span>
                </>
              )}
            </button>
          </div>
        </form>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
