/**
 * PHASE 11.1 — HERO · NAIL & LASH STUDIO (nail_lash_studio)
 *
 * Visual language (used by NO other theme):
 *   - Glamorous visual-card grid: the hero IS a set of stacked beauty cards
 *     (a large "look of the week" card plus two tall side cards), each with a
 *     neon-pink glow ring and a caption chip — closer to a lookbook shelf
 *     than a traditional hero banner.
 *   - Oversized, tight-tracking display type with a neon pink accent and a
 *     glowing pill CTA; the secondary CTA is an outlined nude-sand pill.
 *   - Meta appears as a glossy bottom "receipt strip" over sand.
 */
import type { CSSProperties } from 'react';
import type { SalonData } from '../../types';
import SiteImage from '../SiteImage';
import HeroMediaFrame from './HeroMediaFrame';
import OwnerPreviewHeroMedia from './OwnerPreviewHeroMedia';
import SiteSalonStatus from '../SiteSalonStatus';
import { useSiteLocale, useThemeAppearance } from '../SiteHeader';
import { getSalonNameStyle } from '../../lib/brandIdentity';
import { NAIL_LASH_SURFACES, surfacesOf } from '../../lib/themeSurfaces';
import { heroText } from '../../lib/siteHeroI18n';
import { heroCtaOptions, heroDescription, heroFocusBadges, heroHeadline, heroLogoMark, heroMedia, heroMeta, heroModeValue, heroSalonName, heroStat } from '../../lib/siteHero';
import { heroImageSizes, heroImageSrc, heroMediaPlan, useReducedMotion } from '../../lib/siteHeroMedia';
import { openSiteBooking } from '../../lib/siteBooking';
import SiteProtectedContactAction from '../SiteProtectedContactAction';
import { useIsOwnerPreview } from '../SiteRenderContext';
import { heroCtaClass, heroLinkProps } from '../../lib/siteHeroNav';
import type { ViewportMode } from '../../lib/siteStructure';
import { Star, MapPin, Sparkles, ArrowRight, Camera, PlayCircle, Phone, MessageCircle, Images } from 'lucide-react';

interface Props {
  data: SalonData;
  mode: ViewportMode;
}

export default function NailLashHero({ data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  const locale = useSiteLocale();
  const appearance = useThemeAppearance('nail_lash_studio');
  const t = surfacesOf(NAIL_LASH_SURFACES, appearance);
  const H = heroText('nail_lash_studio', locale);
  const headline = heroHeadline(data, H);
  const focus = heroFocusBadges(data, H.focus, 2, ownerPreview);
  const media = heroMedia('nail_lash_studio', data);
  const meta = heroMeta('nail_lash_studio', data);
  const reducedMotion = useReducedMotion();
  const plan = heroMediaPlan('nail_lash_studio', data, reducedMotion);
  const cta = heroCtaOptions(data);
  const stat = heroStat(data, H);
  const compact = mode === 'mobile';
  // PHASE 11.4 — resolve from the renderer mode, not the browser viewport.
  const pad = heroModeValue(mode, { desktop: 'px-10 py-16', tablet: 'px-8 py-12', mobile: 'px-5 py-10' });
  const cols = heroModeValue(mode, { desktop: 'grid-cols-[0.9fr_1.1fr]', tablet: 'grid-cols-[1fr_1fr]', mobile: 'grid-cols-1' });
  const nameSize = heroModeValue(mode, { desktop: 'text-base', tablet: 'text-sm', mobile: 'text-sm' });
  const h1Size = heroModeValue(mode, { desktop: 'text-[4.2rem]', tablet: 'text-5xl', mobile: 'text-[2.7rem]' });
  const mediaCols = heroModeValue(mode, { desktop: 'grid-cols-[1.3fr_1fr]', tablet: 'grid-cols-[1.15fr_1fr]', mobile: 'grid-cols-2' });
  // The studio badge is a desktop-only flourish; on tablet/mobile the eyebrow
  // already appears in the focus block, so it must NOT rely on a CSS breakpoint.
  const showStudioBadge = mode === 'desktop';

  const neonBtn: CSSProperties = {
    backgroundColor: t.pink,
    color: '#ffffff',
    boxShadow: `0 10px 26px -8px ${t.pink}`,
  };

  return (
    <section
      id="section-hero"
      data-site-section="hero"
      data-section-state="ready"
      data-testid="site-hero"
      data-hero-theme="nail_lash_studio"
      data-hero-layout="glam-card-shelf"
      className="site-section relative overflow-hidden"
      style={{ backgroundColor: t.sand }}
    >
      <div className="absolute -left-24 -top-24 w-72 h-72 rounded-full" style={{ backgroundColor: t.pinkSoft }} />
      <div className="absolute right-[-70px] bottom-[-90px] w-60 h-60 rounded-full border-[22px]" style={{ borderColor: `${t.pink}22` }} />

      <div className={`relative z-10 ${pad}`}>
        {/* ---- Studio lockup ------------------------------------- */}
        <div data-testid="hero-brand" className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {data.logoUrl ? (
              <img
                data-testid="hero-logo"
                src={data.logoUrl}
                alt={`${heroSalonName(data)} logo`}
                className="w-11 h-11 rounded-full object-cover border-2"
                style={{ borderColor: t.pink }}
              />
            ) : (
              <span
                data-testid="hero-logo"
                className="w-11 h-11 rounded-full flex items-center justify-center text-[12px] font-extrabold border-2"
                style={{ borderColor: t.pink, color: t.pinkDeep, backgroundColor: t.card }}
              >
                {heroLogoMark(data, 'nail_lash_studio')}
              </span>
            )}
            <span
              data-testid="hero-salon-name"
              className={`${nameSize} font-extrabold tracking-[-0.02em] truncate`}
              style={{ color: t.ink, ...getSalonNameStyle(data) }}
            >
              {heroSalonName(data)}
            </span>
          </div>
          {showStudioBadge && !ownerPreview && (
          <span
            data-testid="hero-studio-badge"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.2em] shrink-0"
            style={{ backgroundColor: t.card, color: t.pinkDeep }}
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: t.pink }} aria-hidden /> {H.eyebrow}
          </span>
          )}
        </div>

        {/* ---- Display type -------------------------------------- */}
        <h1
          data-testid="hero-headline"
          className={`mt-8 font-extrabold leading-[0.86] tracking-[-0.07em] ${h1Size}`}
          style={{ color: t.ink }}
        >
          {headline.main}{' '}
          {!ownerPreview && (
            <><br /><span style={{ color: t.pink }}>{headline.accent}</span></>
          )}
        </h1>

        <div className={`grid gap-6 mt-6 items-start ${cols}`}>
          <div>
            <p
              data-testid="hero-description"
              className="max-w-sm text-sm leading-relaxed"
              style={{ color: t.muted }}
            >
              {heroDescription(data, H.description)}
            </p>

            {/* Owner mode shows only focus labels proven by real services. */}
            {focus.length > 0 && (
            <div data-testid="hero-focus" className="mt-6">
              <span className="text-[9px] font-extrabold uppercase tracking-[0.2em]" style={{ color: t.pinkDeep }}>
                {H.focusLabel}
              </span>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {focus.map((label, index) => (
                  <span
                    key={label}
                    data-hero-focus-item={label}
                    className="rounded-full px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em]"
                    style={
                      index === 0
                        ? { backgroundColor: t.pink, color: '#ffffff', boxShadow: `0 6px 16px -8px ${t.pink}` }
                        : { backgroundColor: t.card, color: t.pinkDeep, border: `1px solid ${t.line}` }
                    }
                  >
                    {label}
                  </span>
                ))}
              </div>
              {!ownerPreview && (
                <p data-testid="hero-audience" className="mt-3 text-[10px]" style={{ color: t.muted }}>
                  {H.audience}
                </p>
              )}
            </div>
            )}

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                type="button"
                data-testid="hero-book-cta"
                data-open-booking="true"
                onClick={openSiteBooking}
                className={heroCtaClass('nail_lash_studio', "rounded-full px-7 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em] inline-flex items-center gap-2 transition-transform hover:-translate-y-0.5")}
                style={neonBtn}
              >
                {H.primaryCta} <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
              <a
                data-testid="hero-services-cta"
                {...heroLinkProps('nail_lash_studio', 'services', reducedMotion)}
                className={heroCtaClass('nail_lash_studio', "rounded-full px-7 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em] border inline-flex items-center gap-2")}
                style={{ borderColor: t.sandDeep, color: t.ink, backgroundColor: t.card }}
              >
                {H.secondaryCta} <Camera className="w-4 h-4" aria-hidden />
              </a>
            </div>

            {!ownerPreview && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6 text-[9px] font-extrabold uppercase tracking-[0.14em]" style={{ color: t.ink }}>
                <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" style={{ color: t.pink }} aria-hidden /> {H.chip1}</span>
                <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" style={{ color: t.pink }} aria-hidden /> {H.chip2}</span>
              </div>
            )}

            {/* PHASE 11.3 — optional actions as glossy neon tags */}
            {(cta.call || cta.whatsApp || cta.gallery) && (
              <div data-testid="hero-cta-secondary-row" className="flex flex-wrap gap-2 mt-6">
                {cta.call && (
                  <SiteProtectedContactAction
                    action="call"
                    data={data}
                    themeId="nail_lash_studio"
                    testId="hero-call-cta"
                    className={heroCtaClass('nail_lash_studio', "rounded-full px-4 py-2.5 text-[9px] font-extrabold uppercase tracking-[0.14em] inline-flex items-center gap-1.5")}
                    style={{ backgroundColor: t.pinkSoft, color: t.pinkDeep }}
                  >
                    <Phone className="w-3.5 h-3.5" aria-hidden /> {H.callCta}
                  </SiteProtectedContactAction>
                )}
                {cta.whatsApp && (
                  <SiteProtectedContactAction
                    action="whatsapp"
                    data={data}
                    themeId="nail_lash_studio"
                    testId="hero-whatsapp-cta"
                    className={heroCtaClass('nail_lash_studio', "rounded-full px-4 py-2.5 text-[9px] font-extrabold uppercase tracking-[0.14em] inline-flex items-center gap-1.5")}
                    style={{ backgroundColor: t.pinkSoft, color: t.pinkDeep }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" aria-hidden /> {H.whatsAppCta}
                  </SiteProtectedContactAction>
                )}
                {cta.gallery && (
                  <a
                    data-testid="hero-gallery-cta"
                    {...heroLinkProps('nail_lash_studio', 'gallery', reducedMotion)}
                    className={heroCtaClass('nail_lash_studio', "rounded-full px-4 py-2.5 text-[9px] font-extrabold uppercase tracking-[0.14em] inline-flex items-center gap-1.5")}
                    style={{ backgroundColor: t.pinkSoft, color: t.pinkDeep }}
                  >
                    <Images className="w-3.5 h-3.5" aria-hidden /> {H.galleryCta}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ---- Glam card shelf ---------------------------------- */}
          {ownerPreview ? (
            <OwnerPreviewHeroMedia
              data={data}
              mode={mode}
              accent={t.pink}
              background={t.card}
              className="rounded-[1.75rem]"
              aspectRatio="3/4"
            />
          ) : (
          <div data-testid="hero-media" className={`grid gap-3 ${mediaCols}`}>
            {/* PHASE 11.3 — look-of-the-week card carries the studio media */}
            <HeroMediaFrame
              themeId="nail_lash_studio"
              plan={plan}
              alt={H.mediaAlt}
              mode={mode}
              aspectRatio="3/4"
              className="rounded-[1.75rem] shadow-xl"
              style={{ boxShadow: `0 18px 40px -20px ${t.pink}` }}
              placeholderColor={t.card}
            >
              <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to top, ${t.overlay}, transparent 55%)` }} />
              <div className="absolute left-3 right-3 bottom-3">
                <span className="text-[8px] font-extrabold uppercase tracking-[0.24em]" style={{ color: t.pinkGlow }}>{H.mediaEyebrow}</span>
                <p className="text-base font-extrabold text-white mt-1 leading-tight">{H.mediaTitle}</p>
                <p className="text-[9px] mt-1 text-white/70">{H.mediaBody}</p>
              </div>
            </HeroMediaFrame>

            <div className="grid gap-3 content-start">
              {media.support.map((visual, index) => (
                <article
                  key={visual.url}
                  className="relative rounded-[1.5rem] overflow-hidden border-2"
                  style={{ borderColor: index === 0 ? t.pink : t.nude }}
                >
                  <SiteImage
                    src={heroImageSrc(visual.url, mode)}
                    alt={H[visual.altKey]}
                    className="w-full"
                    sizes={heroImageSizes(mode)}
                    context="hero"
                    priority
                    aspectRatio="1/1"
                  />
                  <span
                    className="absolute left-2 top-2 rounded-full px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.14em]"
                    style={{ backgroundColor: t.card, color: t.pinkDeep }}
                  >
                    0{index + 2}
                  </span>
                </article>
              ))}
              {plan.externalVideo && (
                <a
                  data-testid="hero-video"
                  href={plan.externalVideo.src}
                  target="_blank"
                  rel="noreferrer"
                  className={heroCtaClass('nail_lash_studio', "rounded-full px-3 py-2.5 text-[9px] font-extrabold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-1.5")}
                  style={{ backgroundColor: t.pinkSoft, color: t.pinkDeep }}
                >
                  <PlayCircle className="w-3.5 h-3.5" aria-hidden /> {plan.externalVideo.title || H.videoCta}
                </a>
              )}
            </div>
          </div>
          )}
        </div>

        {/* ---- Glossy receipt strip ------------------------------ */}
        <div
          className="mt-9 rounded-[1.4rem] px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 border"
          style={{ backgroundColor: t.card, borderColor: t.line }}
        >
          {stat && (
            <span data-testid="hero-stat" className="flex items-baseline gap-1.5">
              <span className="text-lg font-extrabold" style={{ color: t.pinkDeep }}>{stat.value}</span>
              <span className="text-[9px] font-extrabold uppercase tracking-[0.14em]" style={{ color: t.muted }}>{stat.label}</span>
            </span>
          )}
          {meta.rating && (
            <span data-testid="hero-rating" className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em]" style={{ color: t.ink }}>
              <Star className="w-3.5 h-3.5" style={{ color: t.pink, fill: t.pink }} aria-hidden />
              {meta.rating.average.toFixed(1)} · {meta.rating.count} {H['hero.reviewsSuffix']}
            </span>
          )}
          {meta.location && (
            <span data-testid="hero-location" className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em]" style={{ color: t.ink }}>
              <MapPin className="w-3.5 h-3.5" style={{ color: t.pink }} aria-hidden /> {meta.location}
            </span>
          )}
          <span data-testid="hero-status">
            <SiteSalonStatus themeId="nail_lash_studio" data={data} placement="announcement" compact />
          </span>
        </div>
      </div>
    </section>
  );
}
