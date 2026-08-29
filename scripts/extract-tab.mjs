// Extracts one `{activeTab === 'x' && ( ... )}` block from Landing.tsx into
// src/components/dashboard/<Name>.tsx and replaces it with a lazy panel.
// Prints the block so dependencies can be resolved from tsc output.
import {readFileSync, writeFileSync} from 'node:fs';

const [, , tab, componentName] = process.argv;
const landing = 'src/screens/Landing.tsx';
const lines = readFileSync(landing, 'utf8').split('\n');

const marker = `{activeTab === '${tab}' && (`;
const start = lines.findIndex((l) => l.trim() === marker);
if (start < 0) throw new Error(`block for tab '${tab}' not found`);

// find the matching `)}` at the same indentation
const indent = lines[start].match(/^\s*/)[0];
let end = -1;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i] === indent + ')}') { end = i; break; }
}
if (end < 0) throw new Error('closing )} not found');

const body = lines.slice(start + 1, end);           // inner JSX
writeFileSync(`/tmp/tab-${tab}.jsx`, body.join('\n') + '\n');

const props = process.env.PROPS || '';
const render = process.env.RENDER || '';
const header = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

${process.env.IMPORTS || ''}
${process.env.BODY || ''}
export default function ${componentName}({${props}) {
  return (
    <>
`;
const footer = `
    </>
  );
}
`;
writeFileSync(`src/components/dashboard/${componentName}.tsx`, header + body.join('\n') + '\n' + footer);

const replacement = [
  `${indent}{activeTab === '${tab}' && (`,
  `${indent}  <Suspense fallback={<PanelFallback />}>`,
  `${indent}    <${componentName}${render} />`,
  `${indent}  </Suspense>`,
  `${indent})}`,
];
const out = [...lines.slice(0, start), ...replacement, ...lines.slice(end + 1)];
writeFileSync(landing, out.join('\n'));

console.log(`extracted '${tab}': ${body.length} lines -> src/components/dashboard/${componentName}.tsx`);
console.log(`Landing.tsx: ${lines.length} -> ${out.length} lines`);
