import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SalonData } from '../types';
import { ThemeId } from '../lib/themeServices';
import {
  THEME_LABELS,
  normalizeThemeId,
  switchSalonTemplatePresentation,
} from '../lib/templateConfig';
import ThemeSelector from './ThemeSelector';
import TemplateRenderer from './TemplateRenderer';
import {
  loadSavedServicesForTheme,
  savedServiceToSalonService,
} from '../lib/savedServiceService';
import {
  loadThemeCommerce,
  mergeCommerceIntoServices,
} from '../lib/pricingPromotionService';
import { isDatabaseCatalogTheme } from '../lib/themeCatalogService';
import {
  CheckCircle2,
  Eye,
  Layout,
  Monitor,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onSave?: (msg?: string) => void;
  onThemeChange?: (id: ThemeId) => Promise<void> | void;
}

interface CanonicalPreviewCommerce {
  templateId: ThemeId;
  services: SalonData['services'];
  packages: SalonData['packages'];
  offers: NonNullable<SalonData['offers']>;
}

export default function TemplateSelectionDashboard({ data, setData, onSave, onThemeChange }: Props) {
  const currentTemplate = normalizeThemeId(data.templateId);
  const [previewId, setPreviewId] = useState<ThemeId | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [canonicalPreview, setCanonicalPreview] = useState<CanonicalPreviewCommerce | null>(null);
  const [previewDataError, setPreviewDataError] = useState('');
  const latestApplyRequest = useRef(0);
  const previewTemplate = previewId ?? currentTemplate;

  // Services, package prices and promotions are stored per template. Hydrate
  // the exact target catalog for every owner preview instead of reusing the
  // previous template's in-memory rows. Until both reads finish, render an
  // empty factual commerce boundary so stale or sample content cannot flash.
  useEffect(() => {
    let active = true;
    setPreviewDataError('');
    setCanonicalPreview(null);

    if (!isDatabaseCatalogTheme(previewTemplate)) return () => { active = false; };

    Promise.all([
      loadSavedServicesForTheme(previewTemplate),
      loadThemeCommerce(previewTemplate),
    ])
      .then(([services, commerce]) => {
        if (!active) return;
        setCanonicalPreview({
          templateId: previewTemplate,
          services: mergeCommerceIntoServices(
            services.map(savedServiceToSalonService),
            commerce,
          ),
          packages: commerce.bundles,
          offers: commerce.offers,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPreviewDataError(
          error instanceof Error ? error.message : 'Unable to load this template’s services and pricing.',
        );
      });

    return () => { active = false; };
  }, [previewTemplate]);

  const previewData = useMemo(() => {
    const presented = previewTemplate === currentTemplate
      ? data
      : switchSalonTemplatePresentation(data, previewTemplate);
    const commerce = canonicalPreview?.templateId === previewTemplate
      ? canonicalPreview
      : { services: [], packages: [], offers: [] };
    return {
      ...presented,
      services: commerce.services,
      packages: commerce.packages,
      offers: commerce.offers,
    };
  }, [canonicalPreview, currentTemplate, data, previewTemplate]);

  /**
   * Preview changes synchronously, while the confirmed active marker remains
   * tied to persisted data until the parent's Supabase operation succeeds.
   */
  const applyTemplate = async (id: ThemeId): Promise<void> => {
    const requestId = ++latestApplyRequest.current;
    setPreviewId(id);
    try {
      if (onThemeChange) {
        await onThemeChange(id);
      } else {
        setData((current) => switchSalonTemplatePresentation(current, id));
        onSave?.(`Template applied: ${THEME_LABELS[id]}`);
      }
      if (latestApplyRequest.current === requestId) setPreviewId(null);
    } catch (error) {
      if (latestApplyRequest.current === requestId) setPreviewId(null);
      throw error;
    }
  };

  return (
    <section
      className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-xs space-y-6"
      aria-labelledby="change-template-heading"
      data-testid="change-template-dashboard"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#ac0053] mb-1">
            <Layout className="w-4 h-4" /> Templates / Change Template
          </div>
          <h3 id="change-template-heading" className="text-xl font-extrabold text-gray-900 tracking-tight">
            Choose your website template
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Preview all five templates, then apply one. Your business data stays unchanged and each template keeps its own compatible look settings.
          </p>
        </div>
        <div
          data-testid="dashboard-active-template"
          className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3.5 py-1.5 rounded-xl border border-emerald-200 text-xs font-bold"
        >
          <CheckCircle2 className="w-4 h-4" />
          Active: {THEME_LABELS[currentTemplate]}
        </div>
      </div>

      <ThemeSelector
        data={data}
        setData={setData}
        onSave={onSave}
        onThemeChange={applyTemplate}
        onPreview={(id) => setPreviewId(id === currentTemplate ? null : id)}
        previewId={previewId}
        layout="grid"
      />

      <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden" data-testid="owner-template-live-preview">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 text-[#ac0053] shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                {previewId && previewId !== currentTemplate ? 'Previewing before apply' : 'Current owner preview'}
              </p>
              <p className="text-sm font-extrabold text-gray-900 truncate">{THEME_LABELS[previewTemplate]}</p>
            </div>
            {previewId && previewId !== currentTemplate && (
              <button
                type="button"
                onClick={() => setPreviewId(null)}
                className="ml-1 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-50"
              >
                <X className="w-3 h-3" /> Exit preview
              </button>
            )}
          </div>
          <div className="flex rounded-lg bg-gray-100 p-1 self-start sm:self-auto" aria-label="Preview device">
            <button
              type="button"
              onClick={() => setPreviewMode('desktop')}
              aria-pressed={previewMode === 'desktop'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-bold ${
                previewMode === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" /> Desktop
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('mobile')}
              aria-pressed={previewMode === 'mobile'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-bold ${
                previewMode === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> Mobile
            </button>
          </div>
        </div>
        {previewDataError && (
          <div
            role="alert"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800"
          >
            {previewDataError} Services and prices are hidden until real owner data is available.
          </div>
        )}
        <div className="h-[560px] overflow-hidden p-3 md:p-5 bg-[radial-gradient(#dedede_1px,transparent_1px)] [background-size:16px_16px]">
          <div className="h-full w-full flex justify-center" key={`${previewTemplate}-${previewMode}`}>
            <TemplateRenderer data={previewData} mode={previewMode} renderMode="owner-preview" />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-[#ffd9e1] bg-[#ffd9e1]/15 px-3 py-2 text-[11px] text-gray-600">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#ac0053]" />
        Preview is immediate. “Active” changes only after the template is saved successfully; incompatible controls are omitted and previous template settings stay preserved separately.
      </div>
    </section>
  );
}
