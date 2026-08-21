-- M13 (DRAFT): Supabase Storage buckets and tenant-scoped object policies
-- Object names omit the bucket prefix and start with business_id/user_id.
-- No video bucket: social videos remain external URL references.
-- NOT applied to any database. M02 must be finalized first.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('business-media', 'business-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;

-- Published public media only. A malformed/unscoped path never casts to uuid.
drop policy if exists nexora_public_business_media_read on storage.objects;
create policy nexora_public_business_media_read
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'business-media'
  and (storage.foldername(name))[2] = any(array['logo', 'hero', 'gallery', 'owners', 'staff'])
  and public.is_published_business(case
    when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    then ((storage.foldername(name))[1])::uuid
    else null
  end)
);

-- Members can manage only paths whose first segment is their business UUID.
drop policy if exists nexora_members_manage_business_media on storage.objects;
create policy nexora_members_manage_business_media
on storage.objects for all to authenticated
using (
  bucket_id = 'business-media'
  and public.is_business_member(case
    when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    then ((storage.foldername(name))[1])::uuid
    else null
  end)
)
with check (
  bucket_id = 'business-media'
  and public.is_business_member(case
    when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    then ((storage.foldername(name))[1])::uuid
    else null
  end)
);

-- Avatar objects are private to the authenticated user's UUID prefix.
drop policy if exists nexora_users_manage_avatars on storage.objects;
create policy nexora_users_manage_avatars
on storage.objects for all to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
