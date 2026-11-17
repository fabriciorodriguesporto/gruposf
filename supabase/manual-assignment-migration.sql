alter table public.assignments
  add column if not exists acolyte_name text not null default '';

alter table public.assignments
  drop constraint if exists assignments_mass_id_role_key;
