import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(new URL("../src/app/inventario/product-actions.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  require(id) {
    if (id === "./actions") return {
      deleteProduct: async () => ({}), setCatalogVisibility: async () => ({}), setProductStatus: async () => ({}),
    };
    if (id === "next/link") return { __esModule: true, default: ({ children, href }) => React.createElement("a", { href }, children) };
    return require(id);
  },
});

test("solo administrador puede cambiar la visibilidad sin alterar el estado de inventario", () => {
  const render = (canDelete, catalogVisible) => renderToStaticMarkup(React.createElement(exports.ProductActions, {
    productId: "123", status: "activo", canDelete, catalogVisible,
  }));
  const hidden = render(true, false);
  assert.match(hidden, /Habilitar en catálogo/);
  assert.match(hidden, /name="visible" value="true"/);
  assert.match(hidden, /Motivo del cambio en catálogo/);
  assert.match(hidden, />Inhabilitar</);
  const visible = render(true, true);
  assert.match(visible, /Ocultar del catálogo/);
  assert.match(visible, /name="visible" value="false"/);
  const staff = render(false, true);
  assert.doesNotMatch(staff, /Ocultar del catálogo|Habilitar en catálogo/);
  assert.match(staff, />Inhabilitar</);
});
