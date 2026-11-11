import { validateCheckout, type CheckoutRequest } from "./checkout-validation.ts";
import { checkoutWhatsAppUrl, type SavedCheckout } from "./checkout-message.ts";

type Result = { status: number; body: { error: string; definitive?: boolean; retryAfter?: number } | { orderId: string; whatsappUrl: string } };
type Dependencies = {
  consumeLimit: () => Promise<{ allowed: boolean; retryAfter: number }>;
  verifyToken: (token: unknown) => Promise<{ ok: boolean; reason?: string }>;
  createRequest: (key: string, request: CheckoutRequest) => Promise<string>;
  getSavedRequest: (id: string) => Promise<SavedCheckout>;
  phone: string;
};

export async function processCheckout(input: unknown, deps: Dependencies): Promise<Result> {
  const limit = await deps.consumeLimit();
  if (!limit.allowed) return { status: 429, body: { error: "Hay demasiadas solicitudes. Intenta de nuevo más tarde.", retryAfter: limit.retryAfter } };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { status: 400, body: { error: "La solicitud no es válida.", definitive: true } };
  }
  const raw = input as Record<string, unknown>;
  const validation = validateCheckout(raw.request);
  if ("error" in validation) return { status: 400, body: { error: validation.error, definitive: true } };
  if (typeof raw.key !== "string" || !/^[0-9a-f]{64}$/.test(raw.key)) {
    return { status: 400, body: { error: "La clave de solicitud no es válida.", definitive: true } };
  }
  if (!/^[1-9][0-9]{7,14}$/.test(deps.phone)) throw new Error("Configuración de WhatsApp inválida.");
  const verification = await deps.verifyToken(raw.token);
  if (!verification.ok) {
    if (verification.reason !== "invalid-token") throw new Error("No se pudo verificar Turnstile.");
    return { status: 403, body: { error: "Completa nuevamente la verificación de seguridad." } };
  }
  const id = await deps.createRequest(raw.key, validation.data);
  const order = await deps.getSavedRequest(id);
  return { status: 200, body: { orderId: id, whatsappUrl: checkoutWhatsAppUrl(order, deps.phone) } };
}
