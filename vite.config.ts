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
        'X-Frame-Options': 'ALLOWALL',
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
