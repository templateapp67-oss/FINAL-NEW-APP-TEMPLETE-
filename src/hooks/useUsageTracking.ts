import { useEffect, useRef } from 'react';

export interface UsageEvent {
  id: string;
  timestamp: string;
  eventType: 'page_view' | 'module_transition' | 'dashboard_tab_transition' | 'user_action';
  description: string;
  details: Record<string, any>;
}

const ANALYTICS_STORAGE_KEY = 'nexora_usage_analytics';
const MAX_LOG_SIZE = 50;

/**
 * Pushes a tracking event to localStorage safely with a circular buffer limit
 */
export function recordTrackingEvent(
  eventType: UsageEvent['eventType'],
  description: string,
  details: Record<string, any> = {}
) {
  try {
    const id = Math.random().toString(36).substring(2, 9);
    const event: UsageEvent = {
      id,
      timestamp: new Date().toISOString(),
      eventType,
      description,
      details,
    };

    // Retrieve previous logs
    const saved = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    let logs: UsageEvent[] = [];
    if (saved) {
      logs = JSON.parse(saved);
      if (!Array.isArray(logs)) {
        logs = [];
      }
    }

    // Prepend new event
    logs.unshift(event);

    // Keep only the most recent N items
    if (logs.length > MAX_LOG_SIZE) {
      logs = logs.slice(0, MAX_LOG_SIZE);
    }

    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(logs));

    // Elegant and highly styled console logging for visibility in preview/dev tools
    const styles = {
      page_view: 'background: #ac0053; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      module_transition: 'background: #1e1b4b; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      dashboard_tab_transition: 'background: #064e3b; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      user_action: 'background: #7c2d12; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    };

    console.log(
      `%cNEXORA ANALYTICS%c [${event.eventType.toUpperCase()}] ${description}`,
      'background: #333; color: #fff; padding: 2px 6px; border-radius: 3px 0 0 3px;',
      styles[eventType] || 'font-weight: bold;',
      details
    );
  } catch (e) {
    console.warn('Nexora Analytics failed to persist tracking log:', e);
  }
}

/**
 * Hook to automatically track page views, module changes, step updates, and dashboard transitions in App
 */
export function useUsageTracking({
  activeModule,
  step,
  dashboardTab,
  salonName,
  slug,
}: {
  activeModule: 'wizard' | 'staff-management' | 'dashboard' | 'owner-dashboard';
  step: number;
  dashboardTab: string;
  salonName: string;
  slug: string;
}) {
  const isFirstMount = useRef(true);
  const prevModule = useRef(activeModule);
  const prevStep = useRef(step);
  const prevTab = useRef(dashboardTab);

  useEffect(() => {
    // 1. Record Initial Launch Page View
    if (isFirstMount.current) {
      isFirstMount.current = false;
      recordTrackingEvent('page_view', 'Application session initialized', {
        pathname: window.location.pathname,
        activeModule,
        step: step + 1,
        dashboardTab,
        salonName,
        slug,
      });
      return;
    }

    // 2. Track Module Transitions
    if (prevModule.current !== activeModule) {
      recordTrackingEvent('module_transition', `Switched module to "${activeModule}"`, {
        from: prevModule.current,
        to: activeModule,
        step: step + 1,
        dashboardTab,
      });
      prevModule.current = activeModule;
    }

    // 3. Track Onboarding Step Changes
    if (activeModule === 'wizard' && prevStep.current !== step) {
      recordTrackingEvent('page_view', `Advanced onboarding to Step ${step + 1}`, {
        fromStep: prevStep.current + 1,
        toStep: step + 1,
        salonName,
        slug,
      });
      prevStep.current = step;
    }

    // 4. Track Dashboard Tab Transitions
    if (activeModule === 'dashboard' && prevTab.current !== dashboardTab) {
      recordTrackingEvent('dashboard_tab_transition', `Selected dashboard tab: "${dashboardTab}"`, {
        fromTab: prevTab.current,
        toTab: dashboardTab,
        salonName,
        slug,
      });
      prevTab.current = dashboardTab;
    }
  }, [activeModule, step, dashboardTab, salonName, slug]);
}
