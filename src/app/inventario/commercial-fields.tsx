"use client";

import { useState } from "react";
import type { Database } from "@/lib/supabase/types";
import { fieldClass } from "./product-fields";
import { secondaryButtonClass } from "./ui";

type Price = Database["public"]["Tables"]["inventory_product_prices"]["Row"];
type Bundle = Database["public"]["Tables"]["inventory_bundles"]["Row"];
type BundleField = Partial<Bundle> & { key: string };

export function CommercialFields({ prices = [], bundles = [], canDelete = true }: {
  prices?: Price[];
  bundles?: Bundle[];
  canDelete?: boolean;
}) {
  const [items, setItems] = useState<BundleField[]>(() => bundles.map((bundle) => ({ ...bundle, key: bundle.id })));
  return (
    <>
      <section className="space-y-4 rounded-2xl border border-rose-100 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Precios por forma de pago</h2>
        <p className="text-sm text-slate-600">Ingresa los importes en USD. Para pagos en bolívares se usará la tasa del día.</p>
        {prices.some((price) => price.needs_review) && (
          <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" required className="mt-1 accent-rose-600" />
            Confirmo que revisé ambas listas. Los precios anteriores son solo una referencia y no siguen las nuevas reglas.
          </label>
        )}
        {(["bolivares", "divisas"] as const).map((category) => {
          const current = prices.find((price) => price.payment_category === category);
          return (
            <fieldset key={category} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold">Pago en {category === "bolivares" ? "bolívares" : "divisas"}</legend>
              <label className="text-sm font-medium">Precio unitario (USD)
                <input name={`${category}Unit`} type="number" min="0" max="99999999.99" step="0.01"
                  defaultValue={current?.unit_price_usd ?? ""} className={fieldClass} />
              </label>
              <label className="text-sm font-medium">Precio promocional por unidad (USD)
                <input name={`${category}Promotion`} type="number" min="0" max="99999999.99" step="0.01"
                  defaultValue={current?.promotion_price_usd ?? ""} className={fieldClass} />
              </label>
              <label className="text-sm font-medium">Unidades por promoción
                <select name={`${category}PromotionQuantity`} defaultValue={current?.promotion_quantity ?? ""} className={fieldClass}>
                  <option value="">Sin definir</option>
                  <option value="2">2 unidades</option>
                  <option value="3">3 unidades</option>
                  <option value="4">4 unidades</option>
                </select>
              </label>
              <label className="text-sm font-medium sm:col-span-2">Descripción de la promoción (opcional)
                <input name={`${category}PromotionDescription`} maxLength={200}
                  defaultValue={current?.promotion_description ?? ""} className={fieldClass} />
                <span className="mt-1 block text-xs font-normal text-slate-500">Describe las condiciones para mostrarlas en el catálogo.</span>
              </label>
              <label className="text-sm font-medium">Precio del bulto cerrado de 12 (USD)
                <input name={`${category}Bundle`} type="number" min="0" max="99999999.99" step="0.01"
                  defaultValue={current?.bundle_price_usd ?? ""} className={fieldClass} />
              </label>
            </fieldset>
          );
        })}
      </section>
      <section className="space-y-4 rounded-2xl border border-rose-100 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Bultos cerrados de 12</h2>
            <p className="mt-1 text-sm text-slate-600">El stock de bultos es independiente de las unidades sueltas.</p>
          </div>
          <button type="button" className={secondaryButtonClass}
            onClick={() => setItems((current) => [...current, { key: crypto.randomUUID() }])}>+ Añadir bulto</button>
        </div>
        {items.map((bundle, index) => (
          <fieldset key={bundle.key} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold">Bulto {index + 1}</legend>
            <input type="hidden" name="bundleId" value={bundle.id ?? ""} />
            <label className="text-sm font-medium sm:col-span-2">Descripción del surtido
              <input name="bundleDescription" required maxLength={1000} defaultValue={bundle.assortment_description ?? ""} className={fieldClass} />
            </label>
            <label className="text-sm font-medium">Bultos disponibles
              <input name="bundleStock" type="number" min="0" max="2147483647" step="1" required
                defaultValue={bundle.stock ?? 0} className={fieldClass} />
            </label>
            {(!bundle.id || canDelete) && (
              <button type="button" className="text-left text-sm font-semibold text-rose-700"
                onClick={() => {
                  if (bundle.id && !window.confirm("Al guardar se eliminará este bulto. ¿Continuar?")) return;
                  setItems((current) => current.filter((item) => item.key !== bundle.key));
                }}>Quitar bulto</button>
            )}
          </fieldset>
        ))}
      </section>
    </>
  );
}
