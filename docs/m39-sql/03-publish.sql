-- M39 part 3/5 — owner publish RPC
-- Success: part3_ok = true

create or replace function public.publish_owner_salon_website(
  p_slug text,
  p_template_key text default null,
  p_config jsonb default null,
  p_salon_id uuid default null
)
returns table (
  salon_id uuid,
  slug text,
  is_published boolean,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $fn_pub$
declare
  v_salon uuid;
  v_slug text;
  v_template text;
  v_config jsonb;
begin
  v_salon := private.owned_publish_salon_id(p_salon_id);
  v_slug := private.normalize_website_slug(p_slug);
  v_template := coalesce(nullif(btrim(coalesce(p_template_key, '')), ''), 'hair');
  v_config := case
    when p_config is null or jsonb_typeof(p_config) <> 'object' then '{}'::jsonb
    else p_config
  end;

  if exists (
    select 1
    from public.salon_public_websites w
    where lower(btrim(w.slug)) = v_slug
      and w.salon_id is distinct from v_salon
  ) then
    raise exception 'That website address is already in use'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from public.salon_public_websites w where w.salon_id = v_salon
  ) then
    update public.salon_public_websites w
       set slug = v_slug,
           template_key = v_template,
           config = v_config,
           is_published = true,
           published_at = coalesce(w.published_at, now())
     where w.salon_id = v_salon;
  else
    insert into public.salon_public_websites (
      salon_id, slug, template_key, config, is_published, published_at
    ) values (
      v_salon, v_slug, v_template, v_config, true, now()
    );
  end if;

  return query
    select w.salon_id, w.slug, w.is_published, w.published_at
    from public.salon_public_websites w
    where w.salon_id = v_salon;
end
$fn_pub$;

revoke all on function public.publish_owner_salon_website(text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.publish_owner_salon_website(text, text, jsonb, uuid)
  to authenticated;

select to_regprocedure('public.publish_owner_salon_website(text, text, jsonb, uuid)') is not null as part3_ok;
