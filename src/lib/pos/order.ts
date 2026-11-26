export type PosCurrency = "bolivares" | "divisas";
export const posMethods = {
  bolivares: [{ value: "pago_movil", label: "Pago movil" }, { value: "efectivo", label: "Efectivo" }, { value: "transferencia", label: "Transferencia" }, { value: "tarjeta", label: "Tarjeta" }],
  divisas: [{ value: "efectivo", label: "Efectivo" }, { value: "binance", label: "Binance" }, { value: "zinli", label: "Zinli" }],
};
export type PosLine = {
  kind: "variant" | "bundle"; product_name: string; size: string | null; color: string | null; sku: string | null;
  variant_id?: string | null; bundle_id?: string | null; id: string; quantity: number;
  bundle_description: string | null; regular_price_usd: number | null; promotion_price_usd: number | null;
  promotion_units: number; promotion_description: string | null; bundle_price_usd: number | null; total_usd: number;
};
export type PosReceipt = {
  attention_channel?: string | null;
  id: string; customer_name: string | null; customer_id: string | null; advisor_name: string; cashier_name: string; items: PosLine[];
  payment: { currency: PosCurrency; method: string; reference: string | null; paid_on: string; comment: string; amount: number; registered_at: string };
};
export type PosOrder = {
  attention_channel?: string | null;
  deleted_at?: string | null; deleted_by?: string | null; deleted_by_role?: string | null;
  id: string; revision: number; customer_name: string | null; customer_id: string | null; advisor_name: string; advisor_username: string | null;
  payment_method: string; status: string; total_usd: number; total_ves: number | null; exchange_rate: number | null;
  created_at: string; expires_at: string; items: PosLine[]; receipt: PosReceipt | null;
};
export type PosSummary = Pick<PosOrder, "id" | "customer_name" | "customer_id" | "advisor_name" | "status" | "expires_at" | "created_at" | "total_usd" | "total_ves">;
export type PosSelection = { kind: "variant" | "bundle"; id: string; quantity: number };
export type PosPayment = { orderId: string; revision: number; key: string; currency: PosCurrency; method: string; reference: string; paidOn: string; comment: string; amount: number };
export type PosAvailability = Record<string, number>;

export function posAvailabilityKey(kind: "variant" | "bundle", id: string) {
  return `${kind}:${id}`;
}

export function parsePosAvailability(value: unknown): PosAvailability {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if ((row.kind !== "variant" && row.kind !== "bundle") || typeof row.id !== "string"
      || !Number.isSafeInteger(row.max_quantity) || Number(row.max_quantity) < 0) return [];
    return [[posAvailabilityKey(row.kind, row.id), Number(row.max_quantity)]];
  }));
}

export function posReservationExpired(order: Pick<PosOrder,"status" | "expires_at">, now: number): boolean {
  return order.status === "en_proceso" && (!Number.isFinite(Date.parse(order.expires_at)) || Date.parse(order.expires_at) <= now);
}

export function posSelection(line: PosLine): PosSelection {
  return { kind: line.kind, id: (line.kind === "variant" ? line.variant_id : line.bundle_id) ?? line.id, quantity: line.quantity };
}
export function parsePosOrder(value: unknown): PosOrder {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string"
    || !("revision" in value) || !Number.isSafeInteger(value.revision) || !("items" in value) || !Array.isArray(value.items)) {
    throw new Error("La orden no tiene un formato valido.");
  }
  return value as PosOrder;
}
export function posMoney(amount: number, currency: PosCurrency = "divisas") {
  if (currency === "bolivares") {
    return `Bs. ${new Intl.NumberFormat("es-VE", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount)}`;
  }
  return new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(amount);
}

export function posReadError(error: { code: string; message: string }) {
  if (["PGRST202", "42883", "42P01", "42703"].includes(error.code)) {
    return "Falta la migracion POS o su esquema no esta completo en el Supabase conectado. Comprueba 20261125100000_pos_orders_payments.sql en el proyecto de prueba.";
  }
  if (error.code === "42501") return "Sin permiso de caja. Verifica que el perfil sea cajero o admin y este activo.";
  return `No se pudo consultar caja (codigo ${error.code || "conexion"}). Reintenta; si persiste, revisa la configuracion de Supabase.`;
}
export function validPosPayment(payment: PosPayment, today: string) {
  if (!payment || typeof payment.reference !== "string" || typeof payment.comment !== "string" || typeof payment.paidOn !== "string") return false;
  const date = new Date(`${payment.paidOn}T12:00:00Z`);
  return posMethods[payment.currency]?.some(method => method.value === payment.method) === true
    && (payment.method === "efectivo" || payment.reference.trim().length > 0)
    && payment.reference.length <= 120 && !/[\u0000-\u001f\u007f]/.test(payment.reference)
    && /^\d{4}-\d{2}-\d{2}$/.test(payment.paidOn) && payment.paidOn >= "1900-01-01" && payment.paidOn <= today
    && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === payment.paidOn
    && payment.comment.length <= 500 && Number.isFinite(payment.amount) && payment.amount >= 0;
}