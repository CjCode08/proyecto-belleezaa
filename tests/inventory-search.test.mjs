import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { inventoryPageHref, inventoryProductsQuery, inventorySearchError } from "../src/lib/inventory/search.ts";

async function requestFor(term, page = 1) {
  let requestUrl;
  const supabase = createClient("https://example.test", "public-test-key", {
    global: {
      fetch: async (url) => {
        requestUrl = new URL(url);
        return new Response("[]", { headers: { "content-range": "0-0/0" } });
      },
    },
  });
  const result = await inventoryProductsQuery(supabase, term, page, 25);
  assert.equal(result.error, null);
  return requestUrl.searchParams;
}

test("consulta nombre, categoría y SKU antes de paginar sin recortar las variantes visibles", async () => {
  const params = await requestFor("Azul-42", 2);
  assert.match(params.get("select"), /product_variants\(id,size,color,sku,stock\)/);
  assert.match(params.get("select"), /sku_match:product_variants\(\)/);
  assert.equal(params.get("sku_match.sku"), "ilike.%Azul-42%");
  assert.equal(params.get("or"), '(name.ilike."%Azul-42%",category.ilike."%Azul-42%",sku_match.not.is.null)');
  assert.equal(params.get("offset"), "25");
  assert.equal(params.get("limit"), "25");
});

test("escapa comodines y caracteres especiales en ambas condiciones", async () => {
  const params = await requestFor('a_%,"\\b');
  assert.equal(params.get("sku_match.sku"), 'ilike.%a\\_\\%,"\\\\b%');
  assert.equal(params.get("or"), '(name.ilike."%a\\\\_\\\\%,\\"\\\\\\\\b%",category.ilike."%a\\\\_\\\\%,\\"\\\\\\\\b%",sku_match.not.is.null)');
});

test("sin búsqueda no filtra el inventario", async () => {
  const params = await requestFor("");
  assert.match(params.get("select"), /catalog_visible/);
  assert.equal(params.get("sku_match.sku"), null);
  assert.equal(params.get("or"), null);
});

test("valida entradas y conserva la búsqueda al cambiar de página", () => {
  assert.equal(inventorySearchError("vestido 50%"), null);
  assert.match(inventorySearchError("a*b"), /no admite/);
  assert.match(inventorySearchError("a".repeat(121)), /120/);
  assert.match(inventorySearchError("a\0b"), /control/);
  assert.equal(inventoryPageHref(2, "rojo & azul"), "/inventario?buscar=rojo+%26+azul&pagina=2");
});
