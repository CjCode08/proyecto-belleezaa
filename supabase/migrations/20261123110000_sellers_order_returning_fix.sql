begin;

create or replace function public.sellers_create_order(p_key uuid, p_payment_method text, p_items jsonb)
returns table (order_id uuid, status text, total_usd numeric, total_ves numeric, exchange_rate numeric, rate_date date, expires_at timestamptz, reused boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_seller uuid := (select auth.uid());
  v_method text := p_payment_method;
  v_category text;
  v_requested jsonb;
  v_hash bytea;
  v_previous public.seller_orders%rowtype;
  v_line record;
  v_rate numeric;
  v_rate_date date;
  v_product uuid;
  v_promo_remaining integer := 0;
  v_promo_units integer;
  v_reserved integer;
  v_line_total numeric;
  v_total numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_order uuid;
  v_expires timestamptz;
begin
  if not exists (select 1 from public.profiles p where p.id = v_seller and p.role = 'vendedor' and p.is_active is true) then
    raise exception 'Acceso de vendedor requerido' using errcode = '42501';
  end if;
  if p_key is null or v_method is null or v_method not in ('bolivares', 'binance', 'efectivo') then
    raise exception 'Metodo o clave invalido' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Carrito invalido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Carrito invalido' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) is distinct from 'object'
      or item->>'kind' not in ('variant', 'bundle')
      or jsonb_typeof(item->'id') is distinct from 'string'
      or (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or (item->>'quantity') !~ '^[1-9][0-9]{0,2}$') then
    raise exception 'Presentacion o cantidad invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) item group by item->>'kind', lower(item->>'id') having count(*) > 1) then
    raise exception 'Presentaciones duplicadas' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('kind', item->>'kind', 'id', lower(item->>'id'), 'quantity', (item->>'quantity')::integer)
    order by item->>'kind', lower(item->>'id')) into v_requested from jsonb_array_elements(p_items) item;
  v_hash := sha256(convert_to(jsonb_build_object('method', v_method, 'items', v_requested)::text, 'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended(v_seller::text || ':' || p_key::text, 0));
  select * into v_previous from public.seller_orders o where o.seller_id = v_seller and o.idempotency_key = p_key;
  if found then
    if v_previous.request_hash <> v_hash then raise exception 'Clave reutilizada con otro pedido' using errcode = '22023'; end if;
    return query select v_previous.id,
      case when v_previous.status = 'en_proceso' and v_previous.expires_at <= now() then 'expirada' else v_previous.status end,
      v_previous.total_usd, v_previous.total_ves, v_previous.exchange_rate, v_previous.rate_date, v_previous.expires_at, true;
    return;
  end if;

  perform p.id from public.products p where p.id in (
    select v.product_id from public.product_variants v join jsonb_array_elements(v_requested) item on item->>'kind' = 'variant' and v.id = (item->>'id')::uuid
    union select b.product_id from public.inventory_bundles b join jsonb_array_elements(v_requested) item on item->>'kind' = 'bundle' and b.id = (item->>'id')::uuid
  ) order by p.id for update of p;
  perform v.id from public.product_variants v join jsonb_array_elements(v_requested) item on item->>'kind' = 'variant' and v.id = (item->>'id')::uuid order by v.id for update of v;
  perform b.id from public.inventory_bundles b join jsonb_array_elements(v_requested) item on item->>'kind' = 'bundle' and b.id = (item->>'id')::uuid order by b.id for update of b;

  v_category := case when v_method = 'bolivares' then 'bolivares' else 'divisas' end;
  if v_method = 'bolivares' then
    v_rate_date := (clock_timestamp() at time zone 'America/Caracas')::date;
    select r.rate into v_rate from public.exchange_rates r
      where r.currency_from = 'USD' and r.currency_to = 'VES' and r.created_by is not null and r.effective_date = v_rate_date
      order by r.updated_at desc, r.id desc limit 1 for share of r;
    if not found or v_rate is null or v_rate <= 0 or v_rate::text in ('NaN', 'Infinity', '-Infinity')
      or v_rate >= 10000000000 or trunc(v_rate * 1000000) <> v_rate * 1000000 then
      raise exception 'No hay una tasa valida para hoy' using errcode = 'P0002';
    end if;
  end if;

  for v_line in
    with requested as (
      select item->>'kind' as kind, (item->>'id')::uuid as id, (item->>'quantity')::integer as quantity
      from jsonb_array_elements(v_requested) item
    )
    select q.kind, q.id, q.quantity, p.id as product_id, p.name, p.status,
      v.stock as variant_stock, v.size, v.color, v.sku,
      b.stock as bundle_stock, b.assortment_description,
      price.unit_price_usd, price.promotion_price_usd, price.promotion_quantity, price.bundle_price_usd,
      sum(case when q.kind = 'variant' then q.quantity else 0 end) over (partition by p.id) as product_quantity
    from requested q
    left join public.product_variants v on q.kind = 'variant' and v.id = q.id
    left join public.inventory_bundles b on q.kind = 'bundle' and b.id = q.id
    left join public.products p on p.id = coalesce(v.product_id, b.product_id)
    left join public.inventory_product_prices price on price.product_id = p.id and price.needs_review = false and price.payment_category = v_category
    order by p.id nulls first, q.kind, q.id
  loop
    if v_line.product_id is null or v_line.status is distinct from 'activo'
      or (v_line.kind = 'variant' and v_line.variant_stock is null)
      or (v_line.kind = 'bundle' and v_line.bundle_stock is null) then
      raise exception 'Una presentacion ya no esta disponible' using errcode = 'P0002';
    end if;
    if v_line.kind = 'variant' then
      select coalesce(sum(i.quantity), 0)::integer into v_reserved from public.seller_order_items i
        join public.seller_orders o on o.id = i.order_id
        where i.variant_id = v_line.id and o.status = 'en_proceso' and o.expires_at > now();
      if v_line.variant_stock - v_reserved < v_line.quantity then raise exception 'Stock insuficiente para una variante' using errcode = 'P0002'; end if;
    else
      select coalesce(sum(i.quantity), 0)::integer into v_reserved from public.seller_order_items i
        join public.seller_orders o on o.id = i.order_id
        where i.bundle_id = v_line.id and o.status = 'en_proceso' and o.expires_at > now();
      if v_line.bundle_stock - v_reserved < v_line.quantity then raise exception 'Stock insuficiente para un bulto' using errcode = 'P0002'; end if;
    end if;

    if v_product is distinct from v_line.product_id then
      v_product := v_line.product_id;
      v_promo_remaining := case when v_line.promotion_price_usd is not null and v_line.promotion_quantity in (2, 3, 4)
        then (v_line.product_quantity / v_line.promotion_quantity)::integer * v_line.promotion_quantity else 0 end;
    end if;
    v_promo_units := case when v_line.kind = 'variant' then least(v_line.quantity, v_promo_remaining) else 0 end;
    v_promo_remaining := v_promo_remaining - v_promo_units;
    if (v_line.kind = 'bundle' and v_line.bundle_price_usd is null)
      or (v_line.kind = 'variant' and v_promo_units < v_line.quantity and v_line.unit_price_usd is null) then
      raise exception 'Precio no disponible para esta presentacion' using errcode = 'P0002';
    end if;
    v_line_total := case when v_line.kind = 'bundle' then v_line.quantity * v_line.bundle_price_usd
      else v_promo_units * coalesce(v_line.promotion_price_usd, 0) + (v_line.quantity - v_promo_units) * coalesce(v_line.unit_price_usd, 0) end;
    v_total := v_total + v_line_total;
    if v_line_total >= 100000000 or v_total >= 100000000 then raise exception 'Total fuera de rango' using errcode = '22003'; end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object('kind', v_line.kind, 'id', v_line.id,
      'name', v_line.name, 'size', v_line.size, 'color', v_line.color, 'sku', v_line.sku,
      'bundle_description', v_line.assortment_description, 'quantity', v_line.quantity,
      'regular_price', v_line.unit_price_usd, 'promotion_price', v_line.promotion_price_usd,
      'promotion_units', v_promo_units, 'bundle_price', v_line.bundle_price_usd, 'total', v_line_total));
  end loop;

  insert into public.seller_orders as created_order (seller_id, status, payment_method, total_usd, total_ves, exchange_rate, rate_date,
    idempotency_key, request_hash, expires_at)
  values (v_seller, 'en_proceso', v_method, round(v_total, 2),
    case when v_method = 'bolivares' then round(v_total * v_rate, 2) end,
    v_rate, v_rate_date, p_key, v_hash, clock_timestamp() + interval '30 minutes')
  returning created_order.id, created_order.expires_at into v_order, v_expires;

  insert into public.seller_order_items (order_id, variant_id, bundle_id, kind, product_name, size, color, sku,
    bundle_description, quantity, regular_price_usd, promotion_price_usd, promotion_units, bundle_price_usd, total_usd)
  select v_order,
    case when line->>'kind' = 'variant' then (line->>'id')::uuid end,
    case when line->>'kind' = 'bundle' then (line->>'id')::uuid end,
    line->>'kind', line->>'name', line->>'size', line->>'color', line->>'sku', line->>'bundle_description',
    (line->>'quantity')::integer, (line->>'regular_price')::numeric, (line->>'promotion_price')::numeric,
    (line->>'promotion_units')::integer, (line->>'bundle_price')::numeric, (line->>'total')::numeric
  from jsonb_array_elements(v_lines) line;

  return query select v_order, 'en_proceso', round(v_total, 2),
    case when v_method = 'bolivares' then round(v_total * v_rate, 2) end,
    v_rate, v_rate_date, v_expires, false;
end;
$$;

revoke all on function public.sellers_create_order(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.sellers_create_order(uuid, text, jsonb) to authenticated;

commit;