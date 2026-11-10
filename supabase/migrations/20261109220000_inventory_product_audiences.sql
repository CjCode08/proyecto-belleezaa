-- Ejecutar manualmente en Supabase antes de activar el formulario actualizado.
-- Conserva los productos existentes sin clasificación y las funciones anteriores.
begin;

alter table public.products
  add column audiences text[] not null default array[]::text[],
  add constraint products_audiences_valid check (
    array_position(audiences, null) is null
    and audiences <@ array['hombres', 'mujeres', 'ninos', 'ninas']::text[]
    and cardinality(audiences) <= 4
  );

create table public.inventory_categories (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) between 1 and 120)
);
create unique index inventory_categories_name_unique
  on public.inventory_categories (lower(btrim(name)));
alter table public.inventory_categories enable row level security;
revoke all on public.inventory_categories from public, anon, authenticated;

insert into public.inventory_categories (name)
select distinct on (lower(btrim(category))) btrim(category)
from public.products
where category is not null and length(btrim(category)) between 1 and 120
order by lower(btrim(category)), btrim(category);

create function public.inventory_list_categories()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active is true and role in ('admin', 'personal')
  ) then
    raise exception 'Sin permiso para consultar categorías' using errcode = '42501';
  end if;
  return (
    select coalesce(array_agg(name order by name), array[]::text[])
    from public.inventory_categories
  );
end;
$$;

create function public.inventory_create_product_v3(
  p_product_id uuid, p_name text, p_description text, p_category text,
  p_unit_price numeric, p_promo_price numeric, p_wholesale_price numeric,
  p_variants jsonb, p_image_paths text[], p_comment text, p_audiences text[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_audiences is null or cardinality(p_audiences) not between 1 and 4
    or array_position(p_audiences, null) is not null
    or not (p_audiences <@ array['hombres', 'mujeres', 'ninos', 'ninas']::text[])
    or (select count(distinct value) from unnest(p_audiences) as item(value)) <> cardinality(p_audiences) then
    raise exception 'Clasificación de prenda inválida' using errcode = '22023';
  end if;

  perform public.inventory_create_product_v2(
    p_product_id, p_name, p_description, p_category, p_unit_price, p_promo_price,
    p_wholesale_price, p_variants, p_image_paths, p_comment
  );
  if nullif(btrim(p_category), '') is not null then
    insert into public.inventory_categories (name) values (btrim(p_category))
    on conflict do nothing;
  end if;
  update public.products set audiences = p_audiences where id = p_product_id;
  return p_product_id;
end;
$$;

create function public.inventory_update_product_v2(
  p_product_id uuid, p_name text, p_description text, p_category text,
  p_unit_price numeric, p_promo_price numeric, p_wholesale_price numeric,
  p_variants jsonb, p_add_image_paths text[], p_remove_image_ids uuid[],
  p_comment text, p_audiences text[]
) returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_audiences text[];
  v_removed_paths text[];
begin
  if p_audiences is null or cardinality(p_audiences) > 4
    or array_position(p_audiences, null) is not null
    or not (p_audiences <@ array['hombres', 'mujeres', 'ninos', 'ninas']::text[])
    or (select count(distinct value) from unnest(p_audiences) as item(value)) <> cardinality(p_audiences) then
    raise exception 'Clasificación de prenda inválida' using errcode = '22023';
  end if;

  select audiences into v_old_audiences
  from public.products where id = p_product_id for update;
  v_removed_paths := public.inventory_update_product(
    p_product_id, p_name, p_description, p_category, p_unit_price, p_promo_price,
    p_wholesale_price, p_variants, p_add_image_paths, p_remove_image_ids, p_comment
  );
  if nullif(btrim(p_category), '') is not null then
    insert into public.inventory_categories (name) values (btrim(p_category))
    on conflict do nothing;
  end if;
  if v_old_audiences is distinct from p_audiences then
    update public.products set audiences = p_audiences where id = p_product_id;
    insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
    values (
      p_product_id, auth.uid(), 'MODIFICACION',
      btrim(p_comment) || ' | Clasificación: ' ||
        coalesce(nullif(array_to_string(v_old_audiences, ', '), ''), 'sin clasificar') ||
        ' → ' || coalesce(nullif(array_to_string(p_audiences, ', '), ''), 'sin clasificar'),
      btrim(p_name)
    );
  end if;
  return v_removed_paths;
end;
$$;

revoke all on function public.inventory_list_categories() from public, anon;
revoke all on function public.inventory_create_product_v3(uuid, text, text, text, numeric, numeric, numeric, jsonb, text[], text, text[]) from public, anon;
revoke all on function public.inventory_update_product_v2(uuid, text, text, text, numeric, numeric, numeric, jsonb, text[], uuid[], text, text[]) from public, anon;
grant execute on function public.inventory_list_categories() to authenticated;
grant execute on function public.inventory_create_product_v3(uuid, text, text, text, numeric, numeric, numeric, jsonb, text[], text, text[]) to authenticated;
grant execute on function public.inventory_update_product_v2(uuid, text, text, text, numeric, numeric, numeric, jsonb, text[], uuid[], text, text[]) to authenticated;

commit;
