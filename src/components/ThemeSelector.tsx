import React, { useState, useEffect } from 'react';
import { SalonData } from '../types';
import { normalizeThemeId, ThemeId } from '../lib/themeServices';
import { CheckCircle2, Sparkles, Layout } from 'lucide-react';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onSave?: (msg?: string) => void;
  onThemeChange?: (id: ThemeId) => void;
  layout?: 'grid' | 'list';
}

export default function ThemeSelector({ data, setData, onSave, onThemeChange, layout = 'grid' }: Props) {
  const currentTemplate = normalizeThemeId(data.templateId);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  useEffect(() => {
    // Automatically trigger UI re-render on templateId change
    setRefreshKey(prev => prev + 1);
  }, [data.templateId]);

  const themes = [
    {
      id: 'hair' as ThemeId,
      name: 'Hair & Unisex Salon',
      category: 'Hair & Beauty',
      tagline: 'Refined unisex hair styling, coloring and premium care.',
      accent: '#ac0053',
      badgeBg: 'bg-[#ffd9e1]/50 text-[#ac0053]',
      image: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?q=80&w=600&auto=format&fit=crop',
    },
    {
      id: 'barber_mens_grooming' as ThemeId,
      name: "Barber & Men's Grooming",
      category: 'Barber Shop',
      tagline: 'Bold dark aesthetics, precision fades, beard sculpting & hot towel shaves.',
      accent: '#c9a227',
      badgeBg: 'bg-[#3a3016] text-[#e8c95c]',
      image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600&auto=format&fit=crop',
    },
    {
      id: 'beauty_skin_spa' as ThemeId,
      name: 'Beauty, Skin & Spa',
      category: 'Spa & Wellness',
      tagline: 'Serene botanical sanctuary, holistic facials and rejuvenating rituals.',
      accent: '#1e7a63',
      badgeBg: 'bg-[#e2f0ea] text-[#15594a]',
      image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=600&auto=format&fit=crop',
    },
    {
      id: 'family_full_service' as ThemeId,
      name: 'Family Full-Service Salon',
      category: 'Family Care',
      tagline: 'Welcoming community destination for multi-generational styling.',
      accent: '#2563eb',
      badgeBg: 'bg-blue-50 text-blue-700',
      image: 'https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?q=80&w=600&auto=format&fit=crop',
    },
    {
      id: 'nail_lash_studio' as ThemeId,
      name: 'Nail & Lash Studio',
      category: 'Nail & Boutique',
      tagline: 'Chic modern boutique specializing in custom nail art & lash extensions.',
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
      setData(prev => {
        const nextData = {
          ...prev,
          templateId: id,
          services: prev.services || [],
          packages: prev.packages || [],
        };
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
          console.error('Failed to persist theme change to localStorage', e);
        }
        return nextData;
      });
    }

    if (onSave) {
      onSave(`Template switched to ${themes.find(t => t.id === id)?.name || id}`);
    }

    setTimeout(() => {
      setSwitchingId(null);
    }, 350);
  };

  const handleReset = () => {
    const defaultTheme = 'hair';
    setSwitchingId(defaultTheme);
    
    if (onThemeChange) {
      onThemeChange(defaultTheme);
    } else {
      setData(prev => {
        const nextData = {
          ...prev,
          templateId: defaultTheme,
          services: prev.services || [],
          packages: prev.packages || [],
        };
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
          console.error('Failed to persist theme reset to localStorage', e);
        }
        return nextData;
      });
    }

    if (onSave) {
      onSave(`Theme reset to Default`);
    }

    setTimeout(() => {
      setSwitchingId(null);
    }, 350);
  };

  if (layout === 'list') {
    return (
      <div className="space-y-3">
        {themes.map(theme => {
          const isActive = currentTemplate === theme.id;
          const isSwitching = switchingId === theme.id;
          return (
            <div
              key={theme.id}
              onClick={() => handleSelect(theme.id)}
              className={`border rounded-2xl p-4 cursor-pointer transition-all duration-300 flex items-center justify-between gap-4 bg-white hover:shadow-md hover:-translate-y-0.5 group ${
                isActive
                  ? 'shadow-sm'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              style={isActive ? {
                borderColor: theme.accent,
                boxShadow: `0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 0 0 2px ${theme.accent}33`,
                backgroundColor: `${theme.accent}08`
              } : undefined}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-gray-100">
                  <img src={theme.image} alt={theme.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${theme.badgeBg}`}>
                      {theme.category}
                    </span>
                    {isActive && (
                      <span className="text-[10px] font-bold" style={{ color: theme.accent }}>
                        Active
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 mt-0.5 group-hover:text-gray-700 transition-colors" style={isActive ? { color: theme.accent } : undefined}>
                    {theme.name}
                  </h4>
                  <p className="text-xs text-gray-500 line-clamp-1">{theme.tagline}</p>
                </div>
              </div>
              <div 
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  isActive ? 'text-white' : 'border border-gray-300 text-transparent group-hover:border-gray-400'
                }`}
                style={isActive ? { backgroundColor: theme.accent } : undefined}
              >
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
          );
        })}

        {currentTemplate !== 'hair' && (
          <button
            onClick={handleReset}
            className="w-full py-3 mt-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Reset to Default Theme
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {themes.map(theme => {
        const isActive = currentTemplate === theme.id;
        const isSwitching = switchingId === theme.id;

        return (
          <div
            key={theme.id}
            onClick={() => handleSelect(theme.id)}
            className={`relative rounded-2xl border p-4 cursor-pointer transition-all duration-300 flex flex-col justify-between group bg-white hover:shadow-lg hover:-translate-y-1 ${
              isActive
                ? 'shadow-md'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            style={isActive ? {
              borderColor: theme.accent,
              boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 0 2px ${theme.accent}33`,
              backgroundColor: `${theme.accent}08`
            } : undefined}
          >
            <div>
              {/* Thumbnail Image */}
              <div className="w-full h-36 rounded-xl overflow-hidden relative border border-gray-100 mb-3.5 shadow-2xs">
                <img
                  src={theme.image}
                  alt={theme.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end justify-between p-3">
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${theme.badgeBg}`}>
                    {theme.category}
                  </span>
                  <span className="text-white text-[10px] font-medium tracking-wide bg-black/40 backdrop-blur-xs px-2 py-0.5 rounded">
                    Preview
                  </span>
                </div>
              </div>

              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h4 
                  className="font-extrabold text-sm text-gray-900 group-hover:text-gray-700 transition-colors"
                  style={isActive ? { color: theme.accent } : undefined}
                >
                  {theme.name}
                </h4>
                <div 
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'border border-gray-300 text-transparent group-hover:border-gray-400'
                  }`}
                  style={isActive ? { backgroundColor: theme.accent } : undefined}
                >
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
                    ? 'text-white shadow-xs'
                    : 'bg-gray-100 text-gray-700 group-hover:bg-gray-200'
                }`}
                style={isActive ? { backgroundColor: theme.accent } : undefined}
              >
                {isSwitching ? 'Applying...' : isActive ? 'Selected' : 'Select Theme'}
              </button>
            </div>
          </div>
        );
      })}
      
      {currentTemplate !== 'hair' && (
        <div className="sm:col-span-2 lg:col-span-3 mt-2">
          <button
            onClick={handleReset}
            className="w-full py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Reset to Default Theme
          </button>
        </div>
      )}
    </div>
  );
}
