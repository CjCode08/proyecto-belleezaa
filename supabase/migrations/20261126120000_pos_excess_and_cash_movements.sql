begin;

alter table public.pos_payment_tender
  add column excess_confirmed boolean not null default false;

create function public.pos_close_order_with_excess(
  p_order uuid, p_revision integer, p_key uuid, p_currency text, p_method text,
  p_reference text, p_paid_on date, p_comment text, p_amount numeric, p_received numeric,
  p_excess_confirmed boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_receipt public.pos_receipts%rowtype;
  v_received numeric;
  v_confirmed boolean;
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
      select tender.received_amount, tender.excess_confirmed into v_received, v_confirmed
      from public.pos_payment_tender tender where tender.receipt_id = v_receipt.id;
      if v_received is distinct from p_received then
        raise exception 'El monto recibido no coincide con el cierre anterior; consulta el recibo' using errcode = '22023';
      end if;
      if v_confirmed is distinct from coalesce(p_excess_confirmed, false) then
        raise exception 'La confirmacion no coincide con el cierre anterior; consulta el recibo' using errcode = '22023';
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
  if p_method <> 'efectivo' and p_received > p_amount then
    if p_comment is null or p_comment !~ '[^[:space:]]' then
      raise exception 'Agrega un comentario sobre la diferencia' using errcode = '22023';
    end if;
    if p_excess_confirmed is not true then
      raise exception 'Confirma que el monto recibido es mayor al total' using errcode = '22023';
    end if;
  elsif p_excess_confirmed is true then
    raise exception 'La confirmacion de diferencia no corresponde a este pago' using errcode = '22023';
  end if;

  v_result := public.pos_close_order(p_order,p_revision,p_key,p_currency,p_method,p_reference,p_paid_on,p_comment,p_amount);
  insert into public.pos_payment_tender(receipt_id,received_amount,change_amount,excess_confirmed)
    values ((v_result->'receipt'->>'id')::uuid,p_received,case when p_method = 'efectivo' then p_received - p_amount else 0 end,coalesce(p_excess_confirmed,false));
  return public.pos_get_order(p_order);
end;
$$;

revoke all on function public.pos_close_order_with_tender(uuid,integer,uuid,text,text,text,date,text,numeric,numeric) from public, anon, authenticated;
revoke all on function public.pos_close_order_with_excess(uuid,integer,uuid,text,text,text,date,text,numeric,numeric,boolean) from public, anon, authenticated;
grant execute on function public.pos_close_order_with_excess(uuid,integer,uuid,text,text,text,date,text,numeric,numeric,boolean) to authenticated;

create function public.pos_list_money_movements(p_from date, p_to date, p_offset integer)
returns table (
  movement_type text, receipt_id uuid, order_id uuid, paid_on date, currency text,
  method text, amount numeric, reference text, comment text, registered_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.pos_require_staff();
  if p_offset is null or p_offset not between 0 and 1000000
    or (p_from is not null and p_to is not null and p_from > p_to) then
    raise exception 'Filtro de transacciones invalido' using errcode = '22023';
  end if;

  return query
    with movements as (
      select 'ingreso'::text as movement_type, receipt.id as receipt_id, receipt.order_id,
        receipt.paid_on, receipt.currency, receipt.method, tender.received_amount as amount,
        receipt.reference, receipt.comment, receipt.created_at as registered_at
      from public.pos_receipts receipt
      left join public.pos_payment_tender tender on tender.receipt_id = receipt.id
      where (p_from is null or receipt.paid_on >= p_from) and (p_to is null or receipt.paid_on <= p_to)
      union all
      select 'vuelto'::text, receipt.id, receipt.order_id, receipt.paid_on, receipt.currency,
        receipt.method, tender.change_amount, receipt.reference, receipt.comment, receipt.created_at
      from public.pos_receipts receipt
      join public.pos_payment_tender tender on tender.receipt_id = receipt.id
      where receipt.method = 'efectivo' and tender.change_amount > 0
        and (p_from is null or receipt.paid_on >= p_from) and (p_to is null or receipt.paid_on <= p_to)
    )
    select movement.movement_type, movement.receipt_id, movement.order_id, movement.paid_on,
      movement.currency, movement.method, movement.amount, movement.reference, movement.comment, movement.registered_at
    from movements movement
    order by movement.paid_on desc, movement.registered_at desc, movement.receipt_id desc,
      case when movement.movement_type = 'ingreso' then 0 else 1 end
    limit 25 offset p_offset;
end;
$$;

revoke all on function public.pos_list_money_movements(date,date,integer) from public, anon, authenticated;
grant execute on function public.pos_list_money_movements(date,date,integer) to authenticated;

commit;