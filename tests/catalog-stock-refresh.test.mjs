import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const [sellerPage, sellerRefresh, posEditor, catalogPage, catalogRefresh] = await Promise.all([
  readFile(new URL("../src/app/vendedores/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/vendedores/refresh-orders.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/pos/pos-editor.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/catalogo/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/catalogo/refresh-stock.tsx", import.meta.url), "utf8"),
]);

test("Vendedores actualiza el catálogo y ofrece refresco manual", () => {
  assert.match(sellerPage, /<RefreshSellerOrders manual=\{view === "catalogo"\} \/>/);
  assert.match(sellerRefresh, /Actualizar catálogo/);
  assert.match(sellerRefresh, /belleza:catalog-stock-updated/);
  assert.match(sellerRefresh, /refreshIntervalMs = 30000/);
  assert.match(sellerRefresh, /setInterval/);
});

test("POS anuncia los cambios de stock al cerrar un cobro", () => {
  assert.match(posEditor, /notifyCatalogStockUpdated\(\)/);
  assert.match(posEditor, /new BroadcastChannel\("belleza:catalog-stock-updated"\)/);
});

test("el e-commerce se actualiza sin mostrar un botón manual", () => {
  assert.match(catalogPage, /<RefreshCatalogStock \/>/);
  assert.doesNotMatch(catalogPage, /Actualizar catálogo/);
  assert.match(catalogRefresh, /belleza:catalog-stock-updated/);
  assert.match(catalogRefresh, /setInterval/);
});
