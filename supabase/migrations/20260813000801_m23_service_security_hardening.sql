-- M23 (DRAFT) / Phase 8.2: validation, security and error hardening for the
-- five-theme saved-service system.
--
-- Phase 8.1 made every RPC tenant-derived and provenance-safe. This migration
-- closes the gaps that remain when a client bypasses the RPCs and talks to the
-- table directly through PostgREST with a valid session:
--
--   GAP 1 (privilege escalation across themes) — the M17 foreign keys only
--   require the (predefined_service_id, theme_id, category_id) tuple to be
--   self-consistent. A tenant could therefore UPDATE their own saved row onto a
--   *different* theme's consistent tuple, silently rewriting provenance and
--   creating a cross-theme relationship. Provenance is now immutable after
--   insert.
--
--   GAP 2 (inactive catalog rows) — the FKs do not check is_active, so a direct
--   INSERT could link a saved service to a deactivated predefined service or a
--   deactivated theme. Both RPCs already validated this; the table did not.
--
-- Nothing here weakens an existing policy or grant: this migration only adds
-- restrictions. Existing rows are never modified, and legacy/manual rows with
-- NULL provenance stay valid.
-- NOT applied to any database. Live read-only introspection is still required.

begin;

-- ---------------------------------------------------------------------------
-- Validation + immutability trigger for saved-service provenance.
--
-- INSERT : the (theme, category, predefined) chain must exist, match exactly,
--          and reference only ACTIVE catalog rows.
-- UPDATE : business_id, theme_id, category_id and predefined_service_id are
--          immutable. Price, duration, description, name, status, ordering and
--          feature flags stay freely editable.
--
-- The Phase 8.1 RPCs never change provenance, so they pass unchanged. Only
-- direct table writes are constrained.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_saved_service_provenance()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Ownership and provenance are set once, at insert time.
    if new.business_id is distinct from old.business_id then
      raise exception using
        errcode = '42501',
        message = 'Saved service ownership is immutable: business_id cannot be changed.';
    end if;
    if new.theme_id is distinct from old.theme_id
       or new.category_id is distinct from old.category_id
       or new.predefined_service_id is distinct from old.predefined_service_id then
      raise exception using
        errcode = '42501',
        message = 'Saved service provenance is immutable: theme_id, category_id and predefined_service_id cannot be changed after the service is created. This violates the theme/category/predefined relationship.';
    end if;
    -- Provenance is unchanged, so the INSERT-time validation below would be
    -- redundant work on every price/status edit.
    return new;
  end if;

  -- INSERT ------------------------------------------------------------------
  -- Custom/manual rows may leave provenance entirely NULL (Custom / "Other").
  if new.theme_id is null
     and new.category_id is null
     and new.predefined_service_id is null then
    return new;
  end if;

  if new.theme_id is null then
    raise exception using
      errcode = '23503',
      message = 'A saved service with a category or predefined service must reference a theme.';
  end if;

  if not exists (
    select 1 from public.themes t
    where t.id = new.theme_id and t.is_active
  ) then
    raise exception using
      errcode = '23503',
      message = 'The referenced theme does not exist or is not active.';
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.service_categories c
    where c.id = new.category_id
      and c.theme_id = new.theme_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'The referenced category does not belong to this theme.';
  end if;

  if new.predefined_service_id is not null then
    if new.category_id is null then
      raise exception using
        errcode = '23503',
        message = 'A predefined-linked saved service must reference its category.';
    end if;
    if not exists (
      select 1 from public.predefined_services ps
      where ps.id = new.predefined_service_id
        and ps.theme_id = new.theme_id
        and ps.category_id = new.category_id
        and ps.is_active
    ) then
      raise exception using
        errcode = '23503',
        message = 'The referenced predefined service does not exist, is inactive, or belongs to another theme or category.';
    end if;
  end if;

  return new;
end
$$;

comment on function public.enforce_saved_service_provenance() is
  'Validates the theme/category/predefined chain on insert and makes tenant + provenance columns immutable on update, including for direct PostgREST table writes.';

revoke all on function public.enforce_saved_service_provenance() from public;

drop trigger if exists enforce_services_provenance on public.services;
create trigger enforce_services_provenance
before insert or update on public.services
for each row execute function public.enforce_saved_service_provenance();

-- ---------------------------------------------------------------------------
-- Defence in depth for the read boundary.
--
-- get_saved_services_for_theme is SECURITY DEFINER and derives its tenant from
-- auth.uid(). Re-assert that only authenticated/service_role may execute it, so
-- an accidental future `grant ... to public/anon` cannot silently expose one
-- salon's saved services to anonymous website visitors.
-- ---------------------------------------------------------------------------
revoke all on function public.get_saved_services_for_theme(text) from public;
revoke execute on function public.get_saved_services_for_theme(text) from anon;
grant execute on function public.get_saved_services_for_theme(text) to authenticated, service_role;

revoke all on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text) from public;
revoke execute on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text) from anon;
grant execute on function public.create_saved_service(text, uuid, text, text, bigint, integer, uuid, text) to authenticated, service_role;

revoke all on function public.update_saved_service(uuid, text, text, bigint, integer, text) from public;
revoke execute on function public.update_saved_service(uuid, text, text, bigint, integer, text) from anon;
grant execute on function public.update_saved_service(uuid, text, text, bigint, integer, text) to authenticated, service_role;

revoke all on function public.set_saved_service_status(uuid, text) from public;
revoke execute on function public.set_saved_service_status(uuid, text) from anon;
grant execute on function public.set_saved_service_status(uuid, text) to authenticated, service_role;

revoke all on function public.set_saved_service_active(uuid, boolean) from public;
revoke execute on function public.set_saved_service_active(uuid, boolean) from anon;
grant execute on function public.set_saved_service_active(uuid, boolean) to authenticated, service_role;

revoke all on function public.delete_saved_service(uuid) from public;
revoke execute on function public.delete_saved_service(uuid) from anon;
grant execute on function public.delete_saved_service(uuid) to authenticated, service_role;

revoke all on function public.save_predefined_services(text, uuid[]) from public;
revoke execute on function public.save_predefined_services(text, uuid[]) from anon;
grant execute on function public.save_predefined_services(text, uuid[]) to authenticated, service_role;

-- The global catalog read stays deliberately public (anonymous onboarding can
-- preview a theme), but it must never expose tenant rows. Re-assert it here so
-- the intent is explicit and reviewable in one place.
comment on function public.get_theme_service_catalog(text) is
  'Global, tenant-free catalog read for one active theme. Returns NULL for unknown/inactive themes. Contains no business/salon data, so anon execution is intentional.';

commit;
