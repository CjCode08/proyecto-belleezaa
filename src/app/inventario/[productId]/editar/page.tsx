import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { getSignedInventoryImageUrls } from "@/lib/inventory/images";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProductEditForm } from "./form";
import { secondaryButtonClass } from "../../ui";

export const instant = false;

export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const profile = await requireInventoryProfile();
  const { productId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, description, category, audiences, sku_base, product_variants(id, size, color, sku, sku_color_code, stock), product_images(id, image_url, display_order, is_primary)")
    .eq("id", productId)
    .eq("product_images.image_type", "almacen")
    .maybeSingle();
  if (error) throw new Error("No se pudo consultar el producto.", { cause: error });
  if (!product) notFound();
  const [pricesResult, bundlesResult] = await Promise.all([
    supabase.from("inventory_product_prices").select("*").eq("product_id", productId),
    supabase.from("inventory_bundles").select("*").eq("product_id", productId),
  ]);
  if (pricesResult.error || !pricesResult.data) throw new Error("No se pudieron consultar los precios.", { cause: pricesResult.error });
  if (bundlesResult.error || !bundlesResult.data) throw new Error("No se pudieron consultar los bultos.", { cause: bundlesResult.error });
  const { data: categories, error: categoriesError } = await supabase.rpc("inventory_list_categories");
  if (categoriesError || !categories) throw new Error("No se pudieron consultar las categorías.", { cause: categoriesError });

  const imageUrls = await getSignedInventoryImageUrls(
    supabase,
    product.product_images.map((image) => image.image_url),
  );
  const images = product.product_images.map((image) => {
    const url = imageUrls.get(image.image_url);
    if (!url) throw new Error("No se pudo preparar una imagen del producto.");
    return { id: image.id, url };
  });

  return (
    <main className="min-h-screen bg-rose-50/30 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-4xl">
        <Link href="/inventario" className={secondaryButtonClass}>← Volver al inventario</Link>
        <h1 className="mt-4 text-2xl font-semibold">Editar producto</h1>
        <p className="mt-1 text-sm text-slate-600">Guarda el comentario de auditoría con cada cambio.</p>
        <ProductEditForm
          product={product}
          categories={categories}
          variants={product.product_variants.map((variant) => ({
            ...variant,
            sku: variant.sku ?? "",
          }))}
          images={images}
          prices={pricesResult.data}
          bundles={bundlesResult.data}
          canDelete={profile.role === "admin"}
        />
      </div>
    </main>
  );
}
