"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteExpiredPosOrderFromCard } from "./actions";

export function ExpiredOrderActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending,start] = useTransition();
  const [error,setError] = useState("");

  function remove() {
    if (pending || !window.confirm("Eliminar esta orden vencida? El vendedor podra ver quien la elimino.")) return;
    setError("");
    start(async () => {
      try {
        const result = await deleteExpiredPosOrderFromCard(orderId);
        if (result.error) { setError(result.error); return; }
        router.refresh();
      } catch { setError("No se pudo confirmar la eliminacion. Recarga Caja para comprobar el estado."); }
    });
  }

  return <div className="mt-auto pt-2">
    <button type="button" title="Eliminar orden vencida" aria-label="Eliminar orden vencida" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50" disabled={pending} onClick={remove}>
      <Trash2 size={16} aria-hidden="true" /> {pending ? "Eliminando..." : "Eliminar orden"}
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </div>;
}