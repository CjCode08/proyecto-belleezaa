"use client";

import Image from "next/image";
import { useRef, useState, useSyncExternalStore } from "react";
import { ImageOff, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { canAddCommercialQuantity, commercialTotal, parseCommercialCart, type CommercialItem, type CommercialProduct } from "@/lib/catalog/commercial";

type Method = "bolivares" | "binance" | "efectivo";
type Simulation = { folio: string; items: CommercialItem[]; total: number; method: Method };
type Draft = { items: CommercialItem[]; method: Method; simulation?: Simulation };

const methods = { bolivares: "Bol\u00edvares", binance: "Binance", efectivo: "Efectivo en divisas" };
const initial: Draft = { items: [], method: "bolivares" };
const draftEvent = "belleza:sellers-draft";
const actionStyle = "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-[var(--seller-line)] px-2 text-sm font-medium hover:bg-[var(--seller-canvas)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--seller-accent)] disabled:opacity-50";
const primaryStyle = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--seller-action)] px-4 text-sm font-semibold text-white hover:bg-[var(--seller-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--seller-accent)] disabled:opacity-50";
const usd = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });

function readDraft(raw: string | null): Draft {
  if (!raw) return initial;
  try {
    const stored = JSON.parse(raw);
    const method = checkedMethod(stored.method);
    const items = parseCommercialCart(JSON.stringify(stored.items));
    const simulation = stored.simulation;
    if (simulation && typeof simulation.folio === "string" && Number.isSafeInteger(simulation.total) && simulation.total >= 0) {
      return { items, method, simulation: { ...simulation, method: checkedMethod(simulation.method), items: parseCommercialCart(JSON.stringify(simulation.items)) } };
    }
    return { items, method };
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
    <div className="relative grid aspect-[4/3] place-items-center border-b border-[var(--seller-line)] bg-[var(--seller-canvas)] text-[var(--seller-muted)]">
      {url && !failed ? (
        <Image src={url} alt={name} fill unoptimized loading="lazy" className="object-contain" onError={() => setFailed(true)} />
      ) : <span className="flex items-center gap-2 text-sm"><ImageOff size={17} aria-hidden="true" /> Sin foto disponible</span>}
    </div>
  );
}

export function SellersCart({ sellerId, products, imageUrls, catalogUnavailable }: { sellerId: string; products: CommercialProduct[]; imageUrls: Record<string, string>; catalogUnavailable: boolean }) {
  const key = `belleza:sellers:v1:${sellerId}`;
  const raw = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key); } catch { return null; }
  }, getServerSnapshot);
  const [backup, setBackup] = useState<Draft | null>(null);
  const cart = useRef<HTMLDialogElement>(null);
  const draft = backup ?? readDraft(raw ?? null);
  const category = draft.method === "bolivares" ? "bolivares" : "divisas";
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

  function simulate() {
    if (!draft.items.length || total === null) return;
    save({ ...draft, items: [], simulation: { folio: `SIM-${crypto.randomUUID()}`, items: draft.items, total, method: draft.method } });
  }

  return (
    <div className="mt-5">
      <section aria-labelledby="seller-items">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--seller-line)] bg-[var(--seller-canvas)] py-2">
          <h2 id="seller-items" className="text-lg font-semibold">Prendas disponibles</h2>
          <button type="button" className={primaryStyle} aria-haspopup="dialog" onClick={() => cart.current?.showModal()}><ShoppingBag size={17} aria-hidden="true" /> Ver carrito ({draft.items.reduce((sum, item) => sum + item.quantity, 0)})</button>
        </div>
        {!catalogUnavailable && !products.length && <p className="mt-3 text-sm">No hay prendas para esta b&uacute;squeda.</p>}
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const price = product.prices.find((row) => row.payment_category === category);
          const selections = [
            ...product.variants.map((variant) => ({ kind: "variant" as const, ...variant, label: `${variant.size} / ${variant.color} / ${variant.sku || "Sin SKU"}` })),
            ...product.bundles.map((bundle) => ({ kind: "bundle" as const, ...bundle, label: `Bulto de 12: ${bundle.description}` })),
          ];
          return (
            <article key={product.id} className="min-w-0 overflow-hidden rounded-lg border border-[var(--seller-line)] bg-[var(--seller-paper)]">
              <ProductPhoto key={imageUrls[product.id]} url={imageUrls[product.id]} name={product.name} />
              <div className="p-4">
              <h3 className="break-words font-semibold">{product.name}</h3>
              {product.category && <p className="text-sm text-[var(--seller-muted)]">{product.category}</p>}
              {product.description && <p className="mt-1 break-words text-sm">{product.description}</p>}
              <p className="mt-2 text-sm">Unidad: {price?.unit_price_usd == null ? "Sin precio" : usd.format(price.unit_price_usd)}
                {product.bundles.length > 0 && <> &middot; Bulto: {price?.bundle_price_usd == null ? "Sin precio" : usd.format(price.bundle_price_usd)}</>}
              </p>
              {price?.promotion_quantity && price.promotion_price_usd !== null && (
                <p className="mt-1 text-sm text-[var(--seller-accent)]">{price.promotion_quantity} unidades: {usd.format(price.promotion_price_usd)} c/u{price.promotion_description && ` · ${price.promotion_description}`}</p>
              )}
              <ul className="mt-2 space-y-1">
                {selections.map((option) => {
                  const quantity = draft.items.find((line) => line.kind === option.kind && line.selectionId === option.id)?.quantity ?? 0;
                  const hasPrice = option.kind === "bundle" ? price?.bundle_price_usd != null : price != null && (price.unit_price_usd != null || price.promotion_price_usd != null);
                  return (
                    <li key={`${option.kind}:${option.id}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 break-words">{option.label} <span className="block text-[var(--surface-muted-text)]">{option.stock} disponibles{quantity > 0 && ` · ${quantity} en carrito`}</span></span>
                      <button type="button" className={`${actionStyle} shrink-0`} aria-label={`Agregar ${product.name}, ${option.label}`} disabled={raw === undefined || !hasPrice || !canAddCommercialQuantity(1, option.stock, quantity) || (!quantity && draft.items.length >= 100)} onClick={() => change({ product, kind: option.kind, selectionId: option.id, quantity: 1 }, 1)}><Plus size={16} aria-hidden="true" /></button>
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
      <dialog ref={cart} aria-labelledby="seller-order" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-lg border border-[var(--seller-line)] bg-[var(--seller-paper)] p-4 text-[var(--seller-ink)] backdrop:bg-black/50 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="seller-order" className="flex items-center gap-2 text-xl font-semibold"><ShoppingBag size={18} aria-hidden="true" /> Carrito</h2>
          <button type="button" title="Cerrar carrito" aria-label="Cerrar carrito" className={actionStyle} onClick={() => cart.current?.close()}><X size={18} aria-hidden="true" /></button>
        </div>
        <label htmlFor="seller-method" className="mt-3 block text-sm font-medium">Forma de pago</label>
        <select id="seller-method" className="mt-1 min-h-11 w-full rounded-md border border-[var(--seller-line)] bg-[var(--seller-canvas)] px-2" value={draft.method} disabled={raw === undefined} onChange={(event) => save({ ...draft, method: checkedMethod(event.target.value) })}>
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
                <button type="button" aria-label={`Quitar una unidad de ${item.product.name}, ${selectionLabel(item)}`} className={actionStyle} onClick={() => change(item, -1)}><Minus size={16} aria-hidden="true" /></button>
                <span aria-label="Cantidad">{item.quantity}</span>
                <button type="button" aria-label={`Agregar una unidad de ${item.product.name}, ${selectionLabel(item)}`} className={actionStyle} disabled={!hasPrice || !canAddCommercialQuantity(1, stock, item.quantity)} onClick={() => change({ ...item, product }, 1)}><Plus size={16} aria-hidden="true" /></button>
                <button type="button" aria-label={`Eliminar ${item.product.name}, ${selectionLabel(item)} del carrito`} className={actionStyle} onClick={() => change(item, -item.quantity)}><Trash2 size={16} aria-hidden="true" /></button>
              </div>
            </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm" aria-live="polite">Total estimado (USD): <strong>{total === null ? "Sin precio para esta forma de pago" : usd.format(total / 100)}</strong></p>
        <button type="button" className={`${primaryStyle} mt-4 w-full`} disabled={!draft.items.length || total === null} onClick={simulate}>Generar pedido simulado</button>
        {backup && <p role="alert" className="mt-2 text-sm">No se pudo guardar en este dispositivo. El borrador se perder&aacute; al recargar.</p>}
        {draft.simulation && (
          <section aria-label="Caja simulada" className="mt-5 border-t border-[var(--surface-border)] pt-3 text-sm">
            <h3 className="font-semibold">Caja simulada</h3>
            <p className="mt-1 text-[var(--surface-muted-text)]">Guardado solo en este dispositivo.</p>
            <p className="mt-1 break-all font-mono text-xs" role="status">{draft.simulation.folio}</p>
            <ul className="my-2 space-y-1">
              {draft.simulation.items.map((item) => <li key={`${item.kind}:${item.selectionId}`} className="break-words">{item.quantity} &times; {item.product.name} &middot; {selectionLabel(item)}</li>)}
            </ul>
            <p>{methods[draft.simulation.method]} &middot; {usd.format(draft.simulation.total / 100)} estimados</p>
          </section>
        )}
      </dialog>
    </div>
  );
}