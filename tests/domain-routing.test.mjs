import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import config from "../next.config.ts";
import { isStoreRoot } from "../src/lib/catalog/store-domain.ts";

const require = createRequire(import.meta.url);
globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { unstable_getResponseFromNextConfig } = require("next/experimental/testing/server");
const { NextRequest } = require("next/server");
const ts = require("typescript");

function proxyWithSession(user = null) {
  let authCalls = 0;
  const exports = {};
  const source = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    process,
    console,
    URL,
    require(id) {
      if (id === "@/lib/catalog/store-domain") return { isStoreRoot };
      if (id === "@supabase/ssr") {
        return {
          createServerClient: (_url, _key, options) => ({
            auth: {
              getUser: async () => {
                authCalls++;
                options.cookies.setAll([{ name: "session-test", value: "refreshed", options: { path: "/" } }]);
                return { data: { user }, error: null };
              },
            },
          }),
        };
      }
      return require(id);
    },
  });
  return { proxy: exports.proxy, authCalls: () => authCalls };
}

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

test("el proxy reconoce solo la raíz de la tienda antes de exigir sesión", () => {
  for (const host of ["www.belleezaa.com", "belleezaa.com", "WWW.BELLEEZAA.COM", "www.belleezaa.com:443"]) {
    assert.equal(isStoreRoot("/", host), true);
    assert.equal(isStoreRoot("/inventario/panel", host), false);
    assert.equal(isStoreRoot("/login", host), false);
  }
  for (const host of ["inventario.belleezaa.com", "belleezaa.netlify.app", "localhost:3000", "wwwXbelleezaa.com", "www.belleezaa.com.example.org", null]) {
    assert.equal(isStoreRoot("/", host), false);
  }
});

test("el proxy redirige la raíz pública al catálogo sin consultar sesión", async () => {
  for (const host of ["www.belleezaa.com", "belleezaa.com", "WWW.BELLEEZAA.COM:443"]) {
    const { proxy, authCalls } = proxyWithSession();
    const response = await proxy(new NextRequest(`https://${host}/?origen=prueba`, { headers: { host } }));
    const destination = new URL(response.headers.get("location"));
    assert.equal(response.status, 307);
    assert.equal(destination.pathname, "/catalogo");
    assert.equal(destination.search, "?origen=prueba");
    assert.equal(authCalls(), 0);
  }
});

test("el proxy mantiene la protección y cookies de inventario", async () => {
  for (const host of ["inventario.belleezaa.com", "belleezaa.netlify.app", "localhost:3000", "www.belleezaa.com.example.org"]) {
    for (const path of ["/", "/inventario/panel"]) {
      const { proxy, authCalls } = proxyWithSession();
      const response = await proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));
      assert.equal(new URL(response.headers.get("location")).pathname, "/login");
      assert.equal(response.cookies.get("session-test").value, "refreshed");
      assert.equal(authCalls(), 1);
    }
  }
  const { proxy } = proxyWithSession();
  const response = await proxy(new NextRequest("https://www.belleezaa.com/inventario/panel", {
    headers: { host: "www.belleezaa.com" },
  }));
  assert.equal(new URL(response.headers.get("location")).pathname, "/login");

  const authenticated = proxyWithSession({ id: "test-user" });
  const allowed = await authenticated.proxy(new NextRequest("https://inventario.belleezaa.com/inventario/panel"));
  assert.equal(allowed.headers.get("x-middleware-next"), "1");
  assert.equal(allowed.cookies.get("session-test").value, "refreshed");
});
