-- M39 part 4/5 — unpublish + public read
-- Success: part4_ok = true

create or replace function public.unpublish_owner_salon_website(
  p_salon_id uuid default null
)
returns table (
  salon_id uuid,
  slug text,
  is_published boolean
)
language plpgsql
security definer
set search_path = ''
as $fn_unpub$
declare
  v_salon uuid;
begin
  v_salon := private.owned_publish_salon_id(p_salon_id);

  update public.salon_public_websites w
     set is_published = false
   where w.salon_id = v_salon;

  if not found then
    raise exception 'No website exists for your salon yet'
      using errcode = 'P0002';
  end if;

  return query
    select w.salon_id, w.slug, w.is_published
    from public.salon_public_websites w
    where w.salon_id = v_salon;
end
$fn_unpub$;

revoke all on function public.unpublish_owner_salon_website(uuid)
  from public, anon, authenticated;
grant execute on function public.unpublish_owner_salon_website(uuid)
  to authenticated;

create or replace function private.is_active_public_salon(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn_active$
  select exists (
    select 1 from public.salons s
    where s.id = p_salon_id
      and s.is_active = true
      and s.deleted_at is null
  )
$fn_active$;

revoke all on function private.is_active_public_salon(uuid) from public;
grant execute on function private.is_active_public_salon(uuid)
  to anon, authenticated, service_role;

do $do_spw_public_read$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'salon_public_websites'
      and policyname = 'phase1a_public_websites_published_read'
  ) then
    create policy phase1a_public_websites_published_read
    on public.salon_public_websites
    for select to anon, authenticated
    using (
      is_published = true
      and private.is_active_public_salon(salon_id)
    );
  end if;
end
$do_spw_public_read$;

grant select on table public.salon_public_websites to anon, authenticated;

select to_regprocedure('public.unpublish_owner_salon_website(uuid)') is not null as part4_ok;
