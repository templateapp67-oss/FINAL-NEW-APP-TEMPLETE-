import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import type { ServiceMedia } from '../types';
import type { ServiceMediaKind } from '../lib/serviceContentService';
import {
  createPreviewUrl,
  readImageAsDataUrl,
  revokePreviewUrl,
  validateImageUploadFile,
  describeUploadError,
  IMAGE_UPLOAD_ACCEPT_ATTR,
} from '../lib/mediaUpload';

interface Props {
  media?: ServiceMedia;
  disabled?: boolean;
  onUpload: (kind: ServiceMediaKind, dataUrl: string) => void;
  onRemove: (kind: ServiceMediaKind) => void;
}

const SLOTS: { kind: ServiceMediaKind; label: string }[] = [
  { kind: 'image', label: 'Image' },
  { kind: 'banner', label: 'Banner' },
  { kind: 'icon', label: 'Icon' },
];

function urlFor(media: ServiceMedia | undefined, kind: ServiceMediaKind): string | undefined {
  if (!media) return undefined;
  if (kind === 'image') return media.imageUrl;
  if (kind === 'banner') return media.bannerUrl;
  return media.iconUrl;
}

export default function ServiceMediaEditor({ media, disabled, onUpload, onRemove }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ServiceMediaKind | null>(null);
  // Object-URL previews awaiting revocation once the data URL takes over.
  const previewUrls = useRef<Partial<Record<ServiceMediaKind, string>>>({});

  const readFile = (kind: ServiceMediaKind, file: File | undefined) => {
    if (!file) return;

    // Shared upload contract: 5 MB max, JPG / PNG / WEBP / SVG.
    const validation = validateImageUploadFile(file);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError(null);

    // INSTANT PREVIEW — the slot fills before the file has finished reading.
    const preview = createPreviewUrl(file);
    if (preview) {
      const stale = previewUrls.current[kind];
      if (stale) revokePreviewUrl(stale);
      previewUrls.current[kind] = preview;
      onUpload(kind, preview);
    }

    setPending(kind);
    void (async () => {
      try {
        const dataUrl = await readImageAsDataUrl(file);
        const stale = previewUrls.current[kind];
        if (stale) {
          revokePreviewUrl(stale);
          delete previewUrls.current[kind];
        }
        onUpload(kind, dataUrl);
      } catch (err) {
        setError(describeUploadError(err, 'Could not read that image. Try another image.'));
      } finally {
        setPending(null);
      }
    })();
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {error && (
        <p
          role="alert"
          data-testid="service-media-error"
          className="col-span-full text-[11px] text-[#c0003a]"
        >
          {error}
        </p>
      )}
      {SLOTS.map(({ kind, label }) => {
        const url = urlFor(media, kind);
        const isPending = pending === kind;
        return (
          <div key={kind} className="rounded-lg border border-[#eeeeee] p-3 bg-[#f9f9f9]">
            <p className="text-[11px] font-semibold text-[#1a1c1c] mb-2">{label}</p>
            <div className="relative mb-2">
              {url ? (
                <img src={url} alt={label} className="w-full h-20 object-cover rounded-md bg-white" />
              ) : (
                <div className="w-full h-20 rounded-md border border-dashed border-[#dddddd] flex items-center justify-center text-[#5f5e5e]">
                  <ImagePlus className="w-5 h-5" />
                </div>
              )}
              {isPending && (
                <div
                  data-testid="service-media-uploading"
                  className="absolute inset-0 rounded-md bg-white/65 flex items-center justify-center"
                >
                  <Loader2 className="w-4 h-4 animate-spin text-[#ac0053]" />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <label className="flex-1 min-h-11 inline-flex items-center justify-center text-[11px] font-semibold rounded-lg bg-white border border-[#eeeeee] cursor-pointer">
                {url ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept={IMAGE_UPLOAD_ACCEPT_ATTR}
                  className="sr-only"
                  disabled={disabled}
                  onChange={(event) => readFile(kind, event.target.files?.[0])}
                />
              </label>
              {url && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(kind)}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-[#eeeeee] text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
