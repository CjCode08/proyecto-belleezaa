import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCheckout } from "../src/lib/catalog/checkout-validation.ts";

const item = { variantId: "550e8400-e29b-41d4-a716-446655440000", quantity: 1 };
const delivery = { customerName: "Ana", customerPhone: "04120000000", fulfillment: "delivery", payment: "bolivares", state: "Carabobo", municipality: "Valencia", address: "Dirección", items: [item] };

test("valida delivery y sus restricciones geográficas", () => {
  assert.ok("data" in validateCheckout(delivery));
  assert.ok("error" in validateCheckout({ ...delivery, state: "Miranda", municipality: "Baruta" }));
  assert.ok("error" in validateCheckout({ ...delivery, municipality: "Baruta" }));
  assert.ok("error" in validateCheckout({ ...delivery, address: " " }));
  assert.ok("data" in validateCheckout({ ...delivery, fulfillment: "envio_nacional", state: "Miranda", municipality: "Baruta" }));
});

test("efectivo es solo para retiro y pickup no guarda dirección", () => {
  assert.ok("error" in validateCheckout({ ...delivery, payment: "efectivo" }));
  const result = validateCheckout({ ...delivery, fulfillment: "pickup", payment: "efectivo" });
  assert.equal(result.data?.address, "");
  assert.equal(result.data?.state, "");
});

test("rechaza cantidades y variantes inválidas o duplicadas", () => {
  assert.ok("error" in validateCheckout({ ...delivery, items: [] }));
  assert.ok("error" in validateCheckout({ ...delivery, items: [item, item] }));
  assert.ok("error" in validateCheckout({ ...delivery, items: [{ ...item, quantity: 0 }] }));
  assert.ok("error" in validateCheckout({ ...delivery, items: [{ ...item, quantity: 1000 }] }));
  assert.ok("error" in validateCheckout({ ...delivery, items: [{ ...item, variantId: "incorrecto" }] }));
});
