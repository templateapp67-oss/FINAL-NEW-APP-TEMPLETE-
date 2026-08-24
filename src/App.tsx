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
import BookingConfirmation from './components/BookingConfirmation';
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
const TOTAL_STEPS = 16;
const MAX_STEP_INDEX = 15; // 0-based: 0..15 => 1..16

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
        if (
          parsed.activeModule === 'staff-management' ||
          parsed.activeModule === 'dashboard' ||
          parsed.activeModule === 'owner-dashboard'
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
  const provisionedFor = useRef<string | null>(null);

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
        if (!active || !draft) return;
        setData((current) => ({
          ...current,
          ...draft.config,
          salonId: draft.salonId,
          websiteSlug: draft.slug || current.websiteSlug,
          templateId: (draft.config.templateId || current.templateId) as SalonData['templateId'],
          publishState: draft.isPublished ? 'published' : 'draft',
        }));
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
    setData(prev => ({ ...prev, templateId: nextTheme }));
    if (!isSupabaseConfigured || !user) return;
    setOwnerTemplate(nextTheme).catch((error) => {
      console.error('Failed to persist template switch:', error);
      showToast(
        error instanceof Error ? error.message : 'Could not save the template change.',
      );
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
    if (screenId >= 1 && screenId <= 16) {
      setActiveModule('wizard');
      setStep(screenId - 1);
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

  // Compute current screen for TopBar
  const currentScreen = getCurrentScreen();

  // Special handling: Landing preview for dashboard needs to be rendered via Landing component's dashboard mode
  // If activeModule is dashboard, we render Landing with forced tab
  if (activeModule === 'dashboard') {
    return (
      <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
        <TopBar
          step={step}
          activeModule={activeModule}
          setActiveModule={setActiveModule}
          saveStatus={saveStatus}
          currentScreen={currentScreen}
          onNavigate={navigateToScreen}
        />
        <main className="flex-1 flex overflow-hidden min-h-0 w-full">
          {/* Force Landing into dashboard mode by ensuring published and passing forcedActiveTab */}
          <Landing
            data={{
              ...data,
              publishState: 'published',
              publishedUrl: data.publishedUrl || publicWebsiteUrl(suggestedWebsiteSlug(data)),
            }}
            setData={setData}
            onNext={nextStep}
            goToStep={goToStep}
            onOpenStaffManagement={() => setActiveModule('staff-management')}
            forcedActiveTab={dashboardTab as any}
            onTabChange={(tab: any) => setDashboardTab(tab)}
            onThemeChange={handleThemeSwitchPreview}
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
  if (activeModule === 'owner-dashboard') {
    return (
      <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
        <TopBar
          step={step}
          activeModule={activeModule}
          setActiveModule={setActiveModule}
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
          setActiveModule={setActiveModule}
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

  // Wizard module rendering
  if (step === 0) return (
    <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
      <TopBar
        step={step}
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        saveStatus={saveStatus}
        currentScreen={currentScreen}
        onNavigate={navigateToScreen}
      />
      <div className="flex-1 overflow-auto">
        <Landing 
          data={data}
          setData={setData}
          onNext={nextStep} 
          goToStep={goToStep}
          onOpenStaffManagement={() => setActiveModule('staff-management')}
          onThemeChange={handleThemeChange}
        />
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

  if (step === 1) return (
    <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
      <TopBar
        step={step}
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        saveStatus={saveStatus}
        currentScreen={currentScreen}
        onNavigate={navigateToScreen}
      />
      <div className="flex-1 overflow-auto">
        <HeroSplit onNext={nextStep} />
      </div>
      <div className="p-4 bg-white border-t border-gray-200 flex justify-between items-center">
        <button onClick={prevStep} className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold">Back</button>
        <button onClick={nextStep} className="px-6 py-2 bg-[#ac0053] text-white rounded-xl text-xs font-semibold">Continue to Template Selection</button>
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

  // For wizard steps 2..15, TopBar is always visible now (universal)
  return (
    <div className="h-screen bg-[#f9f9f9] flex flex-col font-sans text-gray-900 overflow-hidden relative">
      <TopBar 
        step={step} 
        activeModule={activeModule} 
        setActiveModule={setActiveModule} 
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
          {step === 2 && <StepTemplate data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} onThemeChange={handleThemeChange} />}
          {step === 3 && <StepDetails data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          {step === 4 && <StepServices data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          {step === 5 && (
            <StepTeam 
              data={data} 
              setData={setData} 
              onNext={nextStep} 
              onPrev={prevStep} 
              onSave={handleSave} 
              onOpenStaffManagement={() => setActiveModule('staff-management')}
            />
          )}
          {step === 6 && (
            <StepPhotos
              data={data}
              setData={setData}
              onNext={nextStep}
              onPrev={prevStep}
              onSave={handleSave}
            />
          )}
          {step === 7 && (
            <StepSocials
              data={data}
              setData={setData}
              onNext={nextStep}
              onPrev={prevStep}
              onSave={handleSave}
            />
          )}
          {step === 8 && (
            <StepLocation
              data={data}
              setData={setData}
              onNext={nextStep}
              onPrev={prevStep}
              onSave={handleSave}
            />
          )}
          {step === 9 && (
            <StepContactBooking
              data={data}
              setData={setData}
              onNext={nextStep}
              onPrev={prevStep}
              onSave={handleSave}
            />
          )}
          {/* Step 11 of 15 (index 10) - Template Appearance */}
          {step === 10 && <StepPublish data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          
          {/* FIXED STEPS 12-15 - Previously not rendering */}
          {step === 11 && <StepAIContentReview data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          {step === 12 && <StepFullWebsitePreview data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} onThemeChange={handleThemeSwitchPreview} />}
          {step === 13 && <StepPublishSetup data={data} setData={setData} onNext={nextStep} onPrev={prevStep} onSave={handleSave} />}
          {step === 14 && <StepPublishSuccess data={data} setData={setData} onNext={() => {
            setData(prev => ({ ...prev, publishState: 'published' }));
            setActiveModule('dashboard');
            setDashboardTab('overview');
            handleSave();
            showToast('Website published');
          }} onSave={handleSave} />}
          {step === 15 && (
            <BookingConfirmation 
              bookingId="NX-10482"
              service="Hair Spa"
              date="10 Aug 2026"
              time="05:00 PM"
              staff="Priya Sharma"
              customer="Neha Verma"
              price={1200}
              advancePaid={300}
            />
          )}

          {/* Fallback safety - should never hit if switch logic is correct, but prevent blank screen */}
          {step > 15 && (
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-bold">Step out of range — redirecting to resume point</h2>
                <p className="text-sm text-gray-500">Current step {step} is beyond {MAX_STEP_INDEX}</p>
                <button onClick={() => goToStep(11)} className="px-6 py-2 bg-[#ac0053] text-white rounded-lg text-sm">Go to Step 12 AI Review</button>
              </div>
            </div>
          )}
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
