-- PROPUESTA: ejecutar solo después de validar y coordinar la migración comercial.
-- Conserva el permiso de catálogo de productos existentes; los nuevos empiezan ocultos.
begin;

alter table public.products add column catalog_visible boolean not null default true;
alter table public.products alter column catalog_visible set default false;

create function public.inventory_set_catalog_visibility(p_product_id uuid, p_visible boolean, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.products%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and is_active is true and role = 'admin'
  ) then raise exception 'Solo el administrador puede cambiar la visibilidad' using errcode = '42501'; end if;
  if p_product_id is null or p_visible is null or p_comment is null
    or length(btrim(p_comment)) not between 1 and 1000 then
    raise exception 'Producto, visibilidad o comentario inválido' using errcode = '22023';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
  if v_product.catalog_visible = p_visible then
    raise exception 'El producto ya tiene esa visibilidad' using errcode = '22023';
  end if;
  update public.products set catalog_visible = p_visible where id = p_product_id;
  insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
  values (p_product_id, v_user_id, 'MODIFICACION',
    btrim(p_comment) || case when p_visible then ' | Catálogo: habilitado' else ' | Catálogo: oculto' end,
    v_product.name);
end;
$$;
revoke all on function public.inventory_set_catalog_visibility(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.inventory_set_catalog_visibility(uuid, boolean, text) to authenticated;

create or replace function public.catalog_list_products(p_search text default '', p_offset integer default 0)
returns table (id uuid, name text, description text, category text, unit_price numeric,
  promo_price numeric, wholesale_price numeric, variants jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_search is null or char_length(p_search) > 120 or p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Parámetros de catálogo inválidos' using errcode = '22023';
  end if;
  return query
    select p.id, p.name, p.description, p.category, p.unit_price, p.promo_price, p.wholesale_price,
      (select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'color', v.color, 'stock', v.stock)
        order by v.size, v.color, v.id)
       from public.product_variants v where v.product_id = p.id and v.stock > 0)
    from public.products p
    where p.status = 'activo' and p.catalog_visible
      and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
      and (p_search = '' or strpos(lower(p.name), lower(p_search)) > 0
        or strpos(lower(coalesce(p.category, '')), lower(p_search)) > 0)
    order by p.name, p.id limit 25 offset p_offset;
end;
$$;

create or replace function public.catalog_filter_categories()
returns text[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(category order by category), array[]::text[])
  from (
    select distinct p.category from public.products p
    where p.status = 'activo' and p.catalog_visible
      and p.category is not null and btrim(p.category) <> ''
      and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
  ) categories;
$$;

create or replace function public.catalog_filtered_products(p_search text, p_offset integer, p_audience text, p_category text)
returns table (id uuid, name text, description text, category text, unit_price numeric,
  promo_price numeric, wholesale_price numeric, variants jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_search is null or char_length(p_search) > 120 or p_offset is null
    or p_offset < 0 or p_offset > 1000000 or p_audience is null
    or p_audience not in ('', 'hombres', 'mujeres', 'ninos', 'ninas')
    or p_category is null or char_length(p_category) > 120 then
    raise exception 'Parámetros de catálogo inválidos' using errcode = '22023';
  end if;
  return query
    select p.id, p.name, p.description, p.category, p.unit_price, p.promo_price, p.wholesale_price,
      (select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'color', v.color, 'stock', v.stock)
        order by v.size, v.color, v.id)
       from public.product_variants v where v.product_id = p.id and v.stock > 0)
    from public.products p
    where p.status = 'activo' and p.catalog_visible
      and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
      and (p_search = '' or strpos(lower(p.name), lower(p_search)) > 0
        or strpos(lower(coalesce(p.category, '')), lower(p_search)) > 0)
      and (p_audience = '' or p_audience = any(p.audiences))
      and (p_category = '' or p.category = p_category)
    order by p.name, p.id limit 25 offset p_offset;
end;
$$;

create or replace function public.catalog_can_read_image(p_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.product_images i join public.products p on p.id = i.product_id
    where i.image_type = 'catalogo' and i.image_url = p_path and p.status = 'activo' and p.catalog_visible
      and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
  );
$$;

create or replace function public.catalog_product_images(p_product_ids uuid[])
returns table (product_id uuid, image_url text, display_order integer, is_primary boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_product_ids is null or cardinality(p_product_ids) > 24 then
    raise exception 'Lista de productos inválida' using errcode = '22023';
  end if;
  return query select i.product_id, i.image_url, i.display_order, i.is_primary
    from public.product_images i join public.products p on p.id = i.product_id
    where i.product_id = any(p_product_ids) and i.image_type = 'catalogo'
      and p.status = 'activo' and p.catalog_visible
      and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
    order by i.product_id, i.is_primary desc nulls last, i.display_order asc nulls last, i.id;
end;
$$;

revoke all on function public.catalog_list_products(text, integer), public.catalog_filter_categories(),
  public.catalog_filtered_products(text, integer, text, text), public.catalog_can_read_image(text),
  public.catalog_product_images(uuid[]) from public, anon, authenticated;
grant execute on function public.catalog_list_products(text, integer), public.catalog_filter_categories(),
  public.catalog_filtered_products(text, integer, text, text), public.catalog_can_read_image(text),
  public.catalog_product_images(uuid[]) to anon, authenticated;

-- Solo afecta nuevas líneas de solicitudes de prueba, no los reintentos ya guardados.
create function public.checkout_test_require_catalog_visibility()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.orders o where o.id = new.order_id and o.checkout_is_test is true)
    and not exists (
      select 1 from public.product_variants v join public.products p on p.id = v.product_id
      where v.id = new.variant_id and p.catalog_visible is true and p.status = 'activo'
    ) then
    raise exception 'Una variante no está disponible en el catálogo' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
revoke all on function public.checkout_test_require_catalog_visibility() from public, anon, authenticated;
create trigger checkout_test_require_catalog_visibility
before insert on public.order_items
for each row execute function public.checkout_test_require_catalog_visibility();

commit;
