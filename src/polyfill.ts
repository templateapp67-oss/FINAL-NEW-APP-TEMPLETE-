// Polyfill to prevent "Uncaught TypeError: Cannot set property fetch of #<Window> which has only a getter"
// This happens in certain iframe/sandboxed environments where window.fetch is read-only.
try {
  const originalFetch = window.fetch || globalThis.fetch;
  if (originalFetch) {
    let currentFetch = originalFetch;
    Object.defineProperty(window, 'fetch', {
      get() {
        return currentFetch;
      },
      set(val) {
        currentFetch = val;
      },
      configurable: true,
      enumerable: true,
    });
    if (typeof globalThis !== 'undefined' && globalThis !== window) {
      Object.defineProperty(globalThis, 'fetch', {
        get() {
          return currentFetch;
        },
        set(val) {
          currentFetch = val;
        },
        configurable: true,
        enumerable: true,
      });
    }
  }
} catch (e) {
  console.warn('Could not define custom fetch getter/setter polyfill:', e);
}

export {};
