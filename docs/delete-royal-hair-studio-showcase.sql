-- ============================================================================
-- PERMANENT DELETE — royal-hair-studio legacy showcase (project qwaehqsmodekbgvnaavz)
-- ============================================================================
-- Ye file legacy demo salon "royal-hair-studio" ko database se PERMANENTLY
-- delete karti hai — salon row + uske saare dependent rows (services,
-- bookings, website config, media, etc.) + agar showcase ki organization
-- empty bachti hai to wo bhi.
--
-- SAFE BY DESIGN:
--   * Ek hi transaction — koi bhi failure sab kuch roll back kar dega.
--   * Sirf wohi salon delete hota hai jo fixed showcase UUID ya exact slug
--     'royal-hair-studio' se match karta hai. Kisi aur salon ko touch nahi.
--   * Organization tabhi delete hoti hai jab usme na koi member bacha ho
--     na koi doosra salon (aapki apni org kabhi delete nahi hogi).
--   * M54 applied hona chahiye pehle (aapka already applied + verified hai).
--
-- KAISE CHALAYEIN: Supabase Dashboard → SQL Editor → nayi tab → poori file
-- paste karein → Run. Neeche final SELECT mein dono counts 0 hone chahiye.
-- ============================================================================

-- STEP 0 (optional, read-only): dekho kya delete hone wala hai
-- select s.id, s.slug, s.name, s.organization_id,
--        w.slug as website_slug, w.is_published
-- from public.salons s
-- left join public.salon_public_websites w on w.salon_id = s.id
-- where s.id = 'efdcb051-db98-40dc-b220-bfb873298de8'::uuid
--    or lower(btrim(coalesce(s.slug, ''))) = 'royal-hair-studio';

begin;

do $delete_showcase$
declare
  v_showcase_id constant uuid := 'efdcb051-db98-40dc-b220-bfb873298de8'::uuid;
  v_slug constant text := 'royal-hair-studio';
  v_salon_id uuid;
  v_org_id uuid;
  v_rows int;
  v_pass_deleted int;
  v_pass int;
  r record;
begin
  select s.id, s.organization_id
    into v_salon_id, v_org_id
  from public.salons s
  where s.id = v_showcase_id
     or lower(btrim(coalesce(s.slug, ''))) = v_slug
  order by (s.id = v_showcase_id) desc
  limit 1;

  if v_salon_id is null then
    if exists (
      select 1 from public.salon_public_websites
      where lower(btrim(coalesce(slug, ''))) = v_slug
    ) then
      raise exception
        'salon_public_websites still has a % row without a salons row — investigate manually before deleting.', v_slug;
    end if;
    raise notice 'royal-hair-studio showcase not found — nothing to delete.';
    return;
  end if;

  raise notice 'Deleting showcase salon % (org %)', v_salon_id, v_org_id;

  -- Delete EVERY row in every public table that references this salon.
  -- Discovered dynamically from information_schema, so future tables with a
  -- salon_id column are covered automatically. Multiple passes resolve any
  -- inter-table ordering; 5 passes is far beyond the real dependency depth.
  for v_pass in 1..5 loop
    v_pass_deleted := 0;
    for r in
      select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
      where c.table_schema = 'public'
        and c.column_name = 'salon_id'
        and t.table_type = 'BASE TABLE'
        and t.table_name <> 'salons'
      order by c.table_name
    loop
      execute format('delete from public.%I where salon_id = $1', r.table_name)
        using v_salon_id;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        v_pass_deleted := v_pass_deleted + v_rows;
        raise notice '  deleted % row(s) from %', v_rows, r.table_name;
      end if;
    end loop;
    exit when v_pass_deleted = 0;
  end loop;

  delete from public.salons where id = v_salon_id;
  raise notice '  deleted the salons row itself';

  -- Clean up the showcase organization ONLY if it is now completely empty.
  -- A real owner's organization (members or other salons present) is kept.
  if v_org_id is not null
     and not exists (select 1 from public.salons where organization_id = v_org_id)
     and not exists (select 1 from public.organization_members where organization_id = v_org_id)
  then
    delete from public.organizations where id = v_org_id;
    raise notice '  deleted empty showcase organization %', v_org_id;
  elsif v_org_id is not null then
    raise notice '  kept organization % (still has members or other salons)', v_org_id;
  end if;
end;
$delete_showcase$;

-- ============================================================================
-- VERIFY (same transaction): both counts MUST be 0 before commit.
-- ============================================================================
do $verify_delete$
declare
  v_left int;
begin
  select count(*) into v_left
  from public.salons s
  where s.id = 'efdcb051-db98-40dc-b220-bfb873298de8'::uuid
     or lower(btrim(coalesce(s.slug, ''))) = 'royal-hair-studio';

  if v_left > 0 then
    raise exception 'verification failed: % royal-hair-studio salon row(s) still exist — rolling back', v_left;
  end if;

  select count(*) into v_left
  from public.salon_public_websites
  where lower(btrim(coalesce(slug, ''))) = 'royal-hair-studio';

  if v_left > 0 then
    raise exception 'verification failed: % showcase website row(s) still exist — rolling back', v_left;
  end if;

  raise notice 'VERIFIED: royal-hair-studio is fully deleted.';
end;
$verify_delete$;

commit;

-- Final read-only proof (run after commit):
select
  (select count(*) from public.salons
    where id = 'efdcb051-db98-40dc-b220-bfb873298de8'::uuid
       or lower(btrim(coalesce(slug, ''))) = 'royal-hair-studio') as showcase_salons_left,
  (select count(*) from public.salon_public_websites
    where lower(btrim(coalesce(slug, ''))) = 'royal-hair-studio') as showcase_websites_left;
-- Expected: showcase_salons_left = 0, showcase_websites_left = 0
