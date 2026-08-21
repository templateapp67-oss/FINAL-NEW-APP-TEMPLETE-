import { ImagePlus, Trash2 } from 'lucide-react';
import type { ServiceMedia } from '../types';
import type { ServiceMediaKind } from '../lib/serviceContentService';

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
  const readFile = (kind: ServiceMediaKind, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onUpload(kind, reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {SLOTS.map(({ kind, label }) => {
        const url = urlFor(media, kind);
        return (
          <div key={kind} className="rounded-lg border border-[#eeeeee] p-3 bg-[#f9f9f9]">
            <p className="text-[11px] font-semibold text-[#1a1c1c] mb-2">{label}</p>
            {url ? (
              <img src={url} alt={label} className="w-full h-20 object-cover rounded-md mb-2 bg-white" />
            ) : (
              <div className="w-full h-20 rounded-md mb-2 border border-dashed border-[#dddddd] flex items-center justify-center text-[#5f5e5e]">
                <ImagePlus className="w-5 h-5" />
              </div>
            )}
            <div className="flex gap-2">
              <label className="flex-1 min-h-11 inline-flex items-center justify-center text-[11px] font-semibold rounded-lg bg-white border border-[#eeeeee] cursor-pointer">
                {url ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
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
