import React, { useRef, useState } from 'react';
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
} from 'lucide-react';
import { SalonData } from '../types';
import { useBrandConfig, updateBrandConfig } from '../config/brandConfig';

interface Props {
  data: SalonData;
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

export default function BrandingWhiteLabel({ data, onNotify }: Props) {
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
  const [savedTick, setSavedTick] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const symbol = CURRENCY_SYMBOLS[currency];
  const notify = (msg: string) => {
    if (onNotify) onNotify(msg);
  };

  const handleFile = (file: File | undefined, kind: 'logo' | 'favicon') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (kind === 'logo') {
        setLogoDataUrl(result);
        notify('Custom logo uploaded');
      } else {
        setFaviconDataUrl(result);
        notify('Favicon uploaded');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    setSavedTick(true);
    updateBrandConfig((prev) => ({
      ...prev,
      platform: {
        ...prev.platform,
        hidePlatformBranding: hideBranding,
        faviconUrl: faviconDataUrl || '',
      },
      defaultSalon: {
        ...prev.defaultSalon,
        name: brandName,
        tagline: brandTagline,
        email: brandEmail,
        phone: brandPhone,
        address: {
          ...prev.defaultSalon.address,
          city,
        },
      },
      theme: {
        ...prev.theme,
        currency,
        currencySymbol: symbol,
        country,
      },
    }));
    setTimeout(() => setSavedTick(false), 2000);
    notify('Branding & white-label settings saved');
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Branding & White-label</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#ac0053] to-[#3f001a] text-white text-[10px] font-black uppercase tracking-widest shadow-sm">
              <Sparkles className="w-3 h-3" /> Premium
            </span>
          </div>
          <p className="text-xs md:text-sm text-gray-500">Make your salon website truly yours — custom logo, favicon, and fully white-label output.</p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors ${
            savedTick ? 'bg-emerald-600 text-white' : 'bg-[#ac0053] hover:bg-[#ba005b] text-white'
          }`}
        >
          {savedTick ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
          {savedTick ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* LEFT COLUMN — SETTINGS */}
        <div className="xl:col-span-2 space-y-4 min-w-0">
          {/* Custom Logo */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#ac0053]/10 text-[#ac0053] flex items-center justify-center"><Palette className="w-4 h-4" /></span>
                Custom Logo
              </h2>
              <span className="text-[10px] font-black text-[#ac0053] bg-[#ffd9e1]/50 px-2 py-0.5 rounded-full uppercase tracking-widest">Premium</span>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                {logoDataUrl ? (
                  <img src={logoDataUrl} alt="Logo preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-gray-300" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-semibold text-gray-700">Shown on your live website header, booking confirmations and QR posters.</p>
                <p className="text-[11px] text-gray-400">PNG or JPG with transparent background works best. Recommended 512×512px.</p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#ac0053] hover:bg-[#ba005b] text-white text-xs font-bold transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Logo
                  </button>
                  {logoDataUrl && (
                    <button
                      onClick={() => { setLogoDataUrl(null); notify('Logo removed'); }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 text-xs font-bold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0], 'logo')}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Favicon */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><ImageIcon className="w-4 h-4" /></span>
                Favicon
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                {faviconDataUrl ? (
                  <img src={faviconDataUrl} alt="Favicon preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#ac0053] to-[#3f001a]" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-semibold text-gray-700">The small icon shown in your customers' browser tab.</p>
                <p className="text-[11px] text-gray-400">Square image recommended. 64×64px or larger.</p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => faviconInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:border-[#ac0053]/30 hover:text-[#ac0053] text-xs font-bold transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Favicon
                  </button>
                  {faviconDataUrl && (
                    <button
                      onClick={() => { setFaviconDataUrl(null); notify('Favicon removed'); }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 text-xs font-bold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0], 'favicon')}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Hide Nexora Branding */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><Shield className="w-4 h-4" /></span>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Hide Nexora Branding</h2>
                  <p className="text-[11px] text-gray-400 mt-0.5 max-w-md">Remove the "Powered by Nexora" footer and all platform mentions for a fully white-label experience.</p>
                </div>
              </div>
              <button
                onClick={() => { setHideBranding(!hideBranding); notify(hideBranding ? 'Nexora branding shown again' : 'White-label mode ON — Nexora branding hidden'); }}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${hideBranding ? 'bg-[#ac0053]' : 'bg-gray-200'}`}
                aria-pressed={hideBranding}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${hideBranding ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            {hideBranding && (
              <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                <BadgeCheck className="w-4 h-4" /> White-label active — your website is 100% yours. No platform mentions anywhere.
              </div>
            )}
          </div>

          {/* Business Info */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#ac0053]/10 text-[#ac0053] flex items-center justify-center"><Globe className="w-4 h-4" /></span>
              Business Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Salon Name</label>
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/20 outline-none"
                  placeholder="Nexora Lumina"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Tagline</label>
                <input
                  value={brandTagline}
                  onChange={(e) => setBrandTagline(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/20 outline-none"
                  placeholder="Premium Salon & Spa Experience"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Contact Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={brandEmail}
                    onChange={(e) => setBrandEmail(e.target.value)}
                    type="email"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/20 outline-none"
                    placeholder="hello@nexoralumina.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Contact Phone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={brandPhone}
                    onChange={(e) => setBrandPhone(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] focus:ring-1 focus:ring-[#ac0053]/20 outline-none"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Location & Currency */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Landmark className="w-4 h-4" /></span>
              Location & Currency
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none focus:border-[#ac0053]"
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">City</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-[#ac0053] outline-none"
                    placeholder="Mumbai"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white outline-none focus:border-[#ac0053]"
                >
                  <option value="INR">INR — Indian Rupee (₹)</option>
                  <option value="USD">USD — US Dollar ($)</option>
                  <option value="AED">AED — UAE Dirham (د.إ)</option>
                  <option value="EUR">EUR — Euro (€)</option>
                  <option value="GBP">GBP — British Pound (£)</option>
                  <option value="SGD">SGD — Singapore Dollar (S$)</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Prices will display as</span>
              <span className="text-sm font-black text-[#ac0053]">{symbol}599</span>
              <span className="text-[11px] text-gray-500 font-semibold">Hair Spa — {city || 'Mumbai'}, {country}</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — LIVE PREVIEW */}
        <div className="xl:sticky xl:top-4 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-bold text-gray-600">Live Website Preview</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                <Eye className="w-3 h-3" /> Live
              </span>
            </div>

            {/* Mock browser */}
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
                <p className="text-[10px] text-white/50 font-semibold">Salon prices in {currency}</p>
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

            {/* Preview meta */}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1.5">
                <Smartphone className="w-3 h-3" /> Mobile & desktop ready
              </span>
              <span className="text-[10px] font-semibold text-gray-400">{data.websiteSlug ? `${config.platform.websiteUrl.replace(/^https?:\/\//, '')}/${data.websiteSlug}` : 'your-site.salon'}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
            <h3 className="text-xs font-black text-gray-900 mb-3 flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-[#ac0053]" /> What's included
            </h3>
            <ul className="space-y-2 text-[11px] font-semibold text-gray-600">
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Custom logo on website & bookings</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Custom favicon in browser tabs</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Remove "Powered by Nexora" everywhere</li>
              <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Localized currency & location display</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
