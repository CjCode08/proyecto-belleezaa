import "server-only";
import { createClient } from "@supabase/supabase-js";
import { processCommercialCheckout } from "./commercial-checkout-service";
import type { SavedCommercialCheckout } from "./commercial-checkout";
import { verifyTurnstile } from "./turnstile";
import { isCheckoutTestEnabled } from "./checkout-origin";

class RejectedRequest extends Error {}
function response(body: object, status: number, retryAfter?: number) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return Response.json(body, { status, headers });
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function savedOrder(value: unknown, isTest: boolean): SavedCommercialCheckout {
  if (!record(value) || typeof value.id !== "string" || value.checkout_is_test !== isTest
    || typeof value.customer_name !== "string" || typeof value.customer_phone !== "string"
    || (value.fulfillment !== "pickup" && value.fulfillment !== "delivery" && value.fulfillment !== "envio_nacional")
    || (value.payment !== "bolivares" && value.payment !== "binance" && value.payment !== "efectivo")
    || !(value.checkout_state === null || typeof value.checkout_state === "string")
    || !(value.checkout_municipality === null || typeof value.checkout_municipality === "string")
    || !(value.checkout_address === null || typeof value.checkout_address === "string")
    || typeof value.checkout_exchange_rate !== "number" || typeof value.checkout_rate_date !== "string"
    || typeof value.total_usd !== "number" || typeof value.total_ves !== "number" || !Array.isArray(value.checkout_commercial_items)) throw new Error("Solicitud guardada inválida.");
  const items = value.checkout_commercial_items.map((item: unknown): SavedCommercialCheckout["items"][number] => {
    if (!record(item) || (item.kind !== "variant" && item.kind !== "bundle") || typeof item.product_name !== "string"
      || !(item.size === null || typeof item.size === "string") || !(item.color === null || typeof item.color === "string")
      || !(item.sku === null || typeof item.sku === "string") || !(item.bundle_description === null || typeof item.bundle_description === "string")
      || typeof item.quantity !== "number" || typeof item.promotion_units !== "number" || typeof item.total_usd !== "number"
      || !(item.regular_price_usd === null || typeof item.regular_price_usd === "number")
      || !(item.promotion_price_usd === null || typeof item.promotion_price_usd === "number")
      || !(item.bundle_price_usd === null || typeof item.bundle_price_usd === "number")) throw new Error("Línea guardada inválida.");
    return { kind: item.kind, name: item.product_name, size: item.size, color: item.color, sku: item.sku,
      bundleDescription: item.bundle_description, quantity: item.quantity, regularPriceUsd: item.regular_price_usd,
      promotionPriceUsd: item.promotion_price_usd, promotionUnits: item.promotion_units, bundlePriceUsd: item.bundle_price_usd, totalUsd: item.total_usd };
  });
  return { id: value.id, isTest, customerName: value.customer_name, customerPhone: value.customer_phone,
    fulfillment: value.fulfillment, payment: value.payment, state: value.checkout_state, municipality: value.checkout_municipality,
    address: value.checkout_address, exchangeRate: String(value.checkout_exchange_rate), rateDate: value.checkout_rate_date,
    totalUsd: value.total_usd, totalVes: value.total_ves, items };
}
async function readJson(request: Request): Promise<unknown> {
  if (!request.body) throw new RejectedRequest();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 16384) { await reader.cancel(); throw new RejectedRequest(); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new RejectedRequest(); }
}

export async function commercialCheckoutRoute(request: Request, mode: "test" | "production") {
  const isTest = mode === "test";
  const isDeployPreviewTest = isTest && process.env.NODE_ENV === "production";
  const localTestOrigin = process.env.CHECKOUT_TEST_ORIGIN ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined);
  const origin = isTest ? localTestOrigin : process.env.CHECKOUT_PRODUCTION_ORIGIN;
  const testEnabled = isTest && isCheckoutTestEnabled(origin ?? "", process.env.NODE_ENV ?? "", {
    enabled: process.env.CHECKOUT_TEST_ENABLED,
    configuredOrigin: localTestOrigin,
    publicSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    testSupabaseUrl: isDeployPreviewTest ? process.env.CHECKOUT_TEST_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL,
    testServiceRoleKey: isDeployPreviewTest ? process.env.CHECKOUT_TEST_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY,
    testTurnstileSecret: isDeployPreviewTest ? process.env.CHECKOUT_TEST_TURNSTILE_SECRET_KEY : process.env.TURNSTILE_SECRET_KEY,
    testTurnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    testWhatsappNumber: isDeployPreviewTest ? process.env.CHECKOUT_TEST_WHATSAPP_NUMBER : process.env.WHATSAPP_NUMBER,
  });
  const productionEnabled = !isTest && process.env.NODE_ENV === "production" &&
    process.env.CHECKOUT_PRODUCTION_ENABLED === "true" && process.env.CATALOG_MAINTENANCE === "false";
  if (isTest ? !testEnabled : !productionEnabled) {
    return response({ error: "El checkout no está habilitado." }, 503);
  }
  let requestOrigin: string;
  try { requestOrigin = new URL(request.url).origin; } catch { return response({ error: "Solicitud no permitida." }, 403); }
  if (!origin || request.headers.get("origin") !== origin || requestOrigin !== origin
    || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return response({ error: "Solicitud no permitida." }, 403);
  const url = isDeployPreviewTest ? process.env.CHECKOUT_TEST_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = isDeployPreviewTest ? process.env.CHECKOUT_TEST_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
  const turnstileSecret = isDeployPreviewTest ? process.env.CHECKOUT_TEST_TURNSTILE_SECRET_KEY : process.env.TURNSTILE_SECRET_KEY;
  const phone = isDeployPreviewTest ? process.env.CHECKOUT_TEST_WHATSAPP_NUMBER : process.env.WHATSAPP_NUMBER;
  if (!url || !secret || !turnstileSecret || !phone) return response({ error: "El checkout no está configurado." }, 503);
  const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const input = await readJson(request);
    const result = await processCommercialCheckout(input, {
      phone, mode,
      consumeLimit: async () => {
        const { data, error } = await supabase.rpc("checkout_consume_shared_limit");
        if (error || !Array.isArray(data) || data.length !== 1 || !record(data[0]) || typeof data[0].allowed !== "boolean" || typeof data[0].retry_after_seconds !== "number") throw new Error("Límite no disponible.");
        return { allowed: data[0].allowed, retryAfter: data[0].retry_after_seconds };
      },
      verifyToken: (token) => verifyTurnstile(token, { secret: turnstileSecret, hostname: new URL(origin).hostname, action: "checkout" }),
      createRequest: async (key, order) => {
        const { data, error } = await supabase.rpc("checkout_create_commercial_request", { p_key: key, p_customer_name: order.customerName,
          p_customer_phone: order.customerPhone, p_fulfillment: order.fulfillment, p_payment: order.payment, p_state: order.state,
          p_municipality: order.municipality, p_address: order.address, p_items: order.items, p_is_test: isTest });
        if (error) { if (["P0002", "22023", "22003"].includes(error.code)) throw new RejectedRequest(); throw new Error("Registro no disponible."); }
        if (!Array.isArray(data) || data.length !== 1 || !record(data[0]) || typeof data[0].order_id !== "string") throw new Error("Respuesta inválida.");
        return data[0].order_id;
      },
      getSavedRequest: async (id) => {
        const { data, error } = await supabase.from("orders").select("id,customer_name,customer_phone,fulfillment,payment,checkout_is_test,checkout_state,checkout_municipality,checkout_address,checkout_exchange_rate,checkout_rate_date,total_usd,total_ves,checkout_commercial_items(kind,product_name,size,color,sku,bundle_description,quantity,regular_price_usd,promotion_price_usd,promotion_units,bundle_price_usd,total_usd)").eq("id", id).single();
        if (error) throw new Error("No se pudo consultar la solicitud.");
        return savedOrder(data, isTest);
      },
    });
    return response(result.body, result.status, "retryAfter" in result.body ? result.body.retryAfter : undefined);
  } catch (error) {
    if (error instanceof RejectedRequest) return response({ error: "No se pudo registrar. Revisa la tasa, las existencias y los datos del carrito.", definitive: true }, 400);
    console.error("Falló el checkout comercial.", error instanceof Error ? error.message : "Error desconocido");
    return response({ error: "No se pudo confirmar la solicitud. Reintenta con los mismos datos." }, 503);
  }
}