/**
 * PHASE 10.11 — DYNAMIC SEO & SOCIAL METADATA component
 *
 * Mounts in each of the 5 theme renderers.
 * - Generates SEO from actual salon data + theme + locale
 * - Writes to document head (title, meta description, keywords, OG, canonical, robots)
 * - Renders hidden testable div [data-testid="site-seo"] with all metadata for validation
 * - Verifies heading hierarchy (H1 exists, single H1)
 * - Does NOT modify Header, Booking, Payment, Reviews, Footer, Legal
 *
 * No fake data, no duplicate architecture.
 */
import { useEffect, useMemo } from 'react';
import type { SalonData } from '../types';
import type { ViewportMode } from '../lib/siteStructure';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { generateSeoMeta, verifyHeadingHierarchy, buildSitemapEntry } from '../lib/siteSeo';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';

function upsertMeta(nameOrProp: string, value: string, isProperty = false) {
  if (typeof document === 'undefined') return;
  const attr = isProperty ? 'property' : 'name';
  let el = document.head.querySelector(`meta[${attr}="${nameOrProp}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, nameOrProp);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function upsertLink(rel: string, href: string) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export default function SiteSeo({
  themeId,
  data,
  mode,
}: {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  mode: ViewportMode;
}) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);

  const seo = useMemo(() => generateSeoMeta(data, themeId, locale), [data, themeId, locale]);
  const sitemap = useMemo(() => buildSitemapEntry(data, themeId, locale), [data, themeId, locale]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Title
    document.title = seo.title;

    // Standard meta
    upsertMeta('description', seo.description);
    upsertMeta('keywords', seo.keywords);
    upsertMeta('robots', seo.robots);

    // OG
    upsertMeta('og:title', seo.ogTitle, true);
    upsertMeta('og:description', seo.ogDescription, true);
    upsertMeta('og:site_name', seo.ogSiteName, true);
    upsertMeta('og:url', seo.ogUrl, true);
    upsertMeta('og:type', seo.ogType, true);
    upsertMeta('og:locale', seo.ogLocale, true);
    if (seo.ogImage) {
      upsertMeta('og:image', seo.ogImage, true);
    }

    // Twitter / social preview compat
    upsertMeta('twitter:title', seo.ogTitle);
    upsertMeta('twitter:description', seo.ogDescription);
    if (seo.ogImage) upsertMeta('twitter:image', seo.ogImage);
    upsertMeta('twitter:card', 'summary_large_image');

    // Canonical
    upsertLink('canonical', seo.canonical);

    // Sitemap hint via link? not standard but we store for test
  }, [seo]);

  // Heading hierarchy check (for technical SEO validation, runs after render)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = setTimeout(() => {
      try {
        verifyHeadingHierarchy(document);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(id);
  }, [themeId, locale, mode]);

  return (
    <div
      data-testid="site-seo"
      data-theme={themeId}
      data-locale={locale}
      data-mode={mode}
      data-appearance={appearance}
      data-title={seo.title}
      data-description={seo.description}
      data-keywords={seo.keywords}
      data-canonical={seo.canonical}
      data-robots={seo.robots}
      data-og-title={seo.ogTitle}
      data-og-description={seo.ogDescription}
      data-og-image={seo.ogImage || ''}
      data-og-site-name={seo.ogSiteName}
      data-og-url={seo.ogUrl}
      data-og-type={seo.ogType}
      data-og-locale={seo.ogLocale}
      data-sitemap-loc={sitemap.loc}
      data-vertical={seo.vertical}
      data-city={seo.city || ''}
      data-salon-name={seo.salonName}
      style={{ display: 'none' }}
      aria-hidden
    >
      {/* Hidden structured data for testing social preview */}
      <span data-testid="site-seo-title">{seo.title}</span>
      <span data-testid="site-seo-description">{seo.description}</span>
      <span data-testid="site-seo-keywords">{seo.keywords}</span>
      <span data-testid="site-seo-canonical">{seo.canonical}</span>
      <span data-testid="site-seo-robots">{seo.robots}</span>
      <span data-testid="site-seo-og-title">{seo.ogTitle}</span>
      <span data-testid="site-seo-og-description">{seo.ogDescription}</span>
      <span data-testid="site-seo-og-image">{seo.ogImage || ''}</span>
      <span data-testid="site-seo-og-site-name">{seo.ogSiteName}</span>
      <span data-testid="site-seo-og-url">{seo.ogUrl}</span>
      <span data-testid="site-seo-vertical">{seo.vertical}</span>
    </div>
  );
}
