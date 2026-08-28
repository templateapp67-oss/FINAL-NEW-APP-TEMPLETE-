/**
 * M62 — authenticated privacy lifecycle routes.
 *
 * Closes the audit FAIL "no account deletion, customer data export/access
 * request, correction workflow or anonymization". The data subject is ALWAYS
 * the bearer-token user: no user id is accepted from the request body or
 * query, so one account can never export or erase another.
 */
import type { Express, Request, Response } from 'express';
import { getSupabaseAdmin, requireAuthenticatedUser } from './supabaseAdmin';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function setupPrivacyRoutes(app: Express): void {
  /** GDPR-style access request: one JSON document with everything we hold. */
  app.get('/api/account/export', async (req: Request, res: Response) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const { data, error } = await getSupabaseAdmin().rpc('export_user_data_for_actor', {
        p_actor_user_id: user.id,
      });
      if (error) throw error;

      res.setHeader('Content-Disposition', `attachment; filename="my-data-${user.id}.json"`);
      return res.status(200).json({
        exportVersion: 1,
        generatedAt: new Date().toISOString(),
        data: data ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = /Authentication is required|session|bearer/i.test(message) ? 401
        : /not configured/i.test(message) ? 503 : 500;
      if (status === 500) console.error('Account export failed:', message);
      return res.status(status).json({
        error: status === 401
          ? 'Authentication required.'
          : status === 503
            ? 'The account service is not configured on this deployment.'
            : 'Unable to export your data right now.',
      });
    }
  });

  /**
   * Erasure request. Two-phase on purpose:
   *  1. anonymize_user_data_for_actor scrubs profile PII and releases
   *     upcoming slots while preserving the salon's financial ledger;
   *  2. only after that commits does the trusted server delete the auth
   *     identity through the Admin API (profiles cascade on delete).
   * Requires an explicit confirmation so a stray request cannot erase an
   * account. The operation is idempotent: repeating it is a no-op.
   */
  app.post('/api/account/delete', async (req: Request, res: Response) => {
    try {
      const user = await requireAuthenticatedUser(req);
      const confirmation = text(req.body?.confirm);
      if (confirmation !== 'DELETE' && req.body?.confirm !== true) {
        return res.status(400).json({
          error: 'Account deletion is irreversible. Send { "confirm": "DELETE" } to proceed.',
        });
      }

      const admin = getSupabaseAdmin();
      const { data, error } = await admin.rpc('anonymize_user_data_for_actor', {
        p_actor_user_id: user.id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;

      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) {
        // The ledger scrub already committed; report the partial state
        // honestly instead of pretending the erasure finished.
        console.error('Auth user deletion failed after anonymization:', deleteError.message);
        return res.status(500).json({
          error: 'Your personal data was anonymized, but the login identity could not be deleted yet. Please retry.',
          anonymized: true,
          identityDeleted: false,
        });
      }

      return res.status(200).json({
        success: true,
        anonymized: row?.profile_scrubbed === true,
        releasedUpcomingBookings: Number(row?.bookings_touched ?? 0),
        identityDeleted: true,
        note: 'Sign-in is no longer possible for this account. Financial records are retained as pseudonymous business records.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = /Authentication is required|session|bearer/i.test(message) ? 401
        : /not configured/i.test(message) ? 503 : 500;
      if (status === 500) console.error('Account deletion failed:', message);
      return res.status(status).json({
        error: status === 401
          ? 'Authentication required.'
          : status === 503
            ? 'The account service is not configured on this deployment.'
            : 'Unable to delete your account right now.',
      });
    }
  });
}
