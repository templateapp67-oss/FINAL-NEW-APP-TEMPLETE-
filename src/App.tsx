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
import type { ThemeId } from './lib/themeServices';
import { publicWebsiteUrl, suggestedWebsiteSlug } from './lib/publicWebsiteUrl';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { useUsageTracking } from './hooks/useUsageTracking';
import { useAuth } from './lib/useAuth';
import { isSupabaseConfigured } from './lib/supabaseClient';
import { loadOwnerWebsiteDraft, saveOwnerWebsiteDraft } from './lib/salonWebsiteService';
import { resolveOrProvisionOwnerSalon, setOwnerTemplate } from './lib/ownerProvisioning';
import { safeSetItem, safeGetItem } from './lib/safeStorage';

const STORAGE_KEY = 'nexora_onboarding_state';
const DASHBOARD_TAB_KEY = 'nexora_dashboard_tab';
// Owner journey: Login → Complete Business Setup → Select Template → Preview → Publish.
// Business setup spans the guided detail/catalog/team/media/location/contact/content screens.
const TOTAL_STEPS = 14;
const MAX_STEP_INDEX = 13; // 0-based: 0..13 => 1..14

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
  const [showResumeBanner, setShowResumeBanner] = useState<boolean>(() => {
    try {
      const saved = safeGetItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return typeof parsed.step === 'number' && parsed.step > 0;
      }
    } catch (e) {
      // fallback
    }
    return false;
  });

  useUsageTracking({
    activeModule,
    step,
    dashboardTab,
    salonName: data?.salonName || '',
    slug: data?.websiteSlug || '',
  });

  const isInitialMount = useRef(true);
  const backendHydratedFor = useRef<string | null>(null);
  const [backendHydratedUser, setBackendHydratedUser] = useState<string | null>(null);
  const provisionedFor = useRef<string | null>(null);
  const templateSwitchSequence = useRef(0);
  const templateSwitchQueue = useRef<Promise<void>>(Promise.resolve());
  const persistedTemplate = useRef<SalonData['templateId']>(data.templateId);

  // A configured production workspace is an owner-only flow. A cached wizard
  // step must never let a signed-out browser bypass Login. Local unconfigured
  // development remains usable for visual work, but publishing still fails
  // closed because it requires Supabase.
  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || user) return;
    setActiveModule('wizard');
    setStep(0);
  }, [authLoading, user]);

  // PHASE 1 — ensure the authenticated owner has a salon. A brand-new owner has
  // an auth.users + profiles row but no organization / owner membership / salon
  // yet; the SECURITY DEFINER RPC `provision_owner_salon` (M42) creates that
  // tenant idempotently. This runs once per user id, before draft hydration,
  // so every downstream read (draft, services, location, dashboard) resolves
  // to the session-owned salon. No salon/user id is ever supplied by the
  // browser for authorization — auth.uid() inside the RPC is the sole source.
  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || !user) return;
    if (provisionedFor.current === user.id) return;
    provisionedFor.current = user.id;
    let active = true;
    const initialSlug = data.websiteSlug || suggestedWebsiteSlug(data);
    void resolveOrProvisionOwnerSalon({
      salonName: data.salonName,
      slug: initialSlug,
      templateKey: data.templateId,
    })
      .then((result) => {
        if (!active || 'error' in result || !result.salonId) return;
        setData((current) => {
          if (current.salonId === result.salonId) return current;
          return {
            ...current,
            salonId: result.salonId,
            websiteSlug: result.slug || current.websiteSlug,
          };
        });
      })
      .catch((error) => console.error('Owner provisioning failed:', error));
    return () => { active = false; };
    // Provisioning is intentionally keyed only on the authenticated user; it
    // must not re-run because the salon name is edited (renaming is a separate,
    // explicit action).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  // In configured deployments the published-website row is the draft/content
  // authority. Local storage remains only an offline/UI cache.
  useEffect(() => {
    if (!isSupabaseConfigured || authLoading || !user) return;
    if (backendHydratedFor.current === user.id) return;
    backendHydratedFor.current = user.id;
    let active = true;
    void loadOwnerWebsiteDraft()
      .then((draft) => {
        if (!active) return;
        setBackendHydratedUser(user.id);
        if (!draft) return;
        setData((current) => {
          // template_key is the presentation authority changed by
          // set_owner_salon_template. Config may legitimately predate a
          // post-publish template switch, so it is only the fallback.
          const hydratedTemplate = (
            draft.templateKey || draft.config.templateId || current.templateId
          ) as SalonData['templateId'];
          persistedTemplate.current = hydratedTemplate;
          return {
            ...current,
            ...draft.config,
            salonId: draft.salonId,
            websiteSlug: draft.slug || current.websiteSlug,
            publishedUrl: draft.isPublished && draft.slug
              ? publicWebsiteUrl(draft.slug)
              : undefined,
            templateId: hydratedTemplate,
            publishState: draft.isPublished ? 'published' : 'draft',
          };
        });
      })
      .catch((error) => console.error('Backend website draft hydration failed:', error));
    return () => { active = false; };
  }, [authLoading, user]);

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

  useEffect(() => {
    if (!isSupabaseConfigured || !user || backendHydratedFor.current !== user.id || !data.websiteSlug) return;
    const timer = window.setTimeout(() => {
      setSaveStatus('saving');
      void saveOwnerWebsiteDraft(data)
        .then((saved) => {
          if (!saved) {
            setSaveStatus('saved');
            return;
          }
          setData((current) => current.salonId === saved.salonId
            ? current
            : { ...current, salonId: saved.salonId, websiteSlug: saved.slug, publishState: saved.isPublished ? 'published' : 'draft' });
          setSaveStatus('saved');
        })
        .catch((error) => {
          console.error('Backend website draft autosave failed:', error);
          setSaveStatus('saved');
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [data, user]);

  // TEMPLATE SWITCHING — PRESENTATION ONLY.
  // Changing template must never delete/clear the business, services, products,
  // customers, bookings, payments, location or ownership. We update local state
  // optimistically and persist ONLY the template selection through the
  // SECURITY DEFINER RPC `set_owner_salon_template`, which updates
  // salons.theme_id + salon_public_websites.template_key and touches nothing
  // else. The in-memory services/packages arrays are the theme-scoped UI cache
  // StepServices rehydrates from the database for the active theme; persisted
  // rows (keyed by salon_id + theme_id) are untouched, so switching A→B→A is
  // fully reversible with no data loss.
  const handleThemeChange = (nextTheme: ThemeId) => {
    const requestId = ++templateSwitchSequence.current;
    setData(prev => ({ ...prev, templateId: nextTheme }));
    if (!isSupabaseConfigured || !user) return;
    // Serialize writes so rapid changes cannot reach Supabase out of order.
    // Every accepted transition is presentation-only and the final queued RPC
    // is necessarily the owner's latest selection.
    templateSwitchQueue.current = templateSwitchQueue.current.then(async () => {
      try {
        const saved = await setOwnerTemplate(nextTheme);
        // Track every serialized success, including an older request whose UI
        // settlement was superseded. This is the exact database template to
        // restore if a later queued request fails.
        persistedTemplate.current = saved.templateId;
        if (templateSwitchSequence.current !== requestId) return;
        setData(current => ({ ...current, templateId: saved.templateId }));
      } catch (error) {
        if (templateSwitchSequence.current !== requestId) return;
        // Do not leave an optimistic template visible as though it were live
        // when Supabase rejected the presentation-only update.
        setData(current => current.templateId === nextTheme
          ? { ...current, templateId: persistedTemplate.current }
          : current);
        console.error('Failed to persist template switch:', error);
        showToast(
          error instanceof Error ? error.message : 'Could not save the template change.',
        );
      }
    });
  };

  // Preview-only variant (Step 13 full preview): updates the live preview
  // without persisting; the explicit "Apply" path uses handleThemeChange.
  const handleThemeSwitchPreview = (nextTheme: ThemeId) => {
    setData(prev => ({ ...prev, templateId: nextTheme }));
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
    if (
      (activeModule === 'dashboard' || activeModule === 'owner-dashboard') &&
      !hasAuthoritativePublishState
    ) {
      setActiveModule('wizard');
    }
  }, [activeModule, hasAuthoritativePublishState]);

  const changeActiveModule = (nextModule: 'wizard' | 'staff-management' | 'dashboard' | 'owner-dashboard') => {
    if (
      (nextModule === 'dashboard' || nextModule === 'owner-dashboard') &&
      !hasAuthoritativePublishState
    ) {
      setActiveModule('wizard');
      setStep(Math.min(step, 12));
      showToast('Publish your website successfully before opening the dashboard.');
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
  if (activeModule === 'owner-dashboard' && hasAuthoritativePublishState) {
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
          {/* Complete Business Setup */}
          {step === 1 && <StepDetails data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
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
          {step === 8 && <StepPublish data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          {step === 9 && <StepAIContentReview data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}

          {/* Select Template → Preview → persisted Publish */}
          {step === 10 && <StepTemplate data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} onThemeChange={handleThemeChange} />}
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
