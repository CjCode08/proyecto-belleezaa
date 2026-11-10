"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deleteProduct, setProductStatus } from "./actions";

const fieldClass = "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export function ProductActions({
  productId,
  status,
  canDelete,
}: {
  productId: string;
  status: string;
  canDelete: boolean;
}) {
  const [statusState, statusAction, statusPending] = useActionState(setProductStatus, {});
  const [deleteState, deleteAction, deletePending] = useActionState(deleteProduct, {});

  return (
    <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-rose-50 pt-4">
      <Link href={`/inventario/${productId}/editar`}
        className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
        Editar
      </Link>
      {canDelete && <Link href={`/inventario/${productId}/imagenes-catalogo`}
        className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
        Imágenes del catálogo
      </Link>}
      {status !== "inhabilitado" && (
        <form action={statusAction} className="flex flex-1 flex-wrap items-start gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="status" value="inhabilitado" />
          <label className="min-w-40 flex-1">
            <span className="sr-only">Comentario para inhabilitar</span>
            <input name="comment" required maxLength={1000} placeholder="Motivo para inhabilitar"
              className={fieldClass} />
          </label>
          <button disabled={statusPending}
            className="mt-2 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 disabled:opacity-60">
            {statusPending ? "Guardando..." : "Inhabilitar"}
          </button>
        </form>
      )}
      {status === "inhabilitado" && canDelete && (
        <form action={statusAction} className="flex flex-1 flex-wrap items-start gap-2">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="status" value="activo" />
          <label className="min-w-40 flex-1">
            <span className="sr-only">Comentario para reactivar</span>
            <input name="comment" required maxLength={1000} placeholder="Motivo para reactivar"
              className={fieldClass} />
          </label>
          <button disabled={statusPending}
            className="mt-2 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60">
            {statusPending ? "Guardando..." : "Reactivar"}
          </button>
        </form>
      )}
      {statusState.error && <p role="alert" className="w-full text-sm text-red-700">{statusState.error}</p>}

      {canDelete && (
        <details className="w-full rounded-lg border border-red-100 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-red-700">Eliminar permanentemente</summary>
          <form action={deleteAction} className="mt-3 space-y-3">
            <input type="hidden" name="productId" value={productId} />
            <p className="text-sm text-slate-600">El producto y sus variantes se eliminarán; el movimiento de auditoría se conservará. Los productos vinculados a pedidos no se pueden eliminar.</p>
            <label className="block text-sm font-medium">Motivo de eliminación
              <textarea name="comment" required maxLength={1000} rows={2} className={fieldClass} />
            </label>
            {deleteState.error && <p role="alert" className="text-sm text-red-700">{deleteState.error}</p>}
            <button disabled={deletePending}
              className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {deletePending ? "Eliminando..." : "Confirmar eliminación"}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
