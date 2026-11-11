import assert from "node:assert/strict";
import { test } from "node:test";
import { cartFeedbackText, cartTotals, catalogVariants, parseCart, removeCheckedOutItems } from "../src/lib/catalog/cart.ts";

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

test("retira únicamente las variantes del pedido que no cambiaron en el carrito", () => {
  const changed = { ...item, variantId: "v2", quantity: 3 };
  const added = { ...item, variantId: "v3" };
  assert.deepEqual(removeCheckedOutItems([item, changed, added], [
    { variantId: "v1", quantity: 1 },
    { variantId: "v2", quantity: 2 },
  ]), [changed, added]);
  assert.deepEqual(removeCheckedOutItems([item], [{ variantId: "v1", quantity: 1 }]), []);
  assert.deepEqual(removeCheckedOutItems([added], []), [added]);
});

test("oculta los avisos de productos agregados al completar el checkout sin ocultar errores", () => {
  const success = { text: "Agregado al carrito.", checkoutVersion: 0 };
  const error = { text: "No se pudo agregar al carrito.", checkoutVersion: null };
  assert.equal(cartFeedbackText(success, 0), "Agregado al carrito.");
  assert.equal(cartFeedbackText(success, 1), "");
  assert.equal(cartFeedbackText(error, 1), "No se pudo agregar al carrito.");
  assert.equal(cartFeedbackText({ ...success, checkoutVersion: 1 }, 1), "Agregado al carrito.");
});

test("valida los datos de las variantes públicas", () => {
  const variants = [{ id: "v1", size: "S", color: "Rojo", stock: 1 }, { id: "v2", size: "M", color: "Azul", stock: 12 }];
  assert.deepEqual(catalogVariants(variants), variants);
  assert.throws(() => catalogVariants([{ ...variants[0], size: null }]));
  assert.throws(() => catalogVariants([{ ...variants[0], stock: 0 }]));
  assert.throws(() => catalogVariants([{ ...variants[0], stock: -1 }]));
  assert.throws(() => catalogVariants([{ ...variants[0], stock: 1.5 }]));
  assert.throws(() => catalogVariants([{ ...variants[0], stock: "2" }]));
  assert.throws(() => catalogVariants([{ id: "v1", size: "S", color: "Rojo" }]));
});
