import { getProductCartTotal, type ProductPrices } from "../inventory/pricing.ts";
import type { Json } from "../supabase/types";

export type CatalogVariant = { id: string; size: string; color: string; stock: number };
export type CartItem = {
  productId: string;
  variantId: string;
  name: string;
  size: string;
  color: string;
  prices: ProductPrices;
  quantity: number;
};

export type CartFeedback = { text: string; checkoutVersion: number | null };

export function cartFeedbackText(feedback: CartFeedback, checkoutVersion: number): string {
  return feedback.checkoutVersion !== null && feedback.checkoutVersion !== checkoutVersion ? "" : feedback.text;
}

export function catalogVariants(value: Json): CatalogVariant[] {
  if (!Array.isArray(value)) throw new Error("Las variantes del catálogo no son válidas.");
  return value.map((variant) => {
    if (!variant || typeof variant !== "object" || Array.isArray(variant) ||
        typeof variant.id !== "string" || typeof variant.size !== "string" || typeof variant.color !== "string" ||
        typeof variant.stock !== "number" || !Number.isSafeInteger(variant.stock) || variant.stock < 1) {
      throw new Error("Una variante del catálogo no es válida.");
    }
    return { id: variant.id, size: variant.size, color: variant.color, stock: variant.stock };
  });
}

export function cartTotals(items: CartItem[]) {
  const groups = new Map<string, CartItem[]>();
  for (const item of items) {
    const group = groups.get(item.productId) ?? [];
    group.push(item);
    groups.set(item.productId, group);
  }
  const prices = new Map<string, number>();
  let totalCents = 0;
  for (const [productId, group] of groups) {
    const total = getProductCartTotal(group[0].prices, group.map((item) => item.quantity));
    prices.set(productId, total.unitPrice);
    totalCents += total.totalCents;
    if (!Number.isSafeInteger(totalCents)) throw new RangeError("El total del carrito es demasiado grande.");
  }
  return { prices, totalCents };
}

export function removeCheckedOutItems(
  items: CartItem[],
  checkedOut: { variantId: string; quantity: number }[],
): CartItem[] {
  const quantities = new Map(checkedOut.map((item) => [item.variantId, item.quantity]));
  return items.filter((item) => quantities.get(item.variantId) !== item.quantity);
}

export function parseCart(raw: string): CartItem[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 100) throw new Error("El carrito guardado no es válido.");
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("El carrito guardado no es válido.");
    const row = item as Record<string, unknown>;
    const prices = row.prices;
    if (typeof row.productId !== "string" || typeof row.variantId !== "string" ||
        typeof row.name !== "string" || typeof row.size !== "string" || typeof row.color !== "string" ||
        !Number.isSafeInteger(row.quantity) || typeof row.quantity !== "number" || row.quantity < 1 || row.quantity > 999 ||
        !prices || typeof prices !== "object" || Array.isArray(prices)) throw new Error("El carrito guardado no es válido.");
    const p = prices as Record<string, unknown>;
    if (typeof p.unitPrice !== "number" || !Number.isFinite(p.unitPrice) || p.unitPrice < 0 ||
        !(p.promoPrice === null || typeof p.promoPrice === "number" && Number.isFinite(p.promoPrice) && p.promoPrice >= 0) ||
        !(p.wholesalePrice === null || typeof p.wholesalePrice === "number" && Number.isFinite(p.wholesalePrice) && p.wholesalePrice >= 0) ||
        seen.has(row.variantId)) throw new Error("El carrito guardado no es válido.");
    seen.add(row.variantId);
    return {
      productId: row.productId, variantId: row.variantId, name: row.name, size: row.size, color: row.color,
      quantity: row.quantity,
      prices: { unitPrice: p.unitPrice, promoPrice: p.promoPrice, wholesalePrice: p.wholesalePrice },
    };
  });
}
