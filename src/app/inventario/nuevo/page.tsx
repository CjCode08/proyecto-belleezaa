import Link from "next/link";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { ProductForm } from "./form";
import { secondaryButtonClass } from "../ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

export default async function NewProductPage() {
  await requireInventoryProfile();
  const supabase = await createSupabaseServerClient();
  const { data: categories, error } = await supabase.rpc("inventory_list_categories");
  if (error || !categories) throw new Error("No se pudieron consultar las categorías.", { cause: error });
  return (
    <main className="min-h-screen bg-rose-50/30 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-4xl">
        <Link href="/inventario" className={secondaryButtonClass}>← Volver al inventario</Link>
        <h1 className="mt-4 text-2xl font-semibold">Nuevo producto</h1>
        <p className="mt-1 text-sm text-slate-600">Añade los precios, las variantes y el comentario del movimiento.</p>
        <ProductForm categories={categories} />
      </div>
    </main>
  );
}
