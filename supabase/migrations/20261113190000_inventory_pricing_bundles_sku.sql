-- PROPUESTA: no ejecutar hasta coordinar la migración con la nueva aplicación.
-- No elimina productos, variantes, SKU, existencias ni precios actuales.
begin;

alter table public.products
  alter column unit_price drop not null,
  add column sku_base text,
  add constraint products_sku_base_format check (
    sku_base is null or (
      length(sku_base) between 1 and 100
      and sku_base = upper(sku_base)
      and sku_base ~ '^[[:alnum:]-]+$'
    )
  );

alter table public.product_variants
  add column sku_color_code text,
  add constraint product_variants_sku_color_code_format check (
    sku_color_code is null or (
      length(sku_color_code) between 1 and 50
      and sku_color_code = upper(sku_color_code)
      and sku_color_code ~ '^[[:alnum:]-]+$'
    )
  );

create table public.inventory_product_prices (
  product_id uuid not null references public.products(id) on delete cascade,
  payment_category text not null check (payment_category in ('bolivares', 'divisas')),
  unit_price_usd numeric(10, 2) check (unit_price_usd >= 0 and unit_price_usd <> 'NaN'::numeric),
  promotion_price_usd numeric(10, 2) check (promotion_price_usd >= 0 and promotion_price_usd <> 'NaN'::numeric),
  promotion_quantity smallint,
  promotion_description text check (
    promotion_description is null or (
      length(btrim(promotion_description)) between 1 and 200 and promotion_price_usd is not null
    )
  ),
  bundle_price_usd numeric(10, 2) check (bundle_price_usd >= 0 and bundle_price_usd <> 'NaN'::numeric),
  needs_review boolean not null default true,
  constraint inventory_promotion_quantity_valid check (
    (promotion_price_usd is null and promotion_quantity is null)
    or (promotion_price_usd is not null and (
      (needs_review and promotion_quantity is null)
      or (promotion_quantity is not null and promotion_quantity in (2, 3, 4))
    ))
  ),
  primary key (product_id, payment_category)
);

create table public.inventory_bundles (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  assortment_description text not null check (length(btrim(assortment_description)) between 1 and 1000),
  stock integer not null default 0 check (stock >= 0)
);

create index inventory_bundles_product_id_idx on public.inventory_bundles(product_id);

alter table public.inventory_product_prices enable row level security;
alter table public.inventory_bundles enable row level security;
revoke all on public.inventory_product_prices, public.inventory_bundles from public, anon, authenticated;
grant select on public.inventory_product_prices, public.inventory_bundles to authenticated;

create policy "inventory_staff_read_product_prices" on public.inventory_product_prices
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active is true and role in ('admin', 'personal')
  ));

create policy "inventory_staff_read_bundles" on public.inventory_bundles
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active is true and role in ('admin', 'personal')
  ));

-- Los importes existentes son referencias por unidad, no nuevas reglas confirmadas.
-- Ambas copias deben revisarse antes de usarse; el mayorista anterior permanece en products.
insert into public.inventory_product_prices (
  product_id, payment_category, unit_price_usd, promotion_price_usd, bundle_price_usd, needs_review
)
select p.id, category.name, p.unit_price, p.promo_price, null, true
from public.products p
cross join (values ('bolivares'), ('divisas')) as category(name);

-- Guarda conjuntamente los datos comerciales de un producto ya existente.
-- No concede escritura directa sobre las tablas nuevas.
create function public.inventory_save_commercial_details(
  p_product_id uuid,
  p_sku_base text,
  p_variant_codes jsonb,
  p_prices jsonb,
  p_bundles jsonb,
  p_comment text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_code text;
  v_size_code text;
  v_sku text;
  v_old_prices jsonb;
  v_old_bundles jsonb;
  v_old_variants jsonb;
  v_new_prices jsonb;
  v_new_bundles jsonb;
  v_new_variants jsonb;
  v_bundle record;
  v_price record;
begin
  select role into v_role from public.profiles
  where id = v_user_id and is_active is true and role in ('admin', 'personal');
  if v_role is null then
    raise exception 'Sin permiso para modificar el inventario' using errcode = '42501';
  end if;
  if p_comment is null or length(btrim(p_comment)) not between 1 and 1000 then
    raise exception 'El comentario es obligatorio' using errcode = '22023';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
  if p_sku_base is not null and (
    length(p_sku_base) not between 1 and 100 or p_sku_base <> upper(p_sku_base)
    or p_sku_base !~ '^[[:alnum:]-]+$'
  ) then raise exception 'SKU base inválido' using errcode = '22023'; end if;
  if p_variant_codes is null or jsonb_typeof(p_variant_codes) <> 'array'
    or p_prices is null or jsonb_typeof(p_prices) <> 'array'
    or p_bundles is null or jsonb_typeof(p_bundles) <> 'array' then
    raise exception 'Datos comerciales inválidos' using errcode = '22023';
  end if;
  if jsonb_array_length(p_variant_codes) > 100 or jsonb_array_length(p_prices) <> 2
    or jsonb_array_length(p_bundles) > 100 then
    raise exception 'Cantidad de datos comerciales inválida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_variant_codes) item where jsonb_typeof(item) <> 'object')
    or exists (select 1 from jsonb_array_elements(p_prices) item where jsonb_typeof(item) <> 'object')
    or exists (select 1 from jsonb_array_elements(p_bundles) item where jsonb_typeof(item) <> 'object') then
    raise exception 'Datos comerciales inválidos' using errcode = '22023';
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_variant_codes)) <> jsonb_array_length(p_variant_codes)
    or jsonb_array_length(p_variant_codes) <> (select count(*) from public.product_variants where product_id = p_product_id)
    or exists (
      select 1 from jsonb_array_elements(p_variant_codes) item
      where not exists (
        select 1 from public.product_variants v
        where v.product_id = p_product_id and v.id::text = item->>'id'
      )
    ) then raise exception 'La lista de variantes no coincide con el producto' using errcode = '22023'; end if;
  if (select count(distinct value->>'payment_category') from jsonb_array_elements(p_prices)) <> 2
    or exists (select 1 from jsonb_array_elements(p_prices) item
      where item->>'payment_category' not in ('bolivares', 'divisas') or item->>'payment_category' is null) then
    raise exception 'Se requieren ambas listas de precios' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_prices) item
    where (item->'unit_price_usd' is not null and jsonb_typeof(item->'unit_price_usd') not in ('number', 'null'))
      or (item->'promotion_price_usd' is not null and jsonb_typeof(item->'promotion_price_usd') not in ('number', 'null'))
      or (item->'promotion_quantity' is not null and jsonb_typeof(item->'promotion_quantity') <> 'null'
        and (jsonb_typeof(item->'promotion_quantity') <> 'number'
          or item->>'promotion_quantity' not in ('2', '3', '4')))
      or (item->'promotion_description' is not null and jsonb_typeof(item->'promotion_description') not in ('string', 'null'))
      or (item->'bundle_price_usd' is not null and jsonb_typeof(item->'bundle_price_usd') not in ('number', 'null'))
  ) then raise exception 'Formato de precios inválido' using errcode = '22023'; end if;
  if jsonb_array_length(p_bundles) > 0 and not exists (
    select 1 from jsonb_array_elements(p_prices) item
    where jsonb_typeof(item->'bundle_price_usd') = 'number'
  ) then raise exception 'Indica el precio del bulto en al menos una forma de pago' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_bundles) item
    where jsonb_typeof(item->'stock') is distinct from 'number'
      or item->>'stock' !~ '^(0|[1-9][0-9]*)$'
  ) then raise exception 'Formato de bulto inválido' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_bundles) item
      where item->>'id' is not null and not exists (
        select 1 from public.inventory_bundles b where b.product_id = p_product_id and b.id::text = item->>'id'
      ))
    or (select count(*) from jsonb_array_elements(p_bundles) item where item->>'id' is not null)
       <> (select count(distinct item->>'id') from jsonb_array_elements(p_bundles) item where item->>'id' is not null) then
    raise exception 'La lista de bultos no es válida' using errcode = '22023';
  end if;
  if v_role <> 'admin' and exists (
    select 1 from public.inventory_bundles b where b.product_id = p_product_id
    and not exists (select 1 from jsonb_array_elements(p_bundles) item where item->>'id' = b.id::text)
  ) then raise exception 'Solo el administrador puede eliminar bultos' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.payment_category), '[]'::jsonb) into v_old_prices
  from public.inventory_product_prices t where t.product_id = p_product_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) into v_old_bundles
  from public.inventory_bundles t where t.product_id = p_product_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'sku', t.sku, 'sku_color_code', t.sku_color_code) order by t.id), '[]'::jsonb)
  into v_old_variants from public.product_variants t where t.product_id = p_product_id;

  update public.product_variants set sku = null where product_id = p_product_id and sku is not null;
  for v_variant in select * from public.product_variants where product_id = p_product_id for update loop
    select nullif(item->>'color_code', '') into v_code
    from jsonb_array_elements(p_variant_codes) item where item->>'id' = v_variant.id::text;
    if p_sku_base is null then
      v_code := null;
      v_sku := null;
    else
      if v_code is null or length(v_code) > 50 or v_code <> upper(v_code)
        or v_code !~ '^[[:alnum:]-]+$' then
        raise exception 'Abreviatura de color inválida' using errcode = '22023';
      end if;
      v_size_code := btrim(upper(regexp_replace(btrim(v_variant.size), '[^[:alnum:]-]+', '-', 'g')), '-');
      if v_size_code = '' then raise exception 'La talla no permite generar un SKU' using errcode = '22023'; end if;
      v_sku := p_sku_base || '-' || v_size_code || '-' || v_code;
      if length(v_sku) > 100 then raise exception 'El SKU generado supera 100 caracteres' using errcode = '22023'; end if;
    end if;
    update public.product_variants set sku = v_sku, sku_color_code = v_code where id = v_variant.id;
  end loop;

  for v_price in
    select * from jsonb_to_recordset(p_prices) as p(
      payment_category text, unit_price_usd numeric, promotion_price_usd numeric, promotion_quantity smallint,
      promotion_description text, bundle_price_usd numeric
    )
  loop
    if (v_price.unit_price_usd is not null and (
        v_price.unit_price_usd::text in ('NaN', 'Infinity', '-Infinity')
        or v_price.unit_price_usd < 0 or v_price.unit_price_usd >= 100000000
        or trunc(v_price.unit_price_usd * 100) <> v_price.unit_price_usd * 100))
      or (v_price.promotion_price_usd is not null and (
        v_price.promotion_price_usd::text in ('NaN', 'Infinity', '-Infinity')
        or v_price.promotion_price_usd < 0 or v_price.promotion_price_usd >= 100000000
        or trunc(v_price.promotion_price_usd * 100) <> v_price.promotion_price_usd * 100))
      or (v_price.bundle_price_usd is not null and (
        v_price.bundle_price_usd::text in ('NaN', 'Infinity', '-Infinity')
        or v_price.bundle_price_usd < 0 or v_price.bundle_price_usd >= 100000000
        or trunc(v_price.bundle_price_usd * 100) <> v_price.bundle_price_usd * 100)) then
      raise exception 'Precio inválido' using errcode = '22023';
    end if;
    insert into public.inventory_product_prices (
      product_id, payment_category, unit_price_usd, promotion_price_usd, promotion_quantity, promotion_description, bundle_price_usd, needs_review
    ) values (
      p_product_id, v_price.payment_category, v_price.unit_price_usd,
      v_price.promotion_price_usd, v_price.promotion_quantity, nullif(btrim(v_price.promotion_description), ''), v_price.bundle_price_usd, false
    ) on conflict (product_id, payment_category) do update set
      unit_price_usd = excluded.unit_price_usd,
      promotion_price_usd = excluded.promotion_price_usd,
      promotion_quantity = excluded.promotion_quantity,
      promotion_description = excluded.promotion_description,
      bundle_price_usd = excluded.bundle_price_usd,
      needs_review = false;
  end loop;

  delete from public.inventory_bundles b where b.product_id = p_product_id
    and not exists (select 1 from jsonb_array_elements(p_bundles) item where item->>'id' = b.id::text);
  for v_bundle in
    select * from jsonb_to_recordset(p_bundles) as b(
      id uuid, assortment_description text, stock integer
    )
  loop
    if v_bundle.id is null then
      insert into public.inventory_bundles (product_id, assortment_description, stock)
      values (p_product_id, btrim(v_bundle.assortment_description), v_bundle.stock);
    else
      update public.inventory_bundles set
        assortment_description = btrim(v_bundle.assortment_description), stock = v_bundle.stock
      where id = v_bundle.id and product_id = p_product_id;
    end if;
  end loop;

  update public.products set sku_base = p_sku_base where id = p_product_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.payment_category), '[]'::jsonb) into v_new_prices
  from public.inventory_product_prices t where t.product_id = p_product_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) into v_new_bundles
  from public.inventory_bundles t where t.product_id = p_product_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'sku', t.sku, 'sku_color_code', t.sku_color_code) order by t.id), '[]'::jsonb)
  into v_new_variants from public.product_variants t where t.product_id = p_product_id;
  if v_product.sku_base is distinct from p_sku_base or v_old_prices is distinct from v_new_prices
    or v_old_bundles is distinct from v_new_bundles or v_old_variants is distinct from v_new_variants then
    insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
    values (
      p_product_id, v_user_id, 'MODIFICACION',
      btrim(p_comment) || ' | Datos comerciales anteriores: ' ||
        jsonb_build_object('sku_base', v_product.sku_base, 'variantes', v_old_variants, 'precios', v_old_prices, 'bultos', v_old_bundles)::text ||
        ' | Datos comerciales nuevos: ' ||
        jsonb_build_object('sku_base', p_sku_base, 'variantes', v_new_variants, 'precios', v_new_prices, 'bultos', v_new_bundles)::text,
      v_product.name
    );
  end if;
end;
$$;

revoke all on function public.inventory_save_commercial_details(uuid, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;

create function public.inventory_create_product_commercial(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_audiences text[],
  p_variants jsonb,
  p_image_paths text[],
  p_sku_base text,
  p_prices jsonb,
  p_bundles jsonb,
  p_comment text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_variant jsonb;
  v_variant_id uuid;
  v_variant_codes jsonb := '[]'::jsonb;
  v_stock integer;
  v_path text;
  v_order integer := 0;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles
    where id = v_user_id and is_active is true and role in ('admin', 'personal')
  ) then raise exception 'Sin permiso para crear productos' using errcode = '42501'; end if;
  if p_product_id is null or exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Identificador de producto inválido' using errcode = '22023';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120
    or p_comment is null or length(btrim(p_comment)) not between 1 and 1000
    or length(coalesce(p_description, '')) > 2000 or length(coalesce(p_category, '')) > 120 then
    raise exception 'Datos del producto o comentario inválidos' using errcode = '22023';
  end if;
  if p_audiences is null or cardinality(p_audiences) not between 1 and 4
    or array_position(p_audiences, null) is not null
    or not (p_audiences <@ array['hombres', 'mujeres', 'ninos', 'ninas']::text[])
    or (select count(distinct value) from unnest(p_audiences) as item(value)) <> cardinality(p_audiences) then
    raise exception 'Clasificación de prenda inválida' using errcode = '22023';
  end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
    or p_bundles is null or jsonb_typeof(p_bundles) <> 'array'
    or jsonb_array_length(p_variants) > 100 or jsonb_array_length(p_bundles) > 100
    or (jsonb_array_length(p_variants) = 0 and jsonb_array_length(p_bundles) = 0) then
    raise exception 'Registra al menos una variante o un bulto' using errcode = '22023';
  end if;
  if p_image_paths is null or cardinality(p_image_paths) > 5 then
    raise exception 'Se permiten hasta cinco imágenes por producto' using errcode = '22023';
  end if;
  foreach v_path in array p_image_paths loop
    if v_path is null or v_path !~ (
      '^' || v_user_id::text || '/' || p_product_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'
    ) then raise exception 'Ruta de imagen inválida' using errcode = '22023'; end if;
  end loop;

  insert into public.products (
    id, name, description, category, audiences, unit_price, promo_price, wholesale_price, status
  ) values (
    p_product_id, btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_category), ''),
    p_audiences, null, null, null, 'activo'
  );
  if nullif(btrim(p_category), '') is not null then
    insert into public.inventory_categories (name) values (btrim(p_category)) on conflict do nothing;
  end if;
  insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
  values (p_product_id, v_user_id, 'CREACION', btrim(p_comment), btrim(p_name));

  for v_variant in select value from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(v_variant) <> 'object'
      or jsonb_typeof(v_variant->'size') is distinct from 'string'
      or jsonb_typeof(v_variant->'color') is distinct from 'string'
      or length(btrim(v_variant->>'size')) not between 1 and 50
      or length(btrim(v_variant->>'color')) not between 1 and 50
      or jsonb_typeof(v_variant->'stock') is distinct from 'number'
      or (v_variant->>'stock') !~ '^(0|[1-9][0-9]*)$'
      or (v_variant->'color_code' is not null and jsonb_typeof(v_variant->'color_code') not in ('string', 'null')) then
      raise exception 'Datos de variante inválidos' using errcode = '22023';
    end if;
    v_stock := (v_variant->>'stock')::integer;
    insert into public.product_variants (product_id, size, color, sku, stock)
    values (p_product_id, btrim(v_variant->>'size'), btrim(v_variant->>'color'), null, v_stock)
    returning id into v_variant_id;
    v_variant_codes := v_variant_codes || jsonb_build_array(jsonb_build_object(
      'id', v_variant_id, 'color_code', v_variant->>'color_code'
    ));
    insert into public.inventory_movements (
      product_id, variant_id, user_id, action_type, quantity_change, comment, product_snapshot, variant_snapshot
    ) values (
      p_product_id, v_variant_id, v_user_id, 'CREACION', v_stock, btrim(p_comment),
      btrim(p_name), btrim(v_variant->>'size') || ' · ' || btrim(v_variant->>'color')
    );
  end loop;

  foreach v_path in array p_image_paths loop
    v_order := v_order + 1;
    insert into public.product_images (product_id, image_url, image_type, display_order, is_primary)
    values (p_product_id, v_path, 'almacen', v_order, v_order = 1);
  end loop;

  perform public.inventory_save_commercial_details(
    p_product_id, p_sku_base, v_variant_codes, p_prices, p_bundles, p_comment
  );
  return p_product_id;
end;
$$;

revoke all on function public.inventory_create_product_commercial(uuid, text, text, text, text[], jsonb, text[], text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.inventory_create_product_commercial(uuid, text, text, text, text[], jsonb, text[], text, jsonb, jsonb, text) to authenticated;

create function public.inventory_update_product_commercial(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_audiences text[],
  p_variants jsonb,
  p_add_image_paths text[],
  p_remove_image_ids uuid[],
  p_sku_base text,
  p_prices jsonb,
  p_bundles jsonb,
  p_comment text
) returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_product public.products%rowtype;
  v_old_variant public.product_variants%rowtype;
  v_variant jsonb;
  v_variant_id uuid;
  v_codes jsonb := '[]'::jsonb;
  v_stock integer;
  v_path text;
  v_removed_paths text[] := array[]::text[];
  v_order integer;
begin
  select role into v_role from public.profiles
  where id = v_user_id and is_active is true and role in ('admin', 'personal');
  if v_role is null then raise exception 'Sin permiso para editar productos' using errcode = '42501'; end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120
    or p_comment is null or length(btrim(p_comment)) not between 1 and 1000
    or length(coalesce(p_description, '')) > 2000 or length(coalesce(p_category, '')) > 120 then
    raise exception 'Datos del producto o comentario inválidos' using errcode = '22023';
  end if;
  if p_audiences is null or cardinality(p_audiences) > 4
    or array_position(p_audiences, null) is not null
    or not (p_audiences <@ array['hombres', 'mujeres', 'ninos', 'ninas']::text[])
    or (select count(distinct value) from unnest(p_audiences) as item(value)) <> cardinality(p_audiences) then
    raise exception 'Clasificación de prenda inválida' using errcode = '22023';
  end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
    or p_bundles is null or jsonb_typeof(p_bundles) <> 'array'
    or jsonb_array_length(p_variants) > 100 or jsonb_array_length(p_bundles) > 100
    or (jsonb_array_length(p_variants) = 0 and jsonb_array_length(p_bundles) = 0)
    or p_add_image_paths is null or cardinality(p_add_image_paths) > 5
    or p_remove_image_ids is null or cardinality(p_remove_image_ids) > 5 then
    raise exception 'Lista de variantes, bultos o imágenes inválida' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_variants) item where item->>'id' is not null)
     <> (select count(distinct item->>'id') from jsonb_array_elements(p_variants) item where item->>'id' is not null) then
    raise exception 'Una variante aparece más de una vez' using errcode = '22023';
  end if;
  select coalesce(array_agg(image_url), array[]::text[]) into v_removed_paths
  from public.product_images
  where product_id = p_product_id and image_type = 'almacen' and id = any(p_remove_image_ids);
  if cardinality(v_removed_paths) <> cardinality(p_remove_image_ids) then
    raise exception 'Una o más imágenes no pertenecen al producto' using errcode = '22023';
  end if;
  foreach v_path in array p_add_image_paths loop
    if v_path is null or v_path !~ (
      '^' || v_user_id::text || '/' || p_product_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'
    ) then raise exception 'Ruta de imagen inválida' using errcode = '22023'; end if;
  end loop;
  if (select count(*) from public.product_images where product_id = p_product_id and image_type = 'almacen')
    - cardinality(v_removed_paths) + cardinality(p_add_image_paths) > 5 then
    raise exception 'Se permiten hasta cinco imágenes por producto' using errcode = '22023';
  end if;

  insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
  values (p_product_id, v_user_id, 'MODIFICACION', btrim(p_comment), v_product.name);
  for v_old_variant in select * from public.product_variants where product_id = p_product_id for update loop
    if not exists (select 1 from jsonb_array_elements(p_variants) item where item->>'id' = v_old_variant.id::text) then
      if v_role <> 'admin' then raise exception 'Solo el administrador puede eliminar variantes' using errcode = '42501'; end if;
      if exists (select 1 from public.order_items where variant_id = v_old_variant.id) then
        raise exception 'No se puede quitar una variante asociada a ventas' using errcode = '23503';
      end if;
      insert into public.inventory_movements (
        product_id, variant_id, user_id, action_type, quantity_change, comment, product_snapshot, variant_snapshot
      ) values (
        p_product_id, v_old_variant.id, v_user_id, 'ELIMINACION', -v_old_variant.stock, btrim(p_comment),
        v_product.name, v_old_variant.size || ' · ' || v_old_variant.color
      );
      delete from public.product_variants where id = v_old_variant.id;
    end if;
  end loop;

  for v_variant in select value from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(v_variant) <> 'object'
      or jsonb_typeof(v_variant->'size') is distinct from 'string'
      or jsonb_typeof(v_variant->'color') is distinct from 'string'
      or length(btrim(v_variant->>'size')) not between 1 and 50
      or length(btrim(v_variant->>'color')) not between 1 and 50
      or jsonb_typeof(v_variant->'stock') is distinct from 'number'
      or (v_variant->>'stock') !~ '^(0|[1-9][0-9]*)$'
      or (v_variant->'color_code' is not null and jsonb_typeof(v_variant->'color_code') not in ('string', 'null')) then
      raise exception 'Datos de variante inválidos' using errcode = '22023';
    end if;
    v_stock := (v_variant->>'stock')::integer;
    if v_variant->>'id' is null then
      insert into public.product_variants (product_id, size, color, sku, stock)
      values (p_product_id, btrim(v_variant->>'size'), btrim(v_variant->>'color'), null, v_stock)
      returning id into v_variant_id;
      insert into public.inventory_movements (
        product_id, variant_id, user_id, action_type, quantity_change, comment, product_snapshot, variant_snapshot
      ) values (
        p_product_id, v_variant_id, v_user_id, 'CREACION', v_stock, btrim(p_comment), btrim(p_name),
        btrim(v_variant->>'size') || ' · ' || btrim(v_variant->>'color')
      );
    else
      v_variant_id := (v_variant->>'id')::uuid;
      select * into v_old_variant from public.product_variants
      where id = v_variant_id and product_id = p_product_id for update;
      if not found then raise exception 'Variante no encontrada en este producto' using errcode = '22023'; end if;
      if v_old_variant.size is distinct from btrim(v_variant->>'size')
        or v_old_variant.color is distinct from btrim(v_variant->>'color')
        or v_old_variant.stock is distinct from v_stock then
        update public.product_variants set size = btrim(v_variant->>'size'),
          color = btrim(v_variant->>'color'), stock = v_stock where id = v_variant_id;
        insert into public.inventory_movements (
          product_id, variant_id, user_id, action_type, quantity_change, comment, product_snapshot, variant_snapshot
        ) values (
          p_product_id, v_variant_id, v_user_id, 'MODIFICACION', v_stock - v_old_variant.stock, btrim(p_comment),
          v_product.name, v_old_variant.size || ' · ' || v_old_variant.color || ' → ' ||
          btrim(v_variant->>'size') || ' · ' || btrim(v_variant->>'color')
        );
      end if;
    end if;
    v_codes := v_codes || jsonb_build_array(jsonb_build_object('id', v_variant_id, 'color_code', v_variant->>'color_code'));
  end loop;

  update public.products set name = btrim(p_name), description = nullif(btrim(p_description), ''),
    category = nullif(btrim(p_category), ''), audiences = p_audiences
  where id = p_product_id;
  if nullif(btrim(p_category), '') is not null then
    insert into public.inventory_categories (name) values (btrim(p_category)) on conflict do nothing;
  end if;
  if v_product.audiences is distinct from p_audiences then
    insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
    values (p_product_id, v_user_id, 'MODIFICACION', btrim(p_comment) || ' | Clasificación: ' ||
      coalesce(nullif(array_to_string(v_product.audiences, ', '), ''), 'sin clasificar') || ' → ' ||
      coalesce(nullif(array_to_string(p_audiences, ', '), ''), 'sin clasificar'), btrim(p_name));
  end if;
  delete from public.product_images
  where product_id = p_product_id and image_type = 'almacen' and id = any(p_remove_image_ids);
  if exists (select 1 from public.product_images where product_id = p_product_id and image_type = 'almacen')
    and not exists (select 1 from public.product_images where product_id = p_product_id and image_type = 'almacen' and is_primary is true) then
    update public.product_images set is_primary = (id = (
      select i.id from public.product_images i where i.product_id = p_product_id and i.image_type = 'almacen'
      order by i.display_order nulls last, i.id limit 1
    )) where product_id = p_product_id and image_type = 'almacen';
  end if;
  select coalesce(max(display_order), 0) into v_order from public.product_images
  where product_id = p_product_id and image_type = 'almacen';
  foreach v_path in array p_add_image_paths loop
    v_order := v_order + 1;
    insert into public.product_images (product_id, image_url, image_type, display_order, is_primary)
    values (p_product_id, v_path, 'almacen', v_order, not exists (
      select 1 from public.product_images where product_id = p_product_id and image_type = 'almacen'
    ));
  end loop;
  perform public.inventory_save_commercial_details(p_product_id, p_sku_base, v_codes, p_prices, p_bundles, p_comment);
  return v_removed_paths;
end;
$$;

revoke all on function public.inventory_update_product_commercial(uuid, text, text, text, text[], jsonb, text[], uuid[], text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.inventory_update_product_commercial(uuid, text, text, text, text[], jsonb, text[], uuid[], text, jsonb, jsonb, text) to authenticated;

-- Desactiva las escrituras anteriores para impedir que omitan las listas comerciales.
-- Coordinar esta transición con el despliegue: el inventario anterior deja de guardar.
do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.inventory_create_product(text,text,text,numeric,numeric,numeric,jsonb,text)',
    'public.inventory_create_product_v2(uuid,text,text,text,numeric,numeric,numeric,jsonb,text[],text)',
    'public.inventory_create_product_v3(uuid,text,text,text,numeric,numeric,numeric,jsonb,text[],text,text[])',
    'public.inventory_update_product(uuid,text,text,text,numeric,numeric,numeric,jsonb,text[],uuid[],text)',
    'public.inventory_update_product_v2(uuid,text,text,text,numeric,numeric,numeric,jsonb,text[],uuid[],text,text[])'
  ] loop
    v_function := to_regprocedure(v_signature);
    if v_function is not null then
      execute format('revoke all on function %s from public, anon, authenticated', v_function);
    end if;
  end loop;
end;
$$;

commit;
