import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { secondaryButtonClass } from "../../ui";
import { CatalogRemoveForm, CatalogUploadForm } from "./forms";

export const instant = false;

export default async function CatalogImagesPage({ params }: { params: Promise<{ productId: string }> }) {
  const profile = await requireInventoryProfile();
  if (profile.role !== "admin") redirect("/inventario");
  const { productId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) notFound();
  const client = await createSupabaseServerClient();
  const [product, images] = await Promise.all([
    client.from("products").select("name").eq("id", productId).maybeSingle(),
    client.rpc("catalog_manage_images", { p_product_id: productId }),
  ]);
  if (product.error || images.error || !images.data) throw new Error("No se pudieron consultar las imágenes de catálogo.", { cause: product.error ?? images.error });
  if (!product.data) notFound();
  const productName = product.data.name;
  const paths = images.data.map((image) => image.image_url);
  const { data: signed, error } = paths.length
    ? await client.storage.from("catalogo-optimizado").createSignedUrls(paths, 300)
    : { data: [], error: null };
  if (error || !signed || signed.some((item) => !item.path || !item.signedUrl || item.error)) {
    throw new Error("No se pudieron preparar las imágenes de catálogo.", { cause: error });
  }
  const urls = new Map(signed.map((item) => [item.path!, item.signedUrl!]));
  return (
    <main className="min-h-screen bg-rose-50/30 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-4xl">
        <Link href="/inventario" className={secondaryButtonClass}>← Volver al inventario</Link>
        <h1 className="mt-5 text-2xl font-semibold">Imágenes del catálogo</h1>
        <p className="mt-1 text-sm text-slate-600">{productName} · Archivos separados de las fotos privadas del inventario.</p>
        <section className="mt-5 rounded-2xl border border-rose-100 bg-white p-5">
          <h2 className="font-semibold">Cargar imagen mejorada</h2>
          <CatalogUploadForm productId={productId} />
        </section>
        <section className="mt-5 rounded-2xl border border-rose-100 bg-white p-5">
          <h2 className="font-semibold">Imágenes registradas</h2>
          {images.data.length === 0 ? <p className="mt-3 text-sm text-slate-600">No hay imágenes de catálogo.</p> : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {images.data.map((image) => {
                const url = urls.get(image.image_url);
                if (!url) throw new Error("No se pudo preparar una imagen de catálogo.");
                return <li key={image.id} className="rounded-xl border border-slate-200 p-3">
                  <Image src={url} alt={`Imagen de catálogo de ${productName}`} width={480} height={360} unoptimized className="aspect-[4/3] w-full rounded-lg object-cover" />
                  {image.is_primary && <p className="mt-2 text-sm font-medium">Imagen principal</p>}
                  <CatalogRemoveForm productId={productId} imageId={image.id} />
                </li>;
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
