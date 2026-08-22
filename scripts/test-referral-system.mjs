#!/usr/bin/env node
/**
 * Referral system verification (Phase — Dynamic Referrals & Sharing).
 *
 * Covers:
 *   1. Dynamic referral code generation `NX-[WEBSITE_SHORT_NAME]-<YEAR>`
 *      (no hardcoded codes like LUMINA-25 anywhere).
 *   2. Referral link → `/signup?ref=<CODE>` + `ref` capture into
 *      localStorage['nexora_referral_code'] at router startup + clean slug
 *      parsing (pathname-only).
 *   3. Social sharing: Instagram/Social Story card (canvas + navigator.share
 *      + download fallback), Facebook sharer URL, Poster canvas download.
 *   4. Referral Dashboard: real-time Referred Salons list with
 *      Pending / Registered / Active status + accumulated wallet credits.
 */
import fs from 'fs';
import assert from 'node:assert/strict';

console.log('🧪 Running Referral System Verification...\n');

let totalTests = 0;
let passedTests = 0;

async function test(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ PASS — ${description}`);
  } catch (err) {
    console.error(`❌ FAIL — ${description}`);
    console.error(`   ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* Static source assertions                                            */
/* ------------------------------------------------------------------ */

const mainSrc = fs.readFileSync('src/main.tsx', 'utf8');
const signupSrc = fs.readFileSync('src/components/SignUpPage.tsx', 'utf8');
const shareSrc = fs.readFileSync('src/components/ShareReferralPremium.tsx', 'utf8');
const referralSrc = fs.readFileSync('src/lib/referral.ts', 'utf8');
const dashboardSrc = fs.readFileSync('src/lib/referralDashboard.ts', 'utf8');
const canvasSrc = fs.readFileSync('src/lib/referralCanvas.ts', 'utf8');
const loginSrc = fs.readFileSync('src/components/LoginModal.tsx', 'utf8');

await test('no hardcoded static referral codes (LUMINA-25) remain in src/', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const p = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|html)$/.test(entry.name)) files.push(p);
    }
  };
  walk('src');
  for (const f of files) {
    assert.ok(!fs.readFileSync(f, 'utf8').includes('LUMINA-25'), `static code found in ${f}`);
  }
});

await test('referral code is generated dynamically from the salon name', () => {
  assert.ok(referralSrc.includes('deriveSalonShortName'), 'missing short-name derivation');
  assert.ok(referralSrc.includes('getReferralCode'), 'missing getReferralCode');
  assert.ok(referralSrc.includes('getFullYear'), 'year must be generated from the current date');
  assert.ok(referralSrc.includes('referralPrefix'), 'code must honour the brand prefix (NX)');
  assert.ok(shareSrc.includes('getReferralCode(salonName)'), 'dashboard must derive the code from salonName');
  assert.ok(!shareSrc.includes("const REFERRAL_CODE"), 'ShareReferralPremium must not hold a static code');
});

await test('referral links always target the Sign-Up page with ?ref=<CODE>', () => {
  assert.ok(referralSrc.includes("new URL(`${origin}/signup`)"), 'link must point at /signup');
  assert.ok(referralSrc.includes('searchParams.set(\'ref\', code)'), 'code must go into the ref query param');
  assert.ok(shareSrc.includes('buildReferralLink(salonName)'), 'dashboard link must use buildReferralLink');
});

await test('router captures ?ref= from window.location.search into localStorage[nexora_referral_code]', () => {
  assert.ok(referralSrc.includes('URLSearchParams(window.location.search)'), 'must parse the ref query parameter');
  assert.ok(referralSrc.includes("REFERRAL_STORAGE_KEY = 'nexora_referral_code'"), 'storage key must be nexora_referral_code');
  assert.ok(mainSrc.includes('captureReferralFromUrl()'), 'main.tsx must capture the ref at startup');
});

await test('referral storage uses the safeStorage quota-safe wrappers', () => {
  assert.ok(referralSrc.includes("from './safeStorage'"), 'referral.ts must use safeStorage');
  assert.ok(referralSrc.includes('safeSetItem') && referralSrc.includes('safeGetItem') && referralSrc.includes('safeRemoveItem'), 'safe get/set/remove must be used');
  assert.ok(dashboardSrc.includes("from './safeStorage'"), 'referralDashboard.ts must use safeStorage');
  assert.ok(dashboardSrc.includes('safeSetItem') && dashboardSrc.includes('safeGetItem'), 'registry must use safe get/set');
});

await test('slug parsing stays pathname-only (query params never cause 404 / Salon Not Found)', () => {
  assert.ok(mainSrc.includes("window.location.pathname.replace(/\\/+$/, '')"), 'routing must use location.pathname');
  assert.ok(!/normalizedPath\s*=\s*[^;]*location\.href/.test(mainSrc), 'normalizedPath must not be derived from href');
  assert.ok(!/normalizedPath\s*=\s*[^;]*location\.search/.test(mainSrc), 'normalizedPath must not be derived from search');
});

await test('/signup is a first-class route in RootRouter', () => {
  assert.ok(mainSrc.includes("pathname === '/signup'"), 'missing /signup route check');
  assert.ok(mainSrc.includes("setRoute('signup')"), 'missing signup route assignment');
  assert.ok(mainSrc.includes('case \'signup\':'), 'missing signup switch case');
  assert.ok(mainSrc.includes('<SignUpPage />'), 'missing SignUpPage render');
  assert.ok(signupSrc.includes('export default function SignUpPage'), 'missing SignUpPage component');
});

await test('Sign-Up page auto-fills + locks + highlights the referral code', () => {
  assert.ok(signupSrc.includes('readStoredReferralCode()'), 'must read nexora_referral_code on load');
  assert.ok(signupSrc.includes('data-testid="signup-referral-input"'), 'missing referral input testid');
  assert.ok(signupSrc.includes('readOnly={codeLocked}'), 'prefilled code must be locked (readonly)');
  assert.ok(signupSrc.includes('setReferralLocked(true)'), 'code from invite link must be marked locked');
  assert.ok(signupSrc.includes('ring-2 ring-[#ac0053]'), 'locked code must be highlighted');
  assert.ok(signupSrc.includes('recordReferralSignup'), 'signup must record the referral at account creation');
});

await test('auth modal also records stored referrals at account creation', () => {
  assert.ok(loginSrc.includes('readStoredReferralCode()'), 'modal signup must read the stored code');
  assert.ok(loginSrc.includes('recordReferralSignup'), 'modal signup must record the referral');
});

await test('Share via Story: story card modal + native share + canvas download fallback', () => {
  assert.ok(shareSrc.includes('generateReferralStoryCard'), 'missing story card generation');
  assert.ok(shareSrc.includes('storyOpen'), 'missing story modal state');
  assert.ok(canvasSrc.includes('navigator.share'), 'must use navigator.share');
  assert.ok(canvasSrc.includes('downloadDataUrlImage'), 'must provide image download fallback');
  assert.ok(canvasSrc.includes('1080'), 'story card must be 9:16 (1080 wide)');
  assert.ok(shareSrc.includes('shareImageNatively'), 'modal must attempt native share with the image');
});

await test('Share via Facebook: direct sharer URL with encoded referral link', () => {
  assert.ok(referralSrc.includes('https://www.facebook.com/sharer/sharer.php?u='), 'missing Facebook sharer URL');
  assert.ok(referralSrc.includes('encodeURIComponent(url)'), 'referral URL must be encoded');
  assert.ok(shareSrc.includes('shareToFacebook(referralLink)'), 'dashboard must trigger the Facebook share');
});

await test('Poster: canvas banner with salon name, reward details and dynamic code + download', () => {
  assert.ok(canvasSrc.includes('generateReferralPoster'), 'missing poster generation');
  assert.ok(canvasSrc.includes('canvas.toDataURL(\'image/png\')'), 'poster must render to a PNG');
  assert.ok(canvasSrc.includes('REFERRAL CODE'), 'poster must display the code label');
  assert.ok(shareSrc.includes('generateReferralPoster'), 'dashboard must generate the poster');
  assert.ok(shareSrc.includes('downloadDataUrlImage(url, `nexora-poster-'), 'poster must trigger a download');
});

await test('Referral Dashboard: Referred Salons list with Pending/Registered/Active + wallet credits', () => {
  assert.ok(shareSrc.includes('Referred Salons'), 'missing Referred Salons section');
  assert.ok(dashboardSrc.includes("'Pending' | 'Registered' | 'Active'"), 'status type list missing');
  assert.ok(shareSrc.includes('Registration Status'), 'missing status column');
  assert.ok(shareSrc.includes('Wallet Credits'), 'missing credits column');
  assert.ok(shareSrc.includes('useReferralDashboard'), 'dashboard must subscribe live to registry updates');
  assert.ok(shareSrc.includes('useReferralDashboard(code)'), 'dashboard must read the referral context (own code + stored code)');
  assert.ok(dashboardSrc.includes('referralDashboard') || dashboardSrc.includes('ReferralDashboard'), 'dashboard lib missing');
  assert.ok(dashboardSrc.includes('onReferralDashboardUpdated'), 'missing real-time subscription');
  assert.ok(dashboardSrc.includes('nexora_referral_code'), 'dashboard context must read nexora_referral_code');
  assert.ok(shareSrc.includes('STATUS_STYLES'), 'status badges must style all three statuses');
  assert.ok(/Pending/.test(shareSrc) && /Registered/.test(shareSrc) && /Active/.test(shareSrc), 'all three statuses must appear');
});

/* ------------------------------------------------------------------ */
/* Runtime behaviour — code generation + link + storage capture        */
/* ------------------------------------------------------------------ */

const {
  deriveSalonShortName,
  getReferralCode,
  buildReferralLink,
  normalizeReferralCode,
  captureReferralFromUrl,
  storeReferralCode,
  readStoredReferralCode,
} = await import('/home/user/FINAL-NEW-APP-TEMPLETE-/src/lib/referral.ts');

await test('code format is NX-[SHORT]-2026 for the given examples', () => {
  assert.equal(getReferralCode('Royal Hair Studio'), 'NX-ROYAL-2026');
  assert.equal(getReferralCode('Royal Hair & Beauty Studio'), 'NX-ROYAL-2026');
  assert.equal(deriveSalonShortName('The Barber Collective'), 'BARBER');
  assert.equal(getReferralCode(''), 'NX-SALON-2026');
  assert.match(getReferralCode('Glow Spa'), /^NX-GLOW-\d{4}$/);
});

await test('referral link points at the Sign-Up page with the ref param', () => {
  const link = buildReferralLink('Royal Hair Studio');
  assert.ok(link.startsWith('https://'), 'link must be absolute');
  assert.ok(link.includes('/signup?ref=NX-ROYAL-2026'), `unexpected link: ${link}`);
});

await test('captureReferralFromUrl parses ?ref= and stores it (pathname untouched)', () => {
  // Minimal browser shims for the capture path. The window shim carries
  // localStorage too, so safeStorage exercises the real storage path.
  const backing = new Map();
  const storage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => backing.set(k, String(v)),
    removeItem: (k) => backing.delete(k),
  };
  globalThis.localStorage = storage;
  globalThis.window = { location: { search: '?ref=nx-royal-2026&next=1' }, localStorage: storage };
  const stored = captureReferralFromUrl();
  assert.equal(stored, 'NX-ROYAL-2026');
  assert.equal(backing.get('nexora_referral_code'), 'NX-ROYAL-2026');
  assert.equal(readStoredReferralCode(), 'NX-ROYAL-2026');

  // Garbage is rejected; clean values pass.
  globalThis.window.location.search = '?ref=!!';
  assert.equal(captureReferralFromUrl(), null);
  globalThis.window.location.search = '';
  assert.equal(captureReferralFromUrl(), null);
  assert.equal(normalizeReferralCode('nx-rhs-2026'), 'NX-RHS-2026');
  assert.equal(storeReferralCode('NX-RHS-2026'), true);
  assert.equal(storeReferralCode('nope nope'), false);
});

/* ------------------------------------------------------------------ */
/* Runtime behaviour — referral dashboard registry (real-time)         */
/* ------------------------------------------------------------------ */

// Fresh browser shims with event support for the registry layer.
{
  const backing = new Map();
  const storage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => backing.set(k, String(v)),
    removeItem: (k) => backing.delete(k),
  };
  globalThis.localStorage = storage;
  const listeners = new Map();
  globalThis.window = {
    location: { search: '' },
    localStorage: storage,
    addEventListener: (t, cb) => {
      if (!listeners.has(t)) listeners.set(t, []);
      listeners.get(t).push(cb);
    },
    removeEventListener: (t, cb) => {
      if (listeners.has(t)) listeners.set(t, listeners.get(t).filter((f) => f !== cb));
    },
    dispatchEvent: (e) => {
      for (const cb of listeners.get(e.type) || []) cb(e);
      return true;
    },
  };

  const {
    recordReferralSignup,
    setReferralStatus,
    getReferralDashboard,
    onReferralDashboardUpdated,
    CREDITS_BY_STATUS,
  } = await import('/home/user/FINAL-NEW-APP-TEMPLETE-/src/lib/referralDashboard.ts');

  await test('sign-up records a Pending referral with zero credits', () => {
    const entry = recordReferralSignup({ email: 'new@salon.com', code: 'NX-ROYAL-2026', salonName: 'New Glow Spa' });
    assert.ok(entry, 'entry must be returned');
    assert.equal(entry.status, 'Pending');
    assert.equal(entry.credits, 0);
    assert.equal(entry.salonName, 'New Glow Spa');

    // Dedupe by email — no duplicate rows.
    const again = recordReferralSignup({ email: 'NEW@salon.com', code: 'NX-ROYAL-2026' });
    assert.equal(again.email, 'new@salon.com');
    const dash = getReferralDashboard('NX-ROYAL-2026');
    assert.equal(dash.entries.filter((e) => e.email === 'new@salon.com').length, 1);
  });

  await test('status advances Pending → Registered → Active and accrues wallet credits', () => {
    let updated = setReferralStatus('new@salon.com', 'Registered');
    assert.equal(updated.status, 'Registered');
    assert.equal(updated.credits, CREDITS_BY_STATUS.Registered);

    updated = setReferralStatus('new@salon.com', 'Active');
    assert.equal(updated.status, 'Active');
    assert.equal(updated.credits, CREDITS_BY_STATUS.Active);

    // Downgrades are ignored.
    const same = setReferralStatus('new@salon.com', 'Pending');
    assert.equal(same.status, 'Active');
  });

  await test('dashboard totals accumulate wallet credits and read the stored referral context', () => {
    storeReferralCode('NX-ROYAL-2026');
    const dash = getReferralDashboard('NX-ROYAL-2026');
    assert.equal(dash.referredByCode, 'NX-ROYAL-2026', 'must read nexora_referral_code');
    assert.equal(dash.ownCode, 'NX-ROYAL-2026');
    assert.ok(dash.totals.referred >= 1);
    const activeRow = dash.entries.find((e) => e.email === 'new@salon.com');
    assert.equal(activeRow.credits, CREDITS_BY_STATUS.Active);
    assert.equal(dash.totals.totalCredits, dash.entries.reduce((s, e) => s + e.credits, 0));
  });

  await test('dashboard updates in real time (event subscription)', () => {
    let ticks = 0;
    const unsub = onReferralDashboardUpdated(() => ticks++);
    recordReferralSignup({ email: 'live@salon.com', code: 'NX-ROYAL-2026' });
    unsub();
    assert.ok(ticks >= 1, 'subscriber must be notified on registry mutation');
  });
}

console.log(`\n────────────────────────────────────────`);
console.log(`Referral system: ${passedTests} passed, ${totalTests - passedTests} failed`);
if (totalTests - passedTests > 0) {
  process.exitCode = 1;
} else {
  console.log(
    'All referral requirements verified: dynamic NX-[SHORT]-<YEAR> codes, /signup?ref= links, ref capture into localStorage, locked auto-fill, Story/Facebook/Poster sharing, live Referred Salons dashboard with Pending/Registered/Active + wallet credits.',
  );
}
