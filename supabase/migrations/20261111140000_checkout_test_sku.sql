-- Revisar y ejecutar manualmente. Añade el SKU a las nuevas solicitudes de prueba.
begin;

alter table public.order_items add column checkout_sku text;

create function public.checkout_snapshot_test_sku()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.orders o where o.id = new.order_id and o.checkout_is_test is true) then
    select v.sku into strict new.checkout_sku
    from public.product_variants v where v.id = new.variant_id;
  end if;
  return new;
end;
$$;

revoke all on function public.checkout_snapshot_test_sku() from public, anon, authenticated;

create trigger checkout_snapshot_test_sku
before insert on public.order_items
for each row execute function public.checkout_snapshot_test_sku();

commit;
