/**
 * Node ESM loader hook: stubs .css imports so full-application boot tests
 * can run `src/main.tsx` under tsx/jsdom exactly like the browser does.
 * Everything else passes through to the next loader (tsx).
 */
export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return { format: 'module', source: 'export default {};', shortCircuit: true };
  }
  return nextLoad(url, context);
}
