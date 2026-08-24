import { useEffect, useState } from 'react';
import { initialData, type GalleryImage, type SalonData, type Service } from '../types';
import TemplateRenderer from './TemplateRenderer';
import { isSupabaseConfigured, requireSupabase } from '../lib/supabaseClient';
import { listPublicSalonMedia } from '../lib/salonMediaService';

import { updateSalonFavicon, resetSalonFavicon } from '../lib/favicon';
import {
  buildBrandFallbackSalonData,
  matchesBrandFallbackSlug,
} from '../lib/salonRouting';
import { applyPublicTemplateConfiguration } from '../lib/publicSalonPresentation';

interface Props { slug: string }

type PublicState = { status: 'loading' | 'ready' | 'not-found' | 'error'; data: SalonData };

function emptyPublicData(slug: string): SalonData {
  return {
    ...initialData,
    salonName: '',
    tagline: '',
    ownerName: '',
    ownerRole: '',
    ownerPhotoUrl: '',
    about: '',
    phone: '',
    email: '',
    whatsappPhone: '',
    contactOptions: { callNow: false, whatsapp: false, bookNow: true },
    logoUrl: '',
    heroImageUrl: '',
    gallery: [],
    socialProfiles: {},
    socialVideos: [],
    services: [],
    packages: [],
    offers: [],
    team: [],
    announcements: [],
    holidays: [],
    openingHours: undefined,
    websiteSlug: slug,
  };
}

function localDraft(slug: string): SalonData {
  try {
    const saved = localStorage.getItem('nexora_onboarding_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      const localSlug = typeof parsed?.data?.websiteSlug === 'string'
        ? parsed.data.websiteSlug.trim().toLowerCase()
        : '';
      if (parsed?.data && localSlug && localSlug === slug) {
        return { ...initialData, ...parsed.data };
      }
    }
  } catch (error) {
    console.error('Failed to parse local demo salon data:', error);
  }
  return { ...initialData, websiteSlug: slug };
}

async function loadCanonicalPublicData(slug: string): Promise<SalonData | null> {
  const client = requireSupabase();
  const { data: projectionRows, error: websiteError } = await client
    .rpc('get_public_salon_website', { p_slug: slug });
  if (websiteError) throw websiteError;
  const website = Array.isArray(projectionRows) ? projectionRows[0] : projectionRows;
  if (!website?.salon_id || !website.slug || !website.business_name) return null;

  const { data: rows, error: serviceError } = await client
    .rpc('get_public_salon_services', { p_slug: slug });
  if (serviceError) throw serviceError;

  // Services and prices come from a field-limited, published-slug RPC. The
  // browser never receives table access or supplies a salon/business id.
  const services: Service[] = (rows || []).map((service) => ({
    id: service.id,
    name: service.name,
    category: 'Services',
    description: service.description || '',
    price: Number(service.price_paise) / 100,
    duration: service.duration_minutes,
    featured: service.is_featured,
    themeId: service.theme_key,
    categoryId: service.category_id,
    status: 'active',
  }));

  const config = website.public_config && typeof website.public_config === 'object' && !Array.isArray(website.public_config)
    ? website.public_config as Partial<SalonData>
    : {};

  let media: Awaited<ReturnType<typeof listPublicSalonMedia>> = [];
  try {
    media = await listPublicSalonMedia(website.salon_id, ['logo', 'hero', 'gallery']);
  } catch (error) {
    console.error('Public salon media could not be loaded:', error);
  }
  const logo = media.find((item) => item.mediaType === 'logo' && item.signedUrl);
  const hero = media.find((item) => item.mediaType === 'hero' && item.signedUrl);
  const gallery: GalleryImage[] = media
    .filter((item) => item.mediaType === 'gallery' && item.signedUrl)
    .map((item) => ({
      id: item.id,
      storagePath: item.storagePath || undefined,
      url: item.signedUrl!,
      alt: item.title || item.description || `${website.business_name} gallery image`,
      title: item.title || undefined,
      description: item.description || undefined,
      displayOrder: item.displayOrder,
      status: 'active',
      moderation: 'approved',
    }));

  const location = typeof website.address === 'string' ? website.address : '';
  return applyPublicTemplateConfiguration({
    ...emptyPublicData(slug),
    salonId: website.salon_id,
    websiteSlug: website.slug,
    salonName: website.business_name,
    // Owner identity/contact is deliberately not part of the public RPC.
    ownerName: '',
    ownerRole: '',
    ownerPhotoUrl: '',
    email: '',
    phone: typeof config.phone === 'string' ? config.phone : '',
    whatsappPhone: typeof config.whatsappPhone === 'string' ? config.whatsappPhone : '',
    logoUrl: logo?.signedUrl || '',
    heroImageUrl: hero?.signedUrl || '',
    gallery,
    services,
    address: location || website.city
      ? { ...initialData.address!, fullAddress: location, city: website.city || '' }
      : undefined,
  }, config, website.template_key);
}

export default function PublicSalonView({ slug }: Props) {
  const [state, setState] = useState<PublicState>(() => isSupabaseConfigured
    ? { status: 'loading', data: emptyPublicData(slug) }
    : (matchesBrandFallbackSlug(slug)
      ? { status: 'ready', data: buildBrandFallbackSalonData(slug) }
      : { status: 'ready', data: localDraft(slug) }));
  const [mode, setMode] = useState<'desktop' | 'tablet' | 'mobile'>(() => window.innerWidth < 768 ? 'mobile' : 'desktop');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setState({ status: 'loading', data: emptyPublicData(slug) });
    void loadCanonicalPublicData(slug)
      .then((data) => {
        if (!active) return;
        // Record missing → fall back to the configured brand profile when the
        // slug matches the default business (e.g. 'royal-hair-studio').
        if (data) {
          setState({ status: 'ready', data });
          return;
        }
        if (matchesBrandFallbackSlug(slug)) {
          setState({ status: 'ready', data: buildBrandFallbackSalonData(slug) });
          return;
        }
        setState({ status: 'not-found', data: emptyPublicData(slug) });
      })
      .catch((error) => {
        console.error('Failed to load public salon:', error);
        if (!active) return;
        // Network/permission failure → still surface the brand fallback so the
        // default salon never shows "Salon Not Found".
        if (matchesBrandFallbackSlug(slug)) {
          setState({ status: 'ready', data: buildBrandFallbackSalonData(slug) });
          return;
        }
        setState({ status: 'error', data: emptyPublicData(slug) });
      });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    const handleResize = () => setMode(window.innerWidth < 768 ? 'mobile' : 'desktop');
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (state.status === 'ready' && state.data) {
      updateSalonFavicon(state.data);
    }
    return () => {
      resetSalonFavicon();
    };
  }, [state.status, state.data]);

  if (state.status !== 'ready') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#fcfcfc] p-6 text-center">
        <section>
          <h1 className="text-xl font-bold">{state.status === 'loading' ? 'Loading salon…' : state.status === 'not-found' ? 'Salon not found' : 'Salon unavailable'}</h1>
          <p className="mt-2 text-sm text-gray-600">{state.status === 'error' ? 'Please try again shortly.' : 'Only published backend records are shown here.'}</p>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfcfc] flex flex-col">
      <div className="fixed bottom-4 right-4 z-[100] bg-gray-900 text-white px-3 py-1.5 rounded-full text-[11px] font-bold shadow-lg flex items-center gap-1.5 border border-gray-800">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>Public Salon Website: /{slug}</span>
      </div>
      <div className="flex-1 w-full flex items-center justify-center p-0 md:p-4">
        <TemplateRenderer data={state.data} mode={mode} />
      </div>
    </div>
  );
}
