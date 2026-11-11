-- PROPUESTA: revisar y ejecutar manualmente. No habilita el checkout.
-- Límite compartido: 30 intentos por cada ventana de 60 segundos, para toda la tienda.
-- Complementa, pero no sustituye, el límite por cliente de Netlify y Turnstile.
begin;

create table public.checkout_shared_limit (
  id boolean primary key default true check (id),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts between 0 and 30)
);
alter table public.checkout_shared_limit enable row level security;
revoke all on public.checkout_shared_limit from public, anon, authenticated;

insert into public.checkout_shared_limit (id, window_started_at, attempts)
values (true, clock_timestamp(), 0);

create function public.checkout_consume_shared_limit()
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit public.checkout_shared_limit%rowtype;
  v_now timestamptz;
begin
  select * into strict v_limit from public.checkout_shared_limit where id = true for update;
  v_now := clock_timestamp();
  if v_now >= v_limit.window_started_at + interval '60 seconds'
    or v_now < v_limit.window_started_at then
    update public.checkout_shared_limit
      set window_started_at = v_now, attempts = 1 where id = true;
    return query select true, 0;
  elsif v_limit.attempts < 30 then
    update public.checkout_shared_limit set attempts = attempts + 1 where id = true;
    return query select true, 0;
  else
    return query select false,
      greatest(1, ceil(extract(epoch from (v_limit.window_started_at + interval '60 seconds' - v_now)))::integer);
  end if;
end;
$$;

revoke all on function public.checkout_consume_shared_limit() from public, anon, authenticated;
grant execute on function public.checkout_consume_shared_limit() to service_role;
commit;
