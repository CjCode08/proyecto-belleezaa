-- Imágenes de catálogo separadas y privadas con URLs firmadas para productos visibles.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogo-optimizado', 'catalogo-optimizado', false, 2097152, array['image/webp']);

create function public.catalog_can_read_image(p_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.product_images i
    join public.products p on p.id = i.product_id
    where i.image_type = 'catalogo' and i.image_url = p_path and p.status = 'activo'
      and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
  );
$$;
revoke all on function public.catalog_can_read_image(text) from public, anon, authenticated;
grant execute on function public.catalog_can_read_image(text) to anon, authenticated;

create policy "catalog_public_read_images" on storage.objects for select to anon, authenticated
using (bucket_id = 'catalogo-optimizado' and public.catalog_can_read_image(name));

create policy "catalog_admin_read_images" on storage.objects for select to authenticated
using (bucket_id = 'catalogo-optimizado' and exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin'
));
create policy "catalog_admin_upload_images" on storage.objects for insert to authenticated
with check (bucket_id = 'catalogo-optimizado' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin'));
create policy "catalog_admin_delete_images" on storage.objects for delete to authenticated
using (bucket_id = 'catalogo-optimizado' and exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin'
));

create function public.catalog_product_images(p_product_ids uuid[])
returns table (product_id uuid, image_url text, display_order integer, is_primary boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_product_ids is null or cardinality(p_product_ids) > 24 then
    raise exception 'Lista de productos inválida' using errcode = '22023';
  end if;
  return query select i.product_id, i.image_url, i.display_order, i.is_primary
    from public.product_images i join public.products p on p.id = i.product_id
    where i.product_id = any(p_product_ids) and i.image_type = 'catalogo' and p.status = 'activo'
      and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
    order by i.product_id, i.is_primary desc nulls last, i.display_order asc nulls last, i.id;
end;
$$;

create function public.catalog_manage_images(p_product_id uuid)
returns table (id uuid, image_url text, display_order integer, is_primary boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin') then
    raise exception 'Solo el administrador puede gestionar imágenes' using errcode = '42501';
  end if;
  return query select i.id, i.image_url, i.display_order, i.is_primary from public.product_images i
    where i.product_id = p_product_id and i.image_type = 'catalogo'
    order by i.display_order asc nulls last, i.id;
end;
$$;

create function public.catalog_add_image(p_product_id uuid, p_path text, p_comment text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_count integer;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin') then
    raise exception 'Solo el administrador puede gestionar imágenes' using errcode = '42501';
  end if;
  if p_comment is null or length(btrim(p_comment)) not between 1 and 1000 or p_path is null
    or p_path !~ ('^' || p_product_id::text || '/[0-9a-f-]{36}\.webp$') then
    raise exception 'Datos de imagen inválidos' using errcode = '22023';
  end if;
  select name into v_name from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'catalogo-optimizado' and name = p_path) then
    raise exception 'Imagen no encontrada' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.product_images where image_type = 'catalogo' and image_url = p_path) then
    raise exception 'La imagen ya está registrada' using errcode = '23505';
  end if;
  select count(*) into v_count from public.product_images where product_id = p_product_id and image_type = 'catalogo';
  if v_count >= 5 then raise exception 'Máximo cinco imágenes de catálogo por producto' using errcode = '22023'; end if;
  insert into public.product_images (product_id, image_url, image_type, display_order, is_primary)
    values (p_product_id, p_path, 'catalogo', v_count + 1, v_count = 0);
  insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
    values (p_product_id, auth.uid(), 'MODIFICACION', 'Imagen de catálogo añadida: ' || btrim(p_comment), v_name);
end;
$$;

create function public.catalog_remove_image(p_product_id uuid, p_image_id uuid, p_comment text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_path text;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin') then
    raise exception 'Solo el administrador puede gestionar imágenes' using errcode = '42501';
  end if;
  if p_comment is null or length(btrim(p_comment)) not between 1 and 1000 then
    raise exception 'Comentario obligatorio' using errcode = '22023';
  end if;
  select name into v_name from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
  delete from public.product_images where id = p_image_id and product_id = p_product_id and image_type = 'catalogo'
    returning image_url into v_path;
  if not found then raise exception 'Imagen no encontrada' using errcode = 'P0002'; end if;
  update public.product_images set is_primary = true
    where id = (select i.id from public.product_images i where i.product_id = p_product_id and i.image_type = 'catalogo'
      order by i.display_order asc nulls last, i.id limit 1);
  insert into public.inventory_movements (product_id, user_id, action_type, comment, product_snapshot)
    values (p_product_id, auth.uid(), 'MODIFICACION', 'Imagen de catálogo retirada: ' || btrim(p_comment), v_name);
  return v_path;
end;
$$;

create function public.catalog_delete_product(p_product_id uuid, p_comment text)
returns table (warehouse_paths text[], catalog_paths text[])
language plpgsql security definer set search_path = ''
as $$
declare
  v_catalog_paths text[];
  v_warehouse_paths text[];
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin') then
    raise exception 'Solo el administrador puede eliminar productos' using errcode = '42501';
  end if;
  perform 1 from public.products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
  select coalesce(array_agg(i.image_url), array[]::text[]) into v_catalog_paths
    from public.product_images i where i.product_id = p_product_id and i.image_type = 'catalogo';
  v_warehouse_paths := public.inventory_delete_product(p_product_id, p_comment);
  return query select v_warehouse_paths, v_catalog_paths;
end;
$$;

revoke all on function public.catalog_product_images(uuid[]) from public, anon, authenticated;
revoke all on function public.catalog_manage_images(uuid) from public, anon, authenticated;
revoke all on function public.catalog_add_image(uuid, text, text) from public, anon, authenticated;
revoke all on function public.catalog_remove_image(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.catalog_delete_product(uuid, text) from public, anon, authenticated;
grant execute on function public.catalog_product_images(uuid[]) to anon, authenticated;
grant execute on function public.catalog_manage_images(uuid) to authenticated;
grant execute on function public.catalog_add_image(uuid, text, text) to authenticated;
grant execute on function public.catalog_remove_image(uuid, uuid, text) to authenticated;
grant execute on function public.catalog_delete_product(uuid, text) to authenticated;
commit;
