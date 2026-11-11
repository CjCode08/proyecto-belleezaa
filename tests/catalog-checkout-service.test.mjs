import assert from "node:assert/strict";
import { test } from "node:test";
import { processCheckout } from "../src/lib/catalog/checkout-service.ts";

const request = {
  customerName: "Ana", customerPhone: "04120000000", fulfillment: "pickup", payment: "efectivo",
  items: [{ variantId: "550e8400-e29b-41d4-a716-446655440000", quantity: 1 }],
};
const input = { key: "a".repeat(64), token: "token", request };
const saved = {
  id: "550e8400-e29b-41d4-a716-446655440001", isTest: true,
  customerName: "Ana", customerPhone: "04120000000", fulfillment: "pickup", payment: "efectivo",
  state: null, municipality: null, address: null, exchangeRate: "100", rateDate: "2026-11-11",
  totalUsd: 10, totalVes: 1000, items: [{ name: "Blusa", sku: "BL-001", size: "S", color: "Rojo", quantity: 1, unitPriceUsd: 10 }],
};
const deps = () => ({
  consumeLimit: async () => ({ allowed: true, retryAfter: 0 }),
  verifyToken: async () => ({ ok: true }),
  createRequest: async () => saved.id,
  getSavedRequest: async () => saved,
  phone: "584120000000",
});

test("genera WhatsApp a partir de la solicitud guardada, no de precios del cliente", async () => {
  const d = deps();
  let received;
  d.createRequest = async (key, data) => { received = data; assert.equal(key, input.key); return saved.id; };
  const result = await processCheckout({ ...input, request: { ...request, totalUsd: 0 } }, d);
  assert.equal(result.status, 200);
  assert.equal(received.totalUsd, undefined);
  assert.match(new URL(result.body.whatsappUrl).searchParams.get("text"), /\*SKU:\* BL-001/);
});

test("limita y valida antes de crear la solicitud", async () => {
  const d = deps();
  d.createRequest = async () => { throw new Error("No debe registrar"); };
  d.consumeLimit = async () => ({ allowed: false, retryAfter: 30 });
  assert.equal((await processCheckout(input, d)).status, 429);
  d.consumeLimit = async () => ({ allowed: true, retryAfter: 0 });
  assert.equal((await processCheckout({ ...input, request: { ...request, items: [] } }, d)).status, 400);
  d.verifyToken = async () => ({ ok: false, reason: "invalid-token" });
  assert.equal((await processCheckout(input, d)).status, 403);
  d.verifyToken = async () => ({ ok: false, reason: "unavailable" });
  await assert.rejects(processCheckout(input, d), /Turnstile/);
});
