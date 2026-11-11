import { convertUsdCentsToVesCents, formatVesCents } from "./currency.ts";

export type SavedCheckout = {
  id: string;
  isTest: boolean;
  customerName: string;
  customerPhone: string;
  fulfillment: "delivery" | "envio_nacional" | "pickup";
  payment: "bolivares" | "binance" | "efectivo";
  state: string | null;
  municipality: string | null;
  address: string | null;
  exchangeRate: string;
  rateDate: string;
  totalUsd: number;
  totalVes: number;
  items: {
    name: string;
    size: string;
    color: string;
    sku: string | null;
    quantity: number;
    unitPriceUsd: number;
  }[];
};

const fulfillmentLabels = {
  delivery: "Delivery",
  envio_nacional: "Envío nacional",
  pickup: "Retiro en tienda",
};
const paymentLabels = { bolivares: "Bolívares", binance: "Binance", efectivo: "Efectivo" };

function cents(value: number): number {
  const result = Math.round(value * 100);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(result) ||
      Math.abs(result - value * 100) > 0.000001) {
    throw new Error("El importe guardado no es válido.");
  }
  return result;
}

function dollars(value: number): string {
  return `$${(value / 100).toFixed(2)}`;
}

function requireText(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error("Los datos guardados de la solicitud no son válidos.");
  }
}

export function checkoutWhatsAppUrl(order: SavedCheckout, phone: string): string {
  if (!/^[1-9][0-9]{7,14}$/.test(phone)) throw new Error("El número de WhatsApp no está configurado correctamente.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order.id) ||
      order.isTest !== true || !Object.hasOwn(fulfillmentLabels, order.fulfillment) ||
      !Object.hasOwn(paymentLabels, order.payment) || order.payment === "efectivo" && order.fulfillment !== "pickup") {
    throw new Error("La solicitud de prueba guardada no es válida.");
  }
  requireText(order.customerName);
  requireText(order.customerPhone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(order.rateDate)) throw new Error("La fecha de tasa guardada no es válida.");
  if (!Array.isArray(order.items) || order.items.length < 1 || order.items.length > 100) {
    throw new Error("La solicitud guardada no contiene artículos válidos.");
  }
  const lines: string[] = [];
  let total = 0;
  for (const item of order.items) {
    requireText(item.name);
    requireText(item.size);
    requireText(item.color);
    if (item.sku !== null) requireText(item.sku);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) {
      throw new Error("La cantidad guardada no es válida.");
    }
    const price = cents(item.unitPriceUsd);
    const subtotal = price * item.quantity;
    total += subtotal;
    if (!Number.isSafeInteger(total)) throw new Error("El total guardado no es válido.");
    lines.push(
      `*Prenda:* ${item.name}`,
      `*Talla:* ${item.size} | *Color:* ${item.color}`,
      `*SKU:* ${item.sku ?? "Sin SKU"}`,
      `*Unidades:* ${item.quantity}`,
      `*Precio unitario:* *${dollars(price)}*`,
      `*Subtotal:* *${dollars(subtotal)}*`,
      "",
    );
  }
  const expectedUsd = cents(order.totalUsd);
  const expectedVes = cents(order.totalVes);
  if (total !== expectedUsd || convertUsdCentsToVesCents(total, order.exchangeRate) !== BigInt(expectedVes)) {
    throw new Error("Los importes guardados de la solicitud no coinciden.");
  }

  const message = [
    "*SOLICITUD DE PRUEBA — NO ES UNA COMPRA REAL*",
    `*Solicitud:* ${order.id}`,
    "",
    "*DATOS DEL CLIENTE*",
    `*Nombre:* ${order.customerName}`,
    `*Teléfono:* ${order.customerPhone}`,
    "",
    "*ENTREGA Y PAGO*",
    `*Entrega:* ${fulfillmentLabels[order.fulfillment]}`,
  ];
  if (order.fulfillment !== "pickup") {
    requireText(order.state);
    requireText(order.municipality);
    requireText(order.address);
    message.push(`*Estado:* ${order.state}`, `*Municipio:* ${order.municipality}`, `*Dirección:* ${order.address}`);
  }
  message.push(
    `*Pago:* ${paymentLabels[order.payment]}`,
    "",
    "*PRODUCTOS*",
    ...lines,
    "*RESUMEN*",
    `*Total de productos:* *${dollars(total)}* / *${formatVesCents(BigInt(expectedVes))}*`,
    `*Tasa aplicada (${order.rateDate}):* ${order.exchangeRate} Bs. por USD`,
    "",
    "*CONDICIONES*",
    order.fulfillment === "delivery" && order.state === "Carabobo" &&
      order.municipality !== null && ["San Diego", "Naguanagua", "Valencia"].includes(order.municipality) && total > 1000
      ? "*Delivery gratis* para este municipio por compra mayor a $10."
      : "El costo de delivery o envío se acuerda con el vendedor y *no está incluido en el total*.",
    "",
    "Precios y disponibilidad sujetos a confirmación.",
    "El vendedor preparará la orden y enviará los datos de pago.",
  );
  const url = new URL(`https://wa.me/${phone}`);
  url.searchParams.set("text", message.join("\n"));
  return url.toString();
}
