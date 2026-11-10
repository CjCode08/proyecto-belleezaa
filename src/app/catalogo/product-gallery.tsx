"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ProductGallery({ productId, name }: { productId: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => request.current?.abort(), []);

  async function open() {
    if (!dialog.current) throw new Error("No se pudo abrir el visor de imágenes.");
    dialog.current.showModal();
    const controller = new AbortController();
    request.current = controller;
    setImages([]);
    setIndex(0);
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/catalogo/imagenes/${encodeURIComponent(productId)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Error al consultar imágenes: ${response.status}`);
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("images" in result) ||
          !Array.isArray(result.images) || !result.images.every((url: unknown) => typeof url === "string")) {
        throw new Error("La respuesta de imágenes no es válida.");
      }
      if (!controller.signal.aborted) {
        setImages(result.images);
        if (result.images.length === 0) setError("Las imágenes ya no están disponibles.");
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        console.error("No se pudieron cargar las imágenes del producto:", cause);
        setError("No se pudieron cargar las imágenes. Cierra el visor e inténtalo de nuevo.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={open} aria-label={`Ver imágenes de ${name} en grande`}
        className="absolute inset-0 flex items-end justify-end p-3 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#b50638]">
        <span className="flex items-center gap-1 rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-[#92002a] shadow-sm">
          <Maximize2 aria-hidden="true" size={15} /> Ver imágenes
        </span>
      </button>
      <dialog ref={dialog} aria-label={`Imágenes de ${name}`} onClose={() => request.current?.abort()}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.currentTarget.close(); }
          if (event.key === "ArrowLeft" && images.length > 1) setIndex((current) => (current + images.length - 1) % images.length);
          if (event.key === "ArrowRight" && images.length > 1) setIndex((current) => (current + 1) % images.length);
        }}
        className="catalog-gallery-dialog fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,800px)] max-w-none overflow-y-auto rounded-2xl bg-white p-4 text-[#1e1a1c] shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="break-words font-[family-name:var(--font-catalog-heading)] text-xl font-semibold">{name}</h2>
          <button type="button" autoFocus aria-label="Cerrar imágenes" onClick={() => dialog.current?.close()}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#f5ecee] hover:bg-[#e9e0e3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        {loading && <p role="status" className="py-12 text-center text-sm text-[#5b4041]">Cargando imágenes…</p>}
        {error && <p role="alert" className="py-12 text-center text-sm text-[#92002a]">{error}</p>}
        {images.length > 0 && (
          <div className="mt-4">
            <Image src={images[index]} alt={`${name}, imagen ${index + 1} de ${images.length}`} width={1000} height={1000}
              unoptimized className="h-[min(60dvh,600px)] w-full rounded-lg bg-[#f5ecee] object-contain" />
            <div className="mt-3 flex items-center justify-center gap-4">
              <button type="button" aria-label="Imagen anterior" disabled={images.length < 2}
                onClick={() => setIndex((index + images.length - 1) % images.length)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#d9c6c8] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]"><ChevronLeft aria-hidden="true" /></button>
              <p role="status" className="text-sm text-[#5b4041]">{index + 1} / {images.length}</p>
              <button type="button" aria-label="Imagen siguiente" disabled={images.length < 2}
                onClick={() => setIndex((index + 1) % images.length)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#d9c6c8] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]"><ChevronRight aria-hidden="true" /></button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
