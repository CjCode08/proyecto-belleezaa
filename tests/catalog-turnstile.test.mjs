import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyTurnstile } from "../src/lib/catalog/turnstile.ts";

const config = { secret: "test-secret", hostname: "belleezaa.com", action: "checkout" };
const reply = (data, status = 200) => async () =>
  new Response(JSON.stringify(data), { status });
const valid = { success: true, hostname: "belleezaa.com", action: "checkout" };

test("valida token, dominio y acción mediante Siteverify", async () => {
  const fetcher = async (url, request) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(request.method, "POST");
    assert.equal(request.cache, "no-store");
    assert.deepEqual(JSON.parse(request.body), { secret: "test-secret", response: "token" });
    return new Response(JSON.stringify(valid));
  };
  assert.deepEqual(await verifyTurnstile("token", { ...config, fetcher }), { ok: true });
  for (const data of [
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { ...valid, hostname: "example.com" },
    { ...valid, action: "login" },
    { ...valid, hostname: undefined },
  ]) {
    assert.deepEqual(await verifyTurnstile("token", { ...config, fetcher: reply(data) }),
      { ok: false, reason: "invalid-token" });
  }
});

test("rechaza datos y configuración inválidos antes de consultar", async () => {
  const fetcher = () => { throw new Error("No debe consultar Siteverify"); };
  for (const token of ["", "x".repeat(2049), null]) {
    assert.deepEqual(await verifyTurnstile(token, { ...config, fetcher }), { ok: false, reason: "invalid-token" });
  }
  for (const field of ["secret", "hostname", "action"]) {
    assert.deepEqual(await verifyTurnstile("token", { ...config, [field]: "", fetcher }),
      { ok: false, reason: "misconfigured" });
  }
});

test("cierra el acceso si Siteverify falla o responde incorrectamente", async () => {
  const failure = { ok: false, reason: "unavailable" };
  assert.deepEqual(await verifyTurnstile("token", { ...config, fetcher: async () => { throw new Error("network"); } }), failure);
  assert.deepEqual(await verifyTurnstile("token", { ...config, fetcher: reply({}, 503) }), failure);
  assert.deepEqual(await verifyTurnstile("token", { ...config, fetcher: async () => new Response("no es JSON") }), failure);
  assert.deepEqual(await verifyTurnstile("token", { ...config, fetcher: reply({}) }), failure);
  for (const data of [
    { success: false },
    { success: false, "error-codes": [] },
    { success: false, "error-codes": ["internal-error"] },
    { success: false, "error-codes": ["unexpected-error"] },
  ]) {
    assert.deepEqual(await verifyTurnstile("token", { ...config, fetcher: reply(data) }), failure);
  }
  assert.deepEqual(await verifyTurnstile("token", {
    ...config, fetcher: reply({ success: false, "error-codes": ["invalid-input-secret"] }),
  }), { ok: false, reason: "misconfigured" });
});
