"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteInventoryCategory } from "./actions";
import { audiences, capitalizeInitial } from "@/lib/inventory/product-fields";

export const fieldClass = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-200";

export function CategoryField({ categories, initial = "", canDeleteCategories = false }: {
  categories: string[]; initial?: string; canDeleteCategories?: boolean;
}) {
  const [categoryNames, setCategoryNames] = useState(categories);
  const [selection, setSelection] = useState(() => categories.includes(initial) ? `category:${initial}` : initial ? "new" : "");
  const [pendingCategory, setPendingCategory] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const selectedCategory = selection.startsWith("category:") ? selection.slice("category:".length) : "";

  async function removeCategory(category: string) {
    if (!window.confirm(`¿Eliminar la categoría «${category}»? Esta acción no se puede deshacer.`)) return;
    setPendingCategory(category);
    setDeleteError("");
    try {
      const result = await deleteInventoryCategory(category);
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setCategoryNames((current) => current.filter((name) => name !== category));
      setSelection((current) => current === `category:${category}` ? "" : current);
    } catch {
      setDeleteError("No se pudo eliminar la categoría. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setPendingCategory("");
    }
  }

  return (
    <div className="text-sm font-medium">
      <label htmlFor="category-select">Categoría</label>
      <select id="category-select" value={selection} onChange={(event) => setSelection(event.target.value)} className={fieldClass}>
        <option value="">Sin categoría</option>
        {categoryNames.map((category) => <option key={category} value={`category:${category}`}>{category}</option>)}
        <option value="new">Agregar nueva categoría</option>
      </select>
      {selection === "new" ? (
        <label className="mt-3 block">Nombre de la nueva categoría
          <input name="categoryNew" defaultValue={initial && !categoryNames.includes(initial) ? initial : ""} required maxLength={120}
            onChange={(event) => { event.currentTarget.value = capitalizeInitial(event.currentTarget.value); }} className={fieldClass} />
        </label>
      ) : <input type="hidden" name="category" value={selectedCategory} />}
      {canDeleteCategories && categoryNames.length > 0 && <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
        <summary className="cursor-pointer select-none text-xs font-semibold text-slate-600">Administrar categorías</summary>
        <ul className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto">
          {categoryNames.map((category) => (
            <li key={category} className="flex min-h-10 items-center gap-2 py-1">
              <button type="button" title={`Eliminar categoría ${category}`} aria-label={`Eliminar categoría ${category}`}
                disabled={Boolean(pendingCategory)} onClick={() => void removeCategory(category)}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-rose-200 text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50">
                <Trash2 size={14} aria-hidden="true" />
              </button>
              <button type="button" aria-pressed={selectedCategory === category} onClick={() => setSelection(`category:${category}`)}
                className="min-h-8 flex-1 text-left text-sm font-normal hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600">
                {category}
              </button>
              {pendingCategory === category && <span role="status" className="text-xs text-slate-500">Eliminando…</span>}
            </li>
          ))}
        </ul>
        {deleteError && <p role="alert" className="mt-2 text-sm text-red-700">{deleteError}</p>}
      </details>}
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
