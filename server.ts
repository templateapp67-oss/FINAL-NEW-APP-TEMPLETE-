import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { setupApiRoutes } from './api-routes';

// Load .env.local (gitignored) in addition to .env, matching Vite's convention
// so server-side config such as NOMINATIM_APP_IDENTIFIER is picked up.
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

const app = express();
const PORT = 3000;

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

startServer();

export default app;
