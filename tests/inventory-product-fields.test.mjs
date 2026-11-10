import { test } from "node:test";
import assert from "node:assert/strict";
import { capitalizeInitial, isValidSku, normalizeColor, normalizeSize, normalizeSku, validAudiences } from "../src/lib/inventory/product-fields.ts";

test("normaliza tallas y colores", () => {
  assert.equal(normalizeSize("  xl  "), "XL");
  assert.equal(normalizeSize("única"), "ÚNICA");
  assert.equal(normalizeColor("  ROJO OSCURO  "), "Rojo oscuro");
  assert.equal(normalizeColor("azul"), "Azul");
});

test("capitaliza solamente la inicial y conserva el resto del texto", () => {
  assert.equal(capitalizeInitial("  camisa de algodón"), "  Camisa de algodón");
  assert.equal(capitalizeInitial("ñandú USD"), "Ñandú USD");
  assert.equal(capitalizeInitial(""), "");
});

test("normaliza el SKU y solo admite letras, números y guiones", () => {
  assert.equal(normalizeSku("  bl-123-ñ  "), "BL-123-Ñ");
  assert.equal(isValidSku("BL-123-Ñ"), true);
  assert.equal(isValidSku(""), true);
  assert.equal(isValidSku("A_B"), false);
  assert.equal(isValidSku("A B"), false);
  assert.equal(isValidSku("A/B"), false);
  assert.equal(isValidSku("A".repeat(101)), false);
});

test("valida clasificación múltiple y productos sin clasificar", () => {
  assert.equal(validAudiences(["hombres", "mujeres"], true), true);
  assert.equal(validAudiences([], true), false);
  assert.equal(validAudiences([], false), true);
  assert.equal(validAudiences(["hombres", "hombres"], false), false);
  assert.equal(validAudiences(["otro"], false), false);
});
