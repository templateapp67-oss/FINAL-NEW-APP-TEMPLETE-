import type { SalonData } from '../../types';
import { ownerHeroMediaUrls } from '../../lib/siteHero';
import { heroImageSizes, heroImageSrc } from '../../lib/siteHeroMedia';
import type { ViewportMode } from '../../lib/siteStructure';
import SiteImage from '../SiteImage';
import { ImagePlus } from 'lucide-react';

interface Props {
  data: SalonData;
  mode: ViewportMode;
  accent: string;
  background: string;
  className?: string;
  aspectRatio?: string;
}

/**
 * Owner previews must never silently fill an unfinished business with theme
 * stock photography. This preserves a visual media slot using only the
 * authenticated owner's hero/gallery uploads, or an explicit setup prompt.
 */
export default function OwnerPreviewHeroMedia({
  data,
  mode,
  accent,
  background,
  className = '',
  aspectRatio = '4/3',
}: Props) {
  const urls = ownerHeroMediaUrls(data);
  const primary = urls[0];

  return (
    <div
      data-testid="hero-media"
      data-owner-preview-media={primary ? 'owner' : 'missing'}
      className={`relative overflow-hidden border ${className}`}
      style={{ aspectRatio, backgroundColor: background, borderColor: accent }}
    >
      {primary ? (
        <>
          <SiteImage
            data-testid="owner-hero-media"
            src={heroImageSrc(primary, mode)}
            alt={`${(data.salonName || 'Business').trim()} media`}
            className="absolute inset-0 w-full h-full"
            style={{ position: 'absolute', inset: 0 }}
            sizes={heroImageSizes(mode)}
            context="hero"
            priority
            aspectRatio={aspectRatio}
          />
          <span
            className="absolute left-3 bottom-3 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em]"
            style={{ backgroundColor: background, color: accent }}
          >
            Your business media
          </span>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ color: accent, backgroundColor: `${accent}18` }}
          >
            <ImagePlus className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-bold" style={{ color: accent }}>Business media not added</p>
            <p className="mt-1 max-w-[16rem] text-[10px] leading-relaxed" style={{ color: accent, opacity: 0.72 }}>
              Add a hero or gallery image to preview it in this template.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
