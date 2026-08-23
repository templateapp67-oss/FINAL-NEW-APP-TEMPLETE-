/**
 * REELS & STYLING VIDEOS — interactive video player (public legacy template).
 *
 * Converts the previously static reel thumbnails into playable media:
 *
 *   - YouTube links (watch / youtu.be / Shorts / embed) → embedded iframe
 *     player with autoplay.
 *   - Instagram reels/posts → Instagram's official embed iframe.
 *   - Direct video files (mp4 / webm / ogg / mov / m4v) → HTML5
 *     `<video controls>` player.
 *   - Anything else (TikTok, Facebook, unknown) → graceful fallback card
 *     with a "Watch on <platform>" action that opens the original URL.
 *
 * The player is a modal/lightbox: clicking any reel thumbnail opens it,
 * Escape or the backdrop closes it. Pure presentation — the video list,
 * titles and URLs all come from `data.socialVideos` (white-label CMS data).
 */
import { useEffect, useMemo, useRef } from 'react';
import { ExternalLink, Play, Video, X } from 'lucide-react';
import type { SocialVideo } from '../types';
import {
  instagramEmbedUrl,
  parseInstagramShortcode,
  parseYoutubeVideoId,
  youtubeEmbedUrl,
} from '../lib/siteSocialFeed';

export type ReelPlayback =
  | { kind: 'youtube'; src: string }
  | { kind: 'instagram'; src: string }
  | { kind: 'file'; src: string }
  | { kind: 'external'; href: string };

const MEDIA_FILE_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;

const PLATFORM_LABELS: Record<SocialVideo['platform'], string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  tiktok: 'TikTok',
};

/** Resolves how a social video should play inside the lightbox. */
export function resolveReelPlayback(video: SocialVideo): ReelPlayback {
  const url = (video.originalPlatformUrl || video.url || '').trim();
  if (!url) return { kind: 'external', href: '#' };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { kind: 'external', href: '#' };
    }
    // Direct media file → native <video> player.
    if (MEDIA_FILE_EXT.test(parsed.pathname)) {
      return { kind: 'file', src: url };
    }
    // YouTube → official embed (covers watch, youtu.be, Shorts, embed).
    const youtubeId = parseYoutubeVideoId(url);
    if (youtubeId) {
      return { kind: 'youtube', src: `${youtubeEmbedUrl(youtubeId)}?autoplay=1&rel=0` };
    }
    // Instagram → official embed (reels + posts).
    const instagramCode = parseInstagramShortcode(url);
    if (instagramCode) {
      const kind = /\/reel/i.test(parsed.pathname) ? 'reel' : 'p';
      return { kind: 'instagram', src: instagramEmbedUrl(instagramCode, kind) };
    }
  } catch {
    return { kind: 'external', href: '#' };
  }
  return { kind: 'external', href: url };
}

interface Props {
  video: SocialVideo;
  salonName?: string;
  onClose: () => void;
}

export default function ReelsVideoPlayer({ video, salonName, onClose }: Props) {
  const playback = useMemo(() => resolveReelPlayback(video), [video]);
  const originalHref = (video.originalPlatformUrl || video.url || '').trim() || '#';
  const platformLabel = PLATFORM_LABELS[video.platform] || 'Original platform';
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management + Escape-to-close + scroll lock while open.
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const isEmbed = playback.kind === 'youtube' || playback.kind === 'instagram';

  return (
    <div
      data-testid="reels-video-player"
      role="dialog"
      aria-modal="true"
      aria-label={`Play video: ${video.title}`}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 backdrop-blur-[2px] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-black/90 border-b border-white/10">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">{platformLabel}</p>
            <h4 className="text-sm font-bold text-white truncate">{video.title}</h4>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={originalHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Watch on ${platformLabel}`}
              className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              ref={closeButtonRef}
              type="button"
              data-testid="reels-video-player-close"
              aria-label="Close video player"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Player surface */}
        {playback.kind === 'file' ? (
          <video
            data-testid="reels-video-player-file"
            src={playback.src}
            controls
            autoPlay
            playsInline
            className="w-full max-h-[70vh] bg-black"
          />
        ) : playback.kind === 'youtube' ? (
          <iframe
            data-testid="reels-video-player-embed"
            title={video.title}
            src={playback.src}
            className="w-full aspect-video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : playback.kind === 'instagram' ? (
          <div className="w-full flex justify-center bg-[#fafafa]">
            <iframe
              data-testid="reels-video-player-embed"
              title={video.title}
              src={playback.src}
              className="w-full max-w-[420px] h-[70vh]"
              allow="encrypted-media; autoplay"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
            <img
              src={video.thumbnailUrl}
              alt=""
              aria-hidden
              className="w-full max-h-[50vh] object-cover rounded-xl opacity-70"
            />
            <p className="text-xs text-white/80 max-w-sm">
              {platformLabel} does not allow in-page playback for this video.
            </p>
            <a
              data-testid="reels-video-player-watch"
              href={originalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-gray-900 hover:bg-white/90 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Watch on {platformLabel}
            </a>
          </div>
        )}

        {salonName ? (
          <p className="px-4 py-2.5 text-[10px] text-white/50 bg-black/90 border-t border-white/10 flex items-center gap-1.5">
            <Video className="w-3 h-3" /> {salonName}
          </p>
        ) : null}
      </div>
    </div>
  );
}
