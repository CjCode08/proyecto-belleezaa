"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, ShoppingBag, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { commercialTotal, parseCommercialCart, removeCommercialCheckedOutItems, type CommercialItem, type CommercialPrice, type CommercialProduct } from "@/lib/catalog/commercial";
import { convertUsdCentsToVesCents, formatVesCents } from "@/lib/catalog/currency";
import type { CommercialCheckoutItem, CommercialCheckoutRequest } from "@/lib/catalog/commercial-checkout";
import { CommercialCheckout } from "./commercial-checkout";
import "./cart.css";

const money = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });
const button = "min-h-11 rounded-md border border-[#d6d3cd] px-3 text-sm font-semibold hover:border-[#b50638] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]";
const defaultStorageKey = "belleza-commercial-cart-v1";
const emptySnapshot = () => "[]";
function snapshot(storageKey: string) { try { return localStorage.getItem(storageKey) ?? "[]"; } catch { return "unavailable"; } }
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener("belleza-commercial-cart", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("belleza-commercial-cart", callback); };
}
type Context = { items: CommercialItem[]; add: (item: CommercialItem) => boolean; open: () => void; checkoutVersion: number };
const CartContext = createContext<Context | null>(null);

function amount(value: number | null, category: CommercialPrice["payment_category"], rate: string | null) {
  if (value === null) return "No disponible";
  if (category === "bolivares") return rate ? formatVesCents(convertUsdCentsToVesCents(Math.round(value * 100), rate)) : "Tasa de hoy no disponible";
  return money.format(value);
}

export function CommercialCart({ children, rate, storageKey = defaultStorageKey, checkoutSiteKey = null, checkoutMode = "test" }: { children: React.ReactNode; rate: string | null; storageKey?: string; checkoutSiteKey?: string | null; checkoutMode?: "test" | "production" }) {
  const raw = useSyncExternalStore(subscribe, () => snapshot(storageKey), emptySnapshot);
  const [writeError, setWriteError] = useState("");
  let items: CommercialItem[] = [];
  let readError = "";
  try { items = parseCommercialCart(raw); } catch { readError = "No se pudo leer el carrito guardado."; }
  function update(next: CommercialItem[]) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event("belleza-commercial-cart")); setWriteError(""); return true; }
    catch { setWriteError("No se pudo guardar el carrito en este navegador."); return false; }
  }
  const [payment, setPayment] = useState<CommercialCheckoutRequest["payment"]>("binance");
  const category: CommercialPrice["payment_category"] = payment === "bolivares" ? "bolivares" : "divisas";
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutVersion, setCheckoutVersion] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const total = commercialTotal(items, category);
  function add(item: CommercialItem) {
    const stock = item.kind === "variant" ? item.product.variants.find((row) => row.id === item.selectionId)?.stock : item.product.bundles.find((row) => row.id === item.selectionId)?.stock;
    const current = items.find((row) => row.kind === item.kind && row.selectionId === item.selectionId);
    if (readError || !stock || (current?.quantity ?? 0) >= Math.min(stock, 999) || !current && items.length >= 100) return false;
    return update(current
      ? items.map((row) => row.kind === item.kind && row.selectionId === item.selectionId ? { ...row, product: item.product, quantity: row.quantity + 1 } : row.product.id === item.product.id ? { ...row, product: item.product } : row)
      : [...items.map((row) => row.product.id === item.product.id ? { ...row, product: item.product } : row), item]);
  }
  function clear(checkedOut: CommercialCheckoutItem[]) {
    try {
      const current = parseCommercialCart(localStorage.getItem(storageKey) ?? "[]");
      const remaining = removeCommercialCheckedOutItems(current, checkedOut);
      if (!update(remaining)) return false;
      setCheckoutVersion((version) => version + 1);
      return true;
    } catch { setWriteError("No se pudieron retirar los productos del carrito."); return false; }
  }
  return <CartContext.Provider value={{ items, add, open: () => { if (!dialog.current?.open) { dialog.current?.showModal(); setCartOpen(true); } }, checkoutVersion }}>
    {children}
    <dialog ref={dialog} onClose={() => setCartOpen(false)} aria-labelledby="commercial-cart-title" className="catalog-cart-dialog fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[500px] overflow-y-auto bg-white p-5 text-[#1e1a1c] shadow-2xl sm:p-6">
      <div className="flex items-center justify-between gap-4"><h2 id="commercial-cart-title" className="text-xl font-semibold">Tu carrito</h2><button className={button} type="button" aria-label="Cerrar carrito" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <p className="mt-3 text-sm text-[#5b5550]">Precios y disponibilidad sujetos a confirmación.</p>
      {(readError || writeError) && <p role="alert" className="mt-3 text-sm text-red-700">{readError || writeError}</p>}
      {readError && raw !== "unavailable" && <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-[#92002a]" onClick={() => update([])}>Vaciar carrito guardado</button>}
      <fieldset className="mt-5"><legend className="text-sm font-semibold">Forma de pago</legend><div className="mt-2 flex gap-2">{(["divisas", "bolivares"] as const).map((value) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setPayment(value === "bolivares" ? "bolivares" : "binance")} className={`${button} ${category === value ? "border-[#b50638] bg-[#b50638] text-white" : "bg-white"}`}>{value === "divisas" ? "Divisas" : "Bolívares"}</button>)}</div></fieldset>
      {items.length === 0 ? <p className="mt-6 text-sm">Aún no has agregado productos.</p> : <ul className="mt-5 divide-y divide-[#e8e6e1]">{items.map((item) => {
        const selected = item.kind === "variant" ? item.product.variants.find((row) => row.id === item.selectionId) : item.product.bundles.find((row) => row.id === item.selectionId);
        return <li key={`${item.kind}-${item.selectionId}`} className="py-4 text-sm"><p className="font-semibold">{item.product.name}</p><p className="mt-1 text-[#5b5550]">{selected && "size" in selected ? `${selected.size} · ${selected.color}` : selected && "description" in selected ? `Bulto: ${selected.description}` : "Presentación no disponible"}</p><div className="mt-2 flex items-center gap-3"><button type="button" className={button} aria-label={`Reducir cantidad de ${item.product.name}`} onClick={() => item.quantity === 1 ? removeItem(item) : update(items.map((row) => row === item ? { ...row, quantity: row.quantity - 1 } : row))}>−</button><span>{item.quantity}</span><button type="button" className={button} aria-label={`Aumentar cantidad de ${item.product.name}`} disabled={!selected || item.quantity >= Math.min(selected.stock, 999)} onClick={() => add(item)}>+</button><button type="button" className="min-h-11 font-semibold text-[#92002a] hover:underline" onClick={() => removeItem(item)}>Quitar</button></div></li>;
      })}</ul>}
      {items.length > 0 && <p className="mt-6 border-t border-[#e8e6e1] pt-4 font-semibold">Total estimado: {total === null ? "No disponible para esta forma de pago" : amount(total / 100, category, rate)}</p>}
      <CommercialCheckout items={items} payment={payment} setPayment={setPayment} rateAvailable={!!rate} siteKey={checkoutSiteKey} mode={checkoutMode} cartOpen={cartOpen} clear={clear} />
    </dialog>
  </CartContext.Provider>;
  function removeItem(item: CommercialItem) { update(items.filter((row) => row.kind !== item.kind || row.selectionId !== item.selectionId)); }
}

export function CommercialCartLink() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("El carrito no está disponible.");
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  return <button type="button" onClick={cart.open} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b50638]"><ShoppingBag size={20} aria-hidden="true" /> Ver tu Carrito <span className="rounded-full bg-[#b50638] px-2 py-0.5 text-xs text-white">{count}</span></button>;
}

export function ProductDetails({ product, imageUrl, rate }: { product: CommercialProduct; imageUrl?: string; rate: string | null }) {
  const cart = useContext(CartContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackVersion, setFeedbackVersion] = useState<number | null>(null);
  const [selection, setSelection] = useState(product.variants[0]?.id ?? product.bundles[0]?.id ?? "");
  const cardPrice = product.prices.find((row) => row.payment_category === "divisas" && (row.unit_price_usd !== null || row.bundle_price_usd !== null))
    ?? product.prices.find((row) => row.unit_price_usd !== null || row.bundle_price_usd !== null);
  if (!cart) throw new Error("El carrito no está disponible.");
  useEffect(() => () => request.current?.abort(), []);
  async function open() {
    dialog.current?.showModal();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setImages([]); setIndex(0); setError(""); setFeedback("");
    try {
      const response = await fetch(`/catalogo/imagenes/${encodeURIComponent(product.id)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("No se pudieron cargar las imágenes.");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("images" in result) || !Array.isArray(result.images) || !result.images.every((url: unknown) => typeof url === "string")) throw new Error("Respuesta inválida.");
      if (!controller.signal.aborted) setImages(result.images);
    } catch { if (!controller.signal.aborted) setError("No se pudieron cargar las imágenes. Cierra y vuelve a intentar."); }
  }
  function add() {
    const kind = product.variants.some((row) => row.id === selection) ? "variant" : "bundle";
    const added = cart!.add({ product, kind, selectionId: selection, quantity: 1 });
    setFeedback(added ? "Agregado al carrito." : "No se pudo agregar. Revisa las existencias y el almacenamiento del navegador.");
    setFeedbackVersion(added ? cart!.checkoutVersion : null);
  }
  return <>
    <button type="button" onClick={open} aria-label={`Ver detalles de ${product.name}`} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">
      <div className="overflow-hidden bg-[#efeee9]">{imageUrl ? <Image src={imageUrl} alt={product.name} width={800} height={1067} unoptimized className="aspect-[3/4] w-full object-cover" /> : <div className="flex aspect-[3/4] items-center justify-center p-4 text-center text-sm text-[#5b5550]">Imagen de catálogo pendiente</div>}</div>
      <p className="mt-3 text-xs font-semibold uppercase text-[#92002a]">{product.category || "Colección"}</p><h2 className="mt-1 break-words font-[family-name:var(--font-catalog-heading)] text-base font-semibold">{product.name}</h2>
      {cardPrice && <div className="mt-2 text-sm"><p className="text-xs text-[#5b5550]">Pago en {cardPrice.payment_category === "divisas" ? "divisas" : "bolívares"}</p>{cardPrice.unit_price_usd !== null && <p className="font-semibold">{amount(cardPrice.unit_price_usd, cardPrice.payment_category, rate)} por unidad</p>}{cardPrice.bundle_price_usd !== null && <p className="mt-1 text-[#5b5550]">Bulto cerrado: {amount(cardPrice.bundle_price_usd, cardPrice.payment_category, rate)}</p>}</div>}
      <span className="mt-2 inline-block text-sm font-semibold text-[#92002a] underline underline-offset-4">Ver detalles</span>
    </button>
    <dialog ref={dialog} onClose={() => request.current?.abort()} aria-labelledby={`product-${product.id}`} className="catalog-gallery-dialog fixed inset-0 m-auto max-h-[92dvh] w-[min(96vw,1000px)] max-w-none overflow-y-auto rounded-lg bg-[#faf9f6] p-4 text-[#1e1a1c] shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><h2 id={`product-${product.id}`} className="break-words font-[family-name:var(--font-catalog-heading)] text-xl font-semibold">{product.name}</h2><button type="button" aria-label="Cerrar detalles" className={button} onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div><div className="flex h-[min(55dvh,520px)] items-center justify-center bg-[#efeee9]">{images.length ? <Image src={images[index]} alt={`${product.name}, imagen ${index + 1} de ${images.length}`} width={1000} height={1000} unoptimized className="h-full w-full object-contain" /> : <p className="p-4 text-center text-sm">{error || "Imágenes de catálogo"}</p>}</div>{images.length > 1 && <div className="mt-2 flex items-center justify-center gap-4"><button type="button" aria-label="Imagen anterior" className={button} onClick={() => setIndex((index + images.length - 1) % images.length)}><ChevronLeft size={20} /></button><span aria-live="polite" className="text-sm">{index + 1} / {images.length}</span><button type="button" aria-label="Imagen siguiente" className={button} onClick={() => setIndex((index + 1) % images.length)}><ChevronRight size={20} /></button></div>}</div>
        <div className="min-w-0"><p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#514c48]">{product.description || "Sin descripción."}</p>
          {(["divisas", "bolivares"] as const).map((category) => { const price = product.prices.find((row) => row.payment_category === category); return <section key={category} className="mt-5 border-t border-[#e0ded8] pt-4"><h3 className="font-semibold">Pago en {category === "divisas" ? "divisas" : "bolívares"}</h3>{price ? <dl className="mt-2 space-y-1 text-sm"><div className="flex justify-between gap-4"><dt>Precio unitario</dt><dd>{amount(price.unit_price_usd, category, rate)}</dd></div><div className="flex justify-between gap-4"><dt>Promoción por unidad</dt><dd>{amount(price.promotion_price_usd, category, rate)}</dd></div>{price.promotion_price_usd !== null && <div className="text-[#5b5550]">Grupos de {price.promotion_quantity} unidades{price.promotion_description ? ` · ${price.promotion_description}` : ""}</div>}<div className="flex justify-between gap-4"><dt>Bulto cerrado (12 piezas)</dt><dd>{amount(price.bundle_price_usd, category, rate)}</dd></div></dl> : <p className="mt-2 text-sm text-[#5b5550]">Precio no disponible.</p>}</section>; })}
          <label className="mt-5 block text-sm font-semibold">Talla y color o bulto<select className="mt-2 min-h-11 w-full rounded-md border border-[#d6d3cd] bg-white px-3 text-sm" value={selection} onChange={(event) => setSelection(event.target.value)}>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.size} · {variant.color} — {variant.stock} Unds</option>)}{product.bundles.map((bundle) => <option key={bundle.id} value={bundle.id}>Bulto: {bundle.description} — {bundle.stock} disponibles</option>)}</select></label>
          <button type="button" disabled={!selection} onClick={add} className="mt-3 min-h-11 w-full rounded-md bg-[#b50638] px-4 font-semibold text-white hover:bg-[#92002a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638] disabled:opacity-50">Añadir al carrito</button><p role="status" className="mt-2 text-sm">{feedbackVersion === null || feedbackVersion === cart.checkoutVersion ? feedback : ""}</p>
        </div>
      </div>
    </dialog>
  </>;
}