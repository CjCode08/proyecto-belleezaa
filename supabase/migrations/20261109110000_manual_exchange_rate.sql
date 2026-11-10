-- Revisar antes de ejecutar en Supabase. Conserva las tasas existentes.
begin;

alter table public.exchange_rates
  alter column rate type numeric(16, 6),
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists comment text;

alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from public, anon, authenticated;

create or replace function public.inventory_current_exchange_rate()
returns table (rate text, updated_at timestamptz, actor_name text, comment text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin'
  ) then
    raise exception 'Solo el administrador puede consultar la tasa' using errcode = '42501';
  end if;

  return query
    select r.rate::text, r.updated_at, p.full_name, r.comment
    from public.exchange_rates r
    join public.profiles p on p.id = r.created_by
    where r.currency_from = 'USD' and r.currency_to = 'VES'
      and r.created_by is not null
    order by r.updated_at desc, r.id desc
    limit 1;
end;
$$;

create or replace function public.inventory_set_exchange_rate(p_rate numeric, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.is_active is true and p.role = 'admin'
  ) then
    raise exception 'Solo el administrador puede actualizar la tasa' using errcode = '42501';
  end if;
  if p_rate is null or p_rate::text in ('NaN', 'Infinity', '-Infinity')
    or p_rate <= 0 or p_rate >= 10000000000
    or trunc(p_rate * 1000000) <> p_rate * 1000000
    or p_comment is null or length(btrim(p_comment)) not between 1 and 1000 then
    raise exception 'Tasa o comentario inválidos' using errcode = '22023';
  end if;

  insert into public.exchange_rates (currency_from, currency_to, rate, updated_at, created_by, comment)
  values ('USD', 'VES', p_rate, now(), v_user_id, btrim(p_comment));
end;
$$;

revoke all on function public.inventory_current_exchange_rate() from public, anon, authenticated;
revoke all on function public.inventory_set_exchange_rate(numeric, text) from public, anon, authenticated;
grant execute on function public.inventory_current_exchange_rate() to authenticated;
grant execute on function public.inventory_set_exchange_rate(numeric, text) to authenticated;

commit;
