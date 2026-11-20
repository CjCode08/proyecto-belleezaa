begin;

create function public.sellers_catalog_products(p_search text, p_offset integer)
returns table (id uuid, name text, description text, category text, variants jsonb, prices jsonb, bundles jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles staff
    where staff.id = (select auth.uid()) and staff.role = 'vendedor' and staff.is_active is true) then
    raise exception 'Acceso de vendedor requerido' using errcode = '42501';
  end if;

  if p_search is null or char_length(p_search) > 120 or p_offset is null or p_offset not between 0 and 1000000 then
    raise exception 'Parametros de busqueda invalidos' using errcode = '22023';
  end if;

  return query
    select p.id, p.name, p.description, p.category,
      coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'color', v.color,
        'stock', v.stock, 'sku', v.sku) order by v.size, v.color, v.id)
        from public.product_variants v where v.product_id = p.id and v.stock > 0), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('payment_category', price.payment_category,
        'unit_price_usd', price.unit_price_usd, 'promotion_price_usd', price.promotion_price_usd,
        'promotion_quantity', price.promotion_quantity, 'promotion_description', price.promotion_description,
        'bundle_price_usd', price.bundle_price_usd) order by price.payment_category)
        from public.inventory_product_prices price where price.product_id = p.id and price.needs_review = false), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'description', b.assortment_description, 'stock', b.stock)
        order by b.id) from public.inventory_bundles b where b.product_id = p.id and b.stock > 0), '[]'::jsonb)
    from public.products p
    where p.status = 'activo'
      and (exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
        or exists (select 1 from public.inventory_bundles b where b.product_id = p.id and b.stock > 0))
      and (p_search = '' or strpos(lower(p.name), lower(p_search)) > 0
        or strpos(lower(coalesce(p.category, '')), lower(p_search)) > 0
        or exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0
          and strpos(lower(coalesce(v.sku, '')), lower(p_search)) > 0))
    order by p.name, p.id limit 25 offset p_offset;
end;
$$;

revoke all on function public.sellers_catalog_products(text, integer) from public, anon, authenticated;
grant execute on function public.sellers_catalog_products(text, integer) to authenticated;

commit;