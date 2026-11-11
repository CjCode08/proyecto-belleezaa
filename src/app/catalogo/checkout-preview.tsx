"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { venezuelaMunicipalities } from "@/lib/catalog/venezuela";
import { validateCheckout, type CheckoutRequest } from "@/lib/catalog/checkout-validation";
import { openSavedCheckout, prepareCheckoutWindow, type SavedCheckoutSession } from "@/lib/catalog/checkout-navigation";
import type { CartItem } from "@/lib/catalog/cart";
import { CheckoutTurnstile } from "./checkout-turnstile";

type Fulfillment = "delivery" | "envio_nacional" | "pickup";
type Payment = "bolivares" | "binance" | "efectivo";

const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-[#d9c6c8] bg-white px-3 py-2 text-[#1e1a1c]";
const sessionKey = "belleza-checkout-test-v1";
const storageUnavailable = "unavailable";
const emptySnapshot = () => "";

function snapshot() {
  try { return sessionStorage.getItem(sessionKey) ?? ""; }
  catch { return storageUnavailable; }
}
function subscribe(callback: () => void) {
  window.addEventListener("belleza-checkout-test", callback);
  return () => window.removeEventListener("belleza-checkout-test", callback);
}
function saveSession(value: object | null) {
  if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
  else sessionStorage.removeItem(sessionKey);
  window.dispatchEvent(new Event("belleza-checkout-test"));
}
type Session = { kind: "pending"; key: string; request: CheckoutRequest } | SavedCheckoutSession;
function readSession(raw: string): Session | null {
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Sesión inválida.");
  const row = value as Record<string, unknown>;
  if (row.kind === "pending" && typeof row.key === "string" && /^[0-9a-f]{64}$/.test(row.key)) {
    const request = validateCheckout(row.request);
    if ("data" in request) return { kind: "pending", key: row.key, request: request.data };
  }
  if (row.kind === "saved" && typeof row.orderId === "string" && typeof row.whatsappUrl === "string") {
    const url = new URL(row.whatsappUrl);
    if (url.protocol === "https:" && url.hostname === "wa.me" && /^\/[1-9][0-9]{7,14}$/.test(url.pathname)) {
      if (row.request === undefined && row.cartHandled === undefined) {
        return { kind: "saved", orderId: row.orderId, whatsappUrl: url.toString(), request: null, cartHandled: true };
      }
      const request = validateCheckout(row.request);
      if ("data" in request && typeof row.cartHandled === "boolean" &&
          (row.cartError === undefined || typeof row.cartError === "boolean")) {
        return { kind: "saved", orderId: row.orderId, whatsappUrl: url.toString(), request: request.data, cartHandled: row.cartHandled, cartError: row.cartError };
      }
    }
  }
  throw new Error("Sesión inválida.");
}

export function CheckoutPreview({ items, rateAvailable, siteKey, cartOpen, clearCheckedOutItems }: {
  items: CartItem[];
  rateAvailable: boolean;
  siteKey: string | null;
  cartOpen: boolean;
  clearCheckedOutItems: (items: CheckoutRequest["items"]) => boolean;
}) {
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [payment, setPayment] = useState<Payment>("bolivares");
  const [state, setState] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [token, setToken] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const rawSession = useSyncExternalStore(subscribe, snapshot, emptySnapshot);
  let session: Session | null = null;
  let sessionError = "";
  try {
    if (rawSession === storageUnavailable) throw new Error("Almacenamiento no disponible.");
    session = readSession(rawSession);
  } catch {
    sessionError = "No se puede recuperar la solicitud de prueba en esta pestaña. No vuelvas a enviarla hasta comprobar si fue guardada.";
  }

  function openWhatsApp(saved: SavedCheckoutSession, popup: Window | null): boolean {
    if (!popup || popup.closed) {
      setError("No se pudo abrir la pestaña de WhatsApp. Permite ventanas emergentes y pulsa «Abrir WhatsApp»; tu carrito se conserva.");
      return false;
    }
    let navigated = false;
    const result = openSavedCheckout(saved, {
      navigate: (url) => { popup.location.replace(url); navigated = true; },
      save: saveSession,
      clear: clearCheckedOutItems,
    });
    if (result.ok) return navigated;
    if (result.reason === "navigation") {
      console.error("No se pudo abrir WhatsApp:", result.error);
      setError("No se pudo abrir WhatsApp. Usa el botón para intentarlo de nuevo; tu carrito se conserva.");
    } else if (result.reason === "session") {
      console.error("No se pudo actualizar la solicitud:", result.error);
      setError("No se pudo actualizar la solicitud. Revisa el carrito antes de volver a abrir WhatsApp.");
    } else {
      setError("No se pudo vaciar el carrito. Revisa sus productos antes de iniciar otra solicitud.");
    }
    return navigated;
  }

  function createWhatsAppWindow(): Window | null {
    try {
      return prepareCheckoutWindow(() => window.open("", "_blank"));
    } catch (error) {
      console.error("No se pudo preparar la pestaña de WhatsApp:", error);
      return null;
    }
  }

  function reopenWhatsApp(saved: SavedCheckoutSession) {
    setError("");
    const popup = createWhatsAppWindow();
    if (!openWhatsApp(saved, popup) && popup && !popup.closed) popup.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !siteKey || sessionError || session?.kind === "saved") return;
    if (!token) { setError("Completa la verificación de seguridad."); return; }
    if (!session && !rateAvailable) { setError("No hay tasa disponible para hoy."); return; }
    let pending = session;
    if (!pending) {
      const form = new FormData(event.currentTarget);
      const validated = validateCheckout({
        customerName: form.get("customerName"), customerPhone: form.get("customerPhone"), fulfillment, payment,
        state, municipality, address: form.get("deliveryDetails"),
        items: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
      });
      if ("error" in validated) { setError(validated.error); return; }
      const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      pending = { kind: "pending", key, request: validated.data };
      try { saveSession(pending); }
      catch { setError("No se pudo guardar el reintento de forma segura en esta pestaña."); return; }
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    const popup = createWhatsAppWindow();
    let navigated = false;
    try {
      const result = await fetch("/api/checkout-test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: pending.key, request: pending.request, token }),
      });
      const data: unknown = await result.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Respuesta inválida.");
      const row = data as Record<string, unknown>;
      if (!result.ok) {
        if (row.definitive === true) saveSession(null);
        setError(typeof row.error === "string" ? row.error : "No se pudo completar la solicitud.");
      } else {
        if (typeof row.orderId !== "string" || typeof row.whatsappUrl !== "string") throw new Error("Respuesta inválida.");
        const saved = readSession(JSON.stringify({
          kind: "saved", orderId: row.orderId, whatsappUrl: row.whatsappUrl,
          request: pending.request, cartHandled: false,
        }));
        if (!saved || saved.kind !== "saved") throw new Error("Respuesta inválida.");
        saveSession(saved);
        navigated = openWhatsApp(saved, popup);
      }
    } catch {
      setError("No se pudo confirmar el resultado. Reintenta con la misma solicitud para evitar duplicados.");
    } finally {
      if (!navigated && popup && !popup.closed) popup.close();
      inFlight.current = false;
      setBusy(false);
      setToken("");
      setResetCount((count) => count + 1);
    }
  }

  function changeFulfillment(value: Fulfillment) {
    setFulfillment(value);
    if (value !== "pickup" && payment === "efectivo") setPayment("bolivares");
    if (value === "delivery" && state !== "Carabobo") {
      setState("Carabobo");
      setMunicipality("");
    }
  }

  if (!items.length && !session && !sessionError) return null;

  return (
    <section aria-labelledby="checkout-title" className="mt-6 border-t border-[#efe6e8] pt-5">
      <h3 id="checkout-title" className="font-[family-name:var(--font-catalog-heading)] text-xl font-semibold">Datos para tu pedido</h3>
      <p className="mt-2 text-sm text-[#5b4041]">
        {siteKey ? "Modo de prueba: la solicitud se guarda como prueba y no es una compra real." : "Formulario en preparación: tus datos aún no se guardan ni se envían."}
      </p>
      {sessionError && siteKey && <p role="alert" className="mt-3 text-sm text-red-700">{sessionError}</p>}
      {session?.kind === "saved" && siteKey ? <div className="mt-4 rounded-lg bg-[#fbf1f4] p-4 text-sm">
        <p role="status">Solicitud de prueba guardada: {session.orderId}. Para completar el envío, pulsa enviar en WhatsApp.</p>
        {session.cartError && <p role="alert" className="mt-2 text-red-700">No se pudo vaciar el carrito. Revisa sus productos antes de iniciar otra solicitud.</p>}
        <button type="button" onClick={() => reopenWhatsApp(session)} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-[#b50638] px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Abrir WhatsApp</button>
        <button type="button" onClick={() => { try { saveSession(null); } catch { setError("No se pudo iniciar una nueva prueba."); } }} className="ml-3 min-h-11 font-semibold text-[#92002a] underline">Iniciar otra prueba</button>
      </div> : <form onSubmit={submit}>
      {session?.kind === "pending" && siteKey && <p role="status" className="mt-3 text-sm text-[#92002a]">Hay una solicitud pendiente de confirmar. El reintento usará los mismos datos, aunque cambies el carrito.</p>}
      <fieldset disabled={busy || !!session || !!sessionError}>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Nombre y apellido
          <input name="customerName" autoComplete="name" maxLength={120} required className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          Teléfono
          <input name="customerPhone" type="tel" autoComplete="tel" maxLength={30} required className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          Forma de entrega
          <select name="fulfillment" value={fulfillment} required onChange={(event) => {
            const value = event.target.value;
            if (value === "pickup" || value === "delivery" || value === "envio_nacional") changeFulfillment(value);
          }} className={fieldClass}>
            <option value="pickup">Retiro en tienda</option>
            <option value="delivery">Delivery</option>
            <option value="envio_nacional">Envío nacional</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Método de pago
          <select name="payment" value={payment} required onChange={(event) => {
            const value = event.target.value;
            if (value === "bolivares" || value === "binance" || value === "efectivo") setPayment(value);
          }} className={fieldClass}>
            <option value="bolivares">Bolívares</option>
            <option value="binance">Binance</option>
            {fulfillment === "pickup" && <option value="efectivo">Efectivo</option>}
          </select>
        </label>
        {fulfillment !== "pickup" && (<>
          <label className="block text-sm font-medium">
            Estado
            <select name="state" value={state} required onChange={(event) => {
              const nextState = event.target.value;
              if (fulfillment === "delivery" && nextState !== "Carabobo") return;
              setState(nextState);
              setMunicipality("");
            }} className={fieldClass}>
              {fulfillment !== "delivery" && <option value="">Selecciona un estado</option>}
              {(fulfillment === "delivery" ? ["Carabobo"] : Object.keys(venezuelaMunicipalities).sort((a, b) => a.localeCompare(b, "es-VE"))).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Municipio
            <select name="municipality" value={municipality} required disabled={!state} onChange={(event) => setMunicipality(event.target.value)} className={`${fieldClass} disabled:bg-[#f5ecee]`}>
              <option value="">Selecciona un municipio</option>
              {[...(venezuelaMunicipalities[state] ?? [])].sort((a, b) => a.localeCompare(b, "es-VE")).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium">
              {fulfillment === "delivery" ? "Dirección para delivery" : "Datos para el envío nacional"}
              <textarea name="deliveryDetails" maxLength={500} rows={3} required aria-describedby="delivery-promotion" className={fieldClass}
                placeholder={fulfillment === "delivery" ? "Dirección y referencias" : "Ciudad, estado y datos necesarios para el envío"} />
            </label>
            <p id="delivery-promotion" className="mt-2 text-sm leading-6 text-[#92002a]">En pedidos mayores a $10, el delivery es gratis en San Diego, Naguanagua y Valencia, estado Carabobo.</p>
          </div>
        </>)}
      </div>
      </fieldset>
      <p className="mt-4 text-sm text-[#5b4041]">
        El costo de delivery o envío se acuerda con el vendedor y no está incluido en el total.
      </p>
      {siteKey && <p className="mt-2 text-sm text-[#5b4041]">Al abrir WhatsApp se retirarán los productos de esta solicitud del carrito. Debes enviar el mensaje desde WhatsApp.</p>}
      {siteKey && cartOpen && <CheckoutTurnstile siteKey={siteKey} onToken={setToken} resetCount={resetCount} />}
      <button type="submit" disabled={!siteKey || busy || !!sessionError} className="mt-4 min-h-11 rounded-lg bg-[#b50638] px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638] disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Preparando WhatsApp…" : siteKey ? session?.kind === "pending" ? "Reintentar y abrir WhatsApp" : "Continuar a WhatsApp (prueba)" : "Envío de pedidos próximamente"}
      </button>
      </form>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
