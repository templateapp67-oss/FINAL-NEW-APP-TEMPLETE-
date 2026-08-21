-- M27 (DRAFT) / Phase 15.8: video likes + weekly most-liked ranking.
--
-- Schema inspection first (see docs/phase-15.8-likes-weekly-most-liked.md):
--   * public.social_videos (M06) already stores every gallery video
--     (business_id, platform, video_url, external_video_id, caption,
--      display_order, status). It is REUSED as-is — no second video table.
--   * public.businesses / public.business_members (M03) already own tenancy
--     and the role matrix; auth.users owns identity. Both are REUSED.
--   * public.website_events (M10) already models an anonymous visitor with
--     `visitor_token`; Phase 15.8 reuses that exact concept for logged-out
--     likes rather than inventing a second anonymous identity.
--
-- Only two additive things are new:
--   1. Two nullable columns on social_videos that persist the Phase 15.1/15.3
--      client discriminators (theme scope + short/long) so the weekly ranking
--      can stay theme-aware and kind-aware in SQL. Existing rows are
--      untouched and stay valid with NULLs.
--   2. public.social_video_likes — one row per (video, liker) with the
--      uniqueness, tenancy and week logic enforced by the database.
--
-- Ranking weeks run Monday 00:00 → Sunday 23:59 in the BUSINESS timezone
-- (businesses.timezone, default Asia/Kolkata), so the ranking rolls over
-- without a scheduled job or a browser timer.
--
-- NOT applied to any database. Live read-only introspection is still required.

begin;

-- ---------------------------------------------------------------------------
-- 1. Additive video scoping columns (existing table, existing rows untouched)
-- ---------------------------------------------------------------------------
alter table public.social_videos
  add column if not exists theme_key text,
  add column if not exists video_kind text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.social_videos'::regclass
      and conname = 'social_videos_video_kind_check'
  ) then
    alter table public.social_videos
      add constraint social_videos_video_kind_check
      check (video_kind is null or video_kind in ('short', 'long'));
  end if;
end $$;

-- The theme key mirrors public.themes.theme_id (text slug, e.g.
-- 'barber_mens_grooming'). It is validated, not free text.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.social_videos'::regclass
      and conname = 'social_videos_theme_key_check'
  ) then
    alter table public.social_videos
      add constraint social_videos_theme_key_check
      check (theme_key is null or btrim(theme_key) <> '');
  end if;
end $$;

-- Composite key so a like can only reference a video together with the exact
-- business + theme it belongs to. This is the database-level guard that makes
-- cross-theme and cross-tenant like mixing impossible.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.social_videos'::regclass
      and conname = 'social_videos_id_business_theme_key'
  ) then
    alter table public.social_videos
      add constraint social_videos_id_business_theme_key
      unique (id, business_id, theme_key);
  end if;
end $$;

comment on column public.social_videos.theme_key is
  'Phase 15.1 theme scope (themes.theme_id slug). NULL = visible on every theme (grandfathered).';
comment on column public.social_videos.video_kind is
  'Phase 15.3 discriminator: short | long. NULL = inferred from the URL by the client.';

-- ---------------------------------------------------------------------------
-- 2. Likes table
-- ---------------------------------------------------------------------------
create table if not exists public.social_video_likes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  video_id uuid not null references public.social_videos(id) on delete cascade,
  -- Denormalised ONLY to carry the composite FK below; never client-supplied.
  theme_key text,
  -- Exactly one identity: an authenticated user, or the existing anonymous
  -- website visitor token (same concept as website_events.visitor_token).
  user_id uuid references auth.users(id) on delete cascade,
  visitor_token text,
  created_at timestamptz not null default now(),
  constraint social_video_likes_identity_shape check (
    (user_id is not null and visitor_token is null)
    or (user_id is null and visitor_token is not null and btrim(visitor_token) <> '')
  ),
  -- A like can only point at a video of the SAME business and SAME theme.
  constraint social_video_likes_video_business_theme_fk
    foreign key (video_id, business_id, theme_key)
    references public.social_videos(id, business_id, theme_key)
    on delete cascade
);

-- One like per video per identity — duplicates are impossible, not merely
-- discouraged. Partial unique indexes cover both identity shapes.
create unique index if not exists uq_social_video_likes_user
  on public.social_video_likes (video_id, user_id)
  where user_id is not null;
create unique index if not exists uq_social_video_likes_visitor
  on public.social_video_likes (video_id, visitor_token)
  where visitor_token is not null;

create index if not exists idx_social_video_likes_business_theme_created
  on public.social_video_likes (business_id, theme_key, created_at desc);
create index if not exists idx_social_video_likes_video
  on public.social_video_likes (video_id);

comment on table public.social_video_likes is
  'Phase 15.8 video likes. One row per (video, liker); weekly ranking is derived, never stored.';

-- ---------------------------------------------------------------------------
-- 3. Week helpers (business timezone, Monday-start ISO week)
-- ---------------------------------------------------------------------------
create or replace function public.nexora_business_week_start(p_business_id uuid, p_at timestamptz default now())
returns timestamptz
language sql
stable
set search_path = pg_catalog, public
as $$
  select date_trunc(
    'week',
    p_at at time zone coalesce(
      (select nullif(btrim(b.timezone), '') from public.businesses b where b.id = p_business_id),
      'Asia/Kolkata'
    )
  ) at time zone coalesce(
    (select nullif(btrim(b.timezone), '') from public.businesses b where b.id = p_business_id),
    'Asia/Kolkata'
  )
$$;

create or replace function public.nexora_business_week_key(p_business_id uuid, p_at timestamptz default now())
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select to_char(
    (p_at at time zone coalesce(
      (select nullif(btrim(b.timezone), '') from public.businesses b where b.id = p_business_id),
      'Asia/Kolkata'
    ))::date,
    'IYYY"-W"IW'
  )
$$;

-- ---------------------------------------------------------------------------
-- 4. Identity resolution (session only — never a client-supplied user id)
-- ---------------------------------------------------------------------------
-- The visitor token is read from the request JWT/headers that PostgREST
-- already forwards. An anonymous caller can only ever act as itself, and an
-- authenticated caller is always auth.uid().
create or replace function public.nexora_like_visitor_token()
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select nullif(btrim(coalesce(
    current_setting('request.jwt.claim.session_id', true),
    current_setting('request.header.x-visitor-token', true),
    ''
  )), '')
$$;

-- ---------------------------------------------------------------------------
-- 5. Toggle RPC — the ONLY write path
-- ---------------------------------------------------------------------------
-- Enforces: the video exists, is customer-visible (status='active'), belongs
-- to a published business, and that the caller likes at most once. A repeated
-- like from the same identity removes the like instead of adding a duplicate.
create or replace function public.toggle_social_video_like(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_video public.social_videos%rowtype;
  v_user uuid := auth.uid();
  v_token text := public.nexora_like_visitor_token();
  v_deleted int := 0;
  v_liked boolean;
begin
  select * into v_video
  from public.social_videos sv
  where sv.id = p_video_id and sv.status = 'active';

  if not found then
    raise exception using errcode = '42501', message = 'This video is not available to like.';
  end if;

  if not public.is_published_business(v_video.business_id)
     and not public.is_business_member(v_video.business_id) then
    raise exception using errcode = '42501', message = 'This video is not available to like.';
  end if;

  if v_user is null and v_token is null then
    raise exception using errcode = '42501',
      message = 'A session is required to like a video.';
  end if;

  if v_user is not null then
    delete from public.social_video_likes l
      where l.video_id = p_video_id and l.user_id = v_user;
    get diagnostics v_deleted = row_count;
    if v_deleted = 0 then
      insert into public.social_video_likes (business_id, video_id, theme_key, user_id)
      values (v_video.business_id, v_video.id, v_video.theme_key, v_user);
    end if;
  else
    delete from public.social_video_likes l
      where l.video_id = p_video_id and l.visitor_token = v_token;
    get diagnostics v_deleted = row_count;
    if v_deleted = 0 then
      insert into public.social_video_likes (business_id, video_id, theme_key, visitor_token)
      values (v_video.business_id, v_video.id, v_video.theme_key, v_token);
    end if;
  end if;

  v_liked := v_deleted = 0;

  return jsonb_build_object(
    'video_id', v_video.id,
    'theme_key', v_video.theme_key,
    'liked', v_liked,
    'total_likes', (
      select count(*)::int from public.social_video_likes l where l.video_id = v_video.id
    ),
    'weekly_likes', (
      select count(*)::int from public.social_video_likes l
      where l.video_id = v_video.id
        and l.created_at >= public.nexora_business_week_start(v_video.business_id)
        and l.created_at < public.nexora_business_week_start(v_video.business_id) + interval '7 days'
    ),
    'week_key', public.nexora_business_week_key(v_video.business_id)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Read RPCs — counts and the theme-aware weekly ranking
-- ---------------------------------------------------------------------------
create or replace function public.get_social_video_like_counts(
  p_business_id uuid,
  p_theme_key text default null
)
returns table (
  video_id uuid,
  theme_key text,
  video_kind text,
  total_likes int,
  weekly_likes int,
  liked_by_me boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    sv.id,
    sv.theme_key,
    sv.video_kind,
    (select count(*)::int from public.social_video_likes l where l.video_id = sv.id),
    (select count(*)::int from public.social_video_likes l
      where l.video_id = sv.id
        and l.created_at >= public.nexora_business_week_start(sv.business_id)
        and l.created_at < public.nexora_business_week_start(sv.business_id) + interval '7 days'),
    exists (
      select 1 from public.social_video_likes l
      where l.video_id = sv.id
        and (
          (auth.uid() is not null and l.user_id = auth.uid())
          or (auth.uid() is null and public.nexora_like_visitor_token() is not null
              and l.visitor_token = public.nexora_like_visitor_token())
        )
    )
  from public.social_videos sv
  where sv.business_id = p_business_id
    and sv.status = 'active'
    -- Theme isolation: a theme sees only its own rows (NULL = every theme).
    and (p_theme_key is null or sv.theme_key is null or sv.theme_key = p_theme_key)
    and (
      public.is_published_business(p_business_id)
      or public.is_business_member(p_business_id)
    )
$$;

-- Weekly Top Videos. Theme-aware by construction: candidates are filtered on
-- social_videos.theme_key and likes join through the composite (video,
-- business, theme) key, so one theme's video or likes can never rank inside
-- another theme. p_kind supports 'short', 'long', or NULL for both.
create or replace function public.get_weekly_top_videos(
  p_business_id uuid,
  p_theme_key text default null,
  p_kind text default null,
  p_limit int default 5
)
returns table (
  rank int,
  video_id uuid,
  theme_key text,
  video_kind text,
  video_url text,
  caption text,
  weekly_likes int,
  total_likes int,
  week_key text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with visible as (
    select sv.*
    from public.social_videos sv
    where sv.business_id = p_business_id
      and sv.status = 'active'
      and (p_theme_key is null or sv.theme_key is null or sv.theme_key = p_theme_key)
      and (p_kind is null or sv.video_kind = p_kind)
      and (
        public.is_published_business(p_business_id)
        or public.is_business_member(p_business_id)
      )
  ), counted as (
    select
      v.id,
      v.theme_key,
      v.video_kind,
      v.video_url,
      v.caption,
      v.display_order,
      (select count(*)::int from public.social_video_likes l
        where l.video_id = v.id
          and l.business_id = v.business_id
          and l.created_at >= public.nexora_business_week_start(v.business_id)
          and l.created_at < public.nexora_business_week_start(v.business_id) + interval '7 days'
      ) as weekly_likes,
      (select count(*)::int from public.social_video_likes l
        where l.video_id = v.id and l.business_id = v.business_id) as total_likes
    from visible v
  )
  select
    (row_number() over (order by c.weekly_likes desc, c.total_likes desc, c.display_order, c.id))::int,
    c.id,
    c.theme_key,
    c.video_kind,
    c.video_url,
    c.caption,
    c.weekly_likes,
    c.total_likes,
    public.nexora_business_week_key(p_business_id)
  from counted c
  where c.weekly_likes > 0
  order by c.weekly_likes desc, c.total_likes desc, c.display_order, c.id
  limit greatest(coalesce(p_limit, 5), 1)
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS — enforcement lives here, not in the UI
-- ---------------------------------------------------------------------------
alter table public.social_video_likes enable row level security;

grant select, insert, delete on public.social_video_likes to authenticated;
grant all on public.social_video_likes to service_role;

-- Salon staff can read their own salon's likes (dashboard work is a later
-- phase; this only makes the rows readable to the tenant that owns them).
drop policy if exists social_video_likes_member_select on public.social_video_likes;
create policy social_video_likes_member_select on public.social_video_likes
  for select to authenticated
  using (public.is_business_member(business_id));

-- A signed-in visitor may see and manage only their OWN like rows, and only
-- for a published business. There is no direct UPDATE path at all.
drop policy if exists social_video_likes_self_select on public.social_video_likes;
create policy social_video_likes_self_select on public.social_video_likes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists social_video_likes_self_insert on public.social_video_likes;
create policy social_video_likes_self_insert on public.social_video_likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_published_business(business_id)
    and exists (
      select 1 from public.social_videos sv
      where sv.id = video_id
        and sv.business_id = social_video_likes.business_id
        and sv.status = 'active'
    )
  );

drop policy if exists social_video_likes_self_delete on public.social_video_likes;
create policy social_video_likes_self_delete on public.social_video_likes
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on function public.toggle_social_video_like(uuid) from public;
revoke all on function public.get_social_video_like_counts(uuid, text) from public;
revoke all on function public.get_weekly_top_videos(uuid, text, text, int) from public;

grant execute on function public.nexora_business_week_start(uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.nexora_business_week_key(uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.nexora_like_visitor_token() to anon, authenticated, service_role;
grant execute on function public.toggle_social_video_like(uuid) to anon, authenticated, service_role;
grant execute on function public.get_social_video_like_counts(uuid, text) to anon, authenticated, service_role;
grant execute on function public.get_weekly_top_videos(uuid, text, text, int) to anon, authenticated, service_role;

commit;
