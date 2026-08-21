import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import NearbySalonSearch from './components/NearbySalonSearch.tsx';
import { AuthModalProvider } from './components/AuthModalProvider.tsx';
import { applyBrandConfigToDocument } from './config/brandConfig.ts';
import './index.css';

// Apply white-label dynamic branding, theme CSS variables, and SEO tags on load
applyBrandConfigToDocument();

/**
 * The app has no router. `/nearby` is the public customer-facing salon
 * discovery route; every other path renders the existing application.
 * server.ts already rewrites unknown paths to index.html in production.
 */
const isNearbyRoute =
  window.location.pathname.replace(/\/+$/, '') === '/nearby';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthModalProvider>
      {isNearbyRoute ? (
        <div className="min-h-screen bg-[#f9f9f9] font-sans text-gray-900">
          <NearbySalonSearch />
        </div>
      ) : (
        <App />
      )}
    </AuthModalProvider>
  </StrictMode>,
);
