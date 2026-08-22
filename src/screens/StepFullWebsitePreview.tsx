import React, { useState, useRef } from 'react';
import { SalonData } from '../types';
import TemplateRenderer from '../components/TemplateRenderer';
import { ArrowLeft, ArrowRight, Monitor, Smartphone, Tablet, Eye, Sparkles, Layout, Compass, Info } from 'lucide-react';
import { useBrandConfig } from '../config/brandConfig';
import { publicWebsiteHref, suggestedWebsiteSlug } from '../lib/publicWebsiteUrl';
import type { ThemeId } from '../lib/themeServices';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext: () => void;
  onPrev: () => void;
  onSave?: () => void;
  onEditSection?: (section: string) => void;
  /** Live theme switcher — updates the previewed template without touching the wizard data. */
  onThemeChange?: (nextTheme: ThemeId) => void;
}

export default function StepFullWebsitePreview({ data, onNext, onPrev }: Props) {
  const { platform } = useBrandConfig();
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const previewRef = useRef<HTMLDivElement>(null);

  const previewData: SalonData = {
    ...data,
    salonName: data.reviewedContent?.heroHeadline || data.salonName,
    tagline: data.reviewedContent?.tagline || data.tagline,
    about: data.reviewedContent?.about || data.about,
    services: data.services.map(s => ({
      ...s,
      description: data.reviewedContent?.serviceDescriptions?.[s.id] || s.description
    }))
  };

  const isDark = data.websiteAppearance === 'dark';
  const appearanceLabel = isDark ? 'Dark' : 'Light';

  const scrollToSection = (id: string) => {
    if (!previewRef.current) return;
    const el = previewRef.current.querySelector(`#section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const navItems = [
    { id: 'header', label: 'Header Menu' },
    { id: 'hero', label: 'Hero Banner' },
    { id: 'services', label: 'Services & Rates' },
    ...(previewData.ownerName ? [{ id: 'owner', label: 'Owner Story' }] : []),
    ...(previewData.team && previewData.team.length > 0 ? [{ id: 'team', label: 'Stylists & Staff' }] : []),
    ...(previewData.gallery && previewData.gallery.length > 0 ? [{ id: 'gallery', label: 'Work Gallery' }] : []),
    ...(previewData.socialVideos && previewData.socialVideos.length > 0 ? [{ id: 'social', label: 'Social Reels' }] : []),
    { id: 'location', label: 'Location & Hours' },
    { id: 'contact', label: 'Booking Options' },
    { id: 'footer', label: 'Footer Info' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f9f9f9]" id="full-preview-screen">
      {/* Controls Header */}
      <div className="px-6 py-5 bg-white border-b border-gray-200 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#ffd9e1] text-[#ac0053] font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded">
              Step 13 of 15
            </span>
            <span className="text-xs text-gray-400 font-medium">|</span>
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-[#ac0053]" /> Live Preview
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#1a1c1c] tracking-tight">Review your website</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5">This is how your clients will see your salon online.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Device Toggle */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-semibold">
            <button
              onClick={() => setMode('desktop')}
              className={`px-4 py-1.5 rounded-lg flex items-center gap-2 transition-all duration-200 ${
                mode === 'desktop'
                  ? 'bg-white shadow-sm text-gray-950 font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Monitor className="w-4 h-4" /> Desktop
            </button>
            <button
              onClick={() => setMode('tablet')}
              className={`px-4 py-1.5 rounded-lg flex items-center gap-2 transition-all duration-200 ${
                mode === 'tablet'
                  ? 'bg-white shadow-sm text-gray-950 font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Tablet className="w-4 h-4" /> Tablet
            </button>
            <button
              onClick={() => setMode('mobile')}
              className={`px-4 py-1.5 rounded-lg flex items-center gap-2 transition-all duration-200 ${
                mode === 'mobile'
                  ? 'bg-white shadow-sm text-gray-950 font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Smartphone className="w-4 h-4" /> Mobile
            </button>
          </div>

          {/* Quick Edit Website Link */}
          <button
            onClick={onPrev}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold border border-gray-200 rounded-xl bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs hover:text-[#ac0053]"
          >
            <Layout className="w-4 h-4" />
            Edit Content
          </button>
        </div>
      </div>

      {/* Main Section Navigation & Frame */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Quick Jump Navigation */}
        <div className="hidden lg:flex w-60 shrink-0 bg-white border-r border-gray-200 flex-col p-5 overflow-y-auto justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#ac0053]">
              <Compass className="w-4 h-4" /> Quick Section Jump
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Click any section below to instantly scroll the preview canvas and check the layout:
            </p>
            <div className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-[#ffd9e1]/20 hover:text-[#ac0053] transition-all flex items-center justify-between group"
                >
                  <span>{item.label}</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[#ac0053] font-mono">
                    Go →
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-[11px] text-gray-500 space-y-2 mt-6">
            <div className="flex items-center gap-1.5 font-bold text-gray-800">
              <Info className="w-3.5 h-3.5 text-[#ac0053]" /> Smart Filter
            </div>
            <p className="leading-relaxed">
              {platform.name} automatically hides empty sections to keep your landing page compact and modern.
            </p>
            <div className="pt-1.5 border-t border-gray-200/60 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
              {appearanceLabel} theme active
            </div>
          </div>
        </div>

        {/* Center Preview Frame */}
        <div className="flex-1 bg-gray-50 overflow-hidden p-4 md:p-6 flex flex-col justify-center items-center relative">
          <div
            ref={previewRef}
            className="w-full h-full flex items-center justify-center overflow-hidden relative"
          >
            <TemplateRenderer data={previewData} mode={mode} />
          </div>

          {/* Toast / Help Tip overlay */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-[#1a1c1c]/90 text-white backdrop-blur-md rounded-full py-2 px-4 shadow-lg text-[10px] font-semibold tracking-wide uppercase flex items-center gap-1.5 pointer-events-none">
            <Sparkles className="w-3.5 h-3.5 text-pink-300" />
            Scroll inside the frame to inspect — {appearanceLabel} mode active
          </div>
        </div>
      </div>

      {/* Persistent Bottom Bar */}
      <footer className="h-[76px] bg-white border-t border-gray-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-xs">
        <button
          onClick={onPrev}
          className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-xs hover:bg-gray-50 flex items-center gap-2 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Review
        </button>
        <span className="hidden md:block text-xs font-semibold text-gray-400">
          {publicWebsiteHref(suggestedWebsiteSlug(data), platform.websiteUrl) || platform.websiteUrl.replace(/^https?:\/\//, '')}
        </span>
        <button
          onClick={onNext}
          className="px-8 py-2.5 rounded-xl bg-[#ac0053] text-white font-bold text-xs hover:bg-[#ba005b] flex items-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-98"
        >
          Looks Good — Continue <ArrowRight className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );
}
