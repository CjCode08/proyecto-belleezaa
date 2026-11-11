import "server-only";
import { createClient } from "@supabase/supabase-js";
import { processCheckout } from "@/lib/catalog/checkout-service";
import type { SavedCheckout } from "@/lib/catalog/checkout-message";
import { verifyTurnstile } from "@/lib/catalog/turnstile";

class RejectedRequest extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function savedOrder(value: unknown): SavedCheckout {
  if (!isRecord(value) || typeof value.id !== "string" || value.checkout_is_test !== true ||
      typeof value.customer_name !== "string" || typeof value.customer_phone !== "string" ||
      (value.fulfillment !== "pickup" && value.fulfillment !== "delivery" && value.fulfillment !== "envio_nacional") ||
      (value.payment !== "efectivo" && value.payment !== "bolivares" && value.payment !== "binance") ||
      !(value.checkout_state === null || typeof value.checkout_state === "string") ||
      !(value.checkout_municipality === null || typeof value.checkout_municipality === "string") ||
      !(value.checkout_address === null || typeof value.checkout_address === "string") ||
      typeof value.checkout_exchange_rate !== "number" || typeof value.checkout_rate_date !== "string" ||
      typeof value.total_usd !== "number" || typeof value.total_ves !== "number" ||
      !Array.isArray(value.order_items)) {
    throw new Error("Datos guardados de solicitud inválidos.");
  }
  const items = value.order_items.map((item: unknown) => {
    if (!isRecord(item) || typeof item.checkout_product_name !== "string" ||
        typeof item.checkout_size !== "string" || typeof item.checkout_color !== "string" ||
        !(item.checkout_sku === null || typeof item.checkout_sku === "string") ||
        typeof item.quantity !== "number" || typeof item.unit_price_usd !== "number") {
      throw new Error("Artículo guardado inválido.");
    }
    return {
      name: item.checkout_product_name, size: item.checkout_size, color: item.checkout_color,
      sku: item.checkout_sku, quantity: item.quantity, unitPriceUsd: item.unit_price_usd,
    };
  });
  return {
    id: value.id, isTest: true, customerName: value.customer_name, customerPhone: value.customer_phone,
    fulfillment: value.fulfillment, payment: value.payment, state: value.checkout_state,
    municipality: value.checkout_municipality, address: value.checkout_address,
    exchangeRate: String(value.checkout_exchange_rate), rateDate: value.checkout_rate_date,
    totalUsd: value.total_usd, totalVes: value.total_ves, items,
  };
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
    if (length > 16384) {
      await reader.cancel();
      throw new RejectedRequest();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new RejectedRequest(); }
}

function response(body: object, status: number, retryAfter?: number) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return Response.json(body, { status, headers });
}

export async function POST(request: Request) {
  // El límite por cliente de Netlify aún no está verificado: solo pruebas locales.
  if (process.env.NODE_ENV !== "development" || process.env.CHECKOUT_TEST_ENABLED !== "true") {
    return response({ error: "El checkout de prueba no está habilitado." }, 503);
  }
  const localOrigin = process.env.CHECKOUT_TEST_ORIGIN ?? "http://localhost:3000";
  if (!/^http:\/\/localhost(?::[0-9]{1,5})?$/.test(localOrigin) ||
      request.headers.get("origin") !== localOrigin ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response({ error: "Solicitud no permitida." }, 403);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  const phone = process.env.WHATSAPP_NUMBER;
  if (!url || !secret || !turnstileSecret || !phone) {
    console.error("La configuración del checkout de prueba está incompleta.");
    return response({ error: "El checkout de prueba no está configurado." }, 503);
  }
  const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let stage = "lectura";
  try {
    const input = await readJson(request);
    const result = await processCheckout(input, {
      phone,
      consumeLimit: async () => {
        stage = "límite";
        const { data, error, status } = await supabase.rpc("checkout_consume_shared_limit");
        if (error) console.error(`Límite de checkout: respuesta HTTP ${status}.`);
        if (error || !Array.isArray(data) || data.length !== 1 || !isRecord(data[0]) ||
            typeof data[0].allowed !== "boolean" || typeof data[0].retry_after_seconds !== "number") {
          if (!error) console.error("La función de límite devolvió un formato inesperado.");
          throw new Error("No se pudo consultar el límite compartido.");
        }
        return { allowed: data[0].allowed, retryAfter: data[0].retry_after_seconds };
      },
      verifyToken: (token) => {
        stage = "Turnstile";
        return verifyTurnstile(token, { secret: turnstileSecret, hostname: "localhost", action: "checkout" });
      },
      createRequest: async (key, order) => {
        stage = "registro";
        const { data, error } = await supabase.rpc("checkout_create_test_request", {
          p_key: key, p_customer_name: order.customerName, p_customer_phone: order.customerPhone,
          p_fulfillment: order.fulfillment, p_payment: order.payment, p_state: order.state,
          p_municipality: order.municipality, p_address: order.address, p_items: order.items,
        });
        if (error) {
          if (["P0002", "22023", "22003"].includes(error.code)) throw new RejectedRequest();
          throw new Error("No se pudo registrar la solicitud.");
        }
        if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0]) || typeof data[0].order_id !== "string") {
          throw new Error("La respuesta del registro no es válida.");
        }
        return data[0].order_id;
      },
      getSavedRequest: async (id) => {
        stage = "lectura de solicitud";
        const { data, error } = await supabase.from("orders")
          .select("id,customer_name,customer_phone,fulfillment,payment,checkout_is_test,checkout_state,checkout_municipality,checkout_address,checkout_exchange_rate,checkout_rate_date,total_usd,total_ves,order_items(checkout_product_name,checkout_size,checkout_color,checkout_sku,quantity,unit_price_usd)")
          .eq("id", id).single();
        if (error) throw new Error("No se pudo consultar la solicitud guardada.");
        return savedOrder(data);
      },
    });
    const retryAfter = "retryAfter" in result.body ? result.body.retryAfter : undefined;
    return response(result.body, result.status, retryAfter);
  } catch (error) {
    if (error instanceof RejectedRequest) {
      return response({ error: "No se pudo registrar. Revisa la tasa, las existencias y los datos del carrito.", definitive: true }, 400);
    }
    const kind = error instanceof Error && /secret key/i.test(error.message) ? "clave secreta" :
      error instanceof Error && /fetch failed/i.test(error.message) ? "conexión" :
      error instanceof Error && /prerender|Date.now|unstable/i.test(error.message) ? "prerender" :
      error instanceof Error && /browser/i.test(error.message) ? "browser" : "no clasificado";
    console.error(`Falló el checkout de prueba durante: ${stage} (${kind}).`);
    return response({ error: "No se pudo completar la solicitud. Reintenta con los mismos datos." }, 503);
  }
}
