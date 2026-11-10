import assert from "node:assert/strict";
import { test } from "node:test";
import { getProductCartTotal, getUnitPriceForQuantity } from "../src/lib/inventory/pricing.ts";

const prices = { unitPrice: 10, promoPrice: 8, wholesalePrice: 6 };

test("aplica el precio correspondiente a cada límite de cantidad", () => {
  for (const [quantity, expected] of [[1, 10], [2, 10], [3, 8], [11, 8], [12, 6], [13, 6]]) {
    assert.equal(getUnitPriceForQuantity(prices, quantity), expected);
  }
});

test("rechaza cantidades inválidas", () => {
  for (const quantity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => getUnitPriceForQuantity(prices, quantity), RangeError);
  }
});

test("no sustituye silenciosamente un precio ausente o inválido", () => {
  assert.throws(() => getUnitPriceForQuantity({ ...prices, promoPrice: null }, 3), RangeError);
  assert.throws(() => getUnitPriceForQuantity({ ...prices, wholesalePrice: null }, 12), RangeError);
  assert.throws(() => getUnitPriceForQuantity({ ...prices, unitPrice: -1 }, 1), RangeError);
  assert.throws(() => getUnitPriceForQuantity({ ...prices, unitPrice: Number.NaN }, 1), RangeError);
});

test("suma las variantes del mismo producto para aplicar el precio correspondiente", () => {
  assert.deepEqual(getProductCartTotal(prices, [1, 1]), { quantity: 2, unitPrice: 10, totalCents: 2000 });
  assert.deepEqual(getProductCartTotal(prices, [1, 2]), { quantity: 3, unitPrice: 8, totalCents: 2400 });
  assert.deepEqual(getProductCartTotal(prices, [5, 6]), { quantity: 11, unitPrice: 8, totalCents: 8800 });
  assert.deepEqual(getProductCartTotal(prices, [5, 7]), { quantity: 12, unitPrice: 6, totalCents: 7200 });
});

test("calcula en centavos y rechaza cantidades o precios inválidos", () => {
  assert.equal(getProductCartTotal({ ...prices, unitPrice: 0.29 }, [2]).totalCents, 58);
  for (const quantities of [[], [0], [1, -1], [1.5], [Number.MAX_SAFE_INTEGER, 1]]) {
    assert.throws(() => getProductCartTotal(prices, quantities), RangeError);
  }
  assert.throws(() => getProductCartTotal({ ...prices, unitPrice: 1.234 }, [1]), RangeError);
  assert.throws(() => getProductCartTotal({ ...prices, unitPrice: Number.MAX_SAFE_INTEGER }, [2]), RangeError);
});
