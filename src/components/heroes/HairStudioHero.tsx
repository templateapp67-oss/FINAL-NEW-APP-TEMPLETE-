/**
 * PHASE 11.1 — HERO · HAIR STUDIO & COLOR BAR (hair_studio_color_bar)
 *
 * Visual language (used by NO other theme):
 *   - Editorial magazine cover: a hairline double frame, an "Issue" masthead
 *     rule across the top and serif display type set centred-left.
 *   - A three-frame gallery wall (one tall portfolio plate + two stacked
 *     column plates) with numbered captions like a printed contact sheet.
 *   - Rose-gold hairline underlines instead of buttons-with-fills for the
 *     secondary action; primary CTA is a flat rose-gold slab.
 *   - Meta appears as a typeset colophon line, not as chips.
 */
import type { CSSProperties } from 'react';
import type { SalonData } from '../../types';
import SiteImage from '../SiteImage';
import HeroMediaFrame from './HeroMediaFrame';
import OwnerPreviewHeroMedia from './OwnerPreviewHeroMedia';
import SiteSalonStatus from '../SiteSalonStatus';
import { useSiteLocale, useThemeAppearance } from '../SiteHeader';
import { getSalonNameStyle } from '../../lib/brandIdentity';
import { HAIR_STUDIO_SURFACES, surfacesOf } from '../../lib/themeSurfaces';
import { heroText } from '../../lib/siteHeroI18n';
import { heroCtaOptions, heroDescription, heroFocusBadges, heroHeadline, heroLogoMark, heroMedia, heroMeta, heroModeValue, heroSalonName, heroStat } from '../../lib/siteHero';
import { heroImageSizes, heroImageSrc, heroMediaPlan, useReducedMotion } from '../../lib/siteHeroMedia';
import { openSiteBooking } from '../../lib/siteBooking';
import SiteProtectedContactAction from '../SiteProtectedContactAction';
import { useIsOwnerPreview } from '../SiteRenderContext';
import { heroCtaClass, heroLinkProps } from '../../lib/siteHeroNav';
import type { ViewportMode } from '../../lib/siteStructure';
import { Star, MapPin, ArrowUpRight, Play, Phone, MessageCircle, Images } from 'lucide-react';

interface Props {
  data: SalonData;
  mode: ViewportMode;
}

export default function HairStudioHero({ data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  const locale = useSiteLocale();
  const appearance = useThemeAppearance('hair_studio_color_bar');
  const t = surfacesOf(HAIR_STUDIO_SURFACES, appearance);
  const isDark = appearance === 'dark';
  const H = heroText('hair_studio_color_bar', locale);
  const headline = heroHeadline(data, H);
  const focus = heroFocusBadges(data, H.focus, 2, ownerPreview);
  const media = heroMedia('hair_studio_color_bar', data);
  const meta = heroMeta('hair_studio_color_bar', data);
  const reducedMotion = useReducedMotion();
  const plan = heroMediaPlan('hair_studio_color_bar', data, reducedMotion);
  const cta = heroCtaOptions(data);
  const stat = heroStat(data, H);
  const compact = mode === 'mobile';
  // PHASE 11.4 — resolve from the renderer mode, not the browser viewport.
  const frameInset = heroModeValue(mode, { desktop: 'inset-5', tablet: 'inset-4', mobile: 'inset-3' });
  const frameInsetInner = heroModeValue(mode, { desktop: 'inset-[22px]', tablet: 'inset-[18px]', mobile: 'inset-[14px]' });
  const pad = heroModeValue(mode, { desktop: 'px-14 py-20', tablet: 'px-10 py-14', mobile: 'px-7 py-12' });
  const cols = heroModeValue(mode, { desktop: 'grid-cols-[0.98fr_1.02fr] items-end', tablet: 'grid-cols-[1fr_1fr] items-end', mobile: 'grid-cols-1' });
  const nameSize = heroModeValue(mode, { desktop: 'text-base', tablet: 'text-sm', mobile: 'text-sm' });
  const h1Size = heroModeValue(mode, { desktop: 'text-[3.6rem]', tablet: 'text-4xl', mobile: 'text-[2.45rem]' });
  const bodySize = heroModeValue(mode, { desktop: 'text-sm', tablet: 'text-xs', mobile: 'text-xs' });
  const mediaCols = heroModeValue(mode, { desktop: 'grid-cols-[1.35fr_1fr]', tablet: 'grid-cols-[1.2fr_1fr]', mobile: 'grid-cols-2' });

  const roseBtn: CSSProperties = { backgroundColor: t.rose, color: isDark ? '#241d1b' : '#ffffff' };

  return (
    <section
      id="section-hero"
      data-site-section="hero"
      data-section-state="ready"
      data-testid="site-hero"
      data-hero-theme="hair_studio_color_bar"
      data-hero-layout="editorial-gallery"
      className="site-section relative overflow-hidden"
      style={{ backgroundColor: t.paperDeep }}
    >
      {/* Printed double hairline frame */}
      <div className={`absolute ${frameInset} border pointer-events-none`} style={{ borderColor: t.line }} />
      <div className={`absolute ${frameInsetInner} border pointer-events-none`} style={{ borderColor: t.line }} />

      <div className={`relative z-10 ${pad}`}>
        {/* ---- Masthead rule --------------------------------------- */}
        <div
          data-testid="hero-brand"
          className="flex items-center justify-between gap-4 border-b pb-4"
          style={{ borderColor: t.line }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {data.logoUrl ? (
              <img
                data-testid="hero-logo"
                src={data.logoUrl}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                referrerPolicy="no-referrer"
                alt={`${heroSalonName(data)} logo`}
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <span
                data-testid="hero-logo"
                className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold tracking-[0.06em]"
                style={{ backgroundColor: t.roseSoft, color: t.roseDeep }}
              >
                {heroLogoMark(data, 'hair_studio_color_bar')}
              </span>
            )}
            <span
              data-testid="hero-salon-name"
              className={`${nameSize} font-serif truncate`}
              style={{ color: t.ink, ...getSalonNameStyle(data) }}
            >
              {heroSalonName(data)}
            </span>
          </div>
          <span className="text-[9px] uppercase tracking-[0.42em] shrink-0" style={{ color: t.roseDeep }}>
            {H.eyebrow}
          </span>
        </div>

        <div className={`grid gap-10 mt-10 ${cols}`}>
          {/* ---- Editorial copy ------------------------------------ */}
          <div>
            <h1
              data-testid="hero-headline"
              className={`font-serif leading-[1.02] ${h1Size}`}
              style={{ color: t.ink }}
            >
              {headline.main}{' '}
              {!ownerPreview && (
                <><br /><em className="not-italic" style={{ color: t.roseDeep }}>{headline.accent}</em></>
              )}
            </h1>
            <div className="h-px w-20 my-7" style={{ backgroundColor: t.rose }} />
            <p
              data-testid="hero-description"
              className={`max-w-md ${bodySize} leading-[1.85]`}
              style={{ color: t.muted }}
            >
              {heroDescription(data, H.description)}
            </p>

            {/* Owner mode shows only focus labels proven by real services. */}
            {focus.length > 0 && (
            <div data-testid="hero-focus" className="mt-7 border-t pt-4" style={{ borderColor: t.line }}>
              <span className="text-[9px] uppercase tracking-[0.36em] font-semibold" style={{ color: t.roseDeep }}>
                {H.focusLabel}
              </span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                {focus.map((label, index) => (
                  <span key={label} data-hero-focus-item={label} className="flex items-center gap-4">
                    {index > 0 && <span className="h-3 w-px" style={{ backgroundColor: t.line }} />}
                    <span className="text-[10px] uppercase tracking-[0.22em] font-semibold" style={{ color: t.ink }}>
                      <span style={{ color: t.rose }}>{String(index + 1).padStart(2, '0')}</span> {label}
                    </span>
                  </span>
                ))}
              </div>
              {!ownerPreview && (
                <p data-testid="hero-audience" className="mt-3 text-[10px] italic" style={{ color: t.muted }}>
                  {H.audience}
                </p>
              )}
            </div>
            )}

            <div className="flex flex-wrap items-center gap-6 mt-9">
              <button
                type="button"
                data-testid="hero-book-cta"
                data-open-booking="true"
                onClick={openSiteBooking}
                className={heroCtaClass('hair_studio_color_bar', "px-9 py-3.5 text-[10px] uppercase tracking-[0.3em] font-semibold transition-all hover:brightness-110")}
                style={roseBtn}
              >
                {H.primaryCta}
              </button>
              <a
                data-testid="hero-services-cta"
                {...heroLinkProps('hair_studio_color_bar', 'services', reducedMotion)}
                className={heroCtaClass('hair_studio_color_bar', "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em] font-semibold pb-1 border-b")}
                style={{ color: t.ink, borderColor: t.ink }}
              >
                {H.secondaryCta} <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
              </a>
            </div>

            {/* PHASE 11.3 — optional actions as editorial hairline links */}
            {(cta.call || cta.whatsApp || cta.gallery) && (
              <div data-testid="hero-cta-secondary-row" className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-7">
                {cta.call && (
                  <SiteProtectedContactAction
                    action="call"
                    data={data}
                    themeId="hair_studio_color_bar"
                    testId="hero-call-cta"
                    className={heroCtaClass('hair_studio_color_bar', "inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.24em] font-semibold pb-1 border-b")}
                    style={{ color: t.ink, borderColor: t.rose }}
                  >
                    <Phone className="w-3 h-3" style={{ color: t.rose }} aria-hidden /> {H.callCta}
                  </SiteProtectedContactAction>
                )}
                {cta.whatsApp && (
                  <SiteProtectedContactAction
                    action="whatsapp"
                    data={data}
                    themeId="hair_studio_color_bar"
                    testId="hero-whatsapp-cta"
                    className={heroCtaClass('hair_studio_color_bar', "inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.24em] font-semibold pb-1 border-b")}
                    style={{ color: t.ink, borderColor: t.rose }}
                  >
                    <MessageCircle className="w-3 h-3" style={{ color: t.rose }} aria-hidden /> {H.whatsAppCta}
                  </SiteProtectedContactAction>
                )}
                {cta.gallery && (
                  <a
                    data-testid="hero-gallery-cta"
                    {...heroLinkProps('hair_studio_color_bar', 'gallery', reducedMotion)}
                    className={heroCtaClass('hair_studio_color_bar', "inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.24em] font-semibold pb-1 border-b")}
                    style={{ color: t.ink, borderColor: t.rose }}
                  >
                    <Images className="w-3 h-3" style={{ color: t.rose }} aria-hidden /> {H.galleryCta}
                  </a>
                )}
              </div>
            )}

            {/* Colophon line: rating · location · status */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-9 text-[10px] tracking-[0.1em]" style={{ color: t.muted }}>
              {stat && (
                <span data-testid="hero-stat" className="uppercase" style={{ color: t.roseDeep }}>{stat.value} — {stat.label}</span>
              )}
              {meta.rating && (
                <span data-testid="hero-rating" className="flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" style={{ color: t.rose, fill: t.rose }} aria-hidden />
                  {meta.rating.average.toFixed(1)} / 5 · {meta.rating.count} {H['hero.reviewsSuffix']}
                </span>
              )}
              {meta.location && (
                <span data-testid="hero-location" className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" style={{ color: t.rose }} aria-hidden /> {meta.location}
                </span>
              )}
              <span data-testid="hero-status">
                <SiteSalonStatus themeId="hair_studio_color_bar" data={data} placement="announcement" compact />
              </span>
            </div>
          </div>

          {/* ---- Contact-sheet gallery wall ------------------------ */}
          {ownerPreview ? (
            <OwnerPreviewHeroMedia
              data={data}
              mode={mode}
              accent={t.roseDeep}
              background={t.paper}
              aspectRatio={compact ? '3/4' : '4/3'}
            />
          ) : (
          <div data-testid="hero-media" className={`grid gap-3 ${mediaCols}`}>
            {/* PHASE 11.3 — editorial plate 01 carries the studio film */}
            <figure className="relative m-0">
              <HeroMediaFrame
                themeId="hair_studio_color_bar"
                plan={plan}
                alt={H.mediaAlt}
                mode={mode}
                aspectRatio={compact ? '3/4' : '3/4.4'}
                placeholderColor={t.paper}
              >
                <figcaption
                  className="absolute left-0 bottom-0 px-2.5 py-1.5 text-[8px] uppercase tracking-[0.24em] font-semibold"
                  style={{ backgroundColor: t.card, color: t.roseDeep }}
                >
                  01 · {H.mediaTitle}
                </figcaption>
              </HeroMediaFrame>
            </figure>
            <div className="grid gap-3 content-start">
              {media.support.map((visual, index) => (
                <figure key={visual.url} className="relative">
                  <SiteImage
                    src={heroImageSrc(visual.url, mode)}
                    alt={H[visual.altKey]}
                    className="w-full"
                    sizes={heroImageSizes(mode)}
                    context="hero"
                    priority
                    aspectRatio="1/1"
                  />
                  <figcaption
                    className="absolute left-0 bottom-0 px-2 py-1 text-[8px] uppercase tracking-[0.2em] font-semibold"
                    style={{ backgroundColor: t.card, color: t.muted }}
                  >
                    0{index + 2}
                  </figcaption>
                </figure>
              ))}
              {plan.externalVideo ? (
                <a
                  data-testid="hero-video"
                  href={plan.externalVideo.src}
                  target="_blank"
                  rel="noreferrer"
                  className={heroCtaClass('hair_studio_color_bar', "flex items-center gap-2 px-3 py-2.5 text-[9px] uppercase tracking-[0.2em] font-semibold border")}
                  style={{ borderColor: t.line, color: t.roseDeep, backgroundColor: t.card }}
                >
                  <Play className="w-3.5 h-3.5" aria-hidden /> {plan.externalVideo.title || H.videoCta}
                </a>
              ) : (
                <p className="text-[9px] leading-relaxed uppercase tracking-[0.18em]" style={{ color: t.muted }}>
                  {H.mediaEyebrow}
                </p>
              )}
            </div>
          </div>
          )}
        </div>

        {!ownerPreview && (
          <p className="mt-8 text-[10px] leading-relaxed max-w-sm" style={{ color: t.muted }}>{H.mediaBody}</p>
        )}
      </div>
    </section>
  );
}
