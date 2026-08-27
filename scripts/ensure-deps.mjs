#!/usr/bin/env node
/**
 * Self-healing dependency bootstrap.
 *
 * WHY THIS EXISTS: sandbox/preview environments do not persist node_modules
 * between restarts. Every fresh boot used to fail with "tsx: not found" and
 * the preview showed an error page until someone manually re-ran npm install.
 *
 * This script runs before dev/build/start/preview: it probes the critical
 * binaries and reinstalls automatically (fast — warm npm cache) whenever
 * node_modules is missing or incomplete. Idempotent and silent when healthy.
 */
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binDir = path.join(root, 'node_modules', '.bin');

const REQUIRED = process.platform === 'win32'
  ? ['tsx.cmd', 'vite.cmd', 'esbuild.cmd']
  : ['tsx', 'vite', 'esbuild'];

const missing = REQUIRED.filter((bin) => !existsSync(path.join(binDir, bin)));

if (missing.length > 0) {
  console.log(`[ensure-deps] missing binaries (${missing.join(', ')}) — installing dependencies...`);
  execSync('npm install --no-audit --no-fund', { cwd: root, stdio: 'inherit' });
  const stillMissing = REQUIRED.filter((bin) => !existsSync(path.join(binDir, bin)));
  if (stillMissing.length > 0) {
    console.error(`[ensure-deps] install finished but still missing: ${stillMissing.join(', ')}`);
    process.exit(1);
  }
  console.log('[ensure-deps] dependencies restored.');
}
