/**
 * PHASE 11.3 — HERO MEDIA FRAME.
 *
 * One media primitive shared by the five heroes. It owns BEHAVIOUR only —
 * every theme passes its own sources, aspect ratio, rounding and overlay, so
 * no theme inherits another theme's visual treatment (the Phase 11.1 layouts
 * are untouched).
 *
 * Behaviour contract:
 *   - Renders an inline `<video>` only when the plan allows motion. The video
 *     is ALWAYS `muted` + `playsInline` + `loop` and never carries `controls`,
 *     so it can never autoplay with sound.
 *   - Honours `prefers-reduced-motion`: motion-suppressed heroes render the
 *     poster still image instead of the clip.
 *   - Reserves space with a fixed `aspect-ratio` so the hero never shifts.
 *   - Falls back to the theme's poster image if the video errors, and to the
 *     existing `SiteImage` error state if the image itself fails.
 *   - Images flow through the EXISTING `SiteImage` performance component
 *     (srcset, eager above-the-fold, skeleton, error handling).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import SiteImage from '../SiteImage';
import { heroImageSizes, heroImageSrc } from '../../lib/siteHeroMedia';
import type { HeroMediaPlan } from '../../lib/siteHeroMedia';
import type { ViewportMode } from '../../lib/siteStructure';

interface Props {
  /** Which theme is rendering — surfaced for tests and debugging. */
  themeId: string;
  plan: HeroMediaPlan;
  alt: string;
  mode: ViewportMode;
  /** CSS aspect-ratio string, e.g. "3/4" — prevents layout shift. */
  aspectRatio: string;
  /** Theme-owned classes for the frame (rounding, borders, shadows). */
  className?: string;
  style?: CSSProperties;
  /** Theme-owned overlay/caption rendered above the media. */
  children?: ReactNode;
  /** Background behind the media while it loads. */
  placeholderColor?: string;
}

export default function HeroMediaFrame({
  themeId,
  plan,
  alt,
  mode,
  aspectRatio,
  className = '',
  style,
  children,
  placeholderColor,
}: Props) {
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const showVideo = plan.video !== null && !videoFailed;

  // Guarantee muted playback even if a browser restores a previous volume.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    if (typeof el.play === 'function') {
      const attempt = el.play();
      if (attempt && typeof attempt.catch === 'function') {
        // Autoplay blocked (common on mobile data saver) → show the poster.
        attempt.catch(() => setVideoFailed(true));
      }
    }
  }, [plan.video?.src]);

  return (
    <div
      data-testid="hero-media-frame"
      data-hero-media-theme={themeId}
      data-hero-media-kind={showVideo ? 'video' : 'image'}
      data-hero-motion={plan.motionSuppressed ? 'reduced' : 'allowed'}
      data-hero-video-failed={videoFailed ? 'true' : 'false'}
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio, backgroundColor: placeholderColor, ...style }}
    >
      {showVideo && plan.video ? (
        <video
          ref={videoRef}
          data-testid="hero-media-video"
          data-hero-video-origin={plan.video.origin}
          className="absolute inset-0 w-full h-full object-cover"
          src={plan.video.src}
          poster={heroImageSrc(plan.posterUrl, mode)}
          // Never autoplay with sound: muted + playsInline + no controls.
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          // Ambience only: the hero headline already conveys the meaning, so
          // the clip is exposed as an unlabelled decorative image to AT rather
          // than an interactive media element.
          role="img"
          aria-label={alt}
          tabIndex={-1}
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <SiteImage
          data-testid="hero-media-poster"
          src={heroImageSrc(plan.posterUrl, mode)}
          alt={alt}
          className="absolute inset-0 w-full h-full"
          style={{ position: 'absolute', inset: 0 }}
          sizes={heroImageSizes(mode)}
          context="hero"
          priority
          aspectRatio={aspectRatio}
        />
      )}
      {children}
    </div>
  );
}
