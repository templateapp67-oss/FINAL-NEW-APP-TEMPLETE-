-- M39 part 1/5 — slug helper only
-- नया SQL tab, No limit, पूरा paste, Run
-- Success: part1_ok = true

create or replace function private.normalize_website_slug(p_slug text)
returns text
language plpgsql
immutable
set search_path = ''
as $fn_norm$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if v_slug = '' then
    raise exception 'Choose a website address before publishing'
      using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(v_slug) < 3
     or char_length(v_slug) > 60 then
    raise exception 'Website address must be 3–60 characters: lowercase letters, numbers, and hyphens'
      using errcode = '22023';
  end if;
  if v_slug in (
    'dashboard', 'builder', 'nearby', 'auth', 'login', 'signup', 'register',
    'reset-password', 'api', 'admin', 'www', 'app', 'static', 'assets'
  ) then
    raise exception 'That website address is reserved. Choose another.'
      using errcode = '22023';
  end if;
  return v_slug;
end
$fn_norm$;

revoke all on function private.normalize_website_slug(text)
  from public, anon, authenticated;

select to_regprocedure('private.normalize_website_slug(text)') is not null as part1_ok;
