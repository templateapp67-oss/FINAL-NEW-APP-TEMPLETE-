-- M02 (DRAFT): live-schema preflight / collision guard
--
-- This draft deliberately makes no schema changes. It fails closed when known
-- legacy Nexora tables are present, preventing M03 from creating a parallel
-- business model. After read-only live Supabase introspection, REGENERATE this
-- migration with explicit, data-preserving rename/ALTER/backfill statements.
-- NOT applied to any database.

begin;

do $$
declare
  legacy_tables text[] := array[
    'salons',
    'organizations',
    'organization_members',
    'job_salon_members',
    'staff',
    'appointments',
    'referrals'
  ];
  legacy_name text;
  collisions text[] := array[]::text[];
begin
  foreach legacy_name in array legacy_tables loop
    if to_regclass(format('public.%I', legacy_name)) is not null then
      collisions := array_append(collisions, legacy_name);
    end if;
  end loop;

  if cardinality(collisions) > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'M02 DRAFT blocked execution: legacy live tables detected (%s). Run read-only Supabase introspection, map them to the canonical model, and regenerate M02 before applying M01-M21.',
        array_to_string(collisions, ', ')
      );
  end if;

  raise notice 'M02 DRAFT preflight: no known legacy table names found. This notice is not a substitute for live-schema introspection.';
end
$$;

commit;
