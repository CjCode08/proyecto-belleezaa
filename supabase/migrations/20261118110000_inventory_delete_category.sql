begin;

create function public.inventory_delete_category(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_category_name text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id and p.is_active is true;

  if v_role is distinct from 'admin' then
    raise exception 'Solo el administrador puede eliminar categorías' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Nombre de categoría inválido' using errcode = '22023';
  end if;

  select c.name into v_category_name
  from public.inventory_categories c
  where lower(btrim(c.name)) = lower(btrim(p_name))
  for update;

  if v_category_name is null then
    raise exception 'La categoría ya no existe' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.products p
    where lower(btrim(coalesce(p.category, ''))) = lower(btrim(v_category_name))
  ) then
    raise exception 'No se puede eliminar una categoría asignada a productos' using errcode = '23503';
  end if;

  delete from public.inventory_categories c
  where lower(btrim(c.name)) = lower(btrim(v_category_name));

  insert into public.inventory_movements (user_id, action_type, comment, product_snapshot)
  values (v_user_id, 'ELIMINACION', 'Categoría eliminada: ' || v_category_name, 'Categoría: ' || v_category_name);
end;
$$;

revoke all on function public.inventory_delete_category(text) from public, anon, authenticated;
grant execute on function public.inventory_delete_category(text) to authenticated;

commit;