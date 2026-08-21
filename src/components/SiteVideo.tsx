/**
 * PHASE 10.12 — Optimized Video / Reel component
 *
 * - Lazy-load videos/reels (Intersection Observer)
 * - Do not load all videos on initial page load
 * - Thumbnails/posters first
 * - Load embed only when needed (on click)
 */

import { useEffect, useState, useRef } from 'react';
import { Play, ExternalLink } from 'lucide-react';
import { __mockInView } from '../lib/sitePerformance';

interface Props {
  thumbnailUrl: string;
  title: string;
  embedUrl?: string | null;
  url: string;
  platform: string;
  onPlay?: () => void;
  onView?: () => void;
  className?: string;
  aspectRatio?: string;
}

export default function SiteVideo({
  thumbnailUrl,
  title,
  embedUrl,
  url,
  platform,
  onPlay,
  onView,
  className = '',
  aspectRatio = '9/16',
}: Props) {
  const [inView, setInView] = useState(() => {
    if (__mockInView !== null) return __mockInView;
    return false;
  });
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (__mockInView !== null) {
      setInView(__mockInView);
      return;
    }
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: '300px 0px', threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handlePlay = () => {
    if (embedUrl) {
      setIsPlaying(true);
      onPlay?.();
    } else {
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
      onView?.();
    }
  };

  return (
    <div
      ref={ref}
      data-testid="site-video-wrapper"
      data-platform={platform}
      data-in-view={inView ? 'true' : 'false'}
      data-playing={isPlaying ? 'true' : 'false'}
      className={`relative overflow-hidden group ${className}`}
      style={{ aspectRatio }}
    >
      {!thumbLoaded && <div data-testid="site-video-skeleton" className="absolute inset-0 bg-gray-100 animate-pulse" aria-hidden />}

      {inView && thumbnailUrl ? (
        <img
          data-testid="site-video-thumbnail"
          src={thumbnailUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity ${thumbLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setThumbLoaded(true)}
          onError={() => setThumbLoaded(true)}
        />
      ) : (
        <div className="absolute inset-0 bg-gray-100" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {!isPlaying && (
        <button
          type="button"
          data-testid="site-video-play"
          aria-label={`Play ${title}`}
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Play className="w-5 h-5 ml-0.5 text-black" />
          </span>
        </button>
      )}

      {isPlaying && embedUrl && (
        <div data-testid="site-video-embed" className="absolute inset-0 bg-black">
          <iframe
            title={title}
            src={`${embedUrl}?autoplay=1`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}

      <div className="absolute bottom-2 left-2 right-2 text-white pointer-events-none">
        <p className="text-[9px] uppercase tracking-[0.16em] opacity-80">{platform}</p>
        <p className="text-xs font-bold line-clamp-2">{title}</p>
      </div>
    </div>
  );
}
