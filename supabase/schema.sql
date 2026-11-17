create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.acolytes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  photo_url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.masses (
  id uuid primary key default gen_random_uuid(),
  mass_date date not null unique,
  mass_time text not null default '18:00',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  mass_id uuid not null references public.masses(id) on delete cascade,
  acolyte_id uuid references public.acolytes(id) on delete set null,
  acolyte_name text not null default '',
  role text not null,
  created_at timestamptz not null default now()
);

alter table public.assignments add column if not exists acolyte_name text not null default '';
alter table public.assignments drop constraint if exists assignments_mass_id_role_key;

create or replace function public.is_parish_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

alter table public.admin_users enable row level security;
alter table public.acolytes enable row level security;
alter table public.masses enable row level security;
alter table public.assignments enable row level security;

create policy "Admins can read their own access" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Public can read acolytes" on public.acolytes
  for select to anon, authenticated using (true);
create policy "Admins can manage acolytes" on public.acolytes
  for all to authenticated using ((select public.is_parish_admin()))
  with check ((select public.is_parish_admin()));
create policy "Public can read masses" on public.masses
  for select to anon, authenticated using (true);
create policy "Admins can manage masses" on public.masses
  for all to authenticated using ((select public.is_parish_admin()))
  with check ((select public.is_parish_admin()));
create policy "Public can read assignments" on public.assignments
  for select to anon, authenticated using (true);
create policy "Admins can manage assignments" on public.assignments
  for all to authenticated using ((select public.is_parish_admin()))
  with check ((select public.is_parish_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Public can view profile photos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'profile-photos');
create policy "Admins can upload profile photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'profile-photos' and (select public.is_parish_admin())
  );
create policy "Admins can update profile photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'profile-photos' and (select public.is_parish_admin())
  ) with check (bucket_id = 'profile-photos' and (select public.is_parish_admin()));
create policy "Admins can delete profile photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'profile-photos' and (select public.is_parish_admin())
  );
