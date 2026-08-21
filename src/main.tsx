import './polyfill';
import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import NearbySalonSearch from './components/NearbySalonSearch.tsx';
import PublicSalonView from './components/PublicSalonView.tsx';
import NotFound from './components/NotFound.tsx';
import { AuthModalProvider } from './components/AuthModalProvider.tsx';
import { applyBrandConfigToDocument } from './config/brandConfig.ts';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.ts';
import './index.css';

// Apply white-label dynamic branding, theme CSS variables, and SEO tags on load
applyBrandConfigToDocument();

/**
 * Helper to get the salon slug saved in local onboarding storage.
 */
const getSavedSlug = (): string => {
  try {
    const saved = localStorage.getItem('nexora_onboarding_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.data?.websiteSlug) {
        return parsed.data.websiteSlug;
      }
    }
  } catch (e) {
    // Ignore
  }
  return '';
};

/**
 * Dynamic path-based routing component.
 * Evaluates the pathname, dynamically querying Supabase 'salons' table for registered slugs
 * to prevent 404 errors for any dynamic paths, while loading a fallback NotFound page when 
 * no slug is found.
 */
function RootRouter() {
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<'app' | 'nearby' | 'public_salon' | 'not_found'>('app');

  const normalizedPath = window.location.pathname.replace(/^\/+/, '').split('/')[0] || '';

  useEffect(() => {
    async function resolveRoute() {
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

      // 3. Local fallback check (royal-hair-studio default or user-created local session)
      const savedSlug = getSavedSlug();
      const localKnownSlugs = ['royal-hair-studio'];
      if (savedSlug) {
        localKnownSlugs.push(savedSlug);
      }

      if (localKnownSlugs.includes(normalizedPath)) {
        setRoute('public_salon');
        setLoading(false);
        return;
      }

      // 4. Supabase DB checking (dynamic slug lookup)
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase
            .from('salons')
            .select('slug')
            .eq('slug', normalizedPath)
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
  }, [normalizedPath]);

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

