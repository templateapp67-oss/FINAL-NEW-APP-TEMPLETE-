// Reports modules reachable from B but not from A — i.e. what a lazy chunk
// must carry that the entry chunk does not already have.
import {readFileSync, statSync, existsSync} from 'node:fs';
import {dirname, resolve, relative} from 'node:path';

const root = process.cwd();
const exts = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
const staticRe = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function resolveSpec(spec, from) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const e of ['', ...exts]) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
function graph(entry) {
  const seen = new Set();
  (function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    let src; try { src = readFileSync(file, 'utf8'); } catch { return; }
    const stripped = src.replace(dynRe, 'DYNAMIC');
    for (const m of stripped.matchAll(staticRe)) {
      const spec = m[1] || m[2];
      if (!spec) continue;
      const r = resolveSpec(spec, file);
      if (r) walk(r);
    }
  })(resolve(root, entry));
  return seen;
}

const A = graph(process.argv[2]);
const B = graph(process.argv[3]);
const only = [...B].filter((f) => !A.has(f)).map((f) => ({
  f: relative(root, f), bytes: statSync(f).size,
  lines: readFileSync(f, 'utf8').split('\n').length,
})).sort((a, b) => b.bytes - a.bytes);
const total = only.reduce((s, r) => s + r.bytes, 0);
console.log(`${only.length} modules in ${process.argv[3]} but not ${process.argv[2]} — ${(total/1024).toFixed(1)} kB source\n`);
for (const r of only.slice(0, 20)) {
  console.log(`  ${(r.bytes/1024).toFixed(1).padStart(7)} kB  ${String(r.lines).padStart(5)}L  ${r.f}`);
}
