-- Crea productos y variantes junto con su auditoría, en una sola transacción.
-- No habilita escritura directa en tablas ni modificaciones o eliminaciones.
begin;

create function public.inventory_create_product(
  p_name text,
  p_description text,
  p_category text,
  p_unit_price numeric,
  p_promo_price numeric,
  p_wholesale_price numeric,
  p_variants jsonb,
  p_comment text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_id uuid;
  v_variant_id uuid;
  v_variant jsonb;
  v_stock integer;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles
    where id = v_user_id and is_active is true and role in ('admin', 'personal')
  ) then
    raise exception 'Sin permiso para crear productos' using errcode = '42501';
  end if;

  if p_name is null or length(btrim(p_name)) not between 1 and 120
    or p_comment is null or length(btrim(p_comment)) not between 1 and 1000
    or length(coalesce(p_description, '')) > 2000
    or length(coalesce(p_category, '')) > 120 then
    raise exception 'Datos del producto o comentario inválidos' using errcode = '22023';
  end if;

  if p_unit_price is null or p_promo_price is null or p_wholesale_price is null
    or p_unit_price::text in ('NaN', 'Infinity', '-Infinity')
    or p_promo_price::text in ('NaN', 'Infinity', '-Infinity')
    or p_wholesale_price::text in ('NaN', 'Infinity', '-Infinity')
    or p_unit_price < 0 or p_promo_price < 0 or p_wholesale_price < 0
    or p_unit_price >= 100000000 or p_promo_price >= 100000000 or p_wholesale_price >= 100000000
    or trunc(p_unit_price * 100) <> p_unit_price * 100
    or trunc(p_promo_price * 100) <> p_promo_price * 100
    or trunc(p_wholesale_price * 100) <> p_wholesale_price * 100 then
    raise exception 'Precios inválidos' using errcode = '22023';
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
    or jsonb_array_length(p_variants) = 0 then
    raise exception 'Se requiere al menos una variante' using errcode = '22023';
  end if;

  insert into public.products (name, description, category, unit_price, promo_price, wholesale_price, status)
  values (btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_category), ''),
          p_unit_price, p_promo_price, p_wholesale_price, 'activo')
  returning id into v_product_id;

  insert into public.inventory_movements (product_id, user_id, action_type, comment)
  values (v_product_id, v_user_id, 'CREACION', btrim(p_comment));

  for v_variant in select value from jsonb_array_elements(p_variants)
  loop
    if jsonb_typeof(v_variant) <> 'object'
      or jsonb_typeof(v_variant->'size') is distinct from 'string'
      or jsonb_typeof(v_variant->'color') is distinct from 'string'
      or length(btrim(v_variant->>'size')) not between 1 and 50
      or length(btrim(v_variant->>'color')) not between 1 and 50
      or (v_variant->>'sku' is not null and length(v_variant->>'sku') > 100)
      or jsonb_typeof(v_variant->'stock') is distinct from 'number'
      or (v_variant->>'stock') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'Datos de variante inválidos' using errcode = '22023';
    end if;

    v_stock := (v_variant->>'stock')::integer;
    insert into public.product_variants (product_id, size, color, sku, stock)
    values (v_product_id, btrim(v_variant->>'size'), btrim(v_variant->>'color'),
            nullif(btrim(v_variant->>'sku'), ''), v_stock)
    returning id into v_variant_id;

    insert into public.inventory_movements (product_id, variant_id, user_id, action_type, quantity_change, comment)
    values (v_product_id, v_variant_id, v_user_id, 'CREACION', v_stock, btrim(p_comment));
  end loop;

  return v_product_id;
end;
$$;

revoke all on function public.inventory_create_product(text, text, text, numeric, numeric, numeric, jsonb, text) from public, anon;
grant execute on function public.inventory_create_product(text, text, text, numeric, numeric, numeric, jsonb, text) to authenticated;

commit;
