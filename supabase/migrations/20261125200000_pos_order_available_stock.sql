create function public.pos_order_availability(p_order uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  perform public.pos_require_staff();
  if p_order is null or not exists (select 1 from public.seller_orders o where o.id = p_order) then
    raise exception 'Orden no encontrada' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', availability.kind,
    'id', availability.presentation_id,
    'max_quantity', availability.max_quantity
  ) order by availability.kind, availability.presentation_id), '[]'::jsonb)
  into v_result
  from (
    select i.kind,
      coalesce(i.variant_id, i.bundle_id) as presentation_id,
      greatest(case when i.kind = 'variant' then v.stock else b.stock end - coalesce((
        select sum(other_item.quantity)
        from public.seller_order_items other_item
        join public.seller_orders other_order on other_order.id = other_item.order_id
        where other_order.id <> p_order
          and other_order.status = 'en_proceso'
          and other_order.expires_at > clock_timestamp()
          and ((i.kind = 'variant' and other_item.variant_id = i.variant_id)
            or (i.kind = 'bundle' and other_item.bundle_id = i.bundle_id))
      ), 0), 0)::integer as max_quantity
    from public.seller_order_items i
    left join public.product_variants v on i.kind = 'variant' and v.id = i.variant_id
    left join public.inventory_bundles b on i.kind = 'bundle' and b.id = i.bundle_id
    where i.order_id = p_order
  ) availability;

  return v_result;
end;
$$;

create function public.pos_catalog_products_for_order(p_order uuid, p_search text, p_offset integer)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text;
  v_expires_at timestamptz;
begin
  perform public.pos_require_staff();
  if p_order is null or p_search is null or length(p_search) > 120 or p_offset is null or p_offset not between 0 and 1000000 then
    raise exception 'Busqueda invalida' using errcode = '22023';
  end if;
  select o.status, o.expires_at into v_status, v_expires_at
  from public.seller_orders o where o.id = p_order;
  if not found then raise exception 'Orden no encontrada' using errcode = 'P0002'; end if;
  if v_status <> 'en_proceso' or v_expires_at <= clock_timestamp() then
    raise exception 'La reserva vencio; revisa la orden antes de buscar prendas' using errcode = 'P0002';
  end if;

  return coalesce((select jsonb_agg(to_jsonb(product_row)) from (
    select p.id, p.name, p.description, p.category,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'size', v.size, 'color', v.color,
        'stock', greatest(v.stock - coalesce((
          select sum(i.quantity) from public.seller_order_items i
          join public.seller_orders o on o.id = i.order_id
          where i.variant_id = v.id and o.id <> p_order and o.status = 'en_proceso' and o.expires_at > clock_timestamp()
        ), 0), 0), 'sku', v.sku
      ) order by v.size, v.color, v.id)
        from public.product_variants v where v.product_id = p.id and v.stock > coalesce((
          select sum(i.quantity) from public.seller_order_items i
          join public.seller_orders o on o.id = i.order_id
          where i.variant_id = v.id and o.id <> p_order and o.status = 'en_proceso' and o.expires_at > clock_timestamp()
        ), 0)), '[]'::jsonb) as variants,
      coalesce((select jsonb_agg(to_jsonb(price) - 'product_id' - 'needs_review')
        from public.inventory_product_prices price where price.product_id = p.id and price.needs_review = false), '[]'::jsonb) as prices,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'description', b.assortment_description,
        'stock', greatest(b.stock - coalesce((
          select sum(i.quantity) from public.seller_order_items i
          join public.seller_orders o on o.id = i.order_id
          where i.bundle_id = b.id and o.id <> p_order and o.status = 'en_proceso' and o.expires_at > clock_timestamp()
        ), 0), 0)
      ) order by b.id)
        from public.inventory_bundles b where b.product_id = p.id and b.stock > coalesce((
          select sum(i.quantity) from public.seller_order_items i
          join public.seller_orders o on o.id = i.order_id
          where i.bundle_id = b.id and o.id <> p_order and o.status = 'en_proceso' and o.expires_at > clock_timestamp()
        ), 0)), '[]'::jsonb) as bundles
    from public.products p where p.status = 'activo'
      and (exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > coalesce((
        select sum(i.quantity) from public.seller_order_items i
        join public.seller_orders o on o.id = i.order_id
        where i.variant_id = v.id and o.id <> p_order and o.status = 'en_proceso' and o.expires_at > clock_timestamp()
      ), 0))
        or exists (select 1 from public.inventory_bundles b where b.product_id = p.id and b.stock > coalesce((
          select sum(i.quantity) from public.seller_order_items i
          join public.seller_orders o on o.id = i.order_id
          where i.bundle_id = b.id and o.id <> p_order and o.status = 'en_proceso' and o.expires_at > clock_timestamp()
        ), 0)))
      and (p_search = '' or strpos(lower(p.name), lower(p_search)) > 0 or strpos(lower(coalesce(p.category, '')), lower(p_search)) > 0
        or exists (select 1 from public.product_variants v where v.product_id = p.id and strpos(lower(coalesce(v.sku, '')), lower(p_search)) > 0))
    order by p.name, p.id limit 25 offset p_offset
  ) product_row), '[]'::jsonb);
end;
$$;

revoke all on function public.pos_order_availability(uuid), public.pos_catalog_products_for_order(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.pos_order_availability(uuid), public.pos_catalog_products_for_order(uuid, text, integer)
  to authenticated;