import { capitalizeInitial, isValidSku, normalizeColor, normalizeSize, normalizeSku } from "./product-fields";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function amount(value: FormDataEntryValue | null): number | null | undefined {
  const raw = text(value);
  if (!raw) return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return undefined;
  const result = Number(raw);
  return Number.isFinite(result) && result < 100000000 ? result : undefined;
}

export function parseCommercialForm(form: FormData, editing: boolean) {
  const base = normalizeSku(text(form.get("skuBase")));
  if (!isValidSku(base)) return { error: "El SKU base solo admite letras, números y guiones." } as const;
  const sizes = form.getAll("size");
  const colors = form.getAll("color");
  const codes = form.getAll("colorCode");
  const stocks = form.getAll("stock");
  const ids = form.getAll("variantId");
  if (sizes.length > 100 || sizes.length !== colors.length || sizes.length !== codes.length ||
      sizes.length !== stocks.length || (editing && sizes.length !== ids.length)) {
    return { error: "Revisa las variantes." } as const;
  }
  const variants = sizes.map((size, index) => {
    const id = editing ? text(ids[index]) : "";
    const rawStock = text(stocks[index]);
    return {
      ...(id ? { id } : {}),
      size: normalizeSize(text(size)),
      color: normalizeColor(text(colors[index])),
      color_code: base ? normalizeSku(text(codes[index])) : null,
      stock: /^(0|[1-9]\d*)$/.test(rawStock) ? Number(rawStock) : -1,
    };
  });
  if (variants.some((variant) => ("id" in variant && variant.id && !uuidPattern.test(variant.id)) ||
      !variant.size || variant.size.length > 50 || !variant.color || variant.color.length > 50 ||
      !Number.isSafeInteger(variant.stock) || variant.stock < 0 || variant.stock > 2147483647 ||
      (base && (!variant.color_code || variant.color_code.length > 50 || !isValidSku(variant.color_code))))) {
    return { error: "Revisa tallas, colores, abreviaturas y existencias." } as const;
  }
  const variantIds = variants.flatMap((variant) => "id" in variant && variant.id ? [variant.id] : []);
  if (new Set(variantIds).size !== variantIds.length) return { error: "Una variante aparece más de una vez." } as const;
  const generated = variants.map((variant) => {
    const size = variant.size.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "");
    return base && size && variant.color_code ? `${base}-${size}-${variant.color_code}` : "";
  });
  if (base && (generated.some((sku) => !sku || sku.length > 100) || new Set(generated).size !== generated.length)) {
    return { error: "Revisa las abreviaturas: cada SKU generado debe ser único y tener hasta 100 caracteres." } as const;
  }

  const prices = [];
  for (const category of ["bolivares", "divisas"] as const) {
    const unit = amount(form.get(`${category}Unit`));
    const promotion = amount(form.get(`${category}Promotion`));
    const bundlePrice = amount(form.get(`${category}Bundle`));
    const descriptionEntry = form.get(`${category}PromotionDescription`);
    const promotionDescription = capitalizeInitial(text(descriptionEntry));
    const quantityEntry = form.get(`${category}PromotionQuantity`);
    const quantity = text(quantityEntry);
    if (unit === undefined || promotion === undefined || bundlePrice === undefined) {
      return { error: "Revisa los precios: usa importes no negativos con hasta dos decimales." } as const;
    }
    if ((descriptionEntry !== null && typeof descriptionEntry !== "string") ||
        promotionDescription.length > 200 || (promotionDescription && promotion === null)) {
      return { error: "La descripción de la promoción admite hasta 200 caracteres y requiere un precio promocional." } as const;
    }
    if ((quantityEntry !== null && typeof quantityEntry !== "string") ||
        (promotion === null ? quantity !== "" : !["2", "3", "4"].includes(quantity))) {
      return { error: `Para la promoción en ${category === "bolivares" ? "bolívares" : "divisas"}, selecciona 2, 3 o 4 unidades junto con su precio.` } as const;
    }
    prices.push({
      payment_category: category,
      unit_price_usd: unit,
      promotion_price_usd: promotion,
      promotion_quantity: promotion === null ? null : Number(quantity),
      promotion_description: promotionDescription || null,
      bundle_price_usd: bundlePrice,
    });
  }

  const bundleIds = form.getAll("bundleId");
  const descriptions = form.getAll("bundleDescription");
  const bundleStocks = form.getAll("bundleStock");
  if (bundleIds.length > 100 || [descriptions, bundleStocks]
    .some((items) => items.length !== bundleIds.length)) {
    return { error: "Revisa los bultos." } as const;
  }
  const bundles = bundleIds.map((value, index) => {
    const id = text(value);
    const stockText = text(bundleStocks[index]);
    return {
      ...(id ? { id } : {}),
      assortment_description: text(descriptions[index]),
      stock: /^(0|[1-9]\d*)$/.test(stockText) ? Number(stockText) : -1,
    };
  });
  if (bundles.some((bundle) => ("id" in bundle && bundle.id && !uuidPattern.test(bundle.id)) ||
      !bundle.assortment_description || bundle.assortment_description.length > 1000 ||
      !Number.isSafeInteger(bundle.stock) || bundle.stock < 0 || bundle.stock > 2147483647)) {
    return { error: "Revisa el surtido y las existencias de los bultos." } as const;
  }
  if (bundles.length && prices.every((item) => item.bundle_price_usd === null)) {
    return { error: "Indica el precio del bulto en al menos una forma de pago." } as const;
  }
  const existingBundleIds = bundles.flatMap((bundle) => "id" in bundle && bundle.id ? [bundle.id] : []);
  if (new Set(existingBundleIds).size !== existingBundleIds.length) return { error: "Un bulto aparece más de una vez." } as const;
  if (variants.length === 0 && bundles.length === 0) return { error: "Registra una variante o un bulto." } as const;
  return { base: base || null, variants, prices, bundles } as const;
}
