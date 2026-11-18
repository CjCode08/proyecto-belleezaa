import assert from "node:assert/strict";
import { test } from "node:test";
import { applicablePromotionUnits, availableCommercialQuantity, canAddCommercialQuantity, commercialTotal, parseCommercialCart, parseCommercialProduct, removeCommercialCheckedOutItems } from "../src/lib/catalog/commercial.ts";

const product = { id: "p", prices: [
  { payment_category: "bolivares", unit_price_usd: 10, promotion_price_usd: 8, promotion_quantity: 3, bundle_price_usd: 80 },
  { payment_category: "divisas", unit_price_usd: 9, promotion_price_usd: 7, promotion_quantity: 2, bundle_price_usd: 70 },
] };
const item = { product, kind: "variant", selectionId: "v", quantity: 4 };

test("limita lo que se agrega al stock restante y al máximo del carrito", () => {
  assert.equal(availableCommercialQuantity(5, 3), 2);
  assert.equal(availableCommercialQuantity(1200), 999);
  assert.equal(canAddCommercialQuantity(2, 5, 3), true);
  assert.equal(canAddCommercialQuantity(3, 5, 3), false);
  assert.equal(canAddCommercialQuantity(0, 5), false);
  assert.equal(canAddCommercialQuantity(1.5, 5), false);
  assert.equal(canAddCommercialQuantity(1, null), false);
});

test("determina las unidades promocionales por producto y forma de pago, sin contar bultos", () => {
  const otherVariant = { ...item, selectionId: "v2", quantity: 3 };
  const bundle = { ...item, kind: "bundle", selectionId: "b", quantity: 2 };
  assert.equal(applicablePromotionUnits([item, otherVariant, bundle], "p", "bolivares"), 6);
  assert.equal(applicablePromotionUnits([item, otherVariant], "p", "divisas"), 6);
  assert.equal(applicablePromotionUnits([item], "otro-producto", "divisas"), 0);
});

test("agrupa variantes y aplica promociones completas con unidades restantes", () => {
  assert.equal(commercialTotal([item], "bolivares"), 3400);
  assert.equal(commercialTotal([item], "divisas"), 2800);
  assert.equal(commercialTotal([{ ...item, quantity: 1 }, { ...item, selectionId: "v2", quantity: 2 }], "bolivares"), 2400);
});

test("los bultos se calculan aparte y los precios faltantes no se sustituyen", () => {
  assert.equal(commercialTotal([item, { ...item, kind: "bundle", selectionId: "b", quantity: 1 }], "bolivares"), 11400);
  const onlyBundle = { ...product, prices: [{ ...product.prices[0], unit_price_usd: null }] };
  assert.equal(commercialTotal([{ ...item, product: onlyBundle, quantity: 1 }], "bolivares"), null);
  assert.equal(commercialTotal([{ ...item, product: onlyBundle, quantity: 3 }], "bolivares"), 2400);
  assert.equal(commercialTotal([{ ...item, product: onlyBundle, kind: "bundle", quantity: 1 }], "divisas"), null);
});

test("rechaza carritos guardados inválidos", () => {
  assert.deepEqual(parseCommercialCart("[]"), []);
  assert.throws(() => parseCommercialCart("{"));
  assert.throws(() => parseCommercialCart(JSON.stringify([{ ...item, quantity: 0 }])));
});

test("valida datos comerciales públicos antes de mostrarlos", () => {
  const row = { id: "p", name: "Prenda", description: null, category: null, variants: [{ id: "v", size: "M", color: "Rojo", stock: 2 }], bundles: [], prices: [{ ...product.prices[0], promotion_description: "Oferta" }] };
  assert.deepEqual(parseCommercialProduct(row), row);
  assert.deepEqual(parseCommercialCart(JSON.stringify([{ product: row, kind: "variant", selectionId: "v", quantity: 1 }])), [{ product: row, kind: "variant", selectionId: "v", quantity: 1 }]);
  assert.throws(() => parseCommercialProduct({ ...row, variants: [null] }));
  assert.throws(() => parseCommercialProduct({ ...row, prices: [{ ...row.prices[0], promotion_quantity: null }] }));
  assert.throws(() => parseCommercialCart(JSON.stringify([{ product: row, kind: "bundle", selectionId: "v", quantity: 1 }])));
});

test("limpia solo las presentaciones que no cambiaron durante el checkout", () => {
  const variant = { ...item, quantity: 3 };
  const bundle = { ...item, kind: "bundle", selectionId: "b", quantity: 1 };
  assert.deepEqual(removeCommercialCheckedOutItems([variant, bundle], [
    { kind: "variant", id: "v", quantity: 2 }, { kind: "bundle", id: "b", quantity: 1 },
  ]), [variant]);
});