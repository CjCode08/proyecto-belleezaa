import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogPageHref, catalogPageSize, validCatalogSearch } from "../src/lib/catalog/search.ts";

test("mantiene y codifica la búsqueda en la paginación", () => {
  assert.equal(catalogPageSize, 24);
  assert.equal(catalogPageHref(2, "rojo & azul"), "/catalogo?buscar=rojo+%26+azul&pagina=2");
  assert.equal(catalogPageHref(1, ""), "/catalogo");
});

test("valida la longitud y caracteres de la búsqueda", () => {
  assert.equal(validCatalogSearch("vestido 50%"), true);
  assert.equal(validCatalogSearch("x".repeat(120)), true);
  assert.equal(validCatalogSearch("x".repeat(121)), false);
  assert.equal(validCatalogSearch("a\0b"), false);
});
