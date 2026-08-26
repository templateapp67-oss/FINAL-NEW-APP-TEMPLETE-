import React, { useState } from 'react';
import { SalonData } from '../types';
import { ThemeId, THEME_LABELS } from '../lib/themeServices';
import { OWNER_TEMPLATES, switchSalonTemplatePresentation } from '../lib/templateConfig';
import TemplateRenderer from './TemplateRenderer';
import { THEME_DETAILS } from './TemplateQuickViewModal';
import {
  X,
  Filter,
  CheckCircle2,
  Eye,
  Monitor,
  Smartphone,
  Sparkles,
  ArrowRight,
  Palette,
  Check,
  Type,
  Layout,
  Maximize2,
} from 'lucide-react';

export type TemplateStyleFilter = 'All' | 'Modern' | 'Classic' | 'Minimalist';

export interface StyleMapping {
  id: ThemeId;
  styles: ('Modern' | 'Classic' | 'Minimalist')[];
}

export const TEMPLATE_STYLE_MAPPINGS: Record<ThemeId, ('Modern' | 'Classic' | 'Minimalist')[]> = {
  barber_mens_grooming: ['Modern'],
  hair_studio_color_bar: ['Classic', 'Modern'],
  beauty_skin_spa: ['Minimalist'],
  family_full_service: ['Classic'],
  nail_lash_studio: ['Modern', 'Minimalist'],
};

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onClose: () => void;
  onApply?: (id: ThemeId) => Promise<void> | void;
  onSave?: (msg?: string) => void;
  currentTemplateId: ThemeId;
}

export default function TemplateShowcaseModal({
  data,
  setData,
  onClose,
  onApply,
  onSave,
  currentTemplateId,
}: Props) {
  const [selectedStyle, setSelectedStyle] = useState<TemplateStyleFilter>('All');
  const [previewThemeId, setPreviewThemeId] = useState<ThemeId>(currentTemplateId);
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const filterOptions: TemplateStyleFilter[] = ['All', 'Modern', 'Classic', 'Minimalist'];

  const filteredTemplates = OWNER_TEMPLATES.filter((template) => {
    if (selectedStyle === 'All') return true;
    const styles = TEMPLATE_STYLE_MAPPINGS[template.id] || [];
    return styles.includes(selectedStyle);
  });

  const activeThemeMeta = OWNER_TEMPLATES.find((t) => t.id === previewThemeId) || OWNER_TEMPLATES[0];
  const activeDetails = THEME_DETAILS[previewThemeId] || THEME_DETAILS.barber_mens_grooming;
  const presentedData = switchSalonTemplatePresentation(data, previewThemeId);

  const handleApply = async (id: ThemeId) => {
    setIsApplying(true);
    setApplyError(null);
    try {
      if (onApply) {
        await onApply(id);
      } else {
        setData((prev) => switchSalonTemplatePresentation(prev, id));
        onSave?.(`Template applied: ${THEME_LABELS[id]}`);
      }
      onClose();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply template. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const isCurrentActive = currentTemplateId === previewThemeId;

  return (
    <div
      aria-modal="true"
      role="dialog"
      data-testid="template-showcase-modal"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-3 sm:p-5 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ac0053] to-[#80003e] text-white shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">Template Showcase</h3>
                <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#ac0053]">
                  Interactive Studio
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Filter templates by style, explore color palettes & layout specs, and inspect full live previews.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Showcase"
            data-testid="close-showcase-modal"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Style Filter Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-gray-50/80 px-6 py-3 overflow-x-auto">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 mr-2">
              <Filter className="h-3.5 w-3.5 text-[#ac0053]" /> Filter by Style:
            </span>
            <div className="flex items-center gap-2">
              {filterOptions.map((style) => {
                const count = style === 'All'
                  ? OWNER_TEMPLATES.length
                  : OWNER_TEMPLATES.filter((t) => (TEMPLATE_STYLE_MAPPINGS[t.id] || []).includes(style as any)).length;
                const isActive = selectedStyle === style;
                return (
                  <button
                    key={style}
                    type="button"
                    data-testid={`showcase-filter-${style.toLowerCase()}`}
                    onClick={() => setSelectedStyle(style)}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-[#ac0053] text-white shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span>{style}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-gray-500 font-medium">
            <span>Showing {filteredTemplates.length} templates</span>
          </div>
        </div>

        {/* Modal Main Content: Split Grid & Larger Preview */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel: Template Cards Grid (40% width on lg) */}
          <div className="w-full lg:w-[42%] overflow-y-auto border-r border-gray-100 p-4 sm:p-5 space-y-4 custom-scrollbar bg-gray-50/40">
            {filteredTemplates.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-sm font-semibold">No templates match the selected style.</p>
              </div>
            ) : (
              filteredTemplates.map((template) => {
                const isSelected = previewThemeId === template.id;
                const isCurrent = currentTemplateId === template.id;
                const styles = TEMPLATE_STYLE_MAPPINGS[template.id] || [];

                return (
                  <div
                    key={template.id}
                    data-testid={`showcase-template-card-${template.id}`}
                    onClick={() => setPreviewThemeId(template.id)}
                    className={`group cursor-pointer rounded-2xl border p-4 transition-all bg-white relative ${
                      isSelected
                        ? 'border-[#ac0053] ring-2 ring-[#ac0053]/20 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex gap-4">
                      {/* Image Preview Thumbnail */}
                      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-gray-100">
                        <img
                          src={template.image}
                          alt={template.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <span
                          className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full border border-white shadow-xs"
                          style={{ backgroundColor: template.accent }}
                        />
                      </div>

                      {/* Info & Badges */}
                      <div className="flex flex-1 flex-col justify-between min-w-0">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-gray-700">
                              {template.category}
                            </span>
                            {isCurrent && (
                              <span
                                data-testid={`showcase-active-${template.id}`}
                                className="flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"
                              >
                                <Check className="h-3 w-3" /> Active
                              </span>
                            )}
                          </div>

                          <h4 className="mt-1 text-base font-extrabold text-gray-900 group-hover:text-[#ac0053] transition-colors truncate">
                            {template.name}
                          </h4>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{template.tagline}</p>
                        </div>

                        {/* Styles tags & CTAs */}
                        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
                          <div className="flex gap-1 flex-wrap">
                            {styles.map((style) => (
                              <span
                                key={style}
                                className="rounded-full bg-pink-50 border border-pink-100 px-2 py-0.2 text-[10px] font-semibold text-[#ac0053]"
                              >
                                {style}
                              </span>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewThemeId(template.id);
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                              isSelected
                                ? 'bg-[#ac0053] text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <Maximize2 className="h-3 w-3" />
                            <span>{isSelected ? 'Viewing' : 'Inspect'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Panel: Larger Interactive Preview & Specs (58% width on lg) */}
          <div className="hidden lg:flex lg:w-[58%] flex-col overflow-y-auto bg-white p-6 space-y-6 custom-scrollbar" data-testid="showcase-large-preview">
            {/* Header of Active Preview */}
            <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-black text-gray-900">{activeThemeMeta.name}</h4>
                  <span className="rounded-full bg-[#ac0053]/10 text-[#ac0053] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                    {activeThemeMeta.category}
                  </span>
                  {isCurrentActive && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" /> Active Template
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{activeDetails.appearanceMode}</p>
              </div>

              {/* Device Mode Switcher */}
              <div className="flex rounded-xl bg-white p-1 border border-gray-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setDeviceMode('desktop')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    deviceMode === 'desktop'
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" /> Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceMode('mobile')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    deviceMode === 'mobile'
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" /> Mobile
                </button>
              </div>
            </div>

            {/* Larger Interactive Live Renderer View */}
            <div className="relative rounded-2xl border border-gray-200 bg-gray-100 overflow-hidden shadow-inner flex justify-center items-start min-h-[460px] max-h-[520px] p-4 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]">
              <TemplateRenderer
                data={presentedData}
                mode={deviceMode}
                renderMode="owner-preview"
              />
            </div>

            {/* Typography & Palette Specs Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Palette */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="h-4 w-4 text-[#ac0053]" />
                  <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-800">
                    Color Palette
                  </h5>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {activeDetails.colorPalette.map((col) => (
                    <div key={col.hex} className="flex items-center gap-2 bg-white rounded-xl p-2 border border-gray-100">
                      <span className="h-5 w-5 rounded-md border border-gray-200 shadow-xs shrink-0" style={{ backgroundColor: col.hex }} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-gray-900 truncate">{col.name}</p>
                        <p className="text-[9px] text-gray-400 font-mono">{col.hex}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Typography */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Type className="h-4 w-4 text-[#ac0053]" />
                    <h5 className="text-xs font-extrabold uppercase tracking-wider text-gray-800">
                      Typography
                    </h5>
                  </div>
                  <p className="text-xs font-bold text-gray-900">{activeDetails.typography}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{activeDetails.description}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {(TEMPLATE_STYLE_MAPPINGS[previewThemeId] || []).map((st) => (
                    <span key={st} className="rounded-md bg-white border border-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                      Style: {st}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-gray-50/90 px-6 py-4">
          <div className="text-xs text-gray-500 font-medium">
            {isCurrentActive ? (
              <span className="font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> This template is currently active for your salon
              </span>
            ) : (
              <span>Inspecting <strong>{activeThemeMeta.name}</strong> preview</span>
            )}
          </div>

          {applyError && (
            <span role="alert" className="text-xs text-red-600 font-semibold px-2">
              {applyError}
            </span>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Close
            </button>

            {!isCurrentActive && (
              <button
                type="button"
                data-testid="showcase-apply-btn"
                disabled={isApplying}
                onClick={() => void handleApply(previewThemeId)}
                className="flex items-center gap-2 rounded-xl bg-[#ac0053] px-6 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#ba005b] shadow-xs disabled:opacity-70"
              >
                <span>{isApplying ? 'Applying…' : `Apply ${activeThemeMeta.name}`}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
