import assert from "node:assert/strict";
import { test } from "node:test";
import { cartTotals, catalogVariants, parseCart } from "../src/lib/catalog/cart.ts";

const prices = { unitPrice: 10, promoPrice: 8, wholesalePrice: 6 };
const item = { productId: "p1", variantId: "v1", name: "Prenda", size: "S", color: "Rojo", quantity: 1, prices };

test("aplica la promoción sumando variantes por producto sin mezclar productos", () => {
  const items = [item, { ...item, variantId: "v2", quantity: 2 }, { ...item, productId: "p2", variantId: "v3", quantity: 1 }];
  const result = cartTotals(items);
  assert.equal(result.prices.get("p1"), 8);
  assert.equal(result.prices.get("p2"), 10);
  assert.equal(result.totalCents, 3400);
});

test("valida y recupera el carrito guardado", () => {
  assert.deepEqual(parseCart(JSON.stringify([item])), [item]);
  assert.throws(() => parseCart(JSON.stringify([item, item])));
  assert.throws(() => parseCart(JSON.stringify([{ ...item, quantity: 0 }])));
  assert.throws(() => parseCart("{"));
});

test("valida los datos de las variantes públicas", () => {
  assert.deepEqual(catalogVariants([{ id: "v1", size: "S", color: "Rojo" }]), [{ id: "v1", size: "S", color: "Rojo" }]);
  assert.throws(() => catalogVariants([{ id: "v1", size: null, color: "Rojo" }]));
});
