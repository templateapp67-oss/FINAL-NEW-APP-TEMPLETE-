import React, { useState } from 'react';
import { SalonData } from '../types';
import TemplateRenderer from '../components/TemplateRenderer';
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
      // Keep direct/test renders safe too: a theme without a snapshot starts
      // with a clean service workspace instead of inheriting another theme.
      setData(prev => ({ ...prev, templateId: id, services: [], packages: [] }));
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
      <div className={`w-full lg:w-[30%] h-full overflow-y-auto px-4 lg:px-8 py-8 flex flex-col space-y-6 ${
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

        {/* Template Cards List */}
        <div className="space-y-4 pb-20">
          {/* Theme 1 — Existing Theme (Preserved) */}
          <div
            onClick={() => selectTemplate('hair')}
            className={`relative border rounded-2xl p-4 md:p-5 cursor-pointer transition-all duration-200 bg-white hover:shadow-md ${
              currentTemplate === 'hair'
                ? 'border-[#ac0053] bg-[#ffeff1]/30 ring-2 ring-[#ac0053]/20 shadow-xs'
                : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-24 h-32 rounded-xl overflow-hidden shrink-0 border border-gray-200 relative shadow-2xs">
                <img
                  src="https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?q=80&w=600&auto=format&fit=crop"
                  alt="Existing Hair & Unisex Template"
                  className="w-full h-full object-cover absolute inset-0"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                  <span className="text-white text-[10px] font-medium tracking-wide uppercase">Preview</span>
                </div>
              </div>
              <div className="flex-1 pt-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg text-gray-900 mb-1">Hair & Unisex Salon</h3>
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${currentTemplate === 'hair' ? 'text-[#ac0053]' : 'text-gray-300'}`} />
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#ffd9e1]/50 text-[#ac0053] font-bold mb-2 text-[11px]">
                  ✦ Current / Existing Theme
                </span>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Your original salon theme — preserved exactly as it is. Premium hair, beauty and spa care for a refined unisex audience.
                </p>
              </div>
            </div>
          </div>

          {/* Theme 2 — Barber & Men's Grooming */}
          <div
            onClick={() => selectTemplate('barber_mens_grooming')}
            className={`relative border rounded-2xl p-4 md:p-5 cursor-pointer transition-all duration-200 bg-white hover:shadow-md ${
              currentTemplate === 'barber_mens_grooming'
                ? 'border-[#c9a227] bg-[#3a3016]/20 ring-2 ring-[#c9a227]/30 shadow-xs'
                : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-24 h-32 rounded-xl overflow-hidden shrink-0 border border-gray-200 relative shadow-2xs">
                <img
                  src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600&auto=format&fit=crop"
                  alt="Barber & Men's Grooming Template"
                  className="w-full h-full object-cover absolute inset-0"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                  <span className="text-white text-[10px] font-medium tracking-wide uppercase">Preview</span>
                </div>
              </div>
              <div className="flex-1 pt-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg text-gray-900 mb-1">Barber & Men's Grooming</h3>
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${currentTemplate === 'barber_mens_grooming' ? 'text-[#c9a227]' : 'text-gray-300'}`} />
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#141414] text-[#e8c95c] font-bold mb-2 text-[11px]">
                  Dark Charcoal • Gold Accents
                </span>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Classic vintage barbershop with a sharp, masculine layout — fades, hot towel shaves and premium grooming.
                </p>
              </div>
            </div>
          </div>

          {/* Theme 3 — Hair Studio & Color Bar */}
          <div
            onClick={() => selectTemplate('hair_studio_color_bar')}
            className={`relative border rounded-2xl p-4 md:p-5 cursor-pointer transition-all duration-200 bg-white hover:shadow-md ${
              currentTemplate === 'hair_studio_color_bar'
                ? 'border-[#b76e79] bg-[#f4e5e7]/50 ring-2 ring-[#b76e79]/25 shadow-xs'
                : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-24 h-32 rounded-xl overflow-hidden shrink-0 border border-gray-200 relative shadow-2xs">
                <img
                  src="https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop"
                  alt="Hair Studio & Color Bar Template"
                  className="w-full h-full object-cover absolute inset-0"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                  <span className="text-white text-[10px] font-medium tracking-wide uppercase">Preview</span>
                </div>
              </div>
              <div className="flex-1 pt-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg text-gray-900 mb-1">Hair Studio & Color Bar</h3>
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${currentTemplate === 'hair_studio_color_bar' ? 'text-[#b76e79]' : 'text-gray-300'}`} />
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#f4e5e7] text-[#9d5a63] font-bold mb-2 text-[11px]">
                  Monochrome • Rose-Gold • Editorial
                </span>
                <p className="text-xs text-gray-600 leading-relaxed">
                  A minimalist, gallery-style studio with rose-gold accents, a color showcase and premium editorial feel.
                </p>
              </div>
            </div>
          </div>

          {/* Theme 4 — Beauty, Skin & Spa */}
          <div
            onClick={() => selectTemplate('beauty_skin_spa')}
            className={`relative border rounded-2xl p-4 md:p-5 cursor-pointer transition-all duration-200 bg-white hover:shadow-md ${
              currentTemplate === 'beauty_skin_spa'
                ? 'border-[#1e7a63] bg-[#e2f0ea]/60 ring-2 ring-[#1e7a63]/25 shadow-xs'
                : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-24 h-32 rounded-xl overflow-hidden shrink-0 border border-gray-200 relative shadow-2xs">
                <img
                  src="https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=600&auto=format&fit=crop"
                  alt="Beauty, Skin & Spa Template"
                  className="w-full h-full object-cover absolute inset-0"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                  <span className="text-white text-[10px] font-medium tracking-wide uppercase">Preview</span>
                </div>
              </div>
              <div className="flex-1 pt-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg text-gray-900 mb-1">Beauty, Skin & Spa</h3>
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${currentTemplate === 'beauty_skin_spa' ? 'text-[#1e7a63]' : 'text-gray-300'}`} />
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#e2f0ea] text-[#15594a] font-bold mb-2 text-[11px]">
                  Soft Pastel • Emerald &amp; Beige
                </span>
                <p className="text-xs text-gray-600 leading-relaxed">
                  A calm, serene wellness sanctuary — soft pastels, emerald and beige accents with a premium spa feel.
                </p>
              </div>
            </div>
          </div>

          {/* Theme 5 — Full-Service Family Salon */}
          <div
            onClick={() => selectTemplate('family_full_service')}
            className={`relative border rounded-2xl p-4 md:p-5 cursor-pointer transition-all duration-200 bg-white hover:shadow-md ${
              currentTemplate === 'family_full_service'
                ? 'border-[#1769d2] bg-[#eaf6ff]/70 ring-2 ring-[#1769d2]/25 shadow-xs'
                : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-24 h-32 rounded-xl overflow-hidden shrink-0 border border-gray-200 relative shadow-2xs">
                <img
                  src="https://images.unsplash.com/photo-1605497788044-5a32c7078486?q=80&w=600&auto=format&fit=crop"
                  alt="Full-Service Family Salon Template"
                  className="w-full h-full object-cover absolute inset-0"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                  <span className="text-white text-[10px] font-medium tracking-wide uppercase">Preview</span>
                </div>
              </div>
              <div className="flex-1 pt-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg text-gray-900 mb-1">Full-Service Family Salon</h3>
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${currentTemplate === 'family_full_service' ? 'text-[#1769d2]' : 'text-gray-300'}`} />
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold mb-2 text-[11px]">
                  Bright • Blue/Teal • Family
                </span>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Bright teal-and-sky energy with a friendly multi-category layout for the whole family — kids to grandparents.
                </p>
              </div>
            </div>
          </div>

          {/* Theme 6 — Nail & Lash Studio */}
          <div
            onClick={() => selectTemplate('nail_lash_studio')}
            className={`relative border rounded-2xl p-4 md:p-5 cursor-pointer transition-all duration-200 bg-white hover:shadow-md ${
              currentTemplate === 'nail_lash_studio'
                ? 'border-[#ff2d8d] bg-[#fff0f7]/70 ring-2 ring-[#ff2d8d]/25 shadow-xs'
                : 'border-gray-200/80 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-24 h-32 rounded-xl overflow-hidden shrink-0 border border-gray-200 relative shadow-2xs">
                <img
                  src="https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=600&auto=format&fit=crop"
                  alt="Nail & Lash Studio Template"
                  className="w-full h-full object-cover absolute inset-0"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                  <span className="text-white text-[10px] font-medium tracking-wide uppercase">Preview</span>
                </div>
              </div>
              <div className="flex-1 pt-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-lg text-gray-900 mb-1">Nail &amp; Lash Studio</h3>
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${currentTemplate === 'nail_lash_studio' ? 'text-[#ff2d8d]' : 'text-gray-300'}`} />
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#ffe5f1] text-[#d70f68] font-bold mb-2 text-[11px]">
                  Neon Pink • Nude Sand • Glam
                </span>
                <p className="text-xs text-gray-600 leading-relaxed">
                  A glamorous, visual-first studio for polished nails, expressive art, lashes and brows.
                </p>
              </div>
            </div>
          </div>
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

