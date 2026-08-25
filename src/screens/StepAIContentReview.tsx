import { authenticatedApiFetch } from '../lib/apiFetch';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SalonData, ReviewedContent } from '../types';
import TemplateRenderer from '../components/TemplateRenderer';
import { useBrandConfig } from '../config/brandConfig';
import { STEP_CONTENT_REVIEW, TOTAL_OWNER_STEPS } from '../lib/ownerFlow';
import { 
  ArrowLeft, 
  ArrowRight, 
  Sparkles, 
  Wand2, 
  Type, 
  Monitor, 
  Smartphone, 
  Save, 
  CheckCircle2,
  RefreshCw,
  Sliders,
  Tags,
  Undo,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext: () => void;
  onPrev: () => void;
  onSave?: () => void;
}

type ActiveField = 'hero' | 'tagline' | 'about' | 'owner' | 'services' | 'booking' | null;

const SUGGESTED_KEYWORDS = [
  'Organic & Cruelty-free',
  'Balayage experts',
  'Eco-luxury styling',
  'Bridal makeover',
  'Precision cuts',
  'Deep nourishment'
];

export default function StepAIContentReview({ data, setData, onNext, onPrev, onSave }: Props) {
  const { platform } = useBrandConfig();
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  
  // New full-stack AI options
  const [tone, setTone] = useState<string>('luxurious');
  const [keywords, setKeywords] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [generatingField, setGeneratingField] = useState<Record<string, boolean>>({});
  const [globalGenerating, setGlobalGenerating] = useState<boolean>(false);

  const saveTimer = useRef<number | null>(null);

  // Initialize reviewed content from saved data if not present
  const reviewed: ReviewedContent = data.reviewedContent || {
    heroHeadline: data.salonName || 'Welcome to our salon',
    tagline: data.tagline || '',
    about: data.about || '',
    ownerIntro: data.ownerRole ? `${data.ownerName} — ${data.ownerRole}. ${data.about?.slice(0, 120) || ''}` : `${data.ownerName || 'Owner'} is dedicated to premium care.`,
    serviceDescriptions: {},
    bookingCTA: 'Ready to Transform Your Look? Book your appointment today.'
  };

  // Ensure serviceDescriptions contains entries for existing services
  useEffect(() => {
    if (!data.reviewedContent) {
      const svcDesc: Record<string, string> = {};
      data.services.forEach(s => {
        svcDesc[s.id] = s.description;
      });
      const initial: ReviewedContent = {
        heroHeadline: data.salonName,
        tagline: data.tagline,
        about: data.about,
        ownerIntro: `${data.ownerName} is ${data.ownerRole || 'Founder'}. Passionate about delivering luxury hair and beauty experiences.`,
        serviceDescriptions: svcDesc,
        bookingCTA: 'Ready to Transform Your Look? Book your appointment today and experience premium care.'
      };
      setData(prev => ({ ...prev, reviewedContent: initial }));
    } else {
      // sync missing service descriptions
      const missing: Record<string, string> = { ...data.reviewedContent.serviceDescriptions };
      let changed = false;
      data.services.forEach(s => {
        if (!missing[s.id]) {
          missing[s.id] = s.description;
          changed = true;
        }
      });
      if (changed) {
        setData(prev => ({
          ...prev,
          reviewedContent: prev.reviewedContent ? { ...prev.reviewedContent, serviceDescriptions: missing } : prev.reviewedContent
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerAutoSave = useCallback((updated: ReviewedContent) => {
    setSaveStatus('saving');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setData(prev => ({ ...prev, reviewedContent: updated, lastCompletedStep: Math.max(prev.lastCompletedStep || 0, STEP_CONTENT_REVIEW) }));
      if (onSave) onSave();
      setSaveStatus('saved');
    }, 600) as unknown as number;
  }, [setData, onSave]);

  const updateField = (field: keyof ReviewedContent, value: any) => {
    const updated = { ...reviewed, [field]: value } as ReviewedContent;
    // immediate UI
    setData(prev => ({ ...prev, reviewedContent: updated }));
    triggerAutoSave(updated);
  };

  const updateServiceDesc = (serviceId: string, value: string) => {
    const updatedDescs = { ...reviewed.serviceDescriptions, [serviceId]: value };
    const updated = { ...reviewed, serviceDescriptions: updatedDescs };
    setData(prev => ({ ...prev, reviewedContent: updated }));
    triggerAutoSave(updated);
  };

  // Real Gemini rewrite call
  const handleRewrite = async (field: keyof ReviewedContent, customInstruct?: string) => {
    if (field === 'serviceDescriptions') return;
    const current = (reviewed[field] as string) || '';
    setGeneratingField(prev => ({ ...prev, [field]: true }));
    try {
      const res = await authenticatedApiFetch('/api/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: current,
          field,
          tone,
          keywords,
          instructions: customInstruct || customPrompt
        })
      });
      const resData = await res.json();
      if (resData.rewritten) {
        updateField(field, resData.rewritten);
      }
    } catch (e) {
      console.error('Error during AI rewrite:', e);
    } finally {
      setGeneratingField(prev => ({ ...prev, [field]: false }));
    }
  };

  const handleServiceRewrite = async (serviceId: string, currentDesc: string, customInstruct?: string) => {
    setGeneratingField(prev => ({ ...prev, [serviceId]: true }));
    try {
      const res = await authenticatedApiFetch('/api/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: currentDesc,
          field: 'service',
          tone,
          keywords,
          instructions: customInstruct || customPrompt
        })
      });
      const resData = await res.json();
      if (resData.rewritten) {
        updateServiceDesc(serviceId, resData.rewritten);
      }
    } catch (e) {
      console.error('Error during service AI rewrite:', e);
    } finally {
      setGeneratingField(prev => ({ ...prev, [serviceId]: false }));
    }
  };

  // Revert specific field to defaults
  const handleRevertField = (field: keyof ReviewedContent) => {
    if (field === 'heroHeadline') {
      updateField('heroHeadline', data.salonName || 'Welcome to our salon');
    } else if (field === 'tagline') {
      updateField('tagline', data.tagline || 'Premium styling services');
    } else if (field === 'about') {
      updateField('about', data.about || '');
    } else if (field === 'ownerIntro') {
      const defaultOwner = `${data.ownerName || 'Founder'} is dedicated to premium care and custom styling experiences.`;
      updateField('ownerIntro', defaultOwner);
    } else if (field === 'bookingCTA') {
      updateField('bookingCTA', 'Ready to Transform Your Look? Book your appointment today and experience premium care.');
    }
  };

  const handleRevertService = (serviceId: string) => {
    const originalSvc = data.services.find(s => s.id === serviceId);
    if (originalSvc) {
      updateServiceDesc(serviceId, originalSvc.description);
    }
  };

  // One-click regenerate all fields with preferences
  const handleRegenerateAll = async () => {
    setGlobalGenerating(true);
    try {
      const fields: (keyof ReviewedContent)[] = ['heroHeadline', 'tagline', 'about', 'ownerIntro', 'bookingCTA'];
      await Promise.all([
        ...fields.map(f => handleRewrite(f)),
        ...data.services.map(s => {
          const curr = reviewed.serviceDescriptions[s.id] || s.description;
          return handleServiceRewrite(s.id, curr);
        })
      ]);
    } catch (err) {
      console.error('Error in global rewrite:', err);
    } finally {
      setGlobalGenerating(false);
    }
  };

  // Helper to toggle suggest tags
  const handleToggleKeyword = (kw: string) => {
    setKeywords(prev => {
      const list = prev ? prev.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (list.includes(kw)) {
        return list.filter(item => item !== kw).join(', ');
      } else {
        return [...list, kw].join(', ');
      }
    });
  };

  // Merge data for preview: use reviewed content to override
  const previewData: SalonData = {
    ...data,
    salonName: reviewed.heroHeadline || data.salonName,
    tagline: reviewed.tagline || data.tagline,
    about: reviewed.about || data.about,
    services: data.services.map(s => ({
      ...s,
      description: reviewed.serviceDescriptions?.[s.id] || s.description
    })),
  };

  // Character evaluation helper
  const getSEOIndicator = (length: number, min: number, max: number) => {
    if (length === 0) return { label: 'Empty', color: 'text-gray-400 bg-gray-100' };
    if (length < min) return { label: 'Short', color: 'text-amber-700 bg-amber-50 border border-amber-200' };
    if (length > max) return { label: 'Overly Long', color: 'text-red-700 bg-red-50 border border-red-200' };
    return { label: 'SEO Perfect', color: 'text-emerald-700 bg-emerald-50 border border-emerald-200' };
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-[#f9f9f9]">
      {/* LEFT 55%: Content review/edit */}
      <div className="w-full md:w-[55%] h-full flex flex-col relative bg-white border-r border-gray-200">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
          <div className="max-w-2xl mx-auto pb-32 space-y-8">
            
            {/* Header section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#ac0053]">
                  <Sparkles className="w-4 h-4" /> STEP {STEP_CONTENT_REVIEW + 1} • AI CONTENT REVIEW
                </div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  {saveStatus === 'saving' ? (
                    <span className="flex items-center gap-1.5 text-[#ac0053] bg-[#ffd9e1]/30 px-2.5 py-1 rounded-full"><Save className="w-3.5 h-3.5 animate-pulse" /> Saving…</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> Saved ✓</span>
                  )}
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#1a1c1c]">Review AI-generated content</h1>
              <p className="text-sm text-[#5f5e5e] leading-relaxed">{platform.name} created your website text from your saved salon data. Review and edit before final preview. Changes appear instantly on the right.</p>
            </div>

            {/* NEW ENHANCEMENT: Global AI Copilot Dashboard */}
            <div className="bg-gradient-to-br from-[#ffd9e1]/30 to-[#f3f3f4]/70 border border-[#ac0053]/20 rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 transform translate-x-4 -translate-y-4 pointer-events-none">
                <Sparkles className="w-32 h-32 text-[#ac0053]" />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4.5 h-4.5 text-[#ac0053]" />
                  <h2 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">✨ Global AI Copilot Settings</h2>
                </div>
                <button
                  disabled={globalGenerating}
                  onClick={handleRegenerateAll}
                  className="px-3.5 py-1.5 bg-[#ac0053] hover:bg-[#ba005b] disabled:bg-gray-400 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-xs"
                >
                  {globalGenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Regenerating All...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate All Fields
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-gray-500">Fine-tune the overall tone, core keywords, and instructions. Click "Improve with AI" on any card below to apply these preferences.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Tone Selector */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">Writing Tone</label>
                  <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-xl border border-gray-200">
                    {[
                      { key: 'luxurious', label: '👑 Luxurious' },
                      { key: 'modern', label: '⚡ Modern' },
                      { key: 'warm', label: '🌸 Warm' },
                      { key: 'minimalist', label: '🌱 Minimalist' }
                    ].map(t => (
                      <button
                        key={t.key}
                        onClick={() => setTone(t.key)}
                        className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${tone === t.key ? 'bg-[#ac0053] text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Keywords target field */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1">
                    <Tags className="w-3.5 h-3.5 text-gray-400" /> Target Keywords
                  </label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={e => setKeywords(e.target.value)}
                    placeholder="e.g. Balayage, eco-friendly, organic"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-800 focus:border-[#ac0053] outline-none"
                  />
                </div>
              </div>

              {/* Clickable suggested keyword tag pills */}
              <div className="space-y-1 pt-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Suggested Business Tags:</span>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_KEYWORDS.map(kw => {
                    const isSelected = keywords.split(',').map(s => s.trim()).includes(kw);
                    return (
                      <button
                        key={kw}
                        onClick={() => handleToggleKeyword(kw)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${isSelected ? 'bg-[#ffd9e1] border-[#ac0053] text-[#ac0053]' : 'bg-white border-gray-200 hover:border-gray-300 text-gray-500'}`}
                      >
                        {isSelected ? '✓ ' : '+ '}{kw}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom directives textbox */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">Custom AI Prompt Instructions</label>
                <input
                  type="text"
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="e.g. Translate to Spanish, make it sound humorous, keep under 12 words..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs text-gray-800 focus:border-[#ac0053] outline-none placeholder-gray-400"
                />
              </div>
            </div>

            {/* Hero Headline Card */}
            <div className={`bg-white rounded-2xl border p-5 shadow-sm space-y-3 transition-all relative ${activeField === 'hero' ? 'border-[#ac0053] ring-2 ring-[#ac0053]/20' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-800 flex items-center gap-2">
                  <Type className="w-4 h-4 text-[#ac0053]" /> Hero Headline
                </label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleRewrite('heroHeadline')} 
                    disabled={generatingField['heroHeadline']}
                    className="text-[11px] font-semibold text-[#ac0053] hover:bg-[#ffd9e1]/40 px-2 py-1 rounded flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" /> {generatingField['heroHeadline'] ? 'Rewriting...' : 'Improve with AI'}
                  </button>
                  <button 
                    onClick={() => handleRewrite('heroHeadline', 'make it much simpler, concise and punchy')} 
                    className="text-[11px] font-semibold text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    Make it simpler
                  </button>
                  <button 
                    onClick={() => handleRevertField('heroHeadline')}
                    title="Revert to Default"
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  >
                    <Undo className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={reviewed.heroHeadline}
                  onFocus={() => setActiveField('hero')}
                  onChange={e => updateField('heroHeadline', e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#ac0053] outline-none text-sm font-semibold text-gray-900 transition-colors ${generatingField['heroHeadline'] ? 'opacity-50 animate-pulse' : ''}`}
                  placeholder="Your salon name / hero headline"
                />
              </div>

              {/* Word count & SEO indicator */}
              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] text-gray-400">Focuses Hero section in live preview.</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getSEOIndicator(reviewed.heroHeadline?.length || 0, 15, 60).color}`}>
                    {getSEOIndicator(reviewed.heroHeadline?.length || 0, 15, 60).label}
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">{(reviewed.heroHeadline || '').length} chars</span>
                </div>
              </div>
            </div>

            {/* Tagline Card */}
            <div className={`bg-white rounded-2xl border p-5 shadow-sm space-y-3 transition-all relative ${activeField === 'tagline' ? 'border-[#ac0053] ring-2 ring-[#ac0053]/20' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-800">Tagline</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleRewrite('tagline')} 
                    disabled={generatingField['tagline']}
                    className="text-[11px] font-semibold text-[#ac0053] hover:bg-[#ffd9e1]/40 px-2 py-1 rounded flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" /> {generatingField['tagline'] ? 'Rewriting...' : 'Improve with AI'}
                  </button>
                  <button 
                    onClick={() => handleRewrite('tagline', 'make it shorter and simpler')} 
                    className="text-[11px] font-semibold text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    Make it simpler
                  </button>
                  <button 
                    onClick={() => handleRevertField('tagline')}
                    title="Revert to Default"
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  >
                    <Undo className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={reviewed.tagline}
                onFocus={() => setActiveField('tagline')}
                onChange={e => updateField('tagline', e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#ac0053] outline-none text-sm text-gray-900 transition-colors ${generatingField['tagline'] ? 'opacity-50 animate-pulse' : ''}`}
                placeholder="Premium Hair, Beauty & Spa Care"
              />

              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] text-gray-400">Visible in Hero subtitle.</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getSEOIndicator(reviewed.tagline?.length || 0, 15, 80).color}`}>
                    {getSEOIndicator(reviewed.tagline?.length || 0, 15, 80).label}
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">{(reviewed.tagline || '').length} chars</span>
                </div>
              </div>
            </div>

            {/* About Salon Card */}
            <div className={`bg-white rounded-2xl border p-5 shadow-sm space-y-3 transition-all relative ${activeField === 'about' ? 'border-[#ac0053] ring-2 ring-[#ac0053]/20' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-800">About Salon</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleRewrite('about')} 
                    disabled={generatingField['about']}
                    className="text-[11px] font-semibold text-[#ac0053] hover:bg-[#ffd9e1]/40 px-2 py-1 rounded flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" /> {generatingField['about'] ? 'Rewriting...' : 'Improve with AI'}
                  </button>
                  <button 
                    onClick={() => handleRewrite('about', 'make it a very short one sentence.')} 
                    className="text-[11px] font-semibold text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    Make it simpler
                  </button>
                  <button 
                    onClick={() => handleRevertField('about')}
                    title="Revert to Default"
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  >
                    <Undo className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <textarea
                rows={4}
                value={reviewed.about}
                onFocus={() => setActiveField('about')}
                onChange={e => updateField('about', e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#ac0053] outline-none text-sm text-gray-800 resize-none leading-relaxed ${generatingField['about'] ? 'opacity-50 animate-pulse' : ''}`}
                placeholder="Tell customers about your salon..."
              />

              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] text-gray-400">Main paragraph on the landing view.</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getSEOIndicator(reviewed.about?.length || 0, 80, 300).color}`}>
                    {getSEOIndicator(reviewed.about?.length || 0, 80, 300).label}
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">{(reviewed.about || '').length} chars</span>
                </div>
              </div>
            </div>

            {/* Owner Intro Card */}
            <div className={`bg-white rounded-2xl border p-5 shadow-sm space-y-3 transition-all relative ${activeField === 'owner' ? 'border-[#ac0053] ring-2 ring-[#ac0053]/20' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-800">Owner / Founder Intro</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleRewrite('ownerIntro')} 
                    disabled={generatingField['ownerIntro']}
                    className="text-[11px] font-semibold text-[#ac0053] hover:bg-[#ffd9e1]/40 px-2 py-1 rounded flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" /> {generatingField['ownerIntro'] ? 'Rewriting...' : 'Improve with AI'}
                  </button>
                  <button 
                    onClick={() => handleRewrite('ownerIntro', 'make it simple, short bio.')} 
                    className="text-[11px] font-semibold text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    Make it simpler
                  </button>
                  <button 
                    onClick={() => handleRevertField('ownerIntro')}
                    title="Revert to Default"
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  >
                    <Undo className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <textarea
                rows={3}
                value={reviewed.ownerIntro}
                onFocus={() => setActiveField('owner')}
                onChange={e => updateField('ownerIntro', e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#ac0053] outline-none text-sm text-gray-800 resize-none ${generatingField['ownerIntro'] ? 'opacity-50 animate-pulse' : ''}`}
                placeholder="Founder intro..."
              />

              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] text-gray-400">Shown in About / Owner section.</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getSEOIndicator(reviewed.ownerIntro?.length || 0, 50, 200).color}`}>
                    {getSEOIndicator(reviewed.ownerIntro?.length || 0, 50, 200).label}
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">{(reviewed.ownerIntro || '').length} chars</span>
                </div>
              </div>
            </div>

            {/* Service Descriptions Card */}
            <div className={`bg-white rounded-2xl border p-5 shadow-sm space-y-4 transition-all relative ${activeField === 'services' ? 'border-[#ac0053] ring-2 ring-[#ac0053]/20' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-800">Service Descriptions</label>
                <span className="text-[11px] bg-gray-100 px-2.5 py-1 rounded-full text-gray-600 font-semibold">{data.services.length} services ready</span>
              </div>

              <div className="space-y-5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                {data.services.map(s => {
                  const descValue = reviewed.serviceDescriptions[s.id] || '';
                  return (
                    <div key={s.id} className="space-y-2 border-b border-gray-50 pb-4 last:border-b-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-900 bg-[#f3f3f4] px-2 py-1 rounded">{s.name}</span>
                        <div className="flex gap-2">
                          <button
                            disabled={generatingField[s.id]}
                            onClick={() => {
                              setActiveField('services');
                              handleServiceRewrite(s.id, descValue);
                            }}
                            className="text-[10px] text-[#ac0053] font-bold hover:bg-[#ffd9e1]/30 px-2 py-0.5 rounded flex items-center gap-0.5"
                          >
                            <Wand2 className="w-2.5 h-2.5" /> {generatingField[s.id] ? 'AI...' : 'AI ✨'}
                          </button>
                          <button
                            onClick={() => {
                              setActiveField('services');
                              handleServiceRewrite(s.id, descValue, 'make it short, 1 sentence');
                            }}
                            className="text-[10px] text-gray-500 hover:bg-gray-100 px-1.5 py-0.5 rounded"
                          >
                            Simple
                          </button>
                          <button 
                            onClick={() => handleRevertService(s.id)}
                            title="Restore default description"
                            className="text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100"
                          >
                            <Undo className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        value={descValue}
                        onFocus={() => setActiveField('services')}
                        onChange={e => updateServiceDesc(s.id, e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#ac0053] outline-none text-xs text-gray-700 resize-none ${generatingField[s.id] ? 'opacity-50 animate-pulse' : ''}`}
                        placeholder="Service benefit description..."
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Booking CTA Card */}
            <div className={`bg-white rounded-2xl border p-5 shadow-sm space-y-3 transition-all relative ${activeField === 'booking' ? 'border-[#ac0053] ring-2 ring-[#ac0053]/20' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-800">Booking CTA Text</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleRewrite('bookingCTA')} 
                    disabled={generatingField['bookingCTA']}
                    className="text-[11px] font-semibold text-[#ac0053] hover:bg-[#ffd9e1]/40 px-2 py-1 rounded flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" /> {generatingField['bookingCTA'] ? 'Rewriting...' : 'Improve with AI'}
                  </button>
                  <button 
                    onClick={() => handleRewrite('bookingCTA', 'make it simpler, concise and direct')} 
                    className="text-[11px] font-semibold text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    Make it simpler
                  </button>
                  <button 
                    onClick={() => handleRevertField('bookingCTA')}
                    title="Revert to Default"
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  >
                    <Undo className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <textarea
                rows={2}
                value={reviewed.bookingCTA}
                onFocus={() => setActiveField('booking')}
                onChange={e => updateField('bookingCTA', e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#ac0053] outline-none text-sm text-gray-800 resize-none ${generatingField['bookingCTA'] ? 'opacity-50 animate-pulse' : ''}`}
                placeholder="Book your appointment today..."
              />

              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] text-gray-400">Call to action in the booking area.</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getSEOIndicator(reviewed.bookingCTA?.length || 0, 30, 150).color}`}>
                    {getSEOIndicator(reviewed.bookingCTA?.length || 0, 30, 150).label}
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">{(reviewed.bookingCTA || '').length} chars</span>
                </div>
              </div>
            </div>

            <div className="bg-[#ffd9e1]/20 border border-[#ac0053]/20 rounded-xl p-4 text-xs text-[#80003c] leading-relaxed">
              <strong className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Auto-save active:</strong> All edits are saved automatically. Preview updates instantly when you focus a field — Hero, About, Services, Owner, Booking.
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="absolute bottom-0 left-0 w-full p-4 bg-white border-t border-gray-200 flex justify-between items-center z-10 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] animate-none">
          <button onClick={onPrev} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-50 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="hidden sm:block text-xs text-gray-400">Step {STEP_CONTENT_REVIEW + 1} of {TOTAL_OWNER_STEPS} • AI Content Review</span>
          <button onClick={onNext} className="px-6 py-2.5 rounded-xl bg-[#ac0053] text-white font-semibold text-xs hover:bg-[#ba005b] flex items-center gap-2 shadow-sm">
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </footer>
      </div>

      {/* RIGHT 45%: LIVE WEBSITE PREVIEW */}
      <div className="hidden md:flex w-[45%] h-full bg-gray-100 flex-col">
        <div className="h-14 border-b border-gray-200 bg-white/90 backdrop-blur flex items-center justify-between px-5 shrink-0">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Live Website Preview</span>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button onClick={() => setMode('desktop')} className={`px-3 py-1 rounded-md flex items-center gap-1.5 text-xs font-medium ${mode === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}><Monitor className="w-3.5 h-3.5" /> Desktop</button>
              <button onClick={() => setMode('mobile')} className={`px-3 py-1 rounded-md flex items-center gap-1.5 text-xs font-medium ${mode === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}><Smartphone className="w-3.5 h-3.5" /> Mobile</button>
            </div>
          </div>
        </div>
        {/* Focus indicator */}
        {activeField && (
          <div className="px-5 py-2 bg-[#ac0053]/10 text-[#ac0053] text-[11px] font-semibold border-b border-[#ac0053]/20 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#ac0053] animate-pulse" /> Focusing: {activeField === 'hero' ? 'Hero Section' : activeField === 'tagline' ? 'Hero Tagline' : activeField === 'about' ? 'About Section' : activeField === 'owner' ? 'Owner / About Section' : activeField === 'services' ? 'Services Section' : 'Booking CTA Section'}
          </div>
        )}
        <div className="flex-1 overflow-hidden p-3 bg-[radial-gradient(#e5e2e1_1px,transparent_1px)] [background-size:16px_16px] relative">
          <motion.div key={activeField + mode + reviewed.heroHeadline} initial={{ opacity: 0.8 }} animate={{ opacity: 1 }} className="w-full h-full flex justify-center">
            <div className="w-full h-full overflow-auto">
              <TemplateRenderer data={previewData} mode={mode} renderMode="owner-preview" />
              {/* Extra overlay for focused section highlight in preview */}
              {activeField === 'booking' && (
                <div className="mt-4 mx-4 p-3 bg-[#ac0053] text-white rounded-xl text-xs font-semibold text-center shadow-lg">
                  {reviewed.bookingCTA}
                </div>
              )}
              {activeField === 'owner' && (
                <div className="mt-4 mx-4 p-4 bg-white border border-[#ac0053]/20 rounded-xl text-xs text-gray-700 italic">
                  "{reviewed.ownerIntro}"
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
