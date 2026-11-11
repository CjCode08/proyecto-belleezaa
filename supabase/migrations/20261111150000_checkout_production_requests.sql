-- PROPUESTA: no ejecutar hasta revisión y confirmación del usuario.
-- Requiere las migraciones de checkout de prueba, límite y SKU previamente aplicadas.
-- Solo prepara una función de servidor; no habilita el checkout público.
begin;

create function public.checkout_create_production_request(
  p_key text,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment text,
  p_payment text,
  p_state text,
  p_municipality text,
  p_address text,
  p_items jsonb
)
returns table (order_id uuid, reused boolean)
language plpgsql
security definer
set search_path = ''
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
  v_price numeric;
  v_total numeric := 0;
  v_total_ves numeric;
  v_order_id uuid;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Clave de solicitud inválida' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 120
    or v_phone is null or char_length(v_phone) not between 1 and 30
    or v_name ~ '[[:cntrl:]]' or v_phone ~ '[[:cntrl:]]' then
    raise exception 'Nombre o teléfono inválido' using errcode = '22023';
  end if;
  if p_fulfillment is null or p_fulfillment not in ('pickup', 'delivery', 'envio_nacional')
    or p_payment is null or p_payment not in ('bolivares', 'binance', 'efectivo')
    or (p_payment = 'efectivo' and p_fulfillment <> 'pickup') then
    raise exception 'Entrega o pago inválido' using errcode = '22023';
  end if;
  if p_fulfillment = 'pickup' then
    v_state := null;
    v_municipality := null;
    v_address := null;
  elsif v_state is null or char_length(v_state) > 120
    or v_municipality is null or char_length(v_municipality) > 120
    or v_address is null or char_length(v_address) > 500
    or v_state ~ '[[:cntrl:]]' or v_municipality ~ '[[:cntrl:]]'
    or translate(v_address, chr(9) || chr(10) || chr(13), '') ~ '[[:cntrl:]]'
    or (p_fulfillment = 'delivery' and v_state <> 'Carabobo') then
    raise exception 'Datos de entrega inválidos' using errcode = '22023';
  end if;
  -- El servidor valida además la lista de estados y municipios antes de llamar esta función.
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Carrito inválido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'El carrito debe contener entre una y cien variantes' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item->'variantId') is distinct from 'string'
      or (v_item->>'variantId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_item->'quantity') is distinct from 'number'
      or (v_item->>'quantity') !~ '^[1-9][0-9]{0,2}$' then
      raise exception 'Variante o cantidad inválida' using errcode = '22023';
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(p_items) as i(value)
    group by lower(i.value->>'variantId') having count(*) > 1
  ) then
    raise exception 'Hay variantes duplicadas' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object(
    'variantId', lower(i.value->>'variantId'), 'quantity', (i.value->>'quantity')::integer
  ) order by lower(i.value->>'variantId'))
  into v_items from jsonb_array_elements(p_items) as i(value);

  v_key_hash := sha256(convert_to('production:' || p_key, 'UTF8'));
  v_request_hash := sha256(convert_to(jsonb_build_object(
    'name', v_name, 'phone', v_phone, 'fulfillment', p_fulfillment, 'payment', p_payment,
    'state', v_state, 'municipality', v_municipality, 'address', v_address, 'items', v_items
  )::text, 'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('production:' || p_key, 0));
  select * into v_previous from public.checkout_request_keys k where k.key_hash = v_key_hash;
  if found then
    if v_previous.request_hash <> v_request_hash then
      raise exception 'La clave ya corresponde a otra solicitud' using errcode = '22023';
    end if;
    return query select v_previous.order_id, true;
    return;
  end if;

  -- Orden de bloqueo compatible con la edición del inventario: producto antes de variante.
  perform p.id from public.products p
    where p.id in (
      select v.product_id from public.product_variants v
      join jsonb_array_elements(v_items) as i(value) on v.id = (i.value->>'variantId')::uuid
    )
    order by p.id for share of p;
  perform v.id from public.product_variants v
    join jsonb_array_elements(v_items) as i(value) on v.id = (i.value->>'variantId')::uuid
    order by v.id for share of v;

  v_rate_date := (clock_timestamp() at time zone 'America/Caracas')::date;
  select r.rate into v_rate from public.exchange_rates r
    where r.currency_from = 'USD' and r.currency_to = 'VES'
      and r.created_by is not null and r.effective_date = v_rate_date
    order by r.updated_at desc, r.id desc limit 1 for share of r;
  if not found or v_rate is null or v_rate::text in ('NaN', 'Infinity', '-Infinity')
    or v_rate <= 0 or v_rate >= 10000000000 or trunc(v_rate * 1000000) <> v_rate * 1000000 then
    raise exception 'No hay una tasa válida para hoy' using errcode = 'P0002';
  end if;

  for v_line in
    with requested as (
      select (i.value->>'variantId')::uuid as variant_id, (i.value->>'quantity')::integer as quantity
      from jsonb_array_elements(v_items) as i(value)
    )
    select q.variant_id, q.quantity, v.stock, v.size, v.color, v.sku, p.name, p.status,
      p.unit_price, p.promo_price, p.wholesale_price,
      sum(q.quantity) over (partition by v.product_id) as product_quantity
    from requested q
    left join public.product_variants v on v.id = q.variant_id
    left join public.products p on p.id = v.product_id
    order by q.variant_id
  loop
    if v_line.status is distinct from 'activo' or v_line.stock is null or v_line.stock < v_line.quantity then
      raise exception 'Una variante no está disponible o no tiene suficiente stock' using errcode = 'P0002';
    end if;
    v_price := case when v_line.product_quantity >= 12 then v_line.wholesale_price
      when v_line.product_quantity >= 3 then v_line.promo_price else v_line.unit_price end;
    if v_price is null or v_price::text in ('NaN', 'Infinity', '-Infinity')
      or v_price < 0 or v_price >= 100000000 or trunc(v_price * 100) <> v_price * 100 then
      raise exception 'No hay un precio válido para una variante' using errcode = '22023';
    end if;
    v_total := v_total + v_price * v_line.quantity;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'variant_id', v_line.variant_id, 'quantity', v_line.quantity, 'price', v_price,
      'product_name', v_line.name, 'size', v_line.size, 'color', v_line.color, 'sku', v_line.sku
    ));
  end loop;
  v_total_ves := round(v_total * v_rate, 2);
  -- Límite conservador compatible con columnas numeric(10,2).
  if v_total >= 100000000 or v_total_ves >= 100000000 then
    raise exception 'El total excede el límite permitido' using errcode = '22003';
  end if;

  insert into public.orders (
    customer_name, customer_phone, fulfillment, payment, status, total_usd, total_ves,
    checkout_is_test, checkout_state, checkout_municipality, checkout_address,
    checkout_exchange_rate, checkout_rate_date
  ) values (
    v_name, v_phone, p_fulfillment::public.fulfillment_type, p_payment::public.payment_method,
    'pago_pendiente', v_total, v_total_ves, false, v_state, v_municipality, v_address,
    v_rate, v_rate_date
  ) returning id into v_order_id;
  insert into public.order_items (
    order_id, variant_id, quantity, unit_price_usd, total_price_usd,
    checkout_product_name, checkout_size, checkout_color, checkout_sku
  )
  select v_order_id, (l.value->>'variant_id')::uuid, (l.value->>'quantity')::integer,
    (l.value->>'price')::numeric, (l.value->>'price')::numeric * (l.value->>'quantity')::integer,
    l.value->>'product_name', l.value->>'size', l.value->>'color', l.value->>'sku'
  from jsonb_array_elements(v_lines) as l(value);
  insert into public.checkout_request_keys (key_hash, request_hash, order_id)
    values (v_key_hash, v_request_hash, v_order_id);
  return query select v_order_id, false;
end;
$$;

revoke all on function public.checkout_create_production_request(text, text, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.checkout_create_production_request(text, text, text, text, text, text, text, text, jsonb)
  to service_role;

commit;
