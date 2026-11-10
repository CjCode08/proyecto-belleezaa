import assert from "node:assert/strict";
import { test } from "node:test";
import { venezuelaMunicipalities } from "../src/lib/catalog/venezuela.ts";

test("contiene los estados y municipios de Venezuela y las zonas de delivery", () => {
  const states = Object.keys(venezuelaMunicipalities);
  assert.equal(states.length, 24);
  assert.equal(Object.values(venezuelaMunicipalities).flat().length, 335);
  assert.equal(venezuelaMunicipalities.Carabobo.length, 14);
  for (const name of ["San Diego", "Naguanagua", "Valencia"]) {
    assert.ok(venezuelaMunicipalities.Carabobo.includes(name));
  }
  assert.ok(venezuelaMunicipalities["Distrito Capital"].includes("Libertador"));
  for (const municipalities of Object.values(venezuelaMunicipalities)) {
    assert.ok(municipalities.length > 0);
    assert.equal(new Set(municipalities).size, municipalities.length);
  }
});
