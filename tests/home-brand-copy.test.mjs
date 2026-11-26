import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const [home, catalog] = await Promise.all([
  readFile(new URL("../src/app/inicio/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/catalogo/page.tsx", import.meta.url), "utf8"),
]);

test("la portada usa el nuevo texto comercial y la nueva presentación", () => {
  assert.match(home, /Prendas para vestir a toda tu familia/);
  assert.match(home, /Belleezaa, Somos Boutique Chicas Intimas tu mayorista de confianza y donde puedes conseguir las prendas para vestir a toda tu familia\. Te acompañamos a elegir entre las opciones disponibles en nuestro catálogo\./);
  assert.match(home, /Somos tu mayorista de confianza/);
});

test("el logo de Belleezaa acompaña el nombre en portada y catálogo", () => {
  assert.match(home, /src="\/faviconBelleezaa\.png"/);
  assert.match(catalog, /src="\/faviconBelleezaa\.png"/);
  assert.match(catalog, /Somos tu mayorista de confianza/);
});
