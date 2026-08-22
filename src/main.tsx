import './polyfill';
import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import NearbySalonSearch from './components/NearbySalonSearch.tsx';
import PublicSalonView from './components/PublicSalonView.tsx';
import NotFound from './components/NotFound.tsx';
import AuthCallbackPage from './components/AuthCallbackPage.tsx';
import PasswordResetPage from './components/PasswordResetPage.tsx';
import { AuthModalProvider, useAuthModal } from './components/AuthModalProvider.tsx';
import { useAuth } from './lib/useAuth.ts';
import { applyBrandConfigToDocument } from './config/brandConfig.ts';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.ts';
import './index.css';

// Apply white-label dynamic branding, theme CSS variables, and SEO tags on load
applyBrandConfigToDocument();

function ProtectedApp() {
  const { user, loading } = useAuth();
  const { openAuth } = useAuthModal();
  if (!isSupabaseConfigured) return <App />;
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Verifying your session…</div>;
  }
  if (!user) {
    return (
      <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">Log in to open your salon workspace</h1>
          <p className="mt-2 text-sm text-gray-600">Dashboard ownership is resolved from your authenticated Supabase account and organization membership.</p>
          <button onClick={() => openAuth('login')} className="mt-5 rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white">Log in</button>
          <a href="/" className="mt-3 block text-sm font-semibold text-gray-600">Return to public site</a>
        </section>
      </main>
    );
  }
  return <App />;
}

/**
 * Dynamic path-based routing component.
 * Evaluates the pathname, dynamically querying Supabase 'salons' table for registered slugs
 * to prevent 404 errors for any dynamic paths, while loading a fallback NotFound page when 
 * no slug is found.
 */
function RootRouter() {
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<'app' | 'protected_app' | 'auth_callback' | 'reset_password' | 'nearby' | 'public_salon' | 'not_found'>('app');

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const normalizedPath = pathname.replace(/^\/+/, '').split('/')[0] || '';

  useEffect(() => {
    // Extract referral code if present in searchParams and store in localStorage
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const referralCode = searchParams.get('ref');
      if (referralCode) {
        localStorage.setItem('nexora_referral_code', referralCode);
      }
    } catch (err) {
      console.warn('Could not store referral code:', err);
    }

    async function resolveRoute() {
      const authParams = new URLSearchParams(window.location.search);
      const hasAuthResponse = Boolean(
        authParams.get('code') || authParams.get('error') || authParams.get('error_description'),
      );

      // Supabase falls back to its configured Site URL when a requested
      // redirect is not allow-listed. Accept auth codes at `/` as well as the
      // dedicated callback path so a valid email link never opens the wizard.
      if (pathname === '/auth/callback' || (pathname === '/' && hasAuthResponse)) {
        setRoute('auth_callback');
        setLoading(false);
        return;
      }
      if (pathname === '/reset-password') {
        setRoute('reset_password');
        setLoading(false);
        return;
      }
      if (pathname === '/dashboard' || pathname === '/builder') {
        setRoute('protected_app');
        setLoading(false);
        return;
      }

      // 1. Root / Home route goes to onboarding wizard/dashboard
      if (!normalizedPath) {
        setRoute('app');
        setLoading(false);
        return;
      }

      // 2. Exact 'nearby' route goes to nearby search finder
      if (normalizedPath === 'nearby') {
        setRoute('nearby');
        setLoading(false);
        return;
      }

      // 3. Only a published salon_public_websites slug is a public site.
      //    No hardcoded salon. Offline/local draft is a last-resort fallback.
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('salon_public_websites')
            .select('slug')
            .eq('slug', normalizedPath)
            .eq('is_published', true)
            .maybeSingle();

          if (!error && data) {
            setRoute('public_salon');
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('Failed to query salon slug from Supabase:', err);
        }
      }

      // 5. If slug didn't match any source, show user-friendly NotFound 404
      setRoute('not_found');
      setLoading(false);
    }

    resolveRoute();
  }, [normalizedPath, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fcfcfc] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Soft background ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-gradient-to-tr from-[#ffd9e1]/20 to-[#ac0053]/5 blur-3xl pointer-events-none"></div>

        <div className="relative flex flex-col items-center z-10">
          {/* Branded dual-spinning gradient ring */}
          <div className="relative w-14 h-14 mb-5">
            {/* Outer gradient track */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#ac0053] via-[#ff2d8d] to-transparent animate-spin [animation-duration:1s]"></div>
            {/* Inner masking to form a clean thin ring */}
            <div className="absolute inset-[3px] bg-[#fcfcfc] rounded-full"></div>
            {/* Center glowing brand dot */}
            <div className="absolute inset-[14px] bg-gradient-to-tr from-[#ac0053] to-[#ff2d8d] rounded-full shadow-md shadow-[#ac0053]/20 animate-pulse"></div>
          </div>

          <p className="text-[#ac0053] text-[10px] font-black uppercase tracking-widest animate-pulse">
            Loading Nexora
          </p>
          <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wider mt-1 block">
            Crafting your experience
          </span>
        </div>
      </div>
    );
  }

  switch (route) {
    case 'auth_callback':
      return <AuthCallbackPage />;
    case 'reset_password':
      return <PasswordResetPage />;
    case 'protected_app':
      return <ProtectedApp />;
    case 'nearby':
      return (
        <div className="min-h-screen bg-[#f9f9f9] font-sans text-gray-900">
          <NearbySalonSearch />
        </div>
      );
    case 'public_salon':
      return <PublicSalonView slug={normalizedPath} />;
    case 'not_found':
      return <NotFound />;
    default:
      return <App />;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthModalProvider>
      <RootRouter />
    </AuthModalProvider>
  </StrictMode>,
);

