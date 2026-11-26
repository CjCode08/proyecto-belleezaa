import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../src/app/administracion/page.tsx", import.meta.url), "utf8");

test("la tabla de vendedores usa USD como encabezado y montos sin moneda", () => {
  assert.match(source, /Mejor en ventas: .*seller_name.*chartUsd\.format/);
  assert.doesNotMatch(source, /Mayor venta:/);
  assert.match(source, /chartUsd\.format\(seller\.usd_equivalent\)/);
});

test("las tablas administrativas reducen espaciado y usan montos numéricos", () => {
  assert.match(source, /min-w-\[500px\]/);
  assert.equal((source.match(/>USD<\/th>/g) ?? []).length, 2);
  assert.doesNotMatch(source, /USD eq\.<\/th>/);
  assert.match(source, /chartUsd\.format\(product\.usd_equivalent\)/);
});
