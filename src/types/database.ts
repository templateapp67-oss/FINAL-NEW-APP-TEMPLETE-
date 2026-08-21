/**
 * Phase 1A + Phase 2 canonical shared-backend types.
 *
 * This checked-in subset covers entities introduced or normalized by M28–M32
 * (identity, roles, membership, salons, themes, categories, services,
 * products, locations, bookings, payments, media). Regenerate the complete
 * project type file with the Supabase CLI after the migrations are applied to
 * the real project; live generation is blocked in this workspace because no
 * database connection was provided.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type PlatformRole = 'customer' | 'business_user' | 'growth_partner' | 'delivery_partner' | 'admin';
export type OrganizationRole = 'owner' | 'staff';
export type OrganizationStatus = 'active' | 'inactive' | 'archived';
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type PaymentStatus = 'unpaid' | 'pending' | 'partially_paid' | 'paid' | 'failed' | 'cancelled' | 'refunded';
export type LocationApprovalStatus = 'pending' | 'approved' | 'rejected';
export type MediaStatus = 'pending' | 'active' | 'inactive' | 'rejected' | 'archived';

/** Canonical role mapping (one role system, two scopes):
 *  - customer/admin live on profiles.platform_role
 *  - owner/staff live on organization_members.role (tenant-scoped)
 *
 * Phase 3A required roles resolve onto this ONE system:
 *    owner    → organization_members.role = 'owner'   (tenant scope)
 *    staff    → organization_members.role = 'staff'   (tenant scope)
 *    customer → profiles.platform_role = 'customer'   (global scope)
 *    admin    → profiles.platform_role = 'admin'      (global scope)
 * There is no fourth/fifth "role table" and no client-controlled role field.
 */
export type CanonicalRole = 'owner' | 'staff' | 'customer' | 'admin';

/** The full canonical profile row after M36 (columns that exist in the live
 * shared schema — nothing invented; wallet/points are server-ledger fields
 * that clients may never write). */
export interface CanonicalProfileRow {
  id: string;
  full_name: string | null;
  platform_role: PlatformRole;
  is_active: boolean;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  loyalty_points: number;
  wallet_balance_paise: number;
  last_seen_at: string | null;
  role_assigned_at: string;
  role_assigned_by: string | null;
  created_at: string;
  updated_at: string;
  /** Live-shared-schema-only preference columns (Phase 3A/3B-FIX drift note):
   * read by the Main Website app but not created by any committed migration.
   * Optional here so typed reads compile against BOTH the fresh chain (absent)
   * and the live schema (present). Never dropped, never written by clients. */
  allow_recently_viewed?: boolean | null;
  preferred_city?: string | null;
  preferred_area?: string | null;
  gender?: string | null;
}

export interface OrganizationRow {
  id: string;
  name: string;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMemberRow {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalonRow {
  id: string;
  organization_id: string;
  theme_id: string | null;
  name: string;
  /** M28 adds the public-facing identity/location copy columns. */
  slug: string | null;
  address: string | null;
  city: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One published/ drafted public website per salon (pre-existing shared table
 * that M28's preflight requires; M28 adds the published/owner-draft RLS and
 * owner read/insert/update policies). The `config` JSON is the site copy.
 */
export interface SalonPublicWebsiteRow {
  id: string;
  salon_id: string;
  slug: string;
  template_key: string;
  config: Json;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Anonymous-safe salon projection (M28 `public.public_salon_catalog`
 * security-barrier view over salons + salon_public_websites).
 */
export interface PublicSalonCatalogRow {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
}

/**
 * One of the five canonical application themes (M28 seed; M32 slugs;
 * M35 reconciles the family theme's public slug to
 * 'full_service_family_salon' while theme_id stays 'family_full_service').
 */
export interface ThemeRow {
  id: string;
  theme_id: string;
  slug: string;
  name: string;
  description: string | null;
  target_audience: string | null;
  ui_config: Json;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ThemeId =
  | 'barber_mens_grooming'
  | 'hair_studio_color_bar'
  | 'beauty_skin_spa'
  | 'family_full_service'
  | 'nail_lash_studio';

export interface ServiceCategoryRow {
  id: string;
  theme_id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRow {
  id: string;
  salon_id: string;
  theme_id: string | null;
  category_id: string | null;
  predefined_service_id: string | null;
  name: string;
  description: string | null;
  price_paise: number;
  duration_minutes: number;
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCategoryRow {
  id: string;
  salon_id: string;
  theme_id: string;
  name: string;
  is_active: boolean;
  display_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  salon_id: string;
  category_id: string | null;
  theme_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price_paise: number;
  currency: 'INR';
  track_inventory: boolean;
  inventory_quantity: number | null;
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingRow {
  id: string;
  salon_id: string;
  customer_id: string;
  staff_id: string | null;
  appointment_start: string;
  appointment_end: string | null;
  status: BookingStatus;
  payment_status: PaymentStatus;
  total_amount_paise: number;
  advance_amount_paise: number;
  currency: 'INR';
  expires_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingServiceRow {
  id: string;
  booking_id: string;
  salon_id: string;
  service_id: string;
  service_name_snapshot: string;
  price_paise: number;
  duration_minutes: number;
  quantity: number;
  created_at: string;
}

export type BookingSlotHoldStatus = 'active' | 'converted' | 'released' | 'expired';

/** Server-side slot hold (M28 §6). RLS: own holds + salon members. */
export interface BookingSlotHoldRow {
  id: string;
  salon_id: string;
  customer_id: string;
  service_id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  status: BookingSlotHoldStatus;
  idempotency_key: string;
  expires_at: string;
  created_at: string;
}

/** M28 `create_booking_slot_hold` RPC input + returned row. */
export interface CreateBookingSlotHoldInput {
  p_salon_id: string;
  p_service_id: string;
  p_staff_id: string | null;
  p_starts_at: string;
  p_idempotency_key: string;
  p_hold_minutes?: number;
}
export type CreateBookingSlotHoldResult = BookingSlotHoldRow;

export interface BusinessLocationRow {
  salon_id: string;
  latitude: number;
  longitude: number;
  address_label: string;
  approval_status: LocationApprovalStatus;
  submitted_by: string;
  submitted_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalonMediaRow {
  id: string;
  salon_id: string;
  theme_id: string | null;
  service_id: string | null;
  product_id: string | null;
  media_type: 'logo' | 'hero' | 'gallery' | 'owner' | 'staff' | 'service' | 'product' | 'video' | 'thumbnail';
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  thumbnail_path: string | null;
  platform: string | null;
  title: string | null;
  description: string | null;
  video_kind: 'short' | 'long' | null;
  status: MediaStatus;
  display_order: number;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentOrderRow {
  id: string;
  salon_id: string;
  booking_id: string;
  provider: 'razorpay';
  provider_order_id: string;
  amount_paise: number;
  currency: 'INR';
  status: 'created' | 'paid' | 'failed' | 'cancelled' | 'expired';
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  salon_id: string;
  booking_id: string;
  payment_order_id: string;
  provider: 'razorpay';
  provider_payment_id: string;
  amount_paise: number;
  currency: 'INR';
  method: string | null;
  status: 'authorized' | 'captured' | 'failed' | 'refunded' | 'partially_refunded';
  verified_at: string;
  created_at: string;
  updated_at: string;
}

/** Result of the Phase 2 salon-theme binding RPC (public.phase2_set_salon_theme). */
export interface SetSalonThemeResult {
  salon_id: string;
  theme_id: string;
}
