import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  Monitor,
  Moon,
  Palette,
  Plus,
  Scissors,
  Smartphone,
  Sparkles,
  Sun,
  Type,
  X,
} from 'lucide-react';
import TemplateRenderer from '../components/TemplateRenderer';
import { SALON_NAME_COLORS, SALON_NAME_FONTS } from '../lib/brandIdentity';
import {
  BRAND_COLORS,
  DEFAULT_BRAND_COLOR,
  TAGLINE_CATEGORIES,
  TAGLINE_SUBCATEGORIES,
  withHexAlpha,
} from '../lib/websiteCustomization';
import { SalonData, Service } from '../types';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext?: () => void;
  onPrev?: () => void;
  onSave?: (nextData?: SalonData) => void;
}

export default function StepPublish({ data, setData, onNext, onPrev, onSave }: Props) {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [mobilePanel, setMobilePanel] = useState<'edit' | 'preview'>('edit');
  const [taglineCategory, setTaglineCategory] = useState('Salon');
  const [taglineSubcategory, setTaglineSubcategory] = useState('Hair Salon');
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCategory, setNewServiceCategory] = useState('Hair Styling');
  const [newServicePrice, setNewServicePrice] = useState('500');
  const [newServiceDuration, setNewServiceDuration] = useState('60');
  const [newServiceDescription, setNewServiceDescription] = useState('');
  const [liveMessage, setLiveMessage] = useState('Preview is synced with your website settings.');
  const appearance = data.websiteAppearance || 'light';
  const brandColor = data.brandColor || DEFAULT_BRAND_COLOR;

  const taglineOptions = useMemo(
    () => TAGLINE_CATEGORIES[taglineCategory]?.[taglineSubcategory] || TAGLINE_CATEGORIES.Salon['Hair Salon'],
    [taglineCategory, taglineSubcategory],
  );

  const announce = (message: string) => {
    setLiveMessage(message);
    window.setTimeout(() => setLiveMessage('Preview is synced with your website settings.'), 2400);
  };

  const commitData = (nextData: SalonData, message: string) => {
    setData(nextData);
    onSave?.(nextData);
    announce(message);
  };

  const selectAppearance = (websiteAppearance: 'light' | 'dark') => {
    commitData({ ...data, websiteAppearance }, `${websiteAppearance === 'light' ? 'Light' : 'Dark'} appearance applied.`);
  };

  const selectTagline = (tagline: string) => {
    // Keep the reviewed copy aligned too. Otherwise Step 12/13 can restore an
    // older tagline over the owner's new selection.
    commitData({
      ...data,
      tagline,
      reviewedContent: data.reviewedContent
        ? { ...data.reviewedContent, tagline }
        : data.reviewedContent,
    }, 'Tagline updated in the live preview.');
  };

  const selectBrandColor = (nextBrandColor: string) => {
    commitData({ ...data, brandColor: nextBrandColor }, 'Brand color applied across the website preview.');
  };

  const selectSalonNameFont = (salonNameFont: string) => {
    commitData({ ...data, salonNameFont }, 'Salon name font updated.');
  };

  const selectSalonNameColor = (salonNameColor: string) => {
    commitData({ ...data, salonNameColor }, 'Salon name color updated.');
  };

  const resetServiceForm = () => {
    setNewServiceName('');
    setNewServiceCategory('Hair Styling');
    setNewServiceDescription('');
    setNewServicePrice('500');
    setNewServiceDuration('60');
    setShowServiceForm(false);
  };

  const addService = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newServiceName.trim();
    const price = Number(newServicePrice);
    const duration = Number(newServiceDuration);
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(duration) || duration < 1) return;

    const service: Service = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      category: newServiceCategory,
      description: newServiceDescription.trim() || 'Personalized service by our expert team.',
      price,
      duration,
    };
    commitData(
      { ...data, services: [...(data.services || []), service] },
      `${name} added and visible in the live preview.`,
    );
    resetServiceForm();
  };

  const handleContinue = () => {
    const updated: SalonData = {
      ...data,
      websiteAppearance: appearance,
      lastCompletedStep: Math.max(data.lastCompletedStep || 0, 8),
    };
    setData(updated);
    onSave?.(updated);
    onNext?.();
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row w-full h-full min-h-0 bg-[#f9f9f9]">
      {/* Mobile editor/preview switch. The preview was previously hidden below md. */}
      <div className="md:hidden shrink-0 grid grid-cols-2 gap-1 border-b border-gray-200 bg-white p-2 z-30">
        <button
          type="button"
          onClick={() => setMobilePanel('edit')}
          className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${mobilePanel === 'edit' ? 'bg-[#ac0053] text-white' : 'text-gray-500'}`}
        >
          Edit Website
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel('preview')}
          className={`rounded-lg px-3 py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${mobilePanel === 'preview' ? 'bg-[#ac0053] text-white' : 'text-gray-500'}`}
        >
          <Eye className="w-3.5 h-3.5" /> Live Preview
        </button>
      </div>

      {/* Editor */}
      <section className={`${mobilePanel === 'preview' ? 'hidden md:flex' : 'flex'} w-full md:w-[42%] md:max-w-[620px] bg-[#f9f9f9] flex-col border-r border-[#eeeeee] relative z-10 shrink-0 h-full min-h-0 overflow-hidden`}>
        <header className="p-5 md:p-8 border-b border-[#eeeeee] bg-[#f9f9f9] shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#d9006b]/10 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-[#ac0053]">Live Sync Active</span>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#ac0053]">Step 9 • Appearance</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-[#1a1c1c] mb-2">Make the Website Yours</h1>
          <p className="text-sm text-[#5f5e5e]">Tagline, colors, services and appearance update in the preview instantly.</p>
          <p aria-live="polite" className="mt-3 min-h-5 text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> {liveMessage}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-8 bg-[#f9f9f9] pb-32">
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-[#5b3f46] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Sun className="w-[18px] h-[18px]" /> Template Appearance
            </h2>
            <div className="bg-white rounded-xl border border-[#eeeeee] p-4 shadow-sm space-y-4">
              <p className="text-xs text-gray-500">Choose the public website theme. Your selection is auto-saved.</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={appearance === 'light'}
                  onClick={() => selectAppearance('light')}
                  className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${appearance === 'light' ? 'border-[#ac0053] bg-[#ffd9e1]/20 shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
                >
                  <span className="w-10 h-10 rounded-full bg-white border shadow-sm flex items-center justify-center">
                    <Sun className="w-5 h-5 text-amber-500" />
                  </span>
                  <span className="text-sm font-bold text-gray-900">Light</span>
                  <span className="text-[11px] text-gray-500">Clean & bright</span>
                </button>
                <button
                  type="button"
                  aria-pressed={appearance === 'dark'}
                  onClick={() => selectAppearance('dark')}
                  className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${appearance === 'dark' ? 'border-[#ac0053] bg-zinc-900 shadow-sm' : 'border-gray-700 bg-gray-950 hover:bg-black'}`}
                >
                  <span className="w-10 h-10 rounded-full border border-zinc-700 bg-zinc-800 shadow-sm flex items-center justify-center">
                    <Moon className="w-5 h-5 text-white" />
                  </span>
                  <span className="text-sm font-bold text-white">Dark</span>
                  <span className="text-[11px] text-gray-300">Bold & premium</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-sm font-semibold text-[#5b3f46] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Palette className="w-[18px] h-[18px]" /> Brand & Headline
            </h2>
            <div className="bg-white rounded-xl border border-[#eeeeee] p-4 shadow-sm space-y-6">
              <div>
                <label htmlFor="salon-name" className="block text-sm font-semibold text-[#1a1c1c] mb-2">Salon Name</label>
                <input
                  id="salon-name"
                  type="text"
                  value={data.salonName}
                  onChange={event => setData(prev => ({ ...prev, salonName: event.target.value }))}
                  onBlur={() => onSave?.(data)}
                  className="w-full bg-[#f9f9f9] border border-[#eeeeee] rounded-lg px-4 py-3 text-[#1a1c1c] outline-none focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053] transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#1a1c1c] flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-[#ac0053]" /> Salon Name Font
                  </label>
                  <div className="space-y-1.5">
                    {SALON_NAME_FONTS.map(font => (
                      <button
                        key={font.id}
                        type="button"
                        aria-pressed={data.salonNameFont === font.id}
                        onClick={() => selectSalonNameFont(font.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${data.salonNameFont === font.id ? 'border-[#ac0053] bg-[#ffd9e1]/30 text-[#ac0053]' : 'border-[#eeeeee] bg-[#f9f9f9] text-[#5f5e5e] hover:border-[#ac0053]'}`}
                      >
                        <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-70">{font.label}</span>
                        <span className="block text-base leading-snug truncate" style={{ fontFamily: font.fontFamily, fontWeight: font.fontWeight, letterSpacing: font.letterSpacing, textTransform: font.textTransform }}>
                          {(data.salonName || 'Royal Salon').slice(0, 22)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#1a1c1c] flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#ac0053]" /> Salon Name Color
                  </label>
                  <div className="space-y-1.5">
                    {SALON_NAME_COLORS.map(color => (
                      <button
                        key={color.value}
                        type="button"
                        aria-pressed={data.salonNameColor === color.value}
                        onClick={() => selectSalonNameColor(color.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-left flex items-center gap-3 transition-colors ${data.salonNameColor === color.value ? 'border-[#ac0053] bg-[#ffd9e1]/30' : 'border-[#eeeeee] bg-[#f9f9f9] hover:border-[#ac0053]'}`}
                      >
                        <span className="w-5 h-5 rounded-full border border-gray-200 shrink-0" style={{ backgroundColor: color.value }} />
                        <span className="text-xs font-semibold text-[#5f5e5e]">{color.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-semibold text-[#1a1c1c]">Tagline</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Tagline category"
                    value={taglineCategory}
                    onChange={event => {
                      const nextCategory = event.target.value;
                      setTaglineCategory(nextCategory);
                      setTaglineSubcategory(TAGLINE_SUBCATEGORIES[nextCategory][0]);
                    }}
                    className="w-full bg-[#f9f9f9] border border-[#eeeeee] rounded-lg px-3 py-2.5 text-xs text-[#1a1c1c] outline-none focus:border-[#ac0053]"
                  >
                    {Object.keys(TAGLINE_CATEGORIES).map(category => <option key={category}>{category}</option>)}
                  </select>
                  <select
                    aria-label="Tagline subcategory"
                    value={taglineSubcategory}
                    onChange={event => setTaglineSubcategory(event.target.value)}
                    className="w-full bg-[#f9f9f9] border border-[#eeeeee] rounded-lg px-3 py-2.5 text-xs text-[#1a1c1c] outline-none focus:border-[#ac0053]"
                  >
                    {TAGLINE_SUBCATEGORIES[taglineCategory].map(subcategory => <option key={subcategory}>{subcategory}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  {taglineOptions.map(option => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={data.tagline === option}
                      onClick={() => selectTagline(option)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${data.tagline === option ? 'border-[#ac0053] bg-[#ffd9e1]/30 text-[#ac0053] font-bold' : 'border-[#eeeeee] bg-[#f9f9f9] text-[#5f5e5e] hover:border-[#ac0053]'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div>
                  <input
                    type="text"
                    maxLength={100}
                    value={data.tagline}
                    onChange={event => {
                      const tagline = event.target.value;
                      setData(prev => ({
                        ...prev,
                        tagline,
                        reviewedContent: prev.reviewedContent
                          ? { ...prev.reviewedContent, tagline }
                          : prev.reviewedContent,
                      }));
                    }}
                    onBlur={() => onSave?.(data)}
                    placeholder="Or write your own tagline"
                    className="w-full bg-[#f9f9f9] border border-[#eeeeee] rounded-lg px-4 py-3 text-[#1a1c1c] outline-none focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053] transition-colors"
                  />
                  <p className="mt-1 text-right text-[10px] text-gray-400">{data.tagline.length}/100</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1a1c1c] mb-2">Brand Color</label>
                <div className="flex flex-wrap items-center gap-3">
                  {BRAND_COLORS.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      title={color.name}
                      aria-label={`Select ${color.name} brand color`}
                      aria-pressed={brandColor === color.value}
                      onClick={() => selectBrandColor(color.value)}
                      className={`h-10 w-10 rounded-full border-2 transition-transform hover:scale-110 ${brandColor === color.value ? 'ring-2 ring-offset-2 ring-[#ffb1c4] border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: color.value }}
                    />
                  ))}
                  <label className="h-10 rounded-lg border border-gray-200 bg-[#f9f9f9] pl-2 pr-3 flex items-center gap-2 text-[11px] font-semibold text-gray-600 cursor-pointer">
                    <input
                      type="color"
                      value={brandColor}
                      onChange={event => selectBrandColor(event.target.value)}
                      className="h-7 w-7 border-0 bg-transparent cursor-pointer"
                    />
                    Custom
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-gray-500">Current: <strong className="font-mono text-gray-700">{brandColor.toUpperCase()}</strong></p>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-sm font-semibold text-[#5b3f46] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Scissors className="w-[18px] h-[18px]" /> Core Services
            </h2>
            <div className="bg-white rounded-xl border border-[#eeeeee] p-4 shadow-sm space-y-4">
              {(data.services || []).length === 0 && (
                <p className="rounded-lg bg-gray-50 px-4 py-5 text-center text-xs text-gray-500">No services yet. Add your first service below.</p>
              )}
              {(data.services || []).map(service => (
                <div key={service.id} className="flex items-center gap-3 bg-[#f7f7f7] rounded-lg p-3 border border-transparent">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: withHexAlpha(brandColor, '1a') }}>
                    <Sparkles className="w-5 h-5" style={{ color: brandColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[#1a1c1c] truncate">{service.name}</h3>
                    <p className="text-xs text-[#5f5e5e]">{service.duration} min • ₹{service.price.toLocaleString('en-IN')}</p>
                  </div>
                  <span className="hidden sm:block text-[10px] font-semibold text-gray-400">{service.category}</span>
                </div>
              ))}

              {!showServiceForm && (
                <button
                  type="button"
                  onClick={() => setShowServiceForm(true)}
                  className="w-full py-3 border border-dashed border-[#ac0053]/50 rounded-lg text-[#ac0053] text-sm font-semibold hover:bg-[#ffd9e1]/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-[18px] h-[18px]" /> Add Another Service
                </button>
              )}
              {showServiceForm && (
                <form onSubmit={addService} className="space-y-3 rounded-xl border border-[#ac0053]/20 bg-[#fff8fa] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-gray-900">New Service</h3>
                    <button type="button" onClick={resetServiceForm} aria-label="Cancel adding service" className="p-1 text-gray-400 hover:text-gray-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    autoFocus
                    required
                    value={newServiceName}
                    onChange={event => setNewServiceName(event.target.value)}
                    placeholder="Service name"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-xs outline-none focus:border-[#ac0053]"
                  />
                  <select
                    value={newServiceCategory}
                    onChange={event => setNewServiceCategory(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-[#ac0053]"
                  >
                    {['Haircut', 'Hair Styling', 'Treatment', 'Hair Coloring', 'Beauty', 'Makeup', 'Skincare', 'Wellness', 'Custom'].map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] font-semibold text-gray-500">
                      Price (₹)
                      <input type="number" required min="0" step="1" value={newServicePrice} onChange={event => setNewServicePrice(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-xs text-gray-900 outline-none focus:border-[#ac0053]" />
                    </label>
                    <label className="text-[10px] font-semibold text-gray-500">
                      Duration (minutes)
                      <input type="number" required min="1" step="1" value={newServiceDuration} onChange={event => setNewServiceDuration(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-xs text-gray-900 outline-none focus:border-[#ac0053]" />
                    </label>
                  </div>
                  <textarea value={newServiceDescription} onChange={event => setNewServiceDescription(event.target.value)} placeholder="Short description (optional)" rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-xs outline-none focus:border-[#ac0053] resize-none" />
                  <div className="flex gap-2">
                    <button type="button" onClick={resetServiceForm} className="w-1/3 rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-bold text-gray-600 hover:bg-white">Cancel</button>
                    <button type="submit" className="w-2/3 rounded-lg bg-[#ac0053] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#ba005b]">Save & Preview Service</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        <footer className="absolute bottom-0 left-0 w-full p-4 md:p-6 border-t border-[#eeeeee] bg-[#f9f9f9]/95 backdrop-blur-sm flex gap-3 z-20">
          {onPrev && (
            <button onClick={onPrev} className="px-4 md:px-5 py-3 rounded-lg border border-gray-300 text-gray-700 font-semibold text-xs md:text-sm flex items-center gap-2 hover:bg-white">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <button onClick={handleContinue} className="flex-1 bg-[#ac0053] text-white font-semibold text-xs md:text-sm py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#ba005b] transition-colors shadow-sm">
            Continue to AI Review <ArrowRight className="w-5 h-5" />
          </button>
        </footer>
      </section>

      {/* One shared renderer is used here, in the dashboard and in final review. */}
      <section className={`${mobilePanel === 'edit' ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 min-h-0 bg-[#f3f3f4] p-3 md:p-6 relative overflow-hidden flex-col`}>
        <div className="mb-3 shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-[#ac0053]" /> Real-time website preview</p>
            <p className="text-[10px] text-gray-400">Tagline, brand color and services share the final website renderer.</p>
          </div>
          <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode('desktop')}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1.5 ${mode === 'desktop' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              <Monitor className="w-3.5 h-3.5" /> Desktop
            </button>
            <button
              type="button"
              onClick={() => setMode('mobile')}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1.5 ${mode === 'mobile' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              <Smartphone className="w-3.5 h-3.5" /> Mobile
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
          <TemplateRenderer data={data} mode={mode} renderMode="owner-preview" />
        </div>
        <div className="absolute right-[-10%] bottom-[-10%] w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: withHexAlpha(brandColor, '24') }} />
      </section>
    </div>
  );
}
