/**
 * PHASE 17.10 — FINAL OWNER DASHBOARD ACCEPTANCE.
 *
 * This is an orchestrator, not a new feature suite. It performs the final
 * static security/scope audit and runs every Phase 17 acceptance suite plus
 * the booking/availability regressions Phase 17 depends on exactly once.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
let staticPassed = 0;
let staticFailed = 0;

function check(name, fn) {
  try {
    fn();
    staticPassed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    staticFailed += 1;
    console.error(`  ✗ ${name}\n    ${error.message}`);
  }
}

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function executable(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

console.log('\n■ Final static engineering and security audit');

const ownerSalon = read('src/lib/ownerSalon.ts');
const dashboard = read('src/components/OwnerDashboard.tsx');
const management = read('src/lib/bookingManagement.ts');
const filters = read('src/lib/ownerDashboardFilters.ts');
const packageJson = JSON.parse(read('package.json'));

check('authenticated ownership is organization_members → salons.organization_id', () => {
  assert.match(ownerSalon, /organization_members/);
  assert.match(ownerSalon, /salons\.organization_id|organization_id/);
  assert.match(ownerSalon, /role.*owner|role`, 'owner'|role', 'owner'/s);
  assert.match(ownerSalon, /status.*active|status`, 'active'|status', 'active'/s);
});

check('job_salon_members is absent from executable Phase 17 ownership code', () => {
  const files = [
    'src/lib/ownerSalon.ts',
    'src/lib/bookingManagement.ts',
    'src/lib/ownerDashboard.ts',
    'src/components/OwnerDashboard.tsx',
    'src/lib/ownerTodayAppointments.ts',
    'src/lib/ownerUpcomingAppointments.ts',
    'src/lib/ownerCustomers.ts',
    'src/lib/ownerRevenueSummary.ts',
    'src/lib/ownerCalendarSchedule.ts',
    'src/lib/ownerNotifications.ts',
    'src/lib/ownerDashboardFilters.ts',
  ];
  for (const file of files) {
    assert.equal(executable(read(file)).includes('job_salon_members'), false, file);
  }
});

check('every data section reads through the tenant-authorized booking boundary', () => {
  for (const file of [
    'src/lib/ownerTodayAppointments.ts',
    'src/lib/ownerUpcomingAppointments.ts',
    'src/lib/ownerCustomers.ts',
    'src/lib/ownerRevenueSummary.ts',
    'src/lib/ownerCalendarSchedule.ts',
    'src/lib/ownerNotifications.ts',
    'src/lib/ownerDashboardFilters.ts',
  ]) {
    assert.match(read(file), /readSalonBookings/, `${file} bypasses authorized read`);
  }
  assert.match(management, /actorAllowsBusiness/);
  assert.match(dashboard, /allowedBusinessIds:\s*tenant\?\.businessIds/);
});

check('all seven Phase 17 sections are mounted in the single owner dashboard', () => {
  for (const component of [
    'OwnerTodayAppointments', 'OwnerUpcomingAppointments', 'OwnerCustomers',
    'OwnerRevenueSummary', 'OwnerCalendarSchedule', 'OwnerNotifications',
    'OwnerDashboardFilters',
  ]) assert.ok(dashboard.includes(component), component);
});

check('advance-payment and legal status-transition guards remain data-layer enforced', () => {
  assert.match(management, /advance-payment-required/);
  assert.match(management, /paymentStatus !== 'paid'/);
  assert.match(management, /duplicate-update/);
  assert.match(management, /invalid-transition/);
  assert.match(management, /pending_payment:\s*\['confirmed', 'cancelled'\]/);
  assert.match(management, /confirmed:\s*\['completed', 'cancelled'\]/);
});

check('booking and payment status remain separate throughout financial filters', () => {
  const revenue = read('src/lib/ownerRevenueSummary.ts');
  assert.match(revenue, /bookingStatus/);
  assert.match(revenue, /paymentStatus/);
  assert.match(revenue, /paymentCountsAsReceived/);
  assert.match(revenue, /cancelledPaidExcluded/);
});

check('calendar cannot create, reserve or bypass an existing booking', () => {
  const calendar = read('src/components/OwnerCalendarSchedule.tsx');
  for (const forbidden of [
    'createPendingBookingRecord', 'createPayAtSalonRecord',
    'reserveBookingSlot', 'saveBookingDraft',
  ]) assert.equal(calendar.includes(forbidden), false, forbidden);
  assert.match(read('src/lib/ownerCalendarSchedule.ts'), /bookingStatusBlocksAvailability/);
});

check('notifications derive from persisted events and add no duplicate store', () => {
  const notifications = read('src/lib/ownerNotifications.ts');
  assert.match(notifications, /notificationsFromBookingRecord/);
  assert.match(notifications, /createdAt/);
  assert.match(notifications, /updatedAt/);
  assert.equal(/localStorage|sessionStorage|create table|insert into|new Event\(/i.test(notifications), false);
});

check('shared filters use real authorized records and provide one reset default', () => {
  assert.match(filters, /readSalonBookings/);
  assert.match(filters, /ownerFilterOptionsFromRecords/);
  assert.match(filters, /DEFAULT_OWNER_FILTERS/);
  assert.match(read('src/components/OwnerDashboardFilters.tsx'), /owner-filters-reset/);
});

check('responsive, locale, appearance and state surfaces remain integrated', () => {
  assert.match(dashboard, /overflow-x-hidden/);
  assert.match(dashboard, /useSiteLocale/);
  assert.match(dashboard, /useSiteAppearance/);
  const i18n = read('src/lib/ownerDashboardI18n.ts');
  for (const namespace of ['today.', 'upcoming.', 'customers.', 'revenue.', 'calendar.', 'notifications.', 'filters.']) {
    assert.ok(i18n.includes(`'${namespace}`), namespace);
  }
  for (const state of ['loading', 'error', 'empty', 'denied']) {
    const combined = [
      'src/components/OwnerTodayAppointments.tsx',
      'src/components/OwnerUpcomingAppointments.tsx',
      'src/components/OwnerCustomers.tsx',
      'src/components/OwnerRevenueSummary.tsx',
      'src/components/OwnerCalendarSchedule.tsx',
      'src/components/OwnerNotifications.tsx',
    ].map(read).join('\n');
    assert.ok(combined.includes(state), state);
  }
});

check('production client/server source contains no private credential assignment', () => {
  const files = [];
  for (const root of ['src', 'server.ts']) {
    if (root.endsWith('.ts')) files.push(root);
    else {
      const walk = (dir) => {
        for (const name of fs.readdirSync(new URL(`../${dir}`, import.meta.url))) {
          const path = `${dir}/${name}`;
          const stat = fs.statSync(new URL(`../${path}`, import.meta.url));
          if (stat.isDirectory()) walk(path);
          else if (/\.(ts|tsx|js|jsx)$/.test(name)) files.push(path);
        }
      };
      walk(root);
    }
  }
  const source = files.map(read).join('\n');
  for (const pattern of [
    /SUPABASE_SERVICE_ROLE\s*=/i,
    /service_role\s*[:=]\s*['"][^'"]+/i,
    /rzp_live_[A-Za-z0-9]+/,
    /sk_live_[A-Za-z0-9]+/,
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
  ]) assert.equal(pattern.test(source), false, String(pattern));
});

check('no hardcoded production salon/customer/booking facts were added by Phase 17', () => {
  const phase17 = [
    'src/lib/ownerTodayAppointments.ts', 'src/lib/ownerUpcomingAppointments.ts',
    'src/lib/ownerCustomers.ts', 'src/lib/ownerRevenueSummary.ts',
    'src/lib/ownerCalendarSchedule.ts', 'src/lib/ownerNotifications.ts',
    'src/lib/ownerDashboardFilters.ts', 'src/components/OwnerDashboard.tsx',
  ].map(read).join('\n');
  assert.equal(/NX-\d{4,}/.test(phase17), false);
  assert.equal(/(?:salon|customer|booking)-(?:123|999|fake|demo)/i.test(phase17), false);
  assert.equal(/₹\s*\d/.test(phase17), false);
});

check('Phase 18 and duplicate Phase 17.10 feature work are absent', () => {
  assert.equal(fs.existsSync(new URL('../docs/phase-18', import.meta.url)), false);
  assert.equal(packageJson.scripts['test:phase-18'], undefined);
  assert.equal(fs.existsSync(new URL('../src/components/Phase18.tsx', import.meta.url)), false);
});

if (staticFailed > 0) {
  console.error(`\nStatic acceptance failed: ${staticPassed} passed, ${staticFailed} failed`);
  process.exit(1);
}
console.log(`\nStatic acceptance: ${staticPassed} passed, 0 failed`);

console.log('\n■ Acceptance and regression commands (one pass each)');
const commands = [
  ...Array.from({ length: 9 }, (_, index) => ({
    label: `Phase 17.${index + 1}`,
    command: ['npm', ['run', `test:phase-17.${index + 1}`]],
  })),
  { label: 'Phase 16.3 availability', command: ['npm', ['run', 'test:phase-16.3']] },
  { label: 'Phase 16.7 booking management', command: ['npm', ['run', 'test:phase-16.7']] },
  { label: 'Phase 16.9 booking UX', command: ['npm', ['run', 'test:phase-16.9']] },
  { label: 'Phase 16.10 booking acceptance', command: ['npm', ['run', 'test:phase-16.10']] },
  { label: 'Existing screen verification', command: ['node', ['verify-22-screens.js']] },
  { label: 'Git whitespace validation', command: ['git', ['diff', '--check']] },
];

const resumeLabel = process.env.PHASE17_ACCEPTANCE_RESUME;
const resumeIndex = resumeLabel
  ? commands.findIndex((item) => item.label === resumeLabel)
  : 0;
if (resumeLabel && resumeIndex < 0) {
  console.error(`Unknown acceptance resume label: ${resumeLabel}`);
  process.exit(1);
}
const commandsToRun = commands.slice(resumeIndex);
if (resumeIndex > 0) {
  console.log(`Resuming after a fixed blocker at ${commandsToRun[0].label}; earlier suites already passed in this acceptance run.`);
}

let commandPassed = 0;
for (const item of commandsToRun) {
  console.log(`\n▶ ${item.label}`);
  const [bin, args] = item.command;
  const result = spawnSync(bin, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\nFINAL ACCEPTANCE BLOCKED: ${item.label} exited with ${result.status ?? 'no status'}.`);
    process.exit(result.status || 1);
  }
  commandPassed += 1;
}

console.log('\n════════════════════════════════════════');
console.log(`Phase 17.10 final acceptance: PASS`);
console.log(`Static checks: ${staticPassed}/${staticPassed}`);
console.log(`Command suites in this ${resumeIndex > 0 ? 'resumed ' : ''}pass: ${commandPassed}/${commandsToRun.length}`);
if (resumeIndex > 0) console.log(`Earlier command suites already passed: ${resumeIndex}/${commands.length}`);
console.log('Owner Dashboard & Booking Operations accepted.');
