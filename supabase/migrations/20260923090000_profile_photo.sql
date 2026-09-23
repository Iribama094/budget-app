-- A profile photo that follows the account rather than sitting on one phone.
--
-- The picture itself goes in Supabase Storage, uploaded straight from the app with the person's own session,
-- so image bytes never pass through the API. The profile keeps only the address of it.

alter table public.profiles add column if not exists avatar_url text;

-- Public read, because a photo is shown to the people someone shares a budget or a business with, and a signed
-- url would expire in the middle of a list. Nothing private is in the file name: it is the account id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Everyone may look. Only the owner may write, and only inside a folder named after their own account, so one
-- person cannot replace another's photo.
drop policy if exists "avatars are readable" on storage.objects;
create policy "avatars are readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "own avatar insert" on storage.objects;
create policy "own avatar insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own avatar update" on storage.objects;
create policy "own avatar update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own avatar delete" on storage.objects;
create policy "own avatar delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Same as every other table here: the API reaches these rows with the service key, nothing else does.
do $$
declare t text;
begin
  foreach t in array array['profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
