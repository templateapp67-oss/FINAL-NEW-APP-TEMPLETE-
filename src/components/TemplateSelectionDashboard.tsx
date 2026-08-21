import React, { useState } from 'react';
import { SalonData } from '../types';
import { normalizeThemeId, ThemeId } from '../lib/themeServices';
import { CheckCircle2, Layout, Sparkles, Palette, Monitor } from 'lucide-react';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onSave?: (msg?: string) => void;
  onThemeChange?: (id: ThemeId) => void;
}

export default function TemplateSelectionDashboard({ data, setData, onSave, onThemeChange }: Props) {
  const currentTemplate = normalizeThemeId(data.templateId);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const themes = [
    {
      id: 'hair' as ThemeId,
      name: 'Hair & Unisex Salon',
      tagline: 'Refined unisex hair styling, colouring and premium beauty care.',
      accent: '#ac0053',
      badgeBg: 'bg-[#ffd9e1]/50 text-[#ac0053]',
      image: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?q=80&w=600&auto=format&fit=crop',
    },
    {
      id: 'barber_mens_grooming' as ThemeId,
      name: "Barber & Men's Grooming",
      tagline: 'Bold dark aesthetics, precision fades, beard sculpting and hot towel shaves.',
      accent: '#c9a227',
      badgeBg: 'bg-[#3a3016] text-[#e8c95c]',
      image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600&auto=format&fit=crop',
    },
    {
      id: 'hair_studio_color_bar' as ThemeId,
      name: 'Hair Studio & Color Bar',
      tagline: 'Editorial warm minimalism, master balayage and vibrant color bar.',
      accent: '#b76e79',
      badgeBg: 'bg-[#f4e5e7] text-[#9d5a63]',
      image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop',
    },
    {
      id: 'beauty_skin_spa' as ThemeId,
      name: 'Beauty, Skin & Spa',
      tagline: 'Serene botanical sanctuary, holistic facials and rejuvenating rituals.',
      accent: '#1e7a63',
      badgeBg: 'bg-[#e2f0ea] text-[#15594a]',
      image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=600&auto=format&fit=crop',
    },
    {
      id: 'family_full_service' as ThemeId,
      name: 'Family Full-Service Salon',
      tagline: 'Welcoming community destination for multi-generational care and styling.',
      accent: '#2563eb',
      badgeBg: 'bg-blue-50 text-blue-700',
      image: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?q=80&w=600&auto=format&fit=crop',
    },
    {
      id: 'nail_lash_studio' as ThemeId,
      name: 'Nail & Lash Studio',
      tagline: 'Chic modern boutique specializing in custom nail art and lightweight lash extensions.',
      accent: '#db2777',
      badgeBg: 'bg-pink-50 text-pink-700',
      image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=600&auto=format&fit=crop',
    },
  ];

  const handleSelect = (id: ThemeId) => {
    if (id === currentTemplate) return;
    setSwitchingId(id);
    if (onThemeChange) {
      onThemeChange(id);
    } else {
      setData(prev => ({
        ...prev,
        templateId: id,
        services: [],
        packages: [],
      }));
    }
    if (onSave) {
      onSave(`Website theme switched to ${themes.find(t => t.id === id)?.name || id}`);
    }
    setTimeout(() => {
      setSwitchingId(null);
    }, 400);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-xs space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#ac0053] mb-1">
            <Layout className="w-4 h-4" /> Template & Theme Selection
          </div>
          <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">Active Website Theme</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Switch between professional salon themes instantly. Changes apply across your entire public website and client booking portals.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#ffd9e1]/20 text-[#ac0053] px-3.5 py-1.5 rounded-xl border border-[#ffd9e1]/50 text-xs font-bold">
          <Sparkles className="w-4 h-4" />
          {themes.find(t => t.id === currentTemplate)?.name || 'Active Theme'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {themes.map(theme => {
          const isActive = currentTemplate === theme.id;
          const isSwitching = switchingId === theme.id;

          return (
            <div
              key={theme.id}
              onClick={() => handleSelect(theme.id)}
              className={`relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 flex flex-col justify-between group bg-white hover:shadow-lg ${
                isActive
                  ? 'border-[#ac0053] ring-2 ring-[#ac0053]/20 bg-[#ffd9e1]/10 shadow-xs'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div>
                {/* Thumbnail Image */}
                <div className="w-full h-40 rounded-xl overflow-hidden relative border border-gray-100 mb-4 shadow-2xs">
                  <img
                    src={theme.image}
                    alt={theme.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end justify-between p-3">
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${theme.badgeBg}`}>
                      {theme.name.split(' ')[0]}
                    </span>
                    <span className="text-white text-[10px] font-medium tracking-wide bg-black/40 backdrop-blur-xs px-2 py-0.5 rounded">
                      Preview
                    </span>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-extrabold text-sm text-gray-900 group-hover:text-[#ac0053] transition-colors">
                    {theme.name}
                  </h4>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isActive ? 'bg-[#ac0053] text-white' : 'border border-gray-300 text-transparent'
                  }`}>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>

                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-4">
                  {theme.tagline}
                </p>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400">
                  {isActive ? 'Active Theme' : 'Click to Apply'}
                </span>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-[#ac0053] text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {isSwitching ? 'Applying...' : isActive ? 'Selected' : 'Select Theme'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
