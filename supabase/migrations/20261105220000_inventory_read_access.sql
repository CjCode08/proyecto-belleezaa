-- Lectura únicamente para el inventario; no habilita escrituras ni carga de imágenes.
begin;

grant select on public.products, public.product_variants, public.product_images, public.inventory_movements
  to authenticated;

create policy "inventory_staff_read_products" on public.products
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active is true and role in ('admin', 'personal')
  ));

create policy "inventory_staff_read_variants" on public.product_variants
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active is true and role in ('admin', 'personal')
  ));

create policy "inventory_staff_read_warehouse_images" on public.product_images
  for select to authenticated
  using (image_type = 'almacen' and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active is true and role in ('admin', 'personal')
  ));

create policy "inventory_staff_read_movements" on public.inventory_movements
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active is true
      and (role = 'admin' or (role = 'personal' and inventory_movements.user_id = (select auth.uid())))
  ));

commit;
