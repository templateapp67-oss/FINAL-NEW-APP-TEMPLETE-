-- ============================================================================
-- M38 / Reconciliation fix — consolidate M01–M37 onto the Design B salons model
-- ============================================================================
--
-- Purpose
-- --------
-- The gap analysis (docs/database-gaps-analysis.md) found that M01–M27 encode a
-- "businesses"-keyed model (Design A) while M28–M37 and *all* runtime code
-- (`src/lib/*`, `server/*`) use the "organizations → salons.organization_id"
-- model (Design B).  Several canonical Design B objects are required by the
-- code and by M28/M37 preflights but are created by NO migration — they only
-- exist in the live shared Supabase project.  This migration reconciles that
-- divergence so the Design B chain is self-describing and idempotent.
--
-- What this file does (idempotent, additive, non-destructive):
--   1. Creates the canonical base tables IF NOT EXISTS, exactly as the
--      application and M28–M37 expect:
--        profiles, organizations, organization_members, salons,
--        salon_public_websites
--      On the live shared DB these tables already exist, so the CREATEs are
--      no-ops; the column definitions here are the authoritative reference.
--   2. Fills any missing canonical columns via ADD COLUMN IF NOT EXISTS
--      (drift fill for partially-migrated live schemas) + safe backfills.
--   3. Reconciles the LIVE membership guard (see "live membership guard"
--      note below) and runs the idempotent owner/staff backfill that M28's
--      backfill and docs/owner-location-setup.sql STEP 3 need — without
--      breaking on `private.protect_organization_membership_fields()`.
--   4. Re-asserts the private `salon-media` bucket and its tenant-scoped
--      storage policies (M30 semantics), so the bucket is guaranteed present.
--   5. Re-asserts the single canonical ownership RPC (`owner_salon_ids`) and
--      its delegating alias (`nexora_owner_salon_ids`) + grants, closing the
--      "two ownership helpers" drift flagged in the gap analysis.
--   6. Ships `verify_m38_reconciliation()` — a read-only self-test.
--
-- Live membership guard (reconciliation target)
-- ----------------------------------------------
-- The live Main Website schema ships a BEFORE INSERT/UPDATE trigger
-- `private.protect_organization_membership_fields()` on
-- public.organization_members that raises:
--
--   P0001: only an organization owner or admin may assign owner role
--
-- whenever role='owner' is set by a context that is not already an org owner
-- or admin. In the Supabase Dashboard SQL editor there is no request JWT, so
-- auth.uid() is NULL and the guard raises EVEN when running as postgres —
-- which breaks M28's owner backfill (UPDATE ... SET role='owner') and
-- docs/owner-location-setup.sql STEP 3 (INSERT ... role='owner'). This file
-- disables that specific guard around a trusted backfill and restores it
-- exactly; it never alters or weakens the guard function itself.
--
-- What this file does NOT do (deliberately):
--   * It does NOT drop, rename, or rewrite M01–M27 (Design A) objects.  Those
--     remain historical spec drafts; archiving them is a separate decision
--     (see docs/database-gaps-analysis.md §7).
--   * It does NOT invent `staff` / `salon_hours` schemas.  Those tables are
--     under-specified in-repo (only `id`/`salon_id`/`is_active` are known from
--     M28/M37 preflights) and belong to the live Main Website schema.  Creating
--     them with a guessed shape would violate the "never invent business
--     facts / reconcile live schema first" guardrails.  M34/M37 already handle
--     their FKs and RLS with `to_regclass(...) is not null` guards, so their
--     absence degrades safely.
--   * It does not invent RLS *policies* — M28/M36/M37 own those. RLS is
--     enabled idempotently so a fresh bootstrap is deny-by-default until
--     those migrations add their policies. Table-level SELECT on
--     salon_public_websites (and themes / public_salon_catalog when present)
--     is granted so PostgREST/anon can reach the published-read policy.
--
-- Ordering note
-- -------------
-- M28 and M37 are FAIL-CLOSED: they raise if the base tables are absent.  That
-- is correct for the live project (the tables exist there).  On a hypothetical
-- fresh database this file bootstraps the identity / tenant / website roots
-- (it is fully idempotent).  M28 still requires the live operational tables
-- `services`, `staff`, `salon_hours`, and `bookings` — this file deliberately
-- does not invent those shapes.  M01–M27 must NOT be applied to the same
-- database (Design A fork).
--
-- `organization_members.is_active` ownership
-- ------------------------------------------
-- Live memberships track activity as `status` (active value = 'active').
-- M28 owns the reconciliation of that column onto a STORED GENERATED
-- `is_active`.  This file must NEVER add a writable `is_active` beside a
-- live `status` column — that would make M28 skip its generated-column
-- path and mis-activate every NULL row.  `is_active` is added here only
-- on a fresh bootstrap that has neither column.  `owner_salon_ids()` and
-- the membership activity index follow whichever activity column exists.
--
-- Design B tenant authority (single source of truth, unchanged here):
--   auth.users.id → profiles.id → organization_members (role: owner|staff)
--   → organizations → salons.organization_id
-- ============================================================================

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

-- ============================================================================
-- 1. Canonical base tables (Design B)
-- ============================================================================

-- 1.1 Identity: one profile per auth user. Columns exactly mirror the
--     CanonicalProfileRow in src/types/database.ts and the columns M36's
--     handle_new_user() / guard triggers read and write.
create table if not exists public.profiles (
  id                   uuid primary key,
  full_name            text,
  platform_role        text not null default 'customer',
  is_active            boolean not null default true,
  email                text,
  phone                text,
  avatar_url           text,
  last_seen_at         timestamptz,
  loyalty_points       integer not null default 0,
  wallet_balance_paise bigint not null default 0,
  role_assigned_at     timestamptz not null default now(),
  role_assigned_by     uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 1.2 Tenant umbrella: organizations. One organization owns N salons.
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.3 Membership: the ONLY tenant-scoped role authority.
--     role: 'owner' | 'staff' (never a client-supplied value).
create table if not exists public.organization_members (
  organization_id uuid not null,
  user_id         uuid not null,
  role            text not null default 'staff',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint organization_members_role_check
    check (role in ('owner', 'staff'))
);

-- 1.4 Salon (tenant leaf). Slug authority deliberately lives on
--     salon_public_websites (see 1.5), matching M28's public_salon_catalog
--     view contract ("slug/publication authority remains salon_public_websites").
create table if not exists public.salons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  theme_id        uuid,
  name            text not null,
  address         text,
  city            text,
  is_active       boolean not null default true,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 1.5 One published/draft public website per salon. This is the table the
--     application reads and writes (salonWebsiteService.ts, PublicSalonView.tsx,
--     main.tsx) and the one M28's preflight + policies target.
create table if not exists public.salon_public_websites (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null,
  slug         text not null,
  template_key text,
  config       jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================================
-- 2. Drift fill — add any canonical column a partially-migrated live schema
--    might be missing, then backfill safely. All idempotent.
-- ============================================================================

alter table public.profiles
  add column if not exists full_name            text,
  add column if not exists platform_role        text,
  add column if not exists is_active            boolean,
  add column if not exists email                text,
  add column if not exists phone                text,
  add column if not exists avatar_url           text,
  add column if not exists last_seen_at         timestamptz,
  add column if not exists loyalty_points       integer,
  add column if not exists wallet_balance_paise bigint,
  add column if not exists role_assigned_at     timestamptz,
  add column if not exists role_assigned_by     uuid,
  add column if not exists created_at           timestamptz,
  add column if not exists updated_at           timestamptz;

alter table public.organizations
  add column if not exists name       text,
  add column if not exists status     text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.organization_members
  add column if not exists role       text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

-- is_active is added ONLY when the live `status` activity column is absent.
-- If `status` exists, M28 owns the generated is_active flag. If is_active
-- already exists (canonical or post-M28), leave it untouched.
do $m38_members_is_active$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_members'
      and column_name = 'is_active'
  ) then
    return;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_members'
      and column_name = 'status'
  ) then
    return;
  end if;
  alter table public.organization_members
    add column is_active boolean;
end
$m38_members_is_active$;

alter table public.salons
  add column if not exists theme_id        uuid,
  add column if not exists address         text,
  add column if not exists city            text,
  add column if not exists is_active       boolean,
  add column if not exists deleted_at      timestamptz,
  add column if not exists created_at      timestamptz,
  add column if not exists updated_at      timestamptz;

alter table public.salon_public_websites
  add column if not exists salon_id     uuid,
  add column if not exists slug         text,
  add column if not exists template_key text,
  add column if not exists config       jsonb,
  add column if not exists is_published boolean,
  add column if not exists published_at timestamptz,
  add column if not exists created_at   timestamptz,
  add column if not exists updated_at   timestamptz;

-- Safe non-destructive backfills (never overwrite existing data).
update public.profiles
   set platform_role = 'customer'
 where platform_role is null or btrim(platform_role) = '';

update public.profiles
   set is_active = true
 where is_active is null;

-- NOTE: organization_members.role is deliberately NOT backfilled here. It is
-- backfilled owner-first (platform_role='business_user' → 'owner') in the
-- guard-safe block §2b below; a blanket role='staff' here would mislabel
-- owners before that block runs.
--
-- is_active is only written when it is a regular (non-generated) column.
-- A generated flag (M28) cannot be updated; a missing flag (live `status`)
-- is not ours to invent.
do $m38_members_is_active_backfill$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_members'
      and column_name = 'is_active'
      and is_generated = 'NEVER'
  ) then
    update public.organization_members
       set is_active = true
     where is_active is null;
  end if;
end
$m38_members_is_active_backfill$;

update public.salons
   set is_active = true
 where is_active is null;

update public.salon_public_websites
   set config = '{}'::jsonb
 where config is null;

update public.salon_public_websites
   set is_published = false
 where is_published is null;

-- ============================================================================
-- 2b. Live membership guard reconciliation + owner/staff backfill
-- ============================================================================
-- The live `private.protect_organization_membership_fields()` trigger raises
-- "only an organization owner or admin may assign owner role" when role='owner'
-- is set outside an owner/admin context. In the SQL editor auth.uid() is NULL,
-- so the guard raises even as postgres. Fix: for a TRUSTED, idempotent
-- backfill we (1) disable that specific guard, (2) backfill owner-first then
-- staff, (3) restore the guard to its exact prior state. The guard function is
-- never altered and the table is never left unguarded — the whole block is one
-- transaction, so any failure rolls the disable/enable back too.
do $m38_membership_backfill$
declare
  v_trig_names  text[] := null;
  v_trig_states text[] := null;
  v_i           integer;
begin
  select array_agg(t.tgname::text order by t.tgname),
         array_agg(t.tgenabled::text order by t.tgname)
    into v_trig_names, v_trig_states
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.organization_members'::regclass
    and not t.tgisinternal
    and p.proname = 'protect_organization_membership_fields';

  -- 1. Disable the live guard for the trusted backfill.
  if v_trig_names is not null then
    for v_i in 1 .. array_length(v_trig_names, 1) loop
      execute format('alter table public.organization_members disable trigger %I',
                     v_trig_names[v_i]);
    end loop;
  end if;

  -- 2. Owner backfill first: established platform-role signal → tenant owner.
  --    Mirrors M28 §2; only NULL/blank roles are touched, never explicit ones.
  update public.organization_members om
     set role = 'owner'
    from public.profiles p
   where p.id = om.user_id
     and p.platform_role = 'business_user'
     and (om.role is null or btrim(om.role) = '');

  -- 3. Remaining memberships are staff.
  update public.organization_members
     set role = 'staff'
   where role is null or btrim(role) = '';

  -- 4. Restore each guard to its exact prior state (O/R/A → enable variant).
  if v_trig_names is not null then
    for v_i in 1 .. array_length(v_trig_names, 1) loop
      execute format(
        'alter table public.organization_members %s %I',
        case v_trig_states[v_i]
          when 'O' then 'enable trigger'
          when 'R' then 'enable replica trigger'
          when 'A' then 'enable always trigger'
          else 'disable trigger'
        end,
        v_trig_names[v_i]
      );
    end loop;
  end if;
end
$m38_membership_backfill$;

-- ---------------------------------------------------------------------------
-- Manual owner provisioning (SQL editor) — use this in place of the raw INSERT
-- in docs/owner-location-setup.sql STEP 3 when the live guard is present.
--
-- First find the live trigger name (normally one row):
--   select t.tgname
--   from pg_trigger t
--   join pg_proc p on p.oid = t.tgfoid
--   where t.tgrelid = 'public.organization_members'::regclass
--     and not t.tgisinternal
--     and p.proname = 'protect_organization_membership_fields';
--
-- Then:
--   begin;
--   alter table public.organization_members disable trigger <trigger-name>;
--   insert into public.organization_members (organization_id, user_id, role, is_active)
--   values ('<org-id>'::uuid, '<user-id>'::uuid, 'owner', true)
--   on conflict (organization_id, user_id)
--   do update set role = 'owner', is_active = true;
--   alter table public.organization_members enable trigger <trigger-name>;
--   commit;
--
-- If the live project uses a differently-named guard, adjust the `p.proname`
-- filter in both the DO block above and this lookup accordingly.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- 3. Foreign keys + indexes (guarded, name-stable so M28/M32/M34/M36 no-op)
-- ============================================================================

-- profiles.id → auth.users(id)
do $m38_profiles_fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end
$m38_profiles_fk$;

-- organization_members.user_id → profiles(id)  (name matches M28's expectation)
do $m38_org_member_profile_fk$
begin
  if to_regclass('public.profiles') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.organization_members'::regclass
         and conname = 'organization_members_user_profile_fk'
     ) then
    alter table public.organization_members
      add constraint organization_members_user_profile_fk
      foreign key (user_id) references public.profiles(id) on delete cascade
      not valid;
    alter table public.organization_members
      validate constraint organization_members_user_profile_fk;
  end if;
end
$m38_org_member_profile_fk$;

-- organization_members.organization_id → organizations(id)
do $m38_org_member_org_fk$
begin
  if to_regclass('public.organizations') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.organization_members'::regclass
         and conname = 'organization_members_organization_fkey'
     ) then
    alter table public.organization_members
      add constraint organization_members_organization_fkey
      foreign key (organization_id) references public.organizations(id)
      on delete cascade not valid;
    alter table public.organization_members
      validate constraint organization_members_organization_fkey;
  end if;
end
$m38_org_member_org_fk$;

-- salons.organization_id → organizations(id)  (name matches M28's expectation)
do $m38_salons_org_fk$
begin
  if to_regclass('public.organizations') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.salons'::regclass
         and conname = 'salons_organization_phase1a_fk'
     ) then
    alter table public.salons
      add constraint salons_organization_phase1a_fk
      foreign key (organization_id) references public.organizations(id)
      on delete restrict not valid;
    alter table public.salons validate constraint salons_organization_phase1a_fk;
  end if;
end
$m38_salons_org_fk$;

-- salons.theme_id → themes(id)  (name matches M32's expectation)
do $m38_salons_theme_fk$
begin
  if to_regclass('public.themes') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.salons'::regclass
         and conname = 'salons_theme_phase2_fk'
     ) then
    alter table public.salons
      add constraint salons_theme_phase2_fk
      foreign key (theme_id) references public.themes(id)
      on delete restrict not valid;
    alter table public.salons validate constraint salons_theme_phase2_fk;
  end if;
end
$m38_salons_theme_fk$;

-- salon_public_websites.salon_id → salons(id)  (name matches M34's expectation)
do $m38_spw_salon_fk$
begin
  if to_regclass('public.salons') is not null
     and not exists (
       select 1 from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       where c.conrelid = 'public.salon_public_websites'::regclass
         and c.contype = 'f'
         and c.confrelid = 'public.salons'::regclass
         and a.attname = 'salon_id'
     ) then
    alter table public.salon_public_websites
      add constraint salon_public_websites_salon_phase2b_fk
      foreign key (salon_id) references public.salons(id)
      on delete restrict not valid;
    alter table public.salon_public_websites
      validate constraint salon_public_websites_salon_phase2b_fk;
  end if;
end
$m38_spw_salon_fk$;

-- Indexes referenced by the ownership chain (name matches M28's expectations).
create index if not exists organization_members_org_user_unique
  on public.organization_members (organization_id, user_id);
-- The activity-role index requires is_active. On a live status-only schema
-- M28 creates this index after it adds the generated flag; do not fail here.
do $m38_members_active_idx$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_members'
      and column_name = 'is_active'
  ) then
    execute $idx$
      create index if not exists organization_members_user_active_role_idx
        on public.organization_members (user_id, is_active, role, organization_id)
    $idx$;
  end if;
end
$m38_members_active_idx$;
create index if not exists salons_organization_active_idx
  on public.salons (organization_id, is_active)
  where deleted_at is null;

-- One published/draft website per salon (idempotent; M28 adds policies/grants).
create unique index if not exists salon_public_websites_salon_unique
  on public.salon_public_websites (salon_id);

-- A unique slug guard. Only created when no legacy duplicate slugs exist, so
-- it can never fail on live data (the code relies on slug uniqueness at
-- insert time and reports "slug may already be in use" on conflict).
do $m38_spw_slug_unique$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'salon_public_websites'
      and indexname = 'salon_public_websites_slug_unique'
  ) and not exists (
    select 1
    from public.salon_public_websites
    where slug is not null and btrim(slug) <> ''
    group by slug
    having count(*) > 1
  ) then
    create unique index salon_public_websites_slug_unique
      on public.salon_public_websites (slug)
      where slug is not null and btrim(slug) <> '';
  end if;
end
$m38_spw_slug_unique$;

-- ============================================================================
-- 4. RLS enablement (idempotent). Policies for these tables are owned by
--    M28 / M36 / M37; enabling here only guarantees deny-by-default on a fresh
--    bootstrap before those migrations run.
-- ============================================================================

alter table public.profiles                 enable row level security;
alter table public.organizations            enable row level security;
alter table public.organization_members     enable row level security;
alter table public.salons                   enable row level security;
alter table public.salon_public_websites    enable row level security;

-- Public website lookup (main.tsx, PublicSalonView.tsx) and the owner draft
-- path (salonWebsiteService.ts) need table-level SELECT so PostgREST can
-- expose the table. RLS still decides which rows are visible (published +
-- public salon for anon; owner-draft for authenticated).
grant select on table public.salon_public_websites to anon, authenticated;
do $m38_public_catalog_grants$
begin
  if to_regclass('public.public_salon_catalog') is not null then
    execute 'grant select on public.public_salon_catalog to anon, authenticated';
  end if;
  if to_regclass('public.themes') is not null then
    execute 'grant select on table public.themes to anon, authenticated';
  end if;
end
$m38_public_catalog_grants$;

-- ============================================================================
-- 5. salon-media bucket + tenant-scoped storage policies (M30 semantics)
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'salon-media',
  'salon-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

-- Path parser: '{salon}/{salon_id}/...' → salon_id (safe, returns NULL on bad input).
create or replace function private.phase1a_storage_salon_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(p_name);
begin
  if array_length(parts, 1) < 2 or parts[1] <> 'salon' then return null; end if;
  begin
    return parts[2]::uuid;
  exception when others then
    return null;
  end;
end
$$;

revoke all on function private.phase1a_storage_salon_id(text)
  from public, anon, authenticated;
grant execute on function private.phase1a_storage_salon_id(text)
  to anon, authenticated, service_role;

-- Tenant-scoped object policies. These reference public.salon_media and the
-- M28 private helpers (has_salon_role / is_public_salon), which do not exist
-- yet in a fresh bootstrap. PostgreSQL resolves both table AND function
-- references at CREATE POLICY time, so the whole policy block is skipped until
-- those M28 prerequisites are present (M30 owns them in the normal chain; here
-- they are re-asserted idempotently for a drift-filled live schema).
do $m38_salon_media_policies$
begin
  if to_regclass('public.salon_media') is not null
     and to_regprocedure('private.has_salon_role(uuid, text[])') is not null
     and to_regprocedure('private.is_public_salon(uuid)') is not null
  then
    -- Public read is metadata-backed; uploading a file alone never publishes it.
    execute 'drop policy if exists phase1a_salon_media_public_object_read on storage.objects';
    execute $policy$
      create policy phase1a_salon_media_public_object_read
      on storage.objects for select to anon, authenticated
      using (
        bucket_id = 'salon-media'
        and exists (
          select 1
          from public.salon_media sm
          where sm.storage_bucket = bucket_id
            and sm.storage_path = name
            and sm.status = 'active'
            and sm.salon_id = private.phase1a_storage_salon_id(name)
            and private.is_public_salon(sm.salon_id)
        )
      )
    $policy$;

    execute 'drop policy if exists phase1a_salon_media_member_object_insert on storage.objects';
    execute $policy$
      create policy phase1a_salon_media_member_object_insert
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'salon-media'
        and private.has_salon_role(private.phase1a_storage_salon_id(name))
      )
    $policy$;

    execute 'drop policy if exists phase1a_salon_media_member_object_select on storage.objects';
    execute $policy$
      create policy phase1a_salon_media_member_object_select
      on storage.objects for select to authenticated
      using (
        bucket_id = 'salon-media'
        and private.has_salon_role(private.phase1a_storage_salon_id(name))
      )
    $policy$;

    execute 'drop policy if exists phase1a_salon_media_member_object_update on storage.objects';
    execute $policy$
      create policy phase1a_salon_media_member_object_update
      on storage.objects for update to authenticated
      using (
        bucket_id = 'salon-media'
        and private.has_salon_role(private.phase1a_storage_salon_id(name))
      )
      with check (
        bucket_id = 'salon-media'
        and private.has_salon_role(private.phase1a_storage_salon_id(name))
      )
    $policy$;

    execute 'drop policy if exists phase1a_salon_media_member_object_delete on storage.objects';
    execute $policy$
      create policy phase1a_salon_media_member_object_delete
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'salon-media'
        and private.has_salon_role(private.phase1a_storage_salon_id(name))
      )
    $policy$;
  end if;
end
$m38_salon_media_policies$;

revoke all on storage.objects from anon, authenticated;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

-- ============================================================================
-- 6. Ownership RPC reconciliation — ONE canonical authority + one delegating
--    alias (closes the owner_salon_ids / nexora_owner_salon_ids drift).
-- ============================================================================

-- Activity predicate follows the live column: is_active (canonical / post-M28)
-- or status = 'active' (pre-M28 live vocabulary). Never reference a column
-- that is not there — that would abort the whole migration.
do $m38_owner_rpc$
declare
  v_active_pred text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_members'
      and column_name = 'is_active'
  ) then
    v_active_pred := 'om.is_active = true';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_members'
      and column_name = 'status'
  ) then
    v_active_pred := $pred$om.status = 'active'$pred$;
  else
    v_active_pred := 'true';
  end if;

  execute format(
    $fn$
      create or replace function public.owner_salon_ids()
      returns setof uuid
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select s.id
        from public.salons s
        join public.organization_members om on om.organization_id = s.organization_id
        join public.profiles p on p.id = om.user_id
        where om.user_id = auth.uid()
          and %s
          and om.role = 'owner'
          and p.is_active = true
          and s.is_active = true
          and s.deleted_at is null
        order by s.id
      $body$
    $fn$,
    v_active_pred
  );
end
$m38_owner_rpc$;

-- Compatibility alias for the Template application; delegates to the same
-- canonical authority (not a second ownership model).
create or replace function public.nexora_owner_salon_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public.owner_salon_ids()
$$;

revoke all on function public.owner_salon_ids() from public, anon, authenticated;
revoke all on function public.nexora_owner_salon_ids() from public, anon, authenticated;
grant execute on function public.owner_salon_ids() to authenticated;
grant execute on function public.nexora_owner_salon_ids() to authenticated;

-- ============================================================================
-- 7. Read-only self-test
-- ============================================================================

create or replace function public.verify_m38_reconciliation()
returns table (
  check_name text,
  ok boolean,
  detail text
)
language plpgsql
stable
set search_path = ''
as $$
begin
  check_name := 'profiles';            ok := to_regclass('public.profiles') is not null;
                                       detail := 'identity table';
  return next;

  check_name := 'organizations';       ok := to_regclass('public.organizations') is not null;
                                       detail := 'tenant umbrella';
  return next;

  check_name := 'organization_members'; ok := to_regclass('public.organization_members') is not null;
                                       detail := 'role authority';
  return next;

  check_name := 'salons';              ok := to_regclass('public.salons') is not null;
                                       detail := 'tenant leaf';
  return next;

  check_name := 'salon_public_websites'; ok := to_regclass('public.salon_public_websites') is not null;
                                       detail := 'public website root';
  return next;

  check_name := 'salon_public_websites_columns';
  ok := to_regclass('public.salon_public_websites') is not null
    and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.salon_public_websites'::regclass and a.attname = 'salon_id' and not a.attisdropped)
    and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.salon_public_websites'::regclass and a.attname = 'slug' and not a.attisdropped)
    and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.salon_public_websites'::regclass and a.attname = 'config' and not a.attisdropped)
    and exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.salon_public_websites'::regclass and a.attname = 'is_published' and not a.attisdropped);
  detail := 'slug/publication authority columns';
  return next;

  check_name := 'salon_media';         ok := to_regclass('public.salon_media') is not null;
                                       detail := 'canonical media table';
  return next;

  check_name := 'salon-media bucket';  ok := exists (
                                           select 1 from storage.buckets b
                                           where b.id = 'salon-media'
                                             and b.public = false
                                         );
                                       detail := 'private storage bucket';
  return next;

  check_name := 'owner_salon_ids';     ok := to_regprocedure('public.owner_salon_ids()') is not null;
                                       detail := 'canonical ownership RPC';
  return next;

  check_name := 'nexora_owner_salon_ids'; ok := to_regprocedure('public.nexora_owner_salon_ids()') is not null;
                                       detail := 'delegating alias';
  return next;

  check_name := 'nexora_alias_delegates';
  ok := exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'nexora_owner_salon_ids'
      and pg_catalog.pg_get_functiondef(p.oid) ilike '%owner_salon_ids%'
  );
  detail := 'alias is not a second ownership model';
  return next;

  check_name := 'membership_guard_restored';
  ok := to_regclass('public.organization_members') is null
     or not exists (
       select 1
       from pg_catalog.pg_trigger t
       join pg_catalog.pg_proc p on p.oid = t.tgfoid
       where t.tgrelid = 'public.organization_members'::regclass
         and not t.tgisinternal
         and p.proname = 'protect_organization_membership_fields'
         and t.tgenabled = 'D'
     );
  detail := 'live guard disabled only during trusted backfill';
  return next;

  check_name := 'rls_base_tables';
  ok := (
    select bool_and(c.relrowsecurity)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'profiles', 'organizations', 'organization_members',
        'salons', 'salon_public_websites'
      )
  ) is true;
  detail := 'deny-by-default until M28/M36/M37 policies';
  return next;

  check_name := 'spw_anon_select';
  ok := to_regclass('public.salon_public_websites') is not null
    and pg_catalog.has_table_privilege('anon', 'public.salon_public_websites', 'SELECT');
  detail := 'public website lookup grant';
  return next;
end;
$$;

revoke all on function public.verify_m38_reconciliation() from public, anon, authenticated;
grant execute on function public.verify_m38_reconciliation() to authenticated, service_role;

commit;
