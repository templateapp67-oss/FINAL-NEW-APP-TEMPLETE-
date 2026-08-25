/**
 * PHASE 10.11 — DYNAMIC SEO & SOCIAL METADATA
 *
 * Generates per-theme, per-locale, per-salon SEO metadata using ACTUAL salon data.
 * No fake information, no hardcoded cross-theme bleed.
 *
 * - Page Title, Meta Description, Keywords (theme-specific)
 * - OG: Title, Description, Image, Site Name, URL
 * - Technical: Canonical, Robots, Sitemap entry, Heading hierarchy check
 * - Language SEO: EN / HI localized titles/descriptions/metadata
 *
 * Uses real salonName, tagline, about, city, services, slug, publishedUrl, images.
 */
import type { SalonData } from '../types';
import type { AppLocale } from './locale';
import type { SiteHeaderThemeId } from './siteNavigation';
import { salonDisplayName } from './siteBooking';
import { getBrandConfig } from '../config/brandConfig';
import { publicWebsiteUrl, suggestedWebsiteSlug } from './publicWebsiteUrl';

export const SEO_ROBOTS = 'index, follow';
export const SEO_OG_TYPE = 'website';

export interface SeoMeta {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  ogSiteName: string;
  ogUrl: string;
  ogType: string;
  ogLocale: string;
  locale: AppLocale;
  themeId: SiteHeaderThemeId;
  vertical: string;
  city: string | null;
  salonName: string;
  url: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: number;
}

type ThemeSeoLang = {
  vertical: string;
  titleSuffix: string;
  descriptionFocus: string;
  keywords: string[];
};

type ThemeSeoConfig = Record<AppLocale, ThemeSeoLang>;

const THEME_SEO: Record<SiteHeaderThemeId, ThemeSeoConfig> = {
  barber_mens_grooming: {
    en: {
      vertical: "Men's Haircut, Beard & Grooming",
      titleSuffix: 'Premium Barber Shop & Grooming Lounge',
      descriptionFocus: 'precision fades, beard lineup, hot towel shave, men’s grooming',
      keywords: [
        'barber shop',
        'mens haircut',
        'beard trim',
        'beard styling',
        'hot towel shave',
        'mens grooming',
        'skin fade',
        'barber shop near me',
      ],
    },
    hi: {
      vertical: 'पुरुषों की हेयरकट, दाढ़ी और ग्रूमिंग',
      titleSuffix: 'प्रीमियम बार्बर शॉप और ग्रूमिंग लाउंज',
      descriptionFocus: 'परफेक्ट फेड, दाढ़ी लाइनअप, हॉट टॉवल शेव, मेंस ग्रूमिंग',
      keywords: [
        'बार्बर शॉप',
        'पुरुषों की हेयरकट',
        'दाढ़ी ट्रिम',
        'दाढ़ी स्टाइलिंग',
        'हॉट टॉवल शेव',
        'मेंस ग्रूमिंग',
        'स्किन फेड',
      ],
    },
  },
  hair_studio_color_bar: {
    en: {
      vertical: 'Hair Color, Balayage & Styling',
      titleSuffix: 'Hair Studio & Color Bar',
      descriptionFocus: 'balayage, hair color, precision cuts, editorial styling, gloss & toning',
      keywords: [
        'hair color',
        'balayage',
        'hair studio',
        'hair styling',
        'hair coloring',
        'highlights',
        'ombre',
        'hair color bar',
      ],
    },
    hi: {
      vertical: 'हेयर कलर, बाल्याज और स्टाइलिंग',
      titleSuffix: 'हेयर स्टूडियो और कलर बार',
      descriptionFocus: 'बाल्याज, हेयर कलर, परफेक्ट कट, एडिटोरियल स्टाइलिंग, ग्लॉस और टोनिंग',
      keywords: [
        'हेयर कलर',
        'बाल्याज',
        'हेयर स्टूडियो',
        'हेयर स्टाइलिंग',
        'हेयर कलरिंग',
        'हाइलाइट्स',
        'ओम्ब्रे',
      ],
    },
  },
  beauty_skin_spa: {
    en: {
      vertical: 'Facial, Spa & Skincare',
      titleSuffix: 'Beauty, Skin & Spa Sanctuary',
      descriptionFocus: 'facials, spa rituals, skincare, glow treatments, massage & wellness',
      keywords: [
        'facial',
        'spa',
        'skincare',
        'beauty spa',
        'skin treatment',
        'massage',
        'wellness',
        'glow facial',
      ],
    },
    hi: {
      vertical: 'फेशियल, स्पा और स्किनकेयर',
      titleSuffix: 'ब्यूटी, स्किन और स्पा सेंक्चुअरी',
      descriptionFocus: 'फेशियल, स्पा रिचुअल, स्किनकेयर, ग्लो ट्रीटमेंट, मसाज और वेलनेस',
      keywords: [
        'फेशियल',
        'स्पा',
        'स्किनकेयर',
        'ब्यूटी स्पा',
        'स्किन ट्रीटमेंट',
        'मसाज',
        'वेलनेस',
        'ग्लो फेशियल',
      ],
    },
  },
  family_full_service: {
    en: {
      vertical: 'Unisex, Kids & Family Salon',
      titleSuffix: 'Full-Service Family Salon',
      descriptionFocus: 'unisex cuts, kids haircuts, family packages, grooming for all ages',
      keywords: [
        'family salon',
        'unisex salon',
        'kids haircut',
        'family haircut',
        'mens haircut',
        'womens haircut',
        'kids salon',
        'family grooming',
      ],
    },
    hi: {
      vertical: 'यूनिसेक्स, किड्स और फैमिली सैलून',
      titleSuffix: 'फुल-सर्विस फैमिली सैलून',
      descriptionFocus: 'यूनिसेक्स कट, किड्स हेयरकट, फैमिली पैकेज, हर उम्र के लिए ग्रूमिंग',
      keywords: [
        'फैमिली सैलून',
        'यूनिसेक्स सैलून',
        'किड्स हेयरकट',
        'परिवार सैलून',
        'बच्चों का सैलून',
        'फैमिली ग्रूमिंग',
      ],
    },
  },
  nail_lash_studio: {
    en: {
      vertical: 'Nails, Lash & Brow Studio',
      titleSuffix: 'Nail, Lash & Brow Art Studio',
      descriptionFocus: 'nail art, gel nails, lash lift, brow shaping, glossy sets, chrome aura',
      keywords: [
        'nail art',
        'nails',
        'lash extensions',
        'brow shaping',
        'nail studio',
        'gel nails',
        'manicure',
        'pedicure',
        'lash lift',
      ],
    },
    hi: {
      vertical: 'नेल्स, लैश और ब्रो स्टूडियो',
      titleSuffix: 'नेल, लैश और ब्रो आर्ट स्टूडियो',
      descriptionFocus: 'नेल आर्ट, जेल नेल्स, लैश लिफ्ट, ब्रो शेपिंग, ग्लॉसी सेट, क्रोम ऑरा',
      keywords: [
        'नेल आर्ट',
        'नेल्स',
        'लैश एक्सटेंशन',
        'ब्रो शेपिंग',
        'नेल स्टूडियो',
        'जेल नेल्स',
        'मैनिक्योर',
        'पेडिक्योर',
      ],
    },
  },
};

function safeCity(data: SalonData): string | null {
  const city = (data.address?.city || '').trim();
  return city || null;
}

/**
 * Build canonical URL from actual salon data — never fake, never a second
 * URL system. Uses the phase-1B helper `publicWebsiteUrl` with the verified
 * slug (`websiteSlug` when allocated, else the business-name suggestion),
 * resolved against the configured white-label base host. The database stays
 * the slug authority at publish time; the published URL is preferred when
 * present.
 */
export function buildCanonicalUrl(data: SalonData): string {
  // Prefer the verified published URL (allocated by the publish RPC).
  const published = (data.publishedUrl || '').trim();
  if (published) {
    try {
      const u = new URL(published);
      if (u.protocol.startsWith('http')) return u.toString();
    } catch {
      if (published.startsWith('http')) return published;
    }
  }
  const brand = getBrandConfig();
  const slug = suggestedWebsiteSlug(data);
  if (slug) {
    return publicWebsiteUrl(slug, brand.platform.websiteUrl) || brand.platform.websiteUrl;
  }
  return brand.platform.websiteUrl;
}

/** OG Image from actual salon media — never invented. */
export function buildOgImage(data: SalonData): string | null {
  if (data.socialShareImageUrl && data.socialShareImageUrl.trim()) return data.socialShareImageUrl.trim();
  if (data.heroImageUrl && data.heroImageUrl.trim()) return data.heroImageUrl.trim();
  if (data.gallery && data.gallery[0]?.url) return data.gallery[0].url;
  if (data.logoUrl && data.logoUrl.trim()) return data.logoUrl.trim();
  if (data.socialVideos && data.socialVideos[0]?.thumbnailUrl) return data.socialVideos[0].thumbnailUrl;
  return null;
}

function snippet(text: string | undefined, max = 140): string {
  if (!text) return '';
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

function serviceKeywords(data: SalonData, limit = 6): string[] {
  const names = (data.services || [])
    .map((s) => (s.name || '').trim())
    .filter(Boolean)
    .slice(0, limit);
  return names;
}

/** Core SEO generator — per theme, per locale, using real salon data. */
export function generateSeoMeta(
  data: SalonData,
  themeId: SiteHeaderThemeId,
  locale: AppLocale,
): SeoMeta {
  const cfg = THEME_SEO[themeId]?.[locale] || THEME_SEO.barber_mens_grooming.en;
  const city = safeCity(data);
  const salonName = salonDisplayName(data, themeId);
  const canonical = buildCanonicalUrl(data);
  const ogImage = buildOgImage(data);

  const vertical = cfg.vertical;

  // Title — distinct per theme, localized, includes actual salon name + city
  let title: string;
  if (locale === 'hi') {
    if (city) {
      title = `${salonName} | ${city} में ${vertical} | ऑनलाइन बुक करें`;
    } else {
      title = `${salonName} | ${vertical} | ${cfg.titleSuffix}`;
    }
  } else {
    if (city) {
      title = `${salonName} | ${vertical} in ${city} | Book Online`;
    } else {
      title = `${salonName} | ${vertical} | ${cfg.titleSuffix}`;
    }
  }
  // Keep title under ~70 chars for SEO ideal, but never cut salonName
  if (title.length > 75) {
    title = locale === 'hi'
      ? `${salonName} | ${vertical}${city ? ` | ${city}` : ''}`
      : `${salonName} | ${vertical}${city ? ` in ${city}` : ''}`;
  }

  // Description — use actual about/tagline + theme focus + city
  const aboutSrc = (data.about || data.tagline || '').trim();
  const aboutPart = snippet(aboutSrc, 80);
  const focusPart = cfg.descriptionFocus;
  let description: string;
  if (locale === 'hi') {
    const locPart = city ? `${city} में स्थित` : '';
    description = aboutPart
      ? `${salonName} ${locPart} — ${focusPart}। ${aboutPart} अपॉइंटमेंट ऑनलाइन बुक करें।`
      : `${salonName} ${locPart} में ${vertical.toLowerCase()} के लिए — ${focusPart}। ऑनलाइन बुकिंग उपलब्ध।`;
  } else {
    const locPart = city ? ` in ${city}` : '';
    description = aboutPart
      ? `${aboutPart} Professional ${vertical.toLowerCase()} services: ${focusPart}${locPart}. Book appointment online at ${salonName}.`
      : `Professional ${vertical.toLowerCase()} at ${salonName}${locPart}: ${focusPart}. Book your appointment online today.`;
  }
  // Trim description to ~155 chars ideal but keep meaningful
  if (description.length > 160) {
    description = snippet(description, 158);
  }

  // Keywords — theme base + real service names + salonName + city
  const base = cfg.keywords;
  const svc = serviceKeywords(data);
  const extra = [salonName, city].filter(Boolean) as string[];
  const allKeywords = [...base, ...svc, ...extra]
    .map((k) => k.toLowerCase().trim())
    .filter(Boolean);
  // Deduplicate preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const k of allKeywords) {
    if (!seen.has(k)) {
      seen.add(k);
      deduped.push(k);
    }
  }
  const keywords = deduped.join(', ');

  const ogLocale = locale === 'hi' ? 'hi_IN' : 'en_US';

  return {
    title,
    description,
    keywords,
    canonical,
    robots: SEO_ROBOTS,
    ogTitle: title,
    ogDescription: description,
    ogImage,
    ogSiteName: salonName,
    ogUrl: canonical,
    ogType: SEO_OG_TYPE,
    ogLocale,
    locale,
    themeId,
    vertical,
    city,
    salonName,
    url: canonical,
  };
}

/** Sitemap entry — uses canonical URL, compatible with XML sitemap. */
export function buildSitemapEntry(data: SalonData, themeId: SiteHeaderThemeId, locale: AppLocale = 'en'): SitemapEntry {
  const canonical = buildCanonicalUrl(data);
  // Append theme as query for distinct theme URLs while keeping canonical base for SEO
  // For sitemap, each salon theme could be indexed separately if needed
  const loc = canonical;
  return {
    loc,
    lastmod: new Date().toISOString().slice(0, 10),
    changefreq: 'weekly',
    priority: themeId === 'barber_mens_grooming' ? 1.0 : 0.8,
  };
}

/** Verify heading hierarchy — Phase 10.11 technical SEO */
export function verifyHeadingHierarchy(root: ParentNode | Document = document): {
  hasH1: boolean;
  h1Count: number;
  h1Text: string | null;
  h2Count: number;
  h3Count: number;
  isValid: boolean;
  issues: string[];
} {
  const h1s = root.querySelectorAll ? Array.from(root.querySelectorAll('h1')) : [];
  const h2s = root.querySelectorAll ? Array.from(root.querySelectorAll('h2')) : [];
  const h3s = root.querySelectorAll ? Array.from(root.querySelectorAll('h3')) : [];

  const issues: string[] = [];
  if (h1s.length === 0) issues.push('Missing H1');
  if (h1s.length > 1) issues.push(`Multiple H1s: ${h1s.length}`);

  const h1Text = h1s[0]?.textContent?.trim() || null;

  return {
    hasH1: h1s.length >= 1,
    h1Count: h1s.length,
    h1Text,
    h2Count: h2s.length,
    h3Count: h3s.length,
    isValid: issues.length === 0,
    issues,
  };
}

/** Check for duplicate theme metadata across generated SEO objects */
export function findDuplicateSeo(seoList: SeoMeta[]): { duplicates: string[][]; isUnique: boolean } {
  const byTitle = new Map<string, string[]>();
  const byDesc = new Map<string, string[]>();

  for (const seo of seoList) {
    const tKey = seo.title.toLowerCase();
    const dKey = seo.description.toLowerCase();
    if (!byTitle.has(tKey)) byTitle.set(tKey, []);
    byTitle.get(tKey)!.push(seo.themeId);
    if (!byDesc.has(dKey)) byDesc.set(dKey, []);
    byDesc.get(dKey)!.push(seo.themeId);
  }

  const duplicates: string[][] = [];
  for (const [title, themes] of byTitle) {
    if (themes.length > 1) duplicates.push([`TITLE duplicate: "${title}"`, ...themes]);
  }
  for (const [desc, themes] of byDesc) {
    if (themes.length > 1) duplicates.push([`DESC duplicate: "${desc.slice(0, 60)}..."`, ...themes]);
  }

  return { duplicates, isUnique: duplicates.length === 0 };
}
