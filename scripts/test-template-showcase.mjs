import fs from 'fs';
import path from 'path';

console.log('🔍 Testing Template Showcase Modal Implementation...');

// 1. Verify TemplateShowcaseModal component file exists
const modalPath = path.join(process.cwd(), 'src/components/TemplateShowcaseModal.tsx');
if (!fs.existsSync(modalPath)) {
  console.error('❌ TemplateShowcaseModal.tsx does not exist');
  process.exit(1);
}
console.log('✅ TemplateShowcaseModal.tsx component file exists');

const content = fs.readFileSync(modalPath, 'utf-8');

// 2. Verify filter categories exist
const requiredFilters = ['All', 'Modern', 'Classic', 'Minimalist'];
for (const filter of requiredFilters) {
  if (!content.includes(filter)) {
    console.error(`❌ Missing filter category: ${filter}`);
    process.exit(1);
  }
}
console.log('✅ All style filters (All, Modern, Classic, Minimalist) are present');

// 3. Verify test IDs exist for test automation
const requiredTestIds = [
  'template-showcase-modal',
  'close-showcase-modal',
  'showcase-filter-${style.toLowerCase()}',
  'showcase-large-preview',
  'showcase-apply-btn',
];

for (const testId of requiredTestIds) {
  if (!content.includes(testId)) {
    console.error(`❌ Missing test id: ${testId}`);
    process.exit(1);
  }
}
console.log('✅ All test IDs present in TemplateShowcaseModal');

// 4. Verify ThemeSelector integration
const selectorPath = path.join(process.cwd(), 'src/components/ThemeSelector.tsx');
const selectorContent = fs.readFileSync(selectorPath, 'utf-8');

if (!selectorContent.includes('TemplateShowcaseModal') || !selectorContent.includes('open-template-showcase-btn')) {
  console.error('❌ ThemeSelector.tsx is missing TemplateShowcaseModal integration');
  process.exit(1);
}
console.log('✅ ThemeSelector.tsx correctly integrates TemplateShowcaseModal');

console.log('🎉 ALL TEMPLATE SHOWCASE CHECKS PASSED!');
