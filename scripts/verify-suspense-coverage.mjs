// Verifies every lazy() component render site sits inside a <Suspense> boundary.
// Run: node scripts/verify-suspense-coverage.mjs  (exits 1 on any missing wrapper)
// For every lazy() component, confirm each JSX usage sits inside a <Suspense>
// opened earlier in the same file and not yet closed.
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
function walk(d, out=[]) { for (const e of readdirSync(d)) { const p=join(d,e);
  const s=statSync(p); if (s.isDirectory()) walk(p,out); else if (/\.tsx?$/.test(p)) out.push(p);} return out; }
let bad=0, checked=0;
for (const f of walk('src')) {
  const src=readFileSync(f,'utf8');
  const names=[...src.matchAll(/const ([A-Za-z0-9_]+) = lazy\(/g)].map(m=>m[1]);
  if (!names.length) continue;
  for (const n of names) {
    const useRe=new RegExp(`<${n}[\\s/>]`,'g');
    for (const m of src.matchAll(useRe)) {
      checked++;
      const before=src.slice(0,m.index);
      const opens=(before.match(/<Suspense/g)||[]).length;
      const closes=(before.match(/<\/Suspense>/g)||[]).length;
      const ok=opens>closes;
      if(!ok){bad++;console.log(`  MISSING Suspense: <${n}> in ${f}`);}
    }
  }
}
console.log(`\nchecked ${checked} lazy-component render sites; ${bad} without a wrapping <Suspense>`);
process.exit(bad?1:0);
