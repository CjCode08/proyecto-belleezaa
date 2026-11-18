"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { createProduct } from "./actions";
import { fileInputClass } from "../ui";
import { AudienceField, CategoryField, fieldClass } from "../product-fields";
import { capitalizeInitial } from "@/lib/inventory/product-fields";
import { VariantFields } from "../variant-fields";
import { CommercialFields } from "../commercial-fields";
import { restoreProductFormDraft } from "../product-form-draft";

export function ProductForm({ categories, preview = false, canDeleteCategories = false }: { categories: string[]; preview?: boolean; canDeleteCategories?: boolean }) {
  const [state, action, pending] = useActionState(createProduct, {});
  const [skuBase, setSkuBase] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const submittedDraft = useRef<FormData | null>(null);

  useEffect(() => {
    if (!state.error || !formRef.current || !submittedDraft.current) return;
    restoreProductFormDraft(formRef.current, submittedDraft.current);
    submittedDraft.current = null;
  }, [state]);

  function rememberDraft(event: FormEvent<HTMLFormElement>) {
    if (!preview) submittedDraft.current = new FormData(event.currentTarget);
  }

  return (
    <form ref={formRef} action={preview ? undefined : action} onSubmit={preview ? (event) => event.preventDefault() : rememberDraft} className="mt-6 space-y-6">
      <section className="grid gap-5 rounded-2xl border border-rose-100 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2"><h2 className="text-lg font-semibold">Datos de la prenda</h2><p className="mt-1 text-sm text-slate-500">Organiza tu producto y define sus precios.</p></div>
        <label className="text-sm font-medium">Nombre del producto
          <input name="name" required maxLength={120} onChange={(event) => { event.currentTarget.value = capitalizeInitial(event.currentTarget.value); }} className={fieldClass} />
        </label>
        <label className="text-sm font-medium">SKU base (opcional)
          <input name="skuBase" maxLength={100} pattern="[\p{L}\p{M}0-9\-]+" value={skuBase} spellCheck={false}
            onChange={(event) => setSkuBase(event.target.value.toLocaleUpperCase("es"))} className={fieldClass} />
        </label>
        <CategoryField categories={categories} canDeleteCategories={canDeleteCategories} />
        <AudienceField required />
        <label className="text-sm font-medium sm:col-span-2">Descripción
          <textarea name="description" maxLength={2000} rows={3} onChange={(event) => { event.currentTarget.value = capitalizeInitial(event.currentTarget.value); }} className={fieldClass} />
        </label>
      </section>

      <CommercialFields />
      <VariantFields skuBase={skuBase} />

      <label className="block rounded-2xl border border-rose-100 bg-white p-5 text-sm font-medium shadow-sm sm:p-6">
        Imágenes del inventario
        <p className="mt-1 text-xs font-normal text-slate-500">Hasta 5 imágenes JPEG, PNG o WebP; máximo 4 MB cada una.</p>
        <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple
          className={fileInputClass} />
      </label>

      <label className="block rounded-2xl border border-rose-100 bg-white p-5 text-sm font-medium shadow-sm sm:p-6">Comentario para auditoría
        <textarea name="comment" required maxLength={1000} rows={3} onChange={(event) => { event.currentTarget.value = capitalizeInitial(event.currentTarget.value); }} className={fieldClass} />
      </label>
      {state.error && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{state.error}</p>{state.loginRequired && <Link href="/login" target="_blank" rel="noopener noreferrer" className="inline-block font-semibold underline">Iniciar sesión en otra pestaña</Link>}</div>}
      <button type="submit" disabled={pending || preview} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
        {preview ? "Guardado deshabilitado en vista previa" : pending ? "Guardando..." : "Guardar producto"}
      </button>
    </form>
  );
}
