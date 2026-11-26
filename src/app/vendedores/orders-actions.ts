"use server";

import { getActiveProfile } from "@/lib/auth/active-profile";
import { staffDestination } from "@/lib/auth/staff-destination";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAttentionChannel, type AttentionChannel } from "@/lib/sellers/attention-channel";

type NewOrder = {
  key: string;
  method: "bolivares" | "binance" | "efectivo";
  customerName: string;
  customerId: string;
  attentionChannel: AttentionChannel;
  items: { kind: "variant" | "bundle"; id: string; quantity: number }[];
};

export type CreateSellerOrderResult = { error?: string; orderId?: string; reused?: boolean; retryable?: boolean };

export async function createSellerOrder(input: NewOrder): Promise<CreateSellerOrderResult> {
  if (!input || typeof input !== "object") return { error: "El pedido enviado no es valido." };
  if (!isAttentionChannel(input.attentionChannel)) return { error: "Selecciona Online o En tienda.", retryable: false };
  if (process.env.SELLERS_PREVIEW_ENABLED !== "true") return { error: "La creacion de pedidos esta deshabilitada." };
  const profile = await getActiveProfile("sellers");
  if (staffDestination(profile, true) !== "/vendedores") return { error: "Inicia sesion como vendedor para crear un pedido." };
  const customerName = typeof input.customerName === "string" ? input.customerName.trim().replace(/\s+/g, " ") : "";
  const customerId = typeof input.customerId === "string" ? input.customerId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.key)
    || !["bolivares", "binance", "efectivo"].includes(input.method)
    || customerName.length < 3 || customerName.length > 120 || customerName.split(" ").length < 2
    || !/^\d{6,12}$/.test(customerId)
    || /[\u0000-\u001f\u007f]/.test(customerName)
    || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100
    || input.items.some((item) => !item || !["variant", "bundle"].includes(item.kind)
      || typeof item.id !== "string" || !/^[0-9a-f-]{36}$/i.test(item.id)
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)) {
    return { error: "Revisa los productos y las cantidades del carrito." };
  }

  const supabase = await createSupabaseServerClient("sellers");
  const { data, error } = await supabase.rpc("sellers_create_order", {
    p_key: input.key,
    p_payment_method: input.method,
    p_customer_name: customerName,
    p_customer_id: customerId,
    p_attention_channel: input.attentionChannel,
    p_items: input.items,
  });
  if (error || !data?.[0]?.order_id) {
    const message = error?.message ?? "";
    const code = error?.code ?? "";
    if (code === "PGRST202" || code === "42883") {
      console.error("Falta la funcion sellers_create_order en Supabase:", { code, message });
      return { error: "Falta aplicar la migracion de ordenes de vendedores en este proyecto Supabase." };
    }
    if (code === "42501") {
      console.error("El vendedor no tiene permiso para crear ordenes:", { code, message });
      return { error: "La cuenta no tiene acceso activo de vendedor para crear ordenes." };
    }
    if (["P0002", "22023", "22003"].includes(error?.code ?? "")) return { error: message, retryable: false };
    console.error("No se pudo crear el pedido de vendedor:", {
      code,
      message,
      details: error?.details,
      hint: error?.hint,
    });
    const safeMessage = message.replace(/[\r\n\t]+/g, " ").slice(0, 180);
    return { error: `No se pudo confirmar el pedido (codigo ${code || "desconocido"})${safeMessage ? `: ${safeMessage}` : ""}. Conservamos el carrito; puedes reintentar.` };
  }
  return { orderId: data[0].order_id, reused: data[0].reused };
}