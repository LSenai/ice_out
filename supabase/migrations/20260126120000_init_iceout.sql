-- ICE OUT v1 schema
-- Notes:
-- - Uses anonymous reads/inserts via RLS
-- - Maintains validations_count + status promotion via triggers

create extension if not exists pgcrypto;

-- Sightings
create table if not exists public.sightings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_time timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  activity_type text not null,
  notes text,
  media jsonb not null default '[]'::jsonb,
  status text not null default 'unverified',
  validations_count integer not null default 0,
  constraint sightings_status_chk check (status in ('unverified', 'verified')),
  constraint sightings_lat_chk check (lat >= -90 and lat <= 90),
  constraint sightings_lng_chk check (lng >= -180 and lng <= 180),
  constraint sightings_activity_type_len_chk check (char_length(activity_type) between 1 and 64),
  constraint sightings_notes_len_chk check (notes is null or char_length(notes) <= 2000)
);

create index if not exists sightings_event_time_idx on public.sightings (event_time desc);
create index if not exists sightings_status_idx on public.sightings (status);

-- Validations
create table if not exists public.validations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sighting_id uuid not null references public.sightings(id) on delete cascade,
  validator_hash text not null,
  -- Optional, privacy-preserving location: store rounded coordinates if used at all
  validator_lat double precision,
  validator_lng double precision,
  constraint validations_validator_hash_len_chk check (char_length(validator_hash) between 16 and 256)
);

create unique index if not exists validations_unique_validator_per_sighting
  on public.validations (sighting_id, validator_hash);
create index if not exists validations_sighting_id_idx on public.validations (sighting_id);

-- Trigger to recompute validations_count + status
create or replace function public.recompute_sighting_validations()
returns trigger
language plpgsql
security definer
as $$
declare
  v_sighting_id uuid;
  v_count integer;
begin
  v_sighting_id := coalesce(new.sighting_id, old.sighting_id);

  select count(*)::int
    into v_count
    from public.validations
   where sighting_id = v_sighting_id;

  update public.sightings
     set validations_count = v_count,
         status = case when v_count >= 3 then 'verified' else 'unverified' end
   where id = v_sighting_id;

  return null;
end;
$$;

drop trigger if exists validations_after_insert_recompute on public.validations;
create trigger validations_after_insert_recompute
after insert on public.validations
for each row execute function public.recompute_sighting_validations();

drop trigger if exists validations_after_delete_recompute on public.validations;
create trigger validations_after_delete_recompute
after delete on public.validations
for each row execute function public.recompute_sighting_validations();

-- Enable RLS
alter table public.sightings enable row level security;
alter table public.validations enable row level security;

-- Policies
drop policy if exists "sightings_read_anon" on public.sightings;
create policy "sightings_read_anon"
  on public.sightings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "sightings_insert_anon" on public.sightings;
create policy "sightings_insert_anon"
  on public.sightings
  for insert
  to anon, authenticated
  with check (
    lat between -90 and 90
    and lng between -180 and 180
    and char_length(activity_type) between 1 and 64
    and (notes is null or char_length(notes) <= 2000)
    and jsonb_typeof(media) = 'array'
  );

drop policy if exists "validations_read_anon" on public.validations;
create policy "validations_read_anon"
  on public.validations
  for select
  to anon, authenticated
  using (true);

drop policy if exists "validations_insert_anon" on public.validations;
create policy "validations_insert_anon"
  on public.validations
  for insert
  to anon, authenticated
  with check (
    validator_hash is not null
    and char_length(validator_hash) between 16 and 256
  );

