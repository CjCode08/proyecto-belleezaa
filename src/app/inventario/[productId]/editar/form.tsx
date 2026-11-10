"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { updateProduct } from "../../actions";
import { fileInputClass, secondaryButtonClass } from "../../ui";
import { AudienceField, CategoryField, fieldClass } from "../../product-fields";
import { capitalizeInitial, normalizeColor, normalizeSize } from "@/lib/inventory/product-fields";

type Variant = { id?: string; size: string; color: string; sku: string; stock: number };
type EditableVariant = Variant & { key: string };
type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  audiences: string[];
  unit_price: number;
  promo_price: number | null;
  wholesale_price: number | null;
};
type ExistingImage = { id: string; url: string };

export function ProductEditForm({
  product,
  categories,
  variants: initialVariants,
  images,
}: {
  product: Product;
  categories: string[];
  variants: Variant[];
  images: ExistingImage[];
}) {
  const [state, action, pending] = useActionState(updateProduct, {});
  const [variants, setVariants] = useState<EditableVariant[]>(() =>
    initialVariants.map((variant) => ({ ...variant, key: variant.id ?? crypto.randomUUID() })),
  );
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [unitPrice, setUnitPrice] = useState(String(product.unit_price));
  const [promoPrice, setPromoPrice] = useState(product.promo_price === null ? "" : String(product.promo_price));
  const [wholesalePrice, setWholesalePrice] = useState(product.wholesale_price === null ? "" : String(product.wholesale_price));
  const [comment, setComment] = useState("");

  function updateVariant(index: number, patch: Partial<Variant>) {
    setVariants((current) => current.map((variant, position) =>
      position === index ? { ...variant, ...patch } : variant,
    ));
  }

  return (
    <form action={action} className="mt-6 space-y-6">
      <input type="hidden" name="productId" value={product.id} />
      <section className="grid gap-4 rounded-2xl border border-rose-100 bg-white p-5 sm:grid-cols-2">
        <label className="text-sm font-medium">Nombre del producto
          <input name="name" required maxLength={120} value={name} onChange={(event) => setName(capitalizeInitial(event.target.value))} className={fieldClass} />
        </label>
        <CategoryField categories={categories} initial={product.category ?? ""} />
        <AudienceField initial={product.audiences} />
        <label className="text-sm font-medium sm:col-span-2">Descripción
          <textarea name="description" maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(capitalizeInitial(event.target.value))} className={fieldClass} />
        </label>
        {[
          { name: "unitPrice", label: "Precio unitario (USD)", value: unitPrice, setValue: setUnitPrice },
          { name: "promoPrice", label: "Precio por unidad: 3 a 11 (USD)", value: promoPrice, setValue: setPromoPrice },
          { name: "wholesalePrice", label: "Precio por unidad: 12 o más (USD)", value: wholesalePrice, setValue: setWholesalePrice },
        ].map(({ name, label, value, setValue }) => (
          <label key={name} className="text-sm font-medium">{label}
            <input name={name} type="number" min="0" max="99999999.99" step="0.01"
              required value={value} onChange={(event) => setValue(event.target.value)} className={fieldClass} />
          </label>
        ))}
      </section>

      <section className="space-y-4 rounded-2xl border border-rose-100 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Variantes</h2>
          <button type="button" onClick={() => setVariants((current) => [...current, { key: crypto.randomUUID(), size: "", color: "", sku: "", stock: 0 }])}
            className={secondaryButtonClass}>+ Añadir variante</button>
        </div>
        {variants.map((variant, index) => (
          <fieldset key={variant.key} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Variante {index + 1}</legend>
            <input type="hidden" name="variantId" value={variant.id ?? ""} />
            <label className="text-sm font-medium">Talla
              <input name="size" required maxLength={50} value={variant.size} onChange={(event) => updateVariant(index, { size: event.target.value.toLocaleUpperCase("es") })} onBlur={() => updateVariant(index, { size: normalizeSize(variant.size) })} className={fieldClass} />
            </label>
            <label className="text-sm font-medium">Color
              <input name="color" required maxLength={50} value={variant.color} onChange={(event) => updateVariant(index, { color: event.target.value.replace(/^\s*\p{L}/u, (letter) => letter.toLocaleUpperCase("es")) })} onBlur={() => updateVariant(index, { color: normalizeColor(variant.color) })} className={fieldClass} />
            </label>
            <label className="text-sm font-medium">SKU
              <input name="sku" maxLength={100} pattern="[\p{L}\p{M}0-9\-]+" title="Solo letras, números y guiones."
                value={variant.sku} onChange={(event) => updateVariant(index, { sku: event.target.value.toLocaleUpperCase("es") })} className={fieldClass} />
              <span className="mt-1 block text-xs font-normal text-slate-500">Solo letras, números y guiones.</span>
            </label>
            <label className="text-sm font-medium">Existencias
              <input name="stock" type="number" min="0" max="2147483647" step="1" required value={variant.stock}
                onChange={(event) => updateVariant(index, { stock: Number(event.target.value) })} className={fieldClass} />
            </label>
            {variants.length > 1 && <button type="button" onClick={() => setVariants((current) => current.filter((_, position) => position !== index))}
              className="text-left text-sm font-semibold text-rose-700">Quitar variante</button>}
          </fieldset>
        ))}
      </section>

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
