import assert from "node:assert/strict";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { sessionCookieOptions, sessionScopeForPath } from "../src/lib/supabase/session-scope.ts";

test("las sesiones de caja y vendedores usan cookies distintas para el mismo proyecto", () => {
  const url = "https://example.supabase.co";
  assert.deepEqual(sessionCookieOptions("default", url), {});
  assert.equal(sessionCookieOptions("pos", url).name, "sb-example-auth-token-pos");
  assert.equal(sessionCookieOptions("sellers", url).name, "sb-example-auth-token-sellers");
  assert.notEqual(sessionCookieOptions("pos", url).name, sessionCookieOptions("sellers", url).name);
  assert.notEqual(sessionCookieOptions("pos", url).name, sessionCookieOptions("pos", "https://other.supabase.co").name);
});

test("el proxy identifica las rutas de cada modulo sin incluir rutas similares", () => {
  for (const pathname of ["/pos", "/pos/login", "/pos/123/recibo"]) assert.equal(sessionScopeForPath(pathname), "pos");
  for (const pathname of ["/vendedores", "/vendedores/login"]) assert.equal(sessionScopeForPath(pathname), "sellers");
  for (const pathname of ["/", "/inventario/panel", "/administracion", "/posicion", "/vendedores-extra"]) assert.equal(sessionScopeForPath(pathname), "default");
});

test("iniciar y cerrar caja no reemplaza la sesion de vendedores", async () => {
  const url = "https://example.supabase.co";
  const cookies = new Map();
  const requests = [];
  const fetch = async (input, options = {}) => {
    const requestUrl = new URL(typeof input === "string" ? input : input.url);
    if (requestUrl.pathname.endsWith("/token")) {
      const { email } = JSON.parse(options.body);
      const user = { id: email, email, aud: "authenticated", role: "authenticated" };
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: email, exp: expiresAt })}.signature`;
      return Response.json({ access_token: accessToken, refresh_token: `refresh-${email}`, token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user });
    }
    if (requestUrl.pathname.endsWith("/logout")) {
      requests.push(requestUrl.searchParams.get("scope"));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected authentication request: ${requestUrl.pathname}`);
  };
  const client = (scope) => createServerClient(url, "public-key", {
    cookieOptions: sessionCookieOptions(scope, url),
    global: { fetch },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (changes) => changes.forEach(({ name, value, options }) => options?.maxAge === 0 ? cookies.delete(name) : cookies.set(name, value)),
    },
  });

  const seller = client("sellers");
  const cashier = client("pos");
  assert.equal((await seller.auth.signInWithPassword({ email: "seller@example.invalid", password: "test" })).error, null);
  assert.equal((await cashier.auth.signInWithPassword({ email: "cashier@example.invalid", password: "test" })).error, null);
  assert.equal((await client("sellers").auth.getSession()).data.session.user.email, "seller@example.invalid");
  assert.equal((await client("pos").auth.getSession()).data.session.user.email, "cashier@example.invalid");
  assert.equal((await cashier.auth.signOut({ scope: "local" })).error, null);
  assert.equal(requests.at(-1), "local");
  assert.equal((await client("pos").auth.getSession()).data.session, null);
  assert.equal((await client("sellers").auth.getSession()).data.session.user.email, "seller@example.invalid");
});