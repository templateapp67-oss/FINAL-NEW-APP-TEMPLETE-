/**
 * Shared migration-file inventory for the offline (PGlite) test suites.
 *
 * The repo contains two divergent database designs:
 *   • Design A — M01–M27 ("spec / 90-point", business-keyed) — the immutable
 *     replay history exercised by the Phase 7/8 suites.
 *   • Design B — M28–M40 + live helpers (salon-keyed canonical) — applied on
 *     the live project, never replayed on top of Design A (M28's fail-closed
 *     preflight would reject the business-keyed world).
 *
 * Keep the Design-A filter in ONE place so a new migration can never silently
 * break the historical replay (or, worse, be replayed in the wrong world).
 */

/** True when `name` belongs to the immutable M01–M27 Design-A history. */
export function isHistoricalMigration(name) {
  return !name.includes('_phase1a_')
    && !name.includes('_phase2_')
    && !name.includes('_phase2a_')
    && !name.includes('_phase2b_')
    && !name.includes('_phase2c_')
    && !name.includes('_phase3a_')
    && !name.includes('_phase3b_')
    && !name.includes('_m38_')
    && !name.includes('_reconciliation_')
    && !name.includes('_m39_')
    && !name.includes('_m40_')
    && !name.includes('_m41_')
    && !name.includes('_owner_publish_')
    && !name.includes('setup_public_salon_v2')
    && !name.includes('dynamic_multitenant');
}
