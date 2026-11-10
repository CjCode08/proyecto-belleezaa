import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { Search } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { catalogPageHref, catalogPageSize, maxCatalogSearchLength, validCatalogSearch } from "@/lib/catalog/search";
import { catalogVariants } from "@/lib/catalog/cart";
import { AddToCart, CartLink, CatalogCart } from "./cart";
import { formatExchangeRateDate } from "@/lib/inventory/exchange-rate";
import { ProductGallery } from "./product-gallery";

export const instant = false;
export const metadata: Metadata = {
  title: "Belleza | Catálogo",
  description: "Catálogo de productos disponibles de Belleza.",
};

const usd = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-catalog-heading", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-catalog-body", display: "swap" });

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ buscar?: string; pagina?: string }> }) {
  const params = await searchParams;
  const search = typeof params.buscar === "string" ? params.buscar.trim() : "";
  const valid = validCatalogSearch(search);
  const requestedPage = Number(params.pagina ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 41667 ? requestedPage : 1;
  const supabase = await createSupabaseServerClient();
  const { data: rates, error: rateError } = await supabase.rpc("catalog_current_rate");
  if (rateError || !rates) throw new Error("No se pudo consultar la tasa del catálogo.", { cause: rateError });
  const rate = rates[0] ?? null;
  const { data, error } = valid
    ? await supabase.rpc("catalog_list_products", { p_search: search, p_offset: (page - 1) * catalogPageSize })
    : { data: [], error: null };
  if (error) throw new Error("No se pudo consultar el catálogo público.", { cause: error });
  if (!data) throw new Error("El catálogo no devolvió resultados válidos.");
  const products = data.slice(0, catalogPageSize);
  const { data: imageRows, error: imagesError } = products.length
    ? await supabase.rpc("catalog_product_images", { p_product_ids: products.map((product) => product.id) })
    : { data: [], error: null };
  if (imagesError || !imageRows) throw new Error("No se pudieron consultar las imágenes del catálogo.", { cause: imagesError });
  const primaryImages = new Map<string, string>();
  for (const image of imageRows) {
    if (!primaryImages.has(image.product_id)) primaryImages.set(image.product_id, image.image_url);
  }
  const paths = [...primaryImages.values()];
  const { data: signedImages, error: signedError } = paths.length
    ? await supabase.storage.from("catalogo-optimizado").createSignedUrls(paths, 300)
    : { data: [], error: null };
  if (signedError || !signedImages || signedImages.some((image) => !image.path || !image.signedUrl || image.error)) {
    throw new Error("No se pudieron preparar las imágenes del catálogo.", { cause: signedError });
  }
  const urls = new Map(signedImages.map((image) => [image.path!, image.signedUrl!]));

  return (
    <div className={`${outfit.variable} ${jakarta.variable} min-h-screen bg-[#fff8f9] font-[family-name:var(--font-catalog-body)] text-[#1e1a1c] lg:bg-white`}>
      <CatalogCart rate={rate?.rate ?? null}>
      <a href="#productos" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-[#92002a] focus:outline-2">Ir a los productos</a>
      <header className="border-b border-[#efe6e8] bg-[#fff8f9] lg:bg-white">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/catalogo" aria-label="Belleza, catálogo" className="font-[family-name:var(--font-catalog-heading)] text-xl font-bold uppercase tracking-[0.16em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b50638]">
            Belleza<span className="text-[#b50638]">.</span>
          </Link>
          <nav aria-label="Navegación del catálogo" className="hidden items-center gap-8 text-sm font-semibold lg:flex">
            <a href="#productos" className="text-[#b50638] underline decoration-2 underline-offset-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b50638]">Catálogo</a>
            <a href="#buscar" className="text-[#5b4041] hover:text-[#b50638] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b50638]">Buscar prendas</a>
          </nav>
          <CartLink />
        </div>
      </header>
      <main id="productos" className="mx-auto max-w-7xl scroll-mt-4 px-4 pb-12 sm:px-6 lg:px-8">
        <section className="border-b border-[#efe6e8] pb-6 pt-7 sm:pb-8 sm:pt-10">
          <p className="font-[family-name:var(--font-catalog-heading)] text-xs font-bold uppercase tracking-[0.18em] text-[#b50638]">Belleza · Colección</p>
          <h1 className="mt-1 font-[family-name:var(--font-catalog-heading)] text-4xl font-bold uppercase tracking-tight sm:text-5xl lg:text-6xl">Catálogo</h1>
          <div aria-hidden="true" className="mt-2 h-1 w-12 bg-[#b50638]" />
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#5b4041]">Descubre las prendas disponibles de nuestra tienda y elige tus favoritas.</p>
        </section>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs leading-5 text-[#5b4041]">
        <p>
          Vista previa del catálogo: la compra todavía está en preparación.
        </p>
        {rate ? <p>Tasa del {formatExchangeRateDate(rate.effective_date)}: 1 USD = {rate.rate.replace(".", ",")} Bs.</p>
          : <p role="alert" className="font-semibold text-[#92002a]">No hay una tasa de cambio registrada para hoy. Los importes en bolívares y los pedidos no están disponibles.</p>}
        </div>
        <form id="buscar" action="/catalogo" method="get" role="search" className="scroll-mt-4 border-b border-[#efe6e8] py-5">
          <label htmlFor="catalog-search" className="block text-sm font-semibold">Buscar por producto o categoría</label>
          <div className="mt-2 flex flex-wrap gap-2 sm:max-w-xl">
            <input id="catalog-search" name="buscar" type="search" defaultValue={search}
              maxLength={maxCatalogSearchLength} placeholder="Ej. vestido" className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#d9c6c8] bg-white px-3 py-2 text-sm text-[#1e1a1c]" />
            <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#b50638] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#92002a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]"><Search aria-hidden="true" size={17} /> Buscar</button>
            {search && <Link href="/catalogo" className="flex min-h-11 items-center rounded-lg border border-[#d9c6c8] bg-white px-3 text-sm font-semibold text-[#92002a] hover:bg-[#fbf1f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Limpiar</Link>}
          </div>
          {!valid && <p role="alert" className="mt-2 text-sm text-red-700">La búsqueda admite hasta 120 caracteres sin caracteres de control.</p>}
        </form>
        {valid && products.length === 0 ? (
          <p className="mt-6 rounded-xl bg-[#fbf1f4] p-5 text-sm text-[#5b4041]">
            {page > 1 ? "No hay productos en esta página." : "No se encontraron productos disponibles."}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-10">
            {products.map((product) => {
              const path = primaryImages.get(product.id);
              const imageUrl = path ? urls.get(path) : undefined;
              if (path && !imageUrl) throw new Error("No se pudo preparar una imagen del catálogo.");
              return (
              <article key={product.id} className="group flex min-w-0 flex-col">
                <div className="relative overflow-hidden rounded-xl bg-[#f5ecee] lg:rounded-none">
                {imageUrl ? (
                  <Image src={imageUrl} alt={`Imagen de ${product.name}`} width={800} height={600}
                    unoptimized className="aspect-[3/4] w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]" />
                ) : <div className="flex aspect-[3/4] items-center justify-center p-4 text-center text-sm text-[#5b4041]">Imagen de catálogo pendiente</div>}
                {imageUrl && <ProductGallery productId={product.id} name={product.name} />}
                </div>
                <div className="flex flex-1 flex-col pt-3">
                  <p className="break-words text-xs font-semibold uppercase tracking-wide text-[#92002a]">{product.category || "Colección"}</p>
                  <h2 className="mt-1 break-words font-[family-name:var(--font-catalog-heading)] text-base font-semibold leading-5 lg:uppercase lg:tracking-wide">{product.name}</h2>
                  {product.description && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[#5b4041]">{product.description}</p>}
                  <p className="mt-2 font-[family-name:var(--font-catalog-heading)] text-lg font-bold text-[#b50638]">{usd.format(product.unit_price)} <span className="font-[family-name:var(--font-catalog-body)] text-xs font-normal text-[#5b4041]">por unidad</span></p>
                  <p className="mt-2 text-xs leading-5 text-[#5b4041]">Desde 12 Pzs: {product.wholesale_price === null ? "Sin definir" : usd.format(product.wholesale_price)} c/u</p>
                  <AddToCart productId={product.id} name={product.name} variants={catalogVariants(product.variants)}
                    prices={{ unitPrice: product.unit_price, promoPrice: product.promo_price, wholesalePrice: product.wholesale_price }} />
                </div>
              </article>
              );
            })}
          </div>
        )}
        {valid && <nav aria-label="Páginas del catálogo" className="mt-10 flex items-center justify-between border-t border-[#efe6e8] pt-5 text-sm">
          {page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#92002a] hover:bg-[#fbf1f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]" href={catalogPageHref(page - 1, search)}>Anterior</Link> : <span />}
          <span>Página {page}</span>
          {data.length > catalogPageSize ? <Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#92002a] hover:bg-[#fbf1f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]" href={catalogPageHref(page + 1, search)}>Siguiente</Link> : <span />}
        </nav>}
      </main>
      </CatalogCart>
      <footer className="bg-[#1e1a1c] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="font-[family-name:var(--font-catalog-heading)] text-lg font-bold uppercase tracking-[0.14em]">Belleza<span className="text-[#ffb2b7]">.</span></p>
          <p className="mt-2 text-sm text-[#e9e0e3]">Prendas para acompañarte cada día.</p>
        </div>
      </footer>
    </div>
  );
}
