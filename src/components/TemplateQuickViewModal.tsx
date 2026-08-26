import React, { useState } from 'react';
import { ThemeId, THEME_LABELS } from '../lib/themeServices';
import {
  OWNER_TEMPLATES,
  switchSalonTemplatePresentation,
} from '../lib/templateConfig';
import { SalonData } from '../types';
import TemplateRenderer from './TemplateRenderer';
import {
  X,
  Palette,
  Layout,
  CheckCircle2,
  Sparkles,
  Type,
  Monitor,
  Smartphone,
  ArrowRight,
  Check,
  Eye,
} from 'lucide-react';

interface Props {
  themeId: ThemeId | null;
  data: SalonData;
  onClose: () => void;
  onApply?: (id: ThemeId) => void;
  isActive?: boolean;
}

export const THEME_DETAILS: Record<
  ThemeId,
  {
    appearanceMode: string;
    description: string;
    recommendedFor: string[];
    typography: string;
    colorPalette: Array<{ name: string; hex: string; role: string }>;
    layoutHighlights: Array<{ title: string; desc: string }>;
  }
> = {
  barber_mens_grooming: {
    appearanceMode: 'Dark Luxury & Gold',
    description:
      'A commanding, high-contrast dark aesthetic tailored for barbershops and men’s grooming lounges with gold accents and sharp typography.',
    recommendedFor: ["Barber Shops", "Men's Grooming Lounges", "Beard & Hair Studios"],
    typography: 'Oswald Bold Display & Inter Sans',
    colorPalette: [
      { name: 'Dark Charcoal', hex: '#1a1c1e', role: 'Main Background' },
      { name: 'Vintage Gold', hex: '#c59b27', role: 'Primary Accent & Buttons' },
      { name: 'Warm Off-White', hex: '#f4efe6', role: 'Headings & Text' },
      { name: 'Slate Charcoal', hex: '#2a2d32', role: 'Service Cards & Modals' },
    ],
    layoutHighlights: [
      {
        title: 'Dark Full-Width Hero',
        desc: 'Impactful dark hero header with immediate appointment booking call-to-action.',
      },
      {
        title: 'Split Service Cards',
        desc: 'Haircut and beard sculpting breakdown with service duration tags & price badges.',
      },
      {
        title: 'Barber Team Showcase',
        desc: 'Grid layout highlighting individual master barbers and their Instagram work.',
      },
      {
        title: 'Gold Accent Controls',
        desc: 'Sticky booking CTA bar with custom gold theme highlight accents.',
      },
    ],
  },
  hair_studio_color_bar: {
    appearanceMode: 'Editorial Light Minimalism',
    description:
      'Warm, modern editorial layout designed for luxury hair studios, master colorists, and balayage specialists looking for an understated aesthetic.',
    recommendedFor: ['Hair Color Studios', 'Stylist Collectives', 'Luxury Hair Salons'],
    typography: 'Playfair Display Serif & Plus Jakarta Sans',
    colorPalette: [
      { name: 'Off-White Studio', hex: '#fafafa', role: 'Clean Background' },
      { name: 'Editorial Rose', hex: '#e11d48', role: 'Primary Accent' },
      { name: 'Soft Blush', hex: '#fdf2f8', role: 'Card & Section Background' },
      { name: 'Midnight Charcoal', hex: '#0f172a', role: 'Typography & Headers' },
    ],
    layoutHighlights: [
      {
        title: 'Centered Modern Hero',
        desc: 'Spacious, editorial hero with elegant serif typography and studio imagery.',
      },
      {
        title: 'Color Bar Showcase',
        desc: 'Dedicated category grid for balayage, highlights, and hair treatment packages.',
      },
      {
        title: 'Lookbook Portfolio Grid',
        desc: 'High-res image masonry gallery displaying before-and-after transformations.',
      },
      {
        title: 'Floating Direct Action',
        desc: 'Subtle floating booking launcher and instant WhatsApp consultation button.',
      },
    ],
  },
  beauty_skin_spa: {
    appearanceMode: 'Botanical Sanctuary Light',
    description:
      'A serene, nature-inspired spa theme with organic rounded shapes, soothing emerald tones, and peaceful skincare treatment layouts.',
    recommendedFor: ['Skincare & Facial Clinics', 'Day Spas & Wellness Centers', 'Aesthetic Salons'],
    typography: 'Cormorant Garamond & Outfit Sans',
    colorPalette: [
      { name: 'Botanical Emerald', hex: '#059669', role: 'Primary Brand Accent' },
      { name: 'Soft Mint', hex: '#ecfdf5', role: 'Subtle Background Highlight' },
      { name: 'Warm Ivory', hex: '#fefce8', role: 'Section Accent Tint' },
      { name: 'Deep Forest', hex: '#064e3b', role: 'Headers & Dark Badges' },
    ],
    layoutHighlights: [
      {
        title: 'Curved Sanctuary Cards',
        desc: 'Soft, rounded card containers promoting calm and holistic skincare presentation.',
      },
      {
        title: 'Holistic Treatment List',
        desc: 'Comprehensive skincare & facial catalog with step-by-step treatment details.',
      },
      {
        title: 'Tranquil Photo Gallery',
        desc: 'Spacious grid showcasing peaceful spa interiors and relaxation rooms.',
      },
      {
        title: 'Calm Booking Summary',
        desc: 'Green-tinted booking summary card with clear deposit & policy notes.',
      },
    ],
  },
  family_full_service: {
    appearanceMode: 'Bright Community Light',
    description:
      'A friendly, highly accessible family layout built for all-in-one salons offering haircuts and grooming for men, women, and children.',
    recommendedFor: ['Full-Service Family Salons', 'Unisex Beauty Salons', 'Community Hair Chains'],
    typography: 'Figtree & DM Sans',
    colorPalette: [
      { name: 'Royal Slate Blue', hex: '#2563eb', role: 'Primary Brand Accent' },
      { name: 'Ice Blue Tint', hex: '#eff6ff', role: 'Header & Card Highlight' },
      { name: 'Pure White', hex: '#ffffff', role: 'Main Background' },
      { name: 'Navy Slate', hex: '#1e3a8a', role: 'Text & Navigation Headers' },
    ],
    layoutHighlights: [
      {
        title: 'Audience Filter Tabs',
        desc: 'Quick toggle filters for Men, Women, Kids, and Family Combo deals.',
      },
      {
        title: 'Clear Service Matrix',
        desc: 'Side-by-side service catalog with upfront pricing and family discounts.',
      },
      {
        title: 'Prominent Location Map',
        desc: 'High-visibility location map preview and detailed operating hours list.',
      },
      {
        title: 'Direct Call & WA Action',
        desc: 'Large touch-friendly Call and WhatsApp booking action buttons.',
      },
    ],
  },
  nail_lash_studio: {
    appearanceMode: 'Chic Boutique Light',
    description:
      'A vibrant, stylish boutique theme designed for nail artists, lash technicians, and brow studios highlighting creative nail art portfolios.',
    recommendedFor: ['Nail Bars & Art Studios', 'Lash & Brow Boutiques', 'Beauty Lash Lounges'],
    typography: 'Syne Display & Urbanist Sans',
    colorPalette: [
      { name: 'Chic Magenta', hex: '#db2777', role: 'Primary Accent & Buttons' },
      { name: 'Pastel Pearl', hex: '#fdf2f8', role: 'Card Container Fill' },
      { name: 'Soft Rose', hex: '#fff1f2', role: 'Badge & Banner Background' },
      { name: 'Berry Wine', hex: '#831843', role: 'Dark Headlines & Icons' },
    ],
    layoutHighlights: [
      {
        title: 'Nail Art Lookbook Grid',
        desc: 'Instagram-style visual gallery displaying gel art, acrylics, and lash styles.',
      },
      {
        title: 'Tiered Package Cards',
        desc: 'Clear tier pricing for Gel Manicure, Extensions, Lash Lifts, and Combos.',
      },
      {
        title: 'Duration & Tier Badges',
        desc: 'Pill-shaped duration badges highlighting appointment time lengths.',
      },
      {
        title: 'Vibrant Boutique CTA',
        desc: 'High-conversion booking controls styled with chic magenta accents.',
      },
    ],
  },
};

export default function TemplateQuickViewModal({
  themeId,
  data,
  onClose,
  onApply,
  isActive = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'preview'>('overview');
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');

  if (!themeId) return null;

  const themeMeta = OWNER_TEMPLATES.find((t) => t.id === themeId);
  const details = THEME_DETAILS[themeId] || THEME_DETAILS.barber_mens_grooming;

  // Prepare presentation data without mutating main state
  const presentedData = switchSalonTemplatePresentation(data, themeId);

  return (
    <div
      aria-modal="true"
      role="dialog"
      data-testid={`quickview-modal-${themeId}`}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 sm:p-6 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl">
        {/* Top Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              className="h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: themeMeta?.accent || '#ac0053' }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900">
                  {themeMeta?.name || THEME_LABELS[themeId]}
                </h3>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-gray-700">
                  {themeMeta?.category}
                </span>
                {isActive && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" /> Currently Active
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">{details.appearanceMode}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab switch inside modal */}
            <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === 'overview'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Layout className="h-3.5 w-3.5" /> Specs & Colors
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                aria-label="Live Demo Preview"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Eye className="h-3.5 w-3.5 text-[#ac0053]" /> Live Demo
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Quick View"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Banner / Hero Preview image */}
              <div className="relative h-48 w-full overflow-hidden rounded-2xl border border-gray-100 bg-gray-900 sm:h-56">
                <img
                  src={themeMeta?.image}
                  alt={themeMeta?.name}
                  className="h-full w-full object-cover opacity-85"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-6 flex flex-col justify-end">
                  <span
                    className="mb-2 w-fit rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-xs"
                    style={{ backgroundColor: themeMeta?.accent || '#ac0053' }}
                  >
                    {details.appearanceMode}
                  </span>
                  <h4 className="text-xl font-black text-white sm:text-2xl">{themeMeta?.name}</h4>
                  <p className="mt-1 text-xs text-gray-200 max-w-xl">{themeMeta?.tagline}</p>
                </div>
              </div>

              {/* Description */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500">About this design</h5>
                <p className="mt-1.5 text-sm text-gray-700 leading-relaxed">{details.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500">Recommended for:</span>
                  {details.recommendedFor.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-2xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Color Scheme & Palette Section */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
                <div className="flex items-center gap-2 mb-4">
                  <Palette className="h-4 w-4 text-[#ac0053]" />
                  <h4 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">
                    Color Scheme & Theme Palette
                  </h4>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {details.colorPalette.map((color) => (
                    <div
                      key={color.hex + color.name}
                      className="flex flex-col rounded-xl border border-gray-100 bg-gray-50/60 p-3 transition-all hover:bg-white hover:shadow-xs"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="h-7 w-7 rounded-lg border border-black/10 shadow-inner"
                          style={{ backgroundColor: color.hex }}
                        />
                        <div>
                          <p className="text-xs font-bold text-gray-900">{color.name}</p>
                          <code className="text-[10px] text-gray-500 font-mono">{color.hex}</code>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-auto">{color.role}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Layout Highlights & Typography */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs">
                  <div className="flex items-center gap-2 mb-4">
                    <Layout className="h-4 w-4 text-[#ac0053]" />
                    <h4 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">
                      Layout Highlights
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {details.layoutHighlights.map((hl) => (
                      <div key={hl.title} className="flex gap-2.5">
                        <Sparkles className="h-4 w-4 shrink-0 text-[#ac0053] mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-gray-900">{hl.title}</p>
                          <p className="text-[11px] text-gray-500">{hl.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Type className="h-4 w-4 text-[#ac0053]" />
                      <h4 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">
                        Typography Pairing
                      </h4>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs font-semibold text-gray-500">Font System</p>
                      <p className="text-sm font-bold text-gray-900 mt-1">{details.typography}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        Optimized for legibility across desktop, tablet, and mobile browsers.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Live Interactive Preview</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className="text-xs font-bold text-[#ac0053] hover:underline flex items-center gap-1"
                    >
                      Open Live Demo <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Live Demo Tab */
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-gray-100 p-2">
                <span className="text-xs font-semibold text-gray-600 px-2">
                  Showing live preview with current salon data:
                </span>
                <div className="flex rounded-lg bg-white p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setDeviceMode('desktop')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium ${
                      deviceMode === 'desktop'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Monitor className="h-3.5 w-3.5" /> Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeviceMode('mobile')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium ${
                      deviceMode === 'mobile'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" /> Mobile
                  </button>
                </div>
              </div>

              <div className="min-h-[450px] w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 overflow-hidden relative flex justify-center">
                <TemplateRenderer
                  data={presentedData}
                  mode={deviceMode}
                  renderMode="owner-preview"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-gray-50/80 px-6 py-4">
          <div className="text-xs text-gray-500">
            {isActive ? (
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> This template is currently active
              </span>
            ) : (
              <span>Viewing template specs without altering active selection.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
            >
              Close
            </button>
            {onApply && !isActive && (
              <button
                type="button"
                onClick={() => {
                  onApply(themeId);
                  onClose();
                }}
                className="flex items-center gap-2 rounded-xl bg-[#ac0053] px-6 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#ba005b] shadow-xs"
              >
                <span>Apply This Template</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
