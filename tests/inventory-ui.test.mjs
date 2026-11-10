import assert from "node:assert/strict";
import { test } from "node:test";
import { productStatusClass } from "../src/app/inventario/ui.ts";

test("los estados de inventario se distinguen por color", () => {
  assert.match(productStatusClass("activo"), /bg-emerald-100/);
  assert.match(productStatusClass("inhabilitado"), /bg-red-100/);
  assert.match(productStatusClass("reabastecer"), /bg-amber-100/);
  assert.match(productStatusClass(" Reabastecer "), /bg-amber-100/);
});

test("un estado desconocido se muestra con color neutro", () => {
  assert.match(productStatusClass(null), /bg-slate-100/);
  assert.match(productStatusClass("otro"), /bg-slate-100/);
});
