#!/usr/bin/env node
import fs from 'fs';

console.log('🔍 Verifying current owner setup and workspace surfaces...\n');

let allPassed = true;
const check = (desc, condition, details='') => {
  const status = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} — ${desc}${details ? ` — ${details}` : ''}`);
  if (!condition) allPassed = false;
};

// The production owner flow is intentionally 14 steps:
// Login → Business Setup → Choose Template → Customize → Preview → persisted Publish.
console.log('=== 1. OWNER SETUP (01-14) ===');
const ownerSetupScreens = [
  { id: '01', file: 'src/screens/HeroSplit.tsx', name: 'Login' },
  { id: '02', file: 'src/screens/StepDetails.tsx', name: 'Business Details' },
  { id: '03', file: 'src/screens/StepServices.tsx', name: 'Services & Packages' },
  { id: '04', file: 'src/screens/StepTeam.tsx', name: 'Team Setup' },
  { id: '05', file: 'src/screens/StepPhotos.tsx', name: 'Photo Gallery' },
  { id: '06', file: 'src/screens/StepSocials.tsx', name: 'Socials & Reels' },
  { id: '07', file: 'src/screens/StepLocation.tsx', name: 'Location & Hours' },
  { id: '08', file: 'src/screens/StepContactBooking.tsx', name: 'Contact & Booking Rules' },
  { id: '09', file: 'src/screens/StepTemplate.tsx', name: 'Choose Template' },
  { id: '10', file: 'src/screens/StepPublish.tsx', name: 'Customize Appearance & Services' },
  { id: '11', file: 'src/screens/StepAIContentReview.tsx', name: 'AI Content Review' },
  { id: '12', file: 'src/screens/StepFullWebsitePreview.tsx', name: 'Full Website Preview' },
  { id: '13', file: 'src/screens/StepPublishSetup.tsx', name: 'Supabase Publish (persisted)' },
  { id: '14', file: 'src/screens/StepPublishSuccess.tsx', name: 'Persisted Publish Success' },
];
ownerSetupScreens.forEach(s => {
  const exists = fs.existsSync(s.file);
  const content = exists ? fs.readFileSync(s.file, 'utf8') : '';
  check(`Step ${s.id} — ${s.name}`, exists && content.length > 500, exists ? `${(content.length/1024).toFixed(1)}KB` : 'MISSING');
});
const appContent = fs.readFileSync('src/App.tsx', 'utf8');
check('No fake booking-confirmation screen in owner setup', !appContent.includes('NX-10482'));
check('Publish success requires persisted state', appContent.includes("data.publishState === 'published' && data.publishedUrl"));

console.log('\n=== 2. STAFF MANAGEMENT ===');
const staffFile = 'src/components/StaffManagementModule.tsx';
const staffContent = fs.existsSync(staffFile) ? fs.readFileSync(staffFile, 'utf8') : '';
check('Staff Management Module', staffContent.length > 500, `${(staffContent.length/1024).toFixed(1)}KB`);
check('7-Day Shifts', staffContent.includes('WeeklySchedule') || staffContent.includes('monday'));
check('Payroll & Commissions', staffContent.includes('Payroll') && staffContent.includes('Commission'));
check('Role Permissions', staffContent.includes('Role Permissions') || staffContent.includes('App Access'));
check('Availability', staffContent.includes('Available') && staffContent.includes('Busy'));

console.log('\n=== 3. POST-LAUNCH DASHBOARD (18-25) ===');
const dashboardTabs = [
  ['18','Overview Dashboard','overview'], ['19','Website & Design Manager','website'],
  ['20','Bookings & Calendar','bookings'], ['21','Payments & Revenue Analytics','payments'],
  ['22','Marketing & Social Share Hub','share'], ['23','Salon Settings & Policies','settings'],
  ['24','Share & Referral Premium','referral'], ['25','Branding & White-label Settings','branding'],
];
const landingContent = fs.readFileSync('src/screens/Landing.tsx', 'utf8');
dashboardTabs.forEach(([id,name,keyword]) => check(`Screen ${id} — ${name}`, landingContent.includes(keyword), `keyword:${keyword}`));
check('Session-owned owner dashboard exists', fs.existsSync('src/components/OwnerDashboard.tsx'));

console.log('\n=== 4. OWNER WORKSPACE NAVIGATOR ===');
const topBarContent = fs.readFileSync('src/components/TopBar.tsx', 'utf8');
const labels = (topBarContent.match(/label:/g) || []).length;
check('TopBar exists', topBarContent.length > 0);
check('Current 24 destinations are registered', labels >= 24, `${labels} labels`);
check('Owner setup badge is current', topBarContent.includes('OWNER SETUP'));
check('Navigator test id exists', topBarContent.includes('universal-navigator'));
check('Navigator supports selection', topBarContent.includes('onNavigate') && topBarContent.includes('ChevronDown'));
check('App integrates navigator', appContent.includes('navigateToScreen') && appContent.includes('currentScreen'));

console.log('\n=== 5. EXPRESS BACKEND & VITE ===');
const serverContent = fs.readFileSync('server.ts','utf8');
const viteContent = fs.readFileSync('vite.config.ts','utf8');
check('Express CORS policy exists', serverContent.includes('Access-Control-Allow-Origin') || serverContent.includes('cors: true'));
check('Express allowedHosts configured', serverContent.includes('allowedHosts'));
check('Health endpoint exists', serverContent.includes('/api/health'));
check('Vite allowedHosts:true', viteContent.includes('allowedHosts: true'));
check('Vite cors:true', viteContent.includes('cors: true'));
check('Vite host 0.0.0.0', viteContent.includes("host: '0.0.0.0'") || viteContent.includes('host: "0.0.0.0"'));

console.log('\n=== 6. BUILD & FLOW INTEGRITY ===');
check('14-step owner flow constant', appContent.includes('const TOTAL_STEPS = TOTAL_OWNER_STEPS'));
check('Choose Template precedes Customize', appContent.indexOf('step === 8 && <StepTemplate') < appContent.indexOf('step === 9 && <StepPublish'));
check('Preview precedes publish', appContent.indexOf('<StepFullWebsitePreview') < appContent.indexOf('<StepPublishSetup'));

console.log('\n' + (allPassed ? '✅ CURRENT OWNER WORKSPACE VERIFIED' : '❌ SOME CHECKS FAILED — REVIEW ABOVE'));
process.exit(allPassed ? 0 : 1);
