"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { venezuelaMunicipalities } from "@/lib/catalog/venezuela";
import { validateCommercialCheckout, type CommercialCheckoutItem, type CommercialCheckoutRequest } from "@/lib/catalog/commercial-checkout";
import { prepareCheckoutWindow } from "@/lib/catalog/checkout-navigation";
import type { CommercialItem } from "@/lib/catalog/commercial";
import { CheckoutTurnstile } from "./checkout-turnstile";

type Session = { kind: "pending"; key: string; request: CommercialCheckoutRequest } | { kind: "saved"; orderId: string; whatsappUrl: string; request: CommercialCheckoutRequest; cartHandled: boolean; cartError?: boolean };
const empty = () => "";
const field = "mt-1 min-h-11 w-full rounded-md border border-[#d6d3cd] bg-white px-3 py-2 text-[#1e1a1c]";
function snapshot(key: string) { try { return sessionStorage.getItem(key) ?? ""; } catch { return "unavailable"; } }
function subscribe(callback: () => void) { window.addEventListener("belleza-commercial-checkout", callback); return () => window.removeEventListener("belleza-commercial-checkout", callback); }
function save(key: string, value: Session | null) { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); window.dispatchEvent(new Event("belleza-commercial-checkout")); }
function parse(raw: string): Session | null {
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Sesión inválida.");
  const row = value as Record<string, unknown>;
  const request = validateCommercialCheckout(row.request);
  if ("error" in request) throw new Error("Sesión inválida.");
  if (row.kind === "pending" && typeof row.key === "string" && /^[0-9a-f]{64}$/.test(row.key)) return { kind: "pending", key: row.key, request: request.data };
  if (row.kind === "saved" && typeof row.orderId === "string" && typeof row.whatsappUrl === "string" && typeof row.cartHandled === "boolean" && (row.cartError === undefined || typeof row.cartError === "boolean")) {
    const url = new URL(row.whatsappUrl);
    if (url.protocol === "https:" && url.hostname === "wa.me" && /^\/[1-9][0-9]{7,14}$/.test(url.pathname)) return { kind: "saved", orderId: row.orderId, whatsappUrl: url.toString(), request: request.data, cartHandled: row.cartHandled, cartError: row.cartError };
  }
  throw new Error("Sesión inválida.");
}

export function CommercialCheckout({ items, payment, setPayment, rateAvailable, siteKey, mode, cartOpen, clear }: {
  items: CommercialItem[]; payment: CommercialCheckoutRequest["payment"]; setPayment: (value: CommercialCheckoutRequest["payment"]) => void;
  rateAvailable: boolean; siteKey: string | null; mode: "test" | "production"; cartOpen: boolean; clear: (items: CommercialCheckoutItem[]) => boolean;
}) {
  const key = `belleza-commercial-checkout-${mode}-v1`;
  const raw = useSyncExternalStore(subscribe, () => snapshot(key), empty);
  const [fulfillment, setFulfillment] = useState<CommercialCheckoutRequest["fulfillment"]>("pickup");
  const [state, setState] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [token, setToken] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  let session: Session | null = null;
  let sessionError = "";
  try { session = parse(raw); } catch { sessionError = "No se puede recuperar la solicitud. Comprueba si fue guardada antes de iniciar otra."; }
  function navigate(saved: Extract<Session, { kind: "saved" }>, popup: Window | null) {
    if (!popup || popup.closed) { setError("Permite ventanas emergentes y pulsa Abrir WhatsApp; el carrito se conserva."); return false; }
    try { popup.location.replace(saved.whatsappUrl); } catch { setError("No se pudo abrir WhatsApp; el carrito se conserva."); return false; }
    if (!saved.cartHandled) {
      try { save(key, { ...saved, cartHandled: true }); }
      catch { setError("Revisa el carrito antes de iniciar otra solicitud."); return true; }
      if (!clear(saved.request.items)) {
        try { save(key, { ...saved, cartHandled: true, cartError: true }); } catch { /* El aviso también permanece en pantalla. */ }
        setError("No se pudo vaciar el carrito. Revísalo antes de continuar.");
      }
    }
    return true;
  }
  function popup() { try { return prepareCheckoutWindow(() => window.open("", "_blank")); } catch { return null; } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !siteKey || sessionError || session?.kind === "saved") return;
    if (!token) { setError("Completa la verificación de seguridad."); return; }
    if (!session && !rateAvailable) { setError("No hay tasa disponible para hoy."); return; }
    let pending = session;
    if (!pending) {
      const form = new FormData(event.currentTarget);
      const result = validateCommercialCheckout({ customerName: form.get("customerName"), customerPhone: form.get("customerPhone"), fulfillment, payment, state, municipality, address: form.get("address"), items: items.map((item) => ({ kind: item.kind, id: item.selectionId, quantity: item.quantity })) });
      if ("error" in result) { setError(result.error); return; }
      const requestKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      pending = { kind: "pending", key: requestKey, request: result.data };
      try { save(key, pending); } catch { setError("No se pudo guardar el reintento en esta pestaña."); return; }
    }
    inFlight.current = true; setBusy(true); setError("");
    const windowRef = popup();
    let navigated = false;
    try {
      const response = await fetch(mode === "test" ? "/api/checkout-commercial-test" : "/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: pending.key, request: pending.request, token }) });
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Respuesta inválida.");
      const row = result as Record<string, unknown>;
      if (!response.ok) {
        if (row.definitive === true) save(key, null);
        setError(typeof row.error === "string" ? row.error : "No se pudo completar la solicitud.");
      } else {
        const saved = parse(JSON.stringify({ kind: "saved", orderId: row.orderId, whatsappUrl: row.whatsappUrl, request: pending.request, cartHandled: false }));
        if (!saved || saved.kind !== "saved") throw new Error("Respuesta inválida.");
        save(key, saved);
        navigated = navigate(saved, windowRef);
      }
    } catch { setError("No se pudo confirmar el resultado. Reintenta con la misma solicitud para evitar duplicados."); }
    finally { if (!navigated && windowRef && !windowRef.closed) windowRef.close(); inFlight.current = false; setBusy(false); setToken(""); setResetCount((value) => value + 1); }
  }
  if (!items.length && !session && !sessionError) return null;
  return <section className="mt-6 border-t border-[#e8e6e1] pt-5" aria-labelledby="commercial-checkout-title">
    <h3 id="commercial-checkout-title" className="text-lg font-semibold">Datos para tu pedido</h3>
    <p className="mt-2 text-sm text-[#5b5550]">{siteKey ? mode === "test" ? "Solicitud de prueba: no es una compra real." : "El vendedor confirmará precios y disponibilidad." : "Los pedidos todavía no están disponibles."}</p>
    {sessionError && <p role="alert" className="mt-3 text-sm text-red-700">{sessionError}</p>}
    {session?.kind === "saved" && siteKey ? <div className="mt-4 text-sm"><p>Solicitud guardada. Debes enviar el mensaje desde WhatsApp.</p>{session.cartError && <p role="alert" className="text-red-700">Revisa el carrito antes de iniciar otra solicitud.</p>}<button type="button" className="mt-3 min-h-11 font-semibold text-[#92002a] underline" onClick={() => navigate(session, popup())}>Abrir WhatsApp</button><button type="button" className="ml-4 min-h-11 font-semibold text-[#92002a] underline" onClick={() => { try { save(key, null); } catch { setError("No se pudo iniciar otra solicitud."); } }}>Iniciar otra solicitud</button></div> : <form onSubmit={submit}>
      {session?.kind === "pending" && siteKey && <p role="status" className="mt-3 text-sm">El reintento conservará los datos de la solicitud anterior.</p>}
      <fieldset disabled={busy || !!session || !!sessionError} className="mt-4 grid gap-3">
        <label className="text-sm font-medium">Nombre y apellido<input className={field} name="customerName" autoComplete="name" maxLength={120} required /></label>
        <label className="text-sm font-medium">Teléfono<input className={field} name="customerPhone" type="tel" autoComplete="tel" maxLength={30} required /></label>
        <label className="text-sm font-medium">Entrega<select className={field} value={fulfillment} onChange={(event) => { const value = event.target.value as CommercialCheckoutRequest["fulfillment"]; setFulfillment(value); if (value !== "pickup" && payment === "efectivo") setPayment("bolivares"); if (value === "delivery" && state !== "Carabobo") { setState("Carabobo"); setMunicipality(""); } }}><option value="pickup">Retiro en tienda</option><option value="delivery">Delivery</option><option value="envio_nacional">Envío nacional</option></select></label>
        <label className="text-sm font-medium">Pago<select className={field} value={payment} onChange={(event) => setPayment(event.target.value as CommercialCheckoutRequest["payment"])}><option value="bolivares">Bolívares</option><option value="binance">Binance</option>{fulfillment === "pickup" && <option value="efectivo">Efectivo</option>}</select></label>
        {fulfillment !== "pickup" && <><label className="text-sm font-medium">Estado<select className={field} value={state} required onChange={(event) => { setState(event.target.value); setMunicipality(""); }}>{fulfillment !== "delivery" && <option value="">Selecciona un estado</option>}{(fulfillment === "delivery" ? ["Carabobo"] : Object.keys(venezuelaMunicipalities).sort()).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm font-medium">Municipio<select className={field} value={municipality} required disabled={!state} onChange={(event) => setMunicipality(event.target.value)}><option value="">Selecciona un municipio</option>{(venezuelaMunicipalities[state] ?? []).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm font-medium">Dirección<textarea name="address" className={field} maxLength={500} required rows={3} /></label><p className="text-sm text-[#92002a]">En pedidos mayores a $10, el delivery es gratis en San Diego, Naguanagua y Valencia, Carabobo.</p></>}
      </fieldset>
      <p className="mt-4 text-sm text-[#5b5550]">El costo de delivery o envío se acuerda con el vendedor y no está incluido en el total.</p>
      {siteKey && cartOpen && <CheckoutTurnstile siteKey={siteKey} onToken={setToken} resetCount={resetCount} />}
      <button type="submit" disabled={!siteKey || busy || !!sessionError} className="mt-4 min-h-11 rounded-md bg-[#b50638] px-4 font-semibold text-white disabled:opacity-50">{busy ? "Preparando WhatsApp…" : siteKey ? mode === "test" ? "Continuar a WhatsApp (prueba)" : "Continuar a WhatsApp" : "Envío de pedidos próximamente"}</button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}