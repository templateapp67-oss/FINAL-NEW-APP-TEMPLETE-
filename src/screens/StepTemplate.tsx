import React, { useState } from 'react';
import { SalonData } from '../types';
import TemplateRenderer from '../components/TemplateRenderer';
import ThemeSelector from '../components/ThemeSelector';
import { normalizeThemeId } from '../lib/themeServices';
import { CheckCircle2, ArrowRight, ArrowLeft, Eye, Layout, Monitor, Smartphone } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext: () => void;
  onPrev: () => void;
  onSave?: (msg?: string) => void;
  onThemeChange?: (id: ThemeChoice) => void;
}

type ThemeChoice = 'hair' | 'barber_mens_grooming' | 'hair_studio_color_bar' | 'beauty_skin_spa' | 'family_full_service' | 'nail_lash_studio';

export default function StepTemplate({ data, setData, onNext, onPrev, onSave, onThemeChange }: Props) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isSwitching, setIsSwitching] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const currentTemplate = normalizeThemeId(data.templateId);

  const selectTemplate = (id: ThemeChoice) => {
    if (id === currentTemplate) return;
    setIsSwitching(true);
    setSaveStatus('saving');
    if (onThemeChange) {
      onThemeChange(id);
    } else {
      setData(prev => {
        const nextData = { ...prev, templateId: id, services: prev.services || [], packages: prev.packages || [] };
        try {
          const raw = localStorage.getItem('nexora_onboarding_state');
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.data = nextData;
            localStorage.setItem('nexora_onboarding_state', JSON.stringify(parsed));
          } else {
            localStorage.setItem('nexora_onboarding_state', JSON.stringify({ step: 2, data: nextData }));
          }
        } catch (e) {
          console.error('Failed to persist theme change', e);
        }
        return nextData;
      });
    }
    if (onSave) onSave(`Template switched to ${id}`);
    setTimeout(() => {
      setIsSwitching(false);
      setSaveStatus('saved');
    }, 400);
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
              <Layout className="w-4 h-4" /> STEP 02 • WEBSITE TEMPLATE
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
        <div className="pb-24">
          <ThemeSelector
            data={data}
            setData={setData}
            onSave={onSave}
            onThemeChange={(id) => selectTemplate(id as any)}
            layout="grid"
          />
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
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs z-40 flex flex-col items-center justify-center space-y-3 transition-opacity">
              <div className="w-8 h-8 rounded-full border-2 border-[#ac0053] border-t-transparent animate-spin"></div>
              <p className="text-xs font-semibold text-[#1a1c1c] tracking-wider uppercase animate-pulse">Applying template layout...</p>
            </div>
          )}
          <motion.div
            key={currentTemplate + mode}
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full h-full flex justify-center"
          >
            <TemplateRenderer data={data} mode={mode} />
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
          Step 2 of 15 • Website Template
        </div>

        <button
          onClick={onNext}
          className="bg-[#ac0053] text-white rounded-xl px-6 py-2.5 font-semibold text-xs hover:bg-[#ba005b] transition-colors flex items-center gap-2 shadow-xs"
        >
          <span>Continue</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );
}

