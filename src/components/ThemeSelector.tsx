import React, { useState } from 'react';
import { SalonData } from '../types';
import { DEFAULT_THEME_ID, ThemeId } from '../lib/themeServices';
import { listOwnerTemplates, normalizeThemeId, THEME_LABELS } from '../lib/templateConfig';


interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onSave?: (msg?: string) => void;
  onThemeChange?: (id: ThemeId) => void;
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
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const themes = listOwnerTemplates();

  const applyTemplate = (id: ThemeId) => {
    if (id === currentTemplate) return;
    setSwitchingId(id);
    if (onThemeChange) {
      onThemeChange(id);
    } else {
      setData((prev) => ({
        ...prev,
        templateId: id,
        services: prev.services || [],
        packages: prev.packages || [],
        team: prev.team || [],
        gallery: prev.gallery || [],
      }));
    }
    onSave?.(`Template applied: ${THEME_LABELS[id]}`);
    window.setTimeout(() => setSwitchingId(null), 350);
  };

  const previewTemplate = (id: ThemeId) => {
    onPreview?.(id);
  };

  const card = (theme: (typeof themes)[number]) => {
    const isActive = currentTemplate === theme.id;
    const isPreview = previewId === theme.id && !isActive;
    const isSwitching = switchingId === theme.id;
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
              {isActive && (
                <span data-testid={`template-active-${theme.id}`} className="text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded">
                  Active
                </span>
              )}
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
            Preview
          </button>
          <button
            type="button"
            data-testid={`template-apply-${theme.id}`}
            onClick={() => applyTemplate(theme.id)}
            disabled={isActive}
            className="flex-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-80"
            style={{ backgroundColor: isActive ? theme.accent : '#ac0053' }}
          >
            {isSwitching ? 'Applying…' : isActive ? 'Applied' : 'Apply'}
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
      {currentTemplate !== DEFAULT_THEME_ID && (
        <button
          type="button"
          onClick={() => applyTemplate(DEFAULT_THEME_ID)}
          className="w-full py-3 mt-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50"
        >
          Reset to {THEME_LABELS[DEFAULT_THEME_ID]}
        </button>
      )}
    </div>
  );
}
