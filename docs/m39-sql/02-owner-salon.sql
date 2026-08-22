-- M39 part 2/5 — resolve the logged-in owner's salon
-- Success: part2_ok = true

create or replace function private.owned_publish_salon_id(p_salon_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $fn_own$
declare
  v_ids uuid[];
  v_salon uuid;
begin
  if auth.uid() is null then
    raise exception 'Please log in to publish your website'
      using errcode = '28000';
  end if;

  select coalesce(array_agg(s.id), array[]::uuid[])
    into v_ids
  from public.owner_salon_ids() as s(id);

  if p_salon_id is not null then
    if not (p_salon_id = any (v_ids)) then
      raise exception 'You can only publish a website for a salon you own'
        using errcode = '42501';
    end if;
    v_salon := p_salon_id;
  else
    if cardinality(v_ids) = 0 then
      raise exception 'No salon is linked to your account yet'
        using errcode = 'P0002';
    end if;
    if cardinality(v_ids) > 1 then
      raise exception 'Multiple salons are linked to your account. Select one shop first.'
        using errcode = 'P0003';
    end if;
    v_salon := v_ids[1];
  end if;

  if not exists (
    select 1 from public.salons s
    where s.id = v_salon
      and s.is_active = true
      and s.deleted_at is null
  ) then
    raise exception 'Your salon is not active'
      using errcode = 'P0002';
  end if;

  return v_salon;
end
$fn_own$;

revoke all on function private.owned_publish_salon_id(uuid)
  from public, anon, authenticated;

select to_regprocedure('private.owned_publish_salon_id(uuid)') is not null as part2_ok;
