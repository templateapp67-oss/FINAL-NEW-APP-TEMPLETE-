/**
 * DYNAMIC SALON FAVICON HELPER
 *
 * Dynamically updates the browser favicon in the document head when a salon is loaded.
 * - Uses the salon's custom `logoUrl` if available.
 * - Falls back to a generated, high-DPI SVG favicon data URI based on the salon's
 *   `brandColor` and initial letter of the salon name.
 * - Supports resetting back to default platform favicon.
 */

import { getBrandConfig } from '../config/brandConfig';

export interface SalonFaviconOptions {
  logoUrl?: string | null;
  brandColor?: string | null;
  salonName?: string | null;
  name?: string | null;
}

/**
 * Adjust hex color brightness/shade for gradient effect in generated SVG
 */
function adjustColorBrightness(hex: string, percent: number): string {
  const cleanHex = hex.replace('#', '').trim();
  let num = parseInt(cleanHex, 16);
  if (isNaN(num)) return hex;

  let r = (num >> 16) + Math.round((percent / 100) * 255);
  let g = ((num >> 8) & 0x00ff) + Math.round((percent / 100) * 255);
  let b = (num & 0x0000ff) + Math.round((percent / 100) * 255);

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Generate a clean, crisp SVG favicon as a data URI based on brand color and salon name initial.
 */
export function generateFaviconSvgDataUri(options: {
  brandColor?: string | null;
  salonName?: string | null;
  initial?: string | null;
}): string {
  const brand = getBrandConfig();
  const rawColor = (options.brandColor || brand.theme?.primaryColor || '#ac0053').trim();
  const color1 = rawColor.startsWith('#') ? rawColor : `#${rawColor}`;
  const color2 = adjustColorBrightness(color1, -25);

  const rawName = (options.initial || options.salonName || brand.defaultSalon?.name || 'Nexora').trim();
  const initial = rawName ? rawName.charAt(0).toUpperCase() : 'N';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="nexora-fav-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color1}"/>
      <stop offset="100%" stop-color="${color2}"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#nexora-fav-grad)"/>
  <text x="50%" y="54%" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="34" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${initial}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Resolve the effective favicon URL for a salon:
 * 1. `logoUrl` if present and valid
 * 2. Generated SVG data URI from `brandColor` + initial letter
 */
export function getSalonFaviconUrl(salon?: SalonFaviconOptions | null): string {
  if (salon?.logoUrl && typeof salon.logoUrl === 'string' && salon.logoUrl.trim().length > 0) {
    return salon.logoUrl.trim();
  }

  const name = salon?.salonName || salon?.name || '';
  return generateFaviconSvgDataUri({
    brandColor: salon?.brandColor,
    salonName: name,
  });
}

/**
 * Dynamically update or insert the favicon `<link>` tags in document `<head>`.
 */
export function updateSalonFavicon(salon?: SalonFaviconOptions | null): string {
  if (typeof document === 'undefined') return '';

  const faviconUrl = getSalonFaviconUrl(salon);
  const isSvg = faviconUrl.startsWith('data:image/svg+xml') || faviconUrl.endsWith('.svg');
  const mimeType = isSvg ? 'image/svg+xml' : 'image/x-icon';

  let iconLinks = document.head.querySelectorAll<HTMLLinkElement>(
    "link[rel='icon'], link[rel='shortcut icon'], link[rel~='icon']"
  );

  if (iconLinks.length === 0) {
    const newLink = document.createElement('link');
    newLink.rel = 'icon';
    newLink.type = mimeType;
    newLink.href = faviconUrl;
    document.head.appendChild(newLink);
  } else {
    iconLinks.forEach((link) => {
      link.type = mimeType;
      link.href = faviconUrl;
    });
  }

  return faviconUrl;
}

/**
 * Restore the default platform favicon
 */
export function resetSalonFavicon(): void {
  if (typeof document === 'undefined') return;
  const brand = getBrandConfig();
  const defaultUrl = brand.platform.faviconUrl || generateFaviconSvgDataUri({
    brandColor: brand.theme.primaryColor,
    salonName: brand.platform.name,
  });

  const iconLinks = document.head.querySelectorAll<HTMLLinkElement>(
    "link[rel='icon'], link[rel='shortcut icon'], link[rel~='icon']"
  );

  if (iconLinks.length === 0) {
    const newLink = document.createElement('link');
    newLink.rel = 'icon';
    newLink.href = defaultUrl;
    document.head.appendChild(newLink);
  } else {
    iconLinks.forEach((link) => {
      link.href = defaultUrl;
    });
  }
}
