import assert from "node:assert/strict";
import { test } from "node:test";
import { commercialWhatsAppUrl, validateCommercialCheckout } from "../src/lib/catalog/commercial-checkout.ts";

const variant = "10000000-0000-4000-8000-000000000001";
const bundle = "20000000-0000-4000-8000-000000000001";
test("valida variantes y bultos sin aceptar precios del cliente", () => {
  const result = validateCommercialCheckout({ customerName: "Ana", customerPhone: "0412", fulfillment: "pickup", payment: "bolivares", items: [{ kind: "variant", id: variant, quantity: 4, price: 0 }, { kind: "bundle", id: bundle, quantity: 1 }] });
  assert.equal(result.data.items[0].price, undefined);
  assert.equal(result.data.items.length, 2);
  assert.ok(validateCommercialCheckout({ ...result.data, items: [result.data.items[0], result.data.items[0]] }).error);
  assert.ok(validateCommercialCheckout({ ...result.data, fulfillment: "delivery", state: "Miranda" }).error);
});

test("el mensaje incluye SKU, promoción y bulto desde importes guardados", () => {
  const order = { id: "00000000-0000-4000-8000-000000000001", isTest: true, customerName: "Ana", customerPhone: "0412", fulfillment: "pickup", payment: "bolivares", state: null, municipality: null, address: null, exchangeRate: "100", rateDate: "2026-11-17", totalUsd: 114, totalVes: 11400,
    items: [{ kind: "variant", name: "Franela", size: "M", color: "Rojo", sku: "FRAN-M-R", quantity: 4, regularPriceUsd: 10, promotionPriceUsd: 8, promotionUnits: 3, bundlePriceUsd: 80, totalUsd: 34 }, { kind: "bundle", name: "Franela", size: null, color: null, sku: null, bundleDescription: "Surtido", quantity: 1, regularPriceUsd: 10, promotionPriceUsd: 8, promotionUnits: 0, bundlePriceUsd: 80, totalUsd: 80 }] };
  const message = new URL(commercialWhatsAppUrl(order, "584120000000", "test")).searchParams.get("text");
  assert.match(message, /SKU:\* FRAN-M-R/);
  assert.match(message, /Promoción:\* 3 × \$8\.00/);
  assert.match(message, /Bulto cerrado:\* Surtido/);
  assert.throws(() => commercialWhatsAppUrl({ ...order, totalUsd: 0 }, "584120000000", "test"));
  assert.throws(() => commercialWhatsAppUrl(order, "584120000000", "production"));
});