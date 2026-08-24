import React, { useRef, useState } from 'react';
import { SalonData } from '../types';
import { DEFAULT_THEME_ID, ThemeId } from '../lib/themeServices';
import { listOwnerTemplates, normalizeThemeId, switchSalonTemplatePresentation, THEME_LABELS } from '../lib/templateConfig';


interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onSave?: (msg?: string) => void;
  onThemeChange?: (id: ThemeId) => Promise<void> | void;
  onPreview?: (id: ThemeId) => void;
  previewId?: ThemeId | null;
  layout?: 'grid' | 'list';
}

export default function ThemeSelector({
  data,
  setData,
  onSave,
  onThemeChange,
  onPreview,
  previewId,
  layout = 'grid',
}: Props) {
  const currentTemplate = normalizeThemeId(data.templateId);
  const [switchingCounts, setSwitchingCounts] = useState<Partial<Record<ThemeId, number>>>({});
  const [switchError, setSwitchError] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const pendingSwitchCount = Object.values(switchingCounts as Record<string, number | undefined>)
    .reduce<number>((total, count) => total + (count ?? 0), 0);
  const themes = listOwnerTemplates();

  const applyTemplate = async (id: ThemeId) => {
    if (id === currentTemplate && pendingSwitchCount === 0) return;
    const requestId = ++latestRequest.current;
    setSwitchingCounts((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
    setSwitchError(null);
    try {
      if (onThemeChange) {
        await onThemeChange(id);
      } else {
        setData((prev) => switchSalonTemplatePresentation(prev, id));
        onSave?.(`Template applied: ${THEME_LABELS[id]}`);
      }
    } catch (error) {
      if (latestRequest.current === requestId) {
        setSwitchError(error instanceof Error ? error.message : 'Could not apply this template. Please try again.');
      }
    } finally {
      setSwitchingCounts((current) => {
        const nextCount = Math.max(0, (current[id] ?? 1) - 1);
        return { ...current, [id]: nextCount };
      });
    }
  };

  const previewTemplate = (id: ThemeId) => {
    onPreview?.(id);
  };

  const card = (theme: (typeof themes)[number]) => {
    const isActive = currentTemplate === theme.id;
    const isPreview = previewId === theme.id && !isActive;
    const isSwitching = (switchingCounts[theme.id] ?? 0) > 0;
    return (
      <article
        key={theme.id}
        data-testid={`template-card-${theme.id}`}
        data-active={isActive ? 'true' : 'false'}
        className={`relative rounded-2xl border p-4 bg-white flex flex-col justify-between transition-all ${
          isActive ? 'shadow-md' : isPreview ? 'border-[#ac0053]/40' : 'border-gray-200'
        }`}
        style={isActive ? {
          borderColor: theme.accent,
          boxShadow: `0 0 0 2px ${theme.accent}33`,
          backgroundColor: `${theme.accent}08`,
        } : undefined}
      >
        <div>
          <div className="w-full h-32 rounded-xl overflow-hidden relative border border-gray-100 mb-3">
            <img src={theme.image} alt={theme.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent flex items-end justify-between p-2.5">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-white/90 text-gray-800">
                {theme.category}
              </span>
              {isActive ? (
                <span data-testid={`template-active-${theme.id}`} className="text-[10px] font-bold text-white bg-emerald-600/90 px-2 py-0.5 rounded">
                  Current / Active
                </span>
              ) : isPreview ? (
                <span className="text-[10px] font-bold text-white bg-[#ac0053]/90 px-2 py-0.5 rounded">
                  Previewing
                </span>
              ) : null}
            </div>
          </div>
          <h4 className="font-extrabold text-sm text-gray-900" style={isActive ? { color: theme.accent } : undefined}>
            {theme.name}
          </h4>
          <p className="text-xs text-gray-500 line-clamp-2 mt-1 mb-3">{theme.tagline}</p>
        </div>
        <div className="pt-3 border-t border-gray-100 flex items-center gap-2">
          <button
            type="button"
            data-testid={`template-preview-${theme.id}`}
            onClick={() => previewTemplate(theme.id)}
            className="flex-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {isPreview ? 'Previewing' : 'Preview'}
          </button>
          <button
            type="button"
            data-testid={`template-apply-${theme.id}`}
            onClick={() => void applyTemplate(theme.id)}
            disabled={isActive && pendingSwitchCount === 0}
            className="flex-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-80"
            style={{ backgroundColor: isActive ? theme.accent : '#ac0053' }}
          >
            {isSwitching ? 'Applying…' : isActive && pendingSwitchCount === 0 ? 'Applied' : 'Apply'}
          </button>
        </div>
      </article>
    );
  };

  return (
    <div data-testid="owner-template-gallery" data-active-template={currentTemplate}>
      <p className="text-xs font-semibold text-gray-600 mb-3" data-testid="owner-active-template-label">
        Active template: {THEME_LABELS[currentTemplate]}
      </p>
      <div className={layout === 'list' ? 'space-y-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
        {themes.map(card)}
      </div>
      {switchError && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {switchError}
        </p>
      )}
      {currentTemplate !== DEFAULT_THEME_ID && (
        <button
          type="button"
          onClick={() => void applyTemplate(DEFAULT_THEME_ID)}
          className="w-full py-3 mt-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
        >
          {(switchingCounts[DEFAULT_THEME_ID] ?? 0) > 0 ? 'Applying…' : `Reset to ${THEME_LABELS[DEFAULT_THEME_ID]}`}
        </button>
      )}
    </div>
  );
}
