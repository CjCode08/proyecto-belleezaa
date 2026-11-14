import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(new URL("../src/app/inventario/page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

async function renderProducts(products) {
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(id) {
      if (id === "next/link") return { __esModule: true, default: ({ children, href }) => React.createElement("a", { href }, children) };
      if (id === "next/image") return { __esModule: true, default: () => null };
      if (id === "@/lib/auth/inventory-access") return { requireInventoryProfile: async () => ({ role: "admin" }) };
      if (id === "@/lib/supabase/server") return { createSupabaseServerClient: async () => ({}) };
      if (id === "@/lib/inventory/images") return { getSignedInventoryImageUrls: async () => new Map() };
      if (id === "@/lib/inventory/search") return {
        inventoryProductsQuery: async () => ({ data: products, error: null, count: products.length }),
        inventorySearchError: () => null,
        inventoryPageHref: () => "/inventario",
        maxInventorySearchLength: 120,
      };
      if (id === "./product-actions") return { ProductActions: () => null };
      if (id === "../login/actions") return { logout: async () => {} };
      if (id === "./ui") return { productStatusClass: () => "" };
      if (id === "@/lib/inventory/product-fields") return { audiences: [] };
      return require(id);
    },
  });
  return renderToStaticMarkup(await exports.default({ searchParams: Promise.resolve({}) }));
}

test("la tarjeta suma variantes sin incluir bultos y muestra etiquetas de precios", async () => {
  const html = await renderProducts([{
    id: "producto", name: "Prueba", category: null, audiences: [], status: "activo",
    catalog_visible: false, product_images: [],
    product_variants: [
      { id: "a", size: "S", color: "Rojo", stock: 3, sku: null },
      { id: "b", size: "M", color: "Azul", stock: 7, sku: null },
      { id: "c", size: "L", color: "Negro", stock: 0, sku: null },
    ],
    inventory_bundles: [{ id: "bulto", assortment_description: "Surtido", stock: 4 }],
    inventory_product_prices: [],
  }]);
  assert.match(html, /Unidades sueltas disponibles: 10/);
  assert.match(html, />Precios<\/h3>/);
  assert.match(html, /Precios pago en bolívares/);
  assert.match(html, /Precios pago en divisas/);
  assert.equal((html.match(/Precio unitario:/g) ?? []).length, 2);
  assert.match(html, /Surtido · 4 bultos/);
});

test("un producto sin variantes muestra cero unidades sueltas", async () => {
  const html = await renderProducts([{
    id: "solo-bulto", name: "Prueba", category: null, audiences: [], status: "activo",
    catalog_visible: false, product_images: [], product_variants: [],
    inventory_bundles: [{ id: "bulto", assortment_description: "Surtido", stock: 2 }],
    inventory_product_prices: [],
  }]);
  assert.match(html, /Unidades sueltas disponibles: 0/);
  assert.match(html, /Sin variantes registradas/);
});
