/**
 * PreviewFrameSurface — the CHILD side of the live-preview bridge.
 *
 * Rendered at the `/preview-frame` client route, always inside the
 * `<iframe>` mounted by `LivePreviewFrame`. It owns no data of its own:
 *
 *   1. announces `{ type: 'ready' }` to the parent editor;
 *   2. validates every inbound `{ type: 'state' }` message (protocol marker +
 *      origin allow-list + payload shape) before rendering it;
 *   3. acknowledges with `{ type: 'ack', revision }` so the editor can show a
 *      truthful "Live" indicator.
 *
 * It never writes to storage, never calls the API and never mutates the draft —
 * the frame is a read-only projection of the central edit state.
 */
import { useState } from 'react';
import TemplateRenderer from './TemplateRenderer';
import type { SalonData } from '../types';
import { usePreviewClient } from '../lib/previewBridge';

export default function PreviewFrameSurface({ mode = 'desktop' }: { mode?: 'desktop' | 'mobile' }) {
  const [state, setState] = useState<SalonData | null>(null);
  const { error } = usePreviewClient({
    onState: (next) => setState(next),
  });

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-8 text-center">
        <p className="max-w-sm text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#ffd9e1] border-t-[#ac0053]" />
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Waiting for the editor
          </p>
        </div>
      </div>
    );
  }

  // Owner preview: truthful "not added" labels for missing business facts, so
  // the frame can never display the demonstration salon's data.
  return <TemplateRenderer data={state} mode={mode} renderMode="owner-preview" />;
}
