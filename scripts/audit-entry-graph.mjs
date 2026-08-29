// Walks ONLY static imports from an entry file and reports the largest
// statically-reachable modules — i.e. what cannot be deferred out of the
// entry chunk. Dynamic `import()` edges are recorded but not followed.
import {readFileSync, statSync, existsSync} from 'node:fs';
import {dirname, resolve, relative} from 'node:path';

const root = process.cwd();
const entry = process.argv[2] || 'src/main.tsx';
const exts = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];

function resolveSpec(spec, from) {
  if (!spec.startsWith('.')) return null;              // bare specifier = vendor
  const base = resolve(dirname(from), spec);
  for (const e of ['', ...exts]) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const seen = new Set();
const dyn = new Set();
function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { return; }
  // static: import ... from '...'  /  import '...'  /  export ... from '...'
  const staticRe = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of src.matchAll(dynRe)) {
    const r = resolveSpec(m[1], file);
    if (r) dyn.add(r);
  }
  // strip dynamic imports so they are not mistaken for static edges
  const stripped = src.replace(dynRe, 'DYNAMIC');
  for (const m of stripped.matchAll(staticRe)) {
    const spec = m[1] || m[2];
    if (!spec) continue;
    const r = resolveSpec(spec, file);
    if (r) walk(r);
  }
}

walk(resolve(root, entry));

const rows = [...seen].map((f) => ({
  f: relative(root, f),
  lines: readFileSync(f, 'utf8').split('\n').length,
  bytes: statSync(f).size,
})).sort((a, b) => b.bytes - a.bytes);

const total = rows.reduce((s, r) => s + r.bytes, 0);
console.log(`static graph from ${entry}: ${rows.length} modules, ${(total / 1024).toFixed(1)} kB source`);
console.log(`(dynamic-only targets excluded: ${dyn.size})\n`);
console.log('TOP 25 statically-reachable modules:');
for (const r of rows.slice(0, 25)) {
  console.log(`  ${(r.bytes / 1024).toFixed(1).padStart(7)} kB  ${String(r.lines).padStart(5)}L  ${r.f}`);
}
