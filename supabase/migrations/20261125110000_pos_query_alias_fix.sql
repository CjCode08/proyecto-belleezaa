begin;

create or replace function public.pos_list_orders(p_completed boolean, p_search text, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.pos_require_staff();
  if p_completed is null or p_search is null or length(p_search) > 120 or p_offset is null or p_offset not between 0 and 1000000 then
    raise exception 'Filtro invalido' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(order_row)) from (
    select o.id, o.customer_name, o.customer_id, p.full_name as advisor_name,
      o.status, o.expires_at, o.created_at, o.total_usd, o.total_ves
    from public.seller_orders o join public.profiles p on p.id = o.seller_id
    where o.status = case when p_completed then 'completada' else 'en_proceso' end
      and (p_search = '' or strpos(lower(coalesce(o.customer_name, '')), lower(p_search)) > 0
        or strpos(coalesce(o.customer_id, ''), p_search) > 0 or strpos(o.id::text, lower(p_search)) > 0)
    order by o.created_at desc, o.id limit 25 offset p_offset
  ) order_row), '[]'::jsonb);
end;
$$;

create or replace function public.pos_catalog_products(p_search text, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.pos_require_staff();
  if p_search is null or length(p_search) > 120 or p_offset is null or p_offset not between 0 and 1000000 then
    raise exception 'Busqueda invalida' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(product_row)) from (
    select p.id, p.name, p.description, p.category,
      coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'color', v.color, 'stock', v.stock, 'sku', v.sku)
        order by v.size, v.color, v.id) from public.product_variants v where v.product_id = p.id and v.stock > 0), '[]'::jsonb) as variants,
      coalesce((select jsonb_agg(to_jsonb(price) - 'product_id' - 'needs_review')
        from public.inventory_product_prices price where price.product_id = p.id and price.needs_review = false), '[]'::jsonb) as prices,
      coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'description', b.assortment_description, 'stock', b.stock))
        from public.inventory_bundles b where b.product_id = p.id and b.stock > 0), '[]'::jsonb) as bundles
    from public.products p where p.status = 'activo'
      and (exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
        or exists (select 1 from public.inventory_bundles b where b.product_id = p.id and b.stock > 0))
      and (p_search = '' or strpos(lower(p.name), lower(p_search)) > 0 or strpos(lower(coalesce(p.category, '')), lower(p_search)) > 0
        or exists (select 1 from public.product_variants v where v.product_id = p.id and strpos(lower(coalesce(v.sku, '')), lower(p_search)) > 0))
    order by p.name, p.id limit 25 offset p_offset
  ) product_row), '[]'::jsonb);
end;
$$;

revoke all on function public.pos_list_orders(boolean,text,integer), public.pos_catalog_products(text,integer) from public,anon,authenticated;
grant execute on function public.pos_list_orders(boolean,text,integer), public.pos_catalog_products(text,integer) to authenticated;

commit;