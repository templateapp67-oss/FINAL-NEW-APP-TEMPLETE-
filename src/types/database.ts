/**
 * Phase 1A canonical shared-backend types.
 *
 * This checked-in subset covers entities introduced or normalized by M28–M30.
 * Regenerate the complete project type file with the Supabase CLI after the
 * migrations are applied to the real project; live generation is blocked in
 * this workspace because no database connection was provided.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type PlatformRole = 'customer' | 'business_user' | 'growth_partner' | 'admin';
export type OrganizationRole = 'owner' | 'staff';
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type PaymentStatus = 'unpaid' | 'pending' | 'partially_paid' | 'paid' | 'failed' | 'cancelled' | 'refunded';
export type LocationApprovalStatus = 'pending' | 'approved' | 'rejected';
export type MediaStatus = 'pending' | 'active' | 'inactive' | 'rejected' | 'archived';

export interface CanonicalProfileRow {
  id: string;
  full_name: string | null;
  platform_role: PlatformRole;
  is_active: boolean;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMemberRow {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  is_active: boolean;
}

export interface SalonRow {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  deleted_at: string | null;
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
