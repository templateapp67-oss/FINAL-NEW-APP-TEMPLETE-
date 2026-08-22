-- M39 part 5/5 — verify helper
-- Success: 4 rows, all ok = true

create or replace function public.verify_m39_owner_publish()
returns table (check_name text, ok boolean, detail text)
language plpgsql
stable
set search_path = ''
as $fn_verify$
begin
  check_name := 'publish_rpc';
  ok := to_regprocedure('public.publish_owner_salon_website(text, text, jsonb, uuid)') is not null;
  detail := 'owner publish RPC';
  return next;

  check_name := 'unpublish_rpc';
  ok := to_regprocedure('public.unpublish_owner_salon_website(uuid)') is not null;
  detail := 'owner unpublish RPC';
  return next;

  check_name := 'authenticated_can_execute';
  ok := pg_catalog.has_function_privilege(
    'authenticated',
    'public.publish_owner_salon_website(text, text, jsonb, uuid)',
    'EXECUTE'
  );
  detail := 'owners call this from the app; salon_id is not client authority';
  return next;

  check_name := 'anon_cannot_execute';
  ok := not pg_catalog.has_function_privilege(
    'anon',
    'public.publish_owner_salon_website(text, text, jsonb, uuid)',
    'EXECUTE'
  );
  detail := 'public visitors cannot publish';
  return next;
end
$fn_verify$;

revoke all on function public.verify_m39_owner_publish()
  from public, anon, authenticated;
grant execute on function public.verify_m39_owner_publish()
  to authenticated, service_role;

select check_name, ok, detail
from public.verify_m39_owner_publish()
order by check_name;
