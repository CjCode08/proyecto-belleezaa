"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { updateProduct } from "../../actions";
import { fileInputClass } from "../../ui";
import { AudienceField, CategoryField, fieldClass } from "../../product-fields";
import { capitalizeInitial } from "@/lib/inventory/product-fields";
import { type InventoryVariant } from "@/lib/inventory/variant-groups";
import { VariantFields } from "../../variant-fields";
import { CommercialFields } from "../../commercial-fields";
import type { Database } from "@/lib/supabase/types";

type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  audiences: string[];
  sku_base: string | null;
};
type ExistingImage = { id: string; url: string };

export function ProductEditForm({
  product,
  categories,
  variants: initialVariants,
  images,
  prices,
  bundles,
  canDelete,
}: {
  product: Product;
  categories: string[];
  variants: InventoryVariant[];
  images: ExistingImage[];
  prices: Database["public"]["Tables"]["inventory_product_prices"]["Row"][];
  bundles: Database["public"]["Tables"]["inventory_bundles"]["Row"][];
  canDelete: boolean;
}) {
  const [state, action, pending] = useActionState(updateProduct, {});
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [skuBase, setSkuBase] = useState(product.sku_base ?? "");
  const [comment, setComment] = useState("");

  return (
    <form action={action} className="mt-6 space-y-6" onSubmit={(event) => {
      if (!skuBase.trim() && initialVariants.some((variant) => variant.sku) &&
          !window.confirm("Al guardar sin SKU base se borrarán los SKU de las variantes de este producto. ¿Continuar?")) {
        event.preventDefault();
      }
    }}>
      <input type="hidden" name="productId" value={product.id} />
      <section className="grid gap-4 rounded-2xl border border-rose-100 bg-white p-5 sm:grid-cols-2">
        <label className="text-sm font-medium">Nombre del producto
          <input name="name" required maxLength={120} value={name} onChange={(event) => setName(capitalizeInitial(event.target.value))} className={fieldClass} />
        </label>
        <label className="text-sm font-medium">SKU base (opcional)
          <input name="skuBase" maxLength={100} pattern="[\p{L}\p{M}0-9\-]+" value={skuBase} spellCheck={false}
            onChange={(event) => setSkuBase(event.target.value.toLocaleUpperCase("es"))} className={fieldClass} />
        </label>
        <CategoryField categories={categories} initial={product.category ?? ""} />
        <AudienceField initial={product.audiences} />
        <label className="text-sm font-medium sm:col-span-2">Descripción
          <textarea name="description" maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(capitalizeInitial(event.target.value))} className={fieldClass} />
        </label>
      </section>

      <CommercialFields prices={prices} bundles={bundles} canDelete={canDelete} />
      <VariantFields initialVariants={initialVariants} editing skuBase={skuBase} canDelete={canDelete} />

      <section className="space-y-4 rounded-2xl border border-rose-100 bg-white p-5">
        <h2 className="font-semibold">Imágenes del inventario</h2>
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((image) => (
              <label key={image.id} className="rounded-xl border border-rose-100 p-2 text-sm">
                <Image src={image.url} alt={`Imagen actual de ${product.name}`} width={240} height={180}
                  unoptimized className="aspect-[4/3] w-full rounded-lg object-cover" />
                <span className="mt-2 flex items-center gap-2">
                  <input type="checkbox" name="removeImageId" value={image.id} />
                  Retirar esta imagen
                </span>
              </label>
            ))}
          </div>
        )}
        <label className="block text-sm font-medium">Añadir imágenes
          <p className="mt-1 text-xs font-normal text-slate-500">JPEG, PNG o WebP; hasta 4 MB cada una y 5 imágenes en total.</p>
          <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple
            className={fileInputClass} />
        </label>
      </section>

      <label className="block rounded-2xl border border-rose-100 bg-white p-5 text-sm font-medium">Comentario para auditoría
        <textarea name="comment" required maxLength={1000} rows={3} value={comment} onChange={(event) => setComment(capitalizeInitial(event.target.value))} className={fieldClass} />
      </label>
      {state.error && (
        <div role="alert" className="text-sm text-red-700">
          <p>{state.error}</p>
          <p>Si seleccionaste imágenes o marcaste alguna para retirar, comprueba la selección antes de volver a guardar.</p>
        </div>
      )}
      <button disabled={pending} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
        {pending ? "Guardando..." : "Guardar cambios"}
      </button>
    </form>
  );
}
