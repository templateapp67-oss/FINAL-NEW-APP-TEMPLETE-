/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Offline introspection of the canonical Design-B migration chain replayed in
 * PGlite (scripts/generate-db-types.mjs). Regenerate with:
 *
 *   npm run db:types:local
 *
 * CI regenerates and diffs this file so schema/type drift fails the build.
 * The canonical live project may contain additional manual hotfix objects;
 * reconcile those through a new migration (never by hand-editing here).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      booking_request_keys: {
        Row: {
      id: string;
      customer_id: string;
      idempotency_key: string;
      request_fingerprint: string;
      booking_id: string | null;
      created_at: string;
        };
        Insert: {
      id?: string;
      customer_id: string;
      idempotency_key: string;
      request_fingerprint: string;
      booking_id?: string | null;
      created_at?: string;
        };
        Update: {
      id?: string;
      customer_id?: string;
      idempotency_key?: string;
      request_fingerprint?: string;
      booking_id?: string | null;
      created_at?: string;
        };
        Relationships: [];
      };
      booking_services: {
        Row: {
      id: string;
      booking_id: string;
      salon_id: string;
      service_id: string;
      service_name_snapshot: string;
      price_paise: number;
      duration_minutes: number;
      quantity: number;
      created_at: string;
        };
        Insert: {
      id?: string;
      booking_id: string;
      salon_id: string;
      service_id: string;
      service_name_snapshot: string;
      price_paise: number;
      duration_minutes: number;
      quantity?: number;
      created_at?: string;
        };
        Update: {
      id?: string;
      booking_id?: string;
      salon_id?: string;
      service_id?: string;
      service_name_snapshot?: string;
      price_paise?: number;
      duration_minutes?: number;
      quantity?: number;
      created_at?: string;
        };
        Relationships: [];
      };
      booking_slot_holds: {
        Row: {
      id: string;
      salon_id: string;
      customer_id: string;
      service_id: string;
      staff_id: string | null;
      starts_at: string;
      ends_at: string;
      status: string;
      idempotency_key: string;
      expires_at: string;
      created_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      customer_id: string;
      service_id: string;
      staff_id?: string | null;
      starts_at: string;
      ends_at: string;
      status?: string;
      idempotency_key: string;
      expires_at: string;
      created_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      customer_id?: string;
      service_id?: string;
      staff_id?: string | null;
      starts_at?: string;
      ends_at?: string;
      status?: string;
      idempotency_key?: string;
      expires_at?: string;
      created_at?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
      id: string;
      salon_id: string;
      customer_id: string;
      appointment_start: string;
      status: string;
      total_amount_paise: number;
      advance_amount_paise: number;
      created_at: string;
      appointment_end: string | null;
      staff_id: string | null;
      currency: string;
      payment_status: string;
      expires_at: string | null;
      cancelled_at: string | null;
      completed_at: string | null;
      updated_at: string;
      fulfillment_mode: string;
      service_address: string | null;
      service_latitude: number | null;
      service_longitude: number | null;
      service_distance_km: number | null;
      home_service_charge_paise: number;
        };
        Insert: {
      id?: string;
      salon_id: string;
      customer_id: string;
      appointment_start: string;
      status?: string;
      total_amount_paise?: number;
      advance_amount_paise?: number;
      created_at?: string;
      appointment_end?: string | null;
      staff_id?: string | null;
      currency?: string;
      payment_status?: string;
      expires_at?: string | null;
      cancelled_at?: string | null;
      completed_at?: string | null;
      updated_at?: string;
      fulfillment_mode?: string;
      service_address?: string | null;
      service_latitude?: number | null;
      service_longitude?: number | null;
      service_distance_km?: number | null;
      home_service_charge_paise?: number;
        };
        Update: {
      id?: string;
      salon_id?: string;
      customer_id?: string;
      appointment_start?: string;
      status?: string;
      total_amount_paise?: number;
      advance_amount_paise?: number;
      created_at?: string;
      appointment_end?: string | null;
      staff_id?: string | null;
      currency?: string;
      payment_status?: string;
      expires_at?: string | null;
      cancelled_at?: string | null;
      completed_at?: string | null;
      updated_at?: string;
      fulfillment_mode?: string;
      service_address?: string | null;
      service_latitude?: number | null;
      service_longitude?: number | null;
      service_distance_km?: number | null;
      home_service_charge_paise?: number;
        };
        Relationships: [];
      };
      business_locations: {
        Row: {
      salon_id: string;
      latitude: number;
      longitude: number;
      address_label: string;
      approval_status: string;
      submitted_by: string;
      submitted_at: string;
      approved_by: string | null;
      approved_at: string | null;
      rejection_reason: string | null;
      updated_at: string;
      created_at: string;
        };
        Insert: {
      salon_id: string;
      latitude: number;
      longitude: number;
      address_label: string;
      approval_status?: string;
      submitted_by: string;
      submitted_at?: string;
      approved_by?: string | null;
      approved_at?: string | null;
      rejection_reason?: string | null;
      updated_at?: string;
      created_at?: string;
        };
        Update: {
      salon_id?: string;
      latitude?: number;
      longitude?: number;
      address_label?: string;
      approval_status?: string;
      submitted_by?: string;
      submitted_at?: string;
      approved_by?: string | null;
      approved_at?: string | null;
      rejection_reason?: string | null;
      updated_at?: string;
      created_at?: string;
        };
        Relationships: [];
      };
      catalog_translations: {
        Row: {
      id: string;
      theme_id: string;
      entity_type: string;
      category_id: string | null;
      predefined_service_id: string | null;
      locale: string;
      name: string;
      description: string;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      theme_id: string;
      entity_type: string;
      category_id?: string | null;
      predefined_service_id?: string | null;
      locale: string;
      name: string;
      description?: string;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      theme_id?: string;
      entity_type?: string;
      category_id?: string | null;
      predefined_service_id?: string | null;
      locale?: string;
      name?: string;
      description?: string;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
      id: string;
      workspace_id: string;
      email: string | null;
      token: string;
      role: string;
      expires_at: string | null;
      accepted_at: string | null;
      accepted_by: string | null;
      created_at: string;
        };
        Insert: {
      id?: string;
      workspace_id: string;
      email?: string | null;
      token: string;
      role?: string;
      expires_at?: string | null;
      accepted_at?: string | null;
      accepted_by?: string | null;
      created_at?: string;
        };
        Update: {
      id?: string;
      workspace_id?: string;
      email?: string | null;
      token?: string;
      role?: string;
      expires_at?: string | null;
      accepted_at?: string | null;
      accepted_by?: string | null;
      created_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
      id: string;
      workspace_id: string;
      user_id: string;
      role: string;
      status: string;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      workspace_id: string;
      user_id: string;
      role?: string;
      status?: string;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      workspace_id?: string;
      user_id?: string;
      role?: string;
      status?: string;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
      organization_id: string;
      user_id: string;
      role: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      organization_id: string;
      user_id: string;
      role?: string;
      is_active?: boolean;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      organization_id?: string;
      user_id?: string;
      role?: string;
      is_active?: boolean;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
      id: string;
      name: string;
      status: string;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      name: string;
      status?: string;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      name?: string;
      status?: string;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      package_services: {
        Row: {
      id: string;
      package_id: string;
      service_id: string;
      salon_id: string | null;
      display_order: number;
      service_name_snapshot: string | null;
      individual_price_paise: number | null;
      duration_minutes_snapshot: number | null;
      created_at: string;
        };
        Insert: {
      id?: string;
      package_id: string;
      service_id: string;
      salon_id?: string | null;
      display_order?: number;
      service_name_snapshot?: string | null;
      individual_price_paise?: number | null;
      duration_minutes_snapshot?: number | null;
      created_at?: string;
        };
        Update: {
      id?: string;
      package_id?: string;
      service_id?: string;
      salon_id?: string | null;
      display_order?: number;
      service_name_snapshot?: string | null;
      individual_price_paise?: number | null;
      duration_minutes_snapshot?: number | null;
      created_at?: string;
        };
        Relationships: [];
      };
      packages: {
        Row: {
      id: string;
      salon_id: string | null;
      theme_id: string | null;
      category_id: string | null;
      name: string;
      description: string | null;
      original_price_paise: number | null;
      price_paise: number;
      duration_minutes: number | null;
      discount_type: string | null;
      discount_percentage: number | null;
      fixed_discount_paise: number | null;
      promotional_badge: string | null;
      status: string;
      display_order: number;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id?: string | null;
      theme_id?: string | null;
      category_id?: string | null;
      name: string;
      description?: string | null;
      original_price_paise?: number | null;
      price_paise: number;
      duration_minutes?: number | null;
      discount_type?: string | null;
      discount_percentage?: number | null;
      fixed_discount_paise?: number | null;
      promotional_badge?: string | null;
      status?: string;
      display_order?: number;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string | null;
      theme_id?: string | null;
      category_id?: string | null;
      name?: string;
      description?: string | null;
      original_price_paise?: number | null;
      price_paise?: number;
      duration_minutes?: number | null;
      discount_type?: string | null;
      discount_percentage?: number | null;
      fixed_discount_paise?: number | null;
      promotional_badge?: string | null;
      status?: string;
      display_order?: number;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      payment_orders: {
        Row: {
      id: string;
      salon_id: string;
      booking_id: string;
      provider: string;
      provider_order_id: string;
      amount_paise: number;
      currency: string;
      status: string;
      expires_at: string | null;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      booking_id: string;
      provider?: string;
      provider_order_id: string;
      amount_paise: number;
      currency?: string;
      status?: string;
      expires_at?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      booking_id?: string;
      provider?: string;
      provider_order_id?: string;
      amount_paise?: number;
      currency?: string;
      status?: string;
      expires_at?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      payment_refunds: {
        Row: {
      id: string;
      salon_id: string;
      booking_id: string;
      payment_id: string;
      provider: string;
      provider_refund_id: string | null;
      amount_paise: number;
      currency: string;
      status: string;
      reason: string | null;
      created_by: string;
      provider_response: Json | null;
      idempotency_key: string;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      booking_id: string;
      payment_id: string;
      provider?: string;
      provider_refund_id?: string | null;
      amount_paise: number;
      currency?: string;
      status?: string;
      reason?: string | null;
      created_by: string;
      provider_response?: Json | null;
      idempotency_key: string;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      booking_id?: string;
      payment_id?: string;
      provider?: string;
      provider_refund_id?: string | null;
      amount_paise?: number;
      currency?: string;
      status?: string;
      reason?: string | null;
      created_by?: string;
      provider_response?: Json | null;
      idempotency_key?: string;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      payment_webhook_events: {
        Row: {
      id: string;
      provider: string;
      event_type: string;
      signature: string;
      signature_verified: boolean;
      payload: Json;
      idempotency_key: string;
      processed: boolean;
      processed_at: string | null;
      error_message: string | null;
      created_at: string;
        };
        Insert: {
      id?: string;
      provider: string;
      event_type: string;
      signature: string;
      signature_verified?: boolean;
      payload: Json;
      idempotency_key: string;
      processed?: boolean;
      processed_at?: string | null;
      error_message?: string | null;
      created_at?: string;
        };
        Update: {
      id?: string;
      provider?: string;
      event_type?: string;
      signature?: string;
      signature_verified?: boolean;
      payload?: Json;
      idempotency_key?: string;
      processed?: boolean;
      processed_at?: string | null;
      error_message?: string | null;
      created_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
      id: string;
      salon_id: string;
      booking_id: string;
      payment_order_id: string;
      provider: string;
      provider_payment_id: string;
      amount_paise: number;
      currency: string;
      method: string | null;
      status: string;
      signature: string | null;
      verified_at: string;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      booking_id: string;
      payment_order_id: string;
      provider?: string;
      provider_payment_id: string;
      amount_paise: number;
      currency?: string;
      method?: string | null;
      status?: string;
      signature?: string | null;
      verified_at?: string;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      booking_id?: string;
      payment_order_id?: string;
      provider?: string;
      provider_payment_id?: string;
      amount_paise?: number;
      currency?: string;
      method?: string | null;
      status?: string;
      signature?: string | null;
      verified_at?: string;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      predefined_services: {
        Row: {
      id: string;
      theme_id: string;
      category_id: string;
      name: string;
      description: string | null;
      is_suggested: boolean;
      sort_order: number;
      is_active: boolean;
      suggested_label: string | null;
      suggested_sort_order: number | null;
      default_price_paise: number | null;
      default_duration_minutes: number | null;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      theme_id: string;
      category_id: string;
      name: string;
      description?: string | null;
      is_suggested?: boolean;
      sort_order?: number;
      is_active?: boolean;
      suggested_label?: string | null;
      suggested_sort_order?: number | null;
      default_price_paise?: number | null;
      default_duration_minutes?: number | null;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      theme_id?: string;
      category_id?: string;
      name?: string;
      description?: string | null;
      is_suggested?: boolean;
      sort_order?: number;
      is_active?: boolean;
      suggested_label?: string | null;
      suggested_sort_order?: number | null;
      default_price_paise?: number | null;
      default_duration_minutes?: number | null;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
      id: string;
      salon_id: string;
      theme_id: string;
      name: string;
      is_active: boolean;
      display_order: number;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
        };
        Insert: {
      id?: string;
      salon_id: string;
      theme_id: string;
      name: string;
      is_active?: boolean;
      display_order?: number;
      created_at?: string;
      updated_at?: string;
      deleted_at?: string | null;
        };
        Update: {
      id?: string;
      salon_id?: string;
      theme_id?: string;
      name?: string;
      is_active?: boolean;
      display_order?: number;
      created_at?: string;
      updated_at?: string;
      deleted_at?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
      id: string;
      salon_id: string;
      category_id: string | null;
      theme_id: string;
      name: string;
      description: string | null;
      sku: string | null;
      price_paise: number;
      currency: string;
      track_inventory: boolean;
      inventory_quantity: number | null;
      is_active: boolean;
      is_featured: boolean;
      display_order: number;
      deleted_at: string | null;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      category_id?: string | null;
      theme_id: string;
      name: string;
      description?: string | null;
      sku?: string | null;
      price_paise: number;
      currency?: string;
      track_inventory?: boolean;
      inventory_quantity?: number | null;
      is_active?: boolean;
      is_featured?: boolean;
      display_order?: number;
      deleted_at?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      category_id?: string | null;
      theme_id?: string;
      name?: string;
      description?: string | null;
      sku?: string | null;
      price_paise?: number;
      currency?: string;
      track_inventory?: boolean;
      inventory_quantity?: number | null;
      is_active?: boolean;
      is_featured?: boolean;
      display_order?: number;
      deleted_at?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
      id: string;
      full_name: string;
      platform_role: string;
      is_active: boolean;
      avatar_url: string | null;
      phone: string | null;
      email: string | null;
      created_at: string;
      updated_at: string;
      last_seen_at: string | null;
      loyalty_points: number;
      wallet_balance_paise: number;
      role_assigned_at: string;
      role_assigned_by: string | null;
        };
        Insert: {
      id: string;
      full_name?: string;
      platform_role?: string;
      is_active?: boolean;
      avatar_url?: string | null;
      phone?: string | null;
      email?: string | null;
      created_at?: string;
      updated_at?: string;
      last_seen_at?: string | null;
      loyalty_points?: number;
      wallet_balance_paise?: number;
      role_assigned_at?: string;
      role_assigned_by?: string | null;
        };
        Update: {
      id?: string;
      full_name?: string;
      platform_role?: string;
      is_active?: boolean;
      avatar_url?: string | null;
      phone?: string | null;
      email?: string | null;
      created_at?: string;
      updated_at?: string;
      last_seen_at?: string | null;
      loyalty_points?: number;
      wallet_balance_paise?: number;
      role_assigned_at?: string;
      role_assigned_by?: string | null;
        };
        Relationships: [];
      };
      salon_hours: {
        Row: {
      id: string;
      salon_id: string;
      day_of_week: number;
      opens: string | null;
      closes: string | null;
      is_closed: boolean;
        };
        Insert: {
      id?: string;
      salon_id: string;
      day_of_week: number;
      opens?: string | null;
      closes?: string | null;
      is_closed?: boolean;
        };
        Update: {
      id?: string;
      salon_id?: string;
      day_of_week?: number;
      opens?: string | null;
      closes?: string | null;
      is_closed?: boolean;
        };
        Relationships: [];
      };
      salon_media: {
        Row: {
      id: string;
      salon_id: string;
      theme_id: string | null;
      service_id: string | null;
      product_id: string | null;
      media_type: string;
      storage_bucket: string | null;
      storage_path: string | null;
      external_url: string | null;
      thumbnail_path: string | null;
      platform: string | null;
      title: string | null;
      description: string | null;
      video_kind: string | null;
      status: string;
      display_order: number;
      created_by: string;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
        };
        Insert: {
      id?: string;
      salon_id: string;
      theme_id?: string | null;
      service_id?: string | null;
      product_id?: string | null;
      media_type: string;
      storage_bucket?: string | null;
      storage_path?: string | null;
      external_url?: string | null;
      thumbnail_path?: string | null;
      platform?: string | null;
      title?: string | null;
      description?: string | null;
      video_kind?: string | null;
      status?: string;
      display_order?: number;
      created_by: string;
      created_at?: string;
      updated_at?: string;
      deleted_at?: string | null;
        };
        Update: {
      id?: string;
      salon_id?: string;
      theme_id?: string | null;
      service_id?: string | null;
      product_id?: string | null;
      media_type?: string;
      storage_bucket?: string | null;
      storage_path?: string | null;
      external_url?: string | null;
      thumbnail_path?: string | null;
      platform?: string | null;
      title?: string | null;
      description?: string | null;
      video_kind?: string | null;
      status?: string;
      display_order?: number;
      created_by?: string;
      created_at?: string;
      updated_at?: string;
      deleted_at?: string | null;
        };
        Relationships: [];
      };
      salon_public_websites: {
        Row: {
      id: string;
      salon_id: string;
      slug: string;
      template_key: string;
      config: Json;
      is_published: boolean;
      published_at: string | null;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      slug: string;
      template_key?: string;
      config?: Json;
      is_published?: boolean;
      published_at?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      slug?: string;
      template_key?: string;
      config?: Json;
      is_published?: boolean;
      published_at?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      salon_service_activity: {
        Row: {
      id: string;
      salon_id: string;
      actor_user_id: string | null;
      event_type: string;
      entity_type: string;
      entity_id: string | null;
      metadata: Json;
      created_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      actor_user_id?: string | null;
      event_type: string;
      entity_type?: string;
      entity_id?: string | null;
      metadata?: Json;
      created_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      actor_user_id?: string | null;
      event_type?: string;
      entity_type?: string;
      entity_id?: string | null;
      metadata?: Json;
      created_at?: string;
        };
        Relationships: [];
      };
      salons: {
        Row: {
      id: string;
      organization_id: string;
      name: string;
      slug: string | null;
      address: string | null;
      city: string | null;
      is_active: boolean;
      deleted_at: string | null;
      theme_id: string | null;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      organization_id: string;
      name: string;
      slug?: string | null;
      address?: string | null;
      city?: string | null;
      is_active?: boolean;
      deleted_at?: string | null;
      theme_id?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      organization_id?: string;
      name?: string;
      slug?: string | null;
      address?: string | null;
      city?: string | null;
      is_active?: boolean;
      deleted_at?: string | null;
      theme_id?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      saved_service_media: {
        Row: {
      id: string;
      salon_id: string;
      theme_id: string;
      service_id: string;
      image_url: string | null;
      banner_url: string | null;
      icon_url: string | null;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      theme_id: string;
      service_id: string;
      image_url?: string | null;
      banner_url?: string | null;
      icon_url?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      theme_id?: string;
      service_id?: string;
      image_url?: string | null;
      banner_url?: string | null;
      icon_url?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      saved_service_translations: {
        Row: {
      id: string;
      salon_id: string;
      theme_id: string;
      service_id: string;
      locale: string;
      name: string;
      description: string;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      theme_id: string;
      service_id: string;
      locale: string;
      name: string;
      description?: string;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      theme_id?: string;
      service_id?: string;
      locale?: string;
      name?: string;
      description?: string;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      service_categories: {
        Row: {
      id: string;
      theme_id: string;
      name: string;
      sort_order: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      slug: string;
      deleted_at: string | null;
        };
        Insert: {
      id?: string;
      theme_id: string;
      name: string;
      sort_order?: number;
      is_active?: boolean;
      created_at?: string;
      updated_at?: string;
      slug: string;
      deleted_at?: string | null;
        };
        Update: {
      id?: string;
      theme_id?: string;
      name?: string;
      sort_order?: number;
      is_active?: boolean;
      created_at?: string;
      updated_at?: string;
      slug?: string;
      deleted_at?: string | null;
        };
        Relationships: [];
      };
      service_offers: {
        Row: {
      id: string;
      salon_id: string;
      theme_id: string;
      target_type: string;
      category_id: string | null;
      predefined_service_id: string | null;
      saved_service_id: string | null;
      package_id: string | null;
      title: string;
      promotional_badge: string;
      discount_type: string;
      discount_percentage: number | null;
      fixed_discount_paise: number | null;
      start_date: string;
      end_date: string;
      status: string;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      theme_id: string;
      target_type: string;
      category_id?: string | null;
      predefined_service_id?: string | null;
      saved_service_id?: string | null;
      package_id?: string | null;
      title: string;
      promotional_badge: string;
      discount_type: string;
      discount_percentage?: number | null;
      fixed_discount_paise?: number | null;
      start_date: string;
      end_date: string;
      status?: string;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      theme_id?: string;
      target_type?: string;
      category_id?: string | null;
      predefined_service_id?: string | null;
      saved_service_id?: string | null;
      package_id?: string | null;
      title?: string;
      promotional_badge?: string;
      discount_type?: string;
      discount_percentage?: number | null;
      fixed_discount_paise?: number | null;
      start_date?: string;
      end_date?: string;
      status?: string;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      service_price_variants: {
        Row: {
      id: string;
      salon_id: string;
      theme_id: string;
      service_id: string;
      name: string;
      price_paise: number;
      duration_minutes: number | null;
      status: string;
      display_order: number;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      theme_id: string;
      service_id: string;
      name: string;
      price_paise: number;
      duration_minutes?: number | null;
      status?: string;
      display_order?: number;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      theme_id?: string;
      service_id?: string;
      name?: string;
      price_paise?: number;
      duration_minutes?: number | null;
      status?: string;
      display_order?: number;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
      id: string;
      salon_id: string;
      name: string;
      description: string | null;
      price_paise: number;
      duration_minutes: number;
      theme_id: string | null;
      category_id: string | null;
      predefined_service_id: string | null;
      is_active: boolean;
      deleted_at: string | null;
      display_order: number;
      is_featured: boolean;
      created_at: string;
      updated_at: string;
      category: string | null;
      short_description: string | null;
      promotional_badge: string | null;
        };
        Insert: {
      id?: string;
      salon_id: string;
      name: string;
      description?: string | null;
      price_paise: number;
      duration_minutes: number;
      theme_id?: string | null;
      category_id?: string | null;
      predefined_service_id?: string | null;
      is_active?: boolean;
      deleted_at?: string | null;
      display_order?: number;
      is_featured?: boolean;
      created_at?: string;
      updated_at?: string;
      category?: string | null;
      short_description?: string | null;
      promotional_badge?: string | null;
        };
        Update: {
      id?: string;
      salon_id?: string;
      name?: string;
      description?: string | null;
      price_paise?: number;
      duration_minutes?: number;
      theme_id?: string | null;
      category_id?: string | null;
      predefined_service_id?: string | null;
      is_active?: boolean;
      deleted_at?: string | null;
      display_order?: number;
      is_featured?: boolean;
      created_at?: string;
      updated_at?: string;
      category?: string | null;
      short_description?: string | null;
      promotional_badge?: string | null;
        };
        Relationships: [];
      };
      staff: {
        Row: {
      id: string;
      salon_id: string;
      name: string;
      role: string | null;
      is_active: boolean;
      deleted_at: string | null;
        };
        Insert: {
      id?: string;
      salon_id: string;
      name: string;
      role?: string | null;
      is_active?: boolean;
      deleted_at?: string | null;
        };
        Update: {
      id?: string;
      salon_id?: string;
      name?: string;
      role?: string | null;
      is_active?: boolean;
      deleted_at?: string | null;
        };
        Relationships: [];
      };
      themes: {
        Row: {
      id: string;
      theme_id: string;
      name: string;
      description: string | null;
      target_audience: string | null;
      ui_config: Json;
      sort_order: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      slug: string;
        };
        Insert: {
      id?: string;
      theme_id: string;
      name: string;
      description?: string | null;
      target_audience?: string | null;
      ui_config?: Json;
      sort_order?: number;
      is_active?: boolean;
      created_at?: string;
      updated_at?: string;
      slug: string;
        };
        Update: {
      id?: string;
      theme_id?: string;
      name?: string;
      description?: string | null;
      target_audience?: string | null;
      ui_config?: Json;
      sort_order?: number;
      is_active?: boolean;
      created_at?: string;
      updated_at?: string;
      slug?: string;
        };
        Relationships: [];
      };
      website_bookings: {
        Row: {
      id: string;
      salon_id: string;
      customer_name: string;
      customer_phone: string;
      customer_email: string | null;
      service_id: string | null;
      service_name_snapshot: string;
      price_paise: number;
      duration_minutes: number | null;
      staff_id: string | null;
      appointment_date: string;
      start_time: string;
      end_time: string | null;
      note: string | null;
      booking_reference: string;
      status: string;
      source: string;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      salon_id: string;
      customer_name: string;
      customer_phone: string;
      customer_email?: string | null;
      service_id?: string | null;
      service_name_snapshot: string;
      price_paise?: number;
      duration_minutes?: number | null;
      staff_id?: string | null;
      appointment_date: string;
      start_time: string;
      end_time?: string | null;
      note?: string | null;
      booking_reference: string;
      status?: string;
      source?: string;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      salon_id?: string;
      customer_name?: string;
      customer_phone?: string;
      customer_email?: string | null;
      service_id?: string | null;
      service_name_snapshot?: string;
      price_paise?: number;
      duration_minutes?: number | null;
      staff_id?: string | null;
      appointment_date?: string;
      start_time?: string;
      end_time?: string | null;
      note?: string | null;
      booking_reference?: string;
      status?: string;
      source?: string;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
      id: string;
      name: string;
      owner_id: string | null;
      created_at: string;
      updated_at: string;
        };
        Insert: {
      id?: string;
      name: string;
      owner_id?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Update: {
      id?: string;
      name?: string;
      owner_id?: string | null;
      created_at?: string;
      updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
