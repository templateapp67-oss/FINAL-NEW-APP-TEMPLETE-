import './polyfill';
import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import NearbySalonSearch from './components/NearbySalonSearch.tsx';
import PublicSalonView from './components/PublicSalonView.tsx';
import NotFound from './components/NotFound.tsx';
import AuthCallbackPage from './components/AuthCallbackPage.tsx';
import PasswordResetPage from './components/PasswordResetPage.tsx';
import SignUpPage from './components/SignUpPage.tsx';
import AuthLoginPage from './components/AuthLoginPage.tsx';
import { AuthModalProvider, useAuthModal } from './components/AuthModalProvider.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { useAuth } from './lib/useAuth.ts';
import { applyBrandConfigToDocument } from './config/brandConfig.ts';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.ts';
import { captureReferralFromUrl } from './lib/referral.ts';
import {
  normalizeRouteSlug,
  matchesBrandFallbackSlug,
  extractSubdomainSlug,
} from './lib/salonRouting.ts';
import { resolvePublicSalonWebsite } from './lib/publicSalonResolver.ts';

import './index.css';

// Apply white-label dynamic branding, theme CSS variables, and SEO tags on load
applyBrandConfigToDocument();

// Capture an incoming referral code (`/signup?ref=NX-NEXORA-2026` or any path
// with `?ref=`) into localStorage['nexora_referral_code'] BEFORE the router
// runs, so the Sign-Up page can auto-fill (and lock) the code. This only
// reads `window.location.search` — the pathname used for slug resolution is
// untouched, so `/nexora-demo-salon?ref=...` never 404s.
captureReferralFromUrl();

function ProtectedApp() {
  const { user, session, loading } = useAuth();
  const { openAuth } = useAuthModal();
  // /dashboard and /builder both open the authenticated owner workspace;
  // /dashboard starts on the real Salon Owner Dashboard (screen 26).
  const protectedPath = window.location.pathname.replace(/\/+$/, '');
  const initialModule =
    protectedPath === '/builder' || protectedPath.startsWith('/builder/')
      ? 'wizard'
      : 'owner-dashboard';
  if (!isSupabaseConfigured) return <App initialModule={initialModule} />;
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Verifying your session…</div>;
  }
  if (!user || !session?.access_token || !session.user?.id) {
    return (
      <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">Log in to open your salon workspace</h1>
          <p className="mt-2 text-sm text-gray-600">Dashboard ownership is resolved from your authenticated Supabase account and organization membership.</p>
          <button
            onClick={() => openAuth('login', { accountIntent: 'owner', returnTo: protectedPath || '/dashboard' })}
            className="mt-5 rounded-xl bg-[#ac0053] px-5 py-2.5 text-sm font-semibold text-white"
          >Log in</button>
          <a href="/signup" className="mt-3 block text-sm font-semibold text-[#ac0053]">Create an account</a>
          <a href="/" className="mt-2 block text-sm font-semibold text-gray-600">Return to public site</a>
        </section>
      </main>
    );
  }
  return <App initialModule={initialModule} />;
}

/**
 * Dynamic routing component (path-based AND host/subdomain-based).
 * Evaluates the pathname and the request hostname, dynamically querying
 * Supabase for registered slugs (with a salon-name fallback) to prevent 404
 * errors for any dynamic public-salon route, while loading a fallback NotFound
 * page (or the configured brand-default salon) when no slug is found.
 */
function RootRouter() {
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<'app' | 'protected_app' | 'auth_callback' | 'auth_login' | 'reset_password' | 'signup' | 'nearby' | 'public_salon' | 'not_found'>('app');

  // NOTE: slug resolution is fed by `location.pathname` and (when present)
  // `location.hostname` (subdomain). Query parameters (e.g. `?ref=NX-NEXORA-2026`)
  // are never part of either, so referral links on any route keep resolving
  // slugs cleanly (no 404 / "Salon Not Found").
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  // Host-based (subdomain) routing: `nexora-demo-salon.yourdomain.com` =>
  // slug `nexora-demo-salon`. Falls back to the path slug when no subdomain
  // is present (e.g. the canonical `/nexora-demo-salon` path form).
  const subdomainSlug = extractSubdomainSlug(window.location.hostname);
  // Normalise the slug: lowercase, trim, slugify — so `/Nexora-Demo-Salon`,
  // `/Nexora Demo Salon`, and `/nexora-demo-salon` all resolve identically.
  const normalizedPath = subdomainSlug || normalizeRouteSlug(pathname);

  useEffect(() => {
    // NOTE: the `?ref=` capture lives at module scope (captureReferralFromUrl,
    // top of this file) so the code is stored BEFORE this router runs — it is
    // normalized/validated there and must not be duplicated (or bypassed) here.
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
      // Invalid/expired session destination — the ONLY auth login route.
      // Never redirected back to itself (see useAuth redirect guard).
      if (pathname === '/auth/login') {
        setRoute('auth_login');
        setLoading(false);
        return;
      }
      // 2. Standalone Sign-Up page — target of all referral links
      //    (`/signup?ref=NX-[SHORT]-2026`). The `ref` parameter was already
      //    captured into localStorage at module load (captureReferralFromUrl).
      if (pathname === '/signup') {
        setRoute('signup');
        setLoading(false);
        return;
      }
      if (
        pathname === '/dashboard'
        || pathname === '/builder'
        || pathname.startsWith('/dashboard/')
        || pathname.startsWith('/builder/')
      ) {
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
          // Resolve through the field-limited published projection. Anonymous
          // users never receive the owner-private draft/config row.
          const website = await resolvePublicSalonWebsite(supabase, normalizedPath);
          if (website) {
            setRoute('public_salon');
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('Failed to query salon slug from Supabase:', err);
        }
      }

      // 4. Offline demo fallback only. In configured deployments a missing or
      //    unpublished database record must remain unavailable.
      if (!isSupabaseConfigured && matchesBrandFallbackSlug(normalizedPath)) {
        setRoute('public_salon');
        setLoading(false);
        return;
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
    case 'auth_login':
      return <AuthLoginPage />;
    case 'reset_password':
      return <PasswordResetPage />;
    case 'signup':
      return <SignUpPage />;
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
    <ErrorBoundary>
      <AuthModalProvider>
        <RootRouter />
      </AuthModalProvider>
    </ErrorBoundary>
  </StrictMode>,
);
