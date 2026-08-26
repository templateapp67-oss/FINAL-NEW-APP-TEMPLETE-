/**
 * Vercel Serverless Function — catch-all API handler.
 *
 * All validation, CORS, auth, payment and webhook behavior comes from the same
 * route registrar used by the standalone server. Keeping one implementation
 * prevents production security drift.
 */
import express from 'express';
import { setupApiRoutes } from '../api-routes';

const app = express();
setupApiRoutes(app);

export default app;
