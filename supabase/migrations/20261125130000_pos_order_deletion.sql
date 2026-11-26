begin;

alter table public.seller_orders
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id) on delete restrict,
  add column deleted_by_role text;

alter table public.seller_orders drop constraint if exists seller_orders_status_check;
alter table public.seller_orders add constraint seller_orders_status_check
  check (status in ('en_proceso','completada','cancelada','eliminada'));
alter table public.seller_orders add constraint seller_orders_deletion_audit_check
  check ((status = 'eliminada' and deleted_at is not null and deleted_by is not null and deleted_by_role in ('admin','cajero'))
    or (status <> 'eliminada' and deleted_at is null and deleted_by is null and deleted_by_role is null));
create index seller_orders_deleted_by_idx on public.seller_orders(deleted_by, deleted_at desc) where deleted_at is not null;

create function public.pos_delete_expired_order(p_order uuid, p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_order public.seller_orders%rowtype;
begin
  select p.role into v_role from public.profiles p where p.id = v_actor and p.is_active is true and p.role in ('admin','cajero');
  if v_role is null then raise exception 'Acceso de caja requerido' using errcode = '42501'; end if;
  select * into v_order from public.seller_orders o where o.id = p_order for update;
  if not found then raise exception 'Orden no encontrada' using errcode = 'P0002'; end if;
  if v_order.status = 'eliminada' then return public.pos_get_order(p_order); end if;
  if v_order.status <> 'en_proceso' then raise exception 'Solo se pueden eliminar ordenes impagas' using errcode = '22023'; end if;
  if v_order.revision <> p_revision then raise exception 'La orden cambio; recarga antes de eliminar' using errcode = '40001'; end if;
  if v_order.expires_at > clock_timestamp() then raise exception 'La reserva sigue vigente; no se puede eliminar' using errcode = '22023'; end if;

  insert into public.pos_order_events(order_id, actor_id, revision, snapshot)
    values(p_order, v_actor, v_order.revision, public.pos_get_order(p_order));
  update public.seller_orders o set status = 'eliminada', revision = o.revision + 1,
    deleted_at = clock_timestamp(), deleted_by = v_actor, deleted_by_role = v_role
    where o.id = p_order;
  return public.pos_get_order(p_order);
end;
$$;

-- Recreate the seller listing to expose who deleted the order without granting table access.
drop function public.sellers_list_orders(text, integer);
create function public.sellers_list_orders(p_status text, p_offset integer)
returns table (id uuid, customer_name text, customer_id text, status text, payment_method text,
  total_usd numeric, total_ves numeric, exchange_rate numeric, created_at timestamptz, expires_at timestamptz,
  items jsonb, attention_channel text, deleted_at timestamptz, deleted_by_name text, deleted_by_role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select listed.id, listed.customer_name, listed.customer_id, listed.status, listed.payment_method,
      listed.total_usd, listed.total_ves, listed.exchange_rate, listed.created_at, listed.expires_at,
      listed.items, o.attention_channel, o.deleted_at, actor.full_name, o.deleted_by_role
    from public.sellers_list_orders_base(p_status, p_offset) listed
      join public.seller_orders o on o.id = listed.id
      left join public.profiles actor on actor.id = o.deleted_by
    order by listed.created_at desc, listed.id;
end;
$$;

revoke all on function public.pos_delete_expired_order(uuid, integer) from public, anon, authenticated;
revoke all on function public.sellers_list_orders(text, integer) from public, anon, authenticated;
grant execute on function public.pos_delete_expired_order(uuid, integer) to authenticated;
grant execute on function public.sellers_list_orders(text, integer) to authenticated;

commit;
