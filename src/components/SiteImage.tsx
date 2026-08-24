/**
 * PHASE 10.12 — Optimized Image Component
 *
 * - Lazy-load below-the-fold
 * - Responsive sizes via srcSet
 * - Prevent oversized (max-w-full)
 * - Maintain aspect ratio to prevent layout shift
 * - Skeleton while loading
 * - Error + retry handling
 *
 * Uses actual salon data, no fake images.
 */
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { buildSrcSet, isAboveFold, isImageCached, markImageLoaded, markImageError, __mockInView } from '../lib/sitePerformance';

interface Props {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  aspectRatio?: string; // e.g., "1/1", "16/9", "4/5", "square", "video"
  sizes?: string;
  context?: 'hero' | 'logo' | 'service' | 'gallery' | 'team' | 'owner' | 'video' | 'other';
  priority?: boolean; // if true, eager load (above-the-fold)
  onLoad?: () => void;
  onError?: () => void;
  fallback?: string;
  rounded?: string; // tailwind rounded class
  /** PHASE 14.1 — object-fit of the inner img ('cover' default; 'contain'
   *  for lightbox previews so no content is cropped). */
  fit?: 'cover' | 'contain';
  objectPosition?: string;
}

export default function SiteImage({
  src,
  alt,
  className = '',
  style,
  aspectRatio = '16/9',
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  context = 'other',
  priority = false,
  onLoad,
  onError,
  fallback,
  rounded = '',
  fit = 'cover',
  objectPosition,
}: Props) {
  const [loaded, setLoaded] = useState(() => isImageCached(src));
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(() => {
    if (__mockInView !== null) return __mockInView;
    // Above-the-fold images should be in view immediately
    return isAboveFold(context) || priority;
  });
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy-loading below-the-fold
  useEffect(() => {
    if (__mockInView !== null) {
      setInView(__mockInView);
      return;
    }
    if (isAboveFold(context) || priority) {
      setInView(true);
      return;
    }
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const el = imgRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px 0px', threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [context, priority]);

  const handleLoad = () => {
    setLoaded(true);
    markImageLoaded(src);
    onLoad?.();
  };
  const handleError = () => {
    setError(true);
    markImageError(src);
    onError?.();
  };

  const srcSet = buildSrcSet(src);
  const loadingAttr = isAboveFold(context) || priority ? 'eager' : 'lazy';
  const decodingAttr = 'async' as const;
  const fetchPriority = isAboveFold(context) || priority ? 'high' as const : 'low' as const;

  // Aspect ratio style to prevent layout shift
  const ratio = aspectRatio === 'square' ? '1/1' : aspectRatio === 'video' ? '16/9' : aspectRatio;
  const wrapperStyle: CSSProperties = {
    aspectRatio: ratio,
    ...style,
  };

  if (error && fallback) {
    return (
      <div
        ref={imgRef}
        data-testid="site-image-error"
        data-context={context}
        className={`relative overflow-hidden bg-gray-100 flex items-center justify-center ${rounded} ${className}`}
        style={wrapperStyle}
      >
        <img
          src={fallback}
          alt={alt}
          loading={loadingAttr}
          decoding={decodingAttr}
          className={`w-full h-full object-${fit} ${rounded}`}
          onLoad={handleLoad}
          onError={() => setError(true)}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        ref={imgRef}
        data-testid="site-image-error"
        data-context={context}
        className={`relative overflow-hidden bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 ${rounded} ${className}`}
        style={wrapperStyle}
      >
        <span>Image unavailable</span>
      </div>
    );
  }

  return (
    <div
      ref={imgRef}
      data-testid="site-image-wrapper"
      data-context={context}
      data-loaded={loaded ? 'true' : 'false'}
      data-in-view={inView ? 'true' : 'false'}
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={wrapperStyle}
    >
      {/* Skeleton while loading */}
      {!loaded && (
        <div
          data-testid="site-image-skeleton"
          className={`absolute inset-0 animate-pulse bg-gradient-to-br from-gray-100 to-gray-200 ${rounded}`}
          aria-hidden
        />
      )}

      {inView && (
        <img
          data-testid="site-image"
          data-context={context}
          src={src}
          alt={alt}
          srcSet={srcSet}
          sizes={sizes}
          loading={loadingAttr}
          decoding={decodingAttr}
          // @ts-ignore fetchPriority is valid
          fetchPriority={fetchPriority}
          className={`w-full h-full object-${fit} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${rounded}`}
          style={{ maxWidth: '100%' }}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}
