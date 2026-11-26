begin;

alter table public.seller_orders add column revision integer not null default 1;
alter table public.seller_order_items add column promotion_description text;

create table public.pos_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.seller_orders(id) on delete restrict,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  request_hash bytea not null,
  currency text not null check (currency in ('bolivares', 'divisas')),
  method text not null check (method in ('pago_movil', 'transferencia', 'tarjeta', 'efectivo', 'binance', 'zinli')),
  reference text,
  paid_on date not null,
  comment text not null,
  amount numeric(12,2) not null check (amount >= 0),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (cashier_id, idempotency_key)
);
create table public.pos_stock_movements (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.pos_receipts(id) on delete restrict,
  product_id uuid not null,
  presentation_id uuid not null,
  kind text not null check (kind in ('variant', 'bundle')),
  quantity_change integer not null check (quantity_change < 0),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.pos_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.seller_orders(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  revision integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.pos_receipts enable row level security;
alter table public.pos_stock_movements enable row level security;
alter table public.pos_order_events enable row level security;
revoke all on public.pos_receipts, public.pos_stock_movements, public.pos_order_events from public, anon, authenticated;

create function public.pos_require_staff() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles p where p.id = v_actor and p.is_active is true and p.role in ('admin', 'cajero')) then
    raise exception 'Acceso de caja requerido' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create function public.pos_get_order(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.pos_require_staff();
  select to_jsonb(o) - 'request_hash' - 'idempotency_key' || jsonb_build_object(
    'advisor_name', p.full_name, 'advisor_username', p.username,
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.product_name, i.id)
      from public.seller_order_items i where i.order_id = o.id), '[]'::jsonb),
    'receipt', (select r.snapshot || jsonb_build_object('id', r.id) from public.pos_receipts r where r.order_id = o.id)
  ) into v_result from public.seller_orders o join public.profiles p on p.id = o.seller_id where o.id = p_order;
  if v_result is null then raise exception 'Orden no encontrada' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;

create function public.pos_list_orders(p_completed boolean, p_search text, p_offset integer) returns jsonb
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

create function public.pos_catalog_products(p_search text, p_offset integer) returns jsonb
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

create function public.pos_price_order(p_order uuid, p_currency text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_line record; v_product uuid; v_reserved bigint; v_remaining integer := 0;
  v_units integer; v_line_total numeric; v_total numeric := 0;
  v_lines jsonb := '[]'::jsonb; v_rate numeric; v_day date;
begin
  perform public.pos_require_staff();
  if p_currency is null or p_currency not in ('bolivares', 'divisas') then raise exception 'Modalidad invalida' using errcode = '22023'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Orden invalida' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'La orden debe tener entre 1 y 100 lineas' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where jsonb_typeof(i) <> 'object'
    or jsonb_typeof(i->'kind') is distinct from 'string' or i->>'kind' not in ('variant', 'bundle')
    or jsonb_typeof(i->'id') is distinct from 'string' or i->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(i->'quantity') is distinct from 'number' or i->>'quantity' !~ '^[1-9][0-9]{0,2}$') then
    raise exception 'Presentacion o cantidad invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i group by i->>'kind', lower(i->>'id') having count(*) > 1) then
    raise exception 'Lineas duplicadas' using errcode = '22023';
  end if;
  perform p.id from public.products p where p.id in (
    select v.product_id from public.product_variants v join jsonb_array_elements(p_items) i on i->>'kind' = 'variant' and v.id = (i->>'id')::uuid
    union select b.product_id from public.inventory_bundles b join jsonb_array_elements(p_items) i on i->>'kind' = 'bundle' and b.id = (i->>'id')::uuid
  ) order by p.id for update of p;
  perform v.id from public.product_variants v join jsonb_array_elements(p_items) i on i->>'kind' = 'variant' and v.id = (i->>'id')::uuid order by v.id for update of v;
  perform b.id from public.inventory_bundles b join jsonb_array_elements(p_items) i on i->>'kind' = 'bundle' and b.id = (i->>'id')::uuid order by b.id for update of b;

  if p_currency = 'bolivares' then
    v_day := (clock_timestamp() at time zone 'America/Caracas')::date;
    select r.rate into v_rate from public.exchange_rates r where r.currency_from = 'USD' and r.currency_to = 'VES'
      and r.created_by is not null and r.effective_date = v_day order by r.updated_at desc, r.id desc limit 1 for share of r;
    if v_rate is null or v_rate <= 0 or v_rate::text in ('NaN', 'Infinity', '-Infinity') then raise exception 'Falta la tasa valida de hoy' using errcode = 'P0002'; end if;
  end if;
  for v_line in
    with requested as (select i->>'kind' as kind, (i->>'id')::uuid as id, (i->>'quantity')::integer as quantity from jsonb_array_elements(p_items) i)
    select q.*, p.id as product_id, p.name, p.status, v.size, v.color, v.sku, b.assortment_description,
      case when q.kind = 'variant' then v.stock else b.stock end as stock,
      price.unit_price_usd, price.promotion_price_usd, price.promotion_quantity, price.promotion_description, price.bundle_price_usd,
      sum(case when q.kind = 'variant' then q.quantity else 0 end) over (partition by p.id) as product_quantity
    from requested q left join public.product_variants v on q.kind = 'variant' and v.id = q.id
    left join public.inventory_bundles b on q.kind = 'bundle' and b.id = q.id
    left join public.products p on p.id = coalesce(v.product_id, b.product_id)
    left join public.inventory_product_prices price on price.product_id = p.id and price.payment_category = p_currency and price.needs_review = false
    order by p.id nulls first, q.kind, q.id
  loop
    if v_line.product_id is null or v_line.status is distinct from 'activo' or v_line.stock is null then raise exception 'Presentacion no disponible' using errcode = 'P0002'; end if;
    select coalesce(sum(i.quantity), 0) into v_reserved from public.seller_order_items i join public.seller_orders o on o.id = i.order_id
      where o.id <> p_order and o.status = 'en_proceso' and o.expires_at > clock_timestamp()
        and ((v_line.kind = 'variant' and i.variant_id = v_line.id) or (v_line.kind = 'bundle' and i.bundle_id = v_line.id));
    if v_line.stock - v_reserved < v_line.quantity then raise exception 'Disponibilidad insuficiente; hay unidades reservadas' using errcode = 'P0002'; end if;
    if v_product is distinct from v_line.product_id then
      v_product := v_line.product_id;
      v_remaining := case when v_line.promotion_price_usd is not null and v_line.promotion_quantity in (2,3,4)
        then (v_line.product_quantity / v_line.promotion_quantity)::integer * v_line.promotion_quantity else 0 end;
    end if;
    v_units := case when v_line.kind = 'variant' then least(v_remaining, v_line.quantity) else 0 end;
    v_remaining := v_remaining - v_units;
    if (v_line.kind = 'variant' and v_units < v_line.quantity and v_line.unit_price_usd is null)
      or (v_line.kind = 'bundle' and v_line.bundle_price_usd is null) then raise exception 'Precio no disponible para la modalidad' using errcode = 'P0002'; end if;
    v_line_total := case when v_line.kind = 'bundle' then v_line.quantity * v_line.bundle_price_usd
      else v_units * coalesce(v_line.promotion_price_usd,0) + (v_line.quantity - v_units) * coalesce(v_line.unit_price_usd,0) end;
    v_total := v_total + v_line_total;
    if v_total >= 100000000 then raise exception 'Total fuera de rango' using errcode = '22003'; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('kind', v_line.kind, 'id', v_line.id, 'product_id', v_line.product_id,
      'product_name', v_line.name, 'size', v_line.size, 'color', v_line.color, 'sku', v_line.sku,
      'bundle_description', v_line.assortment_description, 'quantity', v_line.quantity,
      'regular_price_usd', v_line.unit_price_usd, 'promotion_price_usd', v_line.promotion_price_usd,
      'promotion_units', v_units, 'promotion_description', v_line.promotion_description, 'bundle_price_usd', v_line.bundle_price_usd, 'total_usd', v_line_total));
  end loop;
  return jsonb_build_object('items', v_lines, 'total_usd', v_total, 'total_ves', round(v_total * v_rate,2), 'exchange_rate', v_rate, 'rate_date', v_day);
end;
$$;

create function public.pos_save_order(p_order uuid, p_revision integer, p_currency text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_order public.seller_orders%rowtype; v_priced jsonb;
begin
  v_actor := public.pos_require_staff();
  select * into v_order from public.seller_orders o where o.id = p_order for update;
  if not found then raise exception 'Orden no encontrada' using errcode = 'P0002'; end if;
  if v_order.status <> 'en_proceso' then raise exception 'Esta orden ya no admite edicion' using errcode = '22023'; end if;
  if p_revision is distinct from v_order.revision then raise exception 'Otra caja modifico la orden; recargala' using errcode = '40001'; end if;
  v_priced := public.pos_price_order(p_order, p_currency, p_items);
  insert into public.pos_order_events(order_id, actor_id, revision, snapshot) values (p_order, v_actor, v_order.revision, public.pos_get_order(p_order));
  delete from public.seller_order_items i where i.order_id = p_order;
  insert into public.seller_order_items(order_id, variant_id, bundle_id, kind, product_name, size, color, sku, bundle_description,
    quantity, regular_price_usd, promotion_price_usd, promotion_units, promotion_description, bundle_price_usd, total_usd)
  select p_order, case when i->>'kind' = 'variant' then (i->>'id')::uuid end, case when i->>'kind' = 'bundle' then (i->>'id')::uuid end,
    i->>'kind', i->>'product_name', i->>'size', i->>'color', i->>'sku', i->>'bundle_description', (i->>'quantity')::integer,
    (i->>'regular_price_usd')::numeric, (i->>'promotion_price_usd')::numeric, (i->>'promotion_units')::integer,
    i->>'promotion_description', (i->>'bundle_price_usd')::numeric, (i->>'total_usd')::numeric from jsonb_array_elements(v_priced->'items') i;
  update public.seller_orders o set payment_method = case when p_currency = 'bolivares' then 'bolivares' else 'efectivo' end,
    total_usd = (v_priced->>'total_usd')::numeric, total_ves = (v_priced->>'total_ves')::numeric,
    exchange_rate = (v_priced->>'exchange_rate')::numeric, rate_date = (v_priced->>'rate_date')::date,
    revision = o.revision + 1, expires_at = clock_timestamp() + interval '30 minutes' where o.id = p_order;
  return public.pos_get_order(p_order);
end;
$$;

create function public.pos_close_order(p_order uuid, p_revision integer, p_key uuid, p_currency text,
  p_method text, p_reference text, p_paid_on date, p_comment text, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_order public.seller_orders%rowtype; v_previous public.pos_receipts%rowtype;
  v_hash bytea; v_expected numeric; v_items jsonb; v_price jsonb; v_receipt jsonb; v_receipt_id uuid; v_item jsonb;
begin
  v_actor := public.pos_require_staff();
  if p_key is null or p_revision is null or p_currency is null or p_method is null or p_paid_on is null
    or p_paid_on > (clock_timestamp() at time zone 'America/Caracas')::date
    or p_paid_on < date '1900-01-01' or p_amount is null or p_amount < 0 or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_comment is null or length(p_comment) > 500 or p_reference is null or length(p_reference) > 120
    or p_reference ~ '[[:cntrl:]]' then raise exception 'Datos del pago invalidos' using errcode = '22023'; end if;
  if (p_currency = 'bolivares' and p_method not in ('pago_movil','efectivo','transferencia','tarjeta'))
    or (p_currency = 'divisas' and p_method not in ('efectivo','binance','zinli')) or p_currency not in ('bolivares','divisas') then
    raise exception 'Metodo incompatible con la modalidad' using errcode = '22023';
  end if;
  if p_method <> 'efectivo' and btrim(p_reference) = '' then raise exception 'La referencia es obligatoria' using errcode = '22023'; end if;
  v_hash := sha256(convert_to(jsonb_build_object('order', p_order, 'revision',p_revision,'currency',p_currency,
    'method',p_method,'reference',btrim(p_reference),'date',p_paid_on,'comment',p_comment,'amount',p_amount)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('pos:' || v_actor::text || ':' || p_key::text,0));
  select * into v_order from public.seller_orders o where o.id = p_order for update;
  if not found then raise exception 'Orden no encontrada' using errcode = 'P0002'; end if;
  select * into v_previous from public.pos_receipts r where r.order_id = p_order;
  if found then
    if v_previous.cashier_id = v_actor and v_previous.idempotency_key = p_key and v_previous.request_hash = v_hash then
      return public.pos_get_order(p_order);
    end if;
    raise exception 'Orden ya cobrada; consulta el recibo' using errcode = '22023';
  end if;
  if exists (select 1 from public.pos_receipts r where r.cashier_id = v_actor and r.idempotency_key = p_key) then raise exception 'Clave usada para otro pago' using errcode = '22023'; end if;
  if v_order.status <> 'en_proceso' or v_order.expires_at <= clock_timestamp() then raise exception 'Reserva vencida; revisa y guarda la orden antes de cobrar' using errcode = 'P0002'; end if;
  if v_order.revision <> p_revision then raise exception 'La revision cambio; revisa la orden antes de cobrar' using errcode = '40001'; end if;
  if (v_order.payment_method = 'bolivares') is distinct from (p_currency = 'bolivares') then raise exception 'Guarda primero la nueva modalidad' using errcode = '22023'; end if;
  v_expected := case when p_currency = 'bolivares' then v_order.total_ves else v_order.total_usd end;
  if p_amount <> v_expected then raise exception 'El importe recibido debe coincidir con el total' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('kind', i.kind, 'id', coalesce(i.variant_id,i.bundle_id), 'quantity',i.quantity))
    into v_items from public.seller_order_items i where i.order_id = p_order;
  v_price := public.pos_price_order(p_order,p_currency,v_items);
  if (v_price->>'total_usd')::numeric <> v_order.total_usd or (v_price->>'exchange_rate')::numeric is distinct from v_order.exchange_rate
    or exists (select 1 from jsonb_array_elements(v_price->'items') line join public.seller_order_items i
      on i.order_id = p_order and i.kind = line->>'kind' and coalesce(i.variant_id,i.bundle_id) = (line->>'id')::uuid
      where i.regular_price_usd is distinct from (line->>'regular_price_usd')::numeric
        or i.promotion_price_usd is distinct from (line->>'promotion_price_usd')::numeric
        or i.promotion_units <> (line->>'promotion_units')::integer
        or i.bundle_price_usd is distinct from (line->>'bundle_price_usd')::numeric) then
    raise exception 'Precios, promociones o tasa cambiaron; guarda y revisa antes de cobrar' using errcode = '40001';
  end if;
  v_receipt := public.pos_get_order(p_order) - 'receipt' || jsonb_build_object('status','completada',
    'items',v_price->'items','cashier_name',(select p.full_name from public.profiles p where p.id = v_actor),
    'payment',jsonb_build_object('currency',p_currency,'method',p_method,'reference',nullif(btrim(p_reference),''),
      'paid_on',p_paid_on,'comment',p_comment,'amount',p_amount,'registered_at',clock_timestamp()));
  insert into public.pos_receipts as receipt(order_id,cashier_id,idempotency_key,request_hash,currency,method,reference,paid_on,comment,amount,snapshot)
    values(p_order,v_actor,p_key,v_hash,p_currency,p_method,nullif(btrim(p_reference),''),p_paid_on,p_comment,p_amount,v_receipt)
    returning receipt.id into v_receipt_id;
  for v_item in select value from jsonb_array_elements(v_price->'items') loop
    if v_item->>'kind' = 'variant' then
      update public.product_variants v set stock = v.stock - (v_item->>'quantity')::integer where v.id = (v_item->>'id')::uuid;
    else
      update public.inventory_bundles b set stock = b.stock - (v_item->>'quantity')::integer where b.id = (v_item->>'id')::uuid;
    end if;
    insert into public.pos_stock_movements(receipt_id,product_id,presentation_id,kind,quantity_change,actor_id)
      values(v_receipt_id,(v_item->>'product_id')::uuid,(v_item->>'id')::uuid,v_item->>'kind',-(v_item->>'quantity')::integer,v_actor);
    insert into public.inventory_movements(product_id,variant_id,user_id,action_type,quantity_change,comment,product_snapshot,variant_snapshot)
      values((v_item->>'product_id')::uuid,case when v_item->>'kind' = 'variant' then (v_item->>'id')::uuid end,
        v_actor,'MODIFICACION',-(v_item->>'quantity')::integer,'Venta POS ' || p_order::text,
        v_item->>'product_name',coalesce(v_item->>'sku',v_item->>'bundle_description','Sin SKU'));
  end loop;
  update public.seller_orders o set status = 'completada', completed_at = clock_timestamp(), revision = o.revision + 1,
    payment_method = case when p_currency = 'bolivares' then 'bolivares' when p_method = 'binance' then 'binance' else 'efectivo' end where o.id = p_order;
  return public.pos_get_order(p_order);
end;
$$;

revoke all on function public.pos_require_staff(), public.pos_price_order(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.pos_get_order(uuid), public.pos_list_orders(boolean,text,integer), public.pos_catalog_products(text,integer),
  public.pos_save_order(uuid,integer,text,jsonb), public.pos_close_order(uuid,integer,uuid,text,text,text,date,text,numeric) from public,anon,authenticated;
grant execute on function public.pos_get_order(uuid), public.pos_list_orders(boolean,text,integer), public.pos_catalog_products(text,integer),
  public.pos_save_order(uuid,integer,text,jsonb), public.pos_close_order(uuid,integer,uuid,text,text,text,date,text,numeric) to authenticated;

create function public.inventory_update_product_pos_safe(
  p_product_id uuid, p_name text, p_description text, p_category text, p_audiences text[], p_variants jsonb,
  p_add_image_paths text[], p_remove_image_ids uuid[], p_sku_base text, p_prices jsonb, p_bundles jsonb,
  p_comment text, p_stock_snapshot jsonb
) returns text[] language plpgsql security definer set search_path = '' as $$
declare v_current jsonb; v_expected jsonb; v_requested jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role in ('admin','personal')) then
    raise exception 'Sin permiso de inventario' using errcode = '42501';
  end if;
  if p_stock_snapshot is null or jsonb_typeof(p_stock_snapshot) <> 'array' or jsonb_typeof(p_variants) <> 'array' or jsonb_typeof(p_bundles) <> 'array' then
    raise exception 'Recarga el formulario para comprobar existencias' using errcode = '22023';
  end if;
  perform p.id from public.products p where p.id = p_product_id for update of p;
  perform v.id from public.product_variants v where v.product_id = p_product_id order by v.id for update of v;
  perform b.id from public.inventory_bundles b where b.product_id = p_product_id order by b.id for update of b;
  select coalesce(jsonb_agg(jsonb_build_object('kind', q.kind,'id',q.id,'stock',q.stock) order by q.kind,q.id), '[]'::jsonb) into v_current
    from (select 'variant' as kind,v.id,v.stock from public.product_variants v where v.product_id = p_product_id
      union all select 'bundle',b.id,b.stock from public.inventory_bundles b where b.product_id = p_product_id) q;
  select coalesce(jsonb_agg(jsonb_build_object('kind',i->>'kind','id',(i->>'id')::uuid,'stock',(i->>'stock')::integer)
    order by i->>'kind',(i->>'id')::uuid), '[]'::jsonb) into v_expected from jsonb_array_elements(p_stock_snapshot) i;
  if v_current <> v_expected then raise exception 'El stock cambio desde que abriste el formulario; recarga antes de guardar' using errcode = '40001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',q.kind,'id',q.item->>'id','stock',(q.item->>'stock')::integer)), '[]'::jsonb) into v_requested
    from (select 'variant' as kind,value as item from jsonb_array_elements(p_variants)
      union all select 'bundle',value from jsonb_array_elements(p_bundles)) q where q.item->>'id' is not null;
  if exists (
    select 1 from public.seller_order_items i join public.seller_orders o on o.id = i.order_id
    left join public.product_variants v on v.id = i.variant_id left join public.inventory_bundles b on b.id = i.bundle_id
    where coalesce(v.product_id,b.product_id) = p_product_id and o.status = 'en_proceso' and o.expires_at > clock_timestamp()
    group by i.kind,i.variant_id,i.bundle_id
    having sum(i.quantity) > coalesce((select (requested->>'stock')::integer from jsonb_array_elements(v_requested) requested
      where requested->>'kind' = i.kind and (requested->>'id')::uuid = coalesce(i.variant_id,i.bundle_id)),0)
  ) then raise exception 'No puedes reducir el stock por debajo de las reservas vigentes' using errcode = 'P0002'; end if;
  return public.inventory_update_product_commercial(p_product_id,p_name,p_description,p_category,p_audiences,p_variants,
    p_add_image_paths,p_remove_image_ids,p_sku_base,p_prices,p_bundles,p_comment);
end;
$$;
revoke all on function public.inventory_update_product_commercial(uuid,text,text,text,text[],jsonb,text[],uuid[],text,jsonb,jsonb,text) from authenticated;
revoke all on function public.inventory_update_product_pos_safe(uuid,text,text,text,text[],jsonb,text[],uuid[],text,jsonb,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.inventory_update_product_pos_safe(uuid,text,text,text,text[],jsonb,text[],uuid[],text,jsonb,jsonb,text,jsonb) to authenticated;

commit;