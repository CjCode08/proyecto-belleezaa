export const catalogPageSize = 24;
export const maxCatalogSearchLength = 120;

export const catalogAudiences = [
  { value: "hombres", label: "Hombres" },
  { value: "mujeres", label: "Mujeres" },
  { value: "ninos", label: "Niños" },
  { value: "ninas", label: "Niñas" },
] as const;

export function validCatalogAudience(audience: string): boolean {
  return audience === "" || catalogAudiences.some((option) => option.value === audience);
}

export function catalogPageHref(page: number, search: string, audience = "", category = ""): string {
  const params = new URLSearchParams();
  if (search) params.set("buscar", search);
  if (audience) params.set("tipo", audience);
  if (category) params.set("categoria", category);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/catalogo?${query}` : "/catalogo";
}

export function validCatalogSearch(search: string): boolean {
  return search.length <= maxCatalogSearchLength && !/[\u0000-\u001f\u007f]/.test(search);
}
