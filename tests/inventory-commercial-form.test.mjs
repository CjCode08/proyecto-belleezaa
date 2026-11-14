import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as productFields from "../src/lib/inventory/product-fields.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(new URL("../src/lib/inventory/commercial-form.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  require(id) {
    if (id === "./product-fields") return productFields;
    return require(id);
  },
});
const parse = exports.parseCommercialForm;

test("el formulario muestra selectores independientes para ambas promociones", () => {
  const componentSource = readFileSync(new URL("../src/app/inventario/commercial-fields.tsx", import.meta.url), "utf8");
  const component = ts.transpileModule(componentSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentExports = {};
  runInNewContext(component, {
    exports: componentExports,
    require(id) {
      if (id === "./product-fields") return { fieldClass: "field" };
      if (id === "./ui") return { secondaryButtonClass: "button" };
      return require(id);
    },
  });
  const html = renderToStaticMarkup(React.createElement(componentExports.CommercialFields, {
    bundles: [{ id: "bulto", assortment_description: "Surtido", stock: 2 }],
  }));
  const names = [...html.matchAll(/name="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(names, [
    "bolivaresUnit", "bolivaresPromotion", "bolivaresPromotionQuantity", "bolivaresPromotionDescription", "bolivaresBundle",
    "divisasUnit", "divisasPromotion", "divisasPromotionQuantity", "divisasPromotionDescription", "divisasBundle",
    "bundleId", "bundleDescription", "bundleStock",
  ]);
  const selectors = [...html.matchAll(/<select\b[^>]*name="(?:bolivares|divisas)PromotionQuantity"[^>]*>[\s\S]*?<\/select>/g)];
  assert.equal(selectors.length, 2);
  for (const [select] of selectors) {
    for (const quantity of [2, 3, 4]) assert.match(select, new RegExp(`<option value="${quantity}">${quantity} unidades</option>`));
  }
});

test("la vista previa no conecta la acción de guardado y deshabilita el envío", () => {
  const componentSource = readFileSync(new URL("../src/app/inventario/nuevo/form.tsx", import.meta.url), "utf8");
  const component = ts.transpileModule(componentSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const componentExports = {};
  runInNewContext(component, {
    exports: componentExports,
    require(id) {
      if (id === "./actions") return { createProduct: async () => ({}) };
      if (id === "../ui") return { fileInputClass: "field" };
      if (id === "../product-fields") return {
        fieldClass: "field", AudienceField: () => null, CategoryField: () => null,
      };
      if (id === "@/lib/inventory/product-fields") return productFields;
      if (id === "../variant-fields") return { VariantFields: () => null };
      if (id === "../commercial-fields") return { CommercialFields: () => null };
      return require(id);
    },
  });
  const html = renderToStaticMarkup(React.createElement(componentExports.ProductForm, { categories: [], preview: true }));
  assert.doesNotMatch(html.match(/<form\b[^>]*>/)[0], /\baction=/);
  assert.match(html, /<button[^>]*disabled[^>]*>Guardado deshabilitado en vista previa<\/button>/);
});

function form() {
  return new FormData();
}

function addVariant(data, id, size, color, code) {
  if (id !== null) data.append("variantId", id);
  data.append("size", size);
  data.append("color", color);
  data.append("colorCode", code);
  data.append("stock", "4");
}

function addBundle(data, id = "") {
  data.append("bundleId", id);
  data.append("bundleDescription", "Tallas variadas");
  data.append("bundleStock", "2");
}

test("admite solo bultos sin inventar variantes o precios de unidades", () => {
  const data = form();
  addBundle(data);
  data.set("bolivaresBundle", "50");
  const result = parse(data, false);
  assert.equal(result.variants.length, 0);
  assert.equal(result.prices[0].unit_price_usd, null);
  assert.equal(result.prices[0].bundle_price_usd, 50);
  assert.equal(result.bundles[0].stock, 2);
});

test("guarda los precios y la cantidad estructurada por forma de pago", () => {
  const data = form();
  addVariant(data, null, "M", "Rojo", "R");
  data.set("bolivaresUnit", "8");
  data.set("bolivaresPromotion", "6.50");
  data.set("bolivaresPromotionQuantity", "3");
  data.set("bolivaresPromotionDescription", "3 unidades");
  data.set("bolivaresBundle", "60");
  data.set("divisasUnit", "7");
  data.set("divisasPromotion", "5");
  data.set("divisasPromotionQuantity", "2");
  data.set("divisasPromotionDescription", "2 unidades");
  data.set("divisasBundle", "50");
  const result = parse(data, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.prices)), [
    { payment_category: "bolivares", unit_price_usd: 8, promotion_price_usd: 6.5, promotion_quantity: 3, promotion_description: "3 unidades", bundle_price_usd: 60 },
    { payment_category: "divisas", unit_price_usd: 7, promotion_price_usd: 5, promotion_quantity: 2, promotion_description: "2 unidades", bundle_price_usd: 50 },
  ]);
});

test("valida la descripción de promoción y permite dejarla vacía", () => {
  const data = form();
  addVariant(data, null, "M", "Rojo", "R");
  data.set("divisasPromotionDescription", "  dos prendas  ");
  assert.ok(parse(data, false).error);
  data.set("divisasPromotion", "5");
  data.set("divisasPromotionQuantity", "2");
  assert.equal(parse(data, false).prices[1].promotion_description, "Dos prendas");
  data.set("divisasPromotionDescription", "a".repeat(201));
  assert.ok(parse(data, false).error);
  data.set("divisasPromotionDescription", "   ");
  assert.equal(parse(data, false).prices[1].promotion_description, null);
});

test("admite precio promocional aislado y rechaza importes inválidos", () => {
  const data = form();
  addVariant(data, null, "M", "Rojo", "R");
  data.set("bolivaresPromotion", "5");
  data.set("bolivaresPromotionQuantity", "3");
  assert.equal(parse(data, false).prices[0].promotion_price_usd, 5);
  assert.equal(parse(data, false).prices[0].promotion_quantity, 3);
  data.set("divisasBundle", "2.345");
  assert.ok(parse(data, false).error);
});

test("requiere 2, 3 o 4 unidades en cada lista solo cuando hay promoción", () => {
  for (const [index, category] of ["bolivares", "divisas"].entries()) {
    const data = form();
    addVariant(data, null, "M", "Rojo", "R");
    assert.equal(parse(data, false).prices[index].promotion_quantity, null);
    data.set(`${category}Promotion`, "0");
    assert.ok(parse(data, false).error);
    for (const value of ["2", "3", "4"]) {
      data.set(`${category}PromotionQuantity`, value);
      assert.equal(parse(data, false).prices[index].promotion_quantity, Number(value));
    }
    for (const value of ["1", "5", "2.5"]) {
      data.set(`${category}PromotionQuantity`, value);
      assert.ok(parse(data, false).error);
    }
    data.delete(`${category}Promotion`);
    data.set(`${category}PromotionQuantity`, "2");
    assert.ok(parse(data, false).error);
  }
});

test("solicita un precio de bulto si hay existencias de bultos", () => {
  const data = form();
  addBundle(data);
  assert.ok(parse(data, false).error);
  data.set("divisasBundle", "0");
  assert.equal(parse(data, false).prices[1].bundle_price_usd, 0);
});

test("rechaza SKU duplicados y abreviaturas vacías con base", () => {
  const data = form();
  data.set("skuBase", "FRAN");
  addVariant(data, null, "L", "Rojo", "R");
  addVariant(data, null, "L", "Rosa", "R");
  assert.ok(parse(data, false).error);
  data.delete("colorCode");
  data.append("colorCode", "R");
  data.append("colorCode", "");
  assert.ok(parse(data, false).error);
});

test("rechaza identificadores duplicados al editar", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const data = form();
  addVariant(data, id, "L", "Rojo", "");
  addVariant(data, id, "M", "Azul", "");
  assert.ok(parse(data, true).error);
  const bundles = form();
  bundles.set("bolivaresBundle", "50");
  addBundle(bundles, id);
  addBundle(bundles, id);
  assert.ok(parse(bundles, true).error);
});
