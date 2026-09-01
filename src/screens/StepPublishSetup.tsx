import React, { useState, useEffect } from 'react';
import { SalonData } from '../types';
import TemplateRenderer from '../components/TemplateRenderer';
import { ArrowLeft, ArrowRight, Globe, CheckCircle2, Link2, AlertCircle, Monitor, Smartphone, Circle, Check } from 'lucide-react';
import { useBrandConfig } from '../config/brandConfig';
import { unpublishOwnerSalonWebsite, verifyOwnerPublishReadiness } from '../lib/salonWebsiteService';
import { generateSalonSlug, publicWebsiteHref, publicWebsiteUrl, slugifySalonName } from '../lib/publicWebsiteUrl';
import { assertPublishPayloadComplete, saveAndPublishOwnerWebsite } from '../lib/saveAndPublish';
import { STEP_PUBLISH, STEP_PUBLISH_SUCCESS, TOTAL_OWNER_STEPS } from '../lib/ownerFlow';
import {
  evaluatePublishReadiness,
  PUBLISH_INCOMPLETE_ERROR,
  PUBLISH_READY_LABEL,
  type PublishReadiness,
} from '../lib/publishReadiness';

interface Props {
  data: SalonData;
  setData: React.Dispatch<React.SetStateAction<SalonData>>;
  onNext: () => void;
  onPrev: () => void;
  onSave?: () => void;
}

function generatedSlug(data: SalonData): string {
  // A PUBLISHED address is permanently allocated, so a business rename can
  // never break a link the owner already shared. Before publication the slug
  // tracks the real salon name: "Arts By Uma" → "arts-by-uma".
  if (data.publishState === 'published' && data.websiteSlug) return data.websiteSlug;
  return generateSalonSlug(data.salonName) || slugifySalonName(data.salonName) || 'salon';
}

function displayUrl(value: string): string {
  return value.replace(/^https?:\/\//, '');
}

export default function StepPublishSetup({ data, setData, onNext, onPrev, onSave }: Props) {
  const { platform } = useBrandConfig();
  const [slug, setSlug] = useState<string>(() => generatedSlug(data));
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [serverReady, setServerReady] = useState<PublishReadiness | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);

  useEffect(() => {
    setSlug(generatedSlug(data));
  }, [data.salonName, data.publishState, data.websiteSlug]);

  // Validate against the persisted business row too (migration M50). The
  // client rules stay the fallback when the validator RPC is not deployed.
  useEffect(() => {
    let active = true;
    const check = async () => {
      setCheckingReadiness(true);
      try {
        const result = await verifyOwnerPublishReadiness(data);
        if (active) setServerReady(result);
      } catch {
        if (active) setServerReady(null);
      } finally {
        if (active) setCheckingReadiness(false);
      }
    };
    void check();
    return () => { active = false; };
  }, [data.salonName, data.tagline, data.about, data.phone, data.email,
    data.whatsappPhone, data.services, data.templateId, data.websiteAppearance,
    data.reviewedContent, data.lastCompletedStep]);

  useEffect(() => {
    setData(prev => ({ ...prev, websiteSlug: slug }));
  }, [slug, setData]);

  const previewUrl = publicWebsiteHref(slug, platform.websiteUrl);

  const localReadiness = evaluatePublishReadiness(data);
  // The database validator (M50) is authoritative when it answers; otherwise
  // the existing client-side business rules are used.
  const readiness = serverReady ?? localReadiness;
  const checks = readiness.required;
  const optionalChecks = readiness.optional;
  const allRequiredDone = readiness.ready;

  // "Save & Publish": commit EVERY step 1–14 field first (business details,
  // logo, hero, gallery, services, offers, team, location and hours), then flip
  // the site live. A failed draft commit aborts instead of publishing a
  // half-saved salon.
  const handlePublish = async () => {
    // Re-validate at click time so a stale checklist can never publish.
    const clickReadiness = await verifyOwnerPublishReadiness(data);
    if (!clickReadiness.ready) {
      setPublishError(PUBLISH_INCOMPLETE_ERROR + clickReadiness.missingLabels.join('; '));
      setServerReady(clickReadiness);
      return;
    }
    const previousState = data.publishState;
    const previousUrl = data.publishedUrl;
    setPublishing(true);
    setPublishError(null);
    setData(prev => ({ ...prev, publishState: 'publishing', websiteSlug: slug }));
    if (onSave) onSave();
    try {
      // Guard against publishing an empty shell after a hydration race.
      assertPublishPayloadComplete({ ...data, websiteSlug: slug });
      const saved = await saveAndPublishOwnerWebsite({ ...data, websiteSlug: slug });
      if (!saved.isPublished || !saved.publishedAt) {
        throw new Error('The database did not confirm publication.');
      }
      const publishedUrl = publicWebsiteUrl(saved.slug, platform.websiteUrl);
      setData(prev => ({
        ...prev,
        salonId: saved.salonId,
        websiteSlug: saved.slug,
        publishState: 'published',
        publishedUrl,
        lastCompletedStep: STEP_PUBLISH_SUCCESS,
      }));
      if (onSave) onSave();
      setPublishing(false);
      onNext();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to publish your website.';
      setPublishError(message);
      setData(prev => ({
        ...prev,
        publishState: previousState === 'published' ? 'published' : 'draft',
        publishedUrl: previousUrl,
        websiteSlug: previousState === 'published' ? prev.websiteSlug : slug,
      }));
      setPublishing(false);
    }
  };

  // Only a database-confirmed publication can be displayed as live, and only
  // then can the owner take the site offline through the same RPC. Local
  // cache never participates: publishState/publishedUrl are set exclusively
  // from the publish/unpublish RPC response or from the hydrated DB draft.
  const isLive = data.publishState === 'published' && Boolean(data.publishedUrl);

  const handleUnpublish = async () => {
    setUnpublishing(true);
    setPublishError(null);
    try {
      const saved = await unpublishOwnerSalonWebsite(data);
      // Flip local state only from the database response.
      setData(prev => ({
        ...prev,
        salonId: saved.salonId,
        websiteSlug: saved.slug,
        publishState: saved.isPublished ? 'published' : 'draft',
        publishedUrl: saved.isPublished ? prev.publishedUrl : '',
      }));
      if (onSave) onSave();
      setConfirmingUnpublish(false);
    } catch (error) {
      setPublishError(
        error instanceof Error ? error.message : 'Unable to unpublish your website.',
      );
    } finally {
      setUnpublishing(false);
    }
  };

  const previewData: SalonData = {
    ...data,
    salonName: data.reviewedContent?.heroHeadline || data.salonName,
    tagline: data.reviewedContent?.tagline || data.tagline,
    about: data.reviewedContent?.about || data.about,
    services: data.services.map(s => ({
      ...s,
      description: data.reviewedContent?.serviceDescriptions?.[s.id] || s.description
    }))
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f9f9f9]" id="publish-setup-screen">
      {/* Top Main Section with Split View */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Publish Settings */}
        <div className="w-full md:w-[45%] h-full overflow-y-auto px-6 md:px-10 py-8 flex flex-col gap-6 pb-24 border-r border-gray-200">
          
          {/* Header section */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-[#ac0053] uppercase tracking-widest flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" /> STEP {STEP_PUBLISH + 1} OF {TOTAL_OWNER_STEPS} • PUBLISH
            </span>
            <h1
              className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight"
              data-testid="publish-readiness-status"
            >
              {checkingReadiness && !serverReady ? 'Checking your website…' : readiness.statusLabel}
            </h1>
            <p className="text-xs md:text-sm text-gray-500 leading-relaxed">
              {allRequiredDone
                ? 'Required business and website information is complete. Check your website address and publish when you are ready.'
                : 'Finish each required item below before this site can be published.'}
            </p>
          </div>

          {/* Exact incomplete list — existing business rules, never invented
              optional fields. */}
          {!allRequiredDone && readiness.missingLabels.length > 0 && (
            <div
              className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5"
              data-testid="publish-readiness-missing"
            >
              <h2 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3">
                Complete these items before publishing:
              </h2>
              <ul className="space-y-2">
                {readiness.missingLabels.map((label) => (
                  <li key={label} className="flex items-start gap-2 text-sm text-amber-900">
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-amber-700/80">
                {checkingReadiness ? 'Checking the saved business record…' : 'Team, gallery, offers and location details are optional and can be added later.'}
              </p>
            </div>
          )}

          {/* Publication state — the database is the only authority. */}
          <div
            className={`rounded-2xl border p-5 flex flex-col gap-3 ${isLive ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-200 bg-white'}`}
            data-testid="publication-state"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Publication state
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  isLive ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
                data-testid="publication-state-badge"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {isLive ? 'Live' : 'Draft — not public'}
              </span>
            </div>
            {isLive ? (
              <>
                <p className="text-xs text-gray-600">
                  Your website is live at{' '}
                  <span className="font-mono font-semibold text-gray-900 break-all">
                    {displayUrl(data.publishedUrl)}
                  </span>
                  . Unpublishing removes it from the public website immediately; your saved
                  business information and address stay reserved.
                </p>
                {confirmingUnpublish ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-xs font-semibold text-red-800">
                      Take your website offline? Visitors will see it as unavailable.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleUnpublish}
                        disabled={unpublishing}
                        className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {unpublishing ? 'Unpublishing…' : 'Yes, unpublish'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingUnpublish(false)}
                        disabled={unpublishing}
                        className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Keep live
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingUnpublish(true)}
                    className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-xs font-bold text-red-700 hover:bg-red-50"
                  >
                    Unpublish website
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-600">
                Your website is not visible to the public yet. Publish it to go live at the
                address above.
              </p>
            )}
          </div>

          {/* Website Address Section */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Website Address *
              </label>
              <div className="relative flex items-center">
                <input
                  className="w-full px-3.5 pr-10 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 font-mono text-sm outline-none font-semibold"
                  type="text"
                  value={previewUrl}
                  readOnly
                  aria-label="Automatically generated public website address"
                />
                <CheckCircle2 className="absolute right-3.5 text-emerald-500 w-5 h-5" />
              </div>
              <p className="mt-2 text-gray-500 font-medium text-xs flex items-center gap-1.5">
                Generated from your business name. If another business has the same name, Nexora adds a unique number when you publish.
              </p>
            </div>
          </div>

          {/* Website Checklist Section */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col gap-5">
            <div>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-1">
                Website Check
              </h3>
              <p className="text-[11px] text-gray-400">
                Ensure all essential criteria are satisfied before launching
              </p>
            </div>

            <div className="space-y-3">
              {/* Required Items */}
              {checks.map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  {item.done ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                  )}
                  <span className={`text-sm ${item.done ? 'text-gray-700 font-medium' : 'text-amber-600 font-semibold'}`}>
                    {item.label} {!item.done && '(Required)'}
                  </span>
                </div>
              ))}

              <div className="border-t border-gray-100 my-4"></div>

              {/* Optional Items */}
              {optionalChecks.map((item, index) => (
                <div key={index} className="flex items-center gap-3 opacity-70">
                  {item.done ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center shrink-0">
                      <Circle className="w-3 h-3 text-gray-400" />
                    </div>
                  )}
                  <span className="text-sm text-gray-500 font-medium">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {!allRequiredDone && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Please complete all required fields above to proceed with publishing.
              </div>
            )}
            {publishError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {publishError}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Final Website Preview */}
        <div className="hidden md:flex w-[55%] h-full bg-gray-100 flex-col">
          {/* Preview Controls Header */}
          <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
            <span className="text-xs font-bold text-gray-500 tracking-wide uppercase flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              Final Website Preview
            </span>
            <div className="flex bg-gray-100 rounded-xl p-1 border border-gray-200">
              <button
                onClick={() => setMode('desktop')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all duration-200 text-xs font-semibold ${
                  mode === 'desktop'
                    ? 'bg-white text-gray-950 shadow-sm font-bold'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Monitor className="w-4 h-4" /> Desktop
              </button>
              <button
                onClick={() => setMode('mobile')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all duration-200 text-xs font-semibold ${
                  mode === 'mobile'
                    ? 'bg-white text-gray-950 shadow-sm font-bold'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Smartphone className="w-4 h-4" /> Mobile
              </button>
            </div>
          </div>

          {/* Scrollable Preview Area */}
          <div className="flex-grow p-6 overflow-y-auto flex justify-center items-center relative">
            <div className="w-full h-full flex items-center justify-center overflow-hidden relative">
              <TemplateRenderer data={previewData} mode={mode} renderMode="owner-preview" />
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Bottom Bar */}
      <footer className="h-[76px] bg-white border-t border-gray-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-xs">
        <button
          onClick={onPrev}
          className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-xs hover:bg-gray-50 flex items-center gap-2 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Preview
        </button>
        <span className="hidden md:block text-xs font-semibold text-gray-400">
          {previewUrl}
        </span>
        <button
          disabled={!allRequiredDone || publishing}
          onClick={handlePublish}
          className="px-8 py-2.5 rounded-xl bg-[#ac0053] text-white font-bold text-xs hover:bg-[#ba005b] flex items-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {publishing ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Publishing…
            </>
          ) : (
            <>
              <Globe className="w-4 h-4" /> Publish Website
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
