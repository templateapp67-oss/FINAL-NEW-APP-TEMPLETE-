-- M18 (DRAFT) / Phase 7.3: idempotent seed for the five curated theme catalogs.
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
    ('barber_mens_grooming', 'Barber & Men''s Grooming', 'Classic vintage barbershop with a sharp, masculine layout — fades, hot towel shaves and premium grooming.', 'Men seeking fades, classic cuts, beard care, hot towel shaves and premium grooming.', '{"styleLabel":"Dark Charcoal • Gold Accents","tokens":{"id":"barber_mens_grooming","charcoal":"#141414","charcoalSoft":"#1d1d1d","charcoalCard":"#1a1a1a","gold":"#c9a227","goldBright":"#e8c95c","goldSoft":"#3a3016","cream":"#f5efe0","muted":"#a6a49b"}}'::jsonb, 0),
    ('hair_studio_color_bar', 'Hair Studio & Color Bar', 'A minimalist, gallery-style studio with rose-gold accents, a color showcase and premium editorial feel.', 'Style-conscious hair and color clients seeking precision cuts, editorial styling and restorative treatments.', '{"styleLabel":"Monochrome • Rose-Gold • Editorial","tokens":{"id":"hair_studio_color_bar","ink":"#191817","inkSoft":"#2a2826","paper":"#faf8f5","paperDeep":"#f1ede7","rose":"#b76e79","roseBright":"#d8a0a8","roseSoft":"#f4e5e7","roseDeep":"#9d5a63","line":"#e7e0d8","muted":"#8c8782"}}'::jsonb, 1),
    ('beauty_skin_spa', 'Beauty, Skin & Spa', 'A calm, serene wellness sanctuary — soft pastels, emerald and beige accents with a premium spa feel.', 'Beauty and wellness clients seeking skincare, spa, body, waxing, threading and makeup services.', '{"styleLabel":"Soft Pastel • Emerald & Beige","tokens":{"id":"beauty_skin_spa","emerald":"#1e7a63","emeraldDeep":"#15594a","emeraldMid":"#4aa88f","emeraldSoft":"#e2f0ea","beige":"#ece4d6","beigeSoft":"#f7f1e8","cream":"#fbf9f5","blush":"#f6ece9","sage":"#eef2e9","text":"#27403a","muted":"#72837c","line":"#ece6dc"}}'::jsonb, 2),
    ('family_full_service', 'Full-Service Family Salon', 'Bright teal-and-sky energy with a friendly multi-category layout for the whole family — kids to grandparents.', 'The whole family — children, adults and grandparents seeking hair, beauty and grooming services.', '{"styleLabel":"Bright • Blue/Teal • Family","tokens":{"id":"family_full_service","navy":"#12385b","blue":"#1769d2","blueBright":"#2f8cff","sky":"#eaf6ff","skyDeep":"#cdeaff","teal":"#079f9a","tealDeep":"#087a78","tealSoft":"#d9f5f1","sun":"#ffd166","sunSoft":"#fff4cf","coral":"#ff7b67","ink":"#15324b","muted":"#5d7387","line":"#dcebf4","white":"#ffffff"}}'::jsonb, 3),
    ('nail_lash_studio', 'Nail & Lash Studio', 'A glamorous, visual-first studio for polished nails, expressive art, lashes and brows.', 'Clients seeking polished nails, expressive nail art, manicures, pedicures, lashes and brows.', '{"styleLabel":"Neon Pink • Nude Sand • Glam","tokens":{"id":"nail_lash_studio","ink":"#211b24","inkSoft":"#3a2a37","pink":"#ff2d8d","pinkDeep":"#d70f68","pinkGlow":"#ff79b7","pinkSoft":"#ffe5f1","sand":"#f7eee8","sandDeep":"#e5cfc4","nude":"#c89f91","nudeSoft":"#f1dfd7","cream":"#fffaf7","muted":"#806c74","line":"#eadbd5","white":"#ffffff"}}'::jsonb, 4)
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
    ('barber_mens_grooming', 'Haircuts', 0),
    ('barber_mens_grooming', 'Beard & Shave', 1),
    ('barber_mens_grooming', 'Grooming & Treatments', 2),
    ('hair_studio_color_bar', 'Styling & Cuts', 0),
    ('hair_studio_color_bar', 'Hair Color', 1),
    ('hair_studio_color_bar', 'Treatments', 2),
    ('beauty_skin_spa', 'Facial & Skincare', 0),
    ('beauty_skin_spa', 'Spa & Body', 1),
    ('beauty_skin_spa', 'Waxing & Threading', 2),
    ('beauty_skin_spa', 'Makeup', 3),
    ('family_full_service', 'Men''s Services', 0),
    ('family_full_service', 'Women''s Services', 1),
    ('family_full_service', 'Kids Special', 2),
    ('family_full_service', 'Combos', 3),
    ('nail_lash_studio', 'Nail Art & Gel', 0),
    ('nail_lash_studio', 'Pedicure & Manicure', 1),
    ('nail_lash_studio', 'Lash & Brow', 2)
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
    ('barber_mens_grooming', 'Haircuts', 'Skin Fade', 'Precision skin fade blended seamlessly from skin to your preferred length on top.', 0, true, 'Skin Fade', 0, 45000, 45),
    ('barber_mens_grooming', 'Haircuts', 'Scissors Cut', 'Classic scissor-over-comb cut tailored to your hair type and face shape.', 1, false, null, null, 40000, 40),
    ('barber_mens_grooming', 'Haircuts', 'Buzz Cut', 'Clean, uniform clipper cut for a low-maintenance, sharp look.', 2, false, null, null, 25000, 20),
    ('barber_mens_grooming', 'Haircuts', 'Taper Fade', 'Gradual taper fade with a crisp neckline and clean, sharp finish.', 3, false, null, null, 40000, 40),
    ('barber_mens_grooming', 'Haircuts', 'Kids Barbering', 'Patient, friendly haircut for boys with a fun, fuss-free finish.', 4, false, null, null, 25000, 25),
    ('barber_mens_grooming', 'Haircuts', 'Head Shave', 'Smooth head shave with hot-towel prep and soothing aftercare.', 5, true, 'Head Shave', 4, 30000, 25),
    ('barber_mens_grooming', 'Beard & Shave', 'Beard Sculpting & Lineup', 'Detailed beard sculpting with a sharp line-up, hot towel and beard oil finish.', 6, true, 'Beard Sculpting', 1, 35000, 30),
    ('barber_mens_grooming', 'Beard & Shave', 'Hot Towel Classic Shave', 'Traditional straight-razor shave with hot towels and a cooling balm.', 7, true, 'Hot Towel Shave', 2, 40000, 35),
    ('barber_mens_grooming', 'Beard & Shave', 'Beard Trim & Lineup', 'Precision beard trim with crisp cheek and neck line-up.', 8, false, null, null, 25000, 20),
    ('barber_mens_grooming', 'Beard & Shave', 'Moustache Styling', 'Moustache trim, shape and styling with premium wax.', 9, false, null, null, 15000, 15),
    ('barber_mens_grooming', 'Beard & Shave', 'Beard Color/Coverup', 'Natural-looking beard colour to cover greys and deepen tone.', 10, false, null, null, 45000, 30),
    ('barber_mens_grooming', 'Grooming & Treatments', 'Charcoal Face Detox', 'Deep-cleansing charcoal facial to unclog pores and refresh tired skin.', 11, true, 'Charcoal Face Mask', 5, 80000, 40),
    ('barber_mens_grooming', 'Grooming & Treatments', 'Scalp & Head Massage', 'Therapeutic scalp massage to relieve tension and boost circulation.', 12, false, null, null, 60000, 30),
    ('barber_mens_grooming', 'Grooming & Treatments', 'Executive Beard & Hair Combo', 'Signature haircut plus sculpted beard and styling finish in one sitting.', 13, true, 'Hair & Beard Combo', 3, 70000, 60),
    ('barber_mens_grooming', 'Grooming & Treatments', 'Hair Loss Scalp Therapy', 'Targeted scalp therapy to strengthen roots and reduce hair fall.', 14, false, null, null, 120000, 45),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Signature Cut & Blowdry', 'A precision signature cut shaped to your face and finished with a glossy editorial blowdry.', 0, true, 'Signature Haircut', 0, 180000, 60),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Layered Cut', 'Face-framing layers cut dry for movement, volume and a soft, lived-in finish.', 1, false, null, null, 200000, 60),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Bob/Pixie Precision Cut', 'Architectural bob or pixie with razor-sharp lines and weight distribution tailored to you.', 2, false, null, null, 220000, 65),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Luxury Blowout', 'Round-brush blowout with salon-grade finishing for bounce, shine and lasting hold.', 3, true, 'Luxury Blowout', 1, 120000, 40),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Hollywood Waves', 'Old-Hollywood sculpted waves with glossy, red-carpet finish.', 4, false, null, null, 160000, 45),
    ('hair_studio_color_bar', 'Styling & Cuts', 'Hair Setting', 'Classic roller or pin-curl setting for soft, structured volume and defined texture.', 5, false, null, null, 90000, 40),
    ('hair_studio_color_bar', 'Hair Color', 'Balayage / Ombre', 'Hand-painted, sun-kissed balayage or a soft shadow-root ombre — both low-maintenance and dimensional.', 6, true, 'Balayage', 2, 550000, 180),
    ('hair_studio_color_bar', 'Hair Color', 'Global Hair Color', 'Rich, all-over colour transformation in an even, glossy, long-lasting tone.', 7, true, 'Global Hair Color', 3, 350000, 120),
    ('hair_studio_color_bar', 'Hair Color', 'Root Touch-Up', 'Seamless root refresh and grey coverage blended into your existing shade.', 8, false, null, null, 150000, 60),
    ('hair_studio_color_bar', 'Hair Color', 'Highlights & Lowlights', 'Multi-tonal foiling that adds depth, dimension and brightness through the lengths.', 9, false, null, null, 420000, 150),
    ('hair_studio_color_bar', 'Hair Color', 'Gloss & Tone Treatment', 'Demi-permanent gloss to neutralise brass, refine tone and add glass-like shine.', 10, false, null, null, 180000, 45),
    ('hair_studio_color_bar', 'Hair Color', 'Fashion Color', 'Bold pastels, vivids and creative colour placements — a true statement look.', 11, false, null, null, 600000, 200),
    ('hair_studio_color_bar', 'Treatments', 'Keratin Restoration', 'Intensive keratin infusion that rebuilds strength, smooths frizz and restores elasticity.', 12, false, null, null, 450000, 120),
    ('hair_studio_color_bar', 'Treatments', 'Hair Botox Treatment', 'Deep-filler treatment that plumps each strand for silky, youthful, glass-finish hair.', 13, true, 'Hair Botox Treatment', 4, 400000, 90),
    ('hair_studio_color_bar', 'Treatments', 'Smoothening / Rebonding', 'Permanent straightening with thermal reconditioning for sleek, frizz-free lengths.', 14, false, null, null, 500000, 180),
    ('hair_studio_color_bar', 'Treatments', 'Scalp Detox Spa', 'Exfoliating scalp ritual with steam, massage and a balancing botanical mask.', 15, false, null, null, 220000, 60),
    ('hair_studio_color_bar', 'Treatments', 'Olaplex Bond Repair', 'Patented bond-building therapy that relinks broken bonds for stronger, healthier hair.', 16, true, 'Olaplex Bond Repair', 5, 350000, 60),
    ('beauty_skin_spa', 'Facial & Skincare', 'HydraFacial', 'Multi-step hydradermabrasion facial that deeply cleanses, hydrates and plumps for instant glow.', 0, true, 'HydraFacial', 0, 280000, 60),
    ('beauty_skin_spa', 'Facial & Skincare', 'Anti-Aging Gold Facial', 'Luxurious 24K gold facial that firms, brightens and reduces the appearance of fine lines.', 1, false, null, null, 240000, 60),
    ('beauty_skin_spa', 'Facial & Skincare', 'Deep Cleansing Cleanup', 'Thorough cleanse with steam, gentle extraction and a soothing mask for clear, fresh skin.', 2, true, 'Deep Cleansing Cleanup', 1, 120000, 45),
    ('beauty_skin_spa', 'Facial & Skincare', 'De-Tan Brightening', 'Brightening de-tan treatment to reverse sun damage and restore an even, radiant complexion.', 3, true, 'De-Tan Pack', 4, 160000, 45),
    ('beauty_skin_spa', 'Facial & Skincare', 'Organic Glow Treatment', 'Plant-based glow facial with botanical actives for a natural, healthy luminosity.', 4, false, null, null, 180000, 60),
    ('beauty_skin_spa', 'Spa & Body', 'Swedish Body Massage', 'Gentle, flowing full-body massage that eases tension and promotes deep relaxation.', 5, true, 'Swedish Body Massage', 3, 220000, 60),
    ('beauty_skin_spa', 'Spa & Body', 'Deep Tissue Massage', 'Firm, targeted pressure to release knots and chronic muscle tightness.', 6, false, null, null, 280000, 60),
    ('beauty_skin_spa', 'Spa & Body', 'Aromatherapy', 'Soothing essential-oil massage chosen to balance mood, body and skin.', 7, false, null, null, 240000, 60),
    ('beauty_skin_spa', 'Spa & Body', 'Foot Reflexology', 'Pressure-point therapy on the feet to relieve stress and restore overall wellbeing.', 8, false, null, null, 120000, 45),
    ('beauty_skin_spa', 'Spa & Body', 'Back Spa', 'Deep-cleansing back treatment with exfoliation, extraction and a relaxing massage.', 9, false, null, null, 180000, 45),
    ('beauty_skin_spa', 'Waxing & Threading', 'Eyebrow & Upper Lip Threading', 'Precise threading to shape your brows and smooth the upper lip with clean definition.', 10, false, null, null, 15000, 15),
    ('beauty_skin_spa', 'Waxing & Threading', 'Full Body Waxing', 'Complete body waxing — arms, legs, underarms and bikini line with soothing aftercare.', 11, true, 'Full Body Waxing', 2, 220000, 90),
    ('beauty_skin_spa', 'Waxing & Threading', 'Rica Waxing', 'Premium Rica wax treatment, gentle on sensitive skin with long-lasting smoothness.', 12, false, null, null, 180000, 60),
    ('beauty_skin_spa', 'Waxing & Threading', 'Bikini Wax', 'Hygienic, comfortable bikini-line waxing in a private, relaxing setting.', 13, false, null, null, 90000, 30),
    ('beauty_skin_spa', 'Makeup', 'Bridal Makeup', 'Flawless, long-lasting bridal look with skin prep, lashes and finishing touches for your big day.', 14, true, 'Bridal Makeup', 5, 900000, 150),
    ('beauty_skin_spa', 'Makeup', 'Party Makeup', 'Camera-ready makeup for parties, dinners and celebrations with a polished finish.', 15, false, null, null, 300000, 75),
    ('beauty_skin_spa', 'Makeup', 'Airbrush Makeup', 'Featherlight, high-definition airbrush makeup for a flawless, weightless finish.', 16, false, null, null, 450000, 90),
    ('beauty_skin_spa', 'Makeup', 'Pre-Bridal Skin Care', 'A pre-wedding skincare ritual of facials and treatments for radiant, camera-ready skin.', 17, false, null, null, 600000, 120),
    ('family_full_service', 'Men''s Services', 'Classic Haircut', 'A polished classic cut with scissor and clipper detailing, wash and finish.', 0, true, 'Classic Haircut', 0, 35000, 35),
    ('family_full_service', 'Men''s Services', 'Beard Trim', 'Precision beard shaping with a clean line-up, warm towel and conditioning finish.', 1, true, 'Beard Trim', 2, 25000, 25),
    ('family_full_service', 'Men''s Services', 'Hair Color', 'A rich, even colour refresh with consultation and scalp-safe application.', 2, false, null, null, 120000, 75),
    ('family_full_service', 'Men''s Services', 'Head Massage', 'A relaxing scalp and head massage to release tension and leave you refreshed.', 3, false, null, null, 50000, 30),
    ('family_full_service', 'Women''s Services', 'Haircut & Blowdry', 'A tailored haircut finished with a smooth, bouncy salon blowdry.', 4, true, 'Haircut & Blowdry', 1, 65000, 55),
    ('family_full_service', 'Women''s Services', 'Hair Spa', 'Deep conditioning, warm steam and a restorative scalp massage for softer, shinier hair.', 5, true, 'Hair Spa', 3, 100000, 60),
    ('family_full_service', 'Women''s Services', 'Threading', 'Gentle, precise facial threading for clean brows and a polished finish.', 6, false, null, null, 15000, 20),
    ('family_full_service', 'Women''s Services', 'Root Touch-Up', 'Seamless grey coverage and root refresh blended into your existing colour.', 7, false, null, null, 90000, 60),
    ('family_full_service', 'Women''s Services', 'Facial', 'A deep-cleansing facial with steam, gentle extraction and a soothing mask for fresh, glowing skin.', 8, true, 'Deep Cleansing Facial', 4, 85000, 50),
    ('family_full_service', 'Kids Special', 'Kids Haircut', 'A gentle, friendly haircut designed for a comfortable and fuss-free kids visit.', 9, true, 'Kids Haircut', 5, 25000, 25),
    ('family_full_service', 'Kids Special', 'Creative Styling', 'Fun braids, clips and creative styling for parties, photos and special days.', 10, false, null, null, 45000, 35),
    ('family_full_service', 'Kids Special', 'Baby Hair Cut (Mundan/Trim)', 'A patient, hygienic first haircut or trim with extra care for little guests.', 11, false, null, null, 30000, 30),
    ('family_full_service', 'Combos', 'Family Haircare Package', 'A convenient family visit combining haircare moments for everyone under one roof.', 12, false, null, null, 180000, 120),
    ('family_full_service', 'Combos', 'Couple Pamper Combo', 'A shared salon break with coordinated grooming and relaxation for two.', 13, false, null, null, 150000, 90),
    ('family_full_service', 'Combos', 'Express Grooming', 'A quick, polished grooming refresh for busy days and last-minute plans.', 14, false, null, null, 70000, 45),
    ('nail_lash_studio', 'Nail Art & Gel', 'Gel Polish Overlay', 'A sheer or statement gel colour layered over your natural nails for a smooth, chip-resistant glass finish.', 0, true, 'Gel Polish Overlay', 1, 90000, 60),
    ('nail_lash_studio', 'Nail Art & Gel', 'Acrylic Nail Extensions', 'Custom sculpted acrylic extensions shaped to your preferred length, profile and finish.', 1, true, 'Acrylic Extensions', 0, 180000, 120),
    ('nail_lash_studio', 'Nail Art & Gel', 'Chrome Nail Art', 'Reflective chrome pigment and precision detailing for a high-shine, camera-ready nail look.', 2, true, 'Nail Art Per Nail', 4, 140000, 90),
    ('nail_lash_studio', 'Nail Art & Gel', 'French Manicure', 'A timeless sheer base and clean French tip, finished with a glossy salon seal.', 3, false, null, null, 75000, 60),
    ('nail_lash_studio', 'Nail Art & Gel', 'Nail Removal & Repair', 'Safe product removal, gentle repair and restorative prep before your next set.', 4, false, null, null, 50000, 45),
    ('nail_lash_studio', 'Pedicure & Manicure', 'Luxury Spa Pedicure', 'Soak, exfoliation, cuticle care, massage and polish for completely refreshed feet.', 5, true, 'Luxury Spa Pedicure', 2, 120000, 75),
    ('nail_lash_studio', 'Pedicure & Manicure', 'Ice Cream Manicure', 'A playful, creamy manicure ritual with softening care, massage and a sweet glossy finish.', 6, false, null, null, 85000, 60),
    ('nail_lash_studio', 'Pedicure & Manicure', 'Cuticle Care & Polish', 'Neat cuticle care, natural nail shaping and your choice of polished colour.', 7, false, null, null, 55000, 40),
    ('nail_lash_studio', 'Pedicure & Manicure', 'Paraffin Wax Care', 'Warm paraffin treatment to deeply soften dry hands or feet after your care ritual.', 8, false, null, null, 65000, 35),
    ('nail_lash_studio', 'Lash & Brow', 'Eyelash Extensions (Classic/Volume)', 'Lightweight, customised lash extensions ranging from clean classic definition to soft volume.', 9, true, 'Classic Lash Extensions', 3, 220000, 120),
    ('nail_lash_studio', 'Lash & Brow', 'Lash Lift & Tint', 'A lifted, curled and tinted lash look that opens the eyes without extensions.', 10, false, null, null, 150000, 75),
    ('nail_lash_studio', 'Lash & Brow', 'Microblading', 'Fine, hair-like brow strokes mapped to your features for a naturally fuller arch.', 11, false, null, null, 450000, 150),
    ('nail_lash_studio', 'Lash & Brow', 'Brow Lamination', 'Smooth, set and softly lifted brows with a clean brushed-up finish.', 12, true, 'Brow Lamination', 5, 100000, 60)
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
