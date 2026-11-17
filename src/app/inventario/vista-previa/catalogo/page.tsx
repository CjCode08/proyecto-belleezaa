import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { parseCommercialProduct } from "@/lib/catalog/commercial";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CommercialCart, CommercialCartLink, ProductDetails } from "@/app/catalogo/commercial-cart";

export const instant = false;
const outfit = Outfit({ subsets: ["latin"], variable: "--font-catalog-heading", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-catalog-body", display: "swap" });

export default async function CatalogPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  await connection();
  await requireInventoryProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products")
    .select("id,name,description,category,inventory_product_prices(payment_category,unit_price_usd,promotion_price_usd,promotion_quantity,promotion_description,bundle_price_usd,needs_review),inventory_bundles(id,assortment_description,stock),product_variants(id,size,color,stock)")
    .eq("status", "activo").eq("catalog_visible", true).order("name").limit(100);
  if (error || !data) throw new Error("No se pudo consultar la vista previa del catálogo.", { cause: error });
  const products = data.map((product) => parseCommercialProduct({
    id: product.id, name: product.name, description: product.description, category: product.category,
    variants: product.product_variants.filter((variant) => variant.stock > 0),
    bundles: product.inventory_bundles.filter((bundle) => bundle.stock > 0).map((bundle) => ({ id: bundle.id, description: bundle.assortment_description, stock: bundle.stock })),
    prices: product.inventory_product_prices.filter((price) => !price.needs_review),
  })).filter((product) => product.variants.length > 0 || product.bundles.length > 0).slice(0, 24);
  const { data: rates, error: rateError } = await supabase.rpc("catalog_current_rate");
  if (rateError || !rates) throw new Error("No se pudo consultar la tasa.", { cause: rateError });
  const rate = rates[0]?.rate ?? null;
  const { data: images, error: imageError } = products.length
    ? await supabase.rpc("catalog_product_images", { p_product_ids: products.map((product) => product.id) })
    : { data: [], error: null };
  if (imageError || !images) throw new Error("No se pudieron consultar las imágenes del catálogo.", { cause: imageError });
  const primary = new Map<string, string>();
  for (const image of images) if (!primary.has(image.product_id)) primary.set(image.product_id, image.image_url);
  const paths = [...primary.values()];
  const { data: signed, error: signedError } = paths.length
    ? await supabase.storage.from("catalogo-optimizado").createSignedUrls(paths, 300)
    : { data: [], error: null };
  if (signedError || !signed || signed.some((image) => !image.path || !image.signedUrl || image.error)) throw new Error("No se pudieron preparar las imágenes.", { cause: signedError });
  const urls = new Map(signed.map((image) => [image.path!, image.signedUrl!]));

  return <div className={`${outfit.variable} ${jakarta.variable} min-h-screen bg-[#faf9f6] font-[family-name:var(--font-catalog-body)] text-[#1e1a1c]`}>
    <CommercialCart rate={rate} storageKey="belleza-commercial-preview-v1">
      <header className="border-b border-[#e8e6e1]"><div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"><Link href="/inventario/panel" className="font-[family-name:var(--font-catalog-heading)] text-xl font-bold uppercase">Belleezaa<span className="text-[#b50638]">.</span></Link><CommercialCartLink /></div></header>
      <main className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <p role="status" className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">Vista previa local: usa productos reales habilitados para el catálogo. No envía pedidos ni modifica el inventario.</p>
        <h1 className="mt-7 font-[family-name:var(--font-catalog-heading)] text-4xl font-bold uppercase">Catálogo</h1>
        <div aria-hidden="true" className="mt-2 h-1 w-12 bg-[#b50638]" />
        {products.length === 0 ? <p className="mt-8 text-sm">No hay productos visibles con existencias disponibles.</p> : <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">{products.map((product) => <article key={product.id} className="min-w-0"><ProductDetails product={product} imageUrl={primary.has(product.id) ? urls.get(primary.get(product.id)!) : undefined} rate={rate} /></article>)}</div>}
      </main>
    </CommercialCart>
  </div>;
}