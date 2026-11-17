-- Propuesta: validar y ejecutar manualmente; no habilita por sí sola el checkout.
begin;

create table public.checkout_commercial_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  bundle_id uuid references public.inventory_bundles(id) on delete set null,
  kind text not null check (kind in ('variant', 'bundle')),
  product_name text not null,
  size text,
  color text,
  sku text,
  bundle_description text,
  quantity integer not null check (quantity between 1 and 999),
  regular_price_usd numeric(10,2),
  promotion_price_usd numeric(10,2),
  promotion_units integer not null default 0 check (promotion_units >= 0 and promotion_units <= quantity),
  bundle_price_usd numeric(10,2),
  total_usd numeric(10,2) not null
);
create index checkout_commercial_items_order_idx on public.checkout_commercial_items(order_id);
alter table public.checkout_commercial_items enable row level security;
revoke all on public.checkout_commercial_items from public, anon, authenticated;
grant select on public.checkout_commercial_items to service_role;

create function public.checkout_create_commercial_request(
  p_key text, p_customer_name text, p_customer_phone text, p_fulfillment text, p_payment text,
  p_state text, p_municipality text, p_address text, p_items jsonb, p_is_test boolean
) returns table (order_id uuid, reused boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(p_customer_name);
  v_phone text := btrim(p_customer_phone);
  v_state text := nullif(btrim(p_state), '');
  v_municipality text := nullif(btrim(p_municipality), '');
  v_address text := nullif(btrim(p_address), '');
  v_item jsonb;
  v_items jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_key_hash bytea;
  v_request_hash bytea;
  v_previous public.checkout_request_keys%rowtype;
  v_rate numeric;
  v_rate_date date;
  v_line record;
  v_product_id uuid;
  v_promo_remaining integer := 0;
  v_promo_units integer;
  v_line_total numeric;
  v_total numeric := 0;
  v_total_ves numeric;
  v_order_id uuid;
begin
  if p_is_test is null or p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Clave o modo inválido' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 120 or v_phone is null
    or char_length(v_phone) not between 1 and 30 or v_name ~ '[[:cntrl:]]' or v_phone ~ '[[:cntrl:]]' then
    raise exception 'Nombre o teléfono inválido' using errcode = '22023';
  end if;
  if p_fulfillment is null or p_fulfillment not in ('pickup', 'delivery', 'envio_nacional')
    or p_payment is null or p_payment not in ('bolivares', 'binance', 'efectivo')
    or (p_payment = 'efectivo' and p_fulfillment <> 'pickup') then
    raise exception 'Entrega o pago inválido' using errcode = '22023';
  end if;
  if p_fulfillment = 'pickup' then
    v_state := null; v_municipality := null; v_address := null;
  elsif v_state is null or char_length(v_state) > 120 or v_municipality is null
    or char_length(v_municipality) > 120 or v_address is null or char_length(v_address) > 500
    or v_state ~ '[[:cntrl:]]' or v_municipality ~ '[[:cntrl:]]'
    or translate(v_address, chr(9) || chr(10) || chr(13), '') ~ '[[:cntrl:]]'
    or (p_fulfillment = 'delivery' and v_state <> 'Carabobo') then
    raise exception 'Datos de entrega inválidos' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Carrito inválido' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object' or v_item->>'kind' not in ('variant', 'bundle')
      or jsonb_typeof(v_item->'kind') is distinct from 'string' or jsonb_typeof(v_item->'id') is distinct from 'string'
      or (v_item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_item->'quantity') is distinct from 'number' or (v_item->>'quantity') !~ '^[1-9][0-9]{0,2}$' then
      raise exception 'Presentación o cantidad inválida' using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_items) i group by i->>'kind', lower(i->>'id') having count(*) > 1) then
    raise exception 'Hay presentaciones duplicadas' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('kind', i->>'kind', 'id', lower(i->>'id'), 'quantity', (i->>'quantity')::integer)
    order by i->>'kind', lower(i->>'id')) into v_items from jsonb_array_elements(p_items) i;
  v_key_hash := sha256(convert_to('commercial:' || p_is_test::text || ':' || p_key, 'UTF8'));
  v_request_hash := sha256(convert_to(jsonb_build_object('name', v_name, 'phone', v_phone, 'fulfillment', p_fulfillment,
    'payment', p_payment, 'state', v_state, 'municipality', v_municipality, 'address', v_address, 'items', v_items)::text, 'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('commercial:' || p_is_test::text || ':' || p_key, 0));
  select * into v_previous from public.checkout_request_keys k where k.key_hash = v_key_hash;
  if found then
    if v_previous.request_hash <> v_request_hash then raise exception 'Clave usada por otra solicitud' using errcode = '22023'; end if;
    return query select v_previous.order_id, true;
    return;
  end if;

  perform p.id from public.products p where p.id in (
    select v.product_id from public.product_variants v join jsonb_array_elements(v_items) i on i->>'kind' = 'variant' and v.id = (i->>'id')::uuid
    union select b.product_id from public.inventory_bundles b join jsonb_array_elements(v_items) i on i->>'kind' = 'bundle' and b.id = (i->>'id')::uuid
  ) order by p.id for share of p;
  perform v.id from public.product_variants v join jsonb_array_elements(v_items) i on i->>'kind' = 'variant' and v.id = (i->>'id')::uuid order by v.id for share of v;
  perform b.id from public.inventory_bundles b join jsonb_array_elements(v_items) i on i->>'kind' = 'bundle' and b.id = (i->>'id')::uuid order by b.id for share of b;

  v_rate_date := (clock_timestamp() at time zone 'America/Caracas')::date;
  select r.rate into v_rate from public.exchange_rates r where r.currency_from = 'USD' and r.currency_to = 'VES'
    and r.created_by is not null and r.effective_date = v_rate_date order by r.updated_at desc, r.id desc limit 1 for share of r;
  if not found or v_rate is null or v_rate::text in ('NaN', 'Infinity', '-Infinity') or v_rate <= 0
    or v_rate >= 10000000000 or trunc(v_rate * 1000000) <> v_rate * 1000000 then
    raise exception 'No hay una tasa válida para hoy' using errcode = 'P0002';
  end if;

  for v_line in
    with requested as (
      select i->>'kind' as kind, (i->>'id')::uuid as id, (i->>'quantity')::integer as quantity
      from jsonb_array_elements(v_items) i
    )
    select q.kind, q.id, q.quantity, p.id as product_id, p.name, p.status, p.catalog_visible,
      v.stock as variant_stock, v.size, v.color, v.sku, b.stock as bundle_stock, b.assortment_description,
      price.unit_price_usd, price.promotion_price_usd, price.promotion_quantity, price.bundle_price_usd,
      sum(case when q.kind = 'variant' then q.quantity else 0 end) over (partition by p.id) as product_quantity
    from requested q
    left join public.product_variants v on q.kind = 'variant' and v.id = q.id
    left join public.inventory_bundles b on q.kind = 'bundle' and b.id = q.id
    left join public.products p on p.id = coalesce(v.product_id, b.product_id)
    left join public.inventory_product_prices price on price.product_id = p.id and price.needs_review = false
      and price.payment_category = case when p_payment = 'bolivares' then 'bolivares' else 'divisas' end
    order by p.id, q.kind, q.id
  loop
    if v_line.status is distinct from 'activo' or v_line.catalog_visible is distinct from true
      or (v_line.kind = 'variant' and (v_line.variant_stock is null or v_line.variant_stock < v_line.quantity))
      or (v_line.kind = 'bundle' and (v_line.bundle_stock is null or v_line.bundle_stock < v_line.quantity)) then
      raise exception 'Una presentación no está disponible o no tiene suficiente stock' using errcode = 'P0002';
    end if;
    if v_product_id is distinct from v_line.product_id then
      v_product_id := v_line.product_id;
      v_promo_remaining := case when v_line.promotion_price_usd is not null and v_line.promotion_quantity in (2, 3, 4)
        then (v_line.product_quantity / v_line.promotion_quantity)::integer * v_line.promotion_quantity else 0 end;
    end if;
    v_promo_units := case when v_line.kind = 'variant' then least(v_line.quantity, v_promo_remaining) else 0 end;
    v_promo_remaining := v_promo_remaining - v_promo_units;
    if (v_line.kind = 'bundle' and v_line.bundle_price_usd is null)
      or (v_line.kind = 'variant' and v_promo_units < v_line.quantity and v_line.unit_price_usd is null) then
      raise exception 'No hay un precio disponible para esta presentación' using errcode = 'P0002';
    end if;
    v_line_total := case when v_line.kind = 'bundle' then v_line.quantity * v_line.bundle_price_usd
      else v_promo_units * coalesce(v_line.promotion_price_usd, 0) + (v_line.quantity - v_promo_units) * coalesce(v_line.unit_price_usd, 0) end;
    v_total := v_total + v_line_total;
    if v_line_total >= 100000000 or v_total >= 100000000 then raise exception 'Total fuera de rango' using errcode = '22003'; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('kind', v_line.kind, 'id', v_line.id, 'name', v_line.name,
      'size', v_line.size, 'color', v_line.color, 'sku', v_line.sku, 'bundle_description', v_line.assortment_description,
      'quantity', v_line.quantity, 'regular_price', v_line.unit_price_usd, 'promotion_price', v_line.promotion_price_usd,
      'promotion_units', v_promo_units, 'bundle_price', v_line.bundle_price_usd, 'total', v_line_total));
  end loop;
  v_total_ves := round(v_total * v_rate, 2);
  if v_total_ves >= 100000000 then raise exception 'Total fuera de rango' using errcode = '22003'; end if;
  insert into public.orders (customer_name, customer_phone, fulfillment, payment, status, total_usd, total_ves,
    checkout_is_test, checkout_state, checkout_municipality, checkout_address, checkout_exchange_rate, checkout_rate_date)
  values (v_name, v_phone, p_fulfillment::public.fulfillment_type, p_payment::public.payment_method, 'pago_pendiente',
    v_total, v_total_ves, p_is_test, v_state, v_municipality, v_address, v_rate, v_rate_date) returning id into v_order_id;
  insert into public.checkout_commercial_items (order_id, variant_id, bundle_id, kind, product_name, size, color, sku,
    bundle_description, quantity, regular_price_usd, promotion_price_usd, promotion_units, bundle_price_usd, total_usd)
  select v_order_id, case when l->>'kind' = 'variant' then (l->>'id')::uuid end,
    case when l->>'kind' = 'bundle' then (l->>'id')::uuid end, l->>'kind', l->>'name', l->>'size', l->>'color', l->>'sku',
    l->>'bundle_description', (l->>'quantity')::integer, (l->>'regular_price')::numeric, (l->>'promotion_price')::numeric,
    (l->>'promotion_units')::integer, (l->>'bundle_price')::numeric, (l->>'total')::numeric from jsonb_array_elements(v_lines) l;
  insert into public.checkout_request_keys (key_hash, request_hash, order_id) values (v_key_hash, v_request_hash, v_order_id);
  return query select v_order_id, false;
end;
$$;

revoke all on function public.checkout_create_commercial_request(text, text, text, text, text, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.checkout_create_commercial_request(text, text, text, text, text, text, text, text, jsonb, boolean) to service_role;
commit;