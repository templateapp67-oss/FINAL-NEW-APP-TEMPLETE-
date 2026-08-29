#!/usr/bin/env node
/**
 * Guarded live migration utility.
 *
 * Bulk migration application is disabled. The repository has mutually
 * exclusive Design-A and canonical Design-B histories, so this tool can only:
 *   - print/introspect an explicit manifest (never apply it), or
 *   - apply one explicitly named reviewed additive migration.
 *
 * Prefer the official Supabase migration workflow so its ledger is updated.
 * This Management API path exists for already-reviewed emergency additions and
 * requires an explicit canonical-project confirmation.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEXORA_PROJECT_REF } from '../shared/supabaseProject.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(root, 'supabase', 'migrations');
const CONFIG_PATH = join(root, 'supabase', 'config.toml');
const MANIFEST_DIR = join(root, 'supabase', 'manifests');

const TARGETS = {
  m38: {
    file: '20260822000101_m38_reconciliation_fix.sql',
    verifier: 'verify_m38_reconciliation',
  },
  m40: {
    file: '20260822000301_m40_service_catalog_commerce_rpc.sql',
    verifier: 'verify_m40_service_catalog',
  },
  m45: {
    file: '20260824000201_m45_business_slug_hardening.sql',
    verifier: 'verify_m45_business_slug_hardening',
  },
  m46: {
    file: '20260824000301_m46_public_access_security.sql',
    verifier: 'verify_m46_public_access_security',
  },
  m53: {
    file: '20260825000401_m53_provision_salon_slug_fix.sql',
    verifier: 'verify_m53_provision_salon_slug',
  },
  m54: {
    file: '20260825000501_m54_workspace_bootstrap_compatibility.sql',
    verifier: 'verify_m54_workspace_bootstrap',
  },
  m55: {
    file: '20260825000601_m55_actor_bound_booking_authorization.sql',
    verifier: 'verify_m55_actor_bound_booking_authorization',
  },
  m56: {
    file: '20260825000701_m56_owner_profile_theme_preflight.sql',
    verifier: 'verify_m56_owner_profile_theme_preflight',
  },
  m57: {
    file: '20260826000101_m57_detach_legacy_showcase_tenant.sql',
    verifier: 'verify_m57_showcase_tenant_detachment',
  },
  m59: {
    file: '20260827000201_m59_owner_provision_invitation_fix.sql',
    verifier: 'verify_m54_workspace_bootstrap',
  },
  m60: {
    file: '20260828000101_m60_payment_refunds.sql',
    verifier: 'verify_m60_payment_refunds',
  },
  m61: {
    file: '20260828000201_m61_booking_reschedule.sql',
    verifier: 'verify_m61_booking_reschedule',
  },
  m62: {
    file: '20260828000301_m62_privacy_lifecycle.sql',
    verifier: 'verify_m62_privacy_lifecycle',
  },
  m63: {
    file: '20260829000101_m63_owner_provisioning_invitation_guard_fix.sql',
    verifier: 'verify_m63_owner_provisioning',
  },
  m64: {
    file: '20260829000201_m64_deprecate_m58_workspace_membership.sql',
    verifier: 'verify_m64_m58_deprecation',
  },
};

function parseProjectRef(configText) {
  const match = configText.match(/^project_id\s*=\s*["']?([A-Za-z0-9_-]+)["']?/m);
  return match ? match[1] : null;
}

async function resolveProjectRef() {
  let ref = process.env.SUPABASE_PROJECT_REF?.trim();
  if (!ref) {
    const text = await readFile(CONFIG_PATH, 'utf8');
    ref = parseProjectRef(text);
  }
  if (!ref) throw new Error('Could not resolve the Supabase project reference.');
  if (ref !== NEXORA_PROJECT_REF) {
    throw new Error(`Refusing project ${ref}; this checkout is pinned to ${NEXORA_PROJECT_REF}.`);
  }
  return ref;
}

function selectedTarget(argv) {
  const selected = Object.entries(TARGETS).filter(([key]) => argv.includes(`--${key}`));
  if (selected.length > 1) throw new Error('Select exactly one migration target.');
  return selected[0]?.[1] ?? null;
}

function argumentValue(argv, name) {
  const prefix = `${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

async function runSql(accessToken, projectRef, sql) {
  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 2000);
    throw new Error(`Management API ${response.status}: ${detail}`);
  }
  return response.json();
}

function resultRows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.result)) return result.result;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function printVerify(result, fnName) {
  const rows = resultRows(result);
  if (rows.length === 0) throw new Error(`${fnName}() returned no verification rows.`);
  let allOk = true;
  console.log(`${fnName}():`);
  for (const row of rows) {
    const passed = row.ok === true || row.ok === 't' || row.ok === 'true';
    allOk &&= passed;
    console.log(`  ${passed ? 'PASS' : 'FAIL'} ${row.check_name} — ${row.detail || ''}`);
  }
  if (!allOk) throw new Error(`${fnName}() reported one or more failed checks.`);
}

async function printManifestPlan(id, argv) {
  const filename = id === 'clean-bootstrap'
    ? 'clean-bootstrap.json'
    : id === 'existing-project' ? 'existing-project-reconciliation.json' : null;
  if (!filename) throw new Error('Manifest must be clean-bootstrap or existing-project.');
  const manifest = JSON.parse(await readFile(join(MANIFEST_DIR, filename), 'utf8'));
  console.log(JSON.stringify(manifest, null, 2));

  if (!argv.includes('--introspect')) {
    console.log('\nPlan only. No database request was made and no SQL was applied.');
    return;
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required for read-only introspection.');
  const projectRef = await resolveProjectRef();
  const snapshotSql = `
    select json_build_object(
      'tables', coalesce((
        select json_agg(t.table_name order by t.table_name)
        from information_schema.tables t
        where t.table_schema = 'public'
      ), '[]'::json),
      'columns', coalesce((
        select json_agg(
          json_build_object('table', c.table_name, 'column', c.column_name, 'type', c.data_type)
          order by c.table_name, c.ordinal_position
        )
        from information_schema.columns c
        where c.table_schema = 'public'
      ), '[]'::json),
      'routines', coalesce((
        select json_agg(r.routine_name order by r.routine_name)
        from information_schema.routines r
        where r.routine_schema in ('public','private')
      ), '[]'::json),
      'migrationLedgerPresent', to_regclass('supabase_migrations.schema_migrations') is not null
    ) as snapshot;
  `;
  const response = await runSql(token, projectRef, snapshotSql);
  const snapshot = resultRows(response)[0]?.snapshot ?? response;
  const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  console.log('\nREAD-ONLY LIVE INTROSPECTION');
  console.log(JSON.stringify({ projectRef, fingerprint, snapshot }, null, 2));
  console.log('\nNo SQL was applied. Review and preserve this fingerprint with the deployment record.');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--all')) {
    throw new Error('Bulk migration application is disabled. Use --manifest=existing-project for a non-applying plan.');
  }

  const manifestId = argumentValue(argv, '--manifest');
  if (manifestId) {
    await printManifestPlan(manifestId, argv);
    return;
  }

  const target = selectedTarget(argv);
  if (!target) {
    throw new Error(
      'No migration selected. Use --manifest=existing-project, or one reviewed target such as --m56/--m57.',
    );
  }

  const projectRef = await resolveProjectRef();
  const verifyOnly = argv.includes('--verify-only');
  const confirmation = argumentValue(argv, '--confirm-project');
  if (!verifyOnly && confirmation !== projectRef) {
    throw new Error(`Refusing write. Re-run with --confirm-project=${projectRef} after reviewing live introspection.`);
  }
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN is required for a live migration.');

  console.log(`Target project: ${projectRef}`);
  console.log(`Reviewed additive file: ${target.file}`);
  if (!verifyOnly) {
    const sql = await readFile(join(MIGRATIONS_DIR, target.file), 'utf8');
    await runSql(accessToken, projectRef, sql);
    console.log('Migration SQL applied.');
  }

  const verifySql = `select check_name, ok, detail from public.${target.verifier}() order by check_name;`;
  const verification = await runSql(accessToken, projectRef, verifySql);
  printVerify(verification, target.verifier);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
