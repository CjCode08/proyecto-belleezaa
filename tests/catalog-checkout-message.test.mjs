import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutWhatsAppUrl } from "../src/lib/catalog/checkout-message.ts";

const order = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  isTest: true,
  customerName: "Ana",
  customerPhone: "04120000000",
  fulfillment: "pickup",
  payment: "efectivo",
  state: null,
  municipality: null,
  address: null,
  exchangeRate: "100",
  rateDate: "2026-11-11",
  totalUsd: 24,
  totalVes: 2400,
  items: [
    { name: "Blusa & falda", size: "S", color: "Rojo", sku: "BL-001", quantity: 1, unitPriceUsd: 8 },
    { name: "Blusa & falda", size: "M", color: "Azul", sku: null, quantity: 2, unitPriceUsd: 8 },
  ],
};

test("crea un enlace con datos guardados, importes y marca de prueba", () => {
  const url = new URL(checkoutWhatsAppUrl(order, "584120000000"));
  assert.equal(url.origin, "https://wa.me");
  assert.equal(url.pathname, "/584120000000");
  const message = url.searchParams.get("text");
  assert.equal(message, [
    "*SOLICITUD DE PRUEBA — NO ES UNA COMPRA REAL*",
    `*Solicitud:* ${order.id}`,
    "",
    "*DATOS DEL CLIENTE*",
    "*Nombre:* Ana",
    "*Teléfono:* 04120000000",
    "",
    "*ENTREGA Y PAGO*",
    "*Entrega:* Retiro en tienda",
    "*Pago:* Efectivo",
    "",
    "*PRODUCTOS*",
    "*Prenda:* Blusa & falda",
    "*Talla:* S | *Color:* Rojo",
    "*SKU:* BL-001",
    "*Unidades:* 1",
    "*Precio unitario:* *$8.00*",
    "*Subtotal:* *$8.00*",
    "",
    "*Prenda:* Blusa & falda",
    "*Talla:* M | *Color:* Azul",
    "*SKU:* Sin SKU",
    "*Unidades:* 2",
    "*Precio unitario:* *$8.00*",
    "*Subtotal:* *$16.00*",
    "",
    "*RESUMEN*",
    "*Total de productos:* *$24.00* / *Bs. 2.400,00*",
    "*Tasa aplicada (2026-11-11):* 100 Bs. por USD",
    "",
    "*CONDICIONES*",
    "El costo de delivery o envío se acuerda con el vendedor y *no está incluido en el total*.",
    "",
    "Precios y disponibilidad sujetos a confirmación.",
    "El vendedor preparará la orden y enviará los datos de pago.",
  ].join("\n"));
  assert.doesNotMatch(message, /Dirección:/);
});

test("incluye dirección guardada para delivery y no confunde el envío con el total", () => {
  const delivery = { ...order, fulfillment: "delivery", payment: "binance", state: "Carabobo", municipality: "Valencia", address: "Calle 1\nCasa 2" };
  const message = new URL(checkoutWhatsAppUrl(delivery, "584120000000")).searchParams.get("text");
  assert.match(message, /\*Estado:\* Carabobo/);
  assert.match(message, /\*Dirección:\* Calle 1\nCasa 2/);
  assert.match(message, /\*Delivery gratis\*/);
  const other = { ...delivery, municipality: "Bejuma" };
  assert.match(new URL(checkoutWhatsAppUrl(other, "584120000000")).searchParams.get("text"), /no está incluido en el total/);
  const threshold = { ...delivery, totalUsd: 10, totalVes: 1000, items: [{ ...order.items[0], unitPriceUsd: 10 }] };
  assert.match(new URL(checkoutWhatsAppUrl(threshold, "584120000000")).searchParams.get("text"), /no está incluido en el total/);
  assert.throws(() => checkoutWhatsAppUrl({ ...delivery, address: null }, "584120000000"));
});

test("rechaza datos incoherentes, solicitudes reales y números inválidos", () => {
  for (const invalid of [
    { ...order, isTest: false },
    { ...order, totalUsd: 25 },
    { ...order, totalVes: 1 },
    { ...order, exchangeRate: "0" },
    { ...order, items: [] },
    { ...order, items: [{ ...order.items[0], quantity: 0 }] },
    { ...order, payment: "efectivo", fulfillment: "delivery" },
  ]) assert.throws(() => checkoutWhatsAppUrl(invalid, "584120000000"));
  assert.throws(() => checkoutWhatsAppUrl(order, "https://example.com"));
});
