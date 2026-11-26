create or replace function public.admin_sales_dashboard_range(
  p_period text,
  p_range_start date,
  p_range_end date
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_bucket_start date;
  v_bucket_end date;
  v_step interval;
  v_result jsonb;
begin
  if p_period is null or p_period not in ('day', 'month', 'year')
    or p_range_start is null or p_range_end is null or p_range_start > p_range_end then
    raise exception 'Periodo o rango de fechas invalido' using errcode = '22023';
  end if;
  if p_period = 'day' and p_range_start <> p_range_end then
    raise exception 'El periodo diario requiere una sola fecha' using errcode = '22023';
  end if;
  if p_period = 'month' and date_trunc('month', p_range_start::timestamp) <> date_trunc('month', p_range_end::timestamp) then
    raise exception 'El rango mensual debe pertenecer al mismo mes' using errcode = '22023';
  end if;
  if p_period = 'year' and date_trunc('year', p_range_start::timestamp) <> date_trunc('year', p_range_end::timestamp) then
    raise exception 'El rango anual debe pertenecer al mismo año' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.is_active is true
  ) then
    raise exception 'Acceso de administrador requerido' using errcode = '42501';
  end if;

  if p_period = 'year' then
    v_bucket_start := date_trunc('month', p_range_start::timestamp)::date;
    v_bucket_end := date_trunc('month', p_range_end::timestamp)::date;
    v_step := interval '1 month';
  else
    v_bucket_start := p_range_start;
    v_bucket_end := p_range_end;
    v_step := interval '1 day';
  end if;

  with receipts as (
    select r.id, r.paid_on, r.currency, r.amount,
      (r.snapshot->>'total_usd')::numeric as usd_equivalent,
      r.snapshot->>'seller_id' as seller_id,
      coalesce(r.snapshot->>'advisor_name', 'Vendedor') as seller_name,
      coalesce(r.snapshot->>'advisor_username', '') as seller_username,
      coalesce(r.snapshot->'items', '[]'::jsonb) as items
    from public.pos_receipts r
    where r.paid_on between p_range_start and p_range_end
  ), items as (
    select r.id as receipt_id, r.seller_id,
      coalesce(item.value->>'product_id', '') as product_id,
      coalesce(item.value->>'product_name', 'Producto') as product_name,
      coalesce(item.value->>'kind', '') as kind,
      coalesce((item.value->>'quantity')::integer, 0) as quantity,
      coalesce((item.value->>'total_usd')::numeric, 0) as usd_equivalent
    from receipts r
    cross join lateral jsonb_array_elements(r.items) as item(value)
  )
  select jsonb_build_object(
    'period', p_period,
    'start_date', p_range_start,
    'end_date', p_range_end,
    'sales', (
      select jsonb_build_object(
        'receipt_count', count(*),
        'usd_equivalent', coalesce(sum(r.usd_equivalent), 0),
        'usd_collected', coalesce(sum(r.amount) filter (where r.currency = 'divisas'), 0),
        'ves_collected', coalesce(sum(r.amount) filter (where r.currency = 'bolivares'), 0),
        'units_sold', coalesce((select sum(i.quantity) from items i where i.kind = 'variant'), 0),
        'bundles_sold', coalesce((select sum(i.quantity) from items i where i.kind = 'bundle'), 0)
      ) from receipts r
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bucket_date', bucket.bucket_at::date,
        'receipt_count', bucket.receipt_count,
        'usd_equivalent', bucket.usd_equivalent
      ) order by bucket.bucket_at), '[]'::jsonb)
      from (
        select dates.bucket_at, count(r.id) as receipt_count, coalesce(sum(r.usd_equivalent), 0) as usd_equivalent
        from generate_series(v_bucket_start::timestamp, v_bucket_end::timestamp, v_step) as dates(bucket_at)
        left join receipts r
          on r.paid_on >= dates.bucket_at::date
          and r.paid_on < (dates.bucket_at::date + v_step)
        group by dates.bucket_at
      ) bucket
    ),
    'sellers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'seller_id', ranked.seller_id,
        'seller_name', ranked.seller_name,
        'seller_username', ranked.seller_username,
        'receipt_count', ranked.receipt_count,
        'usd_equivalent', ranked.usd_equivalent,
        'units_sold', coalesce(item_totals.units_sold, 0),
        'bundles_sold', coalesce(item_totals.bundles_sold, 0)
      ) order by ranked.usd_equivalent desc, ranked.seller_name), '[]'::jsonb)
      from (
        select r.seller_id, max(r.seller_name) as seller_name, max(r.seller_username) as seller_username,
          count(*) as receipt_count, sum(r.usd_equivalent) as usd_equivalent
        from receipts r group by r.seller_id
      ) ranked
      left join (
        select i.seller_id,
          sum(i.quantity) filter (where i.kind = 'variant') as units_sold,
          sum(i.quantity) filter (where i.kind = 'bundle') as bundles_sold
        from items i group by i.seller_id
      ) item_totals on item_totals.seller_id = ranked.seller_id
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_id', product.product_id,
        'product_name', product.product_name,
        'receipt_count', product.receipt_count,
        'units_sold', product.units_sold,
        'bundles_sold', product.bundles_sold,
        'usd_equivalent', product.usd_equivalent
      ) order by product.usd_equivalent desc, product.product_name), '[]'::jsonb)
      from (
        select i.product_id, i.product_name, count(distinct i.receipt_id) as receipt_count,
          coalesce(sum(i.quantity) filter (where i.kind = 'variant'), 0) as units_sold,
          coalesce(sum(i.quantity) filter (where i.kind = 'bundle'), 0) as bundles_sold,
          sum(i.usd_equivalent) as usd_equivalent
        from items i group by i.product_id, i.product_name
      ) product
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_sales_dashboard_range(text, date, date) from public, anon, authenticated;
grant execute on function public.admin_sales_dashboard_range(text, date, date) to authenticated;