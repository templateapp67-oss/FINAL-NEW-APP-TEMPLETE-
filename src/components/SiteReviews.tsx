import { useEffect, useState, type FormEvent } from 'react';
import { Quote, Star } from 'lucide-react';
import type { SalonData } from '../types';
import type { SiteHeaderThemeId } from '../lib/siteNavigation';
import { siteText } from '../lib/siteI18n';
import { structureText } from '../lib/siteStructureI18n';
import {
  resolveSectionState,
  sectionProps,
  siteGrid,
  siteSectionDomId,
} from '../lib/siteStructure';
import type { ViewportMode } from '../lib/siteStructure';
import {
  publicReviews,
  ratingSummary,
  reviewBusinessId,
  REVIEW_EVENT,
  REVIEW_REFRESH_EVENTS,
  submitReview,
  suggestedReviewerName,
  visitorReviews,
  type ReviewSubmitError,
} from '../lib/siteReviews';
import { reviewCountLabel, reviewsText } from '../lib/siteReviewsI18n';
import { reviewVisuals } from '../lib/siteReviewsTheme';
import { SectionStatePanel, structureCopyFrom } from './SiteSectionStates';
import { useSiteLocale, useThemeAppearance } from './SiteHeader';

interface Props {
  themeId: SiteHeaderThemeId;
  data: SalonData;
  mode: ViewportMode;
}

export default function SiteReviews({ themeId, data, mode }: Props) {
  const locale = useSiteLocale();
  const appearance = useThemeAppearance(themeId);
  const visual = reviewVisuals(themeId, appearance);
  const S = siteText(themeId, locale);
  const R = reviewsText(themeId, locale);
  const X = structureCopyFrom(structureText(themeId, locale));
  const businessId = reviewBusinessId(data);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sync = () => setTick((n) => n + 1);
    for (const event of REVIEW_REFRESH_EVENTS) {
      window.addEventListener(event, sync);
    }
    return () => {
      for (const event of REVIEW_REFRESH_EVENTS) {
        window.removeEventListener(event, sync);
      }
    };
  }, []);

  const approved = publicReviews(businessId, themeId);
  const mine = visitorReviews(businessId, themeId);
  void tick;
  const pendingMine = mine.filter((review) => review.status === 'pending');
  const summary = ratingSummary(approved);
  const state = resolveSectionState('reviews', approved);
  const sectionId = siteSectionDomId(themeId, 'reviews');
  const title = S.reviewsTitle || S.testimonialsTitle || R.write;
  const eyebrow = S.reviewsEyebrow || S.testimonialsEyebrow || S['common.reviewsEyebrow'];
  const subtitle = S.testimonialsBody;
  const palette = {
    accent: visual.accent,
    text: visual.textStrong,
    muted: visual.muted,
    card: visual.cardBg,
    line: visual.cardLine,
    invert: visual.invert,
  };

  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<ReviewSubmitError | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    if (!formOpen) return;
    const suggested = suggestedReviewerName(businessId, themeId);
    if (suggested && !name) setName(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, businessId, themeId]);

  const openForm = () => {
    setError(null);
    setJustSubmitted(false);
    setFormOpen(true);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = submitReview({
      businessId,
      themeId,
      customerName: name,
      rating,
      body,
    });
    if (!result.ok) {
      setError(result.error || 'invalid-body');
      setJustSubmitted(false);
      return;
    }
    setError(null);
    setJustSubmitted(true);
    setFormOpen(false);
    setRating(0);
    setBody('');
    window.dispatchEvent(new Event(REVIEW_EVENT));
  };

  return (
    <section
      {...sectionProps('reviews', state, sectionId)}
      data-testid="site-reviews"
      data-theme={themeId}
      data-appearance={appearance}
      className="site-section px-5 md:px-8 py-12 md:py-16"
      style={{ backgroundColor: visual.sectionBg }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <span className={visual.eyebrowClass} style={{ color: visual.accent }}>{eyebrow}</span>
          <h3 className={`${visual.headingClass} mt-3`} style={{ color: visual.textStrong }}>{title}</h3>
          {subtitle && (
            <p className="text-xs mt-3 max-w-md mx-auto" style={{ color: visual.muted }}>{subtitle}</p>
          )}
          <div
            data-testid="site-reviews-summary"
            className="mt-5 inline-flex flex-wrap items-center justify-center gap-3"
          >
            <span data-testid="site-reviews-average" className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: visual.textStrong }}>
              <Star className="w-4 h-4" style={{ color: visual.star, fill: summary.count ? visual.star : 'transparent' }} />
              {summary.count ? summary.average.toFixed(1) : '—'}
              <span className="sr-only">{R.averageLabel}</span>
            </span>
            <span data-testid="site-reviews-count" className="text-[11px] font-semibold" style={{ color: visual.muted }}>
              {reviewCountLabel(R, summary.count)}
            </span>
          </div>
          <div className="mt-5">
            <button
              type="button"
              data-testid="site-reviews-write"
              className={visual.buttonClass}
              style={visual.buttonStyle}
              onClick={openForm}
            >
              {R.write}
            </button>
          </div>
        </div>

        {justSubmitted && (
          <div
            data-testid="site-reviews-pending"
            className={`mb-6 border px-4 py-3 text-center ${visual.radius}`}
            style={{ borderColor: visual.cardLine, backgroundColor: visual.cardBg, color: visual.textStrong }}
          >
            <p className="text-sm font-bold">{R.pendingTitle}</p>
            <p className="text-xs mt-1" style={{ color: visual.muted }}>{R.pendingBody}</p>
          </div>
        )}

        {formOpen && (
          <form
            data-testid="site-reviews-form"
            onSubmit={onSubmit}
            className={`mb-8 border p-5 space-y-4 ${visual.radius}`}
            style={{ borderColor: visual.cardLine, backgroundColor: visual.cardBg }}
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: visual.muted }}>{R.ratingLabel}</p>
              <div data-testid="site-reviews-rating" className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-testid={`site-reviews-rating-${value}`}
                    aria-pressed={rating === value}
                    aria-label={`${value}`}
                    className="site-touch p-1"
                    onClick={() => setRating(value)}
                  >
                    <Star
                      className="w-6 h-6"
                      style={{ color: visual.star, fill: value <= rating ? visual.star : 'transparent' }}
                    />
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: visual.muted }}>{R.nameLabel}</span>
              <input
                data-testid="site-reviews-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={R.namePlaceholder}
                className={`mt-1.5 w-full px-3 py-2.5 text-sm outline-none ${visual.radius || ''}`}
                style={{ backgroundColor: visual.inputBg, color: visual.textStrong, border: `1px solid ${visual.cardLine}` }}
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: visual.muted }}>{R.bodyLabel}</span>
              <textarea
                data-testid="site-reviews-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={R.bodyPlaceholder}
                rows={4}
                className={`mt-1.5 w-full px-3 py-2.5 text-sm outline-none resize-y ${visual.radius || ''}`}
                style={{ backgroundColor: visual.inputBg, color: visual.textStrong, border: `1px solid ${visual.cardLine}` }}
              />
            </label>
            {error && (
              <p data-testid="site-reviews-error" className="text-xs font-semibold" style={{ color: visual.accent }}>
                {R.errors[error]}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" data-testid="site-reviews-submit" className={visual.buttonClass} style={visual.buttonStyle}>
                {R.submit}
              </button>
              <button
                type="button"
                data-testid="site-reviews-cancel"
                className={visual.buttonClass}
                style={visual.ghostStyle}
                onClick={() => setFormOpen(false)}
              >
                {R.cancel}
              </button>
            </div>
          </form>
        )}

        {pendingMine.length > 0 && !justSubmitted && (
          <div className="mb-6 space-y-3">
            {pendingMine.map((review) => (
              <article
                key={review.id}
                data-testid={`site-review-pending-${review.id}`}
                className={`border p-4 ${visual.radius}`}
                style={{ borderColor: visual.cardLine, backgroundColor: visual.cardBg }}
              >
                <span className="text-[9px] font-extrabold uppercase tracking-[0.16em]" style={{ color: visual.accent }}>{R.pendingBadge}</span>
                <p className="text-xs mt-2 italic" style={{ color: visual.text }}>{review.body}</p>
                <p className="text-[11px] font-bold mt-2" style={{ color: visual.textStrong }}>{review.customerName}</p>
              </article>
            ))}
          </div>
        )}

        {state === 'ready' ? (
          <div className={`grid gap-4 ${siteGrid(mode, { desktop: 3, tablet: 2, mobile: 1 })}`}>
            {approved.map((review) => (
              <article
                key={review.id}
                data-testid="site-review-card"
                data-review-id={review.id}
                data-theme={themeId}
                className={`border p-5 flex flex-col gap-3 min-w-0 ${visual.radius}`}
                style={{ borderColor: visual.cardLine, backgroundColor: visual.cardBg }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex gap-0.5" aria-label={`${review.rating}`}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className="w-3.5 h-3.5"
                        style={{ color: visual.star, fill: star <= review.rating ? visual.star : 'transparent' }}
                      />
                    ))}
                  </div>
                  <Quote className="w-5 h-5" style={{ color: visual.accent }} />
                </div>
                <p className="text-xs leading-relaxed italic flex-1 break-words" style={{ color: visual.text }}>
                  “{review.body}”
                </p>
                <div className="pt-3 border-t" style={{ borderColor: visual.cardLine }}>
                  <p className="text-xs font-bold" style={{ color: visual.textStrong }}>{review.customerName}</p>
                  {review.serviceName && (
                    <p className="text-[10px] uppercase tracking-[0.14em] mt-0.5" style={{ color: visual.accent }}>{review.serviceName}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <SectionStatePanel
            status={state}
            copy={X}
            palette={palette}
            emptyTitle={R.emptyTitle}
            emptyBody={R.emptyBody}
            section="reviews"
            mode={mode}
          />
        )}
      </div>
    </section>
  );
}
