-- Revisar y ejecutar en Supabase después de la migración de tasa manual.
begin;

alter table public.exchange_rates add column if not exists effective_date date;

-- Las tasas registradas antes de esta migración se asignan al día de su registro en Caracas.
update public.exchange_rates
set effective_date = (updated_at at time zone 'America/Caracas')::date
where created_by is not null and effective_date is null;

create or replace function public.inventory_exchange_rate_context()
returns table (rate text, effective_date date, updated_at timestamptz, actor_name text, comment text, is_today boolean)
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
    select r.rate::text, r.effective_date, r.updated_at, p.full_name, r.comment,
      r.effective_date = (now() at time zone 'America/Caracas')::date
    from public.exchange_rates r
    join public.profiles p on p.id = r.created_by
    where r.currency_from = 'USD' and r.currency_to = 'VES'
      and r.effective_date <= (now() at time zone 'America/Caracas')::date
    order by r.effective_date desc, r.updated_at desc, r.id desc
    limit 1;
end;
$$;

create or replace function public.inventory_exchange_rate_history(p_offset integer default 0)
returns table (rate_id integer, rate text, effective_date date, updated_at timestamptz, actor_name text, comment text, total_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin'
  ) then
    raise exception 'Solo el administrador puede consultar el historial' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Página de historial inválida' using errcode = '22023';
  end if;

  return query
    select r.id, r.rate::text, r.effective_date, r.updated_at, p.full_name, r.comment, count(*) over()
    from public.exchange_rates r
    join public.profiles p on p.id = r.created_by
    where r.currency_from = 'USD' and r.currency_to = 'VES' and r.effective_date is not null
    order by r.effective_date desc, r.updated_at desc, r.id desc
    limit 20 offset p_offset;
end;
$$;

create or replace function public.inventory_set_exchange_rate_for_date(p_rate numeric, p_comment text, p_effective_date date)
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
    or p_comment is null or length(btrim(p_comment)) not between 1 and 1000
    or p_effective_date is null or p_effective_date < date '0001-01-01'
    or p_effective_date > date '9999-12-31' then
    raise exception 'Tasa, fecha o comentario inválidos' using errcode = '22023';
  end if;

  insert into public.exchange_rates (currency_from, currency_to, rate, updated_at, created_by, comment, effective_date)
  values ('USD', 'VES', p_rate, now(), v_user_id, btrim(p_comment), p_effective_date);
end;
$$;

-- Impedir nuevos registros sin fecha mediante el formulario anterior.
revoke execute on function public.inventory_set_exchange_rate(numeric, text) from authenticated;
revoke execute on function public.inventory_current_exchange_rate() from authenticated;
revoke all on function public.inventory_exchange_rate_context() from public, anon, authenticated;
revoke all on function public.inventory_exchange_rate_history(integer) from public, anon, authenticated;
revoke all on function public.inventory_set_exchange_rate_for_date(numeric, text, date) from public, anon, authenticated;
grant execute on function public.inventory_exchange_rate_context() to authenticated;
grant execute on function public.inventory_exchange_rate_history(integer) to authenticated;
grant execute on function public.inventory_set_exchange_rate_for_date(numeric, text, date) to authenticated;

commit;
