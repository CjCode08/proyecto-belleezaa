"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, ReceiptText, Save, Search, X } from "lucide-react";
import { availableCommercialQuantity, canAddCommercialQuantity, type CommercialProduct } from "@/lib/catalog/commercial";
import { posAvailabilityKey, posMethods, posMoney, posReservationExpired, posSelection, posTender, validPosPayment, type PosAvailability, type PosCurrency, type PosLine, type PosOrder, type PosPayment } from "@/lib/pos/order";
import { closePosOrder, deleteExpiredPosOrder, savePosOrder, searchPosSku } from "./actions";
import { attentionChannelLabel } from "@/lib/sellers/attention-channel";

const button = "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50";
const field = "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900";
const eventName = "belleza:pos-payment";
function subscribe(notify: () => void) {
  window.addEventListener(eventName,notify);
  window.addEventListener("storage",notify);
  return () => { window.removeEventListener(eventName,notify); window.removeEventListener("storage",notify); };
}
function getServerSnapshot() { return null; }
function notifySellerOrdersUpdated() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("belleza:seller-orders-updated");
  channel.postMessage({ type: "order-updated" });
  channel.close();
}
function notifyCatalogStockUpdated() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("belleza:catalog-stock-updated");
  channel.postMessage({ type: "stock-updated" });
  channel.close();
}

export function PosEditor({ order, availability, today, serverTime, returnHref }: { order: PosOrder; availability: PosAvailability; today: string; serverTime: string; returnHref: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [clock,setClock] = useState(Date.parse(serverTime));
  const [sku,setSku] = useState("");
  const [searchedSku,setSearchedSku] = useState("");
  const [products,setProducts] = useState<CommercialProduct[]>([]);
  const [searchOffset,setSearchOffset] = useState(0);
  const [hasMore,setHasMore] = useState(false);
  const [searchError,setSearchError] = useState("");
  const [current,setCurrent] = useState(order);
  const [lines,setLines] = useState(order.items);
  const [availableBySelection,setAvailableBySelection] = useState(availability);
  const [currency,setCurrency] = useState<PosCurrency>(order.payment_method === "bolivares" ? "bolivares" : "divisas");
  const [method,setMethod] = useState(order.payment_method === "binance" ? "binance" : "efectivo");
  const [reference,setReference] = useState("");
  const [paidOn,setPaidOn] = useState(today);
  const [comment,setComment] = useState("");
  const [received,setReceived] = useState("");
  const [excessConfirmed,setExcessConfirmed] = useState(false);
  const [verified,setVerified] = useState(false);
  const [dirty,setDirty] = useState(false);
  const [message,setMessage] = useState("");
  const [pending,start] = useTransition();
  const running = useRef(false);
  const storageKey = `belleza:pos-close:${order.id}`;
  const pendingPayment = useSyncExternalStore(subscribe, () => { try { return sessionStorage.getItem(storageKey); } catch { return null; } },getServerSnapshot);
  const expired = posReservationExpired(current,clock);
  const savingLocked = pending || pendingPayment !== null || current.status !== "en_proceso";
  const locked = savingLocked || expired;
  const amount = currency === "bolivares" ? current.total_ves : current.total_usd;
  const tender = posTender(received,amount,method);
  const requiresExcessConfirmation = method !== "efectivo" && Boolean(tender && tender.difference > 0);
  const excessReady = !requiresExcessConfirmation || (excessConfirmed && comment.trim().length > 0);
  const date = new Intl.DateTimeFormat("es-VE", { timeZone:"America/Caracas", dateStyle:"short",timeStyle:"short" });
  const receiptQuery = new URLSearchParams(returnHref.split("?")[1] ?? "");
  receiptQuery.delete("vista");
  receiptQuery.delete("orden");
  receiptQuery.set("origen", "recibos");

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    const timer = window.setInterval(() => setClock(Date.now()),1000);
    return () => window.clearInterval(timer);
  },[]);

  function closeDialog() {
    if (pending) return;
    if (dirty && !window.confirm("Cerrar sin guardar los cambios de esta orden?")) return;
    dialog.current?.close();
    router.replace(returnHref);
    router.refresh();
  }

  function searchSku(offset = 0) {
    if (locked || !sku.trim()) return;
    setSearchError("");
    start(async () => {
      try {
        const query = sku.trim();
        const result = await searchPosSku(current.id,query,offset);
        setProducts(result.products); setSearchedSku(query); setSearchOffset(offset); setHasMore(Boolean(result.hasMore));
        setAvailableBySelection(previous => ({
          ...previous,
          ...Object.fromEntries(result.products.flatMap(product => [
            ...product.variants.map(variant => [posAvailabilityKey("variant",variant.id),variant.stock]),
            ...product.bundles.map(bundle => [posAvailabilityKey("bundle",bundle.id),bundle.stock]),
          ])),
        }));
        setSearchError(result.error ?? "");
      } catch { setSearchError("No se pudo buscar el SKU. Los cambios de la orden se conservan."); }
    });
  }

  function change(line: PosLine, delta: number, maxQuantity?: number) {
    if (locked) return;
    const target = posSelection(line);
    const available = maxQuantity ?? availableBySelection[posAvailabilityKey(target.kind,target.id)];
    if (delta > 0 && (available === undefined || !canAddCommercialQuantity(delta,available,line.quantity))) {
      setMessage(available === undefined
        ? "No se pudo verificar la disponibilidad. Busca nuevamente el SKU antes de agregar unidades."
        : `Disponible para agregar en esta orden: ${availableCommercialQuantity(available,line.quantity)}.`);
      return;
    }
    setLines(lines.flatMap(item => {
      const selected = posSelection(item);
      if (selected.id !== target.id || selected.kind !== target.kind) return [item];
      const quantity = item.quantity + delta;
      return quantity > 0 && quantity <= 999 ? [{ ...item, quantity }] : [];
    }));
    setDirty(true); setVerified(false);
  }

  function add(product: CommercialProduct, kind: "variant" | "bundle", id: string) {
    const existing = lines.find(line => posSelection(line).id === id && line.kind === kind);
    const option = kind === "variant" ? product.variants.find(item => item.id === id) : product.bundles.find(item => item.id === id);
    const maxQuantity = option?.stock ?? 0;
    setAvailableBySelection(previous => ({ ...previous, [posAvailabilityKey(kind,id)]: maxQuantity }));
    if (existing) { if (existing.quantity < 999) change(existing,1,maxQuantity); return; }
    if (locked || lines.length >= 100) return;
    if (maxQuantity < 1) { setMessage("No hay unidades disponibles para agregar a esta orden."); return; }
    const variant = product.variants.find(item => item.id === id);
    const bundle = product.bundles.find(item => item.id === id);
    setLines([...lines,{ id, kind, product_name:product.name, variant_id:kind === "variant" ? id : null, bundle_id:kind === "bundle" ? id : null,
      size:variant?.size ?? null,color:variant?.color ?? null,sku:variant?.sku ?? null,bundle_description:bundle?.description ?? null,
      quantity:1,regular_price_usd:null,promotion_price_usd:null,promotion_units:0,promotion_description:null,bundle_price_usd:null,total_usd:0 }]);
    setDirty(true); setVerified(false);
  }

  function save() {
    if (savingLocked || running.current || !lines.length) return;
    running.current = true; setMessage("");
    start(async () => {
      try {
        const result = await savePosOrder(current.id,current.revision,currency,lines.map(posSelection));
        if (!result.order) { setMessage(result.error ?? "No se pudo guardar la revision."); return; }
        if (result.availability) setAvailableBySelection(result.availability);
        notifySellerOrdersUpdated();
        setCurrent(result.order); setLines(result.order.items); setClock(Date.now()); setDirty(false); setVerified(false); setMessage(expired ? "Orden habilitada con reserva renovada. Revisa el total antes de cobrar." : "Recalculo guardado. Revisa el total antes de cobrar.");
      } catch { setMessage("No se pudo confirmar el guardado. Recarga para comprobar la revision; tus cambios siguen en pantalla."); }
      finally { running.current = false; }
    });
  }

  function deleteExpired() {
    if (!expired || pending || running.current || !window.confirm("Eliminar esta orden vencida? El asesor vera quien la elimino en Creadas.")) return;
    running.current = true; setMessage("");
    start(async () => {
      try {
        const result = await deleteExpiredPosOrder(current.id,current.revision);
        if (!result.order) { setMessage(result.error ?? "No se pudo eliminar la orden."); return; }
        notifySellerOrdersUpdated();
        dialog.current?.close();
        router.replace(returnHref);
        router.refresh();
      } catch { setMessage("No se pudo confirmar la eliminacion. Recarga Caja para comprobar el estado."); }
      finally { running.current = false; }
    });
  }

  function close() {
    if (pending || running.current || ((current.status !== "en_proceso" || expired) && !pendingPayment)) return;
    let payment: PosPayment;
    try {
      payment = pendingPayment ? JSON.parse(pendingPayment) as PosPayment : {
        orderId:current.id,revision:current.revision,key:crypto.randomUUID(),currency,method,reference,paidOn,comment,amount:amount ?? -1,
        receivedAmount:tender?.received,
        excessConfirmed:requiresExcessConfirmation && excessConfirmed,
      };
      if (!pendingPayment && (dirty || !verified || !tender?.sufficient || !validPosPayment(payment,today))) { setMessage("Guarda la revision y verifica el metodo, referencia, fecha e importe recibido."); return; }
      sessionStorage.setItem(storageKey,JSON.stringify(payment)); window.dispatchEvent(new Event(eventName));
    } catch { setMessage("No se pudo guardar la clave de reintento. No se envio el cobro."); return; }
    running.current = true; setMessage("");
    start(async () => {
      try {
        const result = await closePosOrder(payment);
        if (!result.order) {
          if (result.definitive) { sessionStorage.removeItem(storageKey); window.dispatchEvent(new Event(eventName)); }
          setMessage(result.error ?? "Consulta la orden para verificar el cobro."); return;
        }
        notifySellerOrdersUpdated();
        notifyCatalogStockUpdated();
        setCurrent(result.order); sessionStorage.removeItem(storageKey); window.dispatchEvent(new Event(eventName));
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("belleza:admin-sales-updated");
          channel.postMessage({ type: "sale-completed" });
          channel.close();
        }
        setMessage("Cobro registrado. Recibo guardado.");
      } catch { setMessage("Respuesta sin confirmar. No cobres otra vez: pulsa Verificar cierre o consulta Recibos."); }
      finally { running.current = false; }
    });
  }

  return (
    <dialog ref={dialog} aria-labelledby={`pos-order-${order.id}`} onCancel={event => {event.preventDefault();closeDialog();}} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-lg border border-rose-100 bg-white p-5 text-slate-800 shadow-sm backdrop:bg-slate-900/40 sm:p-7">
      <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-rose-700">Cobro de orden</p><button type="button" title="Cerrar orden" aria-label="Cerrar orden" disabled={pending} onClick={closeDialog} className={button}><X size={18} aria-hidden="true" /></button></div>
      <header className="border-b border-rose-100 pb-4">
        <h2 id={`pos-order-${order.id}`} className="break-all font-mono text-lg font-semibold">ORD-{current.id.slice(0,8).toUpperCase()}</h2>
        <p className="mt-2 break-words font-medium">{current.customer_name ?? "Cliente sin nombre"}</p>
        <p className="text-sm text-slate-600">Cedula: {current.customer_id ?? "Sin cedula"}</p>
        <p className="mt-1 text-sm">Atencion: {attentionChannelLabel(current.attention_channel)}</p>
        <p className="mt-1 text-sm">Asesor: {current.advisor_name} {current.advisor_username && `(${current.advisor_username})`}</p>
        <p className="mt-1 text-sm text-slate-600" aria-live="polite">{current.status === "completada" ? "Pagada" : expired ? "Inhabilitada: reserva vencida" : `Reserva hasta ${date.format(new Date(current.expires_at))}`} · Revision {current.revision}</p>
      </header>
      {expired && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 pb-4"><div><p className="text-sm font-semibold text-amber-900">Reserva vencida</p><p className="text-sm text-amber-900">Habilita la orden para validar stock, actualizar precios y reservar nuevamente durante 45 minutos.</p></div><div className="flex flex-wrap gap-2"><button type="button" className={`${button} mt-3`} disabled={savingLocked || !lines.length} onClick={save}>Habilitar orden</button><button type="button" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={pending} onClick={deleteExpired}><Trash2 size={16} aria-hidden="true" /> Eliminar orden</button></div></div>}
      {current.status === "completada" ? <Link className={`${button} mt-5`} href={`/pos/${current.id}/recibo?${receiptQuery}`} prefetch={false}><ReceiptText size={18} aria-hidden="true" /> Ver recibo</Link> : <>
        <fieldset disabled={locked} className="mt-4">
          <legend className="text-sm font-semibold">Modalidad de la orden</legend>
          <div className="mt-2 flex flex-wrap gap-4">{(["bolivares","divisas"] as const).map(value => <label key={value} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name={`currency-${order.id}`} checked={currency===value} onChange={() => {setCurrency(value);setMethod("efectivo");setDirty(true);setVerified(false);setExcessConfirmed(false);}} />{value === "bolivares" ? "Pago en bolivares" : "Pago en divisas"}</label>)}</div>
        </fieldset>
        <ul className="divide-y divide-rose-100">{lines.map(line => <li key={`${line.kind}:${posSelection(line).id}`} className="py-4">
          <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{line.product_name}</p><p className="break-words text-sm text-slate-600">{line.kind === "variant" ? [line.size,line.color,line.sku || "Sin SKU"].join(" / ") : `Bulto de 12: ${line.bundle_description}`}</p></div><p className="text-sm tabular-nums">{dirty ? "Por recalcular" : posMoney(line.total_usd)}</p></div>
          <p className="mt-1 text-sm text-slate-600">{line.kind === "bundle" ? "Precio por bulto" : "Precio unitario"}: Ref. {(line.kind === "bundle" ? line.bundle_price_usd : line.regular_price_usd)?.toFixed(2) ?? "Por recalcular"}</p>
          {line.promotion_units > 0 && <p className="mt-2 text-sm text-rose-700">Promo: {line.promotion_units} unidades a Ref. {line.promotion_price_usd?.toFixed(2)} c/u{line.promotion_description && ` · ${line.promotion_description}`}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2"><button title="Restar unidad" aria-label={`Restar unidad de ${line.product_name}`} className={button} disabled={locked} onClick={() => change(line,-1)}><Minus size={16} /></button><span className="w-9 text-center tabular-nums">{line.quantity}</span><button title="Sumar unidad" aria-label={`Sumar unidad de ${line.product_name}`} className={button} disabled={locked || line.quantity>=999 || (availableBySelection[posAvailabilityKey(line.kind,posSelection(line).id)] ?? line.quantity) <= line.quantity} onClick={() => change(line,1)}><Plus size={16} /></button><button title="Eliminar producto" aria-label={`Eliminar ${line.product_name}`} className={button} disabled={locked} onClick={() => { if (window.confirm("Eliminar esta linea de la orden?")) change(line,-line.quantity); }}><Trash2 size={16} /></button><span className="text-xs text-slate-600">{availableBySelection[posAvailabilityKey(line.kind,posSelection(line).id)] === undefined ? "Disponibilidad pendiente de verificar" : `${availableCommercialQuantity(availableBySelection[posAvailabilityKey(line.kind,posSelection(line).id)],line.quantity)} disponibles para agregar`}</span></div>
        </li>)}</ul>
        <section aria-label="Agregar producto por SKU" className="mt-4 border-y border-rose-100 py-4">
          <form onSubmit={event => {event.preventDefault();searchSku();}} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm font-medium">SKU de la prenda<input name="sku" value={sku} maxLength={120} spellCheck={false} autoComplete="off" disabled={locked} onChange={event => setSku(event.target.value.toUpperCase())} className={field} /></label>
            <button type="submit" className={button} disabled={locked || !sku.trim()}><Search size={17} aria-hidden="true" /> Buscar SKU</button>
          </form>
          {searchError && <p role="alert" className="mt-3 text-sm text-red-700">{searchError}</p>}
          {searchedSku && !products.length && !searchError && <p className="mt-3 text-sm text-slate-600">No hay prendas disponibles para {searchedSku}.</p>}
          <ul className="divide-y divide-rose-100">{products.map(product => <li key={product.id} className="py-3"><h3 className="break-words text-sm font-semibold">{product.name}</h3>{product.variants.map(variant => <div key={variant.id} className="mt-2 flex items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words">{variant.size} / {variant.color} / {variant.sku} · {variant.stock} disponibles para la orden</span><button type="button" aria-label={`Agregar ${product.name} ${variant.size} ${variant.color}`} className={button} disabled={locked || variant.stock < 1} onClick={() => add(product,"variant",variant.id)}><Plus size={16} aria-hidden="true" /></button></div>)}</li>)}</ul>
          {(searchOffset>0 || hasMore) && <div className="mt-2 flex gap-2">{searchOffset>0 && <button className={button} disabled={locked || sku.trim()!==searchedSku} onClick={() => searchSku(searchOffset-24)}>Anterior</button>}{hasMore && <button className={button} disabled={locked || sku.trim()!==searchedSku} onClick={() => searchSku(searchOffset+24)}>Siguiente</button>}</div>}
        </section>
        <div className="my-4 flex flex-wrap items-center justify-between gap-3"><p className="font-semibold tabular-nums" aria-live="polite">{dirty ? "Recalculo pendiente" : `Total: ${amount === null ? "Sin tasa" : posMoney(amount,currency)}`}</p>{!expired && <button className={button} disabled={savingLocked || !lines.length} onClick={save}><Save size={17} aria-hidden="true" /> Recalcular y guardar</button>}</div>
        <fieldset disabled={locked || dirty} className="space-y-3 border-t border-rose-100 pt-5">
          <legend className="text-lg font-semibold">Registrar cobro</legend>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Forma de pago<select className={field} value={method} onChange={event => {setMethod(event.target.value);setVerified(false);setExcessConfirmed(false);}}>{posMethods[currency].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="text-sm">Fecha de pago<input type="date" name="paidOn" value={paidOn} max={today} min="1900-01-01" className={field} onChange={event => {setPaidOn(event.target.value);setVerified(false);}} /></label></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label htmlFor={`received-${order.id}`} className="text-sm font-medium">Monto recibido ({currency === "bolivares" ? "Bs." : "USD"})
              <input id={`received-${order.id}`} name="received" type="text" inputMode="decimal" autoComplete="off" required maxLength={13} value={received} className={field} onChange={event => {setReceived(event.target.value);setVerified(false);setExcessConfirmed(false);}} />
            </label>
            <div className="text-sm font-medium"><span>Vuelto</span><output aria-label="Vuelto" className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 px-3 tabular-nums">{tender ? posMoney(tender.change,currency) : "—"}</output></div>
            <div className="text-sm font-medium"><span>Dif.</span><output aria-label="Diferencia entre monto recibido y total" className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 px-3 tabular-nums">{tender ? `${tender.difference < 0 ? "-" : tender.difference > 0 ? "+" : ""}${posMoney(Math.abs(tender.difference),currency)}` : "—"}</output></div>
          </div>
          {received && !tender && <p role="status" className="text-sm text-red-700">Ingresa un monto válido con hasta dos decimales.</p>}
          {tender && !tender.sufficient && <p role="status" className="text-sm text-red-700">El monto recibido es menor que el total.</p>}
          <label className="block text-sm">Referencia {method !== "efectivo" ? "(obligatoria)" : "(opcional)"}<input name="reference" maxLength={120} required={method !== "efectivo"} value={reference} className={field} onChange={event => {setReference(event.target.value);setVerified(false);}} /></label>
          <label className="block text-sm">Comentarios {requiresExcessConfirmation && "(obligatorio por diferencia)"}<textarea name="comment" maxLength={500} required={requiresExcessConfirmation} value={comment} className={`${field} py-2`} onChange={event => {setComment(event.target.value);setVerified(false);}} /></label>
          {requiresExcessConfirmation && <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={excessConfirmed} onChange={event => {setExcessConfirmed(event.target.checked);setVerified(false);}} /><span>Confirmo que el monto recibido es mayor al monto por cobrar.</span></label>}
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={verified} disabled={!tender?.sufficient || !excessReady} onChange={event => setVerified(event.target.checked)} /><span>Pago verificado por {amount === null ? "importe no disponible" : posMoney(amount,currency)}. Registrar y descontar las prendas de esta orden.</span></label>
        </fieldset>
      </>}
      {message && <p role="status" className="my-4 text-sm text-rose-700">{message}</p>}
      {(current.status === "en_proceso" || pendingPayment) && <button className="mt-4 min-h-11 w-full rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50" disabled={pending || (!pendingPayment && (expired || dirty || !verified || amount === null || !tender?.sufficient || !excessReady))} onClick={close}>{pending ? "Procesando..." : pendingPayment ? "Verificar cierre" : "Registrar pago y cerrar orden"}</button>}
    </dialog>
  );
}