-- Revisar antes de ejecutar. Si existen fechas duplicadas, la transacción falla sin borrar datos.
begin;

create unique index exchange_rates_usd_ves_date_unique
  on public.exchange_rates (effective_date)
  where currency_from = 'USD' and currency_to = 'VES'
    and created_by is not null and effective_date is not null;

create table public.exchange_rate_movements (
  id bigint generated always as identity primary key,
  rate_id integer not null,
  action text not null check (action in ('CREACION', 'MODIFICACION', 'ELIMINACION')),
  actor_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now(),
  old_date date,
  old_rate numeric(16, 6),
  old_comment text,
  new_date date,
  new_rate numeric(16, 6),
  new_comment text,
  reason text not null
);
alter table public.exchange_rate_movements enable row level security;
revoke all on public.exchange_rate_movements from public, anon, authenticated;

-- Registrar una instantánea inicial, sin atribuirla falsamente a una operación nueva.
insert into public.exchange_rate_movements
  (rate_id, action, actor_id, occurred_at, new_date, new_rate, new_comment, reason)
select id, 'CREACION', created_by, updated_at, effective_date, rate, comment,
  coalesce(nullif(btrim(comment), ''), 'Registro anterior a la auditoría de tasas')
from public.exchange_rates
where currency_from = 'USD' and currency_to = 'VES'
  and created_by is not null and effective_date is not null;

create or replace function public.inventory_set_exchange_rate_for_date(p_rate numeric, p_comment text, p_effective_date date)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id integer;
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.is_active is true and p.role = 'admin') then
    raise exception 'Solo el administrador puede registrar tasas' using errcode = '42501';
  end if;
  if p_rate is null or p_rate::text in ('NaN', 'Infinity', '-Infinity')
    or p_rate <= 0 or p_rate >= 10000000000 or trunc(p_rate * 1000000) <> p_rate * 1000000
    or p_comment is null or length(btrim(p_comment)) not between 1 and 1000
    or p_effective_date is null or p_effective_date < date '0001-01-01' or p_effective_date > date '9999-12-31' then
    raise exception 'Tasa, fecha o comentario inválidos' using errcode = '22023';
  end if;
  insert into public.exchange_rates (currency_from, currency_to, rate, updated_at, created_by, comment, effective_date)
    values ('USD', 'VES', p_rate, now(), v_user_id, btrim(p_comment), p_effective_date) returning id into v_id;
  insert into public.exchange_rate_movements (rate_id, action, actor_id, new_date, new_rate, new_comment, reason)
    values (v_id, 'CREACION', v_user_id, p_effective_date, p_rate, btrim(p_comment), btrim(p_comment));
end;
$$;

create function public.inventory_edit_exchange_rate(p_id integer, p_expected_updated_at timestamptz, p_rate numeric, p_comment text, p_effective_date date)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.exchange_rates%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.is_active is true and p.role = 'admin') then
    raise exception 'Solo el administrador puede modificar tasas' using errcode = '42501';
  end if;
  if p_rate is null or p_rate::text in ('NaN', 'Infinity', '-Infinity')
    or p_rate <= 0 or p_rate >= 10000000000 or trunc(p_rate * 1000000) <> p_rate * 1000000
    or p_comment is null or length(btrim(p_comment)) not between 1 and 1000
    or p_effective_date is null or p_effective_date < date '0001-01-01' or p_effective_date > date '9999-12-31' then
    raise exception 'Tasa, fecha o comentario inválidos' using errcode = '22023';
  end if;
  select * into v_old from public.exchange_rates r
    where r.id = p_id and r.currency_from = 'USD' and r.currency_to = 'VES'
      and r.created_by is not null and r.effective_date is not null for update;
  if not found or p_expected_updated_at is distinct from v_old.updated_at then
    raise exception 'La tasa cambió o ya no existe; recarga la página' using errcode = 'P0002';
  end if;
  update public.exchange_rates set rate = p_rate, effective_date = p_effective_date,
    comment = btrim(p_comment), created_by = v_user_id, updated_at = clock_timestamp() where id = p_id;
  insert into public.exchange_rate_movements (rate_id, action, actor_id, old_date, old_rate, old_comment, new_date, new_rate, new_comment, reason)
    values (p_id, 'MODIFICACION', v_user_id, v_old.effective_date, v_old.rate, v_old.comment,
      p_effective_date, p_rate, btrim(p_comment), btrim(p_comment));
end;
$$;

create function public.inventory_delete_exchange_rate(p_id integer, p_expected_updated_at timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.exchange_rates%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.is_active is true and p.role = 'admin') then
    raise exception 'Solo el administrador puede eliminar tasas' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'El motivo es obligatorio' using errcode = '22023';
  end if;
  select * into v_old from public.exchange_rates r
    where r.id = p_id and r.currency_from = 'USD' and r.currency_to = 'VES'
      and r.created_by is not null and r.effective_date is not null for update;
  if not found or p_expected_updated_at is distinct from v_old.updated_at then
    raise exception 'La tasa cambió o ya no existe; recarga la página' using errcode = 'P0002';
  end if;
  insert into public.exchange_rate_movements (rate_id, action, actor_id, old_date, old_rate, old_comment, reason)
    values (p_id, 'ELIMINACION', v_user_id, v_old.effective_date, v_old.rate, v_old.comment, btrim(p_reason));
  delete from public.exchange_rates where id = p_id;
end;
$$;

create function public.inventory_exchange_rate_movements(p_offset integer default 0)
returns table (id bigint, action text, actor_name text, occurred_at timestamptz, old_date date, old_rate text, old_comment text,
  new_date date, new_rate text, new_comment text, reason text, total_count bigint)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'admin') then
    raise exception 'Solo el administrador puede consultar movimientos' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Página inválida' using errcode = '22023';
  end if;
  return query select m.id, m.action, p.full_name, m.occurred_at, m.old_date, m.old_rate::text, m.old_comment,
    m.new_date, m.new_rate::text, m.new_comment, m.reason, count(*) over()
    from public.exchange_rate_movements m join public.profiles p on p.id = m.actor_id
    order by m.occurred_at desc, m.id desc limit 20 offset p_offset;
end;
$$;

revoke all on function public.inventory_edit_exchange_rate(integer, timestamptz, numeric, text, date) from public, anon, authenticated;
revoke all on function public.inventory_delete_exchange_rate(integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.inventory_exchange_rate_movements(integer) from public, anon, authenticated;
grant execute on function public.inventory_edit_exchange_rate(integer, timestamptz, numeric, text, date) to authenticated;
grant execute on function public.inventory_delete_exchange_rate(integer, timestamptz, text) to authenticated;
grant execute on function public.inventory_exchange_rate_movements(integer) to authenticated;

commit;
