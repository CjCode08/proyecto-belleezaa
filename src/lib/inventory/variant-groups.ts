export type InventoryVariant = {
  id?: string;
  size: string;
  color: string;
  sku: string;
  sku_color_code?: string | null;
  stock: number;
};

export type VariantGroup = {
  key: string;
  size: string;
  colors: { key: string; id?: string; color: string; sku: string; stock: string; colorCode: string; codeEdited: boolean }[];
};

export function groupVariants(variants: InventoryVariant[]): VariantGroup[] {
  const groups = new Map<string, VariantGroup>();
  for (const [index, variant] of variants.entries()) {
    let group = groups.get(variant.size);
    if (!group) {
      group = { key: `size-${index}`, size: variant.size, colors: [] };
      groups.set(variant.size, group);
    }
    group.colors.push({
      key: variant.id ?? `variant-${index}`,
      id: variant.id,
      color: variant.color,
      sku: variant.sku,
      stock: String(variant.stock),
      colorCode: variant.sku_color_code ?? variant.color.trim().charAt(0).toLocaleUpperCase("es"),
      codeEdited: Boolean(variant.sku_color_code),
    });
  }
  return [...groups.values()];
}
