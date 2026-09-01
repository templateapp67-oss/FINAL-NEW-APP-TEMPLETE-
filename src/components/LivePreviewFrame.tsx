/**
 * LivePreviewFrame — the IFRAME branch of the live-preview contract.
 *
 * Live preview has exactly two supported transports:
 *
 *   • SAME REACT TREE → the preview component is bound DIRECTLY to the central
 *     edit state (`<PreviewPane data={data} step={...} />`). Every keystroke
 *     re-renders through props. This is the default in the builder.
 *
 *   • IFRAME → a separate document cannot read React state, so this component
 *     streams the same `SalonData` into the frame with `postMessage`
 *     (`src/lib/previewBridge.ts`). The frame renders the identical
 *     `TemplateRenderer`, so both transports look the same to the owner.
 *
 * The iframe branch exists for ISOLATION: the previewed website gets its own
 * document — its own CSS cascade, its own scroll position, its own media
 * queries — while still updating instantly (a ~60 ms coalescing window) as the
 * owner edits. Nothing here persists: the frame is a read-only projection.
 */
import { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { SalonData } from '../types';
import { PREVIEW_FRAME_ROUTE, usePreviewHost } from '../lib/previewBridge';

interface Props {
  /** Central edit state — the single source of truth for both transports. */
  data: SalonData;
  /** Device width simulated by the frame. */
  mode?: 'desktop' | 'mobile';
  className?: string;
}

export default function LivePreviewFrame({ data, mode = 'desktop', className = '' }: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  /** Bumping the key remounts the frame (manual reload). */
  const [frameKey, setFrameKey] = useState(0);
  const preview = usePreviewHost({ state: data, targetRef: frameRef });

  const isMobile = mode === 'mobile';

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Isolated preview · postMessage
        </span>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
              preview.connected ? 'text-emerald-600' : 'text-amber-600'
            }`}
            aria-live="polite"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                preview.connected ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            {preview.connected ? `Live · rev ${preview.revision}` : 'Connecting…'}
          </span>
          <button
            type="button"
            onClick={() => setFrameKey((key) => key + 1)}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 transition-colors hover:border-[#ac0053] hover:text-[#ac0053]"
          >
            <RefreshCw className="h-3 w-3" />
            Reload frame
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-[#f0f0f1] p-4">
        <iframe
          key={frameKey}
          ref={frameRef}
          src={PREVIEW_FRAME_ROUTE}
          title="Live website preview"
          // Same-origin route rendered by this app: no third-party document is
          // ever loaded here, and the bridge validates origins both ways.
          className={`h-full min-h-[520px] border-0 bg-white ${
            isMobile ? 'w-full max-w-[390px] rounded-[28px] shadow-xl' : 'w-full rounded-xl shadow-sm'
          }`}
        />
      </div>
    </div>
  );
}
