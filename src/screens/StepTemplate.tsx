import React, { useEffect, useRef, useState } from 'react';
import { SalonData } from '../types';
import TemplateRenderer from '../components/TemplateRenderer';
import ThemeSelector from '../components/ThemeSelector';
import TemplateConfigPanel from '../components/TemplateConfigPanel';
import { normalizeThemeId, type ThemeId } from '../lib/themeServices';
import { switchSalonTemplatePresentation } from '../lib/templateConfig';
import { STEP_TEMPLATE, TOTAL_OWNER_STEPS } from '../lib/ownerFlow';
import { CheckCircle2, ArrowRight, ArrowLeft, Eye, Layout, Monitor, Smartphone } from 'lucide-react';
import { motion } from 'motion/react';


interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext: () => void;
  onPrev: () => void;
  onSave?: (msg?: string) => void;
  onThemeChange?: (id: ThemeId) => Promise<void> | void;
}

export default function StepTemplate({ data, setData, onNext, onPrev, onSave, onThemeChange }: Props) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [pendingSwitches, setPendingSwitches] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const isSwitching = pendingSwitches > 0;
  const [previewId, setPreviewId] = useState<ThemeId | null>(null);
  const latestApplyRequest = useRef(0);
  const currentTemplate = normalizeThemeId(data.templateId);
  const previewData = previewId && previewId !== currentTemplate
    ? switchSalonTemplatePresentation(data, previewId)
    : data;

  useEffect(() => {
    if (pendingSwitches === 0) setSaveStatus('saved');
  }, [pendingSwitches]);

  const selectTemplate = async (id: ThemeId): Promise<void> => {
    if (pendingSwitches === 0 && id === currentTemplate) return;
    setPendingSwitches((count) => count + 1);
    setSaveStatus('saving');
    try {
      if (onThemeChange) {
        await onThemeChange(id);
      } else {
        setData((prev) => switchSalonTemplatePresentation(prev, id));
        onSave?.(`Template switched to ${id}`);
      }
    } finally {
      setPendingSwitches((count) => Math.max(0, count - 1));
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-[#f9f9f9]">
      {/* Mobile view tab switcher */}
      <div className="md:hidden flex border-b border-gray-200 bg-white sticky top-0 z-20">
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-colors ${
            activeTab === 'edit'
              ? 'border-[#ac0053] text-[#ac0053] bg-[#ffd9e1]/20'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          Choose Template
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex-1 py-3 text-xs font-bold text-center border-b-2 flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'preview'
              ? 'border-[#ac0053] text-[#ac0053] bg-[#ffd9e1]/20'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Eye className="w-3.5 h-3.5" /> Live Preview
        </button>
      </div>

      {/* LEFT COLUMN: Template Selection Sidebar (30%) */}
      <div className={`w-full lg:w-[32%] h-full overflow-y-auto px-4 lg:px-6 py-8 flex flex-col space-y-6 ${
        activeTab === 'preview' ? 'hidden lg:flex' : 'flex'
      }`}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#ac0053]">
              <Layout className="w-4 h-4" /> STEP {STEP_TEMPLATE + 1} • WEBSITE TEMPLATE
            </div>
            <span className="text-[11px] font-medium text-gray-500">
              {saveStatus === 'saving' ? 'Saving…' : 'Saved ✓'}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#1a1c1c]">Choose your website style</h1>
          <p className="text-sm text-[#5f5e5e]">
            Select a layout that best represents your salon's brand identity. Changes reflect instantly in the live preview.
          </p>
        </div>

        {/* ThemeSelector Component */}
        <div className="pb-24 space-y-5">
          <ThemeSelector
            data={data}
            setData={setData}
            onSave={onSave}
            onThemeChange={async (id) => {
              const requestId = ++latestApplyRequest.current;
              setPreviewId(id);
              try {
                await selectTemplate(id);
                if (latestApplyRequest.current === requestId) setPreviewId(null);
              } catch (error) {
                if (latestApplyRequest.current === requestId) setPreviewId(null);
                throw error;
              }
            }}
            onPreview={(id) => setPreviewId(id)}
            previewId={previewId}
            layout="grid"
          />
          <TemplateConfigPanel data={data} setData={setData} onSave={onSave} />
        </div>
      </div>

      {/* RIGHT COLUMN: Live Website Preview (70%) */}
      <div className={`w-full lg:w-[70%] h-full bg-gray-100 border-l border-gray-200 overflow-hidden relative flex flex-col ${
        activeTab === 'edit' ? 'hidden lg:flex' : 'flex'
      }`}>
        {/* Preview Top Header with Device Toggle */}
        <div className="h-14 border-b border-gray-200 bg-white/90 backdrop-blur-md flex items-center justify-between px-6 z-10 shrink-0">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Live Website Preview</span>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setMode('desktop')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-2 text-xs font-medium transition-colors ${
                mode === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" /> Desktop
            </button>
            <button
              onClick={() => setMode('mobile')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-2 text-xs font-medium transition-colors ${
                mode === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> Mobile
            </button>
          </div>
        </div>

        {/* Preview Canvas */}
        <div className="flex-1 overflow-hidden p-4 md:p-6 bg-[radial-gradient(#e5e2e1_1px,transparent_1px)] [background-size:16px_16px] relative flex justify-center items-start">
          {isSwitching && (
            <div className="absolute right-6 top-6 z-40 flex items-center gap-2 rounded-full border border-[#ffd9e1] bg-white/95 px-3 py-2 shadow-md pointer-events-none">
              <div className="w-4 h-4 rounded-full border-2 border-[#ac0053] border-t-transparent animate-spin"></div>
              <p className="text-[10px] font-bold text-[#1a1c1c] tracking-wider uppercase">Saving template…</p>
            </div>
          )}
          <motion.div
            key={normalizeThemeId(previewData.templateId) + mode}
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full h-full flex justify-center"
          >
            <TemplateRenderer data={previewData} mode={mode} renderMode="owner-preview" />
          </motion.div>
        </div>
      </div>

      {/* Sticky Bottom Navigation Footer */}
      <footer className="fixed bottom-0 left-0 w-full flex justify-between items-center px-6 py-4 bg-white z-50 border-t border-gray-200 shadow-md">
        <button
          onClick={onPrev}
          className="border border-gray-300 text-gray-700 rounded-xl px-6 py-2.5 font-semibold text-xs hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="hidden sm:block text-xs font-medium text-gray-400">
          Step {STEP_TEMPLATE + 1} of {TOTAL_OWNER_STEPS} • Website Template
        </div>

        <button
          onClick={onNext}
          className="bg-[#ac0053] text-white rounded-xl px-6 py-2.5 font-semibold text-xs hover:bg-[#ba005b] transition-colors flex items-center gap-2 shadow-xs"
        >
          <span>Continue to Customize</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );
}

