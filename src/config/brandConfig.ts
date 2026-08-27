import { useState, useEffect } from 'react';

/**
 * CENTRAL WHITE-LABEL BRAND CONFIGURATION
 *
 * This file serves as the single source of truth for all branding, platform names,
 * default salon profiles, theme colors, SEO metadata, contact information, and
 * white-label settings across the entire application.
 *
 * Any new brand or client can rebrand this application simply by modifying this
 * configuration or overriding it at runtime via the White-Label management UI.
 */

export interface PlatformBrandConfig {
  /** Platform / SaaS product name (e.g., 'Nexora') */
  name: string;
  /** Short form or acronym (e.g., 'Nexora') */
  shortName: string;
  /** Main platform marketing tagline */
  tagline: string;
  /** Full platform description */
  description: string;
  /** Text shown next to or inside the platform logo */
  logoText: string;
  /** URL or data URI for the platform logo image (empty string = vector icon fallback) */
  logoUrl: string;
  /** URL or data URI for the browser favicon */
  faviconUrl: string;
  /** Default "Powered by" text in footers (English) */
  poweredByText: string;
  /** Default "Powered by" text in footers (Hindi) */
  poweredByTextHi: string;
  /** Whether platform branding is completely hidden (White-Label mode) */
  hidePlatformBranding: boolean;
  /** Platform support & sales email */
  supportEmail: string;
  /** Platform support phone / WhatsApp */
  supportPhone: string;
  /** Platform main marketing website URL */
  websiteUrl: string;
  /** Platform cloud server status label */
  cloudServerLabel: string;
  /** Referral code prefix */
  referralPrefix: string;
  /** Booking reference prefix (e.g., 'NX-') */
  bookingIdPrefix: string;
}

export interface DefaultBusinessConfig {
  /** Default salon / business name */
  name: string;
  /** Tagline */
  tagline: string;
  /** About business summary */
  about: string;
  /** Owner / Founder name */
  ownerName: string;
  /** Owner role / title */
  ownerRole: string;
  /** Owner avatar / photo */
  ownerPhotoUrl: string;
  /** Owner intro bio */
  ownerIntro: string;
  /** Primary contact phone */
  phone: string;
  /** WhatsApp contact phone */
  whatsappPhone: string;
  /** Business email address */
  email: string;
  /** Hero headline for the template */
  heroHeadline: string;
  /** Default URL slug */
  slug: string;
  /** Booking CTA message */
  bookingCTA: string;
  /** Physical address information */
  address: {
    fullAddress: string;
    shopNumber: string;
    area: string;
    city: string;
    state: string;
    pinCode: string;
    landmark: string;
  };
  /** Default social media profiles */
  socialProfiles: {
    instagram: string;
    facebook: string;
    youtube: string;
    tiktok: string;
  };
}

export interface ThemeBrandConfig {
  /** Primary brand color hex (e.g. '#ac0053') */
  primaryColor: string;
  /** Hover state for primary color */
  primaryHover: string;
  /** Light tint for primary color */
  primaryLight: string;
  /** Dark shade for primary color */
  primaryDark: string;
  /** Translucent soft background */
  primarySoft: string;
  /** Accent glow color */
  accentGlow: string;
  /** Base typography */
  fontFamilySans: string;
  fontFamilySerif: string;
  /** Currency info */
  currency: string;
  currencySymbol: string;
  country: string;
}

export interface SeoBrandConfig {
  siteTitle: string;
  siteDescription: string;
  keywords: string;
  ogImage: string;
  themeColor: string;
}

export interface BrandConfig {
  platform: PlatformBrandConfig;
  defaultSalon: DefaultBusinessConfig;
  theme: ThemeBrandConfig;
  seo: SeoBrandConfig;
}

/**
 * DEFAULT WHITE-LABEL BRAND CONSTANTS
 * Modify these to rebrand the entire application effortlessly.
 */
export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  platform: {
    name: 'Nexora',
    shortName: 'Nexora',
    tagline: 'Interactive Salon Website Builder & Business Management Suite',
    description: 'Create a high-converting website, manage appointments, and organize staff for your beauty business in minutes.',
    logoText: 'Nexora',
    logoUrl: '',
    faviconUrl: '',
    poweredByText: 'Powered by Nexora Platform',
    poweredByTextHi: 'Nexora प्लेटफ़ॉर्म द्वारा संचालित',
    hidePlatformBranding: false,
    supportEmail: 'support@final-new-app-templete.vercel.app',
    supportPhone: '+91 98765 43210',
    websiteUrl: 'https://final-new-app-templete.vercel.app',
    cloudServerLabel: 'Nexora Cloud Server Active',
    referralPrefix: 'NX',
    bookingIdPrefix: 'NX',
  },
  defaultSalon: {
    name: 'Nexora Demo Salon',
    tagline: 'Premium Hair, Beauty & Spa Care in Indore',
    about: 'Welcome to Nexora Demo Salon. We offer professional haircutting, hair spa, organic coloring, HD bridal makeup, and relaxing skin treatments.',
    ownerName: 'Aarav Sharma',
    ownerRole: 'Founder & Master Stylist',
    ownerPhotoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop',
    ownerIntro: 'I am Aarav Sharma, Founder & Master Stylist with over 12 years of experience in luxury haircutting and salon management across India. My passion is creating personalized looks that elevate your natural beauty.',
    phone: '+91 98765 43210',
    whatsappPhone: '+91 98765 43210',
    email: 'hello@nexora-demo.example',
    heroHeadline: 'Nexora Demo Salon',
    slug: 'nexora-demo-salon',
    bookingCTA: 'Ready to Transform Your Look? Book your appointment today and experience premium care.',
    address: {
      fullAddress: 'Shop 14, Linking Road, Bandra West, Mumbai, Maharashtra 400050',
      shopNumber: 'Shop 14',
      area: 'Linking Road, Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pinCode: '400050',
      landmark: 'Opposite National College',
    },
    socialProfiles: {
      instagram: 'https://instagram.com/nexorademosalon',
      facebook: 'https://facebook.com/nexorademosalon',
      youtube: 'https://youtube.com/@nexorademosalon',
      tiktok: 'https://instagram.com/nexorademosalon',
    },
  },
  theme: {
    primaryColor: '#ac0053',
    primaryHover: '#ba005b',
    primaryLight: '#ffd9e1',
    primaryDark: '#3f001a',
    primarySoft: 'rgba(172, 0, 83, 0.08)',
    accentGlow: '#ff2d8d',
    fontFamilySans: 'Inter, sans-serif',
    fontFamilySerif: 'Playfair Display, serif',
    currency: 'INR',
    currencySymbol: '₹',
    country: 'India',
  },
  seo: {
    siteTitle: 'Nexora — Salon Website Builder',
    siteDescription: 'Nexora salon website builder and business dashboard',
    keywords: 'salon website builder, beauty booking, hair salon management, salon software, spa booking, appointments',
    ogImage: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop',
    themeColor: '#ac0053',
  },
};

const STORAGE_KEY = 'nexora_brand_config';

/** Convert hex to RGB values */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const sanitized = hex.replace('#', '').trim();
  if (sanitized.length === 3) {
    const r = parseInt(sanitized[0] + sanitized[0], 16);
    const g = parseInt(sanitized[1] + sanitized[1], 16);
    const b = parseInt(sanitized[2] + sanitized[2], 16);
    return { r, g, b };
  }
  if (sanitized.length === 6) {
    const r = parseInt(sanitized.substring(0, 2), 16);
    const g = parseInt(sanitized.substring(2, 4), 16);
    const b = parseInt(sanitized.substring(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

/** Generate a harmonious palette from any primary color */
export function generateThemePalette(primaryHex: string) {
  const rgb = hexToRgb(primaryHex) || { r: 172, g: 0, b: 83 };
  
  // Calculate hover (slightly lighter or higher luminance)
  const hoverR = Math.min(255, Math.round(rgb.r * 1.1 + 10));
  const hoverG = Math.min(255, Math.round(rgb.g * 1.1 + 5));
  const hoverB = Math.min(255, Math.round(rgb.b * 1.1 + 5));
  const primaryHover = `#${hoverR.toString(16).padStart(2, '0')}${hoverG.toString(16).padStart(2, '0')}${hoverB.toString(16).padStart(2, '0')}`;

  // Light pastel tint
  const lightR = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * 0.82));
  const lightG = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * 0.82));
  const lightB = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * 0.82));
  const primaryLight = `#${lightR.toString(16).padStart(2, '0')}${lightG.toString(16).padStart(2, '0')}${lightB.toString(16).padStart(2, '0')}`;

  // Dark shade
  const darkR = Math.max(0, Math.round(rgb.r * 0.35));
  const darkG = Math.max(0, Math.round(rgb.g * 0.35));
  const darkB = Math.max(0, Math.round(rgb.b * 0.35));
  const primaryDark = `#${darkR.toString(16).padStart(2, '0')}${darkG.toString(16).padStart(2, '0')}${darkB.toString(16).padStart(2, '0')}`;

  const primarySoft = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
  const rgbString = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

  return {
    primaryColor: primaryHex,
    primaryHover,
    primaryLight,
    primaryDark,
    primarySoft,
    rgbString,
  };
}

/** Inject dynamic CSS variables into document :root */
export function injectBrandCssVariables(config: BrandConfig) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const palette = generateThemePalette(config.theme.primaryColor);

  root.style.setProperty('--brand-primary', palette.primaryColor);
  root.style.setProperty('--brand-primary-hover', palette.primaryHover);
  root.style.setProperty('--brand-primary-light', palette.primaryLight);
  root.style.setProperty('--brand-primary-dark', palette.primaryDark);
  root.style.setProperty('--brand-primary-soft', palette.primarySoft);
  root.style.setProperty('--brand-primary-rgb', palette.rgbString);
  root.style.setProperty('--brand-accent-glow', config.theme.accentGlow);
}

/** Upsert meta tag in head */
function upsertHeadMeta(name: string, content: string, isProperty = false) {
  if (typeof document === 'undefined') return;
  const attr = isProperty ? 'property' : 'name';
  let el = document.head.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Apply full brand config to document head, SEO, title, and CSS variables */
export function applyBrandConfigToDocument(config: BrandConfig = getBrandConfig()) {
  if (typeof document === 'undefined') return;

  // 1. Title
  if (config.seo.siteTitle) {
    document.title = config.seo.siteTitle;
  }

  // 2. Meta tags
  if (config.seo.siteDescription) {
    upsertHeadMeta('description', config.seo.siteDescription);
    upsertHeadMeta('og:description', config.seo.siteDescription, true);
    upsertHeadMeta('twitter:description', config.seo.siteDescription);
  }
  if (config.seo.keywords) {
    upsertHeadMeta('keywords', config.seo.keywords);
  }
  if (config.seo.ogImage) {
    upsertHeadMeta('og:image', config.seo.ogImage, true);
    upsertHeadMeta('twitter:image', config.seo.ogImage);
    upsertHeadMeta('twitter:card', 'summary_large_image');
  }
  if (config.theme.primaryColor) {
    upsertHeadMeta('theme-color', config.theme.primaryColor);
  }
  if (config.platform.name) {
    upsertHeadMeta('og:site_name', config.platform.name, true);
  }

  // 3. Favicon (dynamic update via favicon helper)
  const faviconUrl = config.platform.faviconUrl || config.platform.logoUrl;
  if (faviconUrl) {
    let favicon = document.head.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.setAttribute('rel', 'icon');
      document.head.appendChild(favicon);
    }
    favicon.setAttribute('href', faviconUrl);
  } else {
    // Generate fallback SVG icon with brand primary color and platform initial
    const rawColor = config.theme?.primaryColor || '#ac0053';
    const initial = (config.platform?.name || 'Nexora').trim().charAt(0).toUpperCase() || 'N';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="16" fill="${encodeURIComponent(rawColor)}"/><text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="34" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`;
    const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    let favicon = document.head.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.setAttribute('rel', 'icon');
      favicon.setAttribute('type', 'image/svg+xml');
      document.head.appendChild(favicon);
    }
    favicon.setAttribute('href', dataUri);
  }

  // 4. CSS variables
  injectBrandCssVariables(config);
}

import { safeSetItem, safeGetItem, safeRemoveItem } from '../lib/safeStorage';

let memoryBrandConfig: BrandConfig | null = null;

/** Sanitize and safely persist brand config to storage */
function persistBrandConfigSafely(config: BrandConfig): void {
  safeSetItem(STORAGE_KEY, JSON.stringify(config));
}

/** Get active brand config (persisted overrides merged with default) */
export function getBrandConfig(): BrandConfig {
  if (memoryBrandConfig) return memoryBrandConfig;
  if (typeof window === 'undefined') return DEFAULT_BRAND_CONFIG;

  try {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) {
      memoryBrandConfig = DEFAULT_BRAND_CONFIG;
      return DEFAULT_BRAND_CONFIG;
    }
    const parsed = JSON.parse(raw);
    const merged: BrandConfig = {
      platform: { ...DEFAULT_BRAND_CONFIG.platform, ...parsed.platform },
      defaultSalon: {
        ...DEFAULT_BRAND_CONFIG.defaultSalon,
        ...parsed.defaultSalon,
        address: {
          ...DEFAULT_BRAND_CONFIG.defaultSalon.address,
          ...(parsed.defaultSalon?.address || {}),
        },
        socialProfiles: {
          ...DEFAULT_BRAND_CONFIG.defaultSalon.socialProfiles,
          ...(parsed.defaultSalon?.socialProfiles || {}),
        },
      },
      theme: { ...DEFAULT_BRAND_CONFIG.theme, ...parsed.theme },
      seo: { ...DEFAULT_BRAND_CONFIG.seo, ...parsed.seo },
    };
    memoryBrandConfig = merged;
    return merged;
  } catch {
    memoryBrandConfig = DEFAULT_BRAND_CONFIG;
    return DEFAULT_BRAND_CONFIG;
  }
}

/** Update brand config and propagate changes dynamically */
export function updateBrandConfig(partial: Partial<BrandConfig> | ((prev: BrandConfig) => BrandConfig)): BrandConfig {
  const current = getBrandConfig();
  const updated: BrandConfig = typeof partial === 'function' ? partial(current) : {
    platform: { ...current.platform, ...(partial.platform || {}) },
    defaultSalon: {
      ...current.defaultSalon,
      ...(partial.defaultSalon || {}),
      address: {
        ...current.defaultSalon.address,
        ...(partial.defaultSalon?.address || {}),
      },
      socialProfiles: {
        ...current.defaultSalon.socialProfiles,
        ...(partial.defaultSalon?.socialProfiles || {}),
      },
    },
    theme: { ...current.theme, ...(partial.theme || {}) },
    seo: { ...current.seo, ...(partial.seo || {}) },
  };

  memoryBrandConfig = updated;
  persistBrandConfigSafely(updated);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('brand-config-changed', { detail: updated }));
  }

  applyBrandConfigToDocument(updated);
  return updated;
}

/** Reset brand config to baseline default */
export function resetBrandConfig(): BrandConfig {
  memoryBrandConfig = DEFAULT_BRAND_CONFIG;
  try {
    if (typeof window !== 'undefined') {
      safeRemoveItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('brand-config-changed', { detail: DEFAULT_BRAND_CONFIG }));
    }
  } catch {
    /* ignore */
  }
  applyBrandConfigToDocument(DEFAULT_BRAND_CONFIG);
  return DEFAULT_BRAND_CONFIG;
}

/** React hook to consume and update brand config reactively */
export function useBrandConfig() {
  const [config, setConfig] = useState<BrandConfig>(() => getBrandConfig());

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<BrandConfig>;
      if (customEvent.detail) {
        setConfig(customEvent.detail);
      } else {
        setConfig(getBrandConfig());
      }
    };
    window.addEventListener('brand-config-changed', handler);
    return () => window.removeEventListener('brand-config-changed', handler);
  }, []);

  return {
    config,
    updateConfig: updateBrandConfig,
    resetConfig: resetBrandConfig,
    platform: config.platform,
    defaultSalon: config.defaultSalon,
    theme: config.theme,
    seo: config.seo,
  };
}

export const brandConfig = getBrandConfig();
export default brandConfig;

export {
  updateSalonFavicon,
  getSalonFaviconUrl,
  generateFaviconSvgDataUri,
  resetSalonFavicon,
  type SalonFaviconOptions,
} from '../lib/favicon';

