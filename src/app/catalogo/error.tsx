"use client";

import { useEffect } from "react";

export default function CatalogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Error al cargar el catálogo público:", error); }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff8f9] px-4 text-[#1e1a1c]">
      <div className="rounded-2xl bg-white p-6">
        <h1 className="text-xl font-semibold">No se pudo cargar el catálogo</h1>
        <p className="mt-2 text-sm text-[#5b4041]">Comprueba la conexión e inténtalo nuevamente.</p>
        <button onClick={reset} className="mt-4 min-h-11 rounded-lg bg-[#b50638] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#92002a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Reintentar</button>
      </div>
    </main>
  );
}
