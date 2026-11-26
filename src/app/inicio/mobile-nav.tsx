"use client";

import Link from "next/link";
import { Menu, MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function MobileNav({ contactUrl }: { contactUrl: string }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const linkClass = "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#1e1a1c] hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]";

  return (
    <div ref={container} className="relative md:hidden">
      <button ref={button} type="button" aria-label={open ? "Cerrar menú" : "Abrir menú"} title={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} aria-controls="inicio-mobile-menu" onClick={() => setOpen(!open)} className="catalog-nav-link inline-flex size-11 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
      {open && <div id="inicio-mobile-menu" className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-md border border-[#e8e6e1] bg-white p-2 shadow-lg">
        <Link href="/catalogo" onClick={() => setOpen(false)} className={linkClass}>Catálogo</Link>
        <a href="#categorias" onClick={() => setOpen(false)} className={linkClass}>Categorías</a>
        <a href="#nosotros" onClick={() => setOpen(false)} className={linkClass}>Nosotros</a>
        <a href={contactUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={linkClass}><MessageCircle size={17} aria-hidden="true" /> Contacto</a>
      </div>}
    </div>
  );
}