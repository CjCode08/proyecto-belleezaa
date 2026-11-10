export type ProductPrices = {
  unitPrice: number;
  promoPrice: number | null;
  wholesalePrice: number | null;
};

export function getUnitPriceForQuantity(prices: ProductPrices, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError("La cantidad debe ser un entero positivo.");
  }

  const price = quantity >= 12
    ? prices.wholesalePrice
    : quantity >= 3
      ? prices.promoPrice
      : prices.unitPrice;

  if (price === null || !Number.isFinite(price) || price < 0) {
    throw new RangeError("No hay un precio válido para esta cantidad.");
  }

  return price;
}

export function getProductCartTotal(prices: ProductPrices, variantQuantities: number[]) {
  if (variantQuantities.length === 0 || variantQuantities.some(
    (quantity) => !Number.isSafeInteger(quantity) || quantity <= 0,
  )) {
    throw new RangeError("Cada variante debe tener una cantidad entera positiva.");
  }

  const quantity = variantQuantities.reduce((sum, current) => sum + current, 0);
  if (!Number.isSafeInteger(quantity)) throw new RangeError("La cantidad total es demasiado grande.");
  const unitPrice = getUnitPriceForQuantity(prices, quantity);
  const unitPriceCents = Math.round(unitPrice * 100);
  if (!Number.isSafeInteger(unitPriceCents) || Math.abs(unitPrice * 100 - unitPriceCents) > 1e-6) {
    throw new RangeError("El precio debe tener como máximo dos decimales.");
  }
  const totalCents = unitPriceCents * quantity;
  if (!Number.isSafeInteger(totalCents)) throw new RangeError("El total es demasiado grande.");

  return { quantity, unitPrice, totalCents };
}
