import assert from "node:assert/strict";
import { test } from "node:test";
import { processCommercialCheckout } from "../src/lib/catalog/commercial-checkout-service.ts";

const request = { customerName: "Ana", customerPhone: "0412", fulfillment: "pickup", payment: "bolivares", items: [{ kind: "variant", id: "10000000-0000-4000-8000-000000000001", quantity: 1 }] };
const saved = { id: "00000000-0000-4000-8000-000000000001", isTest: true, customerName: "Ana", customerPhone: "0412", fulfillment: "pickup", payment: "bolivares", state: null, municipality: null, address: null, exchangeRate: "100", rateDate: "2026-11-17", totalUsd: 10, totalVes: 1000, items: [{ kind: "variant", name: "Blusa", size: "S", color: "Rojo", sku: "SKU-1", quantity: 1, regularPriceUsd: 10, promotionPriceUsd: null, promotionUnits: 0, bundlePriceUsd: null, totalUsd: 10 }] };
const input = { key: "a".repeat(64), token: "token", request };
const dependencies = () => ({ consumeLimit: async () => ({ allowed: true, retryAfter: 0 }), verifyToken: async () => ({ ok: true }), createRequest: async () => saved.id, getSavedRequest: async () => saved, phone: "584120000000", mode: "test" });

test("verifica seguridad y genera mensaje desde el pedido guardado", async () => {
  const deps = dependencies();
  deps.createRequest = async (_key, data) => { assert.equal(data.items[0].price, undefined); return saved.id; };
  const result = await processCommercialCheckout({ ...input, request: { ...request, items: [{ ...request.items[0], price: 0 }] } }, deps);
  assert.equal(result.status, 200);
  assert.match(new URL(result.body.whatsappUrl).searchParams.get("text"), /SKU:\* SKU-1/);
  deps.consumeLimit = async () => ({ allowed: false, retryAfter: 30 });
  assert.equal((await processCommercialCheckout(input, deps)).status, 429);
  deps.consumeLimit = async () => ({ allowed: true, retryAfter: 0 });
  deps.verifyToken = async () => ({ ok: false, reason: "invalid-token" });
  assert.equal((await processCommercialCheckout(input, deps)).status, 403);
});