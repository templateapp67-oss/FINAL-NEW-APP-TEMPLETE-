import React, { useCallback, useRef, useState } from 'react';
import {
  Palette,
  Upload,
  Image as ImageIcon,
  Trash2,
  Eye,
  Globe,
  Landmark,
  Sparkles,
  Shield,
  Check,
  Mail,
  Phone,
  MapPin,
  Smartphone,
  BadgeCheck,
  RefreshCw,
  Monitor,
  Search,
  Share2,
  FileText,
  ExternalLink,
  Info,
  Wand2,
  Layers,
} from 'lucide-react';
import { SalonData } from '../types';
import { useBrandConfig, updateBrandConfig, applyBrandConfigToDocument } from '../config/brandConfig';
import { compressImageToMaxFileSize } from '../lib/imageCompression';
import {
  createPreviewUrl,
  readImageAsDataUrl,
  revokePreviewUrl,
  validateImageUploadFile,
  describeUploadError,
  IMAGE_UPLOAD_ACCEPT_ATTR,
} from '../lib/mediaUpload';

interface Props {
  data: SalonData;
  setData?: React.Dispatch<React.SetStateAction<SalonData>>;
  onNotify?: (msg: string) => void;
}

type Currency = 'INR' | 'USD' | 'AED' | 'EUR' | 'GBP' | 'SGD';

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  INR: '₹',
  USD: '$',
  AED: 'د.إ',
  EUR: '€',
  GBP: '£',
  SGD: 'S$',
};

const COUNTRIES = ['India', 'United Arab Emirates', 'United States', 'United Kingdom', 'Singapore', 'Australia', 'Canada'];

export default function BrandingWhiteLabel({ data, setData, onNotify }: Props) {
  const { config } = useBrandConfig();
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(data.logoUrl || config.defaultSalon.ownerPhotoUrl || null);
  const [faviconDataUrl, setFaviconDataUrl] = useState<string | null>(config.platform.faviconUrl || null);
  const [hideBranding, setHideBranding] = useState(config.platform.hidePlatformBranding || false);
  const [brandName, setBrandName] = useState(data.salonName || config.defaultSalon.name || 'Nexora Lumina');
  const [brandTagline, setBrandTagline] = useState(data.tagline || config.defaultSalon.tagline || 'Premium Salon & Spa Experience');
  const [brandEmail, setBrandEmail] = useState(data.email || config.defaultSalon.email || '');
  const [brandPhone, setBrandPhone] = useState(data.phone || config.defaultSalon.phone || '');
  const [country, setCountry] = useState(config.theme.country || 'India');
  const [city, setCity] = useState(data.address?.city || config.defaultSalon.address.city || 'Mumbai');
  const [currency, setCurrency] = useState<Currency>((config.theme.currency as Currency) || 'INR');

  // SEO & Social Share state
  const defaultDesc = (data.about || data.tagline) 
    ? `${data.salonName || 'Our salon'} in ${data.address?.city || 'the city'} offers premier salon, hair styling, skin care, and spa treatments. Book your appointment online today!`
    : config.seo.siteDescription || 'Experience luxury salon, beauty and wellness services. Book appointments online effortlessly.';
  
  const [metaDescription, setMetaDescription] = useState(data.metaDescription || config.seo.siteDescription || defaultDesc);
  const [socialShareImageUrl, setSocialShareImageUrl] = useState<string>(data.socialShareImageUrl || config.seo.ogImage || data.heroImageUrl || '');
  const [metaTitle, setMetaTitle] = useState(data.metaTitle || config.seo.siteTitle || `${data.salonName || 'Salon'} | Premium Hair, Beauty & Spa`);
  const [metaKeywords, setMetaKeywords] = useState(data.metaKeywords || config.seo.keywords || 'salon, hair spa, haircuts, facial, bridal makeup, beauty parlor, online booking');
  
  const [activeSeoPreviewTab, setActiveSeoPreviewTab] = useState<'google' | 'social'>('google');
  const [rightPanelTab, setRightPanelTab] = useState<'website' | 'social'>('website');
  const [showAdvancedSeo, setShowAdvancedSeo] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const socialImageInputRef = useRef<HTMLInputElement>(null);
  // Object-URL previews awaiting revocation once the data URL takes over.
  const previewUrls = useRef<Partial<Record<'logo' | 'favicon' | 'social', string>>>({});

  const symbol = CURRENCY_SYMBOLS[currency];
  const notify = (msg: string) => {
    if (onNotify) onNotify(msg);
  };

  const applyResult = useCallback(
    (kind: 'logo' | 'favicon' | 'social', result: string, optimized: boolean) => {
      if (kind === 'logo') {
        setLogoDataUrl(result);
        notify(optimized ? 'Custom logo uploaded & optimized' : 'Custom logo uploaded');
      } else if (kind === 'favicon') {
        setFaviconDataUrl(result);
        notify(optimized ? 'Favicon uploaded & optimized' : 'Favicon uploaded');
      } else if (kind === 'social') {
        setSocialShareImageUrl(result);
        notify(optimized ? 'Social share image uploaded & optimized' : 'Social share image uploaded');
      }
    },
    [notify],
  );

  const handleFile = async (file: File | undefined, kind: 'logo' | 'favicon' | 'social') => {
    if (!file) return;

    // Shared upload contract: 5 MB max, JPG / PNG / WEBP / SVG, with a
    // specific, human-readable reason instead of a silent no-op.
    const validation = validateImageUploadFile(file);
    if (!validation.ok) {
      notify(validation.error);
      return;
    }

    // INSTANT PREVIEW — the logo / favicon renders before compression finishes.
    const previewUrl = createPreviewUrl(file);
    if (previewUrl) {
      const stale = previewUrls.current[kind];
      if (stale) revokePreviewUrl(stale);
      previewUrls.current[kind] = previewUrl;
      applyResult(kind, previewUrl, false);
    }

    try {
      let targetFile = file;
      if (kind === 'favicon') {
        targetFile = await compressImageToMaxFileSize(file, 0.02, 128);
      } else if (kind === 'logo') {
        targetFile = await compressImageToMaxFileSize(file, 0.05, 400);
      } else if (kind === 'social') {
        targetFile = await compressImageToMaxFileSize(file, 0.1, 1000);
      }
      const result = await readImageAsDataUrl(targetFile);
      const stale = previewUrls.current[kind];
      if (stale) {
        revokePreviewUrl(stale);
        delete previewUrls.current[kind];
      }
      applyResult(kind, result, true);
    } catch (e) {
      console.warn('Image processing fallback:', e);
      // Compression/read failed — keep the working object-URL preview rather
      // than blanking the owner's logo, and tell them what happened.
      if (!previewUrls.current[kind]) {
        notify(describeUploadError(e, 'Could not read that image. Try another image.'));
      }
    }
  };

  const generateAutoDescription = () => {
    const cityName = city || data.address?.city || 'your city';
    const sName = brandName || data.salonName || 'Our salon';
    const tag = brandTagline || data.tagline || 'luxury hair and beauty treatments';
    const topServices = (data.services || []).slice(0, 3).map(s => s.name).join(', ');
    
    let generated = `${sName} in ${cityName} — ${tag}.`;
    if (topServices) {
      generated += ` Offering expert ${topServices} and premium wellness rituals.`;
    }
    generated += ` Book your appointment online today!`;
    
    if (generated.length > 158) {
      generated = generated.slice(0, 155) + '…';
    }
    setMetaDescription(generated);
    notify('SEO meta description generated from salon profile');
  };

  const handleSave = () => {
    setSavedTick(true);

    const updatedConfig = {
      ...config,
      platform: {
        ...config.platform,
        hidePlatformBranding: hideBranding,
        faviconUrl: faviconDataUrl || '',
      },
      defaultSalon: {
        ...config.defaultSalon,
        name: brandName,
        tagline: brandTagline,
        email: brandEmail,
        phone: brandPhone,
        address: {
          ...config.defaultSalon.address,
          city,
        },
      },
      theme: {
        ...config.theme,
        currency,
        currencySymbol: symbol,
        country,
      },
      seo: {
        ...config.seo,
        siteTitle: metaTitle || brandName,
        siteDescription: metaDescription,
        keywords: metaKeywords,
        ogImage: socialShareImageUrl || '',
      },
    };

    updateBrandConfig(() => updatedConfig);
    applyBrandConfigToDocument(updatedConfig);

    if (setData) {
      setData((prev) => ({
        ...prev,
        salonName: brandName,
        tagline: brandTagline,
        email: brandEmail,
        phone: brandPhone,
        logoUrl: logoDataUrl || prev.logoUrl,
        metaDescription,
        socialShareImageUrl: socialShareImageUrl || undefined,
        metaTitle: metaTitle || undefined,
        metaKeywords: metaKeywords || undefined,
        address: prev.address ? { ...prev.address, city } : { fullAddress: '', area: '', city, state: '', pinCode: '' },
      }));
    }

    setTimeout(() => setSavedTick(false), 2000);
    notify('Branding, SEO & white-label settings saved');
  };

  // SEO Description length analysis
  const descLen = metaDescription.trim().length;
  const descStatus = descLen === 0 
    ? { label: 'Empty (Required for SEO)', color: 'text-rose-600 bg-rose-50 border-rose-200' }
    : descLen < 50
    ? { label: `${descLen}/160 chars — Short (Add details)`, color: 'text-amber-700 bg-amber-50 border-amber-200' }
    : descLen <= 160
    ? { label: `${descLen}/160 chars — Optimal length`, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    : { label: `${descLen}/160 chars — May truncate in search (>160)`, color: 'text-amber-700 bg-amber-50 border-amber-200' };

  // Site domain preview
  const siteDomain = data.websiteSlug 
    ? `${data.websiteSlug}.${config.platform.websiteUrl.replace(/^https?:\/\//, '')}`
    : `mysalon.${config.platform.websiteUrl.replace(/^https?:\/\//, '')}`;

  return (
    <div className="w-full space-y-6 pb-16">
      {/* 1. TOP HEADER - STICKY ACTION BAR */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">Branding & White-label</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#ac0053] to-[#3f001a] text-white text-[10px] font-black uppercase tracking-widest shadow-sm">
              <Sparkles className="w-3 h-3" /> Premium
            </span>
          </div>
          <p className="text-xs md:text-sm text-gray-500">Make your salon website truly yours — custom logo, favicon, SEO metadata, social share cards, and white-label output.</p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs md:text-sm font-bold shadow-sm transition-all active:scale-95 shrink-0 ${
            savedTick ? 'bg-emerald-600 text-white' : 'bg-[#ac0053] hover:bg-[#ba005b] text-white'
          }`}
        >
          {savedTick ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
          {savedTick ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN — SETTINGS */}
        <div className="xl:col-span-2 space-y-6 min-w-0">
          
          {/* SEO & SOCIAL SHARING SECTION */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900">SEO & Social Share Settings</h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Google & Social
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Control how your salon appears in Google search results and when shared on WhatsApp, Facebook, and Instagram.</p>
                </div>
              </div>
            </div>

            {/* Meta Description Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-gray-500" />
                  Site Meta Description
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={generateAutoDescription}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#ac0053] hover:text-[#8c0043] bg-[#ac0053]/5 hover:bg-[#ac0053]/10 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <Wand2 className="w-3 h-3" /> Auto-Generate
                  </button>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${descStatus.color}`}>
                    {descStatus.label}
                  </span>
                </div>
              </div>
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Enter a compelling 120-160 character description of your salon's services, location, and specialties..."
                rows={3}
                className="w-full text-xs text-gray-900 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053] transition-all"
              />
              <p className="text-[11px] text-gray-400">
                This snippet is shown underneath your website title in Google search results and in chat link previews on WhatsApp and iMessage.
              </p>
            </div>

            {/* Social Share Image (OG Image) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-gray-500" />
                  Social Share Image (Open Graph / WhatsApp Thumbnail)
                </label>
                <span className="text-[10px] text-gray-400 font-medium">Recommended: 1200 × 630px (1.91:1)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-gray-50/70 p-4 rounded-xl border border-gray-100">
                {/* Image Preview Box */}
                <div className="md:col-span-1 aspect-[1.91/1] rounded-lg overflow-hidden bg-gray-200 border border-gray-200 relative flex items-center justify-center group shadow-inner">
                  {socialShareImageUrl ? (
                    <>
                      <img
                        src={socialShareImageUrl}
                        alt="Social share preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => socialImageInputRef.current?.click()}
                          className="p-1.5 bg-white text-gray-800 rounded-lg shadow hover:bg-gray-100"
                          title="Change image"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSocialShareImageUrl('');
                            notify('Social share image removed');
                          }}
                          className="p-1.5 bg-rose-600 text-white rounded-lg shadow hover:bg-rose-700"
                          title="Remove image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-3 text-center text-gray-400">
                      <ImageIcon className="w-6 h-6 mb-1 text-gray-300" />
                      <span className="text-[10px] font-semibold">No custom image</span>
                    </div>
                  )}
                </div>

                {/* Upload & Options */}
                <div className="md:col-span-2 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={socialImageInputRef}
                      type="file"
                      accept={IMAGE_UPLOAD_ACCEPT_ATTR}
                      className="hidden"
                      onChange={(e) => handleFile(e.target.files?.[0], 'social')}
                    />
                    <button
                      type="button"
                      onClick={() => socialImageInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 shadow-sm transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-gray-500" />
                      {socialShareImageUrl ? 'Replace Image' : 'Upload Social Image'}
                    </button>
                    {data.heroImageUrl && socialShareImageUrl !== data.heroImageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setSocialShareImageUrl(data.heroImageUrl || '');
                          notify('Hero photo applied as social share image');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg text-xs font-bold text-sky-700 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Use Hero Photo
                      </button>
                    )}
                    {socialShareImageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setSocialShareImageUrl('');
                          notify('Social share image cleared');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Supports PNG, JPG, or WebP. When customers or friends share your link on WhatsApp, Facebook, or Twitter, this image is featured prominently as the link preview.
                  </p>
                </div>
              </div>
            </div>

            {/* Advanced SEO Toggle */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvancedSeo(!showAdvancedSeo)}
                className="text-xs font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1.5 transition-colors"
              >
                <Layers className="w-3.5 h-3.5 text-gray-400" />
                {showAdvancedSeo ? 'Hide Advanced SEO Settings' : 'Show Advanced SEO Settings (Title & Keywords)'}
              </button>

              {showAdvancedSeo && (
                <div className="mt-4 p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-4">
                  {/* Meta Title */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-700">SEO Page Title</label>
                      <span className="text-[10px] text-gray-400 font-medium">{metaTitle.length}/70 chars</span>
                    </div>
                    <input
                      type="text"
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      placeholder="e.g. Nexora Demo Salon | Luxury Hair & Spa in Mumbai"
                      className="w-full text-xs text-gray-900 border border-gray-200 bg-white rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053]"
                    />
                  </div>

                  {/* Keywords */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700">SEO Keywords (comma-separated)</label>
                    <input
                      type="text"
                      value={metaKeywords}
                      onChange={(e) => setMetaKeywords(e.target.value)}
                      placeholder="e.g. hair salon, facial spa, bridal makeup, haircut, mumbai beauty"
                      className="w-full text-xs text-gray-900 border border-gray-200 bg-white rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053]"
                    />
                    <p className="text-[10px] text-gray-400">Targeted search keywords help search bots index your core specialty services.</p>
                  </div>
                </div>
              )}
            </div>

            {/* LIVE SEO PREVIEW WIDGET */}
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-gray-400" />
                  Live Search & Social Preview
                </span>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setActiveSeoPreviewTab('google')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                      activeSeoPreviewTab === 'google'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Google Search
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSeoPreviewTab('social')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                      activeSeoPreviewTab === 'social'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    WhatsApp / Social Card
                  </button>
                </div>
              </div>

              {activeSeoPreviewTab === 'google' ? (
                /* Google Search Snippet Card */
                <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden shrink-0 border border-gray-200">
                      {faviconDataUrl || logoDataUrl ? (
                        <img src={faviconDataUrl || logoDataUrl || ''} alt="favicon" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-black text-[#ac0053]">{brandName.charAt(0) || 'N'}</span>
                      )}
                    </div>
                    <div className="text-[11px] leading-tight text-gray-600 truncate">
                      <span className="font-semibold text-gray-900">{brandName || 'Salon'}</span>
                      <span className="text-gray-400 mx-1">›</span>
                      <span className="text-gray-500">{siteDomain}</span>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold text-[#1a0dab] hover:underline cursor-pointer leading-snug">
                    {metaTitle || `${brandName} | Luxury Salon & Spa in ${city}`}
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                    {metaDescription || 'Experience luxury salon, beauty and wellness services. Book appointments online effortlessly.'}
                  </p>
                </div>
              ) : (
                /* WhatsApp / Social Share Card Preview */
                <div className="max-w-md mx-auto bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="aspect-[1.91/1] w-full bg-gray-200 overflow-hidden relative flex items-center justify-center">
                    {socialShareImageUrl || data.heroImageUrl ? (
                      <img
                        src={socialShareImageUrl || data.heroImageUrl}
                        alt="Social share preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <Share2 className="w-8 h-8 mb-1 text-gray-300" />
                        <span className="text-[10px] font-semibold">Upload an image to see social preview</span>
                      </div>
                    )}
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[9px] font-bold">
                      PREVIEW
                    </span>
                  </div>
                  <div className="p-3 bg-white border-t border-gray-100 space-y-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      {siteDomain}
                    </span>
                    <h4 className="text-xs font-bold text-gray-900 leading-snug line-clamp-1">
                      {metaTitle || brandName}
                    </h4>
                    <p className="text-[11px] text-gray-500 leading-normal line-clamp-2">
                      {metaDescription || 'Book premium salon and spa appointments online.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Custom Logo */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#ac0053]/10 border border-[#ac0053]/20 flex items-center justify-center text-[#ac0053]">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Custom Salon Logo</h2>
                  <p className="text-xs text-gray-500">Replaces all placeholder logos in your website header, booking screens, and invoice receipts.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-gray-50/70 p-4 rounded-xl border border-gray-100">
              <div className="w-20 h-20 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                {logoDataUrl ? (
                  <img src={logoDataUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="text-center p-2">
                    <ImageIcon className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                    <span className="text-[9px] font-bold text-gray-400 uppercase">No Logo</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-center sm:text-left flex-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept={IMAGE_UPLOAD_ACCEPT_ATTR}
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0], 'logo')}
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 shadow-sm transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-gray-500" />
                    Upload Logo
                  </button>
                  {logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoDataUrl(null);
                        notify('Logo removed');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">Recommended: Square or horizontal PNG/SVG with transparent background (max 2MB).</p>
              </div>
            </div>
          </div>

          {/* Favicon */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Custom Favicon</h2>
                  <p className="text-xs text-gray-500">The icon shown in browser tabs, bookmarks, and mobile home-screen shortcuts.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-gray-50/70 p-4 rounded-xl border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                {faviconDataUrl ? (
                  <img src={faviconDataUrl} alt="Favicon" className="w-8 h-8 object-contain" />
                ) : (
                  <span className="w-8 h-8 rounded-lg bg-[#ac0053] flex items-center justify-center text-white text-xs font-black">
                    {brandName.charAt(0) || 'N'}
                  </span>
                )}
              </div>

              <div className="space-y-2 text-center sm:text-left flex-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/png,image/x-icon,image/svg+xml"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0], 'favicon')}
                  />
                  <button
                    type="button"
                    onClick={() => faviconInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 shadow-sm transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-gray-500" />
                    Upload Favicon
                  </button>
                  {faviconDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setFaviconDataUrl(null);
                        notify('Favicon reset to default');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Reset to Default
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">Recommended: 32×32 or 64×64 PNG/ICO. If empty, a stylized initial icon is generated automatically.</p>
              </div>
            </div>
          </div>

          {/* Hide Nexora Branding Toggle */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900">White-label Mode</h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">100% Whitelabel</span>
                  </div>
                  <p className="text-xs text-gray-500">Remove all "Powered by Nexora" badges from your website footer and customer booking confirmations.</p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={hideBranding}
                  onChange={(e) => {
                    setHideBranding(e.target.checked);
                    notify(e.target.checked ? 'White-label mode enabled' : 'White-label mode disabled');
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ac0053]"></div>
              </label>
            </div>
          </div>

          {/* Business Information */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Business Identity</h2>
                <p className="text-xs text-gray-500">Official salon details displayed across all customer-facing touchpoints.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Salon Name</label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Tagline / Slogan</label>
                <input
                  type="text"
                  value={brandTagline}
                  onChange={(e) => setBrandTagline(e.target.value)}
                  className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-gray-400" /> Contact Email
                </label>
                <input
                  type="email"
                  value={brandEmail}
                  onChange={(e) => setBrandEmail(e.target.value)}
                  placeholder="contact@yoursalon.com"
                  className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-gray-400" /> Contact Phone / WhatsApp
                </label>
                <input
                  type="text"
                  value={brandPhone}
                  onChange={(e) => setBrandPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053]"
                />
              </div>
            </div>
          </div>

          {/* Location & Currency */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Location & Currency</h2>
                <p className="text-xs text-gray-500">Configure your operating country, primary city, and currency formatting for packages and services.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053]"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className="w-full text-xs text-gray-900 border border-gray-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#ac0053]/20 focus:border-[#ac0053]"
                >
                  {Object.entries(CURRENCY_SYMBOLS).map(([code, sym]) => (
                    <option key={code} value={code}>{code} ({sym})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN — LIVE PREVIEW & CHECKLIST */}
        <div className="xl:sticky xl:top-28 space-y-4">
          
          {/* Live Preview Card with Switcher */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-bold text-gray-700">Preview Hub</span>
              </div>
              <div className="flex items-center bg-gray-200/60 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setRightPanelTab('website')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    rightPanelTab === 'website' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Website
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelTab('social')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    rightPanelTab === 'social' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Social Card
                </button>
              </div>
            </div>

            {rightPanelTab === 'website' ? (
              /* Mock Website Browser */
              <div className="p-5 bg-gradient-to-br from-[#3f001a] via-[#6d0b38] to-[#ac0053]">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center overflow-hidden shrink-0">
                      {logoDataUrl ? (
                        <img src={logoDataUrl} alt="logo" className="w-full h-full object-cover" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-white" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-black text-white leading-tight">{brandName || 'Your Salon'}</p>
                      <p className="text-[10px] text-white/60 font-semibold truncate max-w-[180px]">{brandTagline}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-white/70 bg-white/10 border border-white/20 px-2.5 py-1 rounded-full">Book Now</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5">
                    <span className="text-[11px] font-semibold text-white/80">Nourishing Hair Spa</span>
                    <span className="text-xs font-black text-white">{symbol}599</span>
                  </div>
                  <div className="flex justify-between items-center bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5">
                    <span className="text-[11px] font-semibold text-white/80">Signature Facial</span>
                    <span className="text-xs font-black text-white">{symbol}1,200</span>
                  </div>
                  <div className="flex justify-between items-center bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5">
                    <span className="text-[11px] font-semibold text-white/80">HD Bridal Makeup</span>
                    <span className="text-xs font-black text-white">{symbol}4,500</span>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-white/15 flex items-center justify-between">
                  <p className="text-[10px] text-white/50 font-semibold">Prices in {currency}</p>
                  {!hideBranding ? (
                    <span className="text-[10px] font-bold text-white/70 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#ffd9e1]" /> Powered by Nexora
                    </span>
                  ) : (
                    <span className="text-[10px] font-black text-emerald-300 bg-emerald-400/15 px-2 py-0.5 rounded-full border border-emerald-300/30 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> White-label ON
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* Social Share Link Preview */
              <div className="p-4 bg-gray-100">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="aspect-[1.91/1] w-full bg-gray-200 relative flex items-center justify-center overflow-hidden">
                    {socialShareImageUrl || data.heroImageUrl ? (
                      <img
                        src={socialShareImageUrl || data.heroImageUrl}
                        alt="Social preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-center p-3 text-gray-400">
                        <Share2 className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                        <span className="text-[10px] font-semibold">Upload an image to preview</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{siteDomain}</p>
                    <p className="text-xs font-bold text-gray-900 line-clamp-1">{metaTitle || brandName}</p>
                    <p className="text-[10px] text-gray-500 line-clamp-2">{metaDescription}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Preview meta */}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1.5">
                <Smartphone className="w-3 h-3" /> Mobile & desktop ready
              </span>
              <span className="text-[10px] font-semibold text-gray-400">{siteDomain}</span>
            </div>
          </div>

          {/* What's included checklist */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
            <h3 className="text-xs font-black text-gray-900 mb-3 flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-[#ac0053]" /> What's included
            </h3>
            <ul className="space-y-2 text-[11px] font-semibold text-gray-600">
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Custom SEO meta descriptions for Google ranking</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Open Graph social share image (WhatsApp / FB)</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Custom logo on website & bookings</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Custom favicon in browser tabs</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Remove "Powered by Nexora" everywhere</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Localized currency & location display</li>
            </ul>
          </div>

        </div>
      </div>

      {/* STICKY BOTTOM ACTION BAR */}
      <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-gray-200 shadow-xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${savedTick ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-[#ac0053]'}`}></span>
          <span className="text-xs font-semibold text-gray-700 hidden sm:inline">
            {savedTick ? 'All branding, SEO & identity settings are up to date' : 'Unsaved changes will be applied to your live website and search previews'}
          </span>
          <span className="text-xs font-semibold text-gray-700 sm:hidden">
            {savedTick ? 'Settings Saved' : 'Branding & SEO'}
          </span>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs md:text-sm font-bold shadow-md transition-all active:scale-95 shrink-0 ${
            savedTick ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-[#ac0053] hover:bg-[#ba005b] text-white'
          }`}
        >
          {savedTick ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
          {savedTick ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
