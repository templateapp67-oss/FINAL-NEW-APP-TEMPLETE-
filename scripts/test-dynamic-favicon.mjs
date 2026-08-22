import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  generateFaviconSvgDataUri,
  getSalonFaviconUrl,
  updateSalonFavicon,
  resetSalonFavicon,
} from '../src/lib/favicon.ts';

console.log('--- Testing Dynamic Salon Favicon Helper ---');

// 1. Test SVG generation with brandColor and salonName
{
  const svgDataUri = generateFaviconSvgDataUri({
    brandColor: '#047857',
    salonName: 'Emerald Luxury Spa',
  });

  assert(svgDataUri.startsWith('data:image/svg+xml;utf8,'), 'Should return valid SVG Data URI');
  const decoded = decodeURIComponent(svgDataUri.replace('data:image/svg+xml;utf8,', ''));
  assert(decoded.includes('#047857'), 'Decoded SVG should contain the brand color #047857');
  assert(decoded.includes('>E<'), 'Decoded SVG should contain initial letter "E" for Emerald');
  console.log('✓ generateFaviconSvgDataUri generates correct SVG data URI with color and initial');
}

// 2. Test getSalonFaviconUrl with logoUrl
{
  const customLogo = 'https://images.unsplash.com/photo-custom-logo.jpg';
  const resolved = getSalonFaviconUrl({
    logoUrl: customLogo,
    brandColor: '#ac0053',
    salonName: 'Royal Studio',
  });

  assert.equal(resolved, customLogo, 'Should prioritize logoUrl when provided');
  console.log('✓ getSalonFaviconUrl prioritizes logoUrl');
}

// 3. Test getSalonFaviconUrl fallback to SVG
{
  const resolved = getSalonFaviconUrl({
    logoUrl: '',
    brandColor: '#1d4ed8',
    salonName: 'Blue Velvet Salon',
  });

  assert(resolved.startsWith('data:image/svg+xml;utf8,'), 'Should fallback to SVG Data URI when logoUrl is empty');
  const decoded = decodeURIComponent(resolved.replace('data:image/svg+xml;utf8,', ''));
  assert(decoded.includes('#1d4ed8'), 'Decoded SVG should contain brand color #1d4ed8');
  assert(decoded.includes('>B<'), 'Decoded SVG should contain initial "B"');
  console.log('✓ getSalonFaviconUrl generates SVG fallback when logoUrl is missing');
}

// 4. Test DOM updates in JSDOM environment
{
  const dom = new JSDOM('<!DOCTYPE html><html><head><link rel="icon" href="/default-icon.png"></head><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };

  // Test updating favicon with custom logo
  const updatedUrl = updateSalonFavicon({
    logoUrl: 'https://cdn.example.com/salon-logo.png',
    salonName: 'Custom Salon',
  });

  const link = document.head.querySelector('link[rel="icon"]');
  assert(link, 'Favicon link should exist');
  assert.equal(link.getAttribute('href'), 'https://cdn.example.com/salon-logo.png');
  assert.equal(updatedUrl, 'https://cdn.example.com/salon-logo.png');
  console.log('✓ updateSalonFavicon updates existing DOM <link rel="icon"> element with logoUrl');

  // Test updating favicon with brandColor and name
  updateSalonFavicon({
    brandColor: '#ac0053',
    salonName: 'Nexora Hair Bar',
  });

  const updatedLink = document.head.querySelector('link[rel="icon"]');
  assert(updatedLink.getAttribute('href').startsWith('data:image/svg+xml;utf8,'), 'Link href should be SVG data URI');
  const decodedSvg = decodeURIComponent(updatedLink.getAttribute('href').replace('data:image/svg+xml;utf8,', ''));
  assert(decodedSvg.includes('#ac0053'), 'SVG should contain brand color');
  assert(decodedSvg.includes('>N<'), 'SVG should contain initial N');
  console.log('✓ updateSalonFavicon updates DOM with generated SVG favicon');

  // Test reset
  resetSalonFavicon();
  const resetLink = document.head.querySelector('link[rel="icon"]');
  assert(resetLink.getAttribute('href'), 'Favicon should have a default href after reset');
  console.log('✓ resetSalonFavicon resets the DOM favicon');

  // Clean up globals
  delete global.window;
  delete global.document;
  delete global.localStorage;
}

console.log('--- All Dynamic Favicon Tests Passed Successfully! ---');
