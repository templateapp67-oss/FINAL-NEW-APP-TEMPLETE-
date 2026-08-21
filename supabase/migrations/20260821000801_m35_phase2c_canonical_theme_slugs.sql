-- M35 / Phase 2C: canonical theme slugs (full_service_family_salon)
--
-- Phase 2C requires the five canonical themes to be database-authoritative
-- with these exact public slugs:
--
--   barber_mens_grooming      Barber & Men's Grooming
--   hair_studio_color_bar     Hair Studio & Color Bar
--   beauty_skin_spa           Beauty, Skin & Spa
--   full_service_family_salon Full-Service Family Salon
--   nail_lash_studio          Nail & Lash Studio
--
-- M28/M32 seeded five themes with slug = theme_id, so the Full-Service
-- Family Salon row carried the internal key 'family_full_service' as its
-- slug. Phase 2B (M34) kept that value; Phase 2C now requires the public
-- slug 'full_service_family_salon'. This migration reconciles the slug
-- deterministically:
--
--   * theme_id stays 'family_full_service' — it is the stable internal
--     identifier used by both repositories' type layers and seeds; nothing
--     in either application references themes.slug, so no application
--     reference changes are required.
--   * the slug is reconciled only from the known legacy states (NULL or
--     slug = theme_id) — never overwriting an unrelated explicit value.
--   * themes.slug UNIQUE is re-asserted; the reconciliation UPDATE fails
--     closed if any other row already holds a conflicting slug.
--   * a final verification block raises unless all five canonical slugs
--     are present exactly once.
--
-- Additive, idempotent, no table drops, no row deletions, no hardcoded ids
-- beyond the canonical theme keys themselves (system configuration data,
-- which Phase 2C explicitly allows).

begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight: the canonical themes table must exist.
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('public.themes') is null then
    raise exception 'Phase 2C preflight: canonical table public.themes is missing.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Reconcile the five canonical slugs from known legacy states.
--    slug = theme_id (M28/M32 seed form) or NULL -> canonical slug.
--    Any other existing value is left untouched (no guessing).
-- ---------------------------------------------------------------------------
do $reconcile_slugs$
declare
  canonical record;
begin
  for canonical in select * from (values
    ('barber_mens_grooming',      'barber_mens_grooming'),
    ('hair_studio_color_bar',     'hair_studio_color_bar'),
    ('beauty_skin_spa',           'beauty_skin_spa'),
    ('family_full_service',       'full_service_family_salon'),
    ('nail_lash_studio',          'nail_lash_studio')
  ) as t(theme_id, slug)
  loop
    update public.themes
    set slug = canonical.slug,
        updated_at = now()
    where theme_id = canonical.theme_id
      and (slug is null or slug = theme_id);
  end loop;
end
$reconcile_slugs$;

-- ---------------------------------------------------------------------------
-- 2. Enforce themes.slug UNIQUE (M32/M34 already create it; re-asserted for
--    environments where it is missing).
-- ---------------------------------------------------------------------------
do $slug_unique_assert$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.themes'::regclass
      and conname = 'themes_slug_unique'
  ) then
    alter table public.themes add constraint themes_slug_unique unique (slug);
  end if;
end
$slug_unique_assert$;

-- ---------------------------------------------------------------------------
-- 3. Verification: the five canonical slugs must each exist exactly once.
--    Raises (rolling back the whole migration) on any mismatch — the
--    database is the source of truth for the theme set.
-- ---------------------------------------------------------------------------
do $verify_canonical_slugs$
declare
  missing text;
  duplicates text;
begin
  select string_agg(t.slug, ', ' order by t.slug)
  into missing
  from (values
    ('barber_mens_grooming'),
    ('hair_studio_color_bar'),
    ('beauty_skin_spa'),
    ('full_service_family_salon'),
    ('nail_lash_studio')
  ) as t(slug)
  where not exists (
    select 1 from public.themes th where th.slug = t.slug
  );

  if missing is not null then
    raise exception 'Phase 2C: canonical theme slugs missing: %', missing;
  end if;

  select string_agg(slug, ', ' order by slug)
  into duplicates
  from (
    select slug, count(*) as n
    from public.themes
    where slug in (
      'barber_mens_grooming', 'hair_studio_color_bar', 'beauty_skin_spa',
      'full_service_family_salon', 'nail_lash_studio'
    )
    group by slug
    having count(*) > 1
  ) d;

  if duplicates is not null then
    raise exception 'Phase 2C: duplicate canonical theme slugs: %', duplicates;
  end if;
end
$verify_canonical_slugs$;

commit;
