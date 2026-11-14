import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as groups from "../src/lib/inventory/variant-groups.ts";
import * as fields from "../src/lib/inventory/product-fields.ts";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function renderFields(props) {
  const source = readFileSync(new URL("../src/app/inventario/variant-fields.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(id) {
      if (id === "@/lib/inventory/variant-groups") return groups;
      if (id === "@/lib/inventory/product-fields") return fields;
      if (id === "./product-fields") return { fieldClass: "field" };
      if (id === "./ui") return { secondaryButtonClass: "button" };
      return require(id);
    },
  });
  return renderToStaticMarkup(React.createElement(exports.VariantFields, props));
}

function inputValues(html, name) {
  return [...html.matchAll(/<input\b[^>]*>/g)]
    .map(([input]) => input)
    .filter((input) => input.includes(`name="${name}"`))
    .map((input) => input.match(/value="([^"]*)"/)?.[1] ?? "");
}

test("agrupa por talla conservando identificadores, existencias y SKU", () => {
  const grouped = groups.groupVariants([
    { id: "red", size: "M", color: "Rojo", sku: "R", stock: 5 },
    { id: "blue", size: "L", color: "Azul", sku: "", stock: 0 },
    { id: "black", size: "M", color: "Negro", sku: "N", stock: 3 },
  ]);
  assert.deepEqual(grouped.map((group) => group.size), ["M", "L"]);
  assert.deepEqual(grouped[0].colors.map(({ id, color, sku, stock }) => ({ id, color, sku, stock })), [
    { id: "red", color: "Rojo", sku: "R", stock: "5" },
    { id: "black", color: "Negro", sku: "N", stock: "3" },
  ]);
  assert.equal(grouped[1].colors[0].id, "blue");
  assert.equal(grouped[1].colors[0].stock, "0");
});

test("sin variantes existentes no inventa existencias", () => {
  assert.deepEqual(groups.groupVariants([]), []);
  const html = renderFields({ editing: true, initialVariants: [] });
  assert.deepEqual(inputValues(html, "size"), []);
  assert.match(html, /Sin variantes sueltas/);
});

test("el formulario de edición conserva la alineación de tallas y variantes", () => {
  const html = renderFields({
    editing: true,
    skuBase: "FRAN",
    initialVariants: [
      { id: "red", size: "M", color: "Rojo", sku: "R", sku_color_code: "R", stock: 5 },
      { id: "blue", size: "L", color: "Azul", sku: "A", sku_color_code: "A", stock: 2 },
      { id: "black", size: "M", color: "Negro", sku: "N", sku_color_code: "N", stock: 3 },
    ],
  });
  assert.deepEqual(inputValues(html, "variantId"), ["red", "black", "blue"]);
  assert.deepEqual(inputValues(html, "size"), ["M", "M", "L"]);
  assert.deepEqual(inputValues(html, "color"), ["Rojo", "Negro", "Azul"]);
  assert.deepEqual(inputValues(html, "colorCode"), ["R", "N", "A"]);
  assert.match(html, /FRAN-M-R/);
  assert.match(html, /FRAN-L-A/);
  assert.deepEqual(inputValues(html, "stock"), ["5", "3", "2"]);
});

test("el formulario nuevo envía una variante inicial sin identificador", () => {
  const html = renderFields({});
  assert.deepEqual(inputValues(html, "size"), [""]);
  assert.deepEqual(inputValues(html, "color"), [""]);
  assert.deepEqual(inputValues(html, "stock"), ["0"]);
  assert.deepEqual(inputValues(html, "variantId"), []);
  assert.ok(html.indexOf('name="color"') < html.indexOf('name="stock"'));
  assert.ok(html.indexOf('name="stock"') < html.indexOf('name="colorCode"'));
});
