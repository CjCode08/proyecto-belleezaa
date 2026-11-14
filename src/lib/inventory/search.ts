import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

export const maxInventorySearchLength = 120;

export function inventorySearchError(term: string): string | null {
  if (term.length > maxInventorySearchLength) return "La búsqueda admite hasta 120 caracteres.";
  if (/[\u0000-\u001f\u007f*]/.test(term)) {
    return "La búsqueda no admite el carácter * ni caracteres de control.";
  }
  return null;
}

export function inventoryPageHref(page: number, term: string): string {
  const params = new URLSearchParams();
  if (term) params.set("buscar", term);
  params.set("pagina", String(page));
  return `/inventario?${params}`;
}

export function inventoryProductsQuery(
  supabase: SupabaseClient<Database>,
  term: string,
  page: number,
  pageSize: number,
) {
  let query = supabase
    .from("products")
    .select("id, name, category, audiences, status, catalog_visible, inventory_product_prices(payment_category, unit_price_usd, promotion_price_usd, promotion_quantity, promotion_description, bundle_price_usd, needs_review), inventory_bundles(id, assortment_description, stock), product_variants(id, size, color, sku, stock), sku_match:product_variants(), product_images(id, image_url, display_order, is_primary)", { count: "exact" })
    .order("name")
    .order("id")
    .eq("product_images.image_type", "almacen")
    .order("display_order", { referencedTable: "product_images", ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    const quotedPattern = `"${pattern.replace(/[\\"]/g, "\\$&")}"`;
    query = query
      .ilike("sku_match.sku", pattern)
      .or(`name.ilike.${quotedPattern},category.ilike.${quotedPattern},sku_match.not.is.null`);
  }

  return query;
}
