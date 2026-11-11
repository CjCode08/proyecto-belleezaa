import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogPageHref, catalogPageSize, validCatalogAudience, validCatalogSearch } from "../src/lib/catalog/search.ts";

test("mantiene y codifica la búsqueda en la paginación", () => {
  assert.equal(catalogPageSize, 24);
  assert.equal(catalogPageHref(2, "rojo & azul"), "/catalogo?buscar=rojo+%26+azul&pagina=2");
  assert.equal(catalogPageHref(1, ""), "/catalogo");
  assert.equal(catalogPageHref(2, "rojo", "ninas", "Vestidos & faldas"), "/catalogo?buscar=rojo&tipo=ninas&categoria=Vestidos+%26+faldas&pagina=2");
  assert.equal(catalogPageHref(1, "", "mujeres", "Franela"), "/catalogo?tipo=mujeres&categoria=Franela");
});

test("valida las opciones de tipo de prenda", () => {
  for (const value of ["", "hombres", "mujeres", "ninos", "ninas"]) assert.equal(validCatalogAudience(value), true);
  assert.equal(validCatalogAudience("otro"), false);
});

test("valida la longitud y caracteres de la búsqueda", () => {
  assert.equal(validCatalogSearch("vestido 50%"), true);
  assert.equal(validCatalogSearch("x".repeat(120)), true);
  assert.equal(validCatalogSearch("x".repeat(121)), false);
  assert.equal(validCatalogSearch("a\0b"), false);
});
