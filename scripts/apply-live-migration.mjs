#!/usr/bin/env node
/**
 * Apply Nexora migrations to the LIVE Supabase project programmatically —
 * no SQL editor, no manual `supabase gen types`.
 *
 * It calls the Supabase Management API "database query" endpoint
 * (`POST /v1/projects/{ref}/database/query`) which executes arbitrary SQL on
 * the project's database using ONLY a Management API access token
 * (`SUPABASE_ACCESS_TOKEN`, the `sbp_...` secret). This is the exact mechanism
 * `supabase db push` uses under the hood, exposed here as a single script so
 * the migration can be applied from a CI/deploy step with zero manual steps.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live          # apply M28 only
 *   SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live -- --all  # apply M28–M35 in order
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  (required)  Management API access token (starts with sbp_)
 *   SUPABASE_PROJECT_REF   (optional)  overrides supabase/config.toml project_id
 *
 * The migration files are idempotent and fail-closed, so re-running is safe.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(root, 'supabase', 'migrations');
const CONFIG_PATH = join(root, 'supabase', 'config.toml');

const CHAIN_M28_TO_M35 = [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
  '20260821000501_m32_phase2_canonical_foundation.sql',
  '20260821000601_m33_phase2a_hardening.sql',
  '20260821000701_m34_phase2b_final_hardening.sql',
  '20260821000801_m35_phase2c_canonical_theme_slugs.sql',
];

function parseProjectRef(configText) {
  const match = configText.match(/^project_id\s*=\s*["']?([A-Za-z0-9_-]+)["']?/m);
  return match ? match[1] : null;
}

async function resolveProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF?.trim()) return process.env.SUPABASE_PROJECT_REF.trim();
  try {
    const text = await readFile(CONFIG_PATH, 'utf8');
    const ref = parseProjectRef(text);
    if (ref) return ref;
  } catch {
    /* fall through to error below */
  }
  throw new Error(
    'Could not resolve the Supabase project reference. Set SUPABASE_PROJECT_REF ' +
    'or ensure supabase/config.toml has a `project_id`.',
  );
}

function resolveFiles(applyAll) {
  if (!applyAll) return [CHAIN_M28_TO_M35[0]];
  return CHAIN_M28_TO_M35;
}

async function runSql(accessToken, projectRef, sql) {
  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 2000);
    throw new Error(`Management API ${res.status}: ${detail}`);
  }
  return res.json();
}

async function main() {
  const applyAll = process.argv.includes('--all');
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    console.error(
      '\nSUPABASE_ACCESS_TOKEN is not set. This script applies the migration to the live\n' +
      'project, which requires a Supabase Management API token (starts with "sbp_").\n' +
      'The token is a live secret that must be supplied by the deployment environment;\n' +
      'it is never stored in this repository.\n',
    );
    process.exit(2);
  }

  const projectRef = await resolveProjectRef();
  const files = resolveFiles(applyAll);

  console.log(`Target project: ${projectRef}`);
  console.log(`Files to apply (${files.length}):`);
  for (const f of files) console.log(`  - ${f}`);

  let applied = 0;
  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`Applying ${file} ... `);
    try {
      await runSql(accessToken, projectRef, sql);
      console.log('OK');
      applied += 1;
    } catch (err) {
      console.log('FAILED');
      console.error(err instanceof Error ? err.message : err);
      console.error('\nStopping before applying the remaining files.');
      process.exit(1);
    }
  }

  console.log(`\nDone. ${applied}/${files.length} migration file(s) applied to ${projectRef}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
