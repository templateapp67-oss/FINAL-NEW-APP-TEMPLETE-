-- M19 (DRAFT) / Phase 7.4 Session 1: one theme-scoped read boundary for
-- the onboarding category/predefined/suggested-service UI.
--
-- The RPC requires a stable themes.theme_id argument and applies that filter in
-- SQL before any category or service JSON is built. Browser code never needs to
-- fetch the global catalog and hide cross-theme rows client-side.
-- NOT applied to any database. Live read-only introspection is still required.

begin;

create or replace function public.get_theme_service_catalog(p_theme_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'theme', jsonb_build_object(
      'id', t.id,
      'theme_id', t.theme_id,
      'name', t.name,
      'description', t.description,
      'target_audience', t.target_audience,
      'ui_config', t.ui_config,
      'sort_order', t.sort_order
    ),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'theme_id', c.theme_id,
          'name', c.name,
          'sort_order', c.sort_order
        ) order by c.sort_order, c.name
      )
      from public.service_categories c
      where c.theme_id = t.id
    ), '[]'::jsonb),
    'predefined_services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ps.id,
          'theme_id', ps.theme_id,
          'category_id', ps.category_id,
          'name', ps.name,
          'description', ps.description,
          'sort_order', ps.sort_order,
          'is_suggested', ps.is_suggested,
          'suggested_label', ps.suggested_label,
          'suggested_sort_order', ps.suggested_sort_order,
          'default_price_paise', ps.default_price_paise,
          'default_duration_minutes', ps.default_duration_minutes
        ) order by ps.sort_order, ps.name
      )
      from public.predefined_services ps
      join public.service_categories c
        on c.id = ps.category_id
       and c.theme_id = t.id
      where ps.theme_id = t.id
        and ps.is_active
    ), '[]'::jsonb),
    'suggested_services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ps.id,
          'theme_id', ps.theme_id,
          'category_id', ps.category_id,
          'name', ps.name,
          'description', ps.description,
          'sort_order', ps.sort_order,
          'is_suggested', ps.is_suggested,
          'suggested_label', ps.suggested_label,
          'suggested_sort_order', ps.suggested_sort_order,
          'default_price_paise', ps.default_price_paise,
          'default_duration_minutes', ps.default_duration_minutes
        ) order by ps.suggested_sort_order, ps.sort_order, ps.name
      )
      from public.predefined_services ps
      join public.service_categories c
        on c.id = ps.category_id
       and c.theme_id = t.id
      where ps.theme_id = t.id
        and ps.is_active
        and ps.is_suggested = true
    ), '[]'::jsonb)
  )
  from public.themes t
  where t.theme_id = p_theme_id
    and t.is_active
  limit 1
$$;

comment on function public.get_theme_service_catalog(text) is
  'Returns one active theme and only its categories, predefined services, and is_suggested services. The SQL theme_id filter is mandatory.';

revoke all on function public.get_theme_service_catalog(text) from public;
grant execute on function public.get_theme_service_catalog(text)
  to anon, authenticated, service_role;

commit;
