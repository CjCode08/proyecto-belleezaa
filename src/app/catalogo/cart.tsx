"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cartTotals, parseCart, type CartItem, type CatalogVariant } from "@/lib/catalog/cart";
import type { ProductPrices } from "@/lib/inventory/pricing";
import { convertUsdCentsToVesCents, formatVesCents } from "@/lib/catalog/currency";
import { CheckoutPreview } from "./checkout-preview";
import { ShoppingBag, X } from "lucide-react";
import "./cart.css";

const storageKey = "belleza-cart-v1";
const unavailable = "unavailable";
const serverSnapshot = () => "[]";
const money = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });

function snapshot() {
  try { return window.localStorage.getItem(storageKey) ?? "[]"; }
  catch { return unavailable; }
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("belleza-cart", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("belleza-cart", callback); };
}
function write(items: CartItem[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(items));
  window.dispatchEvent(new Event("belleza-cart"));
}

type CartContextValue = { items: CartItem[]; update: (items: CartItem[]) => boolean; disabled: boolean; openCart: () => void };
const CartContext = createContext<CartContextValue | null>(null);

export function CatalogCart({ children, rate }: { children: React.ReactNode; rate: string | null }) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [writeError, setWriteError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);
  function openCart() {
    const dialog = dialogRef.current;
    if (!dialog) throw new Error("No se pudo abrir el carrito.");
    if (!dialog.open) {
      dialog.showModal();
      setIsOpen(true);
    }
  }
  const parsed = useMemo(() => {
    if (raw === unavailable) return { items: [] as CartItem[], error: "El navegador no permite guardar el carrito." };
    try { return { items: parseCart(raw), error: "" }; }
    catch { return { items: [] as CartItem[], error: "No se pudo leer el carrito guardado. Puedes vaciarlo para comenzar de nuevo." }; }
  }, [raw]);
  function update(items: CartItem[]) {
    try { write(items); setWriteError(""); return true; }
    catch (error) { console.error("No se pudo guardar el carrito:", error); setWriteError("No se pudo guardar el carrito en este navegador."); return false; }
  }
  let totals: ReturnType<typeof cartTotals> | null = null;
  try { totals = cartTotals(parsed.items); } catch { /* Se informa al cliente en el carrito. */ }
  const count = parsed.items.reduce((total, item) => total + item.quantity, 0);
  return (
    <CartContext.Provider value={{ items: parsed.items, update, disabled: !!parsed.error, openCart }}>
      {children}
      <dialog ref={dialogRef} id="carrito" aria-labelledby="cart-title" onClose={() => setIsOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.close();
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
            event.currentTarget.close();
          }
        }}
        className="catalog-cart-dialog fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[500px] flex-col overflow-hidden bg-white p-0 text-[#1e1a1c] shadow-2xl open:flex sm:rounded-l-[2rem]">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#efe6e8] px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <ShoppingBag aria-hidden="true" size={22} className="shrink-0 text-[#b50638]" />
            <h2 id="cart-title" className="font-[family-name:var(--font-catalog-heading)] text-2xl font-semibold">Tu carrito</h2>
            <span className="rounded-full bg-[#ffd9dd] px-3 py-1 text-xs font-semibold text-[#720429]">
              {count} {count === 1 ? "unidad" : "unidades"}
            </span>
          </div>
          <button type="button" aria-label="Cerrar carrito" autoFocus onClick={() => dialogRef.current?.close()}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#f5ecee] text-[#1e1a1c] transition-colors hover:bg-[#e9e0e3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-5 sm:px-6">
        <p className="mt-1 text-sm leading-6 text-[#5b4041]">Precios y disponibilidad sujetos a confirmación. Todavía no se pueden enviar pedidos.</p>
        {(parsed.error || writeError) && <p role="alert" className="mt-3 text-sm text-red-700">{parsed.error || writeError}</p>}
        {parsed.error && raw !== unavailable && <button type="button" onClick={() => update([])} className="mt-3 min-h-11 font-semibold text-[#92002a] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Vaciar carrito guardado</button>}
        {parsed.items.length === 0 && !parsed.error && <p className="mt-4 rounded-lg bg-[#fbf1f4] p-4 text-sm text-[#5b4041]">Aún no has agregado productos.</p>}
        <ul className="mt-4 space-y-3">
          {parsed.items.map((item) => (
            <li key={item.variantId} className="rounded-2xl bg-[#fff8f9] p-4 text-sm">
              <div className="min-w-0">
                <p className="break-words font-semibold">{item.name}</p>
                <p className="mt-1 break-words text-[#5b4041]">{item.size} · {item.color}</p>
                {totals && totals.prices.has(item.productId) && <p className="mt-2 font-semibold text-[#92002a]">{money.format(totals.prices.get(item.productId)!)} por unidad</p>}
                {rate && totals && totals.prices.has(item.productId) && <p className="mt-1 text-[#5b4041]">
                  Subtotal estimado: {formatVesCents(convertUsdCentsToVesCents(Math.round(totals.prices.get(item.productId)! * 100) * item.quantity, rate))}
                </p>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" aria-label={`Reducir cantidad de ${item.name}, ${item.size}, ${item.color}`}
                  onClick={() => update(parsed.items.flatMap((row) => row.variantId !== item.variantId ? [row] : row.quantity > 1 ? [{ ...row, quantity: row.quantity - 1 }] : []))}
                  className="min-h-11 min-w-11 rounded-lg border border-[#d9c6c8] hover:bg-[#fbf1f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">−</button>
                <span aria-label="Cantidad">{item.quantity}</span>
                <button type="button" aria-label={`Aumentar cantidad de ${item.name}, ${item.size}, ${item.color}`}
                  disabled={item.quantity >= 999} onClick={() => update(parsed.items.map((row) => row.variantId === item.variantId ? { ...row, quantity: row.quantity + 1 } : row))}
                  className="min-h-11 min-w-11 rounded-lg border border-[#d9c6c8] hover:bg-[#fbf1f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638] disabled:opacity-40">+</button>
                <button type="button" onClick={() => update(parsed.items.filter((row) => row.variantId !== item.variantId))}
                  className="min-h-11 px-2 font-semibold text-[#92002a] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Quitar</button>
              </div>
            </li>
          ))}
        </ul>
        {parsed.items.length > 0 && (totals ? <p className="mt-6 border-t border-[#efe6e8] pt-5 text-lg font-semibold">Total estimado: {money.format(totals.totalCents / 100)}</p>
          : <p role="alert" className="mt-4 text-sm text-red-700">No hay un precio válido para una de las cantidades seleccionadas.</p>)}
        {parsed.items.length > 0 && totals && rate && <p className="mt-1 text-sm text-[#5b4041]">Equivalente estimado: {formatVesCents(convertUsdCentsToVesCents(totals.totalCents, rate))}</p>}
        {parsed.items.length > 0 && !parsed.error && <CheckoutPreview />}
        </div>
      </dialog>
    </CartContext.Provider>
  );
}

export function CartLink() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("El carrito no está disponible.");
  const count = cart.items.reduce((total, item) => total + item.quantity, 0);
  return (
    <button type="button" onClick={cart.openCart} aria-haspopup="dialog" aria-controls="carrito" aria-label={`Ver tu Carrito: ${count} ${count === 1 ? "unidad" : "unidades"}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#1e1a1c] hover:bg-[#fbf1f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">
      <ShoppingBag aria-hidden="true" size={20} />
      <span>Ver tu Carrito</span>
      <span aria-hidden="true" className="rounded-full bg-[#b50638] px-2 py-0.5 text-xs text-white">{count}</span>
    </button>
  );
}

export function AddToCart({ productId, name, prices, variants }: { productId: string; name: string; prices: ProductPrices; variants: CatalogVariant[] }) {
  const cart = useContext(CartContext);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [message, setMessage] = useState("");
  if (!cart) throw new Error("El carrito no está disponible.");
  function add() {
    const variant = variants.find((item) => item.id === variantId);
    if (!variant) { setMessage("Selecciona una variante disponible."); return; }
    const existing = cart!.items.find((item) => item.variantId === variant.id);
    if (existing && existing.quantity >= 999 || !existing && cart!.items.length >= 100) {
      setMessage("Se alcanzó el límite del carrito."); return;
    }
    const current = cart!.items.map((item) => item.productId === productId ? { ...item, name, prices } : item);
    const next = existing
      ? current.map((item) => item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { productId, variantId: variant.id, name, size: variant.size, color: variant.color, prices, quantity: 1 }];
    setMessage(cart!.update(next) ? "Agregado al carrito." : "No se pudo agregar al carrito.");
  }
  return (
    <div className="mt-auto space-y-2 pt-3">
      <label className="block text-xs font-semibold text-[#5b4041]">Talla y color
        <select value={variantId} onChange={(event) => setVariantId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#d9c6c8] bg-white px-2 py-2 text-sm text-[#1e1a1c]">
          {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.size} · {variant.color}</option>)}
        </select>
      </label>
      <button type="button" disabled={cart.disabled || variants.length === 0} onClick={add} className="min-h-11 w-full rounded-lg bg-[#b50638] px-2 text-xs font-semibold text-white transition-colors hover:bg-[#92002a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638] disabled:cursor-not-allowed disabled:opacity-50 lg:border lg:border-[#d9c6c8] lg:bg-white lg:text-[#92002a] lg:hover:border-[#b50638] lg:hover:bg-[#fbf1f4]">Añadir al carrito</button>
      {message && <p role="status" className="text-xs text-[#5b4041]">{message}</p>}
    </div>
  );
}
