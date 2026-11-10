-- Edición, inhabilitación, borrado administrativo e imágenes privadas con auditoría.
-- No habilita INSERT/UPDATE/DELETE directos en las tablas públicas de inventario.
begin;

alter table public.inventory_movements
  add column if not exists product_snapshot text,
  add column if not exists variant_snapshot text;

update public.inventory_movements m
set product_snapshot = p.name
from public.products p
where m.product_id = p.id and m.product_snapshot is null;

update public.inventory_movements m
set variant_snapshot = v.size || ' · ' || v.color
from public.product_variants v
where m.variant_id = v.id and m.variant_snapshot is null;

revoke all on function public.inventory_create_product(text, text, text, numeric, numeric, numeric, jsonb, text)
  from public, anon, authenticated;

create function public.inventory_create_product_v2(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_unit_price numeric,
  p_promo_price numeric,
  p_wholesale_price numeric,
  p_variants jsonb,
  p_image_paths text[],
  p_comment text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_variant_id uuid;
  v_variant jsonb;
  v_stock integer;
  v_path text;
  v_order integer := 0;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles
    where id = v_user_id and is_active is true and role in ('admin', 'personal')
  ) then
    raise exception 'Sin permiso para crear productos' using errcode = '42501';
  end if;
  if p_product_id is null or exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Identificador de producto inválido' using errcode = '22023';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120
    or p_comment is null or length(btrim(p_comment)) not between 1 and 1000
    or length(coalesce(p_description, '')) > 2000 or length(coalesce(p_category, '')) > 120 then
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
    or jsonb_array_length(p_variants) = 0 or jsonb_array_length(p_variants) > 100 then
    raise exception 'Se requiere entre una y cien variantes' using errcode = '22023';
  end if;
  if p_image_paths is null or cardinality(p_image_paths) > 5 then
    raise exception 'Se permiten hasta cinco imágenes por producto' using errcode = '22023';
  end if;
  foreach v_path in array p_image_paths loop
    if v_path is null or v_path !~ (
      '^' || v_user_id::text || '/' || p_product_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'
    ) then
      raise exception 'Ruta de imagen inválida' using errcode = '22023';
    end if;
  end loop;

  insert into public.products (id, name, description, category, unit_price, promo_price, wholesale_price, status)
  values (p_product_id, btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_category), ''),
          p_unit_price, p_promo_price, p_wholesale_price, 'activo');

  insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
  values (p_product_id, v_user_id, 'CREACION', btrim(p_comment), btrim(p_name));

  for v_variant in select value from jsonb_array_elements(p_variants) loop
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
    values (p_product_id, btrim(v_variant->>'size'), btrim(v_variant->>'color'),
            nullif(btrim(v_variant->>'sku'), ''), v_stock)
    returning id into v_variant_id;
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
  return p_product_id;
end;
$$;

create function public.inventory_update_product(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_unit_price numeric,
  p_promo_price numeric,
  p_wholesale_price numeric,
  p_variants jsonb,
  p_add_image_paths text[],
  p_remove_image_ids uuid[],
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
  v_variant jsonb;
  v_variant_id uuid;
  v_stock integer;
  v_old_variant public.product_variants%rowtype;
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
    or jsonb_array_length(p_variants) = 0 or jsonb_array_length(p_variants) > 100
    or p_add_image_paths is null or cardinality(p_add_image_paths) > 5
    or p_remove_image_ids is null or cardinality(p_remove_image_ids) > 5 then
    raise exception 'Lista de variantes o imágenes inválida' using errcode = '22023';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_variants) as items(value)
    where items.value->>'id' is not null
  ) <> (
    select count(distinct items.value->>'id') from jsonb_array_elements(p_variants) as items(value)
    where items.value->>'id' is not null
  ) then
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

  for v_old_variant in
    select * from public.product_variants where product_id = p_product_id for update
  loop
    if not exists (
      select 1 from jsonb_array_elements(p_variants) as items(value)
      where items.value->>'id' = v_old_variant.id::text
    ) then
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
      or (v_variant->>'sku' is not null and length(v_variant->>'sku') > 100)
      or jsonb_typeof(v_variant->'stock') is distinct from 'number'
      or (v_variant->>'stock') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'Datos de variante inválidos' using errcode = '22023';
    end if;
    v_stock := (v_variant->>'stock')::integer;
    if v_stock > 2147483647 then raise exception 'Existencias inválidas' using errcode = '22023'; end if;
    if v_variant->>'id' is null then
      insert into public.product_variants (product_id, size, color, sku, stock)
      values (p_product_id, btrim(v_variant->>'size'), btrim(v_variant->>'color'),
              nullif(btrim(v_variant->>'sku'), ''), v_stock)
      returning id into v_variant_id;
      insert into public.inventory_movements (
        product_id, variant_id, user_id, action_type, quantity_change, comment, product_snapshot, variant_snapshot
      ) values (
        p_product_id, v_variant_id, v_user_id, 'CREACION', v_stock, btrim(p_comment),
        v_product.name, btrim(v_variant->>'size') || ' · ' || btrim(v_variant->>'color')
      );
    else
      begin
        v_variant_id := (v_variant->>'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Identificador de variante inválido' using errcode = '22023';
      end;
      select * into v_old_variant from public.product_variants
      where id = v_variant_id and product_id = p_product_id for update;
      if not found then raise exception 'Variante no encontrada en este producto' using errcode = '22023'; end if;
      if v_old_variant.size is distinct from btrim(v_variant->>'size')
        or v_old_variant.color is distinct from btrim(v_variant->>'color')
        or v_old_variant.sku is distinct from nullif(btrim(v_variant->>'sku'), '')
        or v_old_variant.stock is distinct from v_stock then
        update public.product_variants
        set size = btrim(v_variant->>'size'), color = btrim(v_variant->>'color'),
            sku = nullif(btrim(v_variant->>'sku'), ''), stock = v_stock
        where id = v_variant_id;
        insert into public.inventory_movements (
          product_id, variant_id, user_id, action_type, quantity_change, comment, product_snapshot, variant_snapshot
        ) values (
          p_product_id, v_variant_id, v_user_id, 'MODIFICACION',
          v_stock - v_old_variant.stock, btrim(p_comment), v_product.name,
          v_old_variant.size || ' · ' || v_old_variant.color || ' → ' ||
          btrim(v_variant->>'size') || ' · ' || btrim(v_variant->>'color')
        );
      end if;
    end if;
  end loop;

  update public.products
  set name = btrim(p_name), description = nullif(btrim(p_description), ''),
      category = nullif(btrim(p_category), ''), unit_price = p_unit_price,
      promo_price = p_promo_price, wholesale_price = p_wholesale_price
  where id = p_product_id;

  delete from public.product_images
  where product_id = p_product_id and image_type = 'almacen' and id = any(p_remove_image_ids);
  if exists (
    select 1 from public.product_images where product_id = p_product_id and image_type = 'almacen'
  )
    and not exists (
      select 1 from public.product_images
      where product_id = p_product_id and image_type = 'almacen' and is_primary is true
    ) then
    update public.product_images
    set is_primary = (id = (
      select i.id from public.product_images i
      where i.product_id = p_product_id and i.image_type = 'almacen'
      order by i.display_order nulls last, i.id limit 1
    ))
    where product_id = p_product_id and image_type = 'almacen';
  end if;
  select coalesce(max(display_order), 0) into v_order from public.product_images
  where product_id = p_product_id and image_type = 'almacen';
  foreach v_path in array p_add_image_paths loop
    v_order := v_order + 1;
    insert into public.product_images (product_id, image_url, image_type, display_order, is_primary)
    values (p_product_id, v_path, 'almacen', v_order,
            not exists (
              select 1 from public.product_images
              where product_id = p_product_id and image_type = 'almacen' and is_primary is true
            ));
  end loop;
  return v_removed_paths;
end;
$$;

create function public.inventory_set_product_status(p_product_id uuid, p_status text, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_product public.products%rowtype;
begin
  select role into v_role from public.profiles
  where id = v_user_id and is_active is true and role in ('admin', 'personal');
  if v_role is null then raise exception 'Sin permiso para cambiar el estado' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('activo', 'inhabilitado') or p_comment is null
    or length(btrim(p_comment)) not between 1 and 1000 then
    raise exception 'Estado o comentario inválido' using errcode = '22023';
  end if;
  if v_role = 'personal' and p_status <> 'inhabilitado' then
    raise exception 'El personal solo puede inhabilitar productos' using errcode = '42501';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
  if v_product.status = p_status then raise exception 'El producto ya tiene ese estado' using errcode = '22023'; end if;
  update public.products set status = p_status where id = p_product_id;
  insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
  values (
    p_product_id, v_user_id,
    case when p_status = 'inhabilitado' then 'INHABILITACION' else 'MODIFICACION' end,
    btrim(p_comment), v_product.name
  );
end;
$$;

create function public.inventory_delete_product(p_product_id uuid, p_comment text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_product public.products%rowtype;
  v_image_paths text[];
begin
  select role into v_role from public.profiles
  where id = v_user_id and is_active is true;
  if v_role is distinct from 'admin' then
    raise exception 'Solo el administrador puede eliminar productos' using errcode = '42501';
  end if;
  if p_comment is null or length(btrim(p_comment)) not between 1 and 1000 then
    raise exception 'El comentario de eliminación es obligatorio' using errcode = '22023';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.product_variants v
    join public.order_items oi on oi.variant_id = v.id
    where v.product_id = p_product_id
  ) then
    raise exception 'No se puede eliminar un producto vinculado a pedidos; inhabilítalo' using errcode = '23503';
  end if;

  select coalesce(array_agg(image_url), array[]::text[]) into v_image_paths
  from public.product_images where product_id = p_product_id and image_type = 'almacen';
  insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
  values (p_product_id, v_user_id, 'ELIMINACION', btrim(p_comment), v_product.name);
  delete from public.products where id = p_product_id;
  return v_image_paths;
end;
$$;

create or replace function public.inventory_audit_list(p_offset integer default 0)
returns table (
  id uuid, action_type text, comment text, quantity_change integer, created_at timestamptz,
  actor_name text, product_name text, variant_size text, variant_color text, total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Página de auditoría inválida' using errcode = '22023';
  end if;
  select p.role into v_role from public.profiles p
  where p.id = v_user_id and p.is_active is true and p.role in ('admin', 'personal');
  if v_role is null then raise exception 'Sin permiso para consultar auditoría' using errcode = '42501'; end if;

  return query
  select m.id, m.action_type, m.comment, m.quantity_change, m.created_at,
         p.full_name, coalesce(pr.name, m.product_snapshot),
         coalesce(v.size, split_part(m.variant_snapshot, ' · ', 1)),
         coalesce(v.color, nullif(split_part(m.variant_snapshot, ' · ', 2), '')),
         count(*) over()
  from public.inventory_movements m
  join public.profiles p on p.id = m.user_id
  left join public.products pr on pr.id = m.product_id
  left join public.product_variants v on v.id = m.variant_id
  where v_role = 'admin' or m.user_id = v_user_id
  order by m.created_at desc, m.id desc
  limit 25 offset p_offset;
end;
$$;

revoke all on function public.inventory_create_product_v2(uuid, text, text, text, numeric, numeric, numeric, jsonb, text[], text)
  from public, anon;
revoke all on function public.inventory_update_product(uuid, text, text, text, numeric, numeric, numeric, jsonb, text[], uuid[], text)
  from public, anon;
revoke all on function public.inventory_set_product_status(uuid, text, text) from public, anon;
revoke all on function public.inventory_delete_product(uuid, text) from public, anon;
grant execute on function public.inventory_create_product_v2(uuid, text, text, text, numeric, numeric, numeric, jsonb, text[], text)
  to authenticated;
grant execute on function public.inventory_update_product(uuid, text, text, text, numeric, numeric, numeric, jsonb, text[], uuid[], text)
  to authenticated;
grant execute on function public.inventory_set_product_status(uuid, text, text) to authenticated;
grant execute on function public.inventory_delete_product(uuid, text) to authenticated;
grant execute on function public.inventory_audit_list(integer) to authenticated;

create policy "inventory_staff_upload_own_images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'inventario-privado'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_active is true and role in ('admin', 'personal')
    )
  );

create policy "inventory_staff_read_product_images" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'inventario-privado'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_active is true and role in ('admin', 'personal')
    )
    and exists (
      select 1 from public.product_images i
      where i.image_url = storage.objects.name
        and i.product_id::text = (storage.foldername(storage.objects.name))[2]
        and i.image_type = 'almacen'
    )
  );

create policy "inventory_staff_delete_product_images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'inventario-privado'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_active is true and role in ('admin', 'personal')
    )
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.profiles
        where id = (select auth.uid()) and is_active is true and role = 'admin'
      )
      or exists (
        select 1 from public.products p
        where p.id::text = (storage.foldername(storage.objects.name))[2]
      )
    )
  );

commit;
