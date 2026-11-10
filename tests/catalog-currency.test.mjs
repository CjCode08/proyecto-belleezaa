import assert from "node:assert/strict";
import { test } from "node:test";
import { convertUsdCentsToVesCents, formatVesCents } from "../src/lib/catalog/currency.ts";

test("convierte en enteros y redondea una vez a centavos", () => {
  assert.equal(convertUsdCentsToVesCents(1000, "897.538300"), 897538n);
  assert.equal(convertUsdCentsToVesCents(1, "0.500000"), 1n);
  assert.equal(convertUsdCentsToVesCents(1, "0.499999"), 0n);
  assert.equal(formatVesCents(123456n), "Bs. 1.234,56");
});

test("rechaza datos de entrada inválidos", () => {
  for (const amount of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => convertUsdCentsToVesCents(amount, "1"), RangeError);
  }
  assert.throws(() => convertUsdCentsToVesCents(1, "0"), RangeError);
  assert.throws(() => convertUsdCentsToVesCents(1, "1.0000001"), RangeError);
});
