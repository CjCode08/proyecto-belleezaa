"use client";

import { useState } from "react";
import { groupVariants, type InventoryVariant, type VariantGroup } from "@/lib/inventory/variant-groups";
import { normalizeColor, normalizeSize } from "@/lib/inventory/product-fields";
import { fieldClass } from "./product-fields";
import { secondaryButtonClass } from "./ui";

function newColor() {
  return { key: crypto.randomUUID(), color: "", sku: "", stock: "0", colorCode: "", codeEdited: false };
}

export function VariantFields({ initialVariants = [], editing = false, skuBase = "", canDelete = true }: {
  initialVariants?: InventoryVariant[];
  editing?: boolean;
  skuBase?: string;
  canDelete?: boolean;
}) {
  const [groups, setGroups] = useState<VariantGroup[]>(() => {
    const existing = groupVariants(initialVariants);
    if (editing && existing.length === 0) return [];
    return existing.length ? existing : [{
      key: "initial-size",
      size: "",
      colors: [{ key: "initial-color", color: "", sku: "", stock: "0", colorCode: "", codeEdited: false }],
    }];
  });

  function updateGroup(key: string, update: (group: VariantGroup) => VariantGroup) {
    setGroups((current) => current.map((group) => group.key === key ? update(group) : group));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-rose-100 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tallas y colores</h2>
          <p className="mt-1 text-sm text-slate-500">Añade una talla y registra sus colores, existencias y SKU.</p>
        </div>
        <button type="button" className={secondaryButtonClass}
          onClick={() => setGroups((current) => [...current, { key: crypto.randomUUID(), size: "", colors: [newColor()] }])}>
          + Añadir talla
        </button>
      </div>
      {groups.length === 0 && <p className="text-sm text-slate-600">Sin variantes sueltas; puedes registrar solo bultos.</p>}
      {groups.map((group, groupIndex) => (
        <fieldset key={group.key} className="space-y-4 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium">Talla {groupIndex + 1}</legend>
          <label className="block text-sm font-medium">Talla
            <input required maxLength={50} value={group.size} className={fieldClass}
              onChange={(event) => {
                const size = event.target.value.toLocaleUpperCase("es");
                updateGroup(group.key, (current) => ({ ...current, size }));
              }}
              onBlur={() => updateGroup(group.key, (current) => ({ ...current, size: normalizeSize(current.size) }))} />
          </label>
          {group.colors.map((color, colorIndex) => (
            <div key={color.key} className="grid gap-3 rounded-lg bg-rose-50/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="size" value={group.size} />
              {editing && <input type="hidden" name="variantId" value={color.id ?? ""} />}
              <label className="text-sm font-medium">Color {colorIndex + 1}
                <input name="color" required maxLength={50} value={color.color} className={fieldClass}
                  onChange={(event) => {
                    const value = event.target.value.replace(/^\s*\p{L}/u, (letter) => letter.toLocaleUpperCase("es"));
                    updateGroup(group.key, (current) => ({
                      ...current, colors: current.colors.map((item) => item.key === color.key
                        ? { ...item, color: value, colorCode: item.codeEdited ? item.colorCode : value.trim().charAt(0).toLocaleUpperCase("es") }
                        : item),
                    }));
                  }}
                  onBlur={() => updateGroup(group.key, (current) => ({
                    ...current, colors: current.colors.map((item) => item.key === color.key ? { ...item, color: normalizeColor(item.color) } : item),
                  }))} />
              </label>
              <label className="text-sm font-medium">Existencias
                <input name="stock" type="number" min="0" max="2147483647" step="1" required value={color.stock} className={fieldClass}
                  onChange={(event) => {
                    const stock = event.target.value;
                    updateGroup(group.key, (current) => ({
                      ...current, colors: current.colors.map((item) => item.key === color.key ? { ...item, stock } : item),
                    }));
                  }} />
              </label>
              <label className="text-sm font-medium">Abreviatura del color
                <input name="colorCode" maxLength={50} pattern="[\p{L}\p{M}0-9\-]+" required={Boolean(skuBase.trim())}
                  spellCheck={false} value={color.colorCode} className={fieldClass}
                  onChange={(event) => {
                    const colorCode = event.target.value.toLocaleUpperCase("es");
                    updateGroup(group.key, (current) => ({
                      ...current, colors: current.colors.map((item) => item.key === color.key ? { ...item, colorCode, codeEdited: true } : item),
                    }));
                  }} />
              </label>
              <label className="text-sm font-medium">SKU generado
                <input name="sku" readOnly value={skuBase.trim() && group.size.trim() && color.colorCode.trim()
                  ? `${skuBase.trim().toLocaleUpperCase("es")}-${group.size.trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "").toLocaleUpperCase("es")}-${color.colorCode.trim().toLocaleUpperCase("es")}`
                  : ""} className={fieldClass} />
              </label>
              {group.colors.length > 1 && (!color.id || canDelete) && <button type="button" className="text-left text-sm font-semibold text-rose-700"
                onClick={() => updateGroup(group.key, (current) => ({ ...current, colors: current.colors.filter((item) => item.key !== color.key) }))}>
                Quitar color {colorIndex + 1}
              </button>}
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="button" className={secondaryButtonClass}
              onClick={() => updateGroup(group.key, (current) => ({ ...current, colors: [...current.colors, newColor()] }))}>
              + Añadir color
            </button>
            {(canDelete || !group.colors.some((color) => color.id)) && <button type="button" className="text-sm font-semibold text-rose-700"
              onClick={() => {
                if (editing && group.colors.some((color) => color.id) &&
                    !window.confirm("Al guardar, se retirarán todas las variantes de esta talla. ¿Continuar?")) return;
                setGroups((current) => current.filter((item) => item.key !== group.key));
              }}>
              Quitar talla y sus colores
            </button>}
          </div>
        </fieldset>
      ))}
    </section>
  );
}
