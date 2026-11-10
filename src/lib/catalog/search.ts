export const catalogPageSize = 24;
export const maxCatalogSearchLength = 120;

export function catalogPageHref(page: number, search: string): string {
  const params = new URLSearchParams();
  if (search) params.set("buscar", search);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/catalogo?${query}` : "/catalogo";
}

export function validCatalogSearch(search: string): boolean {
  return search.length <= maxCatalogSearchLength && !/[\u0000-\u001f\u007f]/.test(search);
}
