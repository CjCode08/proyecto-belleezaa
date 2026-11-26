begin;

create or replace function public.enforce_seller_active_order_limit()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_active_orders integer;
begin
  if new.status <> 'en_proceso' or new.expires_at <= clock_timestamp() then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('seller-active-orders:' || new.seller_id::text, 0));
  select count(*)::integer into v_active_orders
  from public.seller_orders existing
  where existing.seller_id = new.seller_id
    and existing.status = 'en_proceso'
    and existing.expires_at > clock_timestamp();

  if v_active_orders >= 3 then
    raise exception 'Ya tienes 3 ordenes activas. Completa, elimina o espera a que venza una reserva antes de crear otra.'
      using errcode = 'P0002';
  end if;

  return new;
end;
$$;

drop trigger if exists seller_active_order_limit on public.seller_orders;
create trigger seller_active_order_limit
before insert on public.seller_orders
for each row execute function public.enforce_seller_active_order_limit();

commit;
