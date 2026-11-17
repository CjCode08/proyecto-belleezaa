-- Propuesta: revisar y ejecutar manualmente antes de habilitar el nuevo catálogo.
begin;

create function public.catalog_commercial_products(p_search text, p_offset integer, p_audience text, p_category text)
returns table (id uuid, name text, description text, category text, variants jsonb, prices jsonb, bundles jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_search is null or char_length(p_search) > 120 or p_offset is null or p_offset < 0 or p_offset > 1000000
    or p_audience is null or p_audience not in ('', 'hombres', 'mujeres', 'ninos', 'ninas')
    or p_category is null or char_length(p_category) > 120 then
    raise exception 'Parámetros de catálogo inválidos' using errcode = '22023';
  end if;
  return query
    select p.id, p.name, p.description, p.category,
      coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'color', v.color, 'stock', v.stock)
        order by v.size, v.color, v.id) from public.product_variants v where v.product_id = p.id and v.stock > 0), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('payment_category', price.payment_category,
        'unit_price_usd', price.unit_price_usd, 'promotion_price_usd', price.promotion_price_usd,
        'promotion_quantity', price.promotion_quantity, 'promotion_description', price.promotion_description,
        'bundle_price_usd', price.bundle_price_usd) order by price.payment_category)
        from public.inventory_product_prices price where price.product_id = p.id and price.needs_review = false), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'description', b.assortment_description, 'stock', b.stock)
        order by b.id) from public.inventory_bundles b where b.product_id = p.id and b.stock > 0), '[]'::jsonb)
    from public.products p
    where p.status = 'activo' and p.catalog_visible
      and (exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
        or exists (select 1 from public.inventory_bundles b where b.product_id = p.id and b.stock > 0))
      and (p_search = '' or strpos(lower(p.name), lower(p_search)) > 0 or strpos(lower(coalesce(p.category, '')), lower(p_search)) > 0)
      and (p_audience = '' or p_audience = any(p.audiences))
      and (p_category = '' or p.category = p_category)
    order by p.name, p.id limit 25 offset p_offset;
end;
$$;

create or replace function public.catalog_filter_categories()
returns text[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(category order by category), array[]::text[])
  from (select distinct p.category from public.products p
    where p.status = 'activo' and p.catalog_visible and p.category is not null and btrim(p.category) <> ''
      and (exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
        or exists (select 1 from public.inventory_bundles b where b.product_id = p.id and b.stock > 0))) categories;
$$;

create or replace function public.catalog_can_read_image(p_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.product_images i join public.products p on p.id = i.product_id
    where i.image_type = 'catalogo' and i.image_url = p_path and p.status = 'activo' and p.catalog_visible
      and (exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
        or exists (select 1 from public.inventory_bundles b where b.product_id = p.id and b.stock > 0)));
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
    where i.product_id = any(p_product_ids) and i.image_type = 'catalogo' and p.status = 'activo' and p.catalog_visible
      and (exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
        or exists (select 1 from public.inventory_bundles b where b.product_id = p.id and b.stock > 0))
    order by i.product_id, i.is_primary desc nulls last, i.display_order asc nulls last, i.id;
end;
$$;

revoke all on function public.catalog_commercial_products(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.catalog_commercial_products(text, integer, text, text) to anon, authenticated;
commit;