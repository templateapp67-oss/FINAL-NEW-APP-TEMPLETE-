#!/usr/bin/env node
/**
 * Apply Nexora migrations to the LIVE Supabase project programmatically —
 * no SQL editor, no manual `supabase gen types`.
 *
 * It calls the Supabase Management API "database query" endpoint
 * (`POST /v1/projects/{ref}/database/query`) which executes arbitrary SQL on
 * the project's database using ONLY a Management API access token
 * (`SUPABASE_ACCESS_TOKEN`, the `sbp_...` secret).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live            # M28 only
 *   SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live:m38        # M38 only
 *   SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live:m40        # M40 only
 *   SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live:m46        # M46 only
 *   SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live -- --all   # M28–M46
 *   SUPABASE_ACCESS_TOKEN=<sbp_...> npm run db:apply:live -- --verify
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  (required)  Management API access token (starts with sbp_)
 *   SUPABASE_PROJECT_REF   (optional)  overrides supabase/config.toml project_id
 *
 * The migration files are idempotent and fail-closed, so re-running is safe.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(root, 'supabase', 'migrations');
const CONFIG_PATH = join(root, 'supabase', 'config.toml');

const CHAIN_M28_TO_M46 = [
  '20260821000101_m28_phase1a_unified_salon_foundation.sql',
  '20260821000201_m29_phase1a_razorpay_foundation.sql',
  '20260821000301_m30_phase1a_storage_foundation.sql',
  '20260821000401_m31_phase1a_authoritative_booking_creation.sql',
  '20260821000501_m32_phase2_canonical_foundation.sql',
  '20260821000601_m33_phase2a_hardening.sql',
  '20260821000701_m34_phase2b_final_hardening.sql',
  '20260821000801_m35_phase2c_canonical_theme_slugs.sql',
  '20260821000901_m36_phase3a_auth_profiles_roles.sql',
  '20260821001001_m37_phase3b_multitenant_rls.sql',
  '20260822000101_m38_reconciliation_fix.sql',
  '20260822000201_m39_owner_publish_website.sql',
  '20260822000301_m40_service_catalog_commerce_rpc.sql',
  '20260823000101_m41_website_guest_bookings.sql',
  '20260823000201_m42_owner_self_provisioning.sql',
  '20260823000301_m43_rls_isolation_verify.sql',
  '20260823000401_phase1_whitelabel_provisioning.sql',
  '20260824000101_m44_business_publishing.sql',
  '20260824000201_m45_business_slug_hardening.sql',
  '20260824000301_m46_public_access_security.sql',
];

const M38 = '20260822000101_m38_reconciliation_fix.sql';
const M40 = '20260822000301_m40_service_catalog_commerce_rpc.sql';
const M45 = '20260824000201_m45_business_slug_hardening.sql';
const M46 = '20260824000301_m46_public_access_security.sql';

const VERIFY_SQL = `
select check_name, ok, detail
from public.verify_m38_reconciliation()
order by check_name;
`.trim();

const VERIFY_SQL_M40 = `
select check_name, ok, detail
from public.verify_m40_service_catalog()
order by check_name;
`.trim();

const VERIFY_SQL_M45 = `
select check_name, ok, detail
from public.verify_m45_business_slug_hardening()
order by check_name;
`.trim();

const VERIFY_SQL_M46 = `
select check_name, ok, detail
from public.verify_m46_public_access_security()
order by check_name;
`.trim();

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
    /* fall through */
  }
  throw new Error(
    'Could not resolve the Supabase project reference. Set SUPABASE_PROJECT_REF ' +
    'or ensure supabase/config.toml has a `project_id`.',
  );
}

function resolveFiles(argv) {
  if (
    argv.includes('--verify') &&
    !argv.includes('--m38') && !argv.includes('--m40') &&
    !argv.includes('--m45') && !argv.includes('--m46') && !argv.includes('--all')
  ) return [];
  if (argv.includes('--m38')) return [M38];
  if (argv.includes('--m40')) return [M40];
  if (argv.includes('--m45')) return [M45];
  if (argv.includes('--m46')) return [M46];
  if (argv.includes('--all')) return CHAIN_M28_TO_M46;
  return [CHAIN_M28_TO_M46[0]];
}

function verifySqlFor(files) {
  if (files.includes(M46)) return VERIFY_SQL_M46;
  if (files.includes(M45)) return VERIFY_SQL_M45;
  if (files.includes(M40)) return VERIFY_SQL_M40;
  return VERIFY_SQL;
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

function printVerify(result, fnName) {
  const rows = Array.isArray(result) ? result : result?.result || result?.data || [];
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(`${fnName}(): (no rows returned)`);
    console.log(JSON.stringify(result, null, 2).slice(0, 1500));
    return false;
  }
  let allOk = true;
  console.log(`${fnName}():`);
  for (const row of rows) {
    const ok = row.ok === true || row.ok === 't' || row.ok === 'true';
    if (!ok) allOk = false;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${row.check_name} — ${row.detail || ''}`);
  }
  return allOk;
}

async function main() {
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
  const files = resolveFiles(process.argv);
  const wantVerify = process.argv.includes('--verify') || files.includes(M38) || files.includes(M40) || files.includes(M45) || files.includes(M46);
  const verifySql = verifySqlFor(files);
  const verifyFnName = files.includes(M46)
    ? 'verify_m46_public_access_security'
    : files.includes(M45)
      ? 'verify_m45_business_slug_hardening'
    : files.includes(M40) ? 'verify_m40_service_catalog' : 'verify_m38_reconciliation';

  console.log(`Target project: ${projectRef}`);
  if (files.length) {
    console.log(`Files to apply (${files.length}):`);
    for (const f of files) console.log(`  - ${f}`);
  } else {
    console.log('No migration files selected (verify-only).');
  }

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

  if (files.length) {
    console.log(`\nDone. ${applied}/${files.length} migration file(s) applied to ${projectRef}.`);
  }

  if (wantVerify) {
    process.stdout.write(`\nRunning ${verifyFnName}() ... `);
    try {
      const result = await runSql(accessToken, projectRef, verifySql);
      console.log('OK');
      const allOk = printVerify(result, verifyFnName);
      if (!allOk) {
        console.error('\nOne or more live verification checks failed.');
        process.exit(1);
      }
    } catch (err) {
      console.log('FAILED');
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
