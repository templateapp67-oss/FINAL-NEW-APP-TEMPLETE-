/**
 * PHASE 17.1–17.9 — SALON OWNER DASHBOARD shell.
 *
 * ONE owner dashboard surface — the 17.1 structure/navigation plus the real
 * Today (17.2), Upcoming (17.3), booking-status controls (17.4), own-salon
 * Customers (17.5), Revenue (17.6), Calendar (17.7), and Notifications (17.8).
 * It does NOT duplicate the existing post-launch dashboard (screens 18–25 in
 * `Landing.tsx`): that stays exactly as it is, and this shell is reached from
 * the same `App.tsx` module switcher / TopBar chrome.
 *
 * Salon identity comes from ONE place — `loadOwnerDashboardContext()` — which
 * runs the EXISTING ownership chain (auth.users → organization_members
 * role='owner' → salons.organization_id → salons.id). There is no salon-id
 * input, prop, URL param or storage key anywhere in this component, so an
 * owner can only ever see their own salon. `job_salon_members` is not used.
 *
 * Implemented through 17.9:
 *   - Section registry + responsive navigation from 17.1.
 *   - Real own-salon Today and Upcoming appointment lists from 17.2–17.3.
 *   - Guarded booking status controls from 17.4.
 *   - Own-salon customer directory and booking history from 17.5.
 *   - Own-salon test-mode revenue/payment summary from 17.6.
 *   - Own-salon day/week Calendar and booking detail selection from 17.7.
 *   - Existing-event owner notifications from 17.8.
 *   - Shared real-data filters, responsive and accessible UX from 17.9.
 *   - Loading, empty, error (+retry), unauthorized, EN/HI and Light/Dark.
 *
 * Phase 17.10 final acceptance testing is deliberately not implemented here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  AlertCircle,
  Bell,
  CalendarDays,
  CalendarClock,
  Clock,
  Globe,
  Inbox,
  LayoutDashboard,
  Loader2,
  Menu,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sun,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  LOADING_OWNER_DASHBOARD_CONTEXT,
  OWNER_DASHBOARD_SECTIONS,
  ownerBookingTenant,
  loadOwnerDashboardContext,
  normalizeOwnerDashboardSection,
  ownerDashboardCanRetry,
  ownerDashboardCanView,
  ownerDashboardDeniedKey,
  ownerDashboardSection,
  ownerSalonDisplayName,
  ownerSalonLocationLine,
  persistOwnerDashboardSection,
  readStoredOwnerDashboardSection,
} from '../lib/ownerDashboard';
import type {
  OwnerDashboardContext,
  OwnerDashboardIconKey,
  OwnerDashboardSectionId,
} from '../lib/ownerDashboard';
import { ownerDashboardTranslator } from '../lib/ownerDashboardI18n';
import OwnerTodayAppointments from './OwnerTodayAppointments';
import OwnerUpcomingAppointments from './OwnerUpcomingAppointments';
import OwnerCustomers from './OwnerCustomers';
import OwnerRevenueSummary from './OwnerRevenueSummary';
import OwnerCalendarSchedule from './OwnerCalendarSchedule';
import OwnerNotifications from './OwnerNotifications';
import OwnerDashboardFilters from './OwnerDashboardFilters';
import { DEFAULT_OWNER_FILTERS } from '../lib/ownerDashboardFilters';
import type { OwnerDashboardFilterState } from '../lib/ownerDashboardFilters';
import { resolveBookingActor } from '../lib/bookingManagement';
import type { BookingActorContext } from '../lib/bookingManagement';
import { SITE_HEADER_THEME_IDS } from '../lib/siteNavigation';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '../lib/locale';
import type { AppLocale } from '../lib/locale';
import { setSiteAppearance, setSiteLocale } from '../lib/siteNavigation';
import type { SiteAppearance } from '../lib/siteNavigation';
import { useSiteAppearance, useSiteLocale } from './SiteHeader';

/* ------------------------------------------------------------------ */
/* Palette — light/dark tokens for the dashboard chrome                */
/* ------------------------------------------------------------------ */

interface DashboardPalette {
  shell: string;
  panel: string;
  panelSoft: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  accentText: string;
}

const LIGHT: DashboardPalette = {
  shell: '#f9f8f6',
  panel: '#ffffff',
  panelSoft: '#fbfafa',
  line: '#e6e3e0',
  text: '#191512',
  muted: '#7c736c',
  accent: '#ac0053',
  accentSoft: 'rgba(172,0,83,0.08)',
  accentText: '#ffffff',
};

const DARK: DashboardPalette = {
  shell: '#131111',
  panel: '#1b1818',
  panelSoft: '#221e1e',
  line: '#332d2d',
  text: '#f6f2f0',
  muted: '#a49b96',
  accent: '#ff5ea1',
  accentSoft: 'rgba(255,94,161,0.14)',
  accentText: '#1a0410',
};

function paletteFor(appearance: SiteAppearance): DashboardPalette {
  return appearance === 'dark' ? DARK : LIGHT;
}

/** The five existing site themes a salon's booking rows may be stamped with. */
const THEME_IDS: readonly string[] = SITE_HEADER_THEME_IDS;

const ICONS: Record<OwnerDashboardIconKey, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  today: Clock,
  upcoming: CalendarClock,
  customers: Users,
  revenue: Wallet,
  calendar: CalendarDays,
  notifications: Bell,
};

/* ------------------------------------------------------------------ */
/* Small shared building blocks                                        */
/* ------------------------------------------------------------------ */

function Card({
  palette,
  className = '',
  style,
  children,
  testId,
}: {
  palette: DashboardPalette;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-2xl border p-5 ${className}`}
      style={{ backgroundColor: palette.panel, borderColor: palette.line, color: palette.text, ...style }}
    >
      {children}
    </div>
  );
}

/** Skeleton block used by the loading state (no spinner-only screens). */
function SkeletonBar({ palette, className = '' }: { palette: DashboardPalette; className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }}
    />
  );
}

export function OwnerDashboardLoading({ palette, label }: { palette: DashboardPalette; label: string }) {
  return (
    <div data-testid="owner-dashboard-loading" className="space-y-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs font-bold" style={{ color: palette.muted }}>
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: palette.accent }} />
        {label}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Card palette={palette} className="space-y-3">
              <SkeletonBar palette={palette} className="h-3 w-24" />
              <SkeletonBar palette={palette} className="h-5 w-40" />
              <SkeletonBar palette={palette} className="h-3 w-32" />
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OwnerDashboardError({
  palette,
  title,
  body,
  retryLabel,
  onRetry,
}: {
  palette: DashboardPalette;
  title: string;
  body: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <Card palette={palette} testId="owner-dashboard-error" className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-extrabold">
        <AlertCircle className="h-4 w-4" style={{ color: palette.accent }} />
        {title}
      </div>
      <p className="text-xs font-semibold leading-relaxed" style={{ color: palette.muted }}>
        {body}
      </p>
      {onRetry && (
        <button
          type="button"
          data-testid="owner-dashboard-retry"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-opacity hover:opacity-90"
          style={{ backgroundColor: palette.accent, color: palette.accentText }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {retryLabel}
        </button>
      )}
    </Card>
  );
}

export function OwnerDashboardEmpty({
  palette,
  title,
  body,
}: {
  palette: DashboardPalette;
  title: string;
  body: string;
}) {
  return (
    <Card palette={palette} testId="owner-dashboard-empty" className="space-y-2 text-center">
      <Inbox className="mx-auto h-6 w-6" style={{ color: palette.muted }} />
      <p className="text-sm font-extrabold">{title}</p>
      <p className="text-xs font-semibold" style={{ color: palette.muted }}>
        {body}
      </p>
    </Card>
  );
}

export function OwnerDashboardDenied({
  palette,
  title,
  message,
  retryLabel,
  onRetry,
}: {
  palette: DashboardPalette;
  title: string;
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div
      data-testid="owner-dashboard-denied"
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border p-8 text-center"
      style={{ backgroundColor: palette.panel, borderColor: palette.line, color: palette.text }}
    >
      <ShieldAlert className="h-7 w-7" style={{ color: palette.accent }} />
      <h2 className="text-sm font-extrabold">{title}</h2>
      <p className="text-xs font-semibold leading-relaxed" style={{ color: palette.muted }}>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          data-testid="owner-dashboard-denied-retry"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-opacity hover:opacity-90"
          style={{ backgroundColor: palette.accent, color: palette.accentText }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

function NavList({
  palette,
  active,
  onSelect,
  t,
  compact = false,
  idPrefix,
}: {
  palette: DashboardPalette;
  active: OwnerDashboardSectionId;
  onSelect: (id: OwnerDashboardSectionId) => void;
  t: (key: string) => string;
  compact?: boolean;
  idPrefix: string;
}) {
  return (
    <ul className="flex flex-col gap-1" role="list">
      {OWNER_DASHBOARD_SECTIONS.map((section) => {
        const Icon = ICONS[section.icon];
        const isActive = section.id === active;
        const label = t(section.labelKey);
        return (
          <li key={section.id}>
            <button
              type="button"
              data-testid={`${idPrefix}-${section.id}`}
              aria-current={isActive ? 'page' : undefined}
              title={label}
              onClick={() => onSelect(section.id)}
              className={`flex w-full items-center rounded-xl text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${
                compact ? 'justify-center px-2 py-3' : 'gap-3 px-3.5 py-3'
              }`}
              style={{
                backgroundColor: isActive ? palette.accentSoft : 'transparent',
                color: isActive ? palette.accent : palette.muted,
                fontWeight: isActive ? 900 : 700,
              }}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!compact && <span className="truncate">{label}</span>}
              {compact && <span className="sr-only">{label}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Section bodies (foundation placeholders — no business data invented) */
/* ------------------------------------------------------------------ */

function OverviewFoundation({
  palette,
  context,
  t,
  onSelect,
}: {
  palette: DashboardPalette;
  context: OwnerDashboardContext;
  t: (key: string) => string;
  onSelect: (id: OwnerDashboardSectionId) => void;
}) {
  const salon = context.salon;
  const name = ownerSalonDisplayName(salon);
  const location = ownerSalonLocationLine(salon);
  const notSet = t('overview.notSet');

  const rows: Array<{ key: string; label: string; value: string }> = [
    { key: 'name', label: t('overview.salonName'), value: name ?? notSet },
    { key: 'location', label: t('overview.location'), value: location ?? notSet },
    { key: 'slug', label: t('overview.websiteAddress'), value: salon?.slug ?? notSet },
    {
      key: 'status',
      label: t('overview.status'),
      value: salon?.isActive ? t('shell.active') : t('shell.inactive'),
    },
  ];

  return (
    <div className="space-y-5" data-testid="owner-dashboard-overview">
      <Card palette={palette} className="space-y-4" testId="owner-dashboard-salon-card">
        <h3 className="text-xs font-black uppercase tracking-wider" style={{ color: palette.muted }}>
          {t('overview.salonCard')}
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.key} data-testid={`owner-salon-field-${row.key}`}>
              <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: palette.muted }}>
                {row.label}
              </dt>
              <dd className="mt-1 break-words text-sm font-extrabold">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card palette={palette} className="space-y-3" testId="owner-dashboard-section-index">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider" style={{ color: palette.muted }}>
            {t('overview.sections')}
          </h3>
          <p className="mt-1 text-xs font-semibold" style={{ color: palette.muted }}>
            {t('overview.sectionsHint')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {OWNER_DASHBOARD_SECTIONS.filter((section) => section.id !== 'overview').map((section) => {
            const Icon = ICONS[section.icon];
            return (
              <button
                key={section.id}
                type="button"
                data-testid={`owner-dashboard-card-${section.id}`}
                onClick={() => onSelect(section.id)}
                className="flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors"
                style={{ backgroundColor: palette.panelSoft, borderColor: palette.line }}
              >
                <span className="flex items-center gap-2 text-xs font-extrabold" style={{ color: palette.text }}>
                  <Icon className="h-4 w-4" style={{ color: palette.accent }} aria-hidden="true" />
                  {t(section.labelKey)}
                </span>
                <span className="text-[11px] font-semibold leading-relaxed" style={{ color: palette.muted }}>
                  {t(section.descriptionKey)}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/**
 * Foundation placeholder for the sections whose behaviour lands in later
 * phases. It intentionally shows NO counts, amounts, names or bookings.
 */
function SectionFoundation({
  palette,
  sectionId,
  t,
}: {
  palette: DashboardPalette;
  sectionId: OwnerDashboardSectionId;
  t: (key: string) => string;
}) {
  const section = ownerDashboardSection(sectionId);
  const Icon = ICONS[section.icon];
  return (
    <Card palette={palette} className="space-y-3" testId={`owner-dashboard-placeholder-${sectionId}`}>
      <span
        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider"
        style={{ backgroundColor: palette.accentSoft, color: palette.accent }}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {t('placeholder.title')}
      </span>
      <p className="text-xs font-semibold leading-relaxed" style={{ color: palette.muted }}>
        {t('placeholder.body')}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

interface Props {
  /** Optional test seam — production always resolves through the session. */
  loadContext?: () => Promise<OwnerDashboardContext>;
}

export default function OwnerDashboard({ loadContext }: Props) {
  const locale = useSiteLocale();
  const [appearance, toggleAppearance] = useSiteAppearance(undefined, 'light');
  const palette = paletteFor(appearance);
  const t = useMemo(() => ownerDashboardTranslator(locale), [locale]);

  const [context, setContext] = useState<OwnerDashboardContext>(LOADING_OWNER_DASHBOARD_CONTEXT);
  const [active, setActive] = useState<OwnerDashboardSectionId>(() => readStoredOwnerDashboardSection());
  const [drawerOpen, setDrawerOpen] = useState(false);
  // PHASE 17.9 — one filter state shared by every real-data section. It is a
  // transient UI preference only and never changes the session tenant scope.
  const [filters, setFilters] = useState<OwnerDashboardFilterState>({ ...DEFAULT_OWNER_FILTERS });

  const load = useCallback(
    (signal?: { cancelled: boolean }) => {
      setContext(LOADING_OWNER_DASHBOARD_CONTEXT);
      const loader = loadContext ?? loadOwnerDashboardContext;
      loader()
        .then((next) => {
          if (signal?.cancelled) return;
          setContext(next);
        })
        .catch(() => {
          if (signal?.cancelled) return;
          setContext({ access: 'error', salon: null });
        });
    },
    [loadContext],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const selectSection = useCallback((id: OwnerDashboardSectionId) => {
    const next = normalizeOwnerDashboardSection(id);
    setActive(next);
    persistOwnerDashboardSection(next);
    setDrawerOpen(false);
  }, []);

  const access = context.access;
  const deniedKey = ownerDashboardDeniedKey(access);
  const canView = ownerDashboardCanView(access);
  const section = ownerDashboardSection(active);

  const tenant = useMemo(() => ownerBookingTenant(context.salon), [context.salon]);
  // PHASE 17.4 — permission and the concrete tenant scope both come from the
  // EXISTING ownership chain. The mutation layer rejects a business key that
  // is not in this session-resolved scope, even if a UI is crafted manually.
  const bookingActor: BookingActorContext = useMemo(
    () => resolveBookingActor({
      supabaseConfigured: true,
      userPresent: true,
      resolution: { status: access === 'authorized' ? 'resolved' : 'no-membership' },
      allowedBusinessIds: tenant?.businessIds,
    }),
    [access, tenant],
  );

  const salonName = ownerSalonDisplayName(context.salon) ?? t('shell.salonFallback');
  const salonLocation = ownerSalonLocationLine(context.salon) ?? t('shell.noLocation');

  const localeSwitch = (
    <div
      className="flex items-center rounded-xl border p-0.5"
      style={{ borderColor: palette.line }}
      role="group"
      aria-label={LOCALE_LABELS.en}
    >
      <Globe className="mx-1.5 h-3.5 w-3.5" style={{ color: palette.muted }} aria-hidden="true" />
      {SUPPORTED_LOCALES.map((code: AppLocale) => {
        const isActive = code === locale;
        return (
          <button
            key={code}
            type="button"
            data-testid={`owner-dashboard-locale-${code}`}
            onClick={() => setSiteLocale(code)}
            aria-pressed={isActive}
            className="rounded-lg px-2 py-1 text-[11px] font-bold transition-colors"
            style={{
              backgroundColor: isActive ? palette.accent : 'transparent',
              color: isActive ? palette.accentText : palette.muted,
            }}
          >
            {LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );

  const appearanceSwitch = (
    <button
      type="button"
      data-testid="owner-dashboard-appearance-toggle"
      onClick={() => {
        toggleAppearance();
        setSiteAppearance(appearance === 'dark' ? 'light' : 'dark');
      }}
      aria-label={appearance === 'dark' ? 'Light mode' : 'Dark mode'}
      className="rounded-xl border p-2 transition-colors"
      style={{ borderColor: palette.line, color: palette.accent }}
    >
      {appearance === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );

  const body = (() => {
    if (access === 'loading') {
      return <OwnerDashboardLoading palette={palette} label={t('state.loading')} />;
    }
    if (!canView) {
      return (
        <OwnerDashboardDenied
          palette={palette}
          title={t('denied.title')}
          message={t(deniedKey ?? 'denied.error')}
          retryLabel={t('state.retry')}
          onRetry={ownerDashboardCanRetry(access) ? () => load() : undefined}
        />
      );
    }
    if (!context.salon) {
      return (
        <OwnerDashboardError
          palette={palette}
          title={t('state.error.title')}
          body={t('state.error.body')}
          retryLabel={t('state.retry')}
          onRetry={() => load()}
        />
      );
    }
    if (active === 'overview') {
      return (
        <OverviewFoundation palette={palette} context={context} t={t} onSelect={selectSection} />
      );
    }
    // PHASE 17.2 — Today's Appointments. The actor and tenant keys are BOTH
    // derived from the session-resolved salon above; this component never
    // accepts a salon id from the user.
    if (active === 'today' && tenant) {
      return (
        <OwnerTodayAppointments
          actor={bookingActor}
          businessIds={tenant.businessIds}
          themeIds={THEME_IDS}
          palette={palette}
          filters={filters}
        />
      );
    }
    // PHASE 17.3 — Upcoming Appointments. Same session-resolved actor and
    // tenant keys; the data layer re-checks both on every read.
    if (active === 'upcoming' && tenant) {
      return (
        <OwnerUpcomingAppointments
          actor={bookingActor}
          businessIds={tenant.businessIds}
          themeIds={THEME_IDS}
          palette={palette}
          filters={filters}
        />
      );
    }
    // PHASE 17.5 — Customers are projected only from the same own-salon real
    // booking rows; no customer id or salon id is accepted from the UI.
    if (active === 'customers' && tenant) {
      return (
        <OwnerCustomers
          actor={bookingActor}
          businessIds={tenant.businessIds}
          themeIds={THEME_IDS}
          palette={palette}
          filters={filters}
        />
      );
    }
    // PHASE 17.6 — Financial totals are a read-only projection of the same
    // own-salon booking/payment rows. Payment and booking statuses remain
    // separate in the summary data layer.
    if (active === 'revenue' && tenant) {
      return (
        <OwnerRevenueSummary
          actor={bookingActor}
          businessIds={tenant.businessIds}
          themeIds={THEME_IDS}
          palette={palette}
          filters={filters}
        />
      );
    }
    // PHASE 17.7 — Day/week schedule over the same authorized appointment
    // records. Appointment selection opens the existing details/status surface.
    if (active === 'calendar' && tenant) {
      return (
        <OwnerCalendarSchedule
          actor={bookingActor}
          businessIds={tenant.businessIds}
          themeIds={THEME_IDS}
          palette={palette}
          filters={filters}
        />
      );
    }
    // PHASE 17.8 — Existing booking/payment events only; no parallel store or
    // click-generated notification path.
    if (active === 'notifications' && tenant) {
      return (
        <OwnerNotifications
          actor={bookingActor}
          businessIds={tenant.businessIds}
          themeIds={THEME_IDS}
          palette={palette}
          filters={filters}
        />
      );
    }
    return <SectionFoundation palette={palette} sectionId={active} t={t} />;
  })();

  return (
    <div
      data-testid="owner-dashboard"
      data-access={access}
      data-appearance={appearance}
      data-locale={locale}
      data-section={active}
      className="flex h-full min-h-0 w-full flex-col md:flex-row"
      style={{ backgroundColor: palette.shell, color: palette.text }}
    >
      {/* DESKTOP sidebar (lg+) and TABLET icon rail (md) */}
      <nav
        data-testid="owner-dashboard-sidebar"
        aria-label={t('shell.menu')}
        className="hidden shrink-0 flex-col border-r px-2 py-5 md:flex md:w-16 lg:w-60 lg:px-3"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <div className="mb-5 px-1 lg:px-2">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 shrink-0" style={{ color: palette.accent }} aria-hidden="true" />
            <span className="hidden text-sm font-extrabold tracking-tight lg:inline">{t('shell.title')}</span>
          </div>
          <p
            className="mt-1 hidden text-[10px] font-bold uppercase tracking-wider lg:block"
            style={{ color: palette.muted }}
          >
            {t('shell.subtitle')}
          </p>
        </div>
        <div className="hidden lg:block">
          <NavList palette={palette} active={active} onSelect={selectSection} t={t} idPrefix="owner-nav" />
        </div>
        <div className="lg:hidden">
          <NavList palette={palette} active={active} onSelect={selectSection} t={t} compact idPrefix="owner-rail" />
        </div>
      </nav>

      {/* MAIN COLUMN */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          data-testid="owner-dashboard-header"
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 md:px-6"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              data-testid="owner-dashboard-menu-button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t('shell.openMenu')}
              aria-expanded={drawerOpen}
              className="rounded-xl border p-2 md:hidden"
              style={{ borderColor: palette.line, color: palette.accent }}
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold tracking-tight" data-testid="owner-dashboard-salon-name">
                {canView ? salonName : t('shell.title')}
              </h1>
              <p
                className="truncate text-[10px] font-bold uppercase tracking-wider"
                style={{ color: palette.muted }}
                data-testid="owner-dashboard-salon-location"
              >
                {canView ? salonLocation : t('shell.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {localeSwitch}
            {appearanceSwitch}
            <button
              type="button"
              data-testid="owner-dashboard-refresh"
              onClick={() => load()}
              aria-label={t('shell.refresh')}
              className="rounded-xl border p-2 transition-colors"
              style={{ borderColor: palette.line, color: palette.muted }}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* MOBILE pills — quick access without opening the drawer */}
        <div
          data-testid="owner-dashboard-mobile-pills"
          className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b px-3 py-2 md:hidden"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          {OWNER_DASHBOARD_SECTIONS.map((item) => {
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`owner-pill-${item.id}`}
                onClick={() => selectSection(item.id)}
                className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold"
                style={{
                  backgroundColor: isActive ? palette.accent : 'transparent',
                  color: isActive ? palette.accentText : palette.muted,
                }}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>

        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 md:p-6">
          <div className="mx-auto min-w-0 w-full max-w-6xl space-y-4 sm:space-y-5">
            {canView && (
              <div data-testid="owner-dashboard-section-heading">
                <h2 className="text-base font-extrabold tracking-tight">{t(section.titleKey)}</h2>
                <p className="mt-1 text-xs font-semibold" style={{ color: palette.muted }}>
                  {t(section.descriptionKey)}
                </p>
              </div>
            )}
            {canView && tenant && active !== 'overview' && (
              <OwnerDashboardFilters
                actor={bookingActor}
                businessIds={tenant.businessIds}
                themeIds={THEME_IDS}
                filters={filters}
                onChange={setFilters}
                palette={palette}
              />
            )}
            {body}
          </div>
        </main>
      </div>

      {/* MOBILE drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" data-testid="owner-dashboard-drawer">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <nav
            aria-label={t('shell.menu')}
            className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col border-r p-4"
            style={{ backgroundColor: palette.panel, borderColor: palette.line }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-extrabold">{t('shell.title')}</span>
              <button
                type="button"
                data-testid="owner-dashboard-drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label={t('shell.closeMenu')}
                className="rounded-lg border p-1.5"
                style={{ borderColor: palette.line, color: palette.muted }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavList palette={palette} active={active} onSelect={selectSection} t={t} idPrefix="owner-drawer" />
          </nav>
        </div>
      )}
    </div>
  );
}
