"use client";

import Image from "next/image";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { ImageOff, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { canAddCommercialQuantity, commercialTotal, parseCommercialCart, type CommercialItem, type CommercialProduct } from "@/lib/catalog/commercial";
import { createSellerOrder } from "./orders-actions";

type Method = "bolivares" | "binance" | "efectivo";
type Draft = { items: CommercialItem[]; method: Method; customerName: string; customerId: string };
type PendingOrder = { key: string; payload: string };

const methods = { bolivares: "Bol\u00edvares", binance: "Binance", efectivo: "Efectivo en divisas" };
const initial: Draft = { items: [], method: "bolivares", customerName: "", customerId: "" };
const draftEvent = "belleza:sellers-draft";
const actionStyle = "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-rose-200 px-2 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50";
const primaryStyle = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50";
const usd = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });

function readDraft(raw: string | null): Draft {
  if (!raw) return initial;
  try {
    const stored = JSON.parse(raw);
    const method = checkedMethod(stored.method);
    const items = parseCommercialCart(JSON.stringify(stored.items));
    return {
      items,
      method,
      customerName: typeof stored.customerName === "string" ? stored.customerName.slice(0, 120) : "",
      customerId: typeof stored.customerId === "string" ? stored.customerId.replace(/[^0-9]/g, "").slice(0, 12) : "",
    };
  } catch {
    return initial;
  }
}

function checkedMethod(value: unknown): Method {
  return value === "binance" || value === "efectivo" ? value : "bolivares";
}

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(draftEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(draftEvent, notify);
  };
}

function getServerSnapshot() {
  return undefined;
}

function selectionLabel(item: CommercialItem) {
  if (item.kind === "bundle") return `Bulto: ${item.product.bundles.find((bundle) => bundle.id === item.selectionId)?.description}`;
  const variant = item.product.variants.find((option) => option.id === item.selectionId);
  return variant ? `${variant.size} / ${variant.color} / ${variant.sku || "Sin SKU"}` : "Sin SKU";
}

function ProductPhoto({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative grid aspect-[4/3] place-items-center border-b border-rose-100 bg-rose-50/40 text-slate-500">
      {url && !failed ? (
        <Image src={url} alt={name} fill unoptimized loading="lazy" className="object-contain" onError={() => setFailed(true)} />
      ) : <span className="flex items-center gap-2 text-sm"><ImageOff size={17} aria-hidden="true" /> Sin foto disponible</span>}
    </div>
  );
}

export function SellersCart({ sellerId, products, imageUrls, catalogUnavailable }: { sellerId: string; products: CommercialProduct[]; imageUrls: Record<string, string>; catalogUnavailable: boolean }) {
  const key = `belleza:sellers:v1:${sellerId}`;
  const pendingKey = `${key}:pending-order`;
  const router = useRouter();
  const raw = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key); } catch { return null; }
  }, getServerSnapshot);
  const pendingRaw = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(pendingKey); } catch { return null; }
  }, getServerSnapshot);
  const [backup, setBackup] = useState<Draft | null>(null);
  const [orderError, setOrderError] = useState("");
  const [isCreating, startCreating] = useTransition();
  const cart = useRef<HTMLDialogElement>(null);
  const draft = backup ?? readDraft(raw ?? null);
  const category = draft.method === "bolivares" ? "bolivares" : "divisas";
  const pendingOrder = pendingRaw !== null && pendingRaw !== undefined;
  const total = commercialTotal(draft.items, category);

  function save(next: Draft) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setBackup(null);
      window.dispatchEvent(new Event(draftEvent));
    } catch {
      setBackup(next);
    }
  }

  function change(item: CommercialItem, delta: number) {
    const existing = draft.items.find((line) => line.kind === item.kind && line.selectionId === item.selectionId);
    const currentQuantity = existing?.quantity ?? 0;
    const options = item.kind === "variant" ? item.product.variants : item.product.bundles;
    const stock = options.find((option) => option.id === item.selectionId)?.stock;
    if (delta > 0 && ((!existing && draft.items.length >= 100) || !canAddCommercialQuantity(delta, stock, currentQuantity))) return;
    const remaining = currentQuantity + delta;
    const items = draft.items.filter((line) => line !== existing).map((line) => {
      if (delta < 0 || line.product.id !== item.product.id) return line;
      const currentOptions = line.kind === "variant" ? item.product.variants : item.product.bundles;
      return currentOptions.some((option) => option.id === line.selectionId) ? { ...line, product: item.product } : line;
    });
    if (remaining > 0) items.push({ ...item, quantity: remaining });
    save({ ...draft, items });
  }

  function submitOrder() {
    if (!draft.items.length || total === null) return;
    setOrderError("");
    const customerName = draft.customerName.trim().replace(/\s+/g, " ");
    const customerId = draft.customerId.trim();
    if (customerName.length < 3 || customerName.length > 120 || customerName.split(" ").length < 2) {
      setOrderError("Ingresa el nombre y apellido del cliente.");
      return;
    }
    if (!/^\d{6,12}$/.test(customerId)) {
      setOrderError("Ingresa una cedula valida de 6 a 12 digitos.");
      return;
    }
    const payload = JSON.stringify({
      method: draft.method,
      customerName,
      customerId,
      items: draft.items.map(({ kind, selectionId, quantity }) => ({ kind, id: selectionId, quantity })),
    });
    let orderKey: PendingOrder;
    try {
      const previous = localStorage.getItem(pendingKey);
      const stored: PendingOrder | null = previous ? JSON.parse(previous) as PendingOrder : null;
      if (stored && stored.payload !== payload) {
        let oldPayload: unknown = null;
        try { oldPayload = JSON.parse(stored.payload); } catch {}
        const oldHasCustomer = oldPayload && typeof oldPayload === "object"
          && "customerName" in oldPayload && "customerId" in oldPayload;
        if (oldHasCustomer) {
          setOrderError("Hay un envio anterior sin confirmar. Reintenta el mismo pedido sin cambiar prendas ni datos.");
          return;
        }
        try { localStorage.removeItem(pendingKey); } catch {}
        window.dispatchEvent(new Event(draftEvent));
        orderKey = { key: crypto.randomUUID(), payload };
      } else {
        orderKey = stored ?? { key: crypto.randomUUID(), payload };
      }
      localStorage.setItem(pendingKey, JSON.stringify(orderKey));
      window.dispatchEvent(new Event(draftEvent));
    } catch {
      setOrderError("No se pudo guardar la clave de reintento en este dispositivo; no enviamos el pedido.");
      return;
    }

    startCreating(async () => {
      try {
        const result = await createSellerOrder({
          key: orderKey.key,
          method: draft.method,
          customerName,
          customerId,
          items: draft.items.map(({ kind, selectionId, quantity }) => ({ kind, id: selectionId, quantity })),
        });
        if (result.error || !result.orderId) {
          if (result.retryable === false) {
            try { localStorage.removeItem(pendingKey); } catch {}
            window.dispatchEvent(new Event(draftEvent));
          }
          setOrderError(result.error ?? "No se pudo confirmar el pedido. Conservamos el carrito para reintentarlo.");
          return;
        }
        try { localStorage.removeItem(pendingKey); } catch {}
        window.dispatchEvent(new Event(draftEvent));
        save({ items: [], method: draft.method, customerName: draft.customerName, customerId: draft.customerId });
        cart.current?.close();
        router.push("/vendedores?vista=creadas");
        router.refresh();
      } catch {
        setOrderError("No se pudo confirmar la respuesta. Reintenta el mismo pedido para verificarlo sin duplicarlo.");
      }
    });
  }

  return (
    <div className="mt-5">
      <section aria-labelledby="seller-items">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-100 bg-white px-4 py-3 shadow-sm">
          <h2 id="seller-items" className="text-lg font-semibold">Prendas disponibles</h2>
          <button type="button" className={primaryStyle} aria-haspopup="dialog" onClick={() => cart.current?.showModal()}><ShoppingBag size={17} aria-hidden="true" /> Ver carrito ({draft.items.reduce((sum, item) => sum + item.quantity, 0)})</button>
        </div>
        {!catalogUnavailable && !products.length && <p className="mt-3 text-sm">No hay prendas para esta b&uacute;squeda.</p>}
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const price = product.prices.find((row) => row.payment_category === category);
          const bolivaresPrice = product.prices.find((row) => row.payment_category === "bolivares");
          const divisasPrice = product.prices.find((row) => row.payment_category === "divisas");
          const formatRef = (amount: number | null) => amount == null ? "Sin precio" : amount.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const selections = [
            ...product.variants.map((variant) => ({ kind: "variant" as const, ...variant, label: `${variant.size} / ${variant.color} / ${variant.sku || "Sin SKU"}` })),
            ...product.bundles.map((bundle) => ({ kind: "bundle" as const, ...bundle, label: `Bulto de 12: ${bundle.description}` })),
          ];
          return (
            <article key={product.id} className="min-w-0 overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm">
              <ProductPhoto key={imageUrls[product.id]} url={imageUrls[product.id]} name={product.name} />
              <div className="p-4">
              <h3 className="break-words font-semibold">{product.name}</h3>
              {product.category && <p className="text-sm text-[var(--seller-muted)]">{product.category}</p>}
              {product.description && <p className="mt-1 break-words text-sm">{product.description}</p>}
              <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-rose-100 bg-rose-50/40 p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-slate-800">Bolívares</p>
                  <p className="mt-1">Unidad: Ref. {formatRef(bolivaresPrice?.unit_price_usd ?? null)}</p>
                  {bolivaresPrice?.promotion_quantity && bolivaresPrice.promotion_price_usd !== null && (
                    <div className="mt-1">
                      <p className="font-semibold">Precio Promo: Ref. {formatRef(bolivaresPrice.promotion_price_usd)} c/u</p>
                      {bolivaresPrice.promotion_description && <p className="text-xs text-slate-500">{bolivaresPrice.promotion_description}</p>}
                    </div>
                  )}
                  {product.bundles.length > 0 && <p className="mt-1">Precio por bulto: Ref. {formatRef(bolivaresPrice?.bundle_price_usd ?? null)}</p>}
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Divisas</p>
                  <p className="mt-1">Unidad: Ref. {formatRef(divisasPrice?.unit_price_usd ?? null)}</p>
                  {divisasPrice?.promotion_quantity && divisasPrice.promotion_price_usd !== null && (
                    <div className="mt-1">
                      <p className="font-semibold">Precio Promo: Ref. {formatRef(divisasPrice.promotion_price_usd)} c/u</p>
                      {divisasPrice.promotion_description && <p className="text-xs text-slate-500">{divisasPrice.promotion_description}</p>}
                    </div>
                  )}
                  {product.bundles.length > 0 && <p className="mt-1">Precio por bulto: Ref. {formatRef(divisasPrice?.bundle_price_usd ?? null)}</p>}
                </div>
              </div>
              <ul className="mt-2 space-y-1">
                {selections.map((option) => {
                  const quantity = draft.items.find((line) => line.kind === option.kind && line.selectionId === option.id)?.quantity ?? 0;
                  const hasPrice = option.kind === "bundle" ? price?.bundle_price_usd != null : price != null && (price.unit_price_usd != null || price.promotion_price_usd != null);
                  return (
                    <li key={`${option.kind}:${option.id}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 break-words">{option.label} <span className="block text-[var(--surface-muted-text)]">{option.stock} disponibles{quantity > 0 && ` · ${quantity} en carrito`}</span></span>
                      <button type="button" className={`${actionStyle} shrink-0`} aria-label={`Agregar ${product.name}, ${option.label}`} disabled={raw === undefined || pendingOrder || isCreating || !hasPrice || !canAddCommercialQuantity(1, option.stock, quantity) || (!quantity && draft.items.length >= 100)} onClick={() => change({ product, kind: option.kind, selectionId: option.id, quantity: 1 }, 1)}><Plus size={16} aria-hidden="true" /></button>
                    </li>
                  );
                })}
              </ul>
              </div>
            </article>
          );
        })}
        </div>
      </section>
      <dialog ref={cart} aria-labelledby="seller-order" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-rose-100 bg-white p-5 text-slate-800 shadow-sm backdrop:bg-slate-900/40 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="seller-order" className="flex items-center gap-2 text-xl font-semibold"><ShoppingBag size={18} aria-hidden="true" /> Carrito</h2>
          <button type="button" title="Cerrar carrito" aria-label="Cerrar carrito" className={actionStyle} onClick={() => cart.current?.close()}><X size={18} aria-hidden="true" /></button>
        </div>
        <label htmlFor="seller-method" className="mt-3 block text-sm font-medium">Forma de pago</label>
        <fieldset className="mt-4 grid gap-3 sm:grid-cols-2" disabled={isCreating}>
          <label htmlFor="seller-client-name" className="text-sm font-medium">Nombre y apellido
            <input id="seller-client-name" name="customerName" autoComplete="name" minLength={3} maxLength={120} required value={draft.customerName} onChange={(event) => save({ ...draft, customerName: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-rose-500" />
          </label>
          <label htmlFor="seller-client-id" className="text-sm font-medium">Cédula
            <input id="seller-client-id" name="customerId" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required value={draft.customerId} onChange={(event) => save({ ...draft, customerId: event.target.value.replace(/[^0-9]/g, "").slice(0, 12) })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-rose-500" />
          </label>
        </fieldset>
        <select id="seller-method" className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-rose-500" value={draft.method} disabled={raw === undefined || isCreating} onChange={(event) => save({ ...draft, method: checkedMethod(event.target.value) })}>
          {Object.entries(methods).map(([method, label]) => <option key={method} value={method}>{label}</option>)}
        </select>
        {!draft.items.length && <p className="mt-3 text-sm">Carrito vac&iacute;o.</p>}
        <ul className="divide-y divide-[var(--surface-border)]">
          {draft.items.map((item) => {
            const product = products.find((entry) => entry.id === item.product.id) ?? item.product;
            const options = item.kind === "variant" ? product.variants : product.bundles;
            const stock = options.find((option) => option.id === item.selectionId)?.stock;
            const price = product.prices.find((row) => row.payment_category === category);
            const hasPrice = item.kind === "bundle" ? price?.bundle_price_usd != null : price != null && (price.unit_price_usd != null || price.promotion_price_usd != null);
            return (
            <li key={`${item.kind}:${item.selectionId}`} className="py-3 text-sm">
              <p className="break-words font-medium">{item.product.name}</p>
              <p className="break-words text-[var(--surface-muted-text)]">{selectionLabel(item)}</p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" aria-label={`Quitar una unidad de ${item.product.name}, ${selectionLabel(item)}`} className={actionStyle} disabled={isCreating || pendingOrder} onClick={() => change(item, -1)}><Minus size={16} aria-hidden="true" /></button>
                <span aria-label="Cantidad">{item.quantity}</span>
                <button type="button" aria-label={`Agregar una unidad de ${item.product.name}, ${selectionLabel(item)}`} className={actionStyle} disabled={isCreating || pendingOrder || !hasPrice || !canAddCommercialQuantity(1, stock, item.quantity)} onClick={() => change({ ...item, product }, 1)}><Plus size={16} aria-hidden="true" /></button>
                <button type="button" aria-label={`Eliminar ${item.product.name}, ${selectionLabel(item)} del carrito`} className={actionStyle} disabled={isCreating || pendingOrder} onClick={() => change(item, -item.quantity)}><Trash2 size={16} aria-hidden="true" /></button>
              </div>
            </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm" aria-live="polite">Total estimado (USD): <strong>{total === null ? "Sin precio para esta forma de pago" : usd.format(total / 100)}</strong></p>
        <p className="mt-2 text-xs text-[var(--seller-muted)]">Al crear la orden, las prendas se reservan durante 30 minutos. Caja confirmar&aacute; el pago.</p>
        {orderError && <p role="alert" className="mt-3 text-sm text-[var(--seller-accent)]">{orderError}</p>}
          <button type="button" className={`${primaryStyle} mt-4 w-full`} disabled={!draft.items.length || total === null || isCreating || raw === undefined || draft.customerName.trim().split(/\s+/).length < 2 || !/^\d{6,12}$/.test(draft.customerId)} onClick={submitOrder}>{isCreating ? "Guardando orden..." : pendingOrder ? "Reintentar envio" : "Crear orden"}</button>
        {backup && <p role="alert" className="mt-2 text-sm">No se pudo guardar en este dispositivo. El borrador se perder&aacute; al recargar.</p>}
      </dialog>
    </div>
  );
}