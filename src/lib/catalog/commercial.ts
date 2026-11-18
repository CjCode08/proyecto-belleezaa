export type CommercialPrice = {
  payment_category: "bolivares" | "divisas";
  unit_price_usd: number | null;
  promotion_price_usd: number | null;
  promotion_quantity: number | null;
  promotion_description: string | null;
  bundle_price_usd: number | null;
};
export type CommercialBundle = { id: string; description: string; stock: number };
export type CommercialVariant = { id: string; size: string; color: string; stock: number };
export type CommercialProduct = { id: string; name: string; description: string | null; category: string | null; variants: CommercialVariant[]; prices: CommercialPrice[]; bundles: CommercialBundle[] };
export type CommercialItem = { product: CommercialProduct; kind: "variant" | "bundle"; selectionId: string; quantity: number };

export function availableCommercialQuantity(stock: number | null | undefined, currentQuantity = 0): number {
  if (!Number.isSafeInteger(stock) || stock! < 0 || !Number.isSafeInteger(currentQuantity) || currentQuantity < 0) return 0;
  return Math.max(0, Math.min(stock!, 999) - currentQuantity);
}

export function canAddCommercialQuantity(quantity: number, stock: number | null | undefined, currentQuantity = 0): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= availableCommercialQuantity(stock, currentQuantity);
}

export function removeCommercialCheckedOutItems(items: CommercialItem[], checkedOut: { kind: "variant" | "bundle"; id: string; quantity: number }[]): CommercialItem[] {
  return items.filter((item) => !checkedOut.some((row) => row.kind === item.kind && row.id === item.selectionId && row.quantity === item.quantity));
}

export function parseCommercialProduct(value: unknown): CommercialProduct {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Producto inválido.");
  const product = value as Record<string, unknown>;
  if (typeof product.id !== "string" || typeof product.name !== "string"
    || !(product.description === null || typeof product.description === "string")
    || !(product.category === null || typeof product.category === "string")
    || !Array.isArray(product.variants) || !Array.isArray(product.bundles) || !Array.isArray(product.prices)) throw new Error("Producto inválido.");
  for (const variant of product.variants) {
    if (!variant || typeof variant.id !== "string" || typeof variant.size !== "string" || typeof variant.color !== "string"
      || !Number.isSafeInteger(variant.stock) || variant.stock < 1) throw new Error("Variante inválida.");
  }
  for (const bundle of product.bundles) {
    if (!bundle || typeof bundle.id !== "string" || typeof bundle.description !== "string"
      || !Number.isSafeInteger(bundle.stock) || bundle.stock < 1) throw new Error("Bulto inválido.");
  }
  for (const price of product.prices) {
    if (!price || !["bolivares", "divisas"].includes(price.payment_category)
      || ![price.unit_price_usd, price.promotion_price_usd, price.bundle_price_usd].every((amount) => amount === null || typeof amount === "number" && Number.isFinite(amount) && amount >= 0)
      || !(price.promotion_description === null || typeof price.promotion_description === "string")
      || !(price.promotion_quantity === null && price.promotion_price_usd === null || [2, 3, 4].includes(price.promotion_quantity) && price.promotion_price_usd !== null)) throw new Error("Precio inválido.");
  }
  if (new Set(product.prices.map((price) => price.payment_category)).size !== product.prices.length) throw new Error("Precio duplicado.");
  return product as CommercialProduct;
}

export function parseCommercialCart(raw: string): CommercialItem[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > 100) throw new Error("Carrito inválido.");
  const keys = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object"
      || !["variant", "bundle"].includes(item.kind) || typeof item.selectionId !== "string"
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw new Error("Carrito inválido.");
    const product = parseCommercialProduct(item.product);
    const options = item.kind === "variant" ? product.variants : product.bundles;
    if (!options.some((option) => option.id === item.selectionId)) throw new Error("Carrito inválido.");
    const key = `${item.kind}:${item.selectionId}`;
    if (keys.has(key)) throw new Error("Carrito inválido.");
    keys.add(key);
  }
  return parsed as CommercialItem[];
}

export function commercialTotal(items: CommercialItem[], category: CommercialPrice["payment_category"]): number | null {
  let total = 0;
  const grouped = new Map<string, CommercialItem[]>();
  for (const item of items) {
    const group = grouped.get(item.product.id) ?? [];
    group.push(item);
    grouped.set(item.product.id, group);
  }
  for (const group of grouped.values()) {
    const price = group[0].product.prices.find((row) => row.payment_category === category);
    if (!price) return null;
    const quantity = group.filter((item) => item.kind === "variant").reduce((sum, item) => sum + item.quantity, 0);
    const bundles = group.filter((item) => item.kind === "bundle").reduce((sum, item) => sum + item.quantity, 0);
    if (bundles && price.bundle_price_usd === null) return null;
    if (quantity) {
      const promoQuantity = price.promotion_price_usd !== null && price.promotion_quantity ? price.promotion_quantity : 0;
      const promotionalUnits = promoQuantity ? Math.floor(quantity / promoQuantity) * promoQuantity : 0;
      const regularUnits = quantity - promotionalUnits;
      if (regularUnits && price.unit_price_usd === null) return null;
      total += promotionalUnits * Math.round((price.promotion_price_usd ?? 0) * 100);
      total += regularUnits * Math.round((price.unit_price_usd ?? 0) * 100);
    }
    total += bundles * Math.round((price.bundle_price_usd ?? 0) * 100);
  }
  return Number.isSafeInteger(total) ? total : null;
}