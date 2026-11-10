"use client";

import { useState } from "react";
import { audiences, capitalizeInitial } from "@/lib/inventory/product-fields";

export const fieldClass = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-200";

export function CategoryField({ categories, initial = "" }: { categories: string[]; initial?: string }) {
  const index = categories.indexOf(initial);
  const [selection, setSelection] = useState(index >= 0 ? `category:${index}` : initial ? "new" : "");
  return (
    <div className="text-sm font-medium">
      <label htmlFor="category-select">Categoría</label>
      <select id="category-select" value={selection} onChange={(event) => setSelection(event.target.value)} className={fieldClass}>
        <option value="">Sin categoría</option>
        {categories.map((category, position) => <option key={category} value={`category:${position}`}>{category}</option>)}
        <option value="new">Agregar nueva categoría</option>
      </select>
      {selection === "new" ? (
        <label className="mt-3 block">Nombre de la nueva categoría
          <input name="categoryNew" defaultValue={initial && !categories.includes(initial) ? initial : ""} required maxLength={120}
            onChange={(event) => { event.currentTarget.value = capitalizeInitial(event.currentTarget.value); }} className={fieldClass} />
        </label>
      ) : <input type="hidden" name="category" value={selection ? categories[Number(selection.slice(9))] : ""} />}
    </div>
  );
}

export function AudienceField({ initial = [], required = false }: { initial?: string[]; required?: boolean }) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm font-medium">Tipo de prenda</legend>
      <p className="mt-1 text-xs text-slate-500">{required ? "Selecciona al menos un grupo; puedes elegir varios." : "Selecciona todos los grupos que correspondan."}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {audiences.map(({ value, label }) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm transition hover:border-rose-300 focus-within:ring-2 focus-within:ring-rose-200">
            <input type="checkbox" name="audiences" value={value} defaultChecked={initial.includes(value)} className="accent-rose-600" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
