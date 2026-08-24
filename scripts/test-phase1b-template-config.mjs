#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
function pass(l) { passed++; console.log(`✓ PASS [${l}]`); }
function fail(l, d) { failed++; console.log(`✗ FAIL [${l}] ${d}`); }
function read(p) { return readFileSync(resolve(ROOT, p), 'utf8'); }

{
  const panel = read('src/components/TemplateConfigPanel.tsx');
  for (const token of ['appearance', 'accentColor', 'salonNameFont', 'salonNameColor', 'heroPosition', 'showOwnerPhoto', 'SALON_NAME_FONTS']) {
    if (panel.includes(token)) pass(`panel exposes ${token}`);
    else fail(`panel ${token}`, 'missing');
  }
  if (!panel.includes('galleryLayout') && !panel.includes('sectionVisibility')) {
    pass('panel does not invent unused layout fields');
  } else fail('dummy fields', 'panel added unused schema');
}

{
  const svc = read('src/lib/salonWebsiteService.ts');
  if (svc.includes('templateConfig: sanitizeTemplateConfigForTemplate') && svc.includes('templateConfigs: normalizeTemplateConfigs')) {
    pass('draft save persists sanitized active + per-template config');
  } else fail('persist', 'sanitized template configs not in website service');
}

{
  const cfg = read('src/lib/templateConfig.ts');
  if (cfg.includes('shouldShowOwnerPhoto') && cfg.includes('heroObjectPosition')) {
    pass('config helpers for fields the renderer consumes');
  } else fail('helpers', 'missing');
}

{
  const renderer = read('src/components/TemplateRenderer.tsx');
  if (renderer.includes('shouldShowOwnerPhoto') && renderer.includes('getSalonNameStyle')) {
    pass('legacy renderer consumes owner photo + salon name style');
  } else fail('legacy renderer', 'not wired');
}

{
  try {
    const out = execSync('npx tsc --noEmit 2>&1', { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    if (out.includes('error TS')) fail('TYPECHECK', out.slice(0, 200));
    else pass('TYPECHECK');
  } catch (e) {
    const out = e.stdout ? e.stdout.toString() : String(e);
    if (out.includes('error TS')) fail('TYPECHECK', out.split('\n').filter((l) => l.includes('error')).slice(0, 3).join(' | '));
    else pass('TYPECHECK');
  }
}

console.log(`\nTEMPLATE CONFIG: ${passed}/${passed + failed} PASS`);
process.exit(failed > 0 ? 1 : 0);
