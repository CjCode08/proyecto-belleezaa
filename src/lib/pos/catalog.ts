import type { CommercialProduct } from "../catalog/commercial";

export function filterPosSku(products: CommercialProduct[], raw: string): CommercialProduct[] {
  const sku = raw.trim().toUpperCase();
  if (!sku) return [];
  return products.flatMap(product => {
    const variants = product.variants.filter(variant => variant.sku?.toUpperCase().includes(sku));
    return variants.length ? [{ ...product, variants, bundles: [] }] : [];
  });
}