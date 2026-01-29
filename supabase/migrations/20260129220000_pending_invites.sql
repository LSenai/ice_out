-- Pending invites: admin invites a validator by email; when they sign in, profile becomes trusted.
-- - pending_invites: email (unique), invited_by (admin user id), created_at
-- - handle_new_user: if new user's email is in pending_invites, set profile role to 'trusted' and delete invite

create table if not exists public.pending_invites (
  email text primary key,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists pending_invites_invited_by_idx on public.pending_invites (invited_by);

alter table public.pending_invites enable row level security;

-- Only admins can manage invites (select for listing, insert for inviting, delete for revoking)
create policy "pending_invites_select_admin"
  on public.pending_invites
  for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "pending_invites_insert_admin"
  on public.pending_invites
  for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "pending_invites_delete_admin"
  on public.pending_invites
  for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Service role can insert/delete (for API and trigger)
create policy "pending_invites_all_service"
  on public.pending_invites
  for all
  to service_role
  using (true)
  with check (true);

-- Update handle_new_user: when a new user is created, if their email is in pending_invites,
-- set their profile role to 'trusted' and remove the invite row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invited boolean;
begin
  insert into public.profiles (id, role)
  values (new.id, 'anonymous');

  select exists (
    select 1 from public.pending_invites
    where lower(trim(email)) = lower(trim(new.email::text))
  ) into v_invited;

  if v_invited then
    update public.profiles
       set role = 'trusted', updated_at = now()
     where id = new.id;
    delete from public.pending_invites
     where lower(trim(email)) = lower(trim(new.email::text));
  end if;

  return new;
end;
$$;
