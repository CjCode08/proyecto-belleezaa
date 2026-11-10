-- Lectura pública del valor de hoy, sin exponer historial ni datos del administrador.
begin;
create function public.catalog_current_rate()
returns table (rate text, effective_date date)
language sql stable security definer set search_path = ''
as $$
  select r.rate::text, r.effective_date
  from public.exchange_rates r
  where r.currency_from = 'USD' and r.currency_to = 'VES'
    and r.created_by is not null
    and r.effective_date = (now() at time zone 'America/Caracas')::date
  order by r.updated_at desc, r.id desc
  limit 1;
$$;
revoke all on function public.catalog_current_rate() from public, anon, authenticated;
grant execute on function public.catalog_current_rate() to anon, authenticated;
commit;
