import { useEffect, useState } from 'react';
import { initialData, SalonData } from '../types';
import TemplateRenderer from './TemplateRenderer';

interface Props {
  slug: string;
}

export default function PublicSalonView({ slug }: Props) {
  const [data, setData] = useState<SalonData>(() => {
    try {
      const saved = localStorage.getItem('nexora_onboarding_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.data) {
          // If the slug matches or if this is the only active local session, use it
          const localSlug = parsed.data.websiteSlug || 'royal-hair-studio';
          if (localSlug === slug || slug === 'royal-hair-studio') {
            return { ...initialData, ...parsed.data };
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse saved salon data for PublicSalonView', e);
    }
    
    // Fallback: update initialData's websiteSlug to match the current slug
    return { ...initialData, websiteSlug: slug };
  });

  const [mode, setMode] = useState<'desktop' | 'tablet' | 'mobile'>(() => {
    return window.innerWidth < 768 ? 'mobile' : 'desktop';
  });

  // Keep responsive mode synchronized with resize events
  useEffect(() => {
    const handleResize = () => {
      setMode(window.innerWidth < 768 ? 'mobile' : 'desktop');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-[#fcfcfc] flex flex-col">
      {/* Floating preview badge for live customer website */}
      <div className="fixed bottom-4 right-4 z-[100] bg-gray-900 text-white px-3 py-1.5 rounded-full text-[11px] font-bold shadow-lg flex items-center gap-1.5 border border-gray-800">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>Public Salon Website: /{slug}</span>
      </div>

      <div className="flex-1 w-full flex items-center justify-center p-0 md:p-4">
        <TemplateRenderer data={data} mode={mode} />
      </div>
    </div>
  );
}
