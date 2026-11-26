-- Ejecutar solo despues de crear vendedor02 a vendedor11 en Supabase Auth.
-- Busca los UID por el correo interno; no es necesario copiarlos a este archivo.
-- Si falta alguna cuenta o ya existe un perfil, aborta sin insertar parcialmente.
do $$
declare
  seller_usernames text[] := array[
    'vendedor02', 'vendedor03', 'vendedor04', 'vendedor05', 'vendedor06',
    'vendedor07', 'vendedor08', 'vendedor09', 'vendedor10', 'vendedor11'
  ];
  missing_usernames text[];
begin
  select array_agg(seller.username order by seller.username)
  into missing_usernames
  from unnest(seller_usernames) as seller(username)
  where not exists (
    select 1
    from auth.users as auth_user
    where auth_user.email = encode(convert_to(seller.username, 'UTF8'), 'hex') || '@belleza.invalid'
  );

  if missing_usernames is not null then
    raise exception 'Faltan cuentas de Auth para: %', array_to_string(missing_usernames, ', ');
  end if;

  if exists (
    select 1
    from unnest(seller_usernames) as seller(username)
    join auth.users as auth_user
      on auth_user.email = encode(convert_to(seller.username, 'UTF8'), 'hex') || '@belleza.invalid'
    join public.profiles as profile
      on profile.id = auth_user.id or lower(profile.username) = lower(seller.username)
  ) then
    raise exception 'Ya existe un perfil para una de estas cuentas o usernames; no se insertaron perfiles.';
  end if;

  insert into public.profiles (id, full_name, role, is_active, username)
  select
    auth_user.id,
    'Vendedor ' || right(seller.username, 2),
    'vendedor',
    true,
    seller.username
  from unnest(seller_usernames) as seller(username)
  join auth.users as auth_user
    on auth_user.email = encode(convert_to(seller.username, 'UTF8'), 'hex') || '@belleza.invalid';
end;
$$;