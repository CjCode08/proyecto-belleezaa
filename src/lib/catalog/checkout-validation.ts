import { venezuelaMunicipalities } from "./venezuela.ts";

export type CheckoutItem = { variantId: string; quantity: number };
export type CheckoutRequest = {
  customerName: string;
  customerPhone: string;
  fulfillment: "delivery" | "envio_nacional" | "pickup";
  payment: "bolivares" | "binance" | "efectivo";
  state: string;
  municipality: string;
  address: string;
  items: CheckoutItem[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateCheckout(input: unknown): { data: CheckoutRequest } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Los datos del pedido no son válidos." };
  const raw = input as Record<string, unknown>;
  if (typeof raw.customerName !== "string" || typeof raw.customerPhone !== "string") {
    return { error: "Ingresa tu nombre y teléfono." };
  }
  const customerName = raw.customerName.trim();
  const customerPhone = raw.customerPhone.trim();
  if (!customerName || customerName.length > 120 || !customerPhone || customerPhone.length > 30 ||
      /[\u0000-\u001f\u007f]/.test(customerName + customerPhone)) {
    return { error: "Revisa tu nombre y teléfono." };
  }
  const fulfillment = raw.fulfillment;
  const payment = raw.payment;
  if (fulfillment !== "pickup" && fulfillment !== "delivery" && fulfillment !== "envio_nacional") {
    return { error: "Selecciona una forma de entrega válida." };
  }
  if (payment !== "bolivares" && payment !== "binance" && payment !== "efectivo") {
    return { error: "Selecciona un método de pago válido." };
  }
  if (payment === "efectivo" && fulfillment !== "pickup") {
    return { error: "El pago en efectivo solo está disponible para retiro en tienda." };
  }

  let state = "";
  let municipality = "";
  let address = "";
  if (fulfillment !== "pickup") {
    if (typeof raw.state !== "string" || typeof raw.municipality !== "string" || typeof raw.address !== "string") {
      return { error: "Completa el estado, municipio y dirección." };
    }
    state = raw.state.trim();
    municipality = raw.municipality.trim();
    address = raw.address.trim();
    if (!Object.hasOwn(venezuelaMunicipalities, state) ||
        !venezuelaMunicipalities[state].includes(municipality) ||
        !address || address.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(address)) {
      return { error: "Revisa el estado, municipio y dirección." };
    }
    if (fulfillment === "delivery" && state !== "Carabobo") {
      return { error: "El delivery está disponible únicamente en Carabobo." };
    }
  }

  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 100) {
    return { error: "El carrito debe contener entre una y cien variantes." };
  }
  const items: CheckoutItem[] = [];
  const seen = new Set<string>();
  for (const item of raw.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "Una variante del carrito no es válida." };
    const row = item as Record<string, unknown>;
    if (typeof row.variantId !== "string" || !uuidPattern.test(row.variantId) ||
        typeof row.quantity !== "number" || !Number.isSafeInteger(row.quantity) ||
        row.quantity < 1 || row.quantity > 999 || seen.has(row.variantId.toLowerCase())) {
      return { error: "Revisa las variantes y cantidades del carrito." };
    }
    seen.add(row.variantId.toLowerCase());
    items.push({ variantId: row.variantId.toLowerCase(), quantity: row.quantity });
  }
  return { data: { customerName, customerPhone, fulfillment, payment, state, municipality, address, items } };
}
