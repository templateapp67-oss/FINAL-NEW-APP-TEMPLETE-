import assert from 'node:assert/strict';
import {
  BRAND_COLORS,
  DEFAULT_BRAND_COLOR,
  TAGLINE_CATEGORIES,
  TAGLINE_SUBCATEGORIES,
  getReadableTextColor,
  withHexAlpha,
} from '../src/lib/websiteCustomization.ts';

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('brand palette contains five unique valid colors', () => {
  assert.equal(BRAND_COLORS.length, 5);
  assert.equal(new Set(BRAND_COLORS.map(color => color.value)).size, 5);
  BRAND_COLORS.forEach(color => assert.match(color.value, /^#[0-9a-f]{6}$/i));
});

test('every tagline subcategory exposes exactly five choices', () => {
  for (const [category, subcategories] of Object.entries(TAGLINE_CATEGORIES)) {
    assert.deepEqual(TAGLINE_SUBCATEGORIES[category], Object.keys(subcategories));
    for (const options of Object.values(subcategories)) {
      assert.equal(options.length, 5);
      options.forEach(option => assert.ok(option.trim().length > 0));
    }
  }
});

test('hex alpha helper creates valid translucent colors and has a safe fallback', () => {
  assert.equal(withHexAlpha('#2563eb', '1a'), '#2563eb1a');
  assert.equal(withHexAlpha('invalid', '24'), `${DEFAULT_BRAND_COLOR}24`);
});

test('button contrast helper supports dark and light custom colors', () => {
  assert.equal(getReadableTextColor('#1a1c1c'), '#ffffff');
  assert.equal(getReadableTextColor('#fef08a'), '#111827');
  assert.equal(getReadableTextColor(undefined), '#ffffff');
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

console.log(`\n${passed}/${tests.length} website customization tests passed`);
