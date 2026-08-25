/**
 * PHASE 17.1 — SALON OWNER DASHBOARD · FOUNDATION data layer.
 *
 * This module is the ONE place that decides:
 *   1. WHICH salon the signed-in owner is allowed to see, and
 *   2. WHETHER the owner dashboard may render at all.
 *
 * OWNERSHIP — the EXISTING organization model, reused verbatim through
 * `resolveOwnerSalonId()` (src/lib/ownerSalon.ts):
 *
 *     auth.users.id
 *       -> public.organization_members.user_id  (role = 'owner', active)
 *       -> organization_members.organization_id
 *       -> public.salons.organization_id
 *       -> public.salons.id                     (deleted_at is null)
 *
 * `job_salon_members` is a STAFF/EMPLOYEE relationship and is deliberately
 * NOT consulted for ownership — exactly as Phases 14.6 / 15.6 / 16.7 do.
 *
 * The salon id is never hardcoded, never read from the URL/localStorage/props
 * and never "the first row". A caller cannot pass one in: the dashboard reads
 * whatever the authenticated session resolves to, or it renders a refusal.
 *
 * DATABASE — read-only, existing columns only. `public.salons` columns used
 * here are the same ones the owner location editor and the public nearby
 * search already read (`id, name, slug, address, city, is_active`). No
 * migration, no new table/column, no RPC is introduced by this phase, and the
 * draft migration set (M01–M27) stays unapplied.
 *
 * SCOPE (17.1 only) — resolution + access states + the section registry that
 * the dashboard navigation is built from. Appointment lists, customer
 * management, revenue calculation, calendar logic and notifications are
 * explicitly NOT implemented here; later phases fill those sections in.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { resolveOwnerSalonId, SALON_TABLE_NAME } from './ownerSalon';
import type { OwnerSalonResolution } from './ownerSalon';
import { completeOwnerAuthSession } from './ownerSession';
import { diagnosticFromError, logWorkspaceFailure } from './workspaceDiagnostics';

/* ------------------------------------------------------------------ */
/* Section registry — the dashboard's navigation structure             */
/* ------------------------------------------------------------------ */

export const OWNER_DASHBOARD_SECTION_IDS = [
  'overview',
  'today',
  'upcoming',
  'customers',
  'revenue',
  'calendar',
  'notifications',
] as const;

export type OwnerDashboardSectionId = (typeof OWNER_DASHBOARD_SECTION_IDS)[number];

/** Icon key resolved to a lucide icon by the shell (no JSX in the data layer). */
export type OwnerDashboardIconKey =
  | 'overview'
  | 'today'
  | 'upcoming'
  | 'customers'
  | 'revenue'
  | 'calendar'
  | 'notifications';

export interface OwnerDashboardSection {
  id: OwnerDashboardSectionId;
  icon: OwnerDashboardIconKey;
  /** i18n key for the nav label. */
  labelKey: string;
  /** i18n key for the section heading. */
  titleKey: string;
  /** i18n key for the one-line description under the heading. */
  descriptionKey: string;
}

/** Canonical order of the owner dashboard sections (navigation order). */
export const OWNER_DASHBOARD_SECTIONS: OwnerDashboardSection[] = [
  {
    id: 'overview',
    icon: 'overview',
    labelKey: 'section.overview.label',
    titleKey: 'section.overview.title',
    descriptionKey: 'section.overview.description',
  },
  {
    id: 'today',
    icon: 'today',
    labelKey: 'section.today.label',
    titleKey: 'section.today.title',
    descriptionKey: 'section.today.description',
  },
  {
    id: 'upcoming',
    icon: 'upcoming',
    labelKey: 'section.upcoming.label',
    titleKey: 'section.upcoming.title',
    descriptionKey: 'section.upcoming.description',
  },
  {
    id: 'customers',
    icon: 'customers',
    labelKey: 'section.customers.label',
    titleKey: 'section.customers.title',
    descriptionKey: 'section.customers.description',
  },
  {
    id: 'revenue',
    icon: 'revenue',
    labelKey: 'section.revenue.label',
    titleKey: 'section.revenue.title',
    descriptionKey: 'section.revenue.description',
  },
  {
    id: 'calendar',
    icon: 'calendar',
    labelKey: 'section.calendar.label',
    titleKey: 'section.calendar.title',
    descriptionKey: 'section.calendar.description',
  },
  {
    id: 'notifications',
    icon: 'notifications',
    labelKey: 'section.notifications.label',
    titleKey: 'section.notifications.title',
    descriptionKey: 'section.notifications.description',
  },
];

export const DEFAULT_OWNER_DASHBOARD_SECTION: OwnerDashboardSectionId = 'overview';

/** Remembers the last opened section (UI preference only — never identity). */
export const OWNER_DASHBOARD_SECTION_KEY = 'nexora_owner_dashboard_section';

export function isOwnerDashboardSection(value: unknown): value is OwnerDashboardSectionId {
  return (
    typeof value === 'string' &&
    (OWNER_DASHBOARD_SECTION_IDS as readonly string[]).includes(value)
  );
}

export function normalizeOwnerDashboardSection(value: unknown): OwnerDashboardSectionId {
  return isOwnerDashboardSection(value) ? value : DEFAULT_OWNER_DASHBOARD_SECTION;
}

export function ownerDashboardSection(
  id: OwnerDashboardSectionId,
): OwnerDashboardSection {
  return (
    OWNER_DASHBOARD_SECTIONS.find((section) => section.id === id) ??
    OWNER_DASHBOARD_SECTIONS[0]
  );
}

export function readStoredOwnerDashboardSection(): OwnerDashboardSectionId {
  if (typeof window === 'undefined') return DEFAULT_OWNER_DASHBOARD_SECTION;
  try {
    return normalizeOwnerDashboardSection(
      window.localStorage.getItem(OWNER_DASHBOARD_SECTION_KEY),
    );
  } catch {
    return DEFAULT_OWNER_DASHBOARD_SECTION;
  }
}

export function persistOwnerDashboardSection(id: OwnerDashboardSectionId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OWNER_DASHBOARD_SECTION_KEY, id);
  } catch {
    // Private-mode storage failures must never break the dashboard.
  }
}

/** Route-owned section for refresh/direct-link support; null outside dashboard. */
export function ownerDashboardSectionFromPath(pathname: string): OwnerDashboardSectionId | null {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized !== '/dashboard' && !normalized.startsWith('/dashboard/')) return null;
  const segment = normalized.slice('/dashboard'.length).replace(/^\/+/, '').split('/')[0];
  return segment ? normalizeOwnerDashboardSection(segment) : DEFAULT_OWNER_DASHBOARD_SECTION;
}

export function ownerDashboardSectionPath(id: OwnerDashboardSectionId): string {
  const section = normalizeOwnerDashboardSection(id);
  return section === DEFAULT_OWNER_DASHBOARD_SECTION
    ? '/dashboard'
    : `/dashboard/${section}`;
}

/* ------------------------------------------------------------------ */
/* Access model                                                        */
/* ------------------------------------------------------------------ */

/**
 * Mirrors `resolveBookingActor` (16.7) / `resolveVideoActor` (15.6) semantics
 * so the whole app answers "may this session act as the salon owner?" the
 * same way. The owner dashboard shows REAL salon data, so — unlike the
 * wizard-draft surfaces — an unconfigured backend is NOT an authorized tier.
 */
export type OwnerDashboardAccess =
  | 'authorized'
  | 'loading'
  | 'not-configured'
  | 'not-authenticated'
  | 'no-ownership'
  | 'ambiguous'
  | 'permission-denied'
  | 'error';

export function mapOwnerSalonResolution(
  resolution: OwnerSalonResolution | null | undefined,
): OwnerDashboardAccess {
  if (!resolution) return 'error';
  switch (resolution.status) {
    case 'resolved':
      return 'authorized';
    case 'not-configured':
      return 'not-configured';
    case 'not-authenticated':
      return 'not-authenticated';
    case 'no-membership':
      return 'no-ownership';
    case 'ambiguous':
      return 'ambiguous';
    case 'permission-denied':
      return 'permission-denied';
    default:
      return 'error';
  }
}

/** True only when the session owns exactly one salon and may read it. */
export function ownerDashboardCanView(access: OwnerDashboardAccess): boolean {
  return access === 'authorized';
}

/** i18n key for the refusal card, or null when the dashboard may render. */
export function ownerDashboardDeniedKey(access: OwnerDashboardAccess): string | null {
  switch (access) {
    case 'authorized':
    case 'loading':
      return null;
    case 'not-configured':
      return 'denied.notConfigured';
    case 'not-authenticated':
      return 'denied.login';
    case 'no-ownership':
      return 'denied.noSalon';
    case 'ambiguous':
      return 'denied.ambiguous';
    case 'permission-denied':
      return 'denied.permission';
    default:
      return 'denied.error';
  }
}

/** Retrying only helps for transient failures — never for a refusal. */
export function ownerDashboardCanRetry(access: OwnerDashboardAccess): boolean {
  return access === 'error' || access === 'permission-denied';
}

/* ------------------------------------------------------------------ */
/* Salon header data (existing columns only, read-only)                */
/* ------------------------------------------------------------------ */

/** The minimal salon identity the dashboard chrome shows. */
export interface OwnerSalonSummary {
  id: string;
  /** Existing tenant column on `public.salons` — used to key booking rows. */
  organizationId: string | null;
  name: string | null;
  slug: string | null;
  address: string | null;
  city: string | null;
  isActive: boolean;
}

/**
 * Columns verified to exist on `public.salons` and already read elsewhere in
 * this app (`salonLocationService.ts`, `nearbySalons.ts`, `ownerSalon.ts`).
 * Nothing new.
 */
export const OWNER_SALON_SUMMARY_COLUMNS =
  'id, organization_id, name, slug, address, city, is_active';

interface OwnerSalonRow {
  id: string;
  organization_id: string | null;
  name: string | null;
  slug: string | null;
  address: string | null;
  city: string | null;
  is_active: unknown;
}

export function mapOwnerSalonRow(row: OwnerSalonRow): OwnerSalonSummary {
  return {
    id: row.id,
    organizationId:
      typeof row.organization_id === 'string' && row.organization_id.trim()
        ? row.organization_id.trim()
        : null,
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : null,
    slug: typeof row.slug === 'string' && row.slug.trim() ? row.slug.trim() : null,
    address: typeof row.address === 'string' && row.address.trim() ? row.address.trim() : null,
    city: typeof row.city === 'string' && row.city.trim() ? row.city.trim() : null,
    isActive: row.is_active === true,
  };
}

function isPermissionError(code: string | undefined): boolean {
  return code === '42501' || code === 'PGRST301';
}

/**
 * Read ONE salon row — the session-resolved one. The id argument always comes
 * from `resolveOwnerSalonId()`; RLS remains the real boundary, this filter
 * only expresses the same intent.
 */
export async function fetchOwnerSalonSummary(
  salonId: string,
): Promise<{ status: 'ready'; salon: OwnerSalonSummary } | { status: 'permission-denied' } | { status: 'error' }> {
  if (!supabase) return { status: 'error' };
  try {
    const { data, error } = await supabase
      .from(SALON_TABLE_NAME)
      .select(OWNER_SALON_SUMMARY_COLUMNS)
      .eq('id', salonId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      const diagnostic = diagnosticFromError({
        operation: 'dashboard.salon_read',
        stage: 'salon-read',
        error,
        authenticatedUserExists: true,
      });
      logWorkspaceFailure(diagnostic);
      if (isPermissionError((error as { code?: string }).code)) {
        return { status: 'permission-denied' };
      }
      return { status: 'error' };
    }
    if (!data) return { status: 'error' };
    return { status: 'ready', salon: mapOwnerSalonRow(data as unknown as OwnerSalonRow) };
  } catch (err) {
    const diagnostic = diagnosticFromError({
      operation: 'dashboard.salon_read',
      stage: 'salon-read',
      error: err,
      authenticatedUserExists: true,
    });
    logWorkspaceFailure(diagnostic);
    return { status: 'error' };
  }
}

/* ------------------------------------------------------------------ */
/* Context orchestration                                               */
/* ------------------------------------------------------------------ */

export interface OwnerDashboardContext {
  access: OwnerDashboardAccess;
  /** Present ONLY when access === 'authorized'. */
  salon: OwnerSalonSummary | null;
}

export const LOADING_OWNER_DASHBOARD_CONTEXT: OwnerDashboardContext = {
  access: 'loading',
  salon: null,
};

/**
 * Full resolution for the dashboard shell:
 *   session → ownership (organization_members → salons) → salon row.
 *
 * Every non-`authorized` result carries NO salon data at all, so an
 * unauthorized viewer can never receive another salon's row — not even a name.
 */
export async function loadOwnerDashboardContext(): Promise<OwnerDashboardContext> {
  if (!isSupabaseConfigured || !supabase) {
    return { access: 'not-configured', salon: null };
  }

  let resolution = await resolveOwnerSalonId();
  if (resolution.status === 'no-membership') {
    const session = await completeOwnerAuthSession();
    if (!('error' in session) && session.salonId) {
      resolution = { status: 'resolved', salonId: session.salonId };
    }
  }
  const access = mapOwnerSalonResolution(resolution);
  if (access !== 'authorized' || resolution.status !== 'resolved') {
    return { access, salon: null };
  }

  const salonResult = await fetchOwnerSalonSummary(resolution.salonId);
  if (salonResult.status === 'ready') {
    return { access: 'authorized', salon: salonResult.salon };
  }
  if (salonResult.status === 'permission-denied') {
    return { access: 'permission-denied', salon: null };
  }
  return { access: 'error', salon: null };
}

/* ------------------------------------------------------------------ */
/* Booking tenant keys for the owner's own salon                       */
/* ------------------------------------------------------------------ */

/**
 * Tenant keys the owner's OWN booking rows can carry.
 *
 * Booking records are stamped at creation by the EXISTING engine rule
 * (`bookingBusinessId()` in `siteBookingFlow.ts`): service provenance first,
 * then an explicit `businessId` on the payload, then the shared `public-site`
 * fallback. The dashboard therefore cannot assume a single key — it must ask
 * for the SAME keys the owner's own site would have stamped.
 *
 * These candidates are all derived from the SESSION-RESOLVED salon (or the
 * engine's own fallback). None is typed in by a user and none identifies
 * another owner's salon: `organization_id` and `id` come from the row the
 * ownership chain returned, and the `public-site` fallback only ever matches
 * rows this browser created from this owner's own website.
 *
 * This adds no column and no id — it reads the keys that already exist.
 */
export interface OwnerBookingTenant {
  /** Candidate business ids, most specific first. */
  businessIds: string[];
  /** Salon id, for traceability in the UI layer. */
  salonId: string;
}

/** The shared fallback the booking engine uses when a site has no tenant. */
export const BOOKING_FALLBACK_BUSINESS_ID = 'public-site';

export function ownerBookingTenant(salon: OwnerSalonSummary | null): OwnerBookingTenant | null {
  if (!salon) return null;
  const candidates: string[] = [];
  if (salon.organizationId) candidates.push(salon.organizationId);
  if (salon.id) candidates.push(salon.id);
  candidates.push(BOOKING_FALLBACK_BUSINESS_ID);
  return {
    businessIds: Array.from(new Set(candidates)),
    salonId: salon.id,
  };
}

/**
 * Display name for the dashboard header. Returns null when the salon has no
 * stored name — the shell then renders neutral copy instead of inventing one.
 */
export function ownerSalonDisplayName(salon: OwnerSalonSummary | null): string | null {
  return salon?.name ?? null;
}

/** "Address, City" when both exist; whichever exists otherwise; else null. */
export function ownerSalonLocationLine(salon: OwnerSalonSummary | null): string | null {
  if (!salon) return null;
  const parts = [salon.address, salon.city].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  if (parts.length === 0) return null;
  return parts.join(', ');
}
