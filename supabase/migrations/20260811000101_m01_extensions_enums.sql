-- M01 (DRAFT): extensions and canonical enums
-- Generated from docs/nexora-database-spec.md §5.25.
-- NOT applied to any database. Review M02 against the live schema before execution.

begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'nexora_access_role') then
    create type public.nexora_access_role as enum
      ('owner_admin', 'manager', 'service_provider', 'receptionist', 'limited_staff');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_business_status') then
    create type public.nexora_business_status as enum ('active', 'inactive', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_catalog_status') then
    create type public.nexora_catalog_status as enum ('active', 'inactive', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_staff_status') then
    create type public.nexora_staff_status as enum ('available', 'unavailable', 'inactive', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_media_type') then
    create type public.nexora_media_type as enum ('logo', 'hero', 'gallery', 'owner', 'staff');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_social_platform') then
    create type public.nexora_social_platform as enum ('instagram', 'facebook', 'youtube');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_website_template') then
    create type public.nexora_website_template as enum ('barber', 'hair_unisex', 'beauty_wellness');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_appearance') then
    create type public.nexora_appearance as enum ('light', 'dark');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_publish_status') then
    create type public.nexora_publish_status as enum ('draft', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_domain_status') then
    create type public.nexora_domain_status as enum ('not_configured', 'pending', 'verified', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_onboarding_status') then
    create type public.nexora_onboarding_status as enum ('in_progress', 'completed');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_booking_source') then
    create type public.nexora_booking_source as enum ('website', 'dashboard', 'walk_in', 'phone', 'whatsapp');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_booking_status') then
    create type public.nexora_booking_status as enum
      ('pending_payment', 'confirmed', 'upcoming', 'in_progress', 'completed', 'cancelled', 'no_show', 'expired');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_booking_payment_status') then
    create type public.nexora_booking_payment_status as enum ('pending', 'partially_paid', 'paid', 'failed', 'refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_balance_status') then
    create type public.nexora_balance_status as enum ('due', 'partially_paid', 'paid', 'refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_payment_order_status') then
    create type public.nexora_payment_order_status as enum ('created', 'paid', 'failed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_payment_status') then
    create type public.nexora_payment_status as enum ('pending', 'verified', 'failed', 'refunded', 'partially_refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_verification_status') then
    create type public.nexora_verification_status as enum ('pending', 'verified', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_referral_event_type') then
    create type public.nexora_referral_event_type as enum
      ('visit', 'setup_started', 'business_created', 'website_published');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_website_event_type') then
    create type public.nexora_website_event_type as enum
      ('page_view', 'book_now_click', 'whatsapp_click', 'call_click', 'directions_click', 'referral_badge_click');
  end if;
  if not exists (select 1 from pg_type where typname = 'nexora_plan_status') then
    create type public.nexora_plan_status as enum ('active', 'trialing', 'past_due', 'cancelled', 'expired');
  end if;
end
$$;

commit;
