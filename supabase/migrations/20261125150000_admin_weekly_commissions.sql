begin;

create function public.admin_weekly_commissions(p_anchor date)
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

  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.is_active is true
  ) then
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
      round(coalesce(sum(r.usd_equivalent), 0) * 0.12, 2)::numeric(12,2) as commission_usd
    from public.profiles p
    left join receipts r on r.seller_id = p.id::text
    where p.role = 'vendedor'
    group by p.id, p.full_name, p.username
  )
  select jsonb_build_object(
    'week_start', v_week_start,
    'week_end', v_week_end,
    'commission_percent', 12,
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

revoke all on function public.admin_weekly_commissions(date) from public, anon, authenticated;
grant execute on function public.admin_weekly_commissions(date) to authenticated;

commit;