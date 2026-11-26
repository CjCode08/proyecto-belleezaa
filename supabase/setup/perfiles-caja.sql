-- Ejecutar solo despues de crear caja01 a caja03 en Supabase Auth.
-- Busca los UID por el correo interno; no es necesario copiarlos a este archivo.
-- Si falta alguna cuenta o ya existe un perfil, aborta sin insertar parcialmente.
do $$
declare
  cashier_usernames text[] := array['caja01', 'caja02', 'caja03'];
  missing_usernames text[];
begin
  select array_agg(cashier.username order by cashier.username)
  into missing_usernames
  from unnest(cashier_usernames) as cashier(username)
  where not exists (
    select 1
    from auth.users as auth_user
    where auth_user.email = encode(convert_to(cashier.username, 'UTF8'), 'hex') || '@belleza.invalid'
  );

  if missing_usernames is not null then
    raise exception 'Faltan cuentas de Auth para: %', array_to_string(missing_usernames, ', ');
  end if;

  if exists (
    select 1
    from unnest(cashier_usernames) as cashier(username)
    join auth.users as auth_user
      on auth_user.email = encode(convert_to(cashier.username, 'UTF8'), 'hex') || '@belleza.invalid'
    join public.profiles as profile
      on profile.id = auth_user.id or lower(profile.username) = lower(cashier.username)
  ) then
    raise exception 'Ya existe un perfil para una de estas cuentas o usernames; no se insertaron perfiles.';
  end if;

  insert into public.profiles (id, full_name, role, is_active, username)
  select
    auth_user.id,
    'Caja ' || right(cashier.username, 2),
    'cajero',
    true,
    cashier.username
  from unnest(cashier_usernames) as cashier(username)
  join auth.users as auth_user
    on auth_user.email = encode(convert_to(cashier.username, 'UTF8'), 'hex') || '@belleza.invalid';
end;
$$;