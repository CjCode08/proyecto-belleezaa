begin;

create function public.inventory_audit_users()
returns table (id uuid, full_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id and p.is_active is true and p.role in ('admin', 'personal');

  if v_role is null then
    raise exception 'Sin permiso para consultar auditoría' using errcode = '42501';
  end if;

  return query
  select distinct p.id, p.full_name
  from public.inventory_movements m
  join public.profiles p on p.id = m.user_id
  where v_role = 'admin' or m.user_id = v_user_id
  order by p.full_name, p.id;
end;
$$;

create function public.inventory_audit_list_filtered(
  p_offset integer default 0,
  p_month text default null,
  p_user_id uuid default null
)
returns table (
  id uuid,
  action_type text,
  comment text,
  quantity_change integer,
  created_at timestamptz,
  actor_id uuid,
  actor_name text,
  product_name text,
  variant_size text,
  variant_color text,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_month_start timestamptz;
  v_month_end timestamptz;
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Página de auditoría inválida' using errcode = '22023';
  end if;
  if p_month is not null and p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mes de auditoría inválido' using errcode = '22023';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id and p.is_active is true and p.role in ('admin', 'personal');

  if v_role is null then
    raise exception 'Sin permiso para consultar auditoría' using errcode = '42501';
  end if;

  if p_month is not null then
    v_month_start := make_date(split_part(p_month, '-', 1)::integer, split_part(p_month, '-', 2)::integer, 1)::timestamp
      at time zone 'America/Caracas';
    v_month_end := (make_date(split_part(p_month, '-', 1)::integer, split_part(p_month, '-', 2)::integer, 1) + interval '1 month')::timestamp
      at time zone 'America/Caracas';
  end if;

  return query
  select m.id, m.action_type, m.comment, m.quantity_change, m.created_at,
         p.id, p.full_name, coalesce(pr.name, m.product_snapshot),
         coalesce(v.size, split_part(m.variant_snapshot, ' · ', 1)),
         coalesce(v.color, nullif(split_part(m.variant_snapshot, ' · ', 2), '')),
         count(*) over()
  from public.inventory_movements m
  join public.profiles p on p.id = m.user_id
  left join public.products pr on pr.id = m.product_id
  left join public.product_variants v on v.id = m.variant_id
  where (v_role = 'admin' or m.user_id = v_user_id)
    and (p_user_id is null or m.user_id = p_user_id)
    and (p_month is null or (m.created_at >= v_month_start and m.created_at < v_month_end))
  order by m.created_at desc, m.id desc
  limit 25 offset p_offset;
end;
$$;

revoke all on function public.inventory_audit_users() from public, anon, authenticated;
revoke all on function public.inventory_audit_list_filtered(integer, text, uuid) from public, anon, authenticated;
grant execute on function public.inventory_audit_users() to authenticated;
grant execute on function public.inventory_audit_list_filtered(integer, text, uuid) to authenticated;

commit;