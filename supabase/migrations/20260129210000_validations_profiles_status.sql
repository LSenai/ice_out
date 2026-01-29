-- Validation tiers + profiles + trusted verifiers
-- - Validations: device_fingerprint, is_within_range, validator_id; unique on (sighting_id, device_fingerprint)
-- - Sightings status: unverified | verified | active | confirmed; Tier 2 = media lowers threshold to 2
-- - Profiles: id, role (anonymous | trusted | admin); RLS; trigger on auth.users
-- - Only trusted/admin can UPDATE sighting status (e.g. to confirmed)

-- 1. Validations: add columns, relax validator_hash, deprecate lat/lng
alter table public.validations
  add column if not exists validator_id uuid references auth.users(id) on delete set null,
  add column if not exists device_fingerprint text,
  add column if not exists is_within_range boolean not null default true;

alter table public.validations
  alter column validator_hash drop not null;

-- Deprecate validator_lat/lng (keep columns for existing rows, new inserts omit them)
-- No schema change needed; policy will stop accepting them if we want, or just stop sending from client

-- Constraint: device_fingerprint length when present (for new inserts)
alter table public.validations
  drop constraint if exists validations_device_fingerprint_len_chk;
alter table public.validations
  add constraint validations_device_fingerprint_len_chk
  check (device_fingerprint is null or (char_length(device_fingerprint) >= 16 and char_length(device_fingerprint) <= 256));

-- Replace unique index: one vote per device per sighting
drop index if exists public.validations_unique_validator_per_sighting;
create unique index validations_unique_device_per_sighting
  on public.validations (sighting_id, device_fingerprint)
  where device_fingerprint is not null;

-- Legacy: one vote per validator_hash per sighting (for existing rows)
create unique index if not exists validations_unique_hash_per_sighting
  on public.validations (sighting_id, validator_hash)
  where validator_hash is not null;

-- 2. Sightings: extend status to unverified | verified | active | confirmed
alter table public.sightings
  drop constraint if exists sightings_status_chk;
alter table public.sightings
  add constraint sightings_status_chk
  check (status in ('unverified', 'verified', 'active', 'confirmed'));

-- 3. Trigger: recompute validations_count + status (Tier 2: media lowers threshold to 2; never set confirmed)
create or replace function public.recompute_sighting_validations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sighting_id uuid;
  v_count integer;
  v_media_len integer;
  v_current_status text;
begin
  v_sighting_id := coalesce(new.sighting_id, old.sighting_id);

  select s.status into v_current_status
    from public.sightings s
   where s.id = v_sighting_id;

  -- Only auto-promote to verified/active; never overwrite confirmed
  if v_current_status = 'confirmed' then
    return null;
  end if;

  select count(*)::int
    into v_count
    from public.validations
   where sighting_id = v_sighting_id;

  select jsonb_array_length(media)::int
    into v_media_len
    from public.sightings
   where id = v_sighting_id;

  update public.sightings
     set validations_count = v_count,
         status = case
           when v_count >= 3 then 'verified'
           when (v_media_len > 0 and v_count >= 2) then 'verified'
           else 'unverified'
         end
   where id = v_sighting_id and status != 'confirmed';

  return null;
end;
$$;

-- 4. Validations insert policy: require device_fingerprint for new inserts (anon or authenticated)
drop policy if exists "validations_insert_anon" on public.validations;
create policy "validations_insert_anon"
  on public.validations
  for insert
  to anon, authenticated
  with check (
    device_fingerprint is not null
    and char_length(device_fingerprint) between 16 and 256
  );

-- 5. Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'anonymous',
  updated_at timestamptz not null default now(),
  constraint profiles_role_chk check (role in ('anonymous', 'trusted', 'admin'))
);

create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;

-- Profiles: user can read own row; admin can read all (for admin UI)
create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Profiles: only admin can update any profile (role changes)
create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Profiles: insert from service or trigger (auth.users insert)
-- Supabase allows trigger on auth.users to insert into public.profiles
create policy "profiles_insert_authenticated"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Allow service role to insert (for trigger)
create policy "profiles_insert_service"
  on public.profiles
  for insert
  to service_role
  with check (true);

-- 6. Trigger: create profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'anonymous')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7. Sightings: allow trusted/admin to update status (e.g. to confirmed)
create policy "sightings_update_trusted"
  on public.sightings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('trusted', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('trusted', 'admin')
    )
  );

-- 8. RPC for admin to list profiles with email (admin-only)
create or replace function public.get_profiles_for_admin()
returns table (id uuid, email text, role text)
language sql
security definer
set search_path = public
as $$
  select p.id, u.email::text, p.role
  from public.profiles p
  join auth.users u on u.id = p.id
  where exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin');
$$;

-- 9. Bootstrap first admin: run manually in SQL or Dashboard, e.g.:
--    insert into public.profiles (id, role) values ('<auth.users.id>', 'admin') on conflict (id) do update set role = 'admin';
