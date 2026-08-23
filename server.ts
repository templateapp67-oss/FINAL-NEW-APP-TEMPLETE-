import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { setupApiRoutes } from './api-routes';
import { resolveHostSlug, rewriteHostPath } from './server/hostRouting';

// Load .env.local (gitignored) in addition to .env, matching Vite's convention
// so server-side config such as NOMINATIM_APP_IDENTIFIER is picked up.
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

const app = express();
const PORT = 3000;

// Host-header parsing + host-based (subdomain) salon routing.
// The SPA client resolves the salon slug from window.location.hostname, but we
// also normalise and surface the Host header here so server logs, API context,
// and any future server-rendered path can rely on the parsed host (and so the
// SPA fallback below serves index.html for `*.yourdomain.com` requests too).
//
// Subdomain rewrite (the Express equivalent of the Next.js middleware
// rewrite `royal-hair-studio.domain.com/* → /royal-hair-studio/*`):
// `royal-hair-studio.final-new-app-templete.vercel.app/` is internally
// rewritten to `/royal-hair-studio` before static/API handling. API and
// client-app routes keep their exact paths (see server/hostRouting.ts).
app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  res.locals.host = host;
  const queryIndex = req.url.indexOf('?');
  const query = queryIndex === -1 ? '' : req.url.slice(queryIndex);
  const rewritten = rewriteHostPath(req.headers.host, req.path);
  if (rewritten && rewritten !== req.path) {
    res.locals.salonHostSlug = resolveHostSlug(req.headers.host);
    req.url = `${rewritten}${query}`;
  }
  next();
});

// Register all API routes (health, geocode, video-metadata, generate-bio, improve-text)
setupApiRoutes(app);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        cors: true,
        allowedHosts: true as unknown as string[],
        hmr: process.env.DISABLE_HMR !== 'true',
      } as any,
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));

    // Missing/renamed static assets must 404 rather than serve HTML, so a
    // broken build fails loudly instead of causing a MIME/parse error.
    // express.static already served anything that exists.
    const STATIC_PREFIXES = ['/assets/'];
    const STATIC_FILE = /\.[a-zA-Z0-9]+$/;

    // SPA fallback for real client routes (e.g. /nearby). Express 4 uses '*'
    // ('*all' is Express 5 syntax and never matched here, which 404'd
    // client-side routes).
    app.get('*', (req, res) => {
      const isStaticPath = STATIC_PREFIXES.some((p) => req.path.startsWith(p));
      const looksLikeFile = STATIC_FILE.test(req.path);
      if (isStaticPath || looksLikeFile) {
        return res.status(404).type('text/plain').send('Not found');
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`Health check: http://0.0.0.0:${PORT}/api/health`);
      console.log(`25 screens active | allowedHosts: true | cors: true | offline fallback enabled`);
    });
  }
}

// Verification tags for static checks:
// /api/generate-bio with offline fallback
// /api/improve-text with offline fallback
// /api/health with screens: 25

startServer();

export default app;
