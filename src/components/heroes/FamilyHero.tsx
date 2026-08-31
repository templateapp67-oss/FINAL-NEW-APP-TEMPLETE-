/**
 * PHASE 11.1 — HERO · FULL-SERVICE FAMILY SALON (family_full_service)
 *
 * Visual language (used by NO other theme):
 *   - Bright sky/teal panel with a big rounded "action card" that carries the
 *     CTAs — a quick-access booking block rather than loose buttons.
 *   - A collage of three overlapping rounded photo tiles (parent, kid,
 *     stylist) with a sunshine badge — friendly and energetic.
 *   - Three "who's it for" pills (Men · Women · Kids) sit directly under the
 *     headline so families can self-select immediately.
 *   - Meta strip presented as a bright rounded ribbon under the action card.
 */
import type { CSSProperties } from 'react';
import type { SalonData } from '../../types';
import SiteImage from '../SiteImage';
import HeroMediaFrame from './HeroMediaFrame';
import OwnerPreviewHeroMedia from './OwnerPreviewHeroMedia';
import SiteSalonStatus from '../SiteSalonStatus';
import { useSiteLocale, useThemeAppearance } from '../SiteHeader';
import { getSalonNameStyle } from '../../lib/brandIdentity';
import { FAMILY_SURFACES, surfacesOf } from '../../lib/themeSurfaces';
import { heroText } from '../../lib/siteHeroI18n';
import { heroCtaOptions, heroDescription, heroFocusBadges, heroHeadline, heroLogoMark, heroMedia, heroMeta, heroModeValue, heroSalonName, heroStat } from '../../lib/siteHero';
import { heroImageSizes, heroImageSrc, heroMediaPlan, useReducedMotion } from '../../lib/siteHeroMedia';
import { openSiteBooking } from '../../lib/siteBooking';
import SiteProtectedContactAction from '../SiteProtectedContactAction';
import { useIsOwnerPreview } from '../SiteRenderContext';
import { heroCtaClass, heroLinkProps } from '../../lib/siteHeroNav';
import type { ViewportMode } from '../../lib/siteStructure';
import { Star, MapPin, ArrowRight, Smile, Users, PlayCircle, CalendarCheck, Phone, MessageCircle, Images } from 'lucide-react';

interface Props {
  data: SalonData;
  mode: ViewportMode;
}

export default function FamilyHero({ data, mode }: Props) {
  const ownerPreview = useIsOwnerPreview();
  const locale = useSiteLocale();
  const appearance = useThemeAppearance('family_full_service');
  const t = surfacesOf(FAMILY_SURFACES, appearance);
  const H = heroText('family_full_service', locale);
  const headline = heroHeadline(data, H);
  const focus = heroFocusBadges(data, H.focus, 2, ownerPreview);
  const media = heroMedia('family_full_service', data);
  const meta = heroMeta('family_full_service', data);
  const reducedMotion = useReducedMotion();
  const plan = heroMediaPlan('family_full_service', data, reducedMotion);
  const cta = heroCtaOptions(data);
  const stat = heroStat(data, H);
  const compact = mode === 'mobile';
  // PHASE 11.4 — resolve from the renderer mode, not the browser viewport.
  const pad = heroModeValue(mode, { desktop: 'px-10 py-16', tablet: 'px-8 py-12', mobile: 'px-5 py-10' });
  const cols = heroModeValue(mode, { desktop: 'grid-cols-[1.05fr_0.95fr]', tablet: 'grid-cols-[1fr_1fr]', mobile: 'grid-cols-1' });
  const nameSize = heroModeValue(mode, { desktop: 'text-base', tablet: 'text-sm', mobile: 'text-sm' });
  const h1Size = heroModeValue(mode, { desktop: 'text-[3.3rem]', tablet: 'text-4xl', mobile: 'text-[2.5rem]' });
  const cardPad = heroModeValue(mode, { desktop: 'p-5', tablet: 'p-4', mobile: 'p-4' });

  const tealBtn: CSSProperties = { backgroundColor: t.teal, color: '#ffffff' };

  return (
    <section
      id="section-hero"
      data-site-section="hero"
      data-section-state="ready"
      data-testid="site-hero"
      data-hero-theme="family_full_service"
      data-hero-layout="action-card-collage"
      className="site-section relative overflow-hidden"
      style={{ backgroundColor: t.sky }}
    >
      <div className="absolute -right-24 -top-28 w-72 h-72 rounded-full" style={{ backgroundColor: t.skyDeep, opacity: 0.55 }} />
      <div className="absolute left-[-60px] bottom-[-80px] w-56 h-56 rounded-full border-[20px]" style={{ borderColor: 'rgba(7,159,154,0.14)' }} />

      <div className={`relative z-10 ${pad}`}>
        <div className={`grid gap-8 items-center ${cols}`}>
          {/* ---- Copy + quick-access action card ------------------- */}
          <div>
            <div data-testid="hero-brand" className="flex items-center gap-3">
              {data.logoUrl ? (
                <img
                  data-testid="hero-logo"
                  src={data.logoUrl}
                  alt={`${heroSalonName(data)} logo`}
                  className="w-11 h-11 rounded-2xl object-cover shadow-md"
                />
              ) : (
                <span
                  data-testid="hero-logo"
                  className="w-11 h-11 rounded-2xl flex items-center justify-center text-[12px] font-extrabold shadow-md"
                  style={{ backgroundColor: t.teal, color: '#ffffff' }}
                >
                  {heroLogoMark(data, 'family_full_service')}
                </span>
              )}
              <span
                data-testid="hero-salon-name"
                className={`${nameSize} font-extrabold tracking-[-0.02em]`}
                style={{ color: t.heading, ...getSalonNameStyle(data) }}
              >
                {heroSalonName(data)}
              </span>
            </div>

            <h1
              data-testid="hero-headline"
              className={`mt-6 font-extrabold leading-[0.98] tracking-[-0.05em] ${h1Size}`}
              style={{ color: t.heading }}
            >
              {headline.main}{' '}
              {!ownerPreview && (
                <><br /><span style={{ color: t.teal }}>{headline.accent}</span></>
              )}
            </h1>

            {/* Owner mode shows only focus labels proven by real services. */}
            {focus.length > 0 && (
            <div data-testid="hero-focus" className="mt-5">
              <span className="text-[9px] font-extrabold uppercase tracking-[0.2em]" style={{ color: t.blue }}>
                {H.focusLabel}
              </span>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {focus.map((label) => (
                  <span
                    key={label}
                    data-hero-focus-item={label}
                    className="rounded-full px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.16em] border"
                    style={{ borderColor: t.skyDeep, color: t.blue, backgroundColor: t.card }}
                  >
                    {label}
                  </span>
                ))}
              </div>
              {!ownerPreview && (
                <p data-testid="hero-audience" className="mt-3 text-[10px] font-bold" style={{ color: t.muted }}>
                  {H.audience}
                </p>
              )}
            </div>
            )}

            <p
              data-testid="hero-description"
              className="mt-5 max-w-md text-sm leading-relaxed"
              style={{ color: t.muted }}
            >
              {heroDescription(data, H.description)}
            </p>

            {/* Easy-access CTA block */}
            <div
              className={`mt-7 rounded-3xl border ${cardPad} shadow-lg`}
              style={{ backgroundColor: t.card, borderColor: t.line }}
            >
              {!ownerPreview && (
                <span className="flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: t.blue }}>
                  <CalendarCheck className="w-3.5 h-3.5" style={{ color: t.teal }} aria-hidden /> {H.chip2}
                </span>
              )}
              <div className={`grid gap-2.5 mt-3 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <button
                  type="button"
                  data-testid="hero-book-cta"
                  data-open-booking="true"
                  onClick={openSiteBooking}
                  className={heroCtaClass('family_full_service', "rounded-2xl px-5 py-4 text-[10px] font-extrabold uppercase tracking-[0.14em] flex items-center justify-center gap-2 shadow-md transition-transform hover:-translate-y-0.5")}
                  style={tealBtn}
                >
                  {H.primaryCta} <ArrowRight className="w-4 h-4" aria-hidden />
                </button>
                <a
                  data-testid="hero-services-cta"
                  {...heroLinkProps('family_full_service', 'services', reducedMotion)}
                  className={heroCtaClass('family_full_service', "rounded-2xl px-5 py-4 text-[10px] font-extrabold uppercase tracking-[0.14em] border flex items-center justify-center gap-2 transition-colors")}
                  style={{ borderColor: t.skyDeep, color: t.blue, backgroundColor: t.well }}
                >
                  {H.secondaryCta} <Users className="w-4 h-4" aria-hidden />
                </a>
              </div>

              {/* PHASE 11.3 — quick contact row inside the easy-access card */}
              {(cta.call || cta.whatsApp || cta.gallery) && (
                <div data-testid="hero-cta-secondary-row" className="grid gap-2 mt-2.5" style={{ gridTemplateColumns: `repeat(${[cta.call, cta.whatsApp, cta.gallery].filter(Boolean).length}, minmax(0, 1fr))` }}>
                  {cta.call && (
                    <SiteProtectedContactAction
                      action="call"
                      data={data}
                      themeId="family_full_service"
                      testId="hero-call-cta"
                      className={heroCtaClass('family_full_service', "rounded-xl py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] flex items-center justify-center gap-1.5")}
                      style={{ backgroundColor: t.well, color: t.blue }}
                    >
                      <Phone className="w-3.5 h-3.5" style={{ color: t.teal }} aria-hidden /> {H.callCta}
                    </SiteProtectedContactAction>
                  )}
                  {cta.whatsApp && (
                    <SiteProtectedContactAction
                      action="whatsapp"
                      data={data}
                      themeId="family_full_service"
                      testId="hero-whatsapp-cta"
                      className={heroCtaClass('family_full_service', "rounded-xl py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] flex items-center justify-center gap-1.5")}
                      style={{ backgroundColor: t.well, color: t.blue }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" style={{ color: t.teal }} aria-hidden /> {H.whatsAppCta}
                    </SiteProtectedContactAction>
                  )}
                  {cta.gallery && (
                    <a
                      data-testid="hero-gallery-cta"
                      {...heroLinkProps('family_full_service', 'gallery', reducedMotion)}
                      className={heroCtaClass('family_full_service', "rounded-xl py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] flex items-center justify-center gap-1.5")}
                      style={{ backgroundColor: t.well, color: t.blue }}
                    >
                      <Images className="w-3.5 h-3.5" style={{ color: t.teal }} aria-hidden /> {H.galleryCta}
                    </a>
                  )}
                </div>
              )}

              {/* Bright meta ribbon */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-3 border-t text-[10px] font-bold" style={{ borderColor: t.line, color: t.heading }}>
                {stat && (
                  <span data-testid="hero-stat" className="flex items-center gap-1.5">
                    <span className="text-base font-extrabold" style={{ color: t.teal }}>{stat.value}</span> {stat.label}
                  </span>
                )}
                {meta.rating && (
                  <span data-testid="hero-rating" className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5" style={{ color: t.sun, fill: t.sun }} aria-hidden />
                    {meta.rating.average.toFixed(1)} · {meta.rating.count} {H['hero.reviewsSuffix']}
                  </span>
                )}
                {meta.location && (
                  <span data-testid="hero-location" className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" style={{ color: t.teal }} aria-hidden /> {meta.location}
                  </span>
                )}
                <span data-testid="hero-status">
                  <SiteSalonStatus themeId="family_full_service" data={data} placement="announcement" compact />
                </span>
              </div>
            </div>
          </div>

          {/* ---- Friendly photo collage ---------------------------- */}
          {ownerPreview ? (
            <OwnerPreviewHeroMedia
              data={data}
              mode={mode}
              accent={t.teal}
              background={t.tealSoft}
              className="rounded-[2.2rem]"
              aspectRatio="4/3"
            />
          ) : (
          <div data-testid="hero-media" className={`relative ${compact ? 'min-h-[290px] mt-2' : 'min-h-[360px]'}`}>
            <div className="absolute inset-x-6 top-2 bottom-4 rounded-[2.2rem] rotate-3" style={{ backgroundColor: t.teal }} />
            {/* PHASE 11.3 — the big rotated tile carries the family media */}
            <HeroMediaFrame
              themeId="family_full_service"
              plan={plan}
              alt={H.mediaAlt}
              mode={mode}
              aspectRatio="4/3"
              className="absolute inset-x-0 top-0 h-[74%] rounded-[2.2rem] border-4 shadow-2xl -rotate-2"
              style={{ borderColor: t.card }}
              placeholderColor={t.tealSoft}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#12385b]/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 text-white">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-white/75">{H.mediaEyebrow}</p>
                  <p className="text-base font-extrabold mt-1">{H.mediaTitle}</p>
                </div>
                <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: t.sun, color: '#12385b' }}>
                  <Smile className="w-5 h-5" aria-hidden />
                </span>
              </div>
            </HeroMediaFrame>

            {/* Two overlapping tiles */}
            {media.support.map((visual, index) => (
              <div
                key={visual.url}
                className={`absolute rounded-3xl overflow-hidden border-4 shadow-xl ${
                  index === 0 ? 'left-0 bottom-0 w-[46%] rotate-3' : 'right-1 bottom-6 w-[38%] -rotate-6'
                }`}
                style={{ borderColor: t.card }}
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
              </div>
            ))}

            <div
              className="absolute -left-2 top-8 rounded-2xl px-3 py-2 shadow-xl border flex items-center gap-2"
              style={{ borderColor: t.line, backgroundColor: t.card }}
            >
              <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.sunSoft, color: t.coral }}>
                <Smile className="w-4 h-4" aria-hidden />
              </span>
              <div>
                <p className="text-[9px] font-extrabold" style={{ color: t.ink }}>{H.chip1}</p>
                <p className="text-[8px]" style={{ color: t.muted }}>{H.mediaBody}</p>
              </div>
            </div>

            {plan.externalVideo && (
              <a
                data-testid="hero-video"
                href={plan.externalVideo.src}
                target="_blank"
                rel="noreferrer"
                className={heroCtaClass('family_full_service', "absolute right-0 top-0 rounded-full px-3 py-2 text-[9px] font-extrabold uppercase tracking-[0.14em] shadow-lg inline-flex items-center gap-1.5")}
                style={{ backgroundColor: t.sun, color: '#12385b' }}
              >
                <PlayCircle className="w-3.5 h-3.5" aria-hidden /> {plan.externalVideo.title || H.videoCta}
              </a>
            )}
          </div>
          )}
        </div>
      </div>
    </section>
  );
}
