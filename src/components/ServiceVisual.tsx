/**
 * PHASE 12.7 — themed service visual (all five themes).
 *
 * Wraps the existing performance system (`SiteImage`) for service media so every
 * service card/detail gets the same guarantees:
 *
 *   - lazy loading (below-the-fold `service` context) + responsive srcSet;
 *   - fixed aspect ratio (no layout shift);
 *   - a themed category glyph fallback when the media is missing or broken;
 *   - alt text via the image (accessibility).
 *
 * The glyph is supplied by the caller from the theme's own category → icon map,
 * so a broken/missing image never falls back to another theme's artwork.
 */
import { useState } from 'react';
import SiteImage from './SiteImage';
import type { LucideIcon } from 'lucide-react';

interface Props {
  /** Configured media URL. Empty/undefined → glyph fallback. */
  src?: string;
  /** Localized service name — used as the image alt text. */
  alt: string;
  aspectRatio?: string;
  rounded?: string;
  className?: string;
  /** Themed category glyph for the missing/broken state. */
  glyph?: LucideIcon;
  glyphColor?: string;
  glyphBg?: string;
  glyphBorder?: string;
  /** Optional test id for the media wrapper (default `site-service-visual-media`). */
  testId?: string;
  priority?: boolean;
}

export default function ServiceVisual({
  src,
  alt,
  aspectRatio = '16/9',
  rounded = '',
  className = '',
  glyph,
  glyphColor = '#9ca3af',
  glyphBg = 'transparent',
  glyphBorder,
  testId,
  priority = false,
}: Props) {
  const [broken, setBroken] = useState(false);
  const Glyph = glyph;

  if (!src || broken) {
    if (Glyph) {
      return (
        <div
          data-testid="site-service-visual-fallback"
          className={`flex items-center justify-center ${rounded} ${className}`}
          style={{
            aspectRatio,
            backgroundColor: glyphBg,
            border: glyphBorder ? `1px solid ${glyphBorder}` : undefined,
          }}
          aria-hidden
        >
          <Glyph className="w-8 h-8" style={{ color: glyphColor }} />
        </div>
      );
    }
    return (
      <div
        data-testid="site-service-visual-fallback"
        className={`flex items-center justify-center bg-gray-100 ${rounded} ${className}`}
        style={{ aspectRatio }}
      >
        <span className="text-[10px] text-gray-400">Image unavailable</span>
      </div>
    );
  }

  return (
    <div data-testid={testId || 'site-service-visual-media'} className={className} style={{ aspectRatio }}>
      <SiteImage
        src={src}
        alt={alt}
        context="service"
        rounded={rounded}
        priority={priority}
        className="w-full h-full"
        onError={() => setBroken(true)}
      />
    </div>
  );
}
