"use client";

import { useActionState } from "react";
import { fileInputClass } from "../../ui";
import { removeCatalogImage, uploadCatalogImage } from "./actions";

const fieldClass = "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

export function CatalogUploadForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(uploadCatalogImage, {});
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="productId" value={productId} />
      <label className="block text-sm font-medium">Imagen mejorada
        <input type="file" name="image" required accept="image/jpeg,image/png,image/webp" className={fileInputClass} />
      </label>
      <p className="text-sm text-slate-600">Una imagen JPEG, PNG o WebP de hasta 8 MB; máximo cinco por producto. Se convierte a WebP de hasta 1600 píxeles.</p>
      <label className="block text-sm font-medium">Comentario para auditoría
        <textarea name="comment" required maxLength={1000} rows={2} className={fieldClass} />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error} Si seleccionaste un archivo, vuelve a seleccionarlo.</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
      <button disabled={pending} className="min-h-11 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60">
        {pending ? "Procesando..." : "Guardar imagen"}
      </button>
    </form>
  );
}

export function CatalogRemoveForm({ productId, imageId }: { productId: string; imageId: string }) {
  const [state, action, pending] = useActionState(removeCatalogImage, {});
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-semibold text-red-700">Retirar imagen</summary>
      <form action={action} className="mt-2 space-y-3">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="imageId" value={imageId} />
        <label className="block text-sm font-medium">Motivo para auditoría
          <textarea name="comment" required maxLength={1000} rows={2} className={fieldClass} />
        </label>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
        <button disabled={pending} className="min-h-11 rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Retirando..." : "Confirmar retiro"}
        </button>
      </form>
    </details>
  );
}
