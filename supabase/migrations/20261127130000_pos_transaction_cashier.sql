begin;

drop function public.pos_list_money_movements_filtered(date, date, text, integer);

create function public.pos_list_money_movements_filtered(
  p_from date, p_to date, p_currency text, p_offset integer
) returns table (
  movement_type text, receipt_id uuid, order_id uuid, paid_on date, currency text,
  method text, amount numeric, reference text, comment text, registered_at timestamptz,
  cashier_name text, cashier_username text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.pos_require_staff();
  if p_offset is null or p_offset not between 0 and 1000000
    or (p_from is not null and p_to is not null and p_from > p_to)
    or (p_currency is not null and p_currency not in ('bolivares','divisas')) then
    raise exception 'Filtro de transacciones invalido' using errcode = '22023';
  end if;

  return query
    with movements as (
      select 'ingreso'::text as movement_type, receipt.id as receipt_id, receipt.order_id,
        receipt.paid_on, receipt.currency, receipt.method, tender.received_amount as amount,
        receipt.reference, receipt.comment, receipt.created_at as registered_at,
        coalesce(nullif(receipt.snapshot->>'cashier_name', ''), cashier.full_name) as cashier_name,
        cashier.username as cashier_username
      from public.pos_receipts receipt
      join public.profiles cashier on cashier.id = receipt.cashier_id
      left join public.pos_payment_tender tender on tender.receipt_id = receipt.id
      where (p_from is null or receipt.paid_on >= p_from)
        and (p_to is null or receipt.paid_on <= p_to)
        and (p_currency is null or receipt.currency = p_currency)
      union all
      select 'vuelto'::text, receipt.id, receipt.order_id, receipt.paid_on, receipt.currency,
        receipt.method, tender.change_amount, receipt.reference, receipt.comment, receipt.created_at,
        coalesce(nullif(receipt.snapshot->>'cashier_name', ''), cashier.full_name), cashier.username
      from public.pos_receipts receipt
      join public.profiles cashier on cashier.id = receipt.cashier_id
      join public.pos_payment_tender tender on tender.receipt_id = receipt.id
      where receipt.method = 'efectivo' and tender.change_amount > 0
        and (p_from is null or receipt.paid_on >= p_from)
        and (p_to is null or receipt.paid_on <= p_to)
        and (p_currency is null or receipt.currency = p_currency)
    )
    select movement.movement_type, movement.receipt_id, movement.order_id, movement.paid_on,
      movement.currency, movement.method, movement.amount, movement.reference, movement.comment,
      movement.registered_at, movement.cashier_name, movement.cashier_username
    from movements movement
    order by movement.paid_on desc, movement.registered_at desc, movement.receipt_id desc,
      case when movement.movement_type = 'ingreso' then 0 else 1 end
    limit 25 offset p_offset;
end;
$$;

revoke all on function public.pos_list_money_movements_filtered(date,date,text,integer) from public, anon, authenticated;
grant execute on function public.pos_list_money_movements_filtered(date,date,text,integer) to authenticated;

commit;
