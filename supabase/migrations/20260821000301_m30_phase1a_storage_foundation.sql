-- M30 / Phase 1A: one private salon-media bucket with tenant-scoped paths.
-- Public website media is read only when a corresponding active salon_media
-- row exists. Identity documents remain in their existing separate private
-- bucket and are not broadened by this migration.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'salon-media',
  'salon-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

create or replace function private.phase1a_storage_salon_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(p_name);
begin
  if array_length(parts, 1) < 2 or parts[1] <> 'salon' then return null; end if;
  begin
    return parts[2]::uuid;
  exception when others then
    return null;
  end;
end
$$;

revoke all on function private.phase1a_storage_salon_id(text)
  from public, anon, authenticated;
grant execute on function private.phase1a_storage_salon_id(text)
  to anon, authenticated, service_role;

-- Public read is metadata-backed; uploading a file alone never publishes it.
drop policy if exists phase1a_salon_media_public_object_read on storage.objects;
create policy phase1a_salon_media_public_object_read
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'salon-media'
  and exists (
    select 1
    from public.salon_media sm
    where sm.storage_bucket = bucket_id
      and sm.storage_path = name
      and sm.status = 'active'
      and sm.salon_id = private.phase1a_storage_salon_id(name)
      and private.is_public_salon(sm.salon_id)
  )
);

-- Owner and assigned staff can manage only their salon UUID prefix. Metadata
-- RLS independently checks the same salon relationship.
drop policy if exists phase1a_salon_media_member_object_insert on storage.objects;
create policy phase1a_salon_media_member_object_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'salon-media'
  and private.has_salon_role(private.phase1a_storage_salon_id(name))
);

drop policy if exists phase1a_salon_media_member_object_select on storage.objects;
create policy phase1a_salon_media_member_object_select
on storage.objects for select to authenticated
using (
  bucket_id = 'salon-media'
  and private.has_salon_role(private.phase1a_storage_salon_id(name))
);

drop policy if exists phase1a_salon_media_member_object_update on storage.objects;
create policy phase1a_salon_media_member_object_update
on storage.objects for update to authenticated
using (
  bucket_id = 'salon-media'
  and private.has_salon_role(private.phase1a_storage_salon_id(name))
)
with check (
  bucket_id = 'salon-media'
  and private.has_salon_role(private.phase1a_storage_salon_id(name))
);

drop policy if exists phase1a_salon_media_member_object_delete on storage.objects;
create policy phase1a_salon_media_member_object_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'salon-media'
  and private.has_salon_role(private.phase1a_storage_salon_id(name))
);

revoke all on storage.objects from anon, authenticated;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

commit;
