-- Lectura pública limitada al catálogo; revisar y ejecutar manualmente.
begin;

create function public.catalog_list_products(p_search text default '', p_offset integer default 0)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  unit_price numeric,
  promo_price numeric,
  wholesale_price numeric,
  variants jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_search is null or char_length(p_search) > 120 or p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Parámetros de catálogo inválidos' using errcode = '22023';
  end if;

  return query
    select p.id, p.name, p.description, p.category, p.unit_price, p.promo_price, p.wholesale_price,
      (select jsonb_agg(jsonb_build_object('id', v.id, 'size', v.size, 'color', v.color)
                        order by v.size, v.color, v.id)
       from public.product_variants v where v.product_id = p.id and v.stock > 0)
    from public.products p
    where p.status = 'activo'
      and exists (select 1 from public.product_variants v where v.product_id = p.id and v.stock > 0)
      and (p_search = '' or strpos(lower(p.name), lower(p_search)) > 0
        or strpos(lower(coalesce(p.category, '')), lower(p_search)) > 0)
    order by p.name, p.id
    limit 25 offset p_offset;
end;
$$;

revoke all on function public.catalog_list_products(text, integer) from public, anon, authenticated;
grant execute on function public.catalog_list_products(text, integer) to anon, authenticated;

commit;
