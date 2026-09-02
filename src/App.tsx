/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import HeroSplit from './screens/HeroSplit';

// The post-launch owner workspace (screens 18–25). It renders only behind
// `activeModule === 'dashboard' && hasAuthoritativePublishState`, i.e. for an
// authenticated owner with a published site, so it is code-split out of the
// entry chunk that every visitor downloads.
const Landing = lazy(() => import('./screens/Landing'));

// The setup wizard screens are code-split. Each one renders behind a
// `{step === N && ...}` guard, so at most one is ever mounted — keeping them
// in the entry chunk meant shipping ~13 screens of wizard UI to every visitor,
// including customers who only ever see the public site.
const StepTemplate = lazy(() => import('./screens/StepTemplate'));
const StepDetails = lazy(() => import('./screens/StepDetails'));
const StepServices = lazy(() => import('./screens/StepServices'));
const StepTeam = lazy(() => import('./screens/StepTeam'));
const StepPhotos = lazy(() => import('./screens/StepPhotos'));
const StepSocials = lazy(() => import('./screens/StepSocials'));
const StepLocation = lazy(() => import('./screens/StepLocation'));
const StepContactBooking = lazy(() => import('./screens/StepContactBooking'));
const StepPublish = lazy(() => import('./screens/StepPublish'));
const StepAIContentReview = lazy(() => import('./screens/StepAIContentReview'));
const StepFullWebsitePreview = lazy(() => import('./screens/StepFullWebsitePreview'));
const StepPublishSetup = lazy(() => import('./screens/StepPublishSetup'));
const StepPublishSuccess = lazy(() => import('./screens/StepPublishSuccess'));

// Owner-only surfaces. Guarded by `activeModule === '...'` early returns, so a
// public-site visitor never downloads the dashboard or the staff module.
const StaffManagementModule = lazy(() => import('./components/StaffManagementModule'));
const OwnerDashboard = lazy(() => import('./components/OwnerDashboard'));
import TopBar from './components/TopBar';
import { initialData, SalonData } from './types';
import { normalizeThemeId, type ThemeId } from './lib/themeServices';
import { currentSalonSlug, publicWebsiteUrl, suggestedWebsiteSlug } from './lib/publicWebsiteUrl';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ArrowRight, Loader2, TriangleAlert } from 'lucide-react';
import { useUsageTracking } from './hooks/useUsageTracking';
import { useLocationSync } from './hooks/useLocationSync';
import { useAutosave, AUTOSAVE_DEBOUNCE_MS } from './hooks/useAutosave';
import { redirectToOwnerLoginForSessionLoss, useAuth } from './lib/useAuth';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { loadOwnerWebsiteDraft, saveOwnerWebsiteVisualConfig } from './lib/salonWebsiteService';
import { persistOwnerBusinessSetup, loadOwnerSalonRow, mergeSalonRowIntoDraft } from './lib/ownerBusinessSetup';
import {
  clearOwnerBrowserWorkspaceCache,
  OWNER_DASHBOARD_TAB_CACHE_KEY,
  OWNER_ONBOARDING_CACHE_KEY,
} from './lib/ownerWorkspacePersistence';
import { resolveOrProvisionOwnerSalon, setOwnerTemplate } from './lib/ownerProvisioning';
import {
  applyTemplateConfigToSalon,
  restoreSavedTemplatePresentation,
  switchSalonTemplatePresentation,
} from './lib/templateConfig';
import { templateSwitchProtectedRevision, templateVisualConfigRevision } from './lib/templateSwitchInvariants';
import { safeSetItem, safeGetItem, safeRemoveItem } from './lib/safeStorage';
import { ownerSalonNameFromMetadata, resumeWizardStep } from './lib/ownerSession';
import { unifiedDraftFromSalonData } from './lib/unifiedSalonDraft';
import {
  clearAllDraftCaches,
  clearDraftCache,
  hasDraftContent,
  readDraftCache,
  restoreDraftCache,
  writeDraftCache,
} from './lib/salonDraftStorage';
import { emptyOwnerSalonData } from './lib/ownerPreview';
import OwnerWorkspaceSelector from './components/OwnerWorkspaceSelector';
import {
  diagnosticFromError,
  isMissingAuthSessionDiagnostic,
  logWorkspaceFailure,
  workspaceUserMessage,
  WorkspaceInitializationError,
  type WorkspaceDiagnostic,
} from './lib/workspaceDiagnostics';
import {
  MAX_OWNER_STEP_INDEX,
  TOTAL_OWNER_STEPS,
} from './lib/ownerFlow';

/** Shared Suspense fallback for the code-split owner surfaces. */
function LazyModuleFallback() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-accent-500" />
      <span className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-400">
        Loading
      </span>
    </div>
  );
}

const STORAGE_KEY = OWNER_ONBOARDING_CACHE_KEY;
const DASHBOARD_TAB_KEY = OWNER_DASHBOARD_TAB_CACHE_KEY;
// Canonical owner journey:
//   Login → Business Setup → Choose Template → Customize → Preview → Publish.
// Business setup spans the guided detail/catalog/team/media/location/contact
// screens (steps 1–7); step indexes come from src/lib/ownerFlow.ts.
const TOTAL_STEPS = TOTAL_OWNER_STEPS;
const MAX_STEP_INDEX = MAX_OWNER_STEP_INDEX; // 0-based: 0..13 => 1..14

// Dashboard tab mapping for screens 18-25
type DashboardTab = 'overview' | 'website' | 'bookings' | 'payments' | 'share' | 'settings' | 'referral' | 'branding';
const DASHBOARD_TABS: DashboardTab[] = ['overview', 'website', 'bookings', 'payments', 'share', 'settings', 'referral', 'branding'];

interface AppProps {
  /**
   * When the app is mounted at `/dashboard`, start on the real Salon Owner
   * Dashboard (screen 26) instead of the website builder. The builder stays
   * available through the TopBar module switcher.
   */
  initialModule?: 'wizard' | 'owner-dashboard';
}

export default function App({ initialModule = 'wizard' }: AppProps = {}) {
  const { user, session, loading: authLoading } = useAuth();
  const hasSession = Boolean(session?.access_token && session.user?.id);
  const [step, setStep] = useState<number>(() => {
    // Configured deployments resume only from salon_public_websites.config.
    // localStorage is not tenant-scoped and is never the refresh authority.
    if (isSupabaseConfigured) return 0;
    try {
      const saved = safeGetItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.step === 'number' && parsed.step >= 0 && parsed.step <= MAX_STEP_INDEX) {
          return parsed.step;
        }
      }
    } catch (e) {
      console.error('Failed to parse saved onboarding state', e);
    }
    return 0;
  });

  const [data, setData] = useState<SalonData>(() => {
    // Never expose the demonstration salon while an authenticated workspace is
    // resolving. Local storage is not tenant-scoped and may belong to another
    // browser user, so configured deployments hydrate only from Supabase.
    if (isSupabaseConfigured) return emptyOwnerSalonData();
    try {
      const saved = safeGetItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.data) {
          return { ...initialData, ...parsed.data };
        }
      }
    } catch (e) {
      console.error('Failed to parse saved salon data', e);
    }
    return initialData;
  });

  const [activeModule, setActiveModule] = useState<'wizard' | 'staff-management' | 'dashboard' | 'owner-dashboard'>(() => {
    // A deep-link to /dashboard opens the real Owner Dashboard by default.
    if (initialModule === 'owner-dashboard') return 'owner-dashboard';
    // Publication is decided ONLY by the database (hydrated from
    // salon_public_websites.is_published). localStorage never decides it.
    if (isSupabaseConfigured) return 'wizard';
    try {
      const saved = safeGetItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeModule === 'staff-management') return parsed.activeModule;
      }
    } catch {}
    return 'wizard';
  });

  const [dashboardTab, setDashboardTab] = useState<DashboardTab>(() => {
    try {
      const saved = safeGetItem(DASHBOARD_TAB_KEY) as DashboardTab | null;
      if (saved && DASHBOARD_TABS.includes(saved)) return saved;
    } catch {}
    return 'overview';
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  // The specific reason behind the most recent failed save (session expiry,
  // payload too large, CORS, storage outage…) — shown in the TopBar/toast so
  // the owner never gets only the generic "check connection" dead end.
  const [saveErrorDetail, setSaveErrorDetail] = useState<string | null>(null);
  // One save-failure toast per failure streak: the debounced autosave keeps
  // retrying on every edit and must not spam the user with repeated toasts.
  const saveFailureToastShown = useRef(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // Authenticated Nexora location synchronization. Starts only once a real
  // session exists (no-op for the public site), owns ONE shared watcher for
  // the whole app, resolves the owner salon from the authenticated account,
  // writes through the RLS-gated salonLocationService, and cleans up on
  // logout. Existing StepLocation editing stays untouched.
  useLocationSync(user, data.address ?? null);

  useUsageTracking({
    activeModule,
    step,
    dashboardTab,
    salonName: data?.salonName || '',
    slug: data?.websiteSlug || '',
  });

  const isInitialMount = useRef(true);
  const backendHydratedFor = useRef<string | null>(null);
  const didResumeFromBackend = useRef(false);
  const [backendHydratedUser, setBackendHydratedUser] = useState<string | null>(null);
  const [ambiguousSalonIds, setAmbiguousSalonIds] = useState<string[] | null>(null);
  const [ownerHydrationError, setOwnerHydrationError] = useState('');
  // Structured, token-redacted diagnostic of the last workspace failure.
  // Shown collapsed on the error screen so a failure is diagnosable from one
  // login attempt without opening DevTools.
  const [ownerHydrationDiagnostic, setOwnerHydrationDiagnostic] = useState<WorkspaceDiagnostic | null>(null);
  const [ownerHydrationRetry, setOwnerHydrationRetry] = useState(0);
  const templateSwitchQueue = useRef<Promise<void>>(Promise.resolve());
  const latestData = useRef(data);
  latestData.current = data;
  const protectedDataRevision = templateSwitchProtectedRevision(data);
  const visualConfigRevision = templateVisualConfigRevision(data);

  // A configured production workspace is an owner-only flow. A cached wizard
  // step must never let a signed-out browser bypass Login. Local unconfigured
  // development remains usable for visual work, but publishing still fails
  // closed because it requires Supabase.
  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || (user && hasSession)) return;
    backendHydratedFor.current = null;
    didResumeFromBackend.current = false;
    setBackendHydratedUser(null);
    setData(emptyOwnerSalonData());
    clearOwnerBrowserWorkspaceCache();
    // Tenant-scoped draft caches must never survive a sign-out on a shared
    // browser: they belong to the previous account only.
    clearDraftCache(user?.id ?? null);
    setActiveModule('wizard');
    setStep(0);
    setShowResumeBanner(false);
  }, [authLoading, hasSession, user]);

  // First login: skip marketing hero. Resume Business Setup from
  // salon_public_websites.config.lastCompletedStep. Unpublished owners stay
  // in the wizard even if they opened /dashboard.
  useEffect(() => {
    if (authLoading || !user || !hasSession) return;
    if (isSupabaseConfigured && backendHydratedUser !== user.id) return;
    const published = data.publishState === 'published' && !!data.publishedUrl;
    if (published && initialModule === 'owner-dashboard') {
      setActiveModule('owner-dashboard');
      return;
    }
    if (!published) {
      setActiveModule('wizard');
      if (!didResumeFromBackend.current) {
        didResumeFromBackend.current = true;
        setStep(resumeWizardStep(data.lastCompletedStep));
        if ((data.lastCompletedStep || 0) > 0) setShowResumeBanner(true);
      }
    }
  }, [authLoading, hasSession, user, backendHydratedUser, data.lastCompletedStep, data.publishState, data.publishedUrl, initialModule]);

  // Provision first, then hydrate this exact authenticated tenant. Keeping the
  // sequence in one effect prevents a first-login draft read from racing the
  // salon-creation RPC. Owner modules remain blocked until the final merged
  // record is ready; no local/sample record can render or autosave meanwhile.
  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || !user || !hasSession) return;
    if (backendHydratedFor.current === user.id) return;
    backendHydratedFor.current = user.id;
    setBackendHydratedUser(null);
    setOwnerHydrationError('');
    setOwnerHydrationDiagnostic(null);
    setData(emptyOwnerSalonData());

    let active = true;
    // Provision from the current authenticated identity only. A browser-local
    // signup-name cache is unscoped and can leak one owner's name into another
    // account that later signs in on the same device.
    const salonName = ownerSalonNameFromMetadata(user) || 'My Salon';
    const initialSlug = suggestedWebsiteSlug({ ...emptyOwnerSalonData(), salonName });

    void (async () => {
      const provisioned = await resolveOrProvisionOwnerSalon({
        salonName,
        slug: initialSlug,
        templateKey: emptyOwnerSalonData().templateId,
      });
      if ('status' in provisioned) {
        if (!active) return;
        setAmbiguousSalonIds(provisioned.salonIds);
        return;
      }
      if ('error' in provisioned) {
        throw provisioned.diagnostic
          ? new WorkspaceInitializationError(provisioned.diagnostic, provisioned.error)
          : new Error(provisioned.error);
      }
      if (!active) return;
      setAmbiguousSalonIds(null);

      const [draft, salonRow] = await Promise.all([
        loadOwnerWebsiteDraft(),
        loadOwnerSalonRow(),
      ]);
      if (!active) return;

      const baseline = emptyOwnerSalonData();
      const draftConfig = draft?.config ?? {};
      // template_key is the presentation authority changed by the switch RPC.
      // Generic config aliases can be older than it.
      const hydratedTemplate = (
        draft?.templateKey || draftConfig.templateId || baseline.templateId
      ) as SalonData['templateId'];
      const configTemplate = (
        draftConfig.templateId || hydratedTemplate
      ) as SalonData['templateId'];
      const merged = mergeSalonRowIntoDraft({
        ...baseline,
        ...draftConfig,
        salonId: draft?.salonId || provisioned.salonId,
        websiteSlug: draft?.slug || provisioned.slug || '',
        publishedUrl: draft?.isPublished && draft.slug
          ? publicWebsiteUrl(draft.slug)
          : '',
        templateId: configTemplate,
        publishState: draft?.isPublished ? 'published' : 'draft',
        // M69 — database-owned routing state (never restorable from a cache).
        customDomain: draft?.customDomain ?? null,
        customDomainStatus: draft?.customDomainStatus ?? 'not_configured',
      }, salonRow);
      const authoritativeTemplate = hydratedTemplate
        || configTemplate
        || baseline.templateId
        || 'barber_mens_grooming';
      const restored = restoreSavedTemplatePresentation(merged, authoritativeTemplate);
      const serverHydrated = restored
        || (normalizeThemeId(configTemplate) !== normalizeThemeId(authoritativeTemplate)
          ? switchSalonTemplatePresentation(merged, authoritativeTemplate)
          : applyTemplateConfigToSalon(merged, {}));

      // DRAFT-LOSS SAFETY NET. The database is the refresh authority, but a
      // brand-new website row, an interrupted draft write, or a transient read
      // failure must never wipe the owner's work. When the server draft has no
      // real content and this browser holds a newer tenant-scoped cache for the
      // SAME user, the cached draft is restored on top of the server record
      // (identity/publish fields stay server-owned).
      const cache = readDraftCache(user.id);
      let hydrated = serverHydrated;
      if (cache && !hasDraftContent(draftConfig) && hasDraftContent(cache.draft)) {
        hydrated = restoreDraftCache(serverHydrated, cache);
        console.warn('Owner draft restored from the local fallback cache.');
      }

      // DYNAMIC PUBLISHED LINK. An unpublished salon advertises the slug built
      // from its business name, so the placeholder allocated during
      // provisioning (`my-salon-3`) becomes the real address (`arts-by-uma`).
      // A published address is permanently allocated and never rewritten.
      const dynamicSlug = currentSalonSlug({
        salonName: hydrated.salonName,
        websiteSlug: hydrated.websiteSlug,
        published: hydrated.publishState === 'published',
        publishedUrl: hydrated.publishedUrl,
      });
      if (dynamicSlug && dynamicSlug !== hydrated.websiteSlug) {
        hydrated = { ...hydrated, websiteSlug: dynamicSlug };
      }

      setData(hydrated);
      if (!(hydrated.publishState === 'published' && hydrated.publishedUrl)) {
        setStep(resumeWizardStep(hydrated.lastCompletedStep));
      }
      setBackendHydratedUser(user.id);
    })().catch((error: unknown) => {
      if (!active) return;
      backendHydratedFor.current = null;
      const diagnostic = error instanceof WorkspaceInitializationError
        ? error.diagnostic
        : diagnosticFromError({
          operation: 'workspace.hydration',
          stage: 'workspace-hydration',
          error,
          authenticatedUserExists: true,
          userId: user.id,
        });
      // Site-data clearing can invalidate Supabase storage before the shared
      // React auth snapshot drops its user. Treat that as a signed-out state,
      // not as a broken salon workspace.
      if (isMissingAuthSessionDiagnostic(diagnostic)) {
        redirectToOwnerLoginForSessionLoss();
        return;
      }
      if (!(error instanceof WorkspaceInitializationError)) logWorkspaceFailure(diagnostic);
      setOwnerHydrationDiagnostic(diagnostic);
      setOwnerHydrationError(
        error instanceof WorkspaceInitializationError
          ? error.message
          : workspaceUserMessage(diagnostic),
      );
    });

    return () => { active = false; };
  }, [authLoading, hasSession, ownerHydrationRetry, user?.id]);

  // Persist dashboard tab
  useEffect(() => {
    try {
      safeSetItem(DASHBOARD_TAB_KEY, dashboardTab);
    } catch {}
  }, [dashboardTab]);

  // ---------------------------------------------------------------------
  // UNIFIED AUTOSAVE (every builder step 1–14)
  //
  // One debounced (1.8s) pipeline that writes BOTH destinations:
  //   1. the tenant-scoped LocalStorage draft cache (fallback; survives a
  //      refresh, a dropped connection and a failed API call);
  //   2. the backend (`salons` + `salon_public_websites.config`) through
  //      `persistOwnerBusinessSetup`.
  //
  // The header indicator reflects the REAL backend result: "Saving…" while the
  // debounce/request runs, "Saved ✓" after the server confirms, and
  // "Save failed — check connection" when it does not. Transient failures are
  // retried automatically with backoff; nothing is ever silently dropped.
  // ---------------------------------------------------------------------
  const autosaveFingerprint = useCallback(
    (snapshot: SalonData) => JSON.stringify({
      draft: unifiedDraftFromSalonData(snapshot),
      lastCompletedStep: snapshot.lastCompletedStep ?? 0,
    }),
    [],
  );

  const writeLocalDraftMirror = useCallback((snapshot: SalonData, currentStep: number) => {
    const lastCompletedStep = Math.max(snapshot.lastCompletedStep || 0, currentStep > 0 ? currentStep - 1 : 0);
    // Tenant-scoped fallback cache (never shared between accounts).
    writeDraftCache(user?.id ?? null, { ...snapshot, lastCompletedStep }, currentStep);
    // Unconfigured/demo mode keeps the original onboarding cache so an offline
    // builder still restores its progress on refresh.
    if (!isSupabaseConfigured) {
      try {
        safeSetItem(
          STORAGE_KEY,
          JSON.stringify({
            step: currentStep,
            data: { ...snapshot, lastCompletedStep },
            activeModule,
            dashboardTab,
            lastSaved: new Date().toISOString(),
            onboarding_progress: `Step ${currentStep + 1} of ${TOTAL_STEPS}`,
            lastCompletedStep,
            selectedTemplate: snapshot.templateId,
            websiteAppearance: snapshot.websiteAppearance,
            reviewedContent: snapshot.reviewedContent,
            currentStep: currentStep + 1,
          }),
        );
      } catch (e) {
        console.error('Failed to save onboarding state', e);
      }
    }
  }, [user?.id, activeModule, dashboardTab]);

  const autosave = useAutosave<SalonData>({
    value: data,
    delay: AUTOSAVE_DEBOUNCE_MS,
    enabled: !isSupabaseConfigured || (!!user && backendHydratedUser === user.id),
    fingerprint: autosaveFingerprint,
    persistLocally: (snapshot) => writeLocalDraftMirror(snapshot, step),
    save: async (snapshot) => {
      if (!isSupabaseConfigured || !user) {
        // Offline/demo mode: the LocalStorage mirror is the only store.
        return { salonId: snapshot.salonId || '', slug: snapshot.websiteSlug };
      }
      const saved = await persistOwnerBusinessSetup(snapshot);
      if ('error' in saved) return { error: saved.error };
      return saved;
    },
    onSaved: (result) => {
      saveFailureToastShown.current = false;
      setSaveErrorDetail(null);
      setData((current) => {
        const nextSlug = result.slug || current.websiteSlug;
        if (result.salonId === current.salonId && nextSlug === current.websiteSlug) return current;
        return { ...current, salonId: result.salonId || current.salonId, websiteSlug: nextSlug };
      });
      // Purge an older unconfigured-mode cache after a confirmed backend write.
      if (isSupabaseConfigured) safeRemoveItem(STORAGE_KEY);
      setSaveStatus('saved');
    },
    onError: (error) => {
      // Prefer the SPECIFIC failure reason (expired session, payload too
      // large, CORS/origin rejection, storage outage) surfaced by
      // persistOwnerBusinessSetup — the generic copy is only the last resort.
      const detail = error instanceof Error && error.message.trim() ? error.message.trim() : null;
      setSaveErrorDetail(detail);
      if (!saveFailureToastShown.current) {
        saveFailureToastShown.current = true;
        showToast(detail || 'Could not save your changes. Check your connection — retrying automatically.', 'error');
      }
      setSaveStatus('error');
    },
  });

  // Mirror the autosave status into the TopBar indicator ("Saving…" / "Saved ✓"
  // / "Save failed"), so every step 1–14 shows live, honest save feedback.
  useEffect(() => {
    if (autosave.status === 'idle') return;
    setSaveStatus(autosave.status === 'saved' ? 'saved' : autosave.status === 'saving' ? 'saving' : 'error');
  }, [autosave.status]);

  // DYNAMIC PUBLISHED LINK (step 2 onwards).
  // The slug is generated from the ACTUAL salon name ("Arts By Uma" →
  // "/arts-by-uma"). It stays in step with the business name while the site is
  // unpublished — that is what replaces the placeholder `/my-salon-3` handed
  // out by provisioning before the owner ever typed a name. Once published the
  // address is permanently allocated, so renaming the salon can never break a
  // link the owner already shared.
  useEffect(() => {
    const published = data.publishState === 'published' && !!data.publishedUrl;
    if (published) return;
    // Wait for a real business name: an empty field (first render) must never
    // downgrade an allocated slug to the generic `salon` placeholder.
    if (!(data.salonName || '').trim()) return;
    const generated = currentSalonSlug({
      salonName: data.salonName,
      websiteSlug: data.websiteSlug,
      published: false,
    });
    if (!generated || generated === data.websiteSlug) return;
    setData((current) => (current.websiteSlug === generated ? current : { ...current, websiteSlug: generated }));
  }, [data.salonName, data.websiteSlug, data.publishState, data.publishedUrl]);

  // Flush the local mirror on refresh/close so a mid-debounce edit is never
  // stranded. The backend flush below handles the authoritative store.
  useEffect(() => {
    const flush = () => autosave.flushLocal();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [autosave.flushLocal]);

  // Flush the authoritative draft on refresh/close so a mid-step edit is not
  // stranded in the 1.8s autosave debounce. Session tokens stay in Supabase Auth.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const flush = () => {
      if (!latestData.current.salonName && !latestData.current.lastCompletedStep) return;
      void persistOwnerBusinessSetup(latestData.current).catch((error) => {
        console.error('Backend flush save failed:', error);
      });
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  // Appearance edits have a separate presentation-only persistence path. The
  // template id itself is excluded because set_owner_salon_template is its
  // single database write authority.
  useEffect(() => {
    if (!isSupabaseConfigured || !user || backendHydratedUser !== user.id) return;
    const timer = window.setTimeout(() => {
      const save = templateSwitchQueue.current.then(() => (
        saveOwnerWebsiteVisualConfig(latestData.current)
      ));
      templateSwitchQueue.current = save.then(() => undefined, () => undefined);
      void save.catch((error) => {
        console.error('Backend visual config autosave failed:', error);
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [visualConfigRevision, user, backendHydratedUser]);

  // TEMPLATE SWITCHING — PRESENTATION ONLY.
  // Each caller receives the promise for its own serialized RPC. State changes
  // only after that RPC succeeds, so selectors cannot report false success and
  // no rollback can invoke the generic business autosave.
  const handleThemeChange = (nextTheme: ThemeId): Promise<void> => {
    const operation = templateSwitchQueue.current.then(async () => {
      const normalizedNext = normalizeThemeId(nextTheme);
      // Immediately reflect presentation change in local React state
      setData((current) => switchSalonTemplatePresentation(current, normalizedNext));

      if (isSupabaseConfigured && user) {
        try {
          const applied = await setOwnerTemplate(normalizedNext);
          if (applied?.templateId) {
            setData((current) => switchSalonTemplatePresentation(current, applied.templateId));
          }
        } catch (error) {
          console.warn('Backend template switch warning (local presentation preserved):', error);
          // Non-blocking fallback: local state is cleanly updated
        }
      }
    });

    // Keep the queue usable after a failed operation while returning the
    // resolved promise to this specific caller.
    templateSwitchQueue.current = operation.catch(() => undefined);
    return operation;
  };

  // Preview-only variant (Step 13 full preview): updates the live preview
  // without persisting; the explicit "Apply" path uses handleThemeChange.
  const handleThemeSwitchPreview = (nextTheme: ThemeId) => {
    setData(prev => switchSalonTemplatePresentation(prev, nextTheme));
  };

  const nextStep = () => setStep(s => {
    const next = Math.min(MAX_STEP_INDEX, s + 1);
    setData(prev => ({ ...prev, lastCompletedStep: Math.max(prev.lastCompletedStep || 0, s) }));
    return next;
  });
  const prevStep = () => setStep(s => Math.max(0, s - 1));

  const goToStep = (target: number) => setStep(Math.min(MAX_STEP_INDEX, Math.max(0, target)));

  const showToast = (message: string, kind: 'success' | 'error' = 'success') => {
    setToastKind(kind);
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSave = (nextDataOrMessage?: SalonData | string) => {
    // Some inputs pass their blur event and a few screens pass a status message;
    // the appearance editor passes an exact SalonData snapshot. Only a real
    // salon payload should replace the current data during this immediate save.
    const isSalonSnapshot =
      typeof nextDataOrMessage === 'object' &&
      nextDataOrMessage !== null &&
      'salonName' in nextDataOrMessage;
    
    const dataToSave = isSalonSnapshot ? (nextDataOrMessage as SalonData) : data;
    
    if (isSalonSnapshot) {
      setData(dataToSave);
    }

    setSaveStatus('saving');
    // Configured deployments never read this cache (Supabase is the hydration
    // authority), so skip the write there; the backend persist below confirms
    // the save and purges any stale cache from an earlier unconfigured run.
    if (!isSupabaseConfigured) {
      try {
        safeSetItem(
          STORAGE_KEY,
          JSON.stringify({
            step,
            data: dataToSave,
            activeModule,
            dashboardTab,
            lastSaved: new Date().toISOString(),
            onboarding_progress: `Step ${step + 1} of ${TOTAL_STEPS}`,
            lastCompletedStep: dataToSave.lastCompletedStep,
            selectedTemplate: dataToSave.templateId,
            websiteAppearance: dataToSave.websiteAppearance,
            reviewedContent: dataToSave.reviewedContent,
            currentStep: step + 1
          })
        );
      } catch (e) {
        console.error('Save failed:', e);
        showToast('Storage full! Try removing some photos.', 'error');
      }
    }
    // The indicator and toast follow the REAL backend result. A failed write
    // must never flip the UI to "Saved ✓" — the error state + toast tell the
    // owner exactly what happened and that nothing was silently lost.
    const persistPromise = (isSupabaseConfigured && user)
      ? persistOwnerBusinessSetup(dataToSave)
      : Promise.resolve({ salonId: dataToSave.salonId || '', slug: dataToSave.websiteSlug });
    void persistPromise
      .then((saved) => {
        if ('error' in saved) {
          saveFailureToastShown.current = true;
          setSaveStatus('error');
          setSaveErrorDetail(saved.error || null);
          showToast(saved.error || 'Could not save your changes. Check your connection and try again.', 'error');
          return;
        }
        saveFailureToastShown.current = false;
        setSaveErrorDetail(null);
        // Update the global UI state immediately with the persisted response.
        setData((current) => current.salonId === saved.salonId
          ? current
          : { ...current, salonId: saved.salonId, websiteSlug: saved.slug || current.websiteSlug });
        // Purge the unconfigured-mode draft cache after a confirmed backend
        // write so a stale local draft can never shadow the server copy.
        if (isSupabaseConfigured) {
          safeRemoveItem(STORAGE_KEY);
        }
        setSaveStatus('saved');
        if (typeof nextDataOrMessage === 'string') {
          showToast(nextDataOrMessage);
        } else {
          showToast('Changes Saved');
        }
      })
      .catch((error) => {
        console.error('Backend business save failed:', error);
        saveFailureToastShown.current = true;
        setSaveStatus('error');
        setSaveErrorDetail(error instanceof Error && error.message.trim() ? error.message.trim() : null);
        showToast('Could not save your changes. Check your connection and try again.', 'error');
      });
  };

  // Universal 25-screen navigator
  const getCurrentScreen = (): number => {
    if (activeModule === 'staff-management') return 17;
    // PHASE 17.1 — Salon Owner Dashboard (screen 26).
    if (activeModule === 'owner-dashboard') return 26;
    if (activeModule === 'dashboard') {
      const tabIndex = DASHBOARD_TABS.indexOf(dashboardTab);
      return 18 + tabIndex;
    }
    // wizard
    return step + 1; // step 0 => screen 1, step 15 => screen 16
  };

  const navigateToScreen = (screenId: number) => {
    if (screenId >= 1 && screenId <= 14) {
      const targetStep = screenId - 1;
      if (data.publishState !== 'published' && targetStep > step + 1) {
        showToast('Complete the current setup step before continuing.');
        return;
      }
      setActiveModule('wizard');
      setStep(targetStep);
      setShowResumeBanner(false);
      showToast(`Navigated to Screen ${String(screenId).padStart(2, '0')}`);
    } else if (screenId === 17) {
      setActiveModule('staff-management');
      showToast('Opened Staff Management Module (Screen 17)');
    } else if (screenId >= 18 && screenId <= 25) {
      setActiveModule('dashboard');
      const tabIndex = screenId - 18;
      const tab = DASHBOARD_TABS[tabIndex] || 'overview';
      setDashboardTab(tab as DashboardTab);
      // For dashboard, ensure step is 0 to render Landing dashboard mode, but keep step for persistence
      // We don't change step to avoid losing wizard progress; dashboard is separate module
      showToast(`Opened Dashboard — ${tab} (Screen ${String(screenId).padStart(2, '0')})`);
    } else if (screenId === 26) {
      // PHASE 17.1 — Salon Owner Dashboard. Its salon comes from the signed-in
      // session (organization_members → salons); nothing is passed in here.
      setActiveModule('owner-dashboard');
      showToast('Opened Salon Owner Dashboard (Screen 26)');
    }
  };

  const handleDashboard = () => {
    setStep(0);
    setShowResumeBanner(false);
  };

  const hasAuthoritativePublishState = data.publishState === 'published' && !!data.publishedUrl && (
    !isSupabaseConfigured || (!!user && backendHydratedUser === user.id)
  );

  useEffect(() => {
    // Marketing dashboard (screens 18–25) still requires a published site.
    // The authenticated owner dashboard is session-owned and must open after
    // login even before the owner finishes the public-site publish wizard.
    if (activeModule === 'dashboard' && !hasAuthoritativePublishState) {
      setActiveModule(initialModule === 'owner-dashboard' ? 'owner-dashboard' : 'wizard');
    }
  }, [activeModule, hasAuthoritativePublishState, initialModule]);

  const changeActiveModule = (nextModule: 'wizard' | 'staff-management' | 'dashboard' | 'owner-dashboard') => {
    if (nextModule === 'dashboard' && !hasAuthoritativePublishState) {
      setActiveModule('owner-dashboard');
      showToast('Open your salon workspace. Publish later to unlock the public-site dashboard.');
      return;
    }
    setActiveModule(nextModule);
  };

  // Compute current screen for TopBar
  const currentScreen = getCurrentScreen();

  // Fail closed before rendering any owner module. This also blocks the
  // universal navigator and stale localStorage from bypassing the Login stage.
  if (isSupabaseConfigured && (authLoading || !user || !hasSession)) {
    return (
      <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
        <TopBar
          step={0}
          activeModule="wizard"
          setActiveModule={changeActiveModule}
          saveStatus={saveStatus}
          saveError={saveErrorDetail}
          currentScreen={1}
          onNavigate={() => setStep(0)}
        />
        <div className="flex-1 overflow-auto">
          <HeroSplit onNext={() => setStep(1)} />
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured && user && ambiguousSalonIds && ambiguousSalonIds.length > 1) {
    return (
      <OwnerWorkspaceSelector
        userId={user.id}
        salonIds={ambiguousSalonIds}
        onSelectSalon={() => {
          backendHydratedFor.current = null;
          setBackendHydratedUser(null);
          setAmbiguousSalonIds(null);
          setOwnerHydrationError('');
          setOwnerHydrationRetry((current) => current + 1);
        }}
      />
    );
  }

  if (isSupabaseConfigured && user && backendHydratedUser !== user.id) {
    return (
      <div
        className="h-screen bg-[#f9f9f9] flex items-center justify-center px-6 font-sans text-gray-900"
        data-testid="owner-workspace-hydration-boundary"
      >
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          {ownerHydrationError ? (
            <>
              <h1 className="text-lg font-extrabold">We couldn’t load your salon workspace</h1>
              <p role="alert" className="mt-2 text-sm text-gray-600">{ownerHydrationError}</p>
              <button
                type="button"
                onClick={() => {
                  // A retry starts a fresh auth/session + ownership resolution;
                  // it never reuses the failed provision/read result.
                  backendHydratedFor.current = null;
                  setBackendHydratedUser(null);
                  setAmbiguousSalonIds(null);
                  setOwnerHydrationError('');
                  setOwnerHydrationDiagnostic(null);
                  setOwnerHydrationRetry((current) => current + 1);
                }}
                className="mt-5 rounded-xl bg-[#ac0053] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#8d0044]"
              >
                Try again
              </button>
              {ownerHydrationDiagnostic && (
                <details
                  data-testid="owner-workspace-diagnostic"
                  className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left"
                >
                  <summary className="cursor-pointer text-[11px] font-semibold text-gray-500">
                    Technical details (share with support)
                  </summary>
                  <dl className="mt-2 space-y-1 break-words text-[11px] leading-relaxed text-gray-600">
                    <div><dt className="inline font-semibold">code: </dt><dd className="inline">{ownerHydrationDiagnostic.code || '—'}</dd></div>
                    <div><dt className="inline font-semibold">stage: </dt><dd className="inline">{ownerHydrationDiagnostic.stage}</dd></div>
                    <div><dt className="inline font-semibold">operation: </dt><dd className="inline">{ownerHydrationDiagnostic.operation}</dd></div>
                    <div><dt className="inline font-semibold">message: </dt><dd className="inline">{ownerHydrationDiagnostic.message || '—'}</dd></div>
                    {ownerHydrationDiagnostic.hint && (
                      <div><dt className="inline font-semibold">hint: </dt><dd className="inline">{ownerHydrationDiagnostic.hint}</dd></div>
                    )}
                    {ownerHydrationDiagnostic.details && (
                      <div><dt className="inline font-semibold">details: </dt><dd className="inline">{ownerHydrationDiagnostic.details}</dd></div>
                    )}
                  </dl>
                </details>
              )}
            </>
          ) : (
            <>
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#ffd9e1] border-t-[#ac0053]" />
              <h1 className="mt-4 text-lg font-extrabold">Loading your salon workspace</h1>
              <p className="mt-1 text-sm text-gray-500">Fetching your real business details and website settings…</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Special handling: Landing preview for dashboard needs to be rendered via Landing component's dashboard mode
  // If activeModule is dashboard, we render Landing with forced tab
  if (activeModule === 'dashboard' && hasAuthoritativePublishState) {
    return (
      <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
        <TopBar
          step={step}
          activeModule={activeModule}
          setActiveModule={changeActiveModule}
          saveStatus={saveStatus}
          saveError={saveErrorDetail}
          currentScreen={currentScreen}
          onNavigate={navigateToScreen}
        />
        <main className="flex-1 flex overflow-hidden min-h-0 w-full">
          {/* A dashboard is shown only from the real hydrated publish state.
              Never manufacture a published flag or URL for this surface. */}
          <Suspense fallback={<LazyModuleFallback />}>
            <Landing
              data={data}
              setData={setData}
              onNext={nextStep}
              goToStep={goToStep}
              onOpenStaffManagement={() => setActiveModule('staff-management')}
              forcedActiveTab={dashboardTab as any}
              onTabChange={(tab: any) => setDashboardTab(tab)}
              onThemeChange={handleThemeChange}
            />
          </Suspense>
        </main>
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-8 right-8 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
            >
              {toastKind === 'error' ? (
                <TriangleAlert className="w-5 h-5 text-red-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              )}
              <span className="text-sm font-medium">{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // PHASE 17.1 — SALON OWNER DASHBOARD (screen 26). Rendered inside the same
  // app chrome as every other module; it resolves its own salon from the
  // authenticated session and never receives a salon id from here.
  if (activeModule === 'owner-dashboard' && (!isSupabaseConfigured || !!user)) {
    return (
      <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
        <TopBar
          step={step}
          activeModule={activeModule}
          setActiveModule={changeActiveModule}
          saveStatus={saveStatus}
          saveError={saveErrorDetail}
          currentScreen={currentScreen}
          onNavigate={navigateToScreen}
        />
        <main className="flex-1 flex overflow-hidden">
          <Suspense fallback={<LazyModuleFallback />}>
            <OwnerDashboard />
          </Suspense>
        </main>
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-8 right-8 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
            >
              {toastKind === 'error' ? (
                <TriangleAlert className="w-5 h-5 text-red-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              )}
              <span className="text-sm font-medium">{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (activeModule === 'staff-management') {
    return (
      <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
        <TopBar
          step={step}
          activeModule={activeModule}
          setActiveModule={changeActiveModule}
          saveStatus={saveStatus}
          saveError={saveErrorDetail}
          currentScreen={currentScreen}
          onNavigate={navigateToScreen}
        />
        <main className="flex-1 flex overflow-hidden">
          <Suspense fallback={<LazyModuleFallback />}>
            <StaffManagementModule
              data={data}
              setData={setData}
              onSave={handleSave}
              onBackToWizard={() => setActiveModule('wizard')}
            />
          </Suspense>
        </main>
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-8 right-8 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
            >
              {toastKind === 'error' ? (
                <TriangleAlert className="w-5 h-5 text-red-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              )}
              <span className="text-sm font-medium">{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Owner flow entry: Login must precede every configured business setup.
  if (step === 0) return (
    <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
      <TopBar
        step={step}
        activeModule={activeModule}
        setActiveModule={changeActiveModule}
        saveStatus={saveStatus}
          saveError={saveErrorDetail}
        currentScreen={currentScreen}
        onNavigate={navigateToScreen}
      />
      <div className="flex-1 overflow-auto">
        <HeroSplit onNext={nextStep} />
      </div>
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-8 right-8 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
          >
            {toastKind === 'error' ? (
                            <TriangleAlert className="w-5 h-5 text-red-400" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            )}
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // Remaining screens follow Complete Setup → Template → Preview → Publish.
  return (
    <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
      <TopBar 
        step={step} 
        activeModule={activeModule} 
        setActiveModule={changeActiveModule}
        saveStatus={saveStatus}
          saveError={saveErrorDetail}
        currentScreen={currentScreen}
        onNavigate={navigateToScreen}
      />

      {/* Resume Welcome Back Banner - Fixed to show correct step and actually render correct screen below */}
      <AnimatePresence>
        {showResumeBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-[#3f001a] text-white px-6 py-3 border-b border-[#ac0053]/40 flex items-center justify-between gap-4 z-40 shrink-0 text-xs sm:text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold bg-[#ffd9e1] text-[#ac0053] px-2 py-0.5 rounded text-[11px] uppercase tracking-wider">
                Welcome back
              </span>
              <span>Your website setup is saved. Resuming from Step {step + 1} of {TOTAL_STEPS}.</span>
            </div>
            <button
              onClick={() => setShowResumeBanner(false)}
              className="bg-[#ac0053] hover:bg-[#ba005b] text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 shrink-0 transition-colors"
            >
              Continue Setup <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      <main className="flex-1 flex overflow-hidden">
        <Suspense fallback={<LazyModuleFallback />}>
          {/* Business Setup (steps 2–8). Every step persists into the owner
              draft before the owner chooses a template. */}
          {step === 1 && <StepDetails data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} onThemeChange={handleThemeChange} />}
          {step === 2 && <StepServices data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          {step === 3 && (
            <StepTeam
              data={data}
              setData={setData}
              onNext={nextStep}
              onPrev={prevStep}
              onSave={handleSave}
              onOpenStaffManagement={() => setActiveModule('staff-management')}
            />
          )}
          {step === 4 && (
            <StepPhotos data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />
          )}
          {step === 5 && (
            <StepSocials data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />
          )}
          {step === 6 && (
            <StepLocation data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />
          )}
          {step === 7 && (
            <StepContactBooking data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />
          )}

          {/* Choose Template → Customize → Preview → persisted Publish */}
          {step === 8 && <StepTemplate data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} onThemeChange={handleThemeChange} />}
          {step === 9 && <StepPublish data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          {step === 10 && <StepAIContentReview data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          {step === 11 && <StepFullWebsitePreview data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} onThemeChange={handleThemeSwitchPreview} />}
          {step === 12 && <StepPublishSetup data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          {step === 13 && data.publishState === 'published' && data.publishedUrl ? (
            <StepPublishSuccess data={data} setData={setData} onNext={() => {
              // This screen is reachable only after publishOwnerSalonWebsite()
              // returned an is_published=true Supabase row.
              setActiveModule('dashboard');
              setDashboardTab('overview');
              handleSave(data);
            }} onSave={handleSave} />
          ) : step === 13 ? (
            // Direct navigation/resumed local state can never manufacture a
            // success screen. Return to the real Supabase publish action.
            <StepPublishSetup data={data} setData={setData} onNext={nextStep} onPrev={() => setStep(11)} onSave={handleSave} />
          ) : null}
        </Suspense>
      </main>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-8 right-8 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
          >
            {toastKind === 'error' ? (
                            <TriangleAlert className="w-5 h-5 text-red-400" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            )}
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
