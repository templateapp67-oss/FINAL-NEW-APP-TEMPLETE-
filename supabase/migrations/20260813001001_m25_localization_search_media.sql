-- M25 (DRAFT) / Phase 9.2: localization, theme-scoped search, and service media.
-- Translations and media live in separate tables. Primary service/category
-- relationships are never rewritten.
-- NOT applied to any database. Live read-only introspection is still required.

begin;

do $$ begin
  create type public.nexora_content_locale as enum ('en', 'hi');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nexora_catalog_entity as enum ('category', 'predefined_service');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nexora_service_media_kind as enum ('image', 'banner', 'icon');
exception when duplicate_object then null;
end $$;

-- Global catalog translations (categories + predefined services).
create table if not exists public.catalog_translations (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.themes(id) on delete restrict,
  entity_type public.nexora_catalog_entity not null,
  category_id uuid,
  predefined_service_id uuid,
  locale public.nexora_content_locale not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_translations_name_not_blank check (btrim(name) <> ''),
  constraint catalog_translations_shape check (
    (entity_type = 'category' and category_id is not null and predefined_service_id is null)
    or
    (entity_type = 'predefined_service' and predefined_service_id is not null and category_id is null)
  ),
  constraint catalog_translations_category_theme_fk
    foreign key (category_id, theme_id)
    references public.service_categories(id, theme_id) on delete restrict,
  constraint catalog_translations_predefined_theme_fk
    foreign key (predefined_service_id, theme_id)
    references public.predefined_services(id, theme_id) on delete restrict
);

create unique index if not exists idx_catalog_translations_category_locale
  on public.catalog_translations (category_id, locale)
  where entity_type = 'category';
create unique index if not exists idx_catalog_translations_predefined_locale
  on public.catalog_translations (predefined_service_id, locale)
  where entity_type = 'predefined_service';

-- Tenant saved-service translations. Primary services.name stays English/source.
create table if not exists public.saved_service_translations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  theme_id uuid not null references public.themes(id) on delete restrict,
  service_id uuid not null,
  locale public.nexora_content_locale not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_service_translations_service_fk
    foreign key (service_id, business_id, theme_id)
    references public.services(id, business_id, theme_id) on delete cascade,
  constraint saved_service_translations_name_not_blank check (btrim(name) <> ''),
  constraint saved_service_translations_unique unique (service_id, locale)
);

-- Theme-scoped media. A row cannot be reused by another theme/service.
create table if not exists public.saved_service_media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  theme_id uuid not null references public.themes(id) on delete restrict,
  service_id uuid not null,
  image_url text,
  banner_url text,
  icon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_service_media_service_fk
    foreign key (service_id, business_id, theme_id)
    references public.services(id, business_id, theme_id) on delete cascade,
  constraint saved_service_media_one_row unique (service_id)
);

create index if not exists idx_catalog_translations_theme_locale
  on public.catalog_translations (theme_id, locale, entity_type);
create index if not exists idx_saved_service_translations_theme
  on public.saved_service_translations (business_id, theme_id, locale);
create index if not exists idx_saved_service_media_theme
  on public.saved_service_media (business_id, theme_id, service_id);

drop trigger if exists set_catalog_translations_updated_at on public.catalog_translations;
create trigger set_catalog_translations_updated_at
before update on public.catalog_translations
for each row execute function public.set_updated_at();

drop trigger if exists set_saved_service_translations_updated_at on public.saved_service_translations;
create trigger set_saved_service_translations_updated_at
before update on public.saved_service_translations
for each row execute function public.set_updated_at();

drop trigger if exists set_saved_service_media_updated_at on public.saved_service_media;
create trigger set_saved_service_media_updated_at
before update on public.saved_service_media
for each row execute function public.set_updated_at();

alter table public.catalog_translations enable row level security;
alter table public.saved_service_translations enable row level security;
alter table public.saved_service_media enable row level security;

revoke all on table public.catalog_translations from public, anon;
revoke all on table public.saved_service_translations from public, anon;
revoke all on table public.saved_service_media from public, anon;

grant select on table public.catalog_translations to anon, authenticated, service_role;
grant select, insert, update, delete on table public.saved_service_translations to authenticated, service_role;
grant select, insert, update, delete on table public.saved_service_media to authenticated, service_role;

drop policy if exists catalog_translations_read on public.catalog_translations;
create policy catalog_translations_read on public.catalog_translations
for select to anon, authenticated using (true);

drop policy if exists saved_service_translations_manage on public.saved_service_translations;
create policy saved_service_translations_manage on public.saved_service_translations
for all to authenticated
using (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]))
with check (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));

drop policy if exists saved_service_media_manage on public.saved_service_media;
create policy saved_service_media_manage on public.saved_service_media
for all to authenticated
using (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]))
with check (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));

-- ---------------------------------------------------------------------------
-- Seed Hindi catalog copy. Primary English rows are not updated.
-- ---------------------------------------------------------------------------
do $$
declare
  seed jsonb := $seed${"cats":{"barber_mens_grooming":{"Haircuts":"हेयरकट","Beard & Shave":"दाढ़ी और शेव","Grooming & Treatments":"ग्रूमिंग और ट्रीटमेंट"},"hair_studio_color_bar":{"Styling & Cuts":"स्टाइलिंग और कट","Hair Color":"हेयर कलर","Treatments":"ट्रीटमेंट"},"beauty_skin_spa":{"Facial & Skincare":"फेशियल और स्किनकेयर","Spa & Body":"स्पा और बॉडी","Waxing & Threading":"वैक्सिंग और थ्रेडिंग","Makeup":"मेकअप"},"family_full_service":{"Men's Services":"पुरुष सेवाएँ","Women's Services":"महिला सेवाएँ","Kids Special":"बच्चों की स्पेशल","Combos":"कॉम्बो"},"nail_lash_studio":{"Nail Art & Gel":"नेल आर्ट और जेल","Pedicure & Manicure":"पेडीक्योर और मैनीक्योर","Lash & Brow":"लैश और ब्रो"}},"svcs":{"barber_mens_grooming":{"Skin Fade":{"name":"स्किन फ़ेड","description":"त्वचा से ऊपर तक सहज ब्लेंड के साथ सटीक स्किन फ़ेड।"},"Scissors Cut":{"name":"कैंची कट","description":"चेहरे और बालों के प्रकार के अनुसार क्लासिक सिसर कट।"},"Buzz Cut":{"name":"बज़ कट","description":"साफ़, एकसमान क्लिपर कट।"},"Taper Fade":{"name":"टेपर फ़ेड","description":"साफ़ नेकलाइन के साथ धीरे-धीरे टेपर फ़ेड।"},"Kids Barbering":{"name":"बच्चों का बारबरिंग","description":"लड़कों के लिए धैर्यपूर्ण, मित्रवत हेयरकट।"},"Head Shave":{"name":"हेड शेव","description":"हॉट टॉवल के साथ स्मूद हेड शेव।"},"Beard Sculpting & Lineup":{"name":"दाढ़ी स्कल्प्टिंग और लाइनअप","description":"तेज़ लाइनअप और दाढ़ी तेल के साथ विस्तृत स्कल्प्टिंग।"},"Hot Towel Classic Shave":{"name":"हॉट टॉवल क्लासिक शेव","description":"हॉट टॉवल और कूलिंग बाम के साथ पारंपरिक शेव।"},"Beard Trim & Lineup":{"name":"दाढ़ी ट्रिम और लाइनअप","description":"गाल और गर्दन की साफ़ लाइन के साथ सटीक ट्रिम।"},"Moustache Styling":{"name":"मूँछ स्टाइलिंग","description":"वैक्स के साथ मूँछ ट्रिम और शेप।"},"Beard Color/Coverup":{"name":"दाढ़ी कलर/कवरअप","description":"सफ़ेद बाल ढकने के लिए प्राकृतिक दाढ़ी रंग।"},"Charcoal Face Detox":{"name":"चारकोल फेस डिटॉक्स","description":"छिद्र साफ़ करने वाला चारकोल फेशियल।"},"Scalp & Head Massage":{"name":"स्कैल्प और हेड मसाज","description":"तनाव घटाने वाली सिर की मालिश।"},"Executive Beard & Hair Combo":{"name":"एग्ज़ीक्यूटिव दाढ़ी और हेयर कॉम्बो","description":"हेयरकट और स्कल्प्टेड दाढ़ी एक साथ।"},"Hair Loss Scalp Therapy":{"name":"हेयर लॉस स्कैल्प थेरेपी","description":"जड़ों को मज़बूत करने वाली स्कैल्प थेरेपी।"}},"hair_studio_color_bar":{"Signature Cut & Blowdry":{"name":"सिग्नेचर कट और ब्लो ड्राई","description":"चेहरे के अनुसार सटीक कट और ग्लॉसी ब्लो ड्राई।"},"Layered Cut":{"name":"लेयर्ड कट","description":"मूवमेंट और वॉल्यूम के लिए फेस-फ्रेमिंग लेयर्स।"},"Bob/Pixie Precision Cut":{"name":"बॉब/पिक्सी प्रिसिशन कट","description":"तेज़ लाइनों वाला आर्किटेक्चरल बॉब या पिक्सी।"},"Luxury Blowout":{"name":"लक्ज़री ब्लोआउट","description":"बाउंस और शाइन के साथ राउंड-ब्रश ब्लोआउट।"},"Hollywood Waves":{"name":"हॉलीवुड वेव्स","description":"ग्लॉसी रेड-कार्पेट वेव्स।"},"Hair Setting":{"name":"हेयर सेटिंग","description":"वॉल्यूम के लिए क्लासिक रोलर सेटिंग।"},"Balayage / Ombre":{"name":"बालायाज / ओम्ब्रे","description":"हाथ से पेंट किया बालायाज या सॉफ्ट ओम्ब्रे।"},"Global Hair Color":{"name":"ग्लोबल हेयर कलर","description":"पूरे सिर पर समान, चमकदार रंग।"},"Root Touch-Up":{"name":"रूट टच-अप","description":"मौजूदा शेड में सहज रूट रिफ्रेश।"},"Highlights & Lowlights":{"name":"हाइलाइट्स और लोलाइट्स","description":"गहराई और चमक देने वाला मल्टी-टोन फ़ॉइल।"},"Gloss & Tone Treatment":{"name":"ग्लॉस और टोन ट्रीटमेंट","description":"ब्रास घटाकर शीशे जैसी चमक।"},"Fashion Color":{"name":"फ़ैशन कलर","description":"बोल्ड पास्टल और विविड कलर।"},"Keratin Restoration":{"name":"केराटिन रेस्टोरेशन","description":"फ़्रिज़ घटाकर मज़बूती लौटाने वाला केराटिन।"},"Hair Botox Treatment":{"name":"हेयर बोटॉक्स ट्रीटमेंट","description":"रेशमी फ़िनिश के लिए डीप-फ़िलर ट्रीटमेंट।"},"Smoothening / Rebonding":{"name":"स्मूदनिंग / रीबॉन्डिंग","description":"स्थायी स्ट्रेटनिंग।"},"Scalp Detox Spa":{"name":"स्कैल्प डिटॉक्स स्पा","description":"एक्सफ़ोलिएटिंग स्कैल्प रिचुअल।"},"Olaplex Bond Repair":{"name":"ओलाप्लेक्स बॉन्ड रिपेयर","description":"टूटे बॉन्ड जोड़ने वाली थेरेपी।"}},"beauty_skin_spa":{"HydraFacial":{"name":"हाइड्राफेशियल","description":"सफ़ाई, हाइड्रेशन और तुरंत ग्लो देने वाला मल्टी-स्टेप फेशियल।"},"Anti-Aging Gold Facial":{"name":"एंटी-एजिंग गोल्ड फेशियल","description":"फाइन लाइन्स घटाता 24K गोल्ड फेशियल।"},"Deep Cleansing Cleanup":{"name":"डीप क्लेंज़िंग क्लीनअप","description":"स्टीम, एक्सट्रैक्शन और सूथिंग मास्क।"},"De-Tan Brightening":{"name":"डी-टैन ब्राइटनिंग","description":"सन डैमेज घटाकर समान रंगत।"},"Organic Glow Treatment":{"name":"ऑर्गेनिक ग्लो ट्रीटमेंट","description":"वनस्पति ऐक्टिव्स वाला ग्लो फेशियल।"},"Swedish Body Massage":{"name":"स्वीडिश बॉडी मसाज","description":"तनाव घटाती कोमल फुल-बॉडी मालिश।"},"Deep Tissue Massage":{"name":"डीप टिश्यू मसाज","description":"गांठें खोलने वाली मज़बूत मालिश।"},"Aromatherapy":{"name":"अरोमाथेरेपी","description":"मूड और त्वचा के लिए एसेंशियल ऑयल मसाज।"},"Foot Reflexology":{"name":"फ़ुट रिफ़्लेक्सोलॉजी","description":"पैरों पर प्रेशर-पॉइंट थेरेपी।"},"Back Spa":{"name":"बैक स्पा","description":"पीठ की सफ़ाई, एक्सफ़ोलिएशन और मालिश।"},"Eyebrow & Upper Lip Threading":{"name":"आईब्रो और अपर लिप थ्रेडिंग","description":"भ्रू और ऊपरी होंठ की सटीक थ्रेडिंग।"},"Full Body Waxing":{"name":"फुल बॉडी वैक्सिंग","description":"पूरे शरीर की वैक्सिंग और आफ्टरकेयर।"},"Rica Waxing":{"name":"रिका वैक्सिंग","description":"संवेदनशील त्वचा के लिए रिका वैक्स।"},"Bikini Wax":{"name":"बिकिनी वैक्स","description":"निजी, आरामदायक बिकिनी वैक्स।"},"Bridal Makeup":{"name":"ब्राइडल मेकअप","description":"बिग डे के लिए लंबे समय तक टिकने वाला ब्राइडल लुक।"},"Party Makeup":{"name":"पार्टी मेकअप","description":"पार्टियों के लिए कैमरा-रेडी मेकअप।"},"Airbrush Makeup":{"name":"एयरब्रश मेकअप","description":"हल्का हाई-डेफ़िनिशन एयरब्रश फ़िनिश।"},"Pre-Bridal Skin Care":{"name":"प्री-ब्राइडल स्किन केयर","description":"शादी से पहले की स्किनकेयर रिचुअल।"}},"family_full_service":{"Classic Haircut":{"name":"क्लासिक हेयरकट","description":"वॉश और फ़िनिश के साथ पॉलिश्ड क्लासिक कट।"},"Beard Trim":{"name":"दाढ़ी ट्रिम","description":"साफ़ लाइनअप के साथ सटीक दाढ़ी शेपिंग।"},"Hair Color":{"name":"हेयर कलर","description":"सलाह और सुरक्षित अप्लिकेशन के साथ रंग रिफ्रेश।"},"Head Massage":{"name":"हेड मसाज","description":"तनाव घटाने वाली सिर की मालिश।"},"Haircut & Blowdry":{"name":"हेयरकट और ब्लो ड्राई","description":"स्मूथ सैलून ब्लो ड्राई के साथ कट।"},"Hair Spa":{"name":"हेयर स्पा","description":"डीप कंडीशनिंग और स्कैल्प मसाज।"},"Threading":{"name":"थ्रेडिंग","description":"साफ़ भौंहों के लिए कोमल थ्रेडिंग।"},"Root Touch-Up":{"name":"रूट टच-अप","description":"मौजूदा रंग में ग्रे कवरेज।"},"Facial":{"name":"फेशियल","description":"स्टीम और मास्क के साथ डीप-क्लींज़िंग फेशियल।"},"Kids Haircut":{"name":"बच्चों का हेयरकट","description":"आरामदायक बच्चों का हेयरकट।"},"Creative Styling":{"name":"क्रिएटिव स्टाइलिंग","description":"पार्टियों के लिए मज़ेदार ब्रैड्स और स्टाइल।"},"Baby Hair Cut (Mundan/Trim)":{"name":"बेबी हेयर कट (मुंडन/ट्रिम)","description":"छोटे मेहमानों के लिए सावधानीपूर्ण पहला कट।"},"Family Haircare Package":{"name":"फ़ैमिली हेयरकेयर पैकेज","description":"पूरे परिवार के लिए एक साथ हेयरकेयर।"},"Couple Pamper Combo":{"name":"कपल पैम्पर कॉम्बो","description":"दो लोगों के लिए साझा सैलून ब्रेक।"},"Express Grooming":{"name":"एक्सप्रेस ग्रूमिंग","description":"व्यस्त दिनों के लिए तेज़ ग्रूमिंग।"}},"nail_lash_studio":{"Gel Polish Overlay":{"name":"जेल पॉलिश ओवरले","description":"नेचुरल नेल्स पर चिप-रेज़िस्टेंट जेल फ़िनिश।"},"Acrylic Nail Extensions":{"name":"एक्रिलिक नेल एक्सटेंशन","description":"पसंदीदा लंबाई में स्कल्प्टेड एक्रिलिक।"},"Chrome Nail Art":{"name":"क्रोम नेल आर्ट","description":"हाई-शाइन क्रोम पिगमेंट और डिटेलिंग।"},"French Manicure":{"name":"फ़्रेंच मैनीक्योर","description":"क्लासिक शीयर बेस और फ़्रेंच टिप।"},"Nail Removal & Repair":{"name":"नेल रिमूवल और रिपेयर","description":"सुरक्षित प्रोडक्ट रिमूवल और रिपेयर।"},"Luxury Spa Pedicure":{"name":"लक्ज़री स्पा पेडीक्योर","description":"सोख, एक्सफ़ोलिएशन, मालिश और पॉलिश।"},"Ice Cream Manicure":{"name":"आइस क्रीम मैनीक्योर","description":"नरम देखभाल और ग्लॉसी फ़िनिश वाला मैनीक्योर।"},"Cuticle Care & Polish":{"name":"क्यूटिकल केयर और पॉलिश","description":"क्यूटिकल केयर, शेप और रंग।"},"Paraffin Wax Care":{"name":"पैराफ़िन वैक्स केयर","description":"सूखे हाथ-पैरों के लिए गर्म पैराफ़िन।"},"Eyelash Extensions (Classic/Volume)":{"name":"आईलैश एक्सटेंशन (क्लासिक/वॉल्यूम)","description":"क्लासिक से सॉफ्ट वॉल्यूम तक कस्टम लैशेस।"},"Lash Lift & Tint":{"name":"लैश लिफ़्ट और टिंट","description":"बिना एक्सटेंशन के लिफ़्टेड और टिंटेड लैशेस।"},"Microblading":{"name":"माइक्रोब्लेडिंग","description":"प्राकृतिक भरी हुई भौंहों के लिए महीन स्ट्रोक्स।"},"Brow Lamination":{"name":"ब्रो लैमिनेशन","description":"ब्रश-अप फ़िनिश के साथ सेट भौहें।"}}}}$seed$;
  theme_key text;
  english_name text;
  theme_uuid uuid;
  category_uuid uuid;
  service_uuid uuid;
  copy jsonb;
begin
  for theme_key, copy in select key, value from jsonb_each(seed -> 'cats') loop
    select t.id into theme_uuid from public.themes t where t.theme_id = theme_key;
    if theme_uuid is null then continue; end if;
    for english_name in select jsonb_object_keys(copy) loop
      select c.id into category_uuid
      from public.service_categories c
      where c.theme_id = theme_uuid and c.name = english_name;
      if category_uuid is null then continue; end if;
      insert into public.catalog_translations (
        theme_id, entity_type, category_id, locale, name, description
      ) values (
        theme_uuid, 'category', category_uuid, 'hi', copy ->> english_name, ''
      )
      on conflict do nothing;
    end loop;
  end loop;

  for theme_key, copy in select key, value from jsonb_each(seed -> 'svcs') loop
    select t.id into theme_uuid from public.themes t where t.theme_id = theme_key;
    if theme_uuid is null then continue; end if;
    for english_name in select jsonb_object_keys(copy) loop
      select ps.id into service_uuid
      from public.predefined_services ps
      where ps.theme_id = theme_uuid and ps.name = english_name;
      if service_uuid is null then continue; end if;
      insert into public.catalog_translations (
        theme_id, entity_type, predefined_service_id, locale, name, description
      )
      select theme_uuid, 'predefined_service', service_uuid, 'hi',
        copy -> english_name ->> 'name',
        coalesce(copy -> english_name ->> 'description', '')
      where not exists (
        select 1 from public.catalog_translations t
        where t.predefined_service_id = service_uuid and t.locale = 'hi'
      );
    end loop;
  end loop;
end
$$;

-- Unique indexes above use partial uniques; ON CONFLICT DO NOTHING needs named
-- constraints. Re-run safety: skip existing (theme, entity, locale, name) rows.
-- The first pass inserts; replay is handled by the unique indexes raising and
-- being swallowed via a second pass using NOT EXISTS.
insert into public.catalog_translations (theme_id, entity_type, category_id, locale, name, description)
select c.theme_id, 'category', c.id, 'en', c.name, ''
from public.service_categories c
where not exists (
  select 1 from public.catalog_translations t
  where t.category_id = c.id and t.locale = 'en'
);

insert into public.catalog_translations (theme_id, entity_type, predefined_service_id, locale, name, description)
select ps.theme_id, 'predefined_service', ps.id, 'en', ps.name, coalesce(ps.description, '')
from public.predefined_services ps
where not exists (
  select 1 from public.catalog_translations t
  where t.predefined_service_id = ps.id and t.locale = 'en'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.nexora_translation_array(
  p_theme_id uuid,
  p_entity public.nexora_catalog_entity,
  p_category_id uuid,
  p_predefined_id uuid
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'locale', t.locale,
    'name', t.name,
    'description', t.description
  ) order by t.locale), '[]'::jsonb)
  from public.catalog_translations t
  where t.theme_id = p_theme_id
    and t.entity_type = p_entity
    and (
      (p_entity = 'category' and t.category_id = p_category_id)
      or
      (p_entity = 'predefined_service' and t.predefined_service_id = p_predefined_id)
    )
$$;

create or replace function public.nexora_saved_service_media_payload(p_service_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select case when m.service_id is null then '{}'::jsonb else jsonb_build_object(
    'image_url', m.image_url,
    'banner_url', m.banner_url,
    'icon_url', m.icon_url
  ) end
  from (select p_service_id as service_id) s
  left join public.saved_service_media m on m.service_id = s.service_id
$$;

create or replace function public.nexora_saved_service_translation_array(p_service_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'locale', t.locale,
    'name', t.name,
    'description', t.description
  ) order by t.locale), '[]'::jsonb)
  from public.saved_service_translations t
  where t.service_id = p_service_id
$$;

create or replace function public.nexora_saved_service_payload(p_service_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', s.id,
    'business_id', s.business_id,
    'theme_id', s.theme_id,
    'theme_key', t.theme_id,
    'category_id', s.category_id,
    'predefined_service_id', s.predefined_service_id,
    'name', s.name,
    'category', s.category,
    'description', s.short_description,
    'price_paise', s.price_paise,
    'duration_minutes', s.duration_minutes,
    'status', s.status,
    'is_featured', s.is_featured,
    'display_order', s.display_order,
    'translations', public.nexora_saved_service_translation_array(s.id),
    'media', public.nexora_saved_service_media_payload(s.id)
  )
  from public.services s
  left join public.themes t on t.id = s.theme_id
  where s.id = p_service_id
$$;

create or replace function public.get_saved_services_for_theme(p_theme_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_theme_id uuid;
  saved_rows jsonb;
begin
  select t.id into target_theme_id
  from public.themes t
  where t.theme_id = p_theme_id and t.is_active;
  if target_theme_id is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  select coalesce(jsonb_agg(
    public.nexora_saved_service_payload(s.id)
    order by s.display_order, s.created_at, s.id
  ), '[]'::jsonb)
  into saved_rows
  from public.services s
  join public.themes t on t.id = s.theme_id
  join public.service_categories c
    on c.id = s.category_id
   and c.theme_id = t.id
  where s.business_id = target_business_id
    and s.theme_id = target_theme_id
    and (s.predefined_service_id is null or exists (
      select 1 from public.predefined_services ps
      where ps.id = s.predefined_service_id
        and ps.theme_id = s.theme_id
        and ps.category_id = s.category_id
    ));

  return jsonb_build_object(
    'business_id', target_business_id,
    'theme_id', p_theme_id,
    'services', saved_rows
  );
end
$$;

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
          'sort_order', c.sort_order,
          'translations', public.nexora_translation_array(t.id, 'category', c.id, null)
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
          'default_duration_minutes', ps.default_duration_minutes,
          'translations', public.nexora_translation_array(t.id, 'predefined_service', null, ps.id)
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
          'default_duration_minutes', ps.default_duration_minutes,
          'translations', public.nexora_translation_array(t.id, 'predefined_service', null, ps.id)
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

-- Fast theme-scoped search over English + translated names/descriptions.
create or replace function public.search_theme_services(p_theme_id text, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_theme_id uuid;
  needle text := lower(btrim(coalesce(p_query, '')));
  hits jsonb;
begin
  select t.id into target_theme_id from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_id is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb)
  into hits
  from (
    select jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.short_description,
      'translated_name', tr.name,
      'source', 'saved'
    ) as item
    from public.services s
    left join public.saved_service_translations tr
      on tr.service_id = s.id
     and (
       needle = ''
       or lower(tr.name) like '%' || needle || '%'
       or lower(tr.description) like '%' || needle || '%'
     )
    where s.business_id = target_business_id
      and s.theme_id = target_theme_id
      and (
        needle = ''
        or lower(s.name) like '%' || needle || '%'
        or lower(coalesce(s.short_description, '')) like '%' || needle || '%'
        or tr.id is not null
      )
    union all
    select jsonb_build_object(
      'id', ps.id,
      'name', ps.name,
      'description', ps.description,
      'translated_name', ct.name,
      'source', 'predefined'
    )
    from public.predefined_services ps
    left join public.catalog_translations ct
      on ct.predefined_service_id = ps.id
     and ct.locale <> 'en'
     and (
       needle = ''
       or lower(ct.name) like '%' || needle || '%'
       or lower(ct.description) like '%' || needle || '%'
     )
    where ps.theme_id = target_theme_id
      and ps.is_active
      and (
        needle = ''
        or lower(ps.name) like '%' || needle || '%'
        or lower(coalesce(ps.description, '')) like '%' || needle || '%'
        or ct.id is not null
      )
  ) ranked;

  return jsonb_build_object(
    'business_id', target_business_id,
    'theme_id', p_theme_id,
    'results', hits
  );
end
$$;

create or replace function public.upsert_saved_service_translation(
  p_theme_id text,
  p_service_id uuid,
  p_locale text,
  p_name text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_theme_uuid uuid;
  clean_name text := btrim(coalesce(p_name, ''));
  result jsonb;
begin
  if p_locale not in ('en', 'hi') then
    raise exception using errcode = '22023', message = 'Locale is not supported.';
  end if;
  if clean_name = '' then
    raise exception using errcode = '22023', message = 'Translated name is required.';
  end if;
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id
      and s.business_id = target_business_id
      and s.theme_id = target_theme_uuid
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  insert into public.saved_service_translations (
    business_id, theme_id, service_id, locale, name, description
  ) values (
    target_business_id, target_theme_uuid, p_service_id,
    p_locale::public.nexora_content_locale, clean_name, coalesce(p_description, '')
  )
  on conflict (service_id, locale) do update
    set name = excluded.name,
        description = excluded.description
  returning jsonb_build_object(
    'locale', locale, 'name', name, 'description', description
  ) into result;
  return result;
end
$$;

create or replace function public.upsert_saved_service_media(
  p_theme_id text,
  p_service_id uuid,
  p_kind text,
  p_url text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_theme_uuid uuid;
  clean_url text := btrim(coalesce(p_url, ''));
begin
  if p_kind not in ('image', 'banner', 'icon') then
    raise exception using errcode = '22023', message = 'Media kind must be image, banner, or icon.';
  end if;
  if clean_url = '' then
    raise exception using errcode = '22023', message = 'Media URL is required.';
  end if;
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id
      and s.business_id = target_business_id
      and s.theme_id = target_theme_uuid
  ) then
    raise exception using errcode = '42501', message = 'Service was not found for your salon.';
  end if;

  insert into public.saved_service_media (business_id, theme_id, service_id)
  values (target_business_id, target_theme_uuid, p_service_id)
  on conflict (service_id) do nothing;

  if p_kind = 'image' then
    update public.saved_service_media set image_url = clean_url
    where service_id = p_service_id and business_id = target_business_id and theme_id = target_theme_uuid;
  elsif p_kind = 'banner' then
    update public.saved_service_media set banner_url = clean_url
    where service_id = p_service_id and business_id = target_business_id and theme_id = target_theme_uuid;
  else
    update public.saved_service_media set icon_url = clean_url
    where service_id = p_service_id and business_id = target_business_id and theme_id = target_theme_uuid;
  end if;

  return public.nexora_saved_service_media_payload(p_service_id);
end
$$;

create or replace function public.delete_saved_service_media(
  p_theme_id text,
  p_service_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_business_id uuid := public.nexora_current_manageable_business_id();
  target_theme_uuid uuid;
begin
  if p_kind not in ('image', 'banner', 'icon') then
    raise exception using errcode = '22023', message = 'Media kind must be image, banner, or icon.';
  end if;
  select t.id into target_theme_uuid from public.themes t where t.theme_id = p_theme_id and t.is_active;
  if target_theme_uuid is null then
    raise exception using errcode = '22023', message = 'No active service catalog exists for this theme.';
  end if;
  if not exists (
    select 1 from public.saved_service_media m
    where m.service_id = p_service_id
      and m.business_id = target_business_id
      and m.theme_id = target_theme_uuid
  ) then
    raise exception using errcode = '42501', message = 'Service media was not found for your salon.';
  end if;

  if p_kind = 'image' then
    update public.saved_service_media set image_url = null
    where service_id = p_service_id and business_id = target_business_id;
  elsif p_kind = 'banner' then
    update public.saved_service_media set banner_url = null
    where service_id = p_service_id and business_id = target_business_id;
  else
    update public.saved_service_media set icon_url = null
    where service_id = p_service_id and business_id = target_business_id;
  end if;

  return public.nexora_saved_service_media_payload(p_service_id);
end
$$;

revoke all on function public.nexora_translation_array(uuid, public.nexora_catalog_entity, uuid, uuid) from public;
revoke all on function public.nexora_saved_service_media_payload(uuid) from public;
revoke all on function public.nexora_saved_service_translation_array(uuid) from public;
revoke all on function public.search_theme_services(text, text) from public;
revoke all on function public.upsert_saved_service_translation(text, uuid, text, text, text) from public;
revoke all on function public.upsert_saved_service_media(text, uuid, text, text) from public;
revoke all on function public.delete_saved_service_media(text, uuid, text) from public;

grant execute on function public.get_theme_service_catalog(text) to anon, authenticated, service_role;
grant execute on function public.get_saved_services_for_theme(text) to authenticated, service_role;
grant execute on function public.search_theme_services(text, text) to authenticated, service_role;
grant execute on function public.upsert_saved_service_translation(text, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.upsert_saved_service_media(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.delete_saved_service_media(text, uuid, text) to authenticated, service_role;

commit;
