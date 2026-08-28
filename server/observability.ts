/**
 * M63 (infra) — request correlation, structured logging and baseline security
 * headers for every entry point (Express dev server and the Vercel functions).
 *
 * Closes three PARTIAL audit gaps at once:
 *   * "API logs are unstructured console calls with no request correlation ID"
 *     → every request gets an `x-request-id` (inbound honored, else generated)
 *       and one tenant-safe JSON log line (method, path, status, duration).
 *   * "no security headers configured" → X-Content-Type-Options,
 *     Referrer-Policy, Permissions-Policy, X-Frame-Options/frame-ancestors and
 *     HSTS on TLS responses. CSP is emitted in Report-Only mode by default so
 *     deployments can verify their asset/embed origins before enforcement
 *     (env: NEXORA_CSP, NEXORA_CSP_REPORT_ONLY, NEXORA_FRAME_ANCESTORS).
 *   * "no deep health" lives in api-routes.ts (/api/health/deep).
 *
 * The middleware never logs headers, query strings, bodies or user ids.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';

const REQUEST_ID_HEADER = 'x-request-id';

export function requestId(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = String(req.headers[REQUEST_ID_HEADER] || '').slice(0, 128);
    const id = /^[A-Za-z0-9._:-]{4,128}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id);
    (req as Request & { requestId?: string }).requestId = id;
    next();
  };
}

/** One structured line per completed API request. Tenant-safe by construction. */
export function structuredRequestLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/')) return next();
    const startedAt = Date.now();
    res.on('finish', () => {
      const line = {
        ts: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        kind: 'http_request',
        requestId: res.getHeader(REQUEST_ID_HEADER) || null,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      };
      const textLine = JSON.stringify(line);
      if (res.statusCode >= 500) console.error(textLine);
      else if (res.statusCode >= 400) console.warn(textLine);
      else console.log(textLine);
    });
    next();
  };
}

function frameAncestors(): string {
  const configured = (process.env.NEXORA_FRAME_ANCESTORS || '').trim();
  if (configured) return configured;
  // Default: same-origin only. Embed hosts (design tools, preview proxies)
  // must be added explicitly via NEXORA_FRAME_ANCESTORS.
  return "'self'";
}

/**
 * Baseline security headers. Deliberately conservative: no header here breaks
 * a standard SPA deployment; CSP ships report-only unless explicitly enforced.
 *
 * Framing protection (X-Frame-Options / frame-ancestors / HSTS) is emitted
 * only in production or when NEXORA_SECURITY_HEADERS=1, so local/preview
 * environments that legitimately embed the app (dev tools, sandbox previews)
 * keep working. Operators opt into strict framing at the edge.
 */
export function securityHeaders(): RequestHandler {
  const framingHeadersEnabled =
    process.env.NODE_ENV === 'production' || process.env.NEXORA_SECURITY_HEADERS === '1';
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self "https://checkout.razorpay.com")');
    if (framingHeadersEnabled) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors()}`);
      // HSTS only ever matters on TLS responses; proxies set the protocol.
      const proto = String(_req.headers['x-forwarded-proto'] || '');
      if (proto.includes('https')) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
    }
    // Report-only CSP (opt-in to enforcement with NEXORA_CSP_REPORT_ONLY=0).
    const csp = (process.env.NEXORA_CSP || '').trim();
    if (csp) {
      const reportOnly = process.env.NEXORA_CSP_REPORT_ONLY !== '0';
      res.setHeader(reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', csp);
    }
    next();
  };
}

/** All observability + hardening middleware in registration order. */
export function observabilityMiddleware(): RequestHandler[] {
  return [requestId(), structuredRequestLogger(), securityHeaders()];
}
