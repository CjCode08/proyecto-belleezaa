"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function InventoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Error al cargar el inventario:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-rose-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">No se pudo cargar el inventario</h1>
        <p className="mt-2 text-sm text-slate-600">
          Revisa la conexión y los permisos de Supabase, e inténtalo nuevamente.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
        >
          Reintentar
        </button>
        {process.env.NODE_ENV === "development" && (
          <p className="mt-4 text-sm text-slate-600">
            Si todavía no aplicaste los cambios de inventario, puedes abrir la{" "}
            <Link href="/inventario/vista-previa" className="font-semibold text-rose-700 underline">vista previa local sin guardar</Link>.
          </p>
        )}
      </section>
    </main>
  );
}
