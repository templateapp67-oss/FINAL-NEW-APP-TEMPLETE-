/**
 * Vercel Serverless Function — catch-all API handler.
 *
 * This file maps every request under /api/* to the same Express route
 * definitions used by the local server (api-routes.ts), so API behavior
 * is identical locally and on Vercel.
 *
 * Vercel requires the default export to be a Node.js request handler.
 */
import express from 'express';
import { setupApiRoutes } from '../api-routes';

const app = express();
setupApiRoutes(app);

export default app;
