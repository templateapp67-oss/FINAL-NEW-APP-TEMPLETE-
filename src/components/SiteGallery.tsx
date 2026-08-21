/**
 * PHASE 14.1 — GALLERY & VISUAL PORTFOLIO section (one shared component,
 * five themed designs).
 *
 * The single gallery architecture every theme renders. Content comes ONLY
 * from `src/lib/siteGallery.ts` (owner photos → active-theme service photos →
 * registered theme media) so no theme can ever display another theme's
 * portfolio. Each theme keeps its own visual identity through the internal
 * `galleryStyle(themeId, appearance)` resolver (surfaces, shapes, chips,
 * lightbox chrome).
 *
 * UI features:
 *   - Featured image banner (first `featured` item)
 *   - Responsive image grid (desktop → tablet → mobile via `siteGrid`)
 *   - Category filter chips (theme vocabulary + Before & After)
 *   - Full-screen lightbox with previous/next navigation, counter and caption
 *   - Before/After slider view for configured pairs
 *
 * PHASE 14.3 — GALLERY VIEWER upgrades to the shared lightbox (no duplicate
 * viewer system):
 *   - Mobile swipe left/right + touch-friendly controls + safe-area spacing
 *   - Page scroll lock, focus trap + focus restore, keyboard navigation
 *   - Skeleton while the full-size image loads; only the active image is
 *     mounted (adjacent preload only) — never the whole gallery at once
 *   - Viewer state resets on theme/data switch (no stale previous-theme media)
 *
 * Media safety: only URLs that pass the existing `isSafeMediaUrl` gate reach
 * a `src`; every image renders through the existing `SiteImage` performance
 * system (lazy loading, responsive srcSet, fixed aspect ratios, skeleton,
 * error fallback) and carries accessible alt text.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, TouchEvent as ReactTouchEvent } from 'react';
import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, Instagram, Leaf, Maximize2, Scissors, Sparkles, Users, X } from 'lucide-react';
import type { SalonData, Service } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import type { AppLocale } from '../lib/locale';
import { openSiteBooking, openSiteBookingForService } from '../lib/siteBooking';
import SiteImage from './SiteImage';
import SiteServiceDetail from './SiteServiceDetail';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';
import { SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import type { StructurePalette } from './SiteSectionStates';
import { resolveSectionState, sectionProps, siteGrid } from '../lib/siteStructure';
import type { ViewportMode } from '../lib/siteStructure';
import { siteText } from '../lib/siteI18n';
import { structureText } from '../lib/siteStructureI18n';
import { galleryChrome, galleryCounter } from '../lib/siteGalleryI18n';
import type { GalleryChromeCopy } from '../lib/siteGalleryI18n';
import {
  filterGalleryItems,
  galleryCategoryLabel,
  galleryFeaturedItem,
  galleryFilterOptions,
  galleryItemsForTheme,
  galleryServiceForItem,
  galleryThemeConfig,
} from '../lib/siteGallery';
import type { GalleryItem } from '../lib/siteGallery';
import {
  BARBER_SURFACES,
  BEAUTY_SPA_SURFACES,
  FAMILY_SURFACES,
  HAIR_STUDIO_SURFACES,
  NAIL_LASH_SURFACES,
  surfacesOf,
} from '../lib/themeSurfaces';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  mode: ViewportMode;
}

/* ------------------------------------------------------------------ */
/* Per-theme visual identity                                           */
/* ------------------------------------------------------------------ */

interface GalleryVisualStyle {
  palette: StructurePalette;
  sectionBg: string;
  sectionClass: string;
  innerClass: string;
  headerLayout: 'center' | 'side';
  eyebrowClass: string;
  titleClass: string;
  bodyClass: string;
  showDivider: boolean;
  icon: ReactNode;
  tileRadius: string;
  bannerRadius: string;
  chipRadius: string;
  chipActive: { backgroundColor: string; color: string; borderColor: string };
  hoverGradient: string;
  badgeStyle: CSSProperties;
  instagramColor: string;
  lightbox: {
    bg: string;
    text: string;
    muted: string;
    accent: string;
    /** Text colour that stays readable on the accent (dark or light). */
    chipText: string;
    radius: string;
    buttonClass: string;
  };
}

function galleryStyle(themeId: SiteHeaderThemeId, appearance: 'light' | 'dark'): GalleryVisualStyle {
  switch (themeId) {
    case 'barber_mens_grooming': {
      const t = surfacesOf(BARBER_SURFACES, appearance);
      return {
        palette: { accent: t.gold, text: t.textStrong, muted: t.muted, card: t.card, line: t.line, invert: '#141414' },
        sectionBg: t.charcoal,
        sectionClass: 'px-6 py-14 border-t',
        innerClass: 'max-w-3xl mx-auto',
        headerLayout: 'center',
        eyebrowClass: 'text-[10px] font-bold uppercase tracking-[0.35em]',
        titleClass: 'text-2xl md:text-3xl font-black uppercase tracking-[0.05em] mt-2',
        bodyClass: 'text-xs',
        showDivider: true,
        icon: <Scissors className="w-4 h-4" style={{ color: t.gold }} />,
        tileRadius: 'rounded-none',
        bannerRadius: 'rounded-none',
        chipRadius: 'rounded-none',
        chipActive: { backgroundColor: t.gold, color: '#141414', borderColor: t.gold },
        hoverGradient: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
        badgeStyle: { backgroundColor: t.gold, color: '#141414' },
        instagramColor: t.gold,
        lightbox: { bg: 'rgba(12,12,12,0.96)', text: '#ffffff', muted: '#a6a49b', accent: t.gold, chipText: '#141414', radius: 'rounded-none', buttonClass: '' },
      };
    }
    case 'hair_studio_color_bar': {
      const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
      return {
        palette: { accent: t.roseDeep, text: t.ink, muted: t.muted, card: t.card, line: t.line, invert: '#ffffff' },
        sectionBg: t.paper,
        sectionClass: 'px-5 md:px-8 py-16 border-t',
        innerClass: 'max-w-3xl mx-auto',
        headerLayout: 'center',
        eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
        titleClass: 'text-2xl md:text-3xl font-serif mt-3',
        bodyClass: 'text-xs md:text-sm',
        showDivider: false,
        icon: <Sparkles className="w-4 h-4" style={{ color: t.roseDeep }} />,
        tileRadius: 'rounded-md',
        bannerRadius: 'rounded-md',
        chipRadius: 'rounded-full',
        chipActive: { backgroundColor: t.roseSoft, color: t.roseDeep, borderColor: t.roseSoft },
        hoverGradient: 'linear-gradient(to top, rgba(25,24,23,0.8), transparent)',
        badgeStyle: { backgroundColor: t.roseDeep, color: '#ffffff' },
        instagramColor: t.roseDeep,
        lightbox: { bg: 'rgba(25,24,23,0.96)', text: '#ffffff', muted: '#8c8782', accent: t.roseDeep, chipText: '#ffffff', radius: 'rounded-md', buttonClass: 'rounded-md' },
      };
    }
    case 'beauty_skin_spa': {
      const t = surfacesOf(BEAUTY_SPA_SURFACES, appearance);
      return {
        palette: { accent: t.emerald, text: t.textStrong, muted: t.muted, card: t.card, line: t.line, invert: '#ffffff' },
        sectionBg: t.cream,
        sectionClass: 'px-5 md:px-8 py-16',
        innerClass: 'max-w-3xl mx-auto',
        headerLayout: 'center',
        eyebrowClass: 'text-[10px] uppercase tracking-[0.4em] font-semibold',
        titleClass: 'text-2xl md:text-3xl font-serif mt-3',
        bodyClass: 'text-xs md:text-sm',
        showDivider: false,
        icon: <Leaf className="w-4 h-4" style={{ color: t.emerald }} />,
        tileRadius: 'rounded-[1.75rem]',
        bannerRadius: 'rounded-[1.75rem]',
        chipRadius: 'rounded-full',
        chipActive: { backgroundColor: t.emeraldSoft, color: t.emerald, borderColor: t.emeraldSoft },
        hoverGradient: 'linear-gradient(to top, rgba(21,89,74,0.7), transparent)',
        badgeStyle: { backgroundColor: t.emerald, color: '#ffffff' },
        instagramColor: t.emerald,
        lightbox: { bg: 'rgba(21,89,74,0.96)', text: '#ffffff', muted: '#c9d6cf', accent: t.emeraldMid, chipText: '#ffffff', radius: 'rounded-3xl', buttonClass: 'rounded-full' },
      };
    }
    case 'family_full_service': {
      const t = surfacesOf(FAMILY_SURFACES, appearance);
      return {
        palette: { accent: t.teal, text: t.ink, muted: t.muted, card: t.card, line: t.line, invert: '#ffffff' },
        sectionBg: t.sky,
        sectionClass: 'px-5 md:px-8 py-12',
        innerClass: 'max-w-3xl mx-auto',
        headerLayout: 'side',
        eyebrowClass: 'text-[10px] font-extrabold uppercase tracking-[0.2em]',
        titleClass: 'text-xl md:text-2xl font-extrabold tracking-tight mt-1',
        bodyClass: 'text-xs mt-1.5 max-w-sm',
        showDivider: false,
        icon: <Users className="w-4 h-4" style={{ color: t.blue }} />,
        tileRadius: 'rounded-[1.5rem]',
        bannerRadius: 'rounded-[1.5rem]',
        chipRadius: 'rounded-full',
        chipActive: { backgroundColor: t.sun, color: '#12385b', borderColor: t.sun },
        hoverGradient: 'linear-gradient(to top, rgba(18,56,91,0.8), transparent)',
        badgeStyle: { backgroundColor: t.blue, color: '#ffffff' },
        instagramColor: t.blue,
        lightbox: { bg: 'rgba(18,56,91,0.96)', text: '#ffffff', muted: '#b9cfe4', accent: t.sun, chipText: '#12385b', radius: 'rounded-2xl', buttonClass: 'rounded-full' },
      };
    }
    case 'nail_lash_studio': {
      const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
      return {
        palette: { accent: t.pinkDeep, text: t.ink, muted: t.muted, card: t.card, line: t.line, invert: '#ffffff' },
        sectionBg: t.white,
        sectionClass: 'px-5 md:px-8 py-12',
        innerClass: 'max-w-3xl mx-auto',
        headerLayout: 'side',
        eyebrowClass: 'text-[9px] font-extrabold uppercase tracking-[0.18em]',
        titleClass: 'text-lg md:text-xl font-extrabold tracking-wide uppercase mt-1',
        bodyClass: 'text-xs mt-1.5 max-w-sm',
        showDivider: false,
        icon: <Sparkles className="w-4 h-4" style={{ color: t.pinkDeep }} />,
        tileRadius: 'rounded-[1.25rem]',
        bannerRadius: 'rounded-[1.25rem]',
        chipRadius: 'rounded-full',
        chipActive: { backgroundColor: t.pinkSoft, color: t.pinkDeep, borderColor: t.pinkSoft },
        hoverGradient: 'linear-gradient(to top, rgba(33,27,36,0.75), transparent)',
        badgeStyle: {
          backgroundImage: `linear-gradient(135deg, ${t.pinkDeep} 0%, #d81b60 100%)`,
          color: '#ffffff',
        },
        instagramColor: t.pinkDeep,
        lightbox: { bg: 'rgba(33,27,36,0.96)', text: '#ffffff', muted: '#c3b8c8', accent: t.pink, chipText: '#ffffff', radius: 'rounded-[1.25rem]', buttonClass: 'rounded-full' },
      };
    }
  }
}

/** Sizes attribute for grid tiles + featured banner (per viewport). */
function gallerySizes(mode: ViewportMode, banner = false): string {
  if (banner) return '(max-width: 390px) 100vw, (max-width: 768px) 100vw, 950px';
  if (mode === 'mobile') return '(max-width: 390px) 45vw, 190px';
  if (mode === 'tablet') return '(max-width: 768px) 33vw, 250px';
  return '(max-width: 1024px) 33vw, 300px';
}

/* ------------------------------------------------------------------ */
/* Before / After slider                                               */
/* ------------------------------------------------------------------ */

function BeforeAfterSlider({
  item,
  chrome,
  ratio,
  radius,
  mode,
}: {
  item: GalleryItem;
  chrome: GalleryChromeCopy;
  ratio: string;
  radius: string;
  mode: ViewportMode;
}) {
  const [position, setPosition] = useState(50);
  const percent = Math.min(100, Math.max(0, position));
  return (
    <div
      data-testid="site-gallery-before-after"
      className={`relative w-full max-w-3xl mx-auto overflow-hidden ${radius}`}
      style={{ aspectRatio: ratio, backgroundColor: '#000' }}
    >
      {/* AFTER image — the base layer */}
      <SiteImage
        src={item.src}
        alt={`${chrome.after}: ${item.alt}`}
        context="gallery"
        aspectRatio={ratio}
        sizes={gallerySizes(mode, true)}
        className="w-full h-full"
      />
      {/* BEFORE image — clipped by the divider */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
        aria-hidden
      >
        <SiteImage
          src={item.beforeSrc || item.src}
          alt=""
          context="gallery"
          aspectRatio={ratio}
          sizes={gallerySizes(mode, true)}
          className="absolute inset-0 w-full h-full"
          style={{ aspectRatio: 'auto' }}
        />
      </div>
      {/* Divider + handle */}
      <div className="absolute inset-y-0 w-[3px] pointer-events-none" style={{ left: `${percent}%`, backgroundColor: '#ffffff', boxShadow: '0 0 8px rgba(0,0,0,0.5)' }}>
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: 'rgba(0,0,0,0.65)', border: '2px solid #ffffff' }}>
          <ArrowLeftRight className="w-4 h-4" />
        </span>
      </div>
      {/* Labels */}
      <span data-testid="site-gallery-before-label" className="absolute top-3 left-3 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] pointer-events-none" style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: '#ffffff', borderRadius: 6 }}>
        {chrome.before}
      </span>
      <span data-testid="site-gallery-after-label" className="absolute top-3 right-3 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] pointer-events-none" style={{ backgroundColor: 'rgba(0,0,0,0.65)', color: '#ffffff', borderRadius: 6 }}>
        {chrome.after}
      </span>
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-1 text-[9px] font-semibold pointer-events-none rounded" style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: '#ffffff' }}>
        {chrome.dragHint}
      </span>
      {/* Invisible full-area range input = drag + keyboard accessible */}
      <input
        data-testid="site-gallery-before-after-range"
        type="range"
        min={0}
        max={100}
        value={percent}
        aria-label={chrome.dragHint}
        onChange={(event) => setPosition(Number(event.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lightbox                                                            */
/* ------------------------------------------------------------------ */

function GalleryLightbox({
  items,
  index,
  themeId,
  locale,
  mode,
  chrome,
  style,
  copy,
  data,
  sectionTitle,
  onClose,
  onNavigate,
  onViewService,
}: {
  items: GalleryItem[];
  index: number;
  themeId: SiteHeaderThemeId;
  locale: AppLocale;
  mode: ViewportMode;
  chrome: GalleryChromeCopy;
  style: GalleryVisualStyle;
  /** Full theme copy table (for theme-media caption keys like `gallery1`). */
  copy: Record<string, string>;
  data: SalonData;
  sectionTitle: string;
  onClose: () => void;
  onNavigate: (delta: number) => void;
  onViewService: (service: Service) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const touchRef = useRef({ x: 0, y: 0, active: false, ignore: false });
  const total = items.length;
  const item = items[index];
  const ratio = mode === 'mobile' ? '4/3' : '16/9';

  const prev = useCallback(() => onNavigate(-1), [onNavigate]);
  const next = useCallback(() => onNavigate(1), [onNavigate]);

  // Open: lock page scroll, focus the close control, trap focus; restore on close.
  useEffect(() => {
    restoreRef.current = (document.activeElement as HTMLElement) || null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') prev();
      else if (event.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        const focusables: HTMLElement[] = Array.from(
          root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'),
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [onClose, prev, next]);

  // Preload only the adjacent images — never the whole gallery at once.
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    const neighbours = [index - 1, index + 1]
      .map((i) => ((i % total) + total) % total)
      .filter((i) => i !== index)
      .map((i) => items[i])
      .filter((entry): entry is GalleryItem => !!entry && entry.kind !== 'beforeAfter');
    const preloads = neighbours.map((entry) => {
      const img = new Image();
      img.src = entry.src;
      return img;
    });
    return () => {
      preloads.forEach((img) => {
        img.src = '';
      });
    };
  }, [index, items, total]);

  // Mobile swipe: horizontal drags navigate; vertical scroll stays native via
  // `touch-action: pan-y`. Drags starting on the before/after slider are
  // ignored so its own handle keeps working.
  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    if (target && typeof target.closest === 'function' && target.closest('[data-testid="site-gallery-before-after"]')) {
      touchRef.current = { x: 0, y: 0, active: false, ignore: true };
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    touchRef.current = { x: touch.clientX, y: touch.clientY, active: true, ignore: false };
  };
  const onTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const state = touchRef.current;
    if (state.ignore) {
      touchRef.current = { x: 0, y: 0, active: false, ignore: false };
      return;
    }
    if (!state.active) return;
    state.active = false;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - state.x;
    const dy = touch.clientY - state.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) next();
    else prev();
  };

  if (!item) return null;

  const service = galleryServiceForItem(item, data, themeId);
  const caption = service
    ? service.name
    : item.origin === 'theme'
      ? copy[item.caption || ''] || chrome.captionFallback
      : item.caption || chrome.captionFallback;
  const categoryLabel = galleryCategoryLabel(themeId, item.category, locale);

  return (
    <div
      ref={dialogRef}
      data-testid="site-gallery-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={sectionTitle}
      className="fixed inset-0 z-50 flex flex-col site-gallery-lightbox-safe site-gallery-lightbox-anim"
      style={{
        backgroundColor: style.lightbox.bg,
        color: style.lightbox.text,
      }}
    >
      {/* Top bar — counter + close */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
        <span data-testid="site-gallery-lightbox-counter" className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: style.lightbox.muted }}>
          {galleryCounter(chrome, index, total)}
        </span>
        <button
          type="button"
          ref={closeRef}
          data-testid="site-gallery-lightbox-close"
          aria-label={chrome.close}
          onClick={onClose}
          className={`site-touch w-10 h-10 flex items-center justify-center transition-colors hover:bg-white/10 ${style.lightbox.buttonClass}`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Stage — swipe target */}
      <div
        data-testid="site-gallery-lightbox-stage"
        role="group"
        aria-label={chrome.swipeHint}
        className="flex-1 min-h-0 flex items-center justify-center relative px-4 md:px-16 site-gallery-stage-anim"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {total > 1 && (
          <button
            type="button"
            data-testid="site-gallery-lightbox-prev"
            aria-label={chrome.previous}
            onClick={prev}
            className={`site-touch absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center transition-colors hover:bg-white/10 ${style.lightbox.buttonClass}`}
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {item.kind === 'beforeAfter' ? (
          <BeforeAfterSlider item={item} chrome={chrome} ratio={ratio} radius={style.lightbox.radius} mode={mode} />
        ) : (
          <div key={item.id} className="w-full max-w-3xl">
            <SiteImage
              src={item.src}
              alt={item.alt}
              context="gallery"
              aspectRatio={ratio}
              fit="contain"
              sizes={gallerySizes(mode, true)}
              className="w-full"
              style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
            />
          </div>
        )}
        {total > 1 && (
          <button
            type="button"
            data-testid="site-gallery-lightbox-next"
            aria-label={chrome.next}
            onClick={next}
            className={`site-touch absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center transition-colors hover:bg-white/10 ${style.lightbox.buttonClass}`}
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Caption bar */}
      <div className="px-4 py-3 shrink-0 flex items-center justify-center gap-3 flex-wrap">
        <span data-testid="site-gallery-lightbox-caption" className="text-xs font-semibold text-center">
          {caption}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] px-2 py-1" style={{ backgroundColor: style.lightbox.accent, color: style.lightbox.chipText, borderRadius: 6 }}>
          {item.kind === 'beforeAfter' ? chrome.beforeAfter : categoryLabel}
        </span>

        {/* PHASE 14.5 — contextual CTAs (existing booking flow only) */}
        <div data-testid="site-gallery-cta-row" className="w-full flex flex-wrap items-center justify-center gap-2 pt-1">
          {service ? (
            <>
              <button
                type="button"
                data-testid="site-gallery-cta-view-service"
                onClick={() => onViewService(service)}
                className={`site-gallery-cta site-touch inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] border transition-colors hover:bg-white/10 ${style.lightbox.radius}`}
                style={{ color: style.lightbox.text, borderColor: 'rgba(255,255,255,0.4)' }}
              >
                <Maximize2 className="w-3.5 h-3.5" /> {chrome.viewService}
              </button>
              <button
                type="button"
                data-testid="site-gallery-cta-book-service"
                onClick={() => {
                  onClose();
                  openSiteBookingForService(service, themeId);
                }}
                className={`site-gallery-cta site-touch inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors hover:brightness-110 ${style.lightbox.radius}`}
                style={{ backgroundColor: style.lightbox.accent, color: style.lightbox.chipText }}
              >
                <CalendarDays className="w-3.5 h-3.5" /> {copy['common.bookThisService'] || 'Book this service'}
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="site-gallery-cta-book-appointment"
              onClick={() => {
                onClose();
                openSiteBooking();
              }}
              className={`site-gallery-cta site-touch inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors hover:brightness-110 ${style.lightbox.radius}`}
              style={{ backgroundColor: style.lightbox.accent, color: style.lightbox.chipText }}
            >
              <CalendarDays className="w-3.5 h-3.5" /> {copy['common.bookAppointment'] || 'Book Appointment'}
            </button>
          )}
        </div>

        <span data-testid="site-gallery-swipe-hint" className="w-full text-center text-[9px] font-semibold uppercase tracking-[0.16em] md:hidden" style={{ color: style.lightbox.muted }}>
          {chrome.swipeHint}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

export default function SiteGallery({ themeId, data, mode }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const chrome = galleryChrome(themeId, locale);
  const S = { ...siteText(themeId, locale), ...structureText(themeId, locale) };
  const X = structureCopyFrom(S);
  const style = useMemo(() => galleryStyle(themeId, appearance), [themeId, appearance]);
  const config = galleryThemeConfig(themeId);

  const items = useMemo(() => galleryItemsForTheme(themeId, data, locale), [themeId, data, locale]);
  const options = useMemo(() => galleryFilterOptions(themeId, items), [themeId, items]);
  const status = resolveSectionState('gallery', items);

  const [filter, setFilter] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [detailService, setDetailService] = useState<Service | null>(null);

  // Theme switch / data change → drop filters, lightbox and any open service
  // detail (no stale photos or cross-theme service state).
  useEffect(() => {
    setFilter(null);
    setLightboxIndex(null);
    setDetailService(null);
  }, [themeId, data]);

  const filtered = useMemo(() => filterGalleryItems(items, filter, options), [items, filter, options]);
  const featured = galleryFeaturedItem(items);
  const showFeatured = !!featured && !filter;
  const gridItems = showFeatured && featured ? filtered.filter((item) => item.id !== featured.id) : filtered;

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex((prev) => (prev === index ? prev : index));
  }, []);

  const navigate = useCallback(
    (delta: number) => {
      setLightboxIndex((prev) => {
        if (prev === null || filtered.length === 0) return prev;
        return (prev + delta + filtered.length) % filtered.length;
      });
    },
    [filtered.length],
  );

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  // Gallery image → service detail (existing SiteServiceDetail modal), then its
  // own Book CTA hands off to the existing booking flow with the service kept.
  const viewService = useCallback((service: Service) => {
    setLightboxIndex(null);
    setDetailService(service);
  }, []);

  const renderContent = items.length > 0 && (status === 'ready' || config.resilient);
  const bannerRatio = config.bannerRatio[mode] || config.bannerRatio.desktop;

  return (
    <div
      {...sectionProps('gallery', status)}
      className={`site-section ${style.sectionClass} transition-colors duration-300`}
      style={{ backgroundColor: style.sectionBg, borderColor: style.palette.line }}
    >
      <div className={style.innerClass}>
        {/* Header */}
        {style.headerLayout === 'side' ? (
          <div className="flex items-end justify-between gap-4 mb-7">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {style.icon}
                <span className={style.eyebrowClass} style={{ color: style.palette.accent }}>{S.galleryEyebrow}</span>
              </div>
              <h3 className={style.titleClass} style={{ color: style.palette.text }}>{S.galleryTitle}</h3>
              {S.galleryBody && <p className={style.bodyClass} style={{ color: style.palette.muted }}>{S.galleryBody}</p>}
            </div>
            <a
              href={data.socialProfiles?.instagram || '#section-gallery'}
              className="hidden md:inline-flex items-center gap-1.5 text-[10px] font-extrabold shrink-0"
              style={{ color: style.instagramColor }}
            >
              {S.followTheEdit || 'Instagram'} <Instagram className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2">
              {style.icon}
              <span className={style.eyebrowClass} style={{ color: style.palette.accent }}>{S.galleryEyebrow}</span>
            </div>
            <h3 className={style.titleClass} style={{ color: style.palette.text }}>{S.galleryTitle}</h3>
            {S.galleryBody && <p className={`${style.bodyClass} mt-2 max-w-xl mx-auto`} style={{ color: style.palette.muted }}>{S.galleryBody}</p>}
            {style.showDivider && <div className="h-px w-16 mx-auto mt-4" style={{ backgroundColor: style.palette.accent }} />}
          </div>
        )}

        {renderContent ? (
          <>
            {/* Featured image */}
            {showFeatured && featured && (
              <button
                type="button"
                data-testid="site-gallery-featured"
                aria-label={`${chrome.viewLarger}: ${featured.alt}`}
                onClick={() => openLightbox(filtered.findIndex((item) => item.id === featured.id))}
                className={`group relative w-full overflow-hidden text-left mb-4 border ${style.bannerRadius}`}
                style={{ borderColor: style.palette.line, backgroundColor: style.palette.card }}
              >
                <SiteImage
                  src={featured.src}
                  alt={featured.alt}
                  context="gallery"
                  aspectRatio={bannerRatio}
                  sizes={gallerySizes(mode, true)}
                  className="w-full transition-transform duration-700 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 pointer-events-none" style={{ background: style.hoverGradient }} />
                <div className="absolute left-4 right-4 bottom-4 flex items-end justify-between gap-3 pointer-events-none">
                  <div className="min-w-0">
                    <span className="inline-block text-[9px] font-bold uppercase tracking-[0.16em] px-2 py-1 text-white" style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6 }}>
                      {featured.kind === 'beforeAfter' ? chrome.beforeAfter : galleryCategoryLabel(themeId, featured.category, locale)}
                    </span>
                    {(featured.caption || (featured.origin === 'theme' && S[featured.caption || ''])) && (
                      <p className="text-[11px] font-semibold text-white mt-1.5 truncate">
                        {featured.origin === 'theme' ? S[featured.caption || ''] || chrome.captionFallback : featured.caption}
                      </p>
                    )}
                  </div>
                  <Maximize2 className="w-4 h-4 text-white/90 shrink-0" />
                </div>
              </button>
            )}

            {/* Category filter */}
            {options.length > 0 && (
              <div data-testid="site-gallery-filter" role="group" aria-label={S.galleryTitle} className="flex flex-wrap items-center gap-2 mb-5">
                <button
                  type="button"
                  data-testid="site-gallery-filter-all"
                  aria-pressed={!filter}
                  onClick={() => setFilter(null)}
                  className={`site-touch text-[10px] font-bold uppercase tracking-[0.12em] px-3 py-1.5 border transition-colors ${style.chipRadius}`}
                  style={!filter ? style.chipActive : { color: style.palette.muted, borderColor: style.palette.line }}
                >
                  {chrome.filterAll}
                </button>
                {options.map((option) => {
                  const active = filter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      data-testid={`site-gallery-filter-${option.id}`}
                      aria-pressed={active}
                      onClick={() => setFilter(active ? null : option.id)}
                      className={`site-touch text-[10px] font-bold uppercase tracking-[0.12em] px-3 py-1.5 border transition-colors ${style.chipRadius}`}
                      style={active ? style.chipActive : { color: style.palette.muted, borderColor: style.palette.line }}
                    >
                      {option.kind === 'beforeAfter' ? chrome.beforeAfter : option.label[locale]}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Responsive grid */}
            {gridItems.length > 0 && (
              <div data-testid="site-gallery-grid" className={`grid gap-3 ${siteGrid(mode, config.grid)}`}>
                {gridItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`site-gallery-tile-${item.id}`}
                    aria-label={`${chrome.viewLarger}: ${item.alt}`}
                    onClick={() => openLightbox(filtered.findIndex((entry) => entry.id === item.id))}
                    className={`group relative overflow-hidden border min-w-0 ${style.tileRadius}`}
                    style={{ borderColor: style.palette.line, backgroundColor: style.palette.card, aspectRatio: config.tileRatio, contain: 'content' }}
                  >
                    <SiteImage
                      src={item.src}
                      alt={item.alt}
                      context="gallery"
                      aspectRatio={config.tileRatio}
                      sizes={gallerySizes(mode)}
                      className="w-full h-full transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 flex items-end p-2.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: style.hoverGradient }}>
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5" style={{ ...style.badgeStyle, borderRadius: 6 }}>
                        {item.kind === 'beforeAfter' ? chrome.beforeAfter : galleryCategoryLabel(themeId, item.category, locale)}
                      </span>
                    </div>
                    {item.kind === 'beforeAfter' && (
                      <span className="absolute top-2 right-2 text-[8px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 flex items-center gap-1" style={{ ...style.badgeStyle, borderRadius: 6 }}>
                        <ArrowLeftRight className="w-3 h-3" /> {chrome.beforeAfter}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <SectionStatePanel
            status={status}
            copy={X}
            palette={style.palette}
            section="gallery"
            mode={mode}
            emptyTitle={chrome.emptyTitle}
            emptyBody={chrome.emptyBody}
          />
        )}
      </div>

      {lightboxIndex !== null && filtered.length > 0 && (
        <GalleryLightbox
          items={filtered}
          index={Math.min(lightboxIndex, filtered.length - 1)}
          themeId={themeId}
          locale={locale}
          mode={mode}
          chrome={chrome}
          style={style}
          copy={S}
          data={data}
          sectionTitle={S.galleryTitle}
          onClose={closeLightbox}
          onNavigate={navigate}
          onViewService={viewService}
        />
      )}

      {detailService && (
        <SiteServiceDetail
          themeId={themeId}
          data={data}
          service={detailService}
          mode={mode}
          onClose={() => setDetailService(null)}
        />
      )}
    </div>
  );
}
