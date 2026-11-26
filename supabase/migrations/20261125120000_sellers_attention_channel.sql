begin;

alter table public.seller_orders add column attention_channel text
  check (attention_channel is null or attention_channel in ('online','tienda'));

alter function public.sellers_create_order(uuid,text,text,text,jsonb) rename to sellers_create_order_base;
revoke all on function public.sellers_create_order_base(uuid,text,text,text,jsonb) from public,anon,authenticated;

create function public.sellers_create_order(p_key uuid, p_payment_method text, p_customer_name text,
  p_customer_id text, p_items jsonb, p_attention_channel text)
returns table (order_id uuid, status text, total_usd numeric, total_ves numeric, exchange_rate numeric,
  rate_date date, expires_at timestamptz, reused boolean)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_previous_channel text; v_result record;
begin
  if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'vendedor' and p.is_active is true) then
    raise exception 'Acceso de vendedor requerido' using errcode = '42501';
  end if;
  if p_attention_channel is null or p_attention_channel not in ('online','tienda') then
    raise exception 'Selecciona Online o En tienda' using errcode = '22023';
  end if;
  if p_key is null then raise exception 'Clave de pedido invalida' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || p_key::text,0));
  select o.attention_channel into v_previous_channel from public.seller_orders o
    where o.seller_id = v_actor and o.idempotency_key = p_key;
  if found and v_previous_channel is not null and v_previous_channel <> p_attention_channel then
    raise exception 'No puedes cambiar la atencion de un pedido ya creado al reintentar' using errcode = '22023';
  end if;
  select * into v_result from public.sellers_create_order_base(p_key,p_payment_method,p_customer_name,p_customer_id,p_items);
  if not v_result.reused then
    update public.seller_orders o set attention_channel = p_attention_channel where o.id = v_result.order_id;
  end if;
  return query select v_result.order_id,v_result.status,v_result.total_usd,v_result.total_ves,
    v_result.exchange_rate,v_result.rate_date,v_result.expires_at,v_result.reused;
end;
$$;

alter function public.sellers_list_orders(text,integer) rename to sellers_list_orders_base;
revoke all on function public.sellers_list_orders_base(text,integer) from public,anon,authenticated;

create function public.sellers_list_orders(p_status text, p_offset integer)
returns table (id uuid, customer_name text, customer_id text, status text, payment_method text,
  total_usd numeric, total_ves numeric, exchange_rate numeric, created_at timestamptz, expires_at timestamptz,
  items jsonb, attention_channel text)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select listed.id,listed.customer_name,listed.customer_id,listed.status,listed.payment_method,
    listed.total_usd,listed.total_ves,listed.exchange_rate,listed.created_at,listed.expires_at,listed.items,o.attention_channel
  from public.sellers_list_orders_base(p_status,p_offset) listed
  join public.seller_orders o on o.id = listed.id
  order by listed.created_at desc,listed.id;
end;
$$;

revoke all on function public.sellers_create_order(uuid,text,text,text,jsonb,text), public.sellers_list_orders(text,integer) from public,anon,authenticated;
grant execute on function public.sellers_create_order(uuid,text,text,text,jsonb,text), public.sellers_list_orders(text,integer) to authenticated;

commit;