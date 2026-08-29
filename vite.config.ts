import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // This Vite app accepts the historical NEXT_PUBLIC_* Supabase env aliases
    // used by earlier Nexora deployments in addition to the native VITE_* names.
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // NOTE: build.chunkSizeWarningLimit is deliberately left at Vite's
      // default 500 kB. The entry chunk is ~284 kB because every theme
      // renderer, the owner workspace, the wizard and the owner dashboard are
      // code-split. Do not raise this limit to silence a warning — a chunk
      // crossing 500 kB again means something stopped being lazy.
      // Split long-lived vendor code out of the application chunk. Previously
      // everything landed in a single ~2.5 MB bundle, which both tripped
      // Vite's chunk-size warning and forced a full re-download of React and
      // the Supabase client on every app-code change. Tree-shaking is
      // preserved: these are assigned per-module, not per-package barrel.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            // React and its scheduler must stay together in one chunk; mixing
            // them across chunks produces duplicate React instances.
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (/[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) {
              return 'vendor-motion';
            }
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (/[\\/]node_modules[\\/](leaflet|@leaflet)[\\/]/.test(id)) return 'vendor-leaflet';
            return 'vendor';
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      cors: true,
      allowedHosts: true as unknown as string[],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      headers: {
        // IMPORTANT: never send an invalid X-Frame-Options here. 'ALLOWALL'
        // is NOT a valid value — browsers treat an invalid value as DENY and
        // silently refuse to render the app inside the preview iframe, which
        // shows up as a WHITE SCREEN. Allow embedding explicitly via CSP.
        'Content-Security-Policy': 'frame-ancestors *',
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      cors: true,
      allowedHosts: true as unknown as string[],
    },
  };
});
