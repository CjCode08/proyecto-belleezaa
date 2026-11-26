begin;

create or replace function public.seller_order_reservation_45_minutes()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'en_proceso'
    and new.expires_at between clock_timestamp() + interval '29 minutes'
                           and clock_timestamp() + interval '31 minutes' then
    new.expires_at := clock_timestamp() + interval '45 minutes';
  end if;
  return new;
end;
$$;

drop trigger if exists seller_order_reservation_45_minutes on public.seller_orders;
create trigger seller_order_reservation_45_minutes
before insert or update of expires_at on public.seller_orders
for each row execute function public.seller_order_reservation_45_minutes();

commit;
