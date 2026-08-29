// Dead-code audit: find modules under src/ that no other module imports.
// Resolves relative and alias-style specifiers; anything never imported and not
// an entry point is a deletion candidate.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, dirname, resolve, extname } from 'node:path';

const SRC = 'src';

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

const files = [];
for await (const f of walk(SRC)) files.push(f);
const fileSet = new Set(files.map((f) => resolve(f)));

// Entry points that are legitimately never imported by another module.
const ENTRIES = new Set(['src/main.tsx', 'src/vite-env.d.ts'].map((f) => resolve(f)));

const imported = new Set();
const specifierRe = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function resolveSpecifier(spec, fromFile) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // bare package
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.d.ts`,
    join(base, 'index.ts'), join(base, 'index.tsx'),
  ];
  for (const c of candidates) if (fileSet.has(c)) return c;
  return null;
}

for (const file of files) {
  const src = await readFile(file, 'utf8');
  let m;
  while ((m = specifierRe.exec(src))) {
    const target = resolveSpecifier(m[1], file);
    if (target && target !== resolve(file)) imported.add(target);
  }
}

const orphans = files
  .map((f) => resolve(f))
  .filter((f) => !imported.has(f) && !ENTRIES.has(f))
  .map((f) => relative(process.cwd(), f))
  .sort();

let orphanLines = 0;
for (const o of orphans) {
  const txt = await readFile(o, 'utf8');
  const lines = txt.split('\n').length;
  orphanLines += lines;
  console.log(`  ${String(lines).padStart(5)}  ${o}`);
}

console.log(`\nscanned ${files.length} modules; ${imported.size} imported`);
console.log(`UNREFERENCED: ${orphans.length} files, ${orphanLines} lines`);
