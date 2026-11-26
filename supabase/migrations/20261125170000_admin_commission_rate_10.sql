begin;

alter table public.admin_commission_batches
  drop constraint if exists admin_commission_batches_commission_percent_check;
alter table public.admin_commission_batches
  add constraint admin_commission_batches_commission_percent_range_check
  check (commission_percent > 0 and commission_percent <= 100);

create or replace function public.admin_weekly_commissions(p_anchor date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_week_start date;
  v_week_end date;
  v_result jsonb;
begin
  if p_anchor is null then
    raise exception 'Fecha de referencia requerida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin' and p.is_active is true) then
    raise exception 'Acceso de administrador requerido' using errcode = '42501';
  end if;

  v_week_start := p_anchor - extract(dow from p_anchor)::integer;
  v_week_end := v_week_start + 6;

  with receipts as (
    select r.id, r.currency, r.amount, r.snapshot,
      r.snapshot->>'seller_id' as seller_id,
      (r.snapshot->>'total_usd')::numeric as usd_equivalent
    from public.pos_receipts r
    where r.paid_on >= v_week_start and r.paid_on < v_week_end + 1
  ), seller_totals as (
    select p.id as seller_id, p.full_name as seller_name, p.username as seller_username,
      count(r.id)::integer as sales_count,
      coalesce(sum(r.usd_equivalent), 0)::numeric(12,2) as total_sales_usd,
      coalesce(sum(r.usd_equivalent) filter (where r.currency = 'bolivares'), 0)::numeric(12,2) as bolivares_sales_usd,
      coalesce(sum(r.amount) filter (where r.currency = 'divisas'), 0)::numeric(12,2) as usd_sales,
      round(coalesce(sum(r.usd_equivalent), 0) * 0.10, 2)::numeric(12,2) as commission_usd
    from public.profiles p
    left join receipts r on r.seller_id = p.id::text
    where p.role = 'vendedor'
    group by p.id, p.full_name, p.username
  )
  select jsonb_build_object(
    'week_start', v_week_start,
    'week_end', v_week_end,
    'commission_percent', 10,
    'sellers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seller_id', s.seller_id,
        'seller_name', s.seller_name,
        'seller_username', s.seller_username,
        'sales_count', s.sales_count,
        'total_sales_usd', s.total_sales_usd,
        'bolivares_sales_usd', s.bolivares_sales_usd,
        'usd_sales', s.usd_sales,
        'commission_usd', s.commission_usd
      ) order by s.total_sales_usd desc, s.seller_name)
      from seller_totals s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_commission_pending(p_range_start date, p_range_end date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_sellers jsonb;
begin
  if p_range_start is null or p_range_end is null or p_range_start > p_range_end then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin' and p.is_active is true) then
    raise exception 'Acceso de administrador requerido' using errcode = '42501';
  end if;

  with eligible as (
    select r.id, r.snapshot->>'seller_id' as seller_id,
      (r.snapshot->>'total_usd')::numeric as total_sales_usd
    from public.pos_receipts r
    where r.paid_on between p_range_start and p_range_end
      and not exists (select 1 from public.admin_commission_receipts processed where processed.receipt_id = r.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'seller_id', seller.seller_id,
    'seller_name', seller.seller_name,
    'seller_username', seller.seller_username,
    'sales_count', seller.sales_count,
    'total_sales_usd', seller.total_sales_usd,
    'bolivares_sales_usd', seller.bolivares_sales_usd,
    'usd_sales', seller.usd_sales,
    'commission_usd', round(seller.total_sales_usd * 0.10, 2)
  ) order by seller.total_sales_usd desc, seller.seller_name), '[]'::jsonb)
  into v_sellers
  from (
    select p.id as seller_id, p.full_name as seller_name, coalesce(p.username, '') as seller_username,
      count(r.id)::integer as sales_count,
      coalesce(sum(r.total_sales_usd), 0)::numeric(12,2) as total_sales_usd,
      coalesce(sum(r.total_sales_usd) filter (where receipt.currency = 'bolivares'), 0)::numeric(12,2) as bolivares_sales_usd,
      coalesce(sum(receipt.amount) filter (where receipt.currency = 'divisas'), 0)::numeric(12,2) as usd_sales
    from public.profiles p
    join eligible r on r.seller_id = p.id::text
    join public.pos_receipts receipt on receipt.id = r.id
    where p.role = 'vendedor'
    group by p.id, p.full_name, p.username
  ) seller;

  return jsonb_build_object('commission_percent', 10, 'sellers', coalesce(v_sellers, '[]'::jsonb));
end;
$$;

create or replace function public.admin_process_commission(
  p_seller_id uuid,
  p_range_start date,
  p_range_end date
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_seller_name text;
  v_seller_username text;
  v_batch_id uuid;
  v_sales_count integer;
  v_total_sales_usd numeric(12,2);
  v_inserted_count integer;
begin
  if p_seller_id is null or p_range_start is null or p_range_end is null or p_range_start > p_range_end then
    raise exception 'Vendedor o rango de fechas invalido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin' and p.is_active is true) then
    raise exception 'Acceso de administrador requerido' using errcode = '42501';
  end if;
  select p.full_name, coalesce(p.username, '') into v_seller_name, v_seller_username
  from public.profiles p where p.id = p_seller_id and p.role = 'vendedor';
  if not found then raise exception 'Vendedor no encontrado' using errcode = 'P0002'; end if;

  perform receipt.id
  from public.pos_receipts receipt
  where receipt.paid_on between p_range_start and p_range_end
    and receipt.snapshot->>'seller_id' = p_seller_id::text
    and not exists (select 1 from public.admin_commission_receipts processed where processed.receipt_id = receipt.id)
  order by receipt.id for update of receipt;

  select count(*)::integer, coalesce(sum((receipt.snapshot->>'total_usd')::numeric), 0)::numeric(12,2)
  into v_sales_count, v_total_sales_usd
  from public.pos_receipts receipt
  where receipt.paid_on between p_range_start and p_range_end
    and receipt.snapshot->>'seller_id' = p_seller_id::text
    and not exists (select 1 from public.admin_commission_receipts processed where processed.receipt_id = receipt.id);
  if v_sales_count = 0 then
    raise exception 'No hay ventas pendientes de comisión para este vendedor y rango' using errcode = 'P0002';
  end if;

  insert into public.admin_commission_batches (
    seller_id, seller_name, seller_username, range_start, range_end,
    commission_percent, sales_count, total_sales_usd, commission_usd, processed_by
  ) values (
    p_seller_id, v_seller_name, v_seller_username, p_range_start, p_range_end,
    10, v_sales_count, v_total_sales_usd, round(v_total_sales_usd * 0.10, 2), v_actor
  ) returning id into v_batch_id;

  insert into public.admin_commission_receipts (batch_id, receipt_id, paid_on, sales_usd)
  select v_batch_id, receipt.id, receipt.paid_on, (receipt.snapshot->>'total_usd')::numeric
  from public.pos_receipts receipt
  where receipt.paid_on between p_range_start and p_range_end
    and receipt.snapshot->>'seller_id' = p_seller_id::text
    and not exists (select 1 from public.admin_commission_receipts processed where processed.receipt_id = receipt.id);
  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> v_sales_count then
    raise exception 'Las ventas cambiaron durante el proceso; consulta y vuelve a intentar' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'seller_id', p_seller_id,
    'seller_name', v_seller_name,
    'seller_username', v_seller_username,
    'range_start', p_range_start,
    'range_end', p_range_end,
    'commission_percent', 10,
    'sales_count', v_sales_count,
    'total_sales_usd', v_total_sales_usd,
    'commission_usd', round(v_total_sales_usd * 0.10, 2)
  );
end;
$$;

revoke all on function public.admin_weekly_commissions(date),
  public.admin_commission_pending(date, date), public.admin_process_commission(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.admin_weekly_commissions(date),
  public.admin_commission_pending(date, date), public.admin_process_commission(uuid, date, date)
  to authenticated;

commit;