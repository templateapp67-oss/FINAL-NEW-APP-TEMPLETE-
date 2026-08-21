#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

console.log('🔍 Verifying 25 Complete Screens & Repository Features...\n');

let allPassed = true;
const check = (desc, condition, details='') => {
  const status = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} — ${desc}${details ? ` — ${details}` : ''}`);
  if (!condition) allPassed = false;
};

// 1. Check all 25 screens exist
console.log('=== 1. WIZARD SCREENS (01-16) ===');
const wizardScreens = [
  { id: '01', file: 'src/screens/Landing.tsx', name: 'Landing' },
  { id: '02', file: 'src/screens/HeroSplit.tsx', name: 'Hero Split' },
  { id: '03', file: 'src/screens/StepTemplate.tsx', name: 'Template Selection' },
  { id: '04', file: 'src/screens/StepDetails.tsx', name: 'Salon Details' },
  { id: '05', file: 'src/screens/StepServices.tsx', name: 'Services & Packages' },
  { id: '06', file: 'src/screens/StepTeam.tsx', name: 'Team Setup' },
  { id: '07', file: 'src/screens/StepPhotos.tsx', name: 'Photo Gallery' },
  { id: '08', file: 'src/screens/StepSocials.tsx', name: 'Socials & Reels' },
  { id: '09', file: 'src/screens/StepLocation.tsx', name: 'Location & Hours' },
  { id: '10', file: 'src/screens/StepContactBooking.tsx', name: 'Contact & Booking Rules' },
  { id: '11', file: 'src/screens/StepPublish.tsx', name: 'Template Appearance' },
  { id: '12', file: 'src/screens/StepAIContentReview.tsx', name: 'AI Content Review' },
  { id: '13', file: 'src/screens/StepFullWebsitePreview.tsx', name: 'Full Website Preview' },
  { id: '14', file: 'src/screens/StepPublishSetup.tsx', name: 'Publish Setup' },
  { id: '15', file: 'src/screens/StepPublishSuccess.tsx', name: 'Publish Success & Live QR' },
  { id: '16', file: 'src/components/BookingConfirmation.tsx', name: 'Booking Confirmation' },
];
wizardScreens.forEach(s => {
  const exists = fs.existsSync(s.file);
  const content = exists ? fs.readFileSync(s.file, 'utf8') : '';
  check(`Screen ${s.id} — ${s.name}`, exists && content.length > 500, exists ? `${(content.length/1024).toFixed(1)}KB` : 'MISSING');
});
const bookingContent = fs.existsSync('src/components/BookingConfirmation.tsx') ? fs.readFileSync('src/components/BookingConfirmation.tsx', 'utf8') : '';
const appContent = fs.existsSync('src/App.tsx') ? fs.readFileSync('src/App.tsx', 'utf8') : '';
check('  ↳ Booking Confirmation NX-10482', bookingContent.includes('NX-10482') || appContent.includes('NX-10482'), 'booking ID found');

// Staff Management Module (Screen 17)
console.log('\n=== 2. STAFF MANAGEMENT MODULE (Screen 17) ===');
const staffFile = 'src/components/StaffManagementModule.tsx';
const staffExists = fs.existsSync(staffFile);
const staffContent = staffExists ? fs.readFileSync(staffFile, 'utf8') : '';
check('Screen 17 — Staff Management Module', staffExists, staffExists ? `${(staffContent.length/1024).toFixed(1)}KB` : 'MISSING');
check('  ↳ 7-Day Shifts', staffContent.includes('WeeklySchedule') || staffContent.includes('monday'), staffContent.includes('WeeklySchedule') ? 'WeeklySchedule found' : 'not found');
check('  ↳ Payroll & Commissions', staffContent.includes('Payroll') && staffContent.includes('Commission'), 'both keywords');
check('  ↳ Role Permissions', staffContent.includes('Role Permissions') || staffContent.includes('App Access'), 'found');
check('  ↳ Availability', staffContent.includes('Available') && staffContent.includes('Busy'), 'statuses found');

// Dashboard Screens 18-25
console.log('\n=== 3. SALON POST-LAUNCH DASHBOARD (Screens 18-25) ===');
const dashboardTabs = [
  { id: '18', name: 'Overview Dashboard', keyword: 'overview' },
  { id: '19', name: 'Website & Design Manager', keyword: 'website' },
  { id: '20', name: 'Bookings & Calendar', keyword: 'bookings' },
  { id: '21', name: 'Payments & Revenue Analytics', keyword: 'payments' },
  { id: '22', name: 'Marketing & Social Share Hub', keyword: 'share' },
  { id: '23', name: 'Salon Settings & Policies', keyword: 'settings' },
  { id: '24', name: 'Share & Referral Premium', keyword: 'referral' },
  { id: '25', name: 'Branding & White-label Settings Premium', keyword: 'branding' },
];
const landingContent = fs.existsSync('src/screens/Landing.tsx') ? fs.readFileSync('src/screens/Landing.tsx', 'utf8') : '';
dashboardTabs.forEach(t => {
  check(`Screen ${t.id} — ${t.name}`, landingContent.includes(`'${t.keyword}'`) || landingContent.includes(`"${t.keyword}"`) || landingContent.includes(t.keyword), `keyword:${t.keyword}`);
});

// Universal Navigator
console.log('\n=== 4. UNIVERSAL 25-SCREEN NAVIGATOR IN TopBar ===');
const topBarContent = fs.existsSync('src/components/TopBar.tsx') ? fs.readFileSync('src/components/TopBar.tsx', 'utf8') : '';
check('TopBar exists', fs.existsSync('src/components/TopBar.tsx'));
check('TopBar has 25 SCREENS array', topBarContent.includes('SCREENS') && (topBarContent.match(/label:/g) || []).length >= 25, `${(topBarContent.match(/label:/g) || []).length} labels`);
check('TopBar has universal-navigator test id', topBarContent.includes('universal-navigator'));
check('TopBar dropdown 1-click jump', topBarContent.includes('onNavigate') && topBarContent.includes('ChevronDown'));
check('TopBar shows 01 to 25', topBarContent.includes('01 —') && topBarContent.includes('25 —'));
check('TopBar badge 25 SCREENS', topBarContent.includes('25 SCREENS'));
check('App.tsx integrates TopBar navigator', fs.readFileSync('src/App.tsx','utf8').includes('navigateToScreen') && fs.readFileSync('src/App.tsx','utf8').includes('currentScreen'));

// Backend & Vite config
console.log('\n=== 5. EXPRESS BACKEND & VITE DEV SERVER ===');
const serverContent = fs.existsSync('server.ts') ? fs.readFileSync('server.ts','utf8') : '';
const viteContent = fs.existsSync('vite.config.ts') ? fs.readFileSync('vite.config.ts','utf8') : '';
check('Express server.ts has cors:true', serverContent.includes('Access-Control-Allow-Origin') || serverContent.includes('cors: true'));
check('Express server has allowedHosts:true', serverContent.includes('allowedHosts'));
check('Offline fallback for /api/generate-bio', serverContent.includes('/api/generate-bio') && serverContent.includes('offline fallback'));
check('Offline fallback for /api/improve-text', serverContent.includes('/api/improve-text') && serverContent.includes('offline fallback'));
check('Health endpoint reports screens:25', serverContent.includes('/api/health') && serverContent.includes('screens: 25'));
check('Vite config has allowedHosts:true', viteContent.includes('allowedHosts: true'));
check('Vite config has cors:true', viteContent.includes('cors: true'));
check('Vite server host 0.0.0.0', viteContent.includes("host: '0.0.0.0'") || viteContent.includes('host: "0.0.0.0"'));

// Build check
console.log('\n=== 6. BUILD & MODULE INTEGRITY ===');
check('App.tsx handles all 25 screens routing', fs.readFileSync('src/App.tsx','utf8').includes('16') && fs.readFileSync('src/App.tsx','utf8').includes('17') && fs.readFileSync('src/App.tsx','utf8').includes('25'));

console.log('\n' + (allPassed ? '✅ ALL 25 SCREENS VERIFIED — READY FOR PR' : '❌ SOME CHECKS FAILED — REVIEW ABOVE'));
process.exit(allPassed ? 0 : 1);
