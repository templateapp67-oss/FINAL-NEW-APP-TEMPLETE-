/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import Landing from './screens/Landing';
import HeroSplit from './screens/HeroSplit';
import StepTemplate from './screens/StepTemplate';
import StepDetails from './screens/StepDetails';
import StepServices from './screens/StepServices';
import StepTeam from './screens/StepTeam';
import StepPhotos from './screens/StepPhotos';
import StepSocials from './screens/StepSocials';
import StepLocation from './screens/StepLocation';
import StepContactBooking from './screens/StepContactBooking';
import StepPublish from './screens/StepPublish';
import StepAIContentReview from './screens/StepAIContentReview';
import StepFullWebsitePreview from './screens/StepFullWebsitePreview';
import StepPublishSetup from './screens/StepPublishSetup';
import StepPublishSuccess from './screens/StepPublishSuccess';
import StaffManagementModule from './components/StaffManagementModule';
import OwnerDashboard from './components/OwnerDashboard';
import TopBar from './components/TopBar';
import { initialData, SalonData } from './types';
import { normalizeThemeId, type ThemeId } from './lib/themeServices';
import { publicWebsiteUrl, suggestedWebsiteSlug } from './lib/publicWebsiteUrl';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { useUsageTracking } from './hooks/useUsageTracking';
import { useAuth } from './lib/useAuth';
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
import { safeSetItem, safeGetItem } from './lib/safeStorage';
import { ownerSalonNameFromMetadata, resumeWizardStep } from './lib/ownerSession';
import { emptyOwnerSalonData } from './lib/ownerPreview';
import {
  MAX_OWNER_STEP_INDEX,
  TOTAL_OWNER_STEPS,
} from './lib/ownerFlow';

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
  const { user, loading: authLoading } = useAuth();
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
    if (isSupabaseConfigured) return 'wizard';
    try {
      const saved = safeGetItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeModule === 'staff-management') return parsed.activeModule;
        if (
          (parsed.activeModule === 'dashboard' || parsed.activeModule === 'owner-dashboard') &&
          parsed.data?.publishState === 'published'
        ) return parsed.activeModule;
      }
      const dashboardTab = safeGetItem(DASHBOARD_TAB_KEY);
      if (dashboardTab && data.publishState === 'published') return 'dashboard';
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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [showResumeBanner, setShowResumeBanner] = useState(false);

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
  const [ownerHydrationError, setOwnerHydrationError] = useState('');
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
    if (!isSupabaseConfigured || authLoading || user) return;
    backendHydratedFor.current = null;
    didResumeFromBackend.current = false;
    setBackendHydratedUser(null);
    setData(emptyOwnerSalonData());
    clearOwnerBrowserWorkspaceCache();
    setActiveModule('wizard');
    setStep(0);
    setShowResumeBanner(false);
  }, [authLoading, user]);

  // First login: skip marketing hero. Resume Business Setup from
  // salon_public_websites.config.lastCompletedStep. Unpublished owners stay
  // in the wizard even if they opened /dashboard.
  useEffect(() => {
    if (authLoading || !user) return;
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
  }, [authLoading, user, backendHydratedUser, data.lastCompletedStep, data.publishState, data.publishedUrl, initialModule]);

  // Provision first, then hydrate this exact authenticated tenant. Keeping the
  // sequence in one effect prevents a first-login draft read from racing the
  // salon-creation RPC. Owner modules remain blocked until the final merged
  // record is ready; no local/sample record can render or autosave meanwhile.
  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || !user) return;
    if (backendHydratedFor.current === user.id) return;
    backendHydratedFor.current = user.id;
    setBackendHydratedUser(null);
    setOwnerHydrationError('');
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
      if ('error' in provisioned) throw new Error(provisioned.error);
      if (!active) return;

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
      }, salonRow);
      const authoritativeTemplate = hydratedTemplate
        || configTemplate
        || baseline.templateId
        || 'barber_mens_grooming';
      const restored = restoreSavedTemplatePresentation(merged, authoritativeTemplate);
      const hydrated = restored
        || (normalizeThemeId(configTemplate) !== normalizeThemeId(authoritativeTemplate)
          ? switchSalonTemplatePresentation(merged, authoritativeTemplate)
          : applyTemplateConfigToSalon(merged, {}));

      setData(hydrated);
      if (!(hydrated.publishState === 'published' && hydrated.publishedUrl)) {
        setStep(resumeWizardStep(hydrated.lastCompletedStep));
      }
      setBackendHydratedUser(user.id);
    })().catch((error: unknown) => {
      if (!active) return;
      backendHydratedFor.current = null;
      setOwnerHydrationError(
        error instanceof Error ? error.message : 'Unable to load your salon workspace.',
      );
      console.error('Owner provisioning or hydration failed:', error);
    });

    return () => { active = false; };
  }, [authLoading, ownerHydrationRetry, user?.id]);

  // Persist dashboard tab
  useEffect(() => {
    try {
      safeSetItem(DASHBOARD_TAB_KEY, dashboardTab);
    } catch {}
  }, [dashboardTab]);

  // Auto save state to localStorage whenever step or data changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      try {
        const lastCompletedStep = Math.max(data.lastCompletedStep || 0, step > 0 ? step - 1 : 0);
        safeSetItem(
          STORAGE_KEY,
          JSON.stringify({
            step,
            data: { ...data, lastCompletedStep },
            activeModule,
            dashboardTab,
            lastSaved: new Date().toISOString(),
            onboarding_progress: `Step ${step + 1} of ${TOTAL_STEPS}`,
            lastCompletedStep,
            selectedTemplate: data.templateId,
            websiteAppearance: data.websiteAppearance,
            reviewedContent: data.reviewedContent,
            publishState: data.publishState,
            currentStep: step + 1
          })
        );
      } catch (e) {
        console.error('Failed to save onboarding state', e);
      }
      setSaveStatus('saved');
    }, 400);

    return () => clearTimeout(timer);
  }, [step, data, activeModule, dashboardTab]);

  // Business autosave is keyed only by protected business/content data. A
  // template transition cannot cancel a pending business save or start a new
  // one, and therefore cannot touch salons, organizations, hours, or location.
  useEffect(() => {
    if (!isSupabaseConfigured || !user || backendHydratedUser !== user.id) return;
    const timer = window.setTimeout(() => {
      setSaveStatus('saving');
      // Serialize draft, visual, and template writes in one client queue so a
      // delayed full-draft save cannot overwrite a newer per-template map.
      const save = templateSwitchQueue.current.then(() => (
        persistOwnerBusinessSetup(latestData.current)
      ));
      templateSwitchQueue.current = save.then(() => undefined, () => undefined);
      void save
        .then((saved) => {
          if ('error' in saved) {
            setSaveStatus('saved');
            return;
          }
          setData((current) => current.salonId === saved.salonId
            ? current
            : { ...current, salonId: saved.salonId, websiteSlug: saved.slug || current.websiteSlug });
          setSaveStatus('saved');
        })
        .catch((error) => {
          console.error('Backend business autosave failed:', error);
          setSaveStatus('saved');
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [protectedDataRevision, user, backendHydratedUser]);

  // Flush the authoritative draft on refresh/close so a mid-step edit is not
  // stranded in the 1.2s debounce. Session tokens stay in Supabase Auth.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const flush = () => {
      if (!latestData.current.salonName && !latestData.current.lastCompletedStep) return;
      void persistOwnerBusinessSetup(latestData.current);
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
      try {
        const appliedTheme = isSupabaseConfigured && user
          ? (await setOwnerTemplate(nextTheme)).templateId
          : nextTheme;
        setData((current) => switchSalonTemplatePresentation(current, appliedTheme));
      } catch (error) {
        console.error('Failed to persist template switch:', error);
        showToast(error instanceof Error ? error.message : 'Could not save the template change.');
        throw error;
      }
    });

    // Keep the queue usable after a failed operation while returning the
    // original (possibly rejected) promise to this specific caller.
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

  const showToast = (message: string) => {
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

    if (isSupabaseConfigured && user) {
      void persistOwnerBusinessSetup(dataToSave);
    }
    
    setSaveStatus('saving');
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
          publishState: dataToSave.publishState,
          currentStep: step + 1
        })
      );
    } catch (e) {
      console.error('Save failed:', e);
      showToast('Storage full! Try removing some photos.');
    }
    setTimeout(() => {
      setSaveStatus('saved');
      if (typeof nextDataOrMessage === 'string') {
        showToast(nextDataOrMessage);
      } else {
        showToast('Changes Saved');
      }
    }, 800);
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
  if (isSupabaseConfigured && (authLoading || !user)) {
    return (
      <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
        <TopBar
          step={0}
          activeModule="wizard"
          setActiveModule={changeActiveModule}
          saveStatus={saveStatus}
          currentScreen={1}
          onNavigate={() => setStep(0)}
        />
        <div className="flex-1 overflow-auto">
          <HeroSplit onNext={() => setStep(1)} />
        </div>
      </div>
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
                onClick={() => setOwnerHydrationRetry((current) => current + 1)}
                className="mt-5 rounded-xl bg-[#ac0053] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#8d0044]"
              >
                Try again
              </button>
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
          currentScreen={currentScreen}
          onNavigate={navigateToScreen}
        />
        <main className="flex-1 flex overflow-hidden min-h-0 w-full">
          {/* A dashboard is shown only from the real hydrated publish state.
              Never manufacture a published flag or URL for this surface. */}
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
        </main>
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-8 right-8 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-green-400" />
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
          currentScreen={currentScreen}
          onNavigate={navigateToScreen}
        />
        <main className="flex-1 flex overflow-hidden">
          <OwnerDashboard />
        </main>
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-8 right-8 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-green-400" />
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
          currentScreen={currentScreen}
          onNavigate={navigateToScreen}
        />
        <main className="flex-1 flex overflow-hidden">
          <StaffManagementModule
            data={data}
            setData={setData}
            onSave={handleSave}
            onBackToWizard={() => setActiveModule('wizard')}
          />
        </main>
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-8 right-8 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3"
            >
              <CheckCircle2 className="w-5 h-5 text-green-400" />
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
            <CheckCircle2 className="w-5 h-5 text-green-400" />
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
        <>
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
        </>
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
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
