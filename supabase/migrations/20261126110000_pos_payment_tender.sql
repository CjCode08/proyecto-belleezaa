begin;

create table public.pos_payment_tender (
  receipt_id uuid primary key references public.pos_receipts(id) on delete restrict,
  received_amount numeric(12,2) not null check (received_amount >= 0),
  change_amount numeric(12,2) not null check (change_amount >= 0)
);

alter table public.pos_payment_tender enable row level security;
revoke all on public.pos_payment_tender from public, anon, authenticated;

create or replace function public.pos_get_order(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.pos_require_staff();
  select to_jsonb(o) - 'request_hash' - 'idempotency_key' || jsonb_build_object(
    'advisor_name', p.full_name, 'advisor_username', p.username,
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.product_name, i.id)
      from public.seller_order_items i where i.order_id = o.id), '[]'::jsonb),
    'receipt', (select case when tender.receipt_id is null then r.snapshot
      else jsonb_set(r.snapshot, '{payment}', r.snapshot->'payment' || jsonb_build_object(
        'received_amount', tender.received_amount, 'change_amount', tender.change_amount)) end
      || jsonb_build_object('id', r.id)
      from public.pos_receipts r left join public.pos_payment_tender tender on tender.receipt_id = r.id
      where r.order_id = o.id)
  ) into v_result from public.seller_orders o join public.profiles p on p.id = o.seller_id where o.id = p_order;
  if v_result is null then raise exception 'Orden no encontrada' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;

create function public.pos_close_order_with_tender(
  p_order uuid, p_revision integer, p_key uuid, p_currency text, p_method text,
  p_reference text, p_paid_on date, p_comment text, p_amount numeric, p_received numeric
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_receipt public.pos_receipts%rowtype;
  v_received numeric;
  v_result jsonb;
begin
  v_actor := public.pos_require_staff();
  if p_order is null or p_key is null then raise exception 'Datos del pago invalidos' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pos:' || v_actor::text || ':' || p_key::text,0));
  perform o.id from public.seller_orders o where o.id = p_order for update;
  if not found then raise exception 'Orden no encontrada' using errcode = 'P0002'; end if;
  select * into v_receipt from public.pos_receipts r where r.order_id = p_order;

  if v_receipt.id is not null then
    if p_received is not null then
      select tender.received_amount into v_received from public.pos_payment_tender tender where tender.receipt_id = v_receipt.id;
      if v_received is distinct from p_received then
        raise exception 'El monto recibido no coincide con el cierre anterior; consulta el recibo' using errcode = '22023';
      end if;
    elsif exists (select 1 from public.pos_payment_tender tender where tender.receipt_id = v_receipt.id) then
      raise exception 'Falta el monto recibido del cierre anterior; consulta el recibo' using errcode = '22023';
    end if;
    return public.pos_close_order(p_order,p_revision,p_key,p_currency,p_method,p_reference,p_paid_on,p_comment,p_amount);
  end if;

  if p_received is null then
    raise exception 'No existe un cierre previo; ingresa el monto recibido antes de cobrar' using errcode = '22023';
  end if;
  if p_amount is null or p_received::text in ('NaN','Infinity','-Infinity') or p_received < 0
    or p_received > 9999999999.99 or p_received <> round(p_received,2) then
    raise exception 'Monto recibido invalido' using errcode = '22023';
  end if;
  if p_received < p_amount then raise exception 'El monto recibido es insuficiente' using errcode = '22023'; end if;
  if p_method <> 'efectivo' and p_received <> p_amount then
    raise exception 'El monto recibido debe coincidir con el total para este metodo' using errcode = '22023';
  end if;

  v_result := public.pos_close_order(p_order,p_revision,p_key,p_currency,p_method,p_reference,p_paid_on,p_comment,p_amount);
  insert into public.pos_payment_tender(receipt_id,received_amount,change_amount)
    values ((v_result->'receipt'->>'id')::uuid,p_received,case when p_method = 'efectivo' then p_received - p_amount else 0 end);
  return public.pos_get_order(p_order);
end;
$$;

revoke all on function public.pos_close_order(uuid,integer,uuid,text,text,text,date,text,numeric) from public, anon, authenticated;
revoke all on function public.pos_close_order_with_tender(uuid,integer,uuid,text,text,text,date,text,numeric,numeric) from public, anon, authenticated;
grant execute on function public.pos_close_order_with_tender(uuid,integer,uuid,text,text,text,date,text,numeric,numeric) to authenticated;

commit;