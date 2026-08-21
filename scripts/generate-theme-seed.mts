import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  BARBER_THEME,
  BEAUTY_SPA_THEME,
  FAMILY_FULL_SERVICE_THEME,
  HAIR_STUDIO_THEME,
  NAIL_LASH_STUDIO_THEME,
  SERVICES_BY_THEME,
  SUGGESTED_SERVICE_ALIASES,
  SUGGESTED_SERVICE_NAMES,
  THEME_CATEGORIES,
  THEME_LABELS,
  type ThemeId,
} from '../src/lib/themeServices';

const themeIds = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
] as const satisfies readonly ThemeId[];

type SeedThemeId = (typeof themeIds)[number];

const themeMetadata: Record<SeedThemeId, {
  description: string;
  targetAudience: string;
  styleLabel: string;
  tokens: Record<string, string>;
}> = {
  barber_mens_grooming: {
    description: 'Classic vintage barbershop with a sharp, masculine layout — fades, hot towel shaves and premium grooming.',
    targetAudience: 'Men seeking fades, classic cuts, beard care, hot towel shaves and premium grooming.',
    styleLabel: 'Dark Charcoal • Gold Accents',
    tokens: BARBER_THEME,
  },
  hair_studio_color_bar: {
    description: 'A minimalist, gallery-style studio with rose-gold accents, a color showcase and premium editorial feel.',
    targetAudience: 'Style-conscious hair and color clients seeking precision cuts, editorial styling and restorative treatments.',
    styleLabel: 'Monochrome • Rose-Gold • Editorial',
    tokens: HAIR_STUDIO_THEME,
  },
  beauty_skin_spa: {
    description: 'A calm, serene wellness sanctuary — soft pastels, emerald and beige accents with a premium spa feel.',
    targetAudience: 'Beauty and wellness clients seeking skincare, spa, body, waxing, threading and makeup services.',
    styleLabel: 'Soft Pastel • Emerald & Beige',
    tokens: BEAUTY_SPA_THEME,
  },
  family_full_service: {
    description: 'Bright teal-and-sky energy with a friendly multi-category layout for the whole family — kids to grandparents.',
    targetAudience: 'The whole family — children, adults and grandparents seeking hair, beauty and grooming services.',
    styleLabel: 'Bright • Blue/Teal • Family',
    tokens: FAMILY_FULL_SERVICE_THEME,
  },
  nail_lash_studio: {
    description: 'A glamorous, visual-first studio for polished nails, expressive art, lashes and brows.',
    targetAudience: 'Clients seeking polished nails, expressive nail art, manicures, pedicures, lashes and brows.',
    styleLabel: 'Neon Pink • Nude Sand • Glam',
    tokens: NAIL_LASH_STUDIO_THEME,
  },
};

const sqlText = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sqlNullableText = (value: string | undefined) => value == null ? 'null' : sqlText(value);
const valueLines = (rows: string[][]) => rows
  .map((row, index) => `    (${row.join(', ')})${index === rows.length - 1 ? '' : ','}`)
  .join('\n');

const themeRows = themeIds.map((themeId, sortOrder) => {
  const metadata = themeMetadata[themeId];
  const uiConfig = JSON.stringify({ styleLabel: metadata.styleLabel, tokens: metadata.tokens });
  return [
    sqlText(themeId),
    sqlText(THEME_LABELS[themeId]),
    sqlText(metadata.description),
    sqlText(metadata.targetAudience),
    `${sqlText(uiConfig)}::jsonb`,
    String(sortOrder),
  ];
});

const categoryRows = themeIds.flatMap((themeId) =>
  THEME_CATEGORIES[themeId].map((category, sortOrder) => [
    sqlText(themeId),
    sqlText(category),
    String(sortOrder),
  ]),
);

const serviceRows = themeIds.flatMap((themeId) => {
  const suggestedNames = SUGGESTED_SERVICE_NAMES[themeId];
  const aliases = SUGGESTED_SERVICE_ALIASES[themeId] ?? {};
  const suggestionByCanonicalName = new Map(
    suggestedNames.map((suggestedLabel, suggestedSortOrder) => [
      aliases[suggestedLabel] ?? suggestedLabel,
      { suggestedLabel, suggestedSortOrder },
    ]),
  );

  return SERVICES_BY_THEME[themeId].map((service, sortOrder) => {
    const suggestion = suggestionByCanonicalName.get(service.name);
    return [
      sqlText(themeId),
      sqlText(service.category),
      sqlText(service.name),
      sqlText(service.description),
      String(sortOrder),
      suggestion ? 'true' : 'false',
      sqlNullableText(suggestion?.suggestedLabel),
      suggestion ? String(suggestion.suggestedSortOrder) : 'null',
      String(service.price * 100),
      String(service.duration),
    ];
  });
});

export const generatedThemeSeedSql = `-- M18 (DRAFT) / Phase 7.3: idempotent seed for the five curated theme catalogs.
--
-- Generated from src/lib/themeServices.ts by scripts/generate-theme-seed.mts.
-- Do not hand-edit dataset rows; update the source catalog and regenerate.
-- Seeds only global theme/category/predefined-service reference data. It never
-- inserts, updates, or deletes public.services (saved salon/user services).
-- NOT applied to any database. Live read-only introspection is still required.

begin;

-- Preserve the theme-card order and the exact suggested display-label/order
-- mapping already used by the application. Suggested labels remain attributes
-- of their canonical predefined-service row, never unrelated global strings.
alter table public.themes
  add column if not exists sort_order integer not null default 0;
alter table public.predefined_services
  add column if not exists suggested_label text,
  add column if not exists suggested_sort_order integer,
  add column if not exists default_price_paise bigint,
  add column if not exists default_duration_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.themes'::regclass
      and conname = 'themes_sort_order_nonnegative'
  ) then
    alter table public.themes
      add constraint themes_sort_order_nonnegative
      check (sort_order >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_suggested_label_not_blank'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_suggested_label_not_blank
      check (suggested_label is null or btrim(suggested_label) <> '') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_suggested_order_nonnegative'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_suggested_order_nonnegative
      check (suggested_sort_order is null or suggested_sort_order >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_suggested_metadata_pair'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_suggested_metadata_pair
      check ((suggested_label is null) = (suggested_sort_order is null)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_suggested_metadata_flag'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_suggested_metadata_flag
      check (is_suggested or (suggested_label is null and suggested_sort_order is null)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_default_price_nonnegative'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_default_price_nonnegative
      check (default_price_paise is null or default_price_paise >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.predefined_services'::regclass
      and conname = 'predefined_services_default_duration_positive'
  ) then
    alter table public.predefined_services
      add constraint predefined_services_default_duration_positive
      check (default_duration_minutes is null or default_duration_minutes > 0) not valid;
  end if;
end
$$;

alter table public.themes validate constraint themes_sort_order_nonnegative;
alter table public.predefined_services validate constraint predefined_services_suggested_label_not_blank;
alter table public.predefined_services validate constraint predefined_services_suggested_order_nonnegative;
alter table public.predefined_services validate constraint predefined_services_suggested_metadata_pair;
alter table public.predefined_services validate constraint predefined_services_suggested_metadata_flag;
alter table public.predefined_services validate constraint predefined_services_default_price_nonnegative;
alter table public.predefined_services validate constraint predefined_services_default_duration_positive;

create index if not exists idx_themes_active_sort_order
  on public.themes (is_active, sort_order, theme_id);
create index if not exists idx_predefined_services_suggested_order
  on public.predefined_services (theme_id, suggested_sort_order, id)
  where is_active and is_suggested;

with seed(theme_key, name, description, target_audience, ui_config, sort_order) as (
  values
${valueLines(themeRows)}
)
insert into public.themes (
  theme_id, name, description, target_audience, ui_config, sort_order, is_active
)
select theme_key, name, description, target_audience, ui_config, sort_order, true
from seed
on conflict (theme_id) do update
set name = excluded.name,
    description = excluded.description,
    target_audience = excluded.target_audience,
    ui_config = excluded.ui_config,
    sort_order = excluded.sort_order,
    is_active = true;

with seed(theme_key, category_name, sort_order) as (
  values
${valueLines(categoryRows)}
)
insert into public.service_categories (theme_id, name, sort_order)
select t.id, seed.category_name, seed.sort_order
from seed
join public.themes t on t.theme_id = seed.theme_key
on conflict (theme_id, name) do update
set sort_order = excluded.sort_order;

with seed(
  theme_key, category_name, service_name, description, sort_order,
  is_suggested, suggested_label, suggested_sort_order,
  default_price_paise, default_duration_minutes
) as (
  values
${valueLines(serviceRows)}
)
insert into public.predefined_services (
  theme_id, category_id, name, description, sort_order, is_suggested,
  suggested_label, suggested_sort_order, default_price_paise,
  default_duration_minutes, is_active
)
select
  t.id, c.id, seed.service_name, seed.description, seed.sort_order,
  seed.is_suggested, seed.suggested_label, seed.suggested_sort_order,
  seed.default_price_paise, seed.default_duration_minutes, true
from seed
join public.themes t on t.theme_id = seed.theme_key
join public.service_categories c
  on c.theme_id = t.id and c.name = seed.category_name
on conflict (theme_id, name) do update
set category_id = excluded.category_id,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_suggested = excluded.is_suggested,
    suggested_label = excluded.suggested_label,
    suggested_sort_order = excluded.suggested_sort_order,
    default_price_paise = excluded.default_price_paise,
    default_duration_minutes = excluded.default_duration_minutes,
    is_active = true;

comment on column public.themes.sort_order is
  'Stable display order for the curated theme selector.';
comment on column public.predefined_services.suggested_label is
  'Customer-facing suggested chip label mapped to this canonical predefined service.';
comment on column public.predefined_services.suggested_sort_order is
  'Display order within the theme suggested-service list; NULL when not suggested.';
comment on column public.predefined_services.default_price_paise is
  'Curated default price in integer paise for onboarding auto-fill; saved services remain owner-editable.';
comment on column public.predefined_services.default_duration_minutes is
  'Curated default duration for onboarding auto-fill; saved services remain owner-editable.';

commit;
`;

const migrationPath = fileURLToPath(new URL(
  '../supabase/migrations/20260813000301_m18_seed_five_theme_catalog.sql',
  import.meta.url,
));

if (process.argv.includes('--write')) {
  await writeFile(migrationPath, generatedThemeSeedSql, 'utf8');
  console.log(`Wrote ${migrationPath}`);
} else if (process.argv.includes('--check')) {
  const existing = await readFile(migrationPath, 'utf8');
  if (existing !== generatedThemeSeedSql) {
    throw new Error('M18 theme seed is stale. Run: npm run generate:theme-seed');
  }
  console.log('Theme seed source check: M18 matches src/lib/themeServices.ts');
} else {
  process.stdout.write(generatedThemeSeedSql);
}
