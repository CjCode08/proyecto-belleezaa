import { validateCheckout, type CheckoutRequest } from "./checkout-validation.ts";
import { convertUsdCentsToVesCents, formatVesCents } from "./currency.ts";

export type CommercialCheckoutItem = { kind: "variant" | "bundle"; id: string; quantity: number };
export type CommercialCheckoutRequest = Omit<CheckoutRequest, "items"> & { items: CommercialCheckoutItem[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateCommercialCheckout(input: unknown): { data: CommercialCheckoutRequest } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Los datos del pedido no son válidos." };
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 100) return { error: "Revisa los productos del carrito." };
  const seen = new Set<string>();
  const items: CommercialCheckoutItem[] = [];
  for (const value of raw.items) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Una presentación no es válida." };
    const item = value as Record<string, unknown>;
    if ((item.kind !== "variant" && item.kind !== "bundle") || typeof item.id !== "string" || !uuid.test(item.id)
      || typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) return { error: "Revisa las presentaciones y cantidades." };
    const id = item.id.toLowerCase();
    const key = `${item.kind}:${id}`;
    if (seen.has(key)) return { error: "Hay presentaciones repetidas en el carrito." };
    seen.add(key);
    items.push({ kind: item.kind, id, quantity: item.quantity });
  }
  const base = validateCheckout({ ...raw, items: [{ variantId: "00000000-0000-4000-8000-000000000001", quantity: 1 }] });
  if ("error" in base) return base;
  return { data: { ...base.data, items } };
}

export type SavedCommercialCheckout = {
  id: string; isTest: boolean; customerName: string; customerPhone: string;
  fulfillment: CheckoutRequest["fulfillment"]; payment: CheckoutRequest["payment"];
  state: string | null; municipality: string | null; address: string | null;
  exchangeRate: string; rateDate: string; totalUsd: number; totalVes: number;
  items: { kind: "variant" | "bundle"; name: string; size: string | null; color: string | null; sku: string | null;
    bundleDescription: string | null; quantity: number; regularPriceUsd: number | null; promotionPriceUsd: number | null;
    promotionUnits: number; bundlePriceUsd: number | null; totalUsd: number }[];
};

function cents(value: number): number {
  const rounded = Math.round(value * 100);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(rounded) || Math.abs(value * 100 - rounded) > 0.000001) throw new Error("Importe guardado inválido.");
  return rounded;
}
function text(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error("Texto guardado inválido.");
}
function dollars(value: number) { return `$${(value / 100).toFixed(2)}`; }

export function commercialWhatsAppUrl(order: SavedCommercialCheckout, phone: string, mode: "test" | "production"): string {
  if (!uuid.test(order.id) || !/^[1-9][0-9]{7,14}$/.test(phone) || order.isTest !== (mode === "test")
    || !["pickup", "delivery", "envio_nacional"].includes(order.fulfillment)
    || !["bolivares", "binance", "efectivo"].includes(order.payment) || order.payment === "efectivo" && order.fulfillment !== "pickup"
    || !/^\d{4}-\d{2}-\d{2}$/.test(order.rateDate) || !Array.isArray(order.items) || !order.items.length || order.items.length > 100) throw new Error("Solicitud guardada inválida.");
  text(order.customerName); text(order.customerPhone);
  let total = 0;
  const lines: string[] = [];
  for (const item of order.items) {
    text(item.name);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 || !Number.isSafeInteger(item.promotionUnits) || item.promotionUnits < 0 || item.promotionUnits > item.quantity) throw new Error("Cantidad guardada inválida.");
    lines.push(`*Prenda:* ${item.name}`);
    let subtotal = 0;
    if (item.kind === "variant") {
      text(item.size); text(item.color);
      if (item.sku !== null) text(item.sku);
      const regular = item.quantity - item.promotionUnits;
      if (regular && item.regularPriceUsd === null || item.promotionUnits && item.promotionPriceUsd === null) throw new Error("Precio guardado inválido.");
      subtotal = regular * cents(item.regularPriceUsd ?? 0) + item.promotionUnits * cents(item.promotionPriceUsd ?? 0);
      lines.push(`*Talla:* ${item.size} | *Color:* ${item.color}`, `*SKU:* ${item.sku ?? "Sin SKU"}`, `*Unidades:* ${item.quantity}`);
      if (item.promotionUnits) lines.push(`*Promoción:* ${item.promotionUnits} × ${dollars(cents(item.promotionPriceUsd!))}`);
      if (regular) lines.push(`*Precio unitario:* ${regular} × ${dollars(cents(item.regularPriceUsd!))}`);
    } else if (item.kind === "bundle") {
      text(item.bundleDescription);
      if (item.bundlePriceUsd === null || item.promotionUnits !== 0) throw new Error("Bulto guardado inválido.");
      subtotal = item.quantity * cents(item.bundlePriceUsd);
      lines.push(`*Bulto cerrado:* ${item.bundleDescription}`, `*Bultos:* ${item.quantity}`, `*Precio por bulto:* ${dollars(cents(item.bundlePriceUsd))}`);
    } else throw new Error("Presentación guardada inválida.");
    if (subtotal !== cents(item.totalUsd)) throw new Error("Subtotal guardado inválido.");
    total += subtotal;
    lines.push(`*Subtotal:* *${dollars(subtotal)}*`, "");
  }
  if (!Number.isSafeInteger(total) || total !== cents(order.totalUsd) || convertUsdCentsToVesCents(total, order.exchangeRate) !== BigInt(cents(order.totalVes))) throw new Error("Totales guardados inválidos.");
  const delivery = { pickup: "Retiro en tienda", delivery: "Delivery", envio_nacional: "Envío nacional" };
  const payments = { bolivares: "Bolívares", binance: "Binance", efectivo: "Efectivo" };
  const message = [mode === "test" ? "*SOLICITUD DE PRUEBA — NO ES UNA COMPRA REAL*" : "*SOLICITUD DE PEDIDO*", `*Solicitud:* ${order.id}`, "", "*DATOS DEL CLIENTE*", `*Nombre:* ${order.customerName}`, `*Teléfono:* ${order.customerPhone}`, "", "*ENTREGA Y PAGO*", `*Entrega:* ${delivery[order.fulfillment]}`];
  if (order.fulfillment !== "pickup") { text(order.state); text(order.municipality); text(order.address); message.push(`*Estado:* ${order.state}`, `*Municipio:* ${order.municipality}`, `*Dirección:* ${order.address}`); }
  message.push(`*Pago:* ${payments[order.payment]}`, "", "*PRODUCTOS*", ...lines, "*RESUMEN*", `*Total de productos:* *${dollars(total)}* / *${formatVesCents(BigInt(cents(order.totalVes)))}*`, `*Tasa aplicada (${order.rateDate}):* ${order.exchangeRate} Bs. por USD`, "", "*CONDICIONES*",
    order.fulfillment === "delivery" && order.state === "Carabobo" && order.municipality !== null && ["San Diego", "Naguanagua", "Valencia"].includes(order.municipality) && total > 1000 ? "*Delivery gratis* para este municipio por compra mayor a $10." : "El costo de delivery o envío se acuerda con el vendedor y *no está incluido en el total*.",
    "", "Precios y disponibilidad sujetos a confirmación.", "El vendedor preparará la orden y enviará los datos de pago.");
  const url = new URL(`https://wa.me/${phone}`); url.searchParams.set("text", message.join("\n")); return url.toString();
}