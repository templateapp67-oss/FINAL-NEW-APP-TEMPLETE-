/**
 * PageBuilder — the two-panel builder UI: EDIT on the left, LIVE PREVIEW on
 * the right, both driven by ONE central store.
 *
 * This is the documented `PageBuilder.tsx` adapted to this repository:
 *
 *   1. `'use client'` is gone — this is a Vite React SPA with no React Server
 *      Components, so the directive is meaningless here (every module is
 *      already client code).
 *   2. `useAutoSaveStore(initialData, storeId)` works unchanged (the hook
 *      accepts the positional store id OR an options object), and the hook is
 *      imported from `../hooks/useAutoSaveStore`.
 *   3. Field NAMES are canonical, not snake_case: `business_name → salonName`,
 *      `owner_name → ownerName`, `about_text → about`, `slug → websiteSlug`.
 *      The store merges at the TOP level of `salon_public_websites.config`
 *      using exactly the keys the unified draft already persists, so there is
 *      one source of truth (never a second copy of the business profile).
 *   4. The right panel renders the REAL website (`TemplateRenderer`), not a
 *      mock card — same-React-tree binding by default, with an optional
 *      isolated iframe transport (`LivePreviewFrame` / postMessage).
 *
 * The slug needs care: `salon_public_websites.slug` is a real column with a
 * format check and a case-insensitive unique index, and it decides the public
 * URL. So the field edits the DRAFT slug (`SalonData.websiteSlug`), is
 * validated live with `isValidWebsiteSlug()`, normalised on blur, and the
 * actual column is only written by the guarded publish path (which also
 * resolves collisions). A text input must never rewrite a live slug directly.
 */
import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Globe2, LayoutTemplate, Monitor, Smartphone } from 'lucide-react';
import type { SalonData } from '../types';
import { useAutoSaveStore } from '../hooks/useAutoSaveStore';
import TemplateRenderer from './TemplateRenderer';
import LivePreviewFrame from './LivePreviewFrame';
import { useBrandConfig } from '../config/brandConfig';
import {
  isValidWebsiteSlug,
  publicWebsiteHref,
  slugifySalonName,
} from '../lib/publicWebsiteUrl';

/**
 * The slice of the website draft this builder edits.
 * A type alias (not an interface) so it satisfies the store's
 * `Record<string, unknown>` constraint via an implicit index signature.
 */
export type PageBuilderStore = {
  salonName: string;
  websiteSlug: string;
  ownerName: string;
  about: string;
};

interface Props {
  /** Central edit state — the single source of truth for the preview. */
  data: SalonData;
  /** Propagates each edit so the whole workspace and the preview follow. */
  setData?: Dispatch<SetStateAction<SalonData>>;
  /** Salon (store) id. Omit to resolve it from the session. */
  storeId?: string | null;
  className?: string;
}

export default function PageBuilder({ data, setData, storeId = null, className = '' }: Props) {
  const { platform } = useBrandConfig();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [transport, setTransport] = useState<'inline' | 'isolated'>('inline');

  /**
   * CENTRAL STATE + DEBOUNCED AUTO-SAVE (600 ms).
   * No `configKey`: these four keys are merged at the top level of
   * `salon_public_websites.config`, exactly where the unified draft keeps them.
   */
  const store = useAutoSaveStore<PageBuilderStore>(
    {
      salonName: data.salonName ?? '',
      websiteSlug: data.websiteSlug ?? '',
      ownerName: data.ownerName ?? '',
      about: data.about ?? '',
    },
    { storeId },
  );

  // HYDRATION — when the draft loads (or another editor changes the same
  // fields), adopt the external values WITHOUT triggering a save.
  useEffect(() => {
    store.hydrate({
      salonName: data.salonName ?? '',
      websiteSlug: data.websiteSlug ?? '',
      ownerName: data.ownerName ?? '',
      about: data.about ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.salonName, data.websiteSlug, data.ownerName, data.about]);

  /**
   * One edit, two effects: the store saves it (debounced) and the central
   * state receives it immediately so the live preview re-renders on the
   * keystroke. The preview is bound to `previewData` by props — the same
   * React tree, no serialization, no latency.
   */
  const edit = <K extends keyof PageBuilderStore>(field: K, value: PageBuilderStore[K]) => {
    store.updateField(field, value);
    setData?.((previous) => ({ ...previous, [field]: value }) as SalonData);
  };

  const previewData: SalonData = { ...data, ...store.data };

  const slug = (store.data.websiteSlug || '').trim().toLowerCase();
  const slugIsValid = slug.length === 0 || isValidWebsiteSlug(slug);
  const publicHref =
    publicWebsiteHref(slug || slugifySalonName(store.data.salonName), platform.websiteUrl) ||
    platform.websiteUrl;

  const statusLabel =
    store.status === 'saving'
      ? 'Saving...'
      : store.status === 'saved'
        ? 'Saved ✓'
        : store.status === 'error'
          ? 'Error Saving'
          : 'All changes saved';

  return (
    <div className={`flex w-full flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs lg:flex-row ${className}`}>
      {/* LEFT PANEL — ADMIN EDIT FORM */}
      <div className="w-full lg:w-1/2 p-6 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto">
        <div className="flex justify-between items-center mb-6 gap-3">
          <h2 className="text-lg font-bold text-gray-900">Edit Business Details</h2>

          {/* Status Indicator Badge */}
          <span
            data-testid="page-builder-status"
            className={`px-3 py-1 text-xs font-semibold rounded-full shrink-0 ${
              store.status === 'saving'
                ? 'bg-amber-100 text-amber-700'
                : store.status === 'saved'
                  ? 'bg-emerald-100 text-emerald-700'
                  : store.status === 'error'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-600'
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Business Name
            </label>
            <input
              type="text"
              aria-label="Business Name"
              value={store.data.salonName}
              onChange={(event) => edit('salonName', event.target.value)}
              placeholder="Your Business Name"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/20"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Website Slug
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 shrink-0">/</span>
              <input
                type="text"
                aria-label="Website Slug"
                value={store.data.websiteSlug}
                onChange={(event) => edit('websiteSlug', event.target.value)}
                // Normalise on blur; never fight the owner while typing.
                onBlur={() => {
                  const normalised = slugifySalonName(store.data.websiteSlug);
                  if (normalised && normalised !== store.data.websiteSlug) {
                    edit('websiteSlug', normalised);
                  }
                }}
                placeholder="your-salon"
                className={`w-full px-4 py-2.5 rounded-xl border text-sm font-semibold outline-none focus:ring-1 ${
                  slugIsValid
                    ? 'border-gray-200 focus:border-[#ac0053] focus:ring-[#ac0053]/20'
                    : 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                }`}
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              {slugIsValid
                ? 'Lowercase letters, numbers and hyphens. Publishing reserves the final, collision-checked address.'
                : 'Use 3–50 lowercase letters, numbers or hyphens (e.g. my-salon).'}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Owner Name
            </label>
            <input
              type="text"
              aria-label="Owner Name"
              value={store.data.ownerName}
              onChange={(event) => edit('ownerName', event.target.value)}
              placeholder="Owner Name"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/20"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              About Business
            </label>
            <textarea
              rows={4}
              aria-label="About Business"
              value={store.data.about}
              onChange={(event) => edit('about', event.target.value)}
              placeholder="Add your business description here..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none resize-none focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/20"
            />
          </div>
        </div>
      </div>

      {/* RIGHT PANEL — LIVE PREVIEW */}
      <div className="w-full lg:w-1/2 p-6 bg-slate-100 overflow-y-auto">
        <div className="border border-slate-300 rounded-xl bg-white shadow-sm overflow-hidden min-h-[500px] flex flex-col">
          <div className="bg-slate-800 text-white p-3 text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <Globe2 className="w-3.5 h-3.5 text-slate-300" />
            <span className="truncate font-mono">
              Live Preview · {publicHref.replace(/^https?:\/\//, '')}
            </span>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDevice(device === 'desktop' ? 'mobile' : 'desktop')}
                className="p-1 rounded hover:bg-slate-700"
                title={device === 'desktop' ? 'Switch to mobile' : 'Switch to desktop'}
                aria-label="Toggle preview device"
              >
                {device === 'desktop' ? (
                  <Monitor className="w-3.5 h-3.5" />
                ) : (
                  <Smartphone className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTransport(transport === 'inline' ? 'isolated' : 'inline')}
                className={`px-2 py-1 rounded flex items-center gap-1 font-semibold ${
                  transport === 'isolated' ? 'bg-[#ac0053] text-white' : 'hover:bg-slate-700'
                }`}
                title="Render the preview in an isolated iframe (postMessage)"
                aria-label="Toggle isolated preview"
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
                Isolated
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {transport === 'isolated' ? (
              /* IFRAME TRANSPORT — the same state, streamed with postMessage. */
              <LivePreviewFrame data={previewData} mode={device} className="h-full" />
            ) : (
              /* SAME-TREE TRANSPORT — bound straight to the central edit state. */
              <div className={device === 'mobile' ? 'mx-auto max-w-[420px]' : ''}>
                <TemplateRenderer data={previewData} mode={device} renderMode="owner-preview" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
