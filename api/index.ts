/**
 * Exact `/api` Vercel entrypoint.
 *
 * Keep this serverless module pure: importing it must never start Vite, serve
 * static files, or call listen(). Subpaths are handled by [[...path]].
 */
export { default } from './[[...path]]';
