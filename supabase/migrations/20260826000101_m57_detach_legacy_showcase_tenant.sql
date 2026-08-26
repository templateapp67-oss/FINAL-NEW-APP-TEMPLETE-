-- ============================================================================
-- M57 — detach the legacy Royal Hair showcase from an owner's tenant
-- ============================================================================
--
-- ROOT CAUSE
-- ----------
-- The historical helper `20260821203500_setup_public_salon_v2.sql` seeded the
-- public `/royal-hair-studio` showcase into whichever organization happened to
-- be oldest at execution time. If that organization belongs to a real owner,
-- the owner then resolves both their own salon and the showcase. Every
-- fail-closed single-workspace RPC correctly raises P0003 (multiple salons).
--
-- FIX
-- ---
-- Move only the unmistakable legacy showcase row (fixed UUID / fixed slug) to
-- an unowned, dedicated organization when its current organization has any
-- membership or another live salon. All salon-keyed website, service, booking,
-- media and location rows keep the same salon UUID. Nothing is deleted,
-- unpublished, renamed, or reassigned for a user-created salon.

begin;

do $m57_preflight$
begin
  if to_regclass('public.organizations') is null
     or to_regclass('public.organization_members') is null
     or to_regclass('public.salons') is null
     or to_regclass('public.salon_public_websites') is null
     or to_regprocedure('private.nexora_create_owner_organization(text,text)') is null
     or to_regprocedure('public.owner_salon_ids()') is null then
    raise exception
      'M57 preflight: canonical workspace roots/helpers are missing. Apply M54 before M57.';
  end if;
end
$m57_preflight$;

-- A fixed UUID and fixed slug should identify the same historical row. Refuse
-- to guess if live data somehow contains two different matches.
do $m57_repair$
declare
  v_showcase_id constant uuid := 'efdcb051-db98-40dc-b220-bfb873298de8'::uuid;
  v_salon_id uuid;
  v_current_org_id uuid;
  v_dedicated_org_id uuid;
  v_match_count integer;
  v_has_membership boolean;
  v_has_other_live_salon boolean;
begin
  perform pg_advisory_xact_lock(hashtext('nexora-m57-legacy-showcase-tenant'));

  select count(*)::integer
    into v_match_count
  from public.salons s
  where s.id = v_showcase_id
     or lower(btrim(coalesce(s.slug, ''))) = 'royal-hair-studio';

  if v_match_count > 1 then
    raise exception
      'M57 refused: the legacy showcase UUID and slug identify different salons';
  end if;

  select s.id, s.organization_id
    into v_salon_id, v_current_org_id
  from public.salons s
  where s.id = v_showcase_id
     or lower(btrim(coalesce(s.slug, ''))) = 'royal-hair-studio'
  limit 1;

  -- Some environments never ran the historical showcase helper. M57 is a
  -- clean no-op there.
  if not found then
    return;
  end if;

  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = v_current_org_id
  ) into v_has_membership;

  select exists (
    select 1
    from public.salons other
    where other.organization_id = v_current_org_id
      and other.id <> v_salon_id
      and coalesce(other.is_active, true) = true
      and other.deleted_at is null
  ) into v_has_other_live_salon;

  -- An organization containing only this showcase and no membership is already
  -- dedicated. This also makes re-application idempotent.
  if v_current_org_id is not null
     and not v_has_membership
     and not v_has_other_live_salon then
    return;
  end if;

  v_dedicated_org_id := private.nexora_create_owner_organization(
    'Royal Hair & Beauty Studio Showcase',
    'active'
  );

  update public.salons s
     set organization_id = v_dedicated_org_id
   where s.id = v_salon_id;
end
$m57_repair$;

-- Read-only deployment verifier. It deliberately treats an absent showcase as
-- valid because the canonical product does not require seed/demo business data.
create or replace function public.verify_m57_showcase_tenant_detachment()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_showcase_id constant uuid := 'efdcb051-db98-40dc-b220-bfb873298de8'::uuid;
  v_salon_id uuid;
  v_org_id uuid;
  v_matches integer;
begin
  select count(*)::integer
    into v_matches
  from public.salons s
  where s.id = v_showcase_id
     or lower(btrim(coalesce(s.slug, ''))) = 'royal-hair-studio';

  check_name := 'legacy showcase identity is unambiguous';
  ok := v_matches <= 1;
  detail := case
    when v_matches = 0 then 'showcase is absent (valid)'
    when v_matches = 1 then 'one fixed showcase row exists'
    else 'fixed UUID and slug identify different rows'
  end;
  return next;

  select s.id, s.organization_id
    into v_salon_id, v_org_id
  from public.salons s
  where s.id = v_showcase_id
     or lower(btrim(coalesce(s.slug, ''))) = 'royal-hair-studio'
  limit 1;

  check_name := 'showcase is not linked to a user membership';
  ok := v_salon_id is null or not exists (
    select 1
    from public.organization_members om
    where om.organization_id = v_org_id
  );
  detail := 'no authenticated account inherits the global showcase through organization membership';
  return next;

  check_name := 'showcase organization contains no other live salon';
  ok := v_salon_id is null or not exists (
    select 1
    from public.salons other
    where other.organization_id = v_org_id
      and other.id <> v_salon_id
      and coalesce(other.is_active, true) = true
      and other.deleted_at is null
  );
  detail := 'the public showcase has an isolated tenant root';
  return next;

  check_name := 'showcase website binding is preserved when present';
  ok := v_salon_id is null or not exists (
    select 1
    from public.salon_public_websites w
    where lower(btrim(coalesce(w.slug, ''))) = 'royal-hair-studio'
      and w.salon_id <> v_salon_id
  );
  detail := 'the fixed public slug still resolves to the same salon UUID';
  return next;
end;
$$;

revoke all on function public.verify_m57_showcase_tenant_detachment()
  from public, anon, authenticated;
grant execute on function public.verify_m57_showcase_tenant_detachment()
  to service_role;

commit;
