-- Bucket for report media (photos/video). Public so URLs work without signed links.
insert into storage.buckets (id, name, public)
values ('sightings-media', 'sightings-media', true)
on conflict (id) do update set public = true;

-- Allow anyone (anon + authenticated) to upload to this bucket,
-- but only with allowed image/video extensions.
create policy "sightings_media_insert"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'sightings-media'
  and lower(storage.extension(name)) in (
    'jpg', 'jpeg', 'png', 'gif', 'webp',
    'mp4', 'mov', 'webm', 'avi', 'quicktime'
  )
);

-- Allow public read so the app can show images/videos via public URLs.
create policy "sightings_media_select"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'sightings-media');