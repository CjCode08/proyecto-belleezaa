begin;

create table public.admin_commission_batches (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete restrict,
  seller_name text not null,
  seller_username text not null,
  range_start date not null,
  range_end date not null,
  commission_percent numeric(5,2) not null check (commission_percent = 12),
  sales_count integer not null check (sales_count > 0),
  total_sales_usd numeric(12,2) not null check (total_sales_usd >= 0),
  commission_usd numeric(12,2) not null check (commission_usd >= 0),
  processed_by uuid not null references public.profiles(id) on delete restrict,
  processed_at timestamptz not null default now(),
  check (range_start <= range_end)
);

create table public.admin_commission_receipts (
  batch_id uuid not null references public.admin_commission_batches(id) on delete restrict,
  receipt_id uuid not null unique references public.pos_receipts(id) on delete restrict,
  paid_on date not null,
  sales_usd numeric(12,2) not null check (sales_usd >= 0),
  primary key (batch_id, receipt_id)
);

create index admin_commission_batches_range_idx
  on public.admin_commission_batches(range_start desc, range_end desc, processed_at desc);
create index admin_commission_batches_seller_idx
  on public.admin_commission_batches(seller_id, processed_at desc);

alter table public.admin_commission_batches enable row level security;
alter table public.admin_commission_receipts enable row level security;
revoke all on public.admin_commission_batches, public.admin_commission_receipts from public, anon, authenticated;

create function public.admin_commission_pending(p_range_start date, p_range_end date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_result jsonb;
begin
  if p_range_start is null or p_range_end is null or p_range_start > p_range_end then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.is_active is true
  ) then
    raise exception 'Acceso de administrador requerido' using errcode = '42501';
  end if;

  with eligible as (
    select r.id, r.snapshot->>'seller_id' as seller_id,
      (r.snapshot->>'total_usd')::numeric as total_sales_usd
    from public.pos_receipts r
    where r.paid_on between p_range_start and p_range_end
      and not exists (
        select 1 from public.admin_commission_receipts processed
        where processed.receipt_id = r.id
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'seller_id', seller.seller_id,
    'seller_name', seller.seller_name,
    'seller_username', seller.seller_username,
    'sales_count', seller.sales_count,
    'total_sales_usd', seller.total_sales_usd,
    'bolivares_sales_usd', seller.bolivares_sales_usd,
    'usd_sales', seller.usd_sales,
    'commission_usd', round(seller.total_sales_usd * 0.12, 2)
  ) order by seller.total_sales_usd desc, seller.seller_name), '[]'::jsonb)
  into v_result
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

  return v_result;
end;
$$;

create function public.admin_process_commission(
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
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.is_active is true
  ) then
    raise exception 'Acceso de administrador requerido' using errcode = '42501';
  end if;
  select p.full_name, coalesce(p.username, '')
  into v_seller_name, v_seller_username
  from public.profiles p
  where p.id = p_seller_id and p.role = 'vendedor';
  if not found then
    raise exception 'Vendedor no encontrado' using errcode = 'P0002';
  end if;

  perform receipt.id
  from public.pos_receipts receipt
  where receipt.paid_on between p_range_start and p_range_end
    and receipt.snapshot->>'seller_id' = p_seller_id::text
    and not exists (
      select 1 from public.admin_commission_receipts processed
      where processed.receipt_id = receipt.id
    )
  order by receipt.id
  for update of receipt;

  select count(*)::integer, coalesce(sum((receipt.snapshot->>'total_usd')::numeric), 0)::numeric(12,2)
  into v_sales_count, v_total_sales_usd
  from public.pos_receipts receipt
  where receipt.paid_on between p_range_start and p_range_end
    and receipt.snapshot->>'seller_id' = p_seller_id::text
    and not exists (
      select 1 from public.admin_commission_receipts processed
      where processed.receipt_id = receipt.id
    );
  if v_sales_count = 0 then
    raise exception 'No hay ventas pendientes de comisión para este vendedor y rango' using errcode = 'P0002';
  end if;

  insert into public.admin_commission_batches (
    seller_id, seller_name, seller_username, range_start, range_end,
    commission_percent, sales_count, total_sales_usd, commission_usd, processed_by
  ) values (
    p_seller_id, v_seller_name, v_seller_username, p_range_start, p_range_end,
    12, v_sales_count, v_total_sales_usd, round(v_total_sales_usd * 0.12, 2), v_actor
  ) returning id into v_batch_id;

  insert into public.admin_commission_receipts (batch_id, receipt_id, paid_on, sales_usd)
  select v_batch_id, receipt.id, receipt.paid_on, (receipt.snapshot->>'total_usd')::numeric
  from public.pos_receipts receipt
  where receipt.paid_on between p_range_start and p_range_end
    and receipt.snapshot->>'seller_id' = p_seller_id::text
    and not exists (
      select 1 from public.admin_commission_receipts processed
      where processed.receipt_id = receipt.id
    );
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
    'commission_percent', 12,
    'sales_count', v_sales_count,
    'total_sales_usd', v_total_sales_usd,
    'commission_usd', round(v_total_sales_usd * 0.12, 2)
  );
end;
$$;

create function public.admin_commission_processed(p_offset integer)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_result jsonb;
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Paginacion invalida' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.is_active is true
  ) then
    raise exception 'Acceso de administrador requerido' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_count', (select count(*) from public.admin_commission_batches),
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'seller_id', page.seller_id,
        'seller_name', page.seller_name,
        'seller_username', page.seller_username,
        'range_start', page.range_start,
        'range_end', page.range_end,
        'commission_percent', page.commission_percent,
        'sales_count', page.sales_count,
        'total_sales_usd', page.total_sales_usd,
        'commission_usd', page.commission_usd,
        'processed_by_name', page.processed_by_name,
        'processed_at', page.processed_at
      ) order by page.processed_at desc, page.id desc)
      from (
        select batch.*, processor.full_name as processed_by_name
        from public.admin_commission_batches batch
        join public.profiles processor on processor.id = batch.processed_by
        order by batch.processed_at desc, batch.id desc
        limit 25 offset p_offset
      ) page
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_commission_pending(date, date),
  public.admin_process_commission(uuid, date, date), public.admin_commission_processed(integer)
  from public, anon, authenticated;
grant execute on function public.admin_commission_pending(date, date),
  public.admin_process_commission(uuid, date, date), public.admin_commission_processed(integer)
  to authenticated;

commit;