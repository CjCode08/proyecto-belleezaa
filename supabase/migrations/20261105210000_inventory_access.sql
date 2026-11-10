-- Primera etapa: identidad del personal y almacenamiento privado.
-- Ejecutar una sola vez en el editor SQL de Supabase, tras revisar este archivo.
-- No crea cuentas ni habilita operaciones de escritura sobre el inventario.
begin;

alter table public.profiles
  add column username text;

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$');

create unique index profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles enable row level security;

grant select on public.profiles to authenticated;

create policy "inventory_read_own_active_profile"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) and is_active is true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventario-privado',
  'inventario-privado',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

commit;
