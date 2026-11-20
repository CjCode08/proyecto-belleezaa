begin;

create function public.sellers_can_read_inventory_image(p_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles staff
    where staff.id = (select auth.uid()) and staff.role = 'vendedor' and staff.is_active is true)
    and exists (
      select 1 from public.product_images i join public.products p on p.id = i.product_id
      where i.image_url = p_path and i.image_type = 'almacen' and p.status = 'activo'
        and i.product_id::text = (storage.foldername(p_path))[2]
        and (exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
          or exists (select 1 from public.inventory_bundles b where b.product_id = p.id and b.stock > 0))
    );
$$;

create function public.sellers_inventory_images(p_product_ids uuid[])
returns table (product_id uuid, image_url text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_product_ids is null or cardinality(p_product_ids) > 24 then
    raise exception 'Lista de productos invalida' using errcode = '22023';
  end if;

  return query
    select distinct on (i.product_id) i.product_id, i.image_url
    from public.product_images i
    where i.product_id = any(p_product_ids) and i.image_type = 'almacen'
      and public.sellers_can_read_inventory_image(i.image_url)
    order by i.product_id, i.is_primary desc nulls last, i.display_order asc nulls last, i.id;
end;
$$;

revoke all on function public.sellers_can_read_inventory_image(text) from public, anon, authenticated;
revoke all on function public.sellers_inventory_images(uuid[]) from public, anon, authenticated;
grant execute on function public.sellers_can_read_inventory_image(text) to authenticated;
grant execute on function public.sellers_inventory_images(uuid[]) to authenticated;

create policy "sellers_read_available_inventory_images" on storage.objects
  for select to authenticated
  using (bucket_id = 'inventario-privado' and public.sellers_can_read_inventory_image(name));

commit;