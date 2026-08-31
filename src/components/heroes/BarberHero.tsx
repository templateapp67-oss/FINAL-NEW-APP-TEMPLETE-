/**
 * PHASE 11.1 — HERO · BARBER & MEN'S GROOMING (barber_mens_grooming)
 *
 * Visual language (used by NO other theme):
 *   - Full-bleed cinematic charcoal frame with a hard gold rule running
 *     down the left edge and a barber-pole stripe texture.
 *   - Left-aligned, uppercase, heavy slab typography with a numbered
 *     "chair" plate; sharp corners everywhere (zero border radius).
 *   - A vertical film-strip of two supporting grooming shots on the right,
 *     stacked behind a gold-bordered plate.
 *   - Bottom "brass rail" bar carrying the stat, rating, location and the
 *     live open/closed lamp.
 *
 * Layout, spacing and structure are deliberately unique to this theme.
 */
import type { CSSProperties } from 'react';
import type { SalonData } from '../../types';
import SiteImage from '../SiteImage';
import HeroMediaFrame from './HeroMediaFrame';
import OwnerPreviewHeroMedia from './OwnerPreviewHeroMedia';
import SiteSalonStatus from '../SiteSalonStatus';
import { useSiteLocale, useThemeAppearance } from '../SiteHeader';
import { getSalonNameStyle } from '../../lib/brandIdentity';
import { heroObjectPosition } from '../../lib/templateConfig';
import { BARBER_SURFACES, surfacesOf } from '../../lib/themeSurfaces';
import { heroText } from '../../lib/siteHeroI18n';
import { heroCtaOptions, heroDescription, heroFocusBadges, heroHeadline, heroLogoMark, heroMedia, heroMeta, heroModeValue, heroSalonName, heroStat } from '../../lib/siteHero';
import { heroImageSizes, heroImageSrc, heroMediaPlan, useReducedMotion, withHeroPoster } from '../../lib/siteHeroMedia';
import { openSiteBooking } from '../../lib/siteBooking';
import SiteProtectedContactAction from '../SiteProtectedContactAction';
import { useIsOwnerPreview } from '../SiteRenderContext';
import { heroCtaClass, heroLinkProps } from '../../lib/siteHeroNav';
import type { ViewportMode } from '../../lib/siteStructure';
import { Star, MapPin, Scissors, PlayCircle, Phone, MessageCircle, Images } from 'lucide-react';

interface Props {
  data: SalonData;
  mode: ViewportMode;
}

export default function BarberHero({ data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  const locale = useSiteLocale();
  const appearance = useThemeAppearance('barber_mens_grooming');
  const t = surfacesOf(BARBER_SURFACES, appearance);
  const H = heroText('barber_mens_grooming', locale);
  const headline = heroHeadline(data, H);
  const focus = heroFocusBadges(data, H.focus, 2, ownerPreview);
  const media = heroMedia('barber_mens_grooming', data);
  const meta = heroMeta('barber_mens_grooming', data);
  const reducedMotion = useReducedMotion();
  const basePlan = heroMediaPlan('barber_mens_grooming', data, reducedMotion);
  // The full-bleed backdrop already shows the primary visual, so the motion
  // cell in the film strip uses its own frame — never the same picture twice.
  const plan = withHeroPoster(basePlan, media.support[0]?.url || basePlan.posterUrl);
  const cta = heroCtaOptions(data);
  const stat = heroStat(data, H);
  const compact = mode === 'mobile';
  // PHASE 11.4 — resolve from the renderer mode, not the browser viewport.
  const pad = heroModeValue(mode, { desktop: 'px-12 py-24', tablet: 'px-8 py-16', mobile: 'px-5 py-12' });
  const cols = heroModeValue(mode, { desktop: 'grid-cols-[1.25fr_0.75fr]', tablet: 'grid-cols-[1.15fr_0.85fr]', mobile: 'grid-cols-1' });
  const nameSize = heroModeValue(mode, { desktop: 'text-base', tablet: 'text-sm', mobile: 'text-sm' });
  const h1Size = heroModeValue(mode, { desktop: 'text-6xl', tablet: 'text-4xl', mobile: 'text-[2.35rem]' });
  const bodySize = heroModeValue(mode, { desktop: 'text-sm', tablet: 'text-xs', mobile: 'text-xs' });

  const goldBtn: CSSProperties = { backgroundColor: t.gold, color: '#141414' };

  return (
    <section
      id="section-hero"
      data-site-section="hero"
      data-section-state="ready"
      data-testid="site-hero"
      data-hero-theme="barber_mens_grooming"
      data-hero-layout="cinematic-slab"
      className="site-section relative overflow-hidden"
      style={{ backgroundColor: t.charcoal }}
    >
      {/* Never present theme stock as this owner's business photography. */}
      {!ownerPreview && (
        <SiteImage
          src={heroImageSrc(basePlan.posterUrl, mode)}
          alt={H[media.primary.altKey]}
          className="absolute inset-0 w-full h-full"
          style={{ position: 'absolute', opacity: appearance === 'dark' ? 0.28 : 0.16 }}
          context="hero"
          priority
          aspectRatio="16/9"
          objectPosition={heroObjectPosition(data)}
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(100deg, ${t.charcoal} 32%, transparent 130%)` }}
      />
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{ backgroundImage: `repeating-linear-gradient(135deg, ${t.gold} 0px, ${t.gold} 2px, transparent 2px, transparent 16px)` }}
      />
      {/* Hard gold rule down the left edge — barber-pole anchor. */}
      <div className="absolute left-0 top-0 bottom-0 w-[6px]" style={{ backgroundColor: t.gold }} />

      <div className={`relative z-10 ${pad}`}>
        <div className={`grid gap-10 items-center ${cols}`}>
          {/* ---- Type column ------------------------------------- */}
          <div>
            {/* Brand lockup */}
            <div data-testid="hero-brand" className="flex items-center gap-3">
              {data.logoUrl ? (
                <img
                  data-testid="hero-logo"
                  src={data.logoUrl}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  referrerPolicy="no-referrer"
                  alt={`${heroSalonName(data)} logo`}
                  className="w-11 h-11 object-cover border"
                  style={{ borderColor: t.gold }}
                />
              ) : (
                <span
                  data-testid="hero-logo"
                  className="w-11 h-11 flex items-center justify-center text-[13px] font-black tracking-[0.08em] border"
                  style={{ borderColor: t.gold, color: t.gold, backgroundColor: '#141414' }}
                >
                  {heroLogoMark(data, 'barber_mens_grooming')}
                </span>
              )}
              <span
                data-testid="hero-salon-name"
                className={`${nameSize} font-black uppercase tracking-[0.32em]`}
                style={{ color: t.textStrong, ...getSalonNameStyle(data) }}
              >
                {heroSalonName(data)}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-8">
              <span className="h-px w-12" style={{ backgroundColor: t.gold }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.4em]" style={{ color: t.accentText }}>
                {H.eyebrow}
              </span>
            </div>

            <h1
              data-testid="hero-headline"
              className={`mt-4 font-black uppercase leading-[0.92] tracking-[0.02em] ${h1Size}`}
              style={{ color: t.textStrong }}
            >
              {headline.main}{' '}
              {!ownerPreview && (
                <><br /><span style={{ color: t.gold }}>{headline.accent}</span></>
              )}
            </h1>

            <p
              data-testid="hero-description"
              className={`mt-6 max-w-xl ${bodySize} leading-relaxed`}
              style={{ color: t.muted }}
            >
              {heroDescription(data, H.description)}
            </p>

            {/* Owner mode shows only focus labels proven by real services. */}
            {focus.length > 0 && (
            <div data-testid="hero-focus" className="mt-7">
              <span className="text-[9px] font-bold uppercase tracking-[0.32em]" style={{ color: t.muted }}>
                {H.focusLabel}
              </span>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {focus.map((label) => (
                  <span
                    key={label}
                    data-hero-focus-item={label}
                    className="px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] border"
                    style={{ borderColor: t.gold, color: t.accentText, backgroundColor: 'transparent' }}
                  >
                    {label}
                  </span>
                ))}
              </div>
              {!ownerPreview && (
                <p data-testid="hero-audience" className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: t.muted }}>
                  {H.audience}
                </p>
              )}
            </div>
            )}

            {/* Sharp slab CTAs */}
            <div className="flex flex-wrap gap-3 mt-9">
              <button
                type="button"
                data-testid="hero-book-cta"
                data-open-booking="true"
                onClick={openSiteBooking}
                className={heroCtaClass('barber_mens_grooming', "px-8 py-4 text-[11px] font-black uppercase tracking-[0.22em] transition-all hover:brightness-110")}
                style={goldBtn}
              >
                {H.primaryCta}
              </button>
              <a
                data-testid="hero-services-cta"
                {...heroLinkProps('barber_mens_grooming', 'services', reducedMotion)}
                className={heroCtaClass('barber_mens_grooming', "px-8 py-4 text-[11px] font-black uppercase tracking-[0.22em] border transition-all hover:bg-white/5")}
                style={{ borderColor: t.gold, color: t.accentText }}
              >
                {H.secondaryCta}
              </a>
            </div>

            {/* PHASE 11.3 — optional actions, barber slab treatment */}
            {(cta.call || cta.whatsApp || cta.gallery) && (
              <div data-testid="hero-cta-secondary-row" className="flex flex-wrap gap-2 mt-6">
                {cta.call && (
                  <SiteProtectedContactAction
                    action="call"
                    data={data}
                    themeId="barber_mens_grooming"
                    testId="hero-call-cta"
                    className={heroCtaClass('barber_mens_grooming', "flex items-center gap-2 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.18em] border")}
                    style={{ borderColor: t.line, color: t.text, backgroundColor: t.card }}
                  >
                    <Phone className="w-3.5 h-3.5" style={{ color: t.gold }} aria-hidden /> {H.callCta}
                  </SiteProtectedContactAction>
                )}
                {cta.whatsApp && (
                  <SiteProtectedContactAction
                    action="whatsapp"
                    data={data}
                    themeId="barber_mens_grooming"
                    testId="hero-whatsapp-cta"
                    className={heroCtaClass('barber_mens_grooming', "flex items-center gap-2 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.18em] border")}
                    style={{ borderColor: t.line, color: t.text, backgroundColor: t.card }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" style={{ color: t.gold }} aria-hidden /> {H.whatsAppCta}
                  </SiteProtectedContactAction>
                )}
                {cta.gallery && (
                  <a
                    data-testid="hero-gallery-cta"
                    {...heroLinkProps('barber_mens_grooming', 'gallery', reducedMotion)}
                    className={heroCtaClass('barber_mens_grooming', "flex items-center gap-2 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.18em] border")}
                    style={{ borderColor: t.line, color: t.text, backgroundColor: t.card }}
                  >
                    <Images className="w-3.5 h-3.5" style={{ color: t.gold }} aria-hidden /> {H.galleryCta}
                  </a>
                )}
              </div>
            )}

            {!ownerPreview && (
              <div className="flex flex-wrap gap-x-7 gap-y-2 mt-8 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: t.text }}>
                <span className="flex items-center gap-2"><Scissors className="w-3.5 h-3.5" style={{ color: t.gold }} aria-hidden /> {H.chip1}</span>
                <span className="flex items-center gap-2"><Scissors className="w-3.5 h-3.5" style={{ color: t.gold }} aria-hidden /> {H.chip2}</span>
              </div>
            )}
          </div>

          {/* ---- Film-strip plate: motion cell + still cells ------ */}
          {ownerPreview ? (
            <OwnerPreviewHeroMedia
              data={data}
              mode={mode}
              accent={t.gold}
              background={t.charcoalSoft}
              className={compact ? 'mt-2' : ''}
              aspectRatio={compact ? '16/10' : '4/3'}
            />
          ) : (
          <div data-testid="hero-media" className={`relative ${compact ? 'mt-2' : ''}`}>
            <div className="absolute -inset-2 border pointer-events-none" style={{ borderColor: t.gold, opacity: 0.55 }} />
            <div className="relative grid gap-2">
              {/* PHASE 11.3 — barber motion cell: sharp-cornered, gold-capped */}
              <HeroMediaFrame
                themeId="barber_mens_grooming"
                plan={plan}
                alt={H.mediaAlt}
                mode={mode}
                aspectRatio={heroModeValue(mode, { desktop: '4/3', tablet: '4/3', mobile: '16/10' })}
                placeholderColor={t.charcoalSoft}
              >
                <span
                  className="absolute left-0 bottom-0 px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em]"
                  style={{ backgroundColor: t.gold, color: '#141414' }}
                >
                  {H.mediaEyebrow}
                </span>
              </HeroMediaFrame>
              {/* PHASE 11.5 — the second still cell is desktop/tablet only:
                  on a 390px phone two stacked cells pushed the CTAs far below
                  the fold. */}
              {(compact ? [] : media.support.slice(1, 2)).map((visual) => (
                <div key={visual.url} className="relative">
                  <SiteImage
                    src={heroImageSrc(visual.url, mode)}
                    alt={H[visual.altKey]}
                    className="w-full"
                    sizes={heroImageSizes(mode)}
                    context="hero"
                    priority
                    aspectRatio="16/9"
                  />
                  <span
                    className="absolute left-0 bottom-0 px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em]"
                    style={{ backgroundColor: t.gold, color: '#141414' }}
                  >
                    {H.mediaTitle}
                  </span>
                </div>
              ))}
            </div>
            {plan.externalVideo && (
              <a
                data-testid="hero-video"
                href={plan.externalVideo.src}
                target="_blank"
                rel="noreferrer"
                className={heroCtaClass('barber_mens_grooming', "mt-2 flex items-center gap-2 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.18em] border")}
                style={{ borderColor: t.gold, color: t.accentText, backgroundColor: t.card }}
              >
                <PlayCircle className="w-4 h-4" aria-hidden /> {plan.externalVideo.title || H.videoCta}
              </a>
            )}
            <p className="mt-3 text-[10px] leading-relaxed" style={{ color: t.muted }}>{H.mediaBody}</p>
          </div>
          )}
        </div>

        {/* ---- Brass rail: stat · rating · location · status ----- */}
        <div
          className={`mt-12 border-t pt-5 flex flex-wrap items-center gap-x-8 gap-y-3 ${compact ? 'justify-start' : ''}`}
          style={{ borderColor: t.line }}
        >
          {stat && (
            <span data-testid="hero-stat" className="flex items-baseline gap-2">
              <span className="text-2xl font-black" style={{ color: t.gold }}>{stat.value}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: t.muted }}>{stat.label}</span>
            </span>
          )}
          {meta.rating && (
            <span data-testid="hero-rating" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: t.text }}>
              <Star className="w-3.5 h-3.5" style={{ color: t.gold, fill: t.gold }} aria-hidden />
              {meta.rating.average.toFixed(1)} · {meta.rating.count} {H['hero.reviewsSuffix']}
            </span>
          )}
          {meta.location && (
            <span data-testid="hero-location" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: t.text }}>
              <MapPin className="w-3.5 h-3.5" style={{ color: t.gold }} aria-hidden /> {meta.location}
            </span>
          )}
          <span data-testid="hero-status">
            <SiteSalonStatus themeId="barber_mens_grooming" data={data} placement="announcement" compact />
          </span>
        </div>
      </div>
    </section>
  );
}
