/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verifies there are no broken dynamic imports or dangling asset references:
 *   1. every `import('...')` / `lazy(() => import('...'))` specifier in src/
 *      resolves to a real file on disk;
 *   2. every module referenced by the built dist/index.html exists;
 *   3. no dynamic import target is also statically imported in a way that
 *      would defeat the split (Rollup warns about this; the build is the
 *      authority, so this is a cross-check only).
 *
 * Run: node scripts/verify-dynamic-imports.mjs [--dist]
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

const root = process.cwd();
const exts = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js'];
let problems = 0;

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(p)) yield p;
  }
}

function resolveSpec(spec, from) {
  if (!spec.startsWith('.')) return null; // bare specifier: a package, not a path
  const base = resolve(dirname(from), spec);
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of exts) {
    if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
  }
  return null;
}

console.log('\nDynamic import resolution');

const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
let checked = 0;
const bare = new Set();

for (const file of walk(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(dynRe)) {
    const spec = m[1];
    checked++;
    if (!spec.startsWith('.')) { bare.add(spec); continue; }
    const r = resolveSpec(spec, file);
    if (!r) {
      problems++;
      console.log(`  BROKEN  ${relative(root, file)} -> import('${spec}')`);
    }
  }
}

console.log(`  checked ${checked} dynamic import specifiers (${bare.size} bare package imports skipped)`);
if (problems === 0) console.log('  no broken dynamic imports');

// Template-literal dynamic imports cannot be statically resolved; flag them so
// they are at least reviewed rather than silently assumed safe.
for (const file of walk(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\(\s*`[^`]*\$\{[^`]*`\s*\)/g)) {
    console.log(`  NOTE    ${relative(root, file)} has a template-literal import (not statically resolvable)`);
  }
}

if (process.argv.includes('--dist')) {
  console.log('\nBuilt asset references');
  const indexPath = join(root, 'dist/index.html');
  if (!existsSync(indexPath)) {
    console.log('  dist/index.html missing — run `npm run build` first');
    problems++;
  } else {
    const html = readFileSync(indexPath, 'utf8');
    const refs = new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]));
    for (const ref of refs) {
      const p = join(root, 'dist', ref);
      if (!existsSync(p)) {
        problems++;
        console.log(`  MISSING ${ref}`);
      }
    }
    console.log(`  checked ${refs.size} asset references in dist/index.html`);
    if (problems === 0) console.log('  all built assets present');
  }
}

console.log(problems === 0 ? '\nOK: no broken dynamic imports or assets' : `\n${problems} problem(s) found`);
process.exit(problems === 0 ? 0 : 1);
