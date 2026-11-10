"use client";

import { useActionState, useState } from "react";
import { createProduct } from "./actions";
import { fileInputClass, secondaryButtonClass } from "../ui";
import { AudienceField, CategoryField, fieldClass } from "../product-fields";
import { capitalizeInitial, normalizeColor, normalizeSize } from "@/lib/inventory/product-fields";

export function ProductForm({ categories }: { categories: string[] }) {
  const [state, action, pending] = useActionState(createProduct, {});
  const [variants, setVariants] = useState([0]);
  const [nextId, setNextId] = useState(1);

  return (
    <form action={action} className="mt-6 space-y-6">
      <section className="grid gap-5 rounded-2xl border border-rose-100 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2"><h2 className="text-lg font-semibold">Datos de la prenda</h2><p className="mt-1 text-sm text-slate-500">Organiza tu producto y define sus precios.</p></div>
        <label className="text-sm font-medium">Nombre del producto
          <input name="name" required maxLength={120} onChange={(event) => { event.currentTarget.value = capitalizeInitial(event.currentTarget.value); }} className={fieldClass} />
        </label>
        <CategoryField categories={categories} />
        <AudienceField required />
        <label className="text-sm font-medium sm:col-span-2">Descripción
          <textarea name="description" maxLength={2000} rows={3} onChange={(event) => { event.currentTarget.value = capitalizeInitial(event.currentTarget.value); }} className={fieldClass} />
        </label>
        {[
          ["unitPrice", "Precio unitario (USD)"],
          ["promoPrice", "Precio por unidad: 3 a 11 (USD)"],
          ["wholesalePrice", "Precio por unidad: 12 o más (USD)"],
        ].map(([name, label]) => (
          <label key={name} className="text-sm font-medium">{label}
            <input name={name} type="number" min="0" max="99999999.99" step="0.01" required className={fieldClass} />
          </label>
        ))}
      </section>

      <section className="space-y-4 rounded-2xl border border-rose-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Variantes</h2><p className="mt-1 text-sm text-slate-500">Indica talla, color y existencias de cada opción.</p></div>
          <button type="button" onClick={() => { setVariants([...variants, nextId]); setNextId(nextId + 1); }}
            className={secondaryButtonClass}>+ Añadir variante</button>
        </div>
        {variants.map((id, index) => (
          <fieldset key={id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Variante {index + 1}</legend>
            <label className="text-sm font-medium">Talla<input name="size" required maxLength={50} onChange={(event) => { event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase("es"); }} onBlur={(event) => { event.currentTarget.value = normalizeSize(event.currentTarget.value); }} className={fieldClass} /></label>
            <label className="text-sm font-medium">Color<input name="color" required maxLength={50} onChange={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/^\s*\p{L}/u, (letter) => letter.toLocaleUpperCase("es")); }} onBlur={(event) => { event.currentTarget.value = normalizeColor(event.currentTarget.value); }} className={fieldClass} /></label>
            <label className="text-sm font-medium">SKU (opcional)
              <input name="sku" maxLength={100} pattern="[\p{L}\p{M}0-9\-]+" title="Solo letras, números y guiones."
                onChange={(event) => { event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase("es"); }} className={fieldClass} />
              <span className="mt-1 block text-xs font-normal text-slate-500">Solo letras, números y guiones.</span>
            </label>
            <label className="text-sm font-medium">Existencias<input name="stock" type="number" min="0" max="2147483647" step="1" defaultValue="0" required className={fieldClass} /></label>
            {variants.length > 1 && <button type="button" onClick={() => setVariants(variants.filter((value) => value !== id))}
              className="text-left text-sm font-semibold text-rose-700">Quitar variante</button>}
          </fieldset>
        ))}
      </section>

      <label className="block rounded-2xl border border-rose-100 bg-white p-5 text-sm font-medium shadow-sm sm:p-6">
        Imágenes del inventario
        <p className="mt-1 text-xs font-normal text-slate-500">Hasta 5 imágenes JPEG, PNG o WebP; máximo 4 MB cada una.</p>
        <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple
          className={fileInputClass} />
      </label>

      <label className="block rounded-2xl border border-rose-100 bg-white p-5 text-sm font-medium shadow-sm sm:p-6">Comentario para auditoría
        <textarea name="comment" required maxLength={1000} rows={3} onChange={(event) => { event.currentTarget.value = capitalizeInitial(event.currentTarget.value); }} className={fieldClass} />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
        {pending ? "Guardando..." : "Guardar producto"}
      </button>
    </form>
  );
}
