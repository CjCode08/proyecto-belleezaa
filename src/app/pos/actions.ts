"use server";

import { requirePosProfile } from "@/lib/auth/pos-access";
import { parsePosAvailability, parsePosOrder, validPosPayment, type PosAvailability, type PosCurrency, type PosOrder, type PosPayment, type PosSelection } from "@/lib/pos/order";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseCommercialProduct, type CommercialProduct } from "@/lib/catalog/commercial";
import { filterPosSku } from "@/lib/pos/catalog";

type Result = { order?: PosOrder; availability?: PosAvailability; error?: string; definitive?: boolean };

export async function searchPosSku(orderId: string, sku: string, offset = 0): Promise<{ products: CommercialProduct[]; hasMore?: boolean; error?: string }> {
  await requirePosProfile();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)
    || typeof sku !== "string" || !sku.trim() || sku.length > 120 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return { products: [], error: "Ingresa el SKU de la prenda." };
  const client = await createSupabaseServerClient("pos");
  const { data, error } = await client.rpc("pos_catalog_products_for_order", { p_order: orderId, p_search: sku.trim(), p_offset: offset });
  if (error) return { products: [], error: failure(error).error };
  const rows = Array.isArray(data) ? data : [];
  return { products: filterPosSku(rows.slice(0,24).map(parseCommercialProduct),sku), hasMore: rows.length > 24 };
}

function failure(error: { code: string; message: string } | null): Result {
  const code = error?.code ?? "";
  if (["22023", "P0002", "40001", "42501"].includes(code)) return { error: error!.message, definitive: true };
  if (code === "PGRST202" || code === "42883") return { error: "Falta aplicar la migracion POS en Supabase de prueba.", definitive: true };
  console.error("Fallo de operacion POS", { code });
  return { error: "No se pudo confirmar la respuesta. Consulta la orden antes de registrar otro pago." };
}

export async function savePosOrder(orderId: string, revision: number, currency: PosCurrency, items: PosSelection[]): Promise<Result> {
  await requirePosProfile();
  const client = await createSupabaseServerClient("pos");
  const { data, error } = await client.rpc("pos_save_order", { p_order: orderId, p_revision: revision, p_currency: currency, p_items: items });
  if (error) return failure(error);
  const { data: availabilityData, error: availabilityError } = await client.rpc("pos_order_availability", { p_order: orderId });
  if (availabilityError) console.error("No se pudo actualizar disponibilidad POS:", availabilityError.code, availabilityError.message);
  return { order: parsePosOrder(data), availability: parsePosAvailability(availabilityData) };
}

export async function closePosOrder(payment: PosPayment): Promise<Result> {
  await requirePosProfile();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!payment || !validPosPayment(payment, today)) return { error: "Revisa el metodo, referencia y fecha del pago.", definitive: true };
  const client = await createSupabaseServerClient("pos");
  const { data, error } = await client.rpc("pos_close_order_with_excess", {
    p_order: payment.orderId, p_revision: payment.revision, p_key: payment.key, p_currency: payment.currency,
    p_method: payment.method, p_reference: payment.reference, p_paid_on: payment.paidOn, p_comment: payment.comment, p_amount: payment.amount,
    p_received: payment.receivedAmount ?? null,
    p_excess_confirmed: payment.excessConfirmed ?? false,
  });
  if (error && ["PGRST202", "42883"].includes(error.code)) return { error: "Falta aplicar la migracion POS de excedentes y movimientos en Supabase de prueba.", definitive: true };
  return error ? failure(error) : { order: parsePosOrder(data) };
}

export async function deleteExpiredPosOrder(orderId: string, revision: number): Promise<Result> {
  await requirePosProfile();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)
    || !Number.isSafeInteger(revision) || revision < 1) return { error: "Orden invalida.", definitive: true };
  const client = await createSupabaseServerClient("pos");
  const { data, error } = await client.rpc("pos_delete_expired_order", { p_order: orderId, p_revision: revision });
  return error ? failure(error) : { order: parsePosOrder(data) };
}

export async function deleteExpiredPosOrderFromCard(orderId: string): Promise<Result> {
  await requirePosProfile();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) return { error: "Orden invalida.", definitive: true };
  const client = await createSupabaseServerClient("pos");
  const current = await client.rpc("pos_get_order", { p_order: orderId });
  if (current.error || !current.data) return current.error ? failure(current.error) : { error: "Orden no encontrada.", definitive: true };
  const order = parsePosOrder(current.data);
  if (order.status !== "en_proceso") return { error: "Solo se pueden eliminar ordenes impagas.", definitive: true };
  return deleteExpiredPosOrder(orderId,order.revision);
}