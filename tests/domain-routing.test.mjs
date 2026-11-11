import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { test } from "node:test";
import config from "../next.config.ts";

const require = createRequire(import.meta.url);
globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { unstable_getResponseFromNextConfig } = require("next/experimental/testing/server");

async function redirectFor(host, path = "/") {
  const response = await unstable_getResponseFromNextConfig({
    url: `https://${host}${path}`,
    headers: { host },
    nextConfig: config,
  });
  return { status: response.status, location: response.headers.get("location") };
}

test("la raíz de la tienda redirige al catálogo", async () => {
  for (const host of ["www.belleezaa.com", "belleezaa.com"]) {
    const result = await redirectFor(host);
    assert.equal(result.status, 307);
    assert.equal(new URL(result.location, `https://${host}`).pathname, "/catalogo");
  }
});

test("la raíz del inventario y los accesos actuales conservan su destino", async () => {
  for (const host of ["inventario.belleezaa.com", "belleezaa.netlify.app", "localhost:3000", "wwwXbelleezaa.com"]) {
    const result = await redirectFor(host);
    assert.equal(result.status, 307);
    assert.equal(new URL(result.location, `https://${host}`).pathname, "/inventario/panel");
  }
});

test("las reglas modifican únicamente la raíz", async () => {
  const redirects = await config.redirects();
  assert.ok(redirects.every((rule) => rule.source === "/"));
});
