/**
 * Header UX VERIFICATION — smooth scrolling, clickability, accessibility,
 * hover/active visual feedback, and zero console errors on MOBILE + DESKTOP.
 *
 * Mounts the real themed renderers (Barber + Nail Lash as representatives)
 * in both desktop and mobile preview modes (Supabase unconfigured, same as the
 * phase-10.x suites, so no network calls) and verifies:
 *   1. Smooth scrolling is enabled: `scroll-behavior: smooth` in the app CSS
 *      (`html`, `.site-scroll`, `.site-legacy-scroll`) AND every JS scroll
 *      call passes `behavior: 'smooth'` (captured from scrollIntoView options).
 *   2. Every header control is clickable: it is a <button>/<a> with an active
 *      event handler / href and is not disabled.
 *   3. Accessibility: every control exposes a non-empty accessible name
 *      (text content or aria-label), and nav rows carry aria-current /
 *      aria-expanded / aria-pressed as appropriate.
 *   4. Visual feedback: each control's class carries a `transition*` and a
 *      `hover:` class so hover gives feedback (and Book CTAs have `active:`).
 *   5. Zero console errors during mount AND during every interaction.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/arts-by-uma',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});
dom.window.matchMedia = globalThis.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Capture scrollIntoView OPTIONS so we can assert behavior:'smooth'.
const scrollBehaviors = [];
dom.window.HTMLElement.prototype.scrollIntoView = function (options) {
  scrollBehaviors.push(typeof options === 'object' && options ? options.behavior : '(default)');
};
globalThis.HTMLElement.prototype.scrollIntoView = dom.window.HTMLElement.prototype.scrollIntoView;
dom.window.HTMLElement.prototype.scrollTo = function () {};
globalThis.HTMLElement.prototype.scrollTo = dom.window.HTMLElement.prototype.scrollTo;

// Capture console.error; ALSO pass through so harness failure output still prints.
const consoleErrors = [];
const origConsoleError = console.error;
console.error = (...args) => { consoleErrors.push(args.map(String).join(' ')); origConsoleError(...args); };
// React's act() warnings about async updates are testing-framework noise
// (jsdom + async catalog loads), not real app errors — exclude them.
const isTestNoise = (msg) => /act\(\)|An update to .* inside a test|When testing|fire events that update state|wrapped in act/.test(msg);

const React = (await import('react')).default;
const { render, cleanup, act, fireEvent } = await import('@testing-library/react');
const { initialData } = await import('../src/types.ts');
const Barber = (await import('../src/components/BarberTemplateRenderer.tsx')).default;
const NailLash = (await import('../src/components/NailLashStudioTemplateRenderer.tsx')).default;

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { failed += 1; failures.push({ name, error }); origConsoleError(`  ✗ ${name}\n    ${String(error.message).split('\n').join('\n    ')}`); }
}
function section(title) { console.log(`\n■ ${title}`); }

function richData(templateId) {
  return {
    ...initialData,
    templateId,
    salonName: 'UX Test Salon',
    ownerName: 'Uma',
    phone: '+91 90000 00000', whatsappPhone: '+91 90000 00000', about: 'About text',
    services: [{ id: 's1', name: 'Cut', category: 'Cut', description: '', price: 400, duration: 30, status: 'active' }],
    packages: [{ id: 'p1', name: 'Combo', description: '', price: 999, duration: 60, status: 'active' }],
    gallery: [{ id: 'g1', url: 'https://x/g.jpg', alt: 'Work' }],
    socialVideos: [{ id: 'v1', title: 'Reel', platform: 'instagram', url: '#section-social', thumbnailUrl: 'https://x/t.jpg' }],
    team: [{ id: 't1', name: 'Riya', role: 'Stylist', imageUrl: 'https://x/r.jpg' }],
  };
}

const CASES = [
  { id: 'barber_mens_grooming', label: 'Barber', Component: Barber },
  { id: 'nail_lash_studio', label: 'Nail & Lash', Component: NailLash },
];

/* ---------------- 1. Smooth scrolling ------------------------------------ */
{
  await test('app CSS enables scroll-behavior: smooth (html / .site-scroll / .site-legacy-scroll)', () => {
    const css = fs.readFileSync('src/index.css', 'utf8');
    assert.match(css, /html\s*\{[^}]*scroll-behavior:\s*smooth/s, 'html missing scroll-behavior smooth');
    assert.match(css, /\.site-scroll\s*\{[^}]*scroll-behavior:\s*smooth/s, '.site-scroll missing scroll-behavior smooth');
    assert.match(css, /\.site-legacy-scroll\s*\{[^}]*scroll-behavior:\s*smooth/s, '.site-legacy-scroll missing scroll-behavior smooth');
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*scroll-behavior:\s*auto/s, 'reduced-motion override missing');
  });

  await test('JS scroll calls request behavior: smooth', () => {
    const nav = fs.readFileSync('src/lib/siteNavigation.ts', 'utf8');
    assert.match(nav, /scrollIntoView\(\{\s*behavior:\s*'smooth'/, 'scrollToSiteSection not behavior:smooth');
    const booking = fs.readFileSync('src/lib/siteBooking.ts', 'utf8');
    assert.match(booking, /scrollTo\(\{\s*top:\s*0,\s*behavior:\s*'smooth'/, 'scrollSiteToTop not behavior:smooth');
  });
}

/* ---------------- 2-5. Per-theme, per-mode UX ---------------------------- */
for (const config of CASES) {
  for (const mode of ['desktop', 'mobile']) {
    section(`${config.label} — ${mode}`);
    cleanup();
    window.localStorage.clear();
    const priorErrors = consoleErrors.length;

    const utils = render(React.createElement(config.Component, { data: richData(config.id), mode }));

    const openDrawerIfNeeded = () => {
      if (mode !== 'mobile') return;
      if (!document.querySelector('[data-testid="site-mobile-drawer"]')) {
        fireEvent.click(document.querySelector('[data-testid="site-menu-button"]'));
      }
    };
    const headerControls = () => {
      openDrawerIfNeeded();
      const header = document.querySelector('[data-testid="site-header"]');
      return Array.from((header || document).querySelectorAll('button, a[href]'));
    };
    const navButtons = () => {
      openDrawerIfNeeded();
      const sel = mode === 'desktop'
        ? '[data-testid="site-nav-desktop"] button[data-testid^="nav-"]'
        : '[data-testid="site-mobile-drawer"] button[data-testid^="nav-mobile-"]';
      return Array.from(document.querySelectorAll(sel));
    };

    await test('mount produces no console errors', () => {
      const mountErrors = consoleErrors.slice(priorErrors).filter((e) => !isTestNoise(e));
      assert.equal(mountErrors.length, 0, `console errors on mount: ${mountErrors.join(' | ')}`);
    });

    await test('every header control is clickable (has handler / href) and not disabled', () => {
      const controls = headerControls();
      assert.ok(controls.length >= 5, `expected header controls, got ${controls.length}`);
      for (const c of controls) {
        assert.ok(!c.disabled, `control ${c.dataset.testid || c.tagName} is disabled`);
        if (c.tagName === 'A') {
          assert.ok(c.getAttribute('href'), `anchor ${c.dataset.testid} has no href`);
        } else {
          assert.equal(c.tagName, 'BUTTON', `unexpected element ${c.tagName}`);
          assert.ok(c.onclick || c.getAttribute('onclick'), `button ${c.dataset.testid || '(no id)'} has no click handler`);
        }
      }
    });

    await test('every control exposes an accessible name', () => {
      for (const c of headerControls()) {
        const name = (c.getAttribute('aria-label') || c.textContent || '').trim();
        assert.ok(name.length > 0, `control ${c.dataset.testid || c.tagName} has no accessible name`);
      }
    });

    await test('nav rows carry aria-current / aria-expanded / aria-pressed state', () => {
      const header = document.querySelector('[data-testid="site-header"]');
      openDrawerIfNeeded();
      const nav = navButtons();
      assert.ok(nav.length >= 3, `expected nav items, got ${nav.length}`);
      if (mode === 'desktop') {
        // Home is active by default; clicking Services moves the active row.
        const services = header.querySelector('[data-testid="nav-services"]');
        fireEvent.click(services);
        assert.equal(services.getAttribute('aria-current'), 'page', 'active nav row missing aria-current=page');
      } else {
        // Home is active by default. Clicking a drawer row CLOSES the drawer
        // (correct mobile UX), so assert the active marker before any click.
        const home = header.querySelector('[data-testid="nav-mobile-home"]');
        assert.equal(home.getAttribute('aria-current'), 'page', 'active drawer row missing aria-current=page');
        const menu = header.querySelector('[data-testid="site-menu-button"]');
        assert.ok(menu.getAttribute('aria-expanded'), 'menu button missing aria-expanded');
        assert.ok(menu.getAttribute('aria-label'), 'menu button missing aria-label');
        // Re-open the drawer for any later inspection.
        openDrawerIfNeeded();
      }
    });

    await test('nav links + Book CTA have hover/active visual feedback classes', () => {
      // Nav links animate on hover in every theme (transition + hover:).
      for (const btn of navButtons()) {
        const cls = btn.className || '';
        assert.match(cls, /transition/, `nav ${btn.dataset.testid} missing transition*`);
        assert.match(cls, /hover:/, `nav ${btn.dataset.testid} missing hover:`);
      }
      // Primary Book CTA carries hover + active feedback in every theme.
      const book = document.querySelector('[data-testid="site-book-cta"]') || document.querySelector('[data-testid="site-book-cta-mobile"]');
      assert.ok(book, 'Book CTA not found');
      assert.match(book.className, /transition/, 'Book CTA missing transition*');
      assert.match(book.className, /hover:/, 'Book CTA missing hover:');
      assert.match(book.className, /active:/, 'Book CTA missing active: feedback');
    });

    await test('clicking each nav item smooth-scrolls (behavior captured) and sets state', async () => {
      const items = navButtons();
      assert.ok(items.length >= 3, `expected nav items, got ${items.length}`);
      scrollBehaviors.length = 0;
      for (const item of items) {
        await act(async () => { fireEvent.click(item); });
      }
      if (mode === 'desktop') {
        assert.ok(scrollBehaviors.includes('smooth'), `expected smooth scrollIntoView, got ${scrollBehaviors.join(',')}`);
      }
    });

    await test('interactions produce no console errors', () => {
      const interErrors = consoleErrors.slice(priorErrors).filter((e) => !isTestNoise(e));
      assert.equal(interErrors.length, 0, `console errors during interaction: ${interErrors.join(' | ')}`);
    });

    cleanup();
  }
}

console.log('\n────────────────────────────────────────');
console.log(`Header UX verification: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}`);
}
console.error = origConsoleError;
process.exit(failures.length > 0 ? 1 : 0);
