-- Lectura de auditoría con nombres, limitada por el rol del usuario autenticado.
begin;

create function public.inventory_audit_list(p_offset integer default 0)
returns table (
  id uuid,
  action_type text,
  comment text,
  quantity_change integer,
  created_at timestamptz,
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
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Página de auditoría inválida' using errcode = '22023';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id and p.is_active is true and p.role in ('admin', 'personal');

  if v_role is null then
    raise exception 'Sin permiso para consultar auditoría' using errcode = '42501';
  end if;

  return query
  select m.id, m.action_type, m.comment, m.quantity_change, m.created_at,
         p.full_name, pr.name, v.size, v.color, count(*) over()
  from public.inventory_movements m
  join public.profiles p on p.id = m.user_id
  left join public.products pr on pr.id = m.product_id
  left join public.product_variants v on v.id = m.variant_id
  where v_role = 'admin' or m.user_id = v_user_id
  order by m.created_at desc, m.id desc
  limit 25 offset p_offset;
end;
$$;

revoke all on function public.inventory_audit_list(integer) from public, anon;
grant execute on function public.inventory_audit_list(integer) to authenticated;

commit;
