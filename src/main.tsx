import './polyfill';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import NearbySalonSearch from './components/NearbySalonSearch.tsx';
import PublicSalonView from './components/PublicSalonView.tsx';
import { AuthModalProvider } from './components/AuthModalProvider.tsx';
import { applyBrandConfigToDocument } from './config/brandConfig.ts';
import './index.css';

// Apply white-label dynamic branding, theme CSS variables, and SEO tags on load
applyBrandConfigToDocument();

/**
 * Path-based routing strategy using window.location.pathname.
 * Checks if the first segment of the path matches a known salon slug
 * (e.g. 'royal-hair-studio' or a custom saved slug) and renders PublicSalonView.
 * If the path is 'nearby', it renders NearbySalonSearch. Otherwise, it defaults to the App wizard.
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

const normalizedPath = window.location.pathname.replace(/^\/+/, '').split('/')[0] || '';
const isNearbyRoute = normalizedPath === 'nearby';

const savedSlug = getSavedSlug();
const knownSlugs = ['royal-hair-studio'];
if (savedSlug) {
  knownSlugs.push(savedSlug);
}

const isPublicSalonRoute = normalizedPath && normalizedPath !== 'nearby' && knownSlugs.includes(normalizedPath);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthModalProvider>
      {isNearbyRoute ? (
        <div className="min-h-screen bg-[#f9f9f9] font-sans text-gray-900">
          <NearbySalonSearch />
        </div>
      ) : isPublicSalonRoute ? (
        <PublicSalonView slug={normalizedPath} />
      ) : (
        <App />
      )}
    </AuthModalProvider>
  </StrictMode>,
);
