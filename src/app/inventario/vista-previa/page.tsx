import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { ProductForm } from "../nuevo/form";
import { secondaryButtonClass } from "../ui";

export const instant = false;

export default async function InventoryPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  await connection();
  await requireInventoryProfile();

  return (
    <main className="min-h-screen bg-rose-50/30 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-4xl">
        <Link href="/inventario/panel" className={secondaryButtonClass}>← Volver al panel</Link>
        <h1 className="mt-4 text-2xl font-semibold">Vista previa del nuevo producto</h1>
        <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Solo para revisión local. Puedes probar los campos, tallas y colores; no se guardan productos ni se cargan imágenes.
          Las categorías reales no se consultan en esta vista.
        </p>
        <ProductForm categories={[]} preview />
      </div>
    </main>
  );
}
