import { useEffect, useState } from 'react';
import { initialData, type GalleryImage, type SalonData, type Service, type WebsiteCopy } from '../types';
import TemplateRenderer from './TemplateRenderer';
import { isSupabaseConfigured, requireSupabase } from '../lib/supabaseClient';
import { listPublicSalonMedia } from '../lib/salonMediaService';
import { PUBLIC_SALON_CATALOG_VIEW } from '../lib/nearbySalons';
import { SALON_LOCATION_TABLE } from '../lib/salonLocationService';
import { updateSalonFavicon, resetSalonFavicon } from '../lib/favicon';
import {
  buildBrandFallbackSalonData,
  matchesBrandFallbackSlug,
} from '../lib/salonRouting';

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

const themeKeys = new Set([
  'barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa',
  'family_full_service', 'nail_lash_studio',
]);

async function loadCanonicalPublicData(slug: string): Promise<SalonData | null> {
  const client = requireSupabase();
  const { data: website, error: websiteError } = await client
    .from('salon_public_websites')
    .select('salon_id,slug,template_key,config')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (websiteError) throw websiteError;
  if (!website) return null;

  const { data: salon, error: salonError } = await client
    .from(PUBLIC_SALON_CATALOG_VIEW)
    .select('id,name,slug,address,city')
    .eq('id', website.salon_id)
    .maybeSingle();
  if (salonError) throw salonError;
  if (!salon) return null;

  const [{ data: rows, error: serviceError }, { data: themes, error: themeError }, locationResult] = await Promise.all([
    client.from('services')
      .select('id,theme_id,category_id,name,description,price_paise,duration_minutes,is_featured,display_order')
      .eq('salon_id', salon.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('display_order'),
    client.from('themes').select('id,theme_id').eq('is_active', true),
    client.from(SALON_LOCATION_TABLE)
      .select('address_label')
      .eq('salon_id', salon.id)
      .eq('approval_status', 'approved')
      .maybeSingle(),
  ]);
  if (serviceError) throw serviceError;
  if (themeError) throw themeError;

  const config = website.config && typeof website.config === 'object' && !Array.isArray(website.config)
    ? website.config as Partial<SalonData>
    : {};
  const keyById = new Map((themes || []).map((theme) => [theme.id, theme.theme_id]));
  const services: Service[] = (rows || []).map((service) => ({
    id: service.id,
    name: service.name,
    category: 'Services',
    description: service.description || '',
    price: Number(service.price_paise) / 100,
    duration: service.duration_minutes,
    featured: service.is_featured,
    themeId: service.theme_id,
    themeKey: service.theme_id ? keyById.get(service.theme_id) : undefined,
    categoryId: service.category_id,
    status: 'active',
  }));
  const selectedTheme = [config.templateId, website.template_key, ...services.map((service) => service.themeKey)]
    .find((key): key is string => typeof key === 'string' && themeKeys.has(key));
  const scopedServices = selectedTheme
    ? services.filter((service) => service.themeKey === selectedTheme)
    : services.filter((service) => !service.themeKey);

  let media: Awaited<ReturnType<typeof listPublicSalonMedia>> = [];
  try {
    media = await listPublicSalonMedia(salon.id, ['logo', 'hero', 'gallery', 'owner']);
  } catch (error) {
    console.error('Public salon media could not be loaded:', error);
  }
  const logo = media.find((item) => item.mediaType === 'logo' && item.signedUrl);
  const hero = media.find((item) => item.mediaType === 'hero' && item.signedUrl);
  const owner = media.find((item) => item.mediaType === 'owner' && item.signedUrl);
  const gallery: GalleryImage[] = media
    .filter((item) => item.mediaType === 'gallery' && item.signedUrl)
    .map((item) => ({
      id: item.id,
      storagePath: item.storagePath || undefined,
      url: item.signedUrl!,
      alt: item.title || item.description || `${salon.name} gallery image`,
      title: item.title || undefined,
      description: item.description || undefined,
      displayOrder: item.displayOrder,
      status: 'active',
      moderation: 'approved',
    }));

  const location = locationResult.data?.address_label || salon.address || salon.city || '';
  // White-label content pass-through: the owner's CMS config is the content
  // authority for copy overrides and AI-reviewed content. Spread conditionally
  // so absent config keys never clobber the built-in defaults below.
  const whiteLabel: Partial<SalonData> = {};
  if (config.websiteCopy && typeof config.websiteCopy === 'object' && !Array.isArray(config.websiteCopy)) {
    whiteLabel.websiteCopy = config.websiteCopy as WebsiteCopy;
  }
  if (config.reviewedContent && typeof config.reviewedContent === 'object' && !Array.isArray(config.reviewedContent)) {
    whiteLabel.reviewedContent = config.reviewedContent;
  }
  return {
    ...emptyPublicData(slug),
    ...whiteLabel,
    salonId: salon.id,
    templateId: selectedTheme as SalonData['templateId'] || 'hair',
    salonName: salon.name,
    tagline: typeof config.tagline === 'string' ? config.tagline : '',
    about: typeof config.about === 'string' ? config.about : '',
    ownerName: typeof config.ownerName === 'string' ? config.ownerName : '',
    ownerRole: typeof config.ownerRole === 'string' ? config.ownerRole : '',
    ownerPhotoUrl: owner?.signedUrl || '',
    phone: typeof config.phone === 'string' ? config.phone : '',
    email: typeof config.email === 'string' ? config.email : '',
    whatsappPhone: typeof config.whatsappPhone === 'string' ? config.whatsappPhone : '',
    contactOptions: config.contactOptions || { callNow: false, whatsapp: false, bookNow: true },
    bookingRules: config.bookingRules,
    websiteAppearance: config.websiteAppearance,
    brandColor: typeof config.brandColor === 'string' ? config.brandColor : undefined,
    salonNameFont: typeof config.salonNameFont === 'string' ? config.salonNameFont : undefined,
    salonNameColor: typeof config.salonNameColor === 'string' ? config.salonNameColor : undefined,
    logoUrl: logo?.signedUrl || '',
    heroImageUrl: hero?.signedUrl || '',
    gallery,
    services: scopedServices,
    address: location ? { ...initialData.address!, fullAddress: location, city: salon.city || '' } : undefined,
  };
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
