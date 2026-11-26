begin;

create index pos_receipts_paid_on_created_idx
  on public.pos_receipts (paid_on desc, created_at desc, id desc);

create function public.pos_list_transactions(p_from date, p_to date, p_offset integer)
returns table (
  receipt_id uuid,
  order_id uuid,
  paid_on date,
  currency text,
  method text,
  amount numeric,
  reference text,
  comment text,
  registered_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.pos_require_staff();
  if p_offset is null or p_offset not between 0 and 1000000
    or (p_from is not null and p_to is not null and p_from > p_to) then
    raise exception 'Filtro de transacciones invalido' using errcode = '22023';
  end if;

  return query
    select receipt.id, receipt.order_id, receipt.paid_on, receipt.currency,
      receipt.method, receipt.amount, receipt.reference, receipt.comment, receipt.created_at
    from public.pos_receipts receipt
    where (p_from is null or receipt.paid_on >= p_from)
      and (p_to is null or receipt.paid_on <= p_to)
    order by receipt.paid_on desc, receipt.created_at desc, receipt.id desc
    limit 25 offset p_offset;
end;
$$;

revoke all on function public.pos_list_transactions(date, date, integer) from public, anon, authenticated;
grant execute on function public.pos_list_transactions(date, date, integer) to authenticated;

commit;