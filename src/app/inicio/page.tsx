import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Camera, MapPin, MessageCircle, Music2 } from "lucide-react";
import { Lobster, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { catalogPageHref } from "@/lib/catalog/search";
import { parseCommercialProduct } from "@/lib/catalog/commercial";
import { ThemeToggle } from "../theme-toggle";
import { MobileNav } from "./mobile-nav";

export const instant = false;
export const metadata: Metadata = {
  title: "Belleezaa | Inicio",
  description: "Conoce Belleezaa y explora nuestro catálogo de prendas.",
};

const lobster = Lobster({ weight: "400", subsets: ["latin"], variable: "--font-inicio-brand", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-inicio-heading", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-inicio-body", display: "swap" });
const contactUrl = "https://wa.me/584124580887";
const locationUrl = "https://maps.app.goo.gl/S1K6KRjyCaNy12wM6";

export default async function StoreHomePage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const maintenance = process.env.CATALOG_MAINTENANCE === "true";
  const [categoriesResult, productsResult] = maintenance
    ? [{ data: [] as string[] }, { data: [] }]
    : await Promise.all([
      supabase.rpc("catalog_filter_categories"),
      supabase.rpc("catalog_commercial_products", { p_search: "", p_offset: 0, p_audience: "", p_category: "" }),
    ]);
  const categories = categoriesResult.data ?? [];
  const products = (productsResult.data ?? []).slice(0, 12).map(parseCommercialProduct);
  const imagesResult = products.length
    ? await supabase.rpc("catalog_product_images", { p_product_ids: products.map((product) => product.id) })
    : { data: [] };
  const firstImages = new Map<string, string>();
  for (const image of imagesResult.data ?? []) {
    if (!firstImages.has(image.product_id)) firstImages.set(image.product_id, image.image_url);
  }
  const imagePaths = [...firstImages.values()];
  const signedResult = imagePaths.length
    ? await supabase.storage.from("catalogo-optimizado").createSignedUrls(imagePaths, 300)
    : { data: [] };
  const imageUrls = new Map((signedResult.data ?? []).filter((image) => image.path && image.signedUrl && !image.error).map((image) => [image.path!, image.signedUrl!]));
  const productImage = (productId: string) => {
    const path = firstImages.get(productId);
    return path ? imageUrls.get(path) : undefined;
  };
  return (
    <div className={`inicio-page ${lobster.variable} ${outfit.variable} ${jakarta.variable} bg-[#faf9f6] font-[family-name:var(--font-inicio-body)] text-[#1e1a1c]`}>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Ir al contenido</a>
      <header className="border-b border-[#e8e6e1] bg-[#faf9f6]">
        <nav aria-label="Navegación principal" className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
          <Link href="/inicio" className="font-[family-name:var(--font-inicio-brand)] text-3xl text-[#b50638]">Belleezaa</Link>
          <div className="hidden flex-wrap items-center justify-end gap-2 text-sm font-semibold md:flex">
            <Link href="/catalogo" className="catalog-nav-link catalog-nav-link-current inline-flex min-h-11 items-center rounded-md px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Catálogo</Link>
            <a href="#categorias" className="catalog-nav-link inline-flex min-h-11 items-center rounded-md px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Categorías</a>
            <a href="#nosotros" className="catalog-nav-link inline-flex min-h-11 items-center rounded-md px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">Nosotros</a>
            <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="catalog-nav-link inline-flex min-h-11 items-center gap-2 rounded-md px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]"><MessageCircle size={17} aria-hidden="true" /> Contacto</a>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <MobileNav contactUrl={contactUrl} />
          </div>
        </nav>
      </header>

      <main id="contenido">
        <section className="flex min-h-[400px] items-center border-b-8 border-[#720429] bg-[#a90c38] text-white sm:min-h-[440px]">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <h1 className="font-[family-name:var(--font-inicio-brand)] text-6xl leading-tight sm:text-7xl lg:text-8xl">Belleezaa</h1>
            <div aria-hidden="true" className="mt-4 h-1 w-16 bg-[#ffd9dd]" />
            <p className="mt-4 max-w-md text-base leading-7 text-white sm:text-lg">Encuentra prendas para acompañarte cada día.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/catalogo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-[#720429] transition-colors hover:bg-[#ffd9dd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Explorar catálogo <ArrowRight size={17} aria-hidden="true" /></Link>
              <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white px-5 text-sm font-semibold text-white transition-colors hover:bg-[#720429] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><MessageCircle size={17} aria-hidden="true" /> Hablar por WhatsApp</a>
            </div>
          </div>
        </section>

        <section id="categorias" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e8e6e1] pb-5">
            <div><p className="text-xs font-semibold uppercase text-[#b50638]">Explora la tienda</p><h2 className="mt-2 font-[family-name:var(--font-inicio-heading)] text-3xl font-semibold">Categorías</h2></div>
            <Link href="/catalogo" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#92002a] hover:underline">Ver todo el catálogo <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          {categories.length > 0 ? <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => {
              const product = products.find((item) => item.category === category && productImage(item.id));
              const image = product ? productImage(product.id) : undefined;
              return <Link key={category} href={catalogPageHref(1, "", "", category)} className="catalog-product-card group overflow-hidden rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]">
                <div className="catalog-product-image relative aspect-[4/3] overflow-hidden">{image && <Image src={image} alt={product?.name ?? ""} fill unoptimized sizes="(max-width: 640px) 50vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none" />}</div>
                <div className="flex min-h-16 items-center justify-between gap-2 px-4 py-3"><span className="break-words font-semibold">{category}</span><ArrowRight size={18} aria-hidden="true" className="shrink-0 text-[#b50638]" /></div>
              </Link>;
            })}
          </div> : <p className="catalog-product-muted mt-6 text-sm">Consulta las prendas disponibles en el catálogo.</p>}
        </section>

        <section id="nosotros" className="scroll-mt-20 border-y border-[#e8e6e1] bg-white">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-12 sm:px-6 md:grid-cols-[1fr_2fr] lg:px-8 lg:py-16">
            <div><p className="text-xs font-semibold uppercase text-[#b50638]">Conócenos</p><h2 className="mt-2 font-[family-name:var(--font-inicio-heading)] text-3xl font-semibold">Quiénes somos</h2></div>
            <div className="max-w-2xl"><p className="text-base leading-7 text-[#5b4041]">Belleezaa, somos Boutique Chicas Intimas una tienda de ropa para mujeres, caballeros y niños en Valencia, Carabobo. Te acompañamos a elegir entre las opciones disponibles en nuestro catálogo.</p><a href={locationUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#92002a] hover:underline"><MapPin size={18} aria-hidden="true" /> Visítanos en Boutique Chicas Íntimas <ArrowRight size={16} aria-hidden="true" /></a></div>
          </div>
        </section>

        <section id="compras" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="text-xs font-semibold uppercase text-[#b50638]">Tu pedido</p>
          <h2 className="mt-2 font-[family-name:var(--font-inicio-heading)] text-3xl font-semibold">Condiciones de compra</h2>
          <div className="mt-6 grid gap-6 border-t border-[#e8e6e1] pt-6 sm:grid-cols-3">
            <div><h3 className="font-semibold">Disponibilidad y precios</h3><p className="mt-2 text-sm leading-6 text-[#5b4041]">El vendedor confirma la disponibilidad y los precios por WhatsApp.</p></div>
            <div><h3 className="font-semibold">Entrega</h3><p className="mt-2 text-sm leading-6 text-[#5b4041]">Retiro en tienda, delivery en Carabobo o envío nacional. El costo de entrega se acuerda con el vendedor.</p></div>
            <div><h3 className="font-semibold">Formas de pago</h3><p className="mt-2 text-sm leading-6 text-[#5b4041]">Bolívares o Binance. Efectivo disponible para retiro en tienda.</p></div>
          </div>
          <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#92002a] hover:underline"><MessageCircle size={18} aria-hidden="true" /> Consultar condiciones por WhatsApp</a>
        </section>
      </main>

      <footer className="bg-[#1e1a1c] px-4 py-10 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div><p className="font-[family-name:var(--font-inicio-brand)] text-3xl">Belleezaa</p><p className="mt-2 text-sm text-[#e9e0e3]">Prendas para acompañarte cada día.</p></div>
          <div><h2 className="text-sm font-semibold">Síguenos</h2><div className="mt-3 flex flex-col items-start text-sm">
            <a href="https://www.instagram.com/bo.chicasintimas/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 hover:underline"><Camera size={17} aria-hidden="true" /> Instagram</a>
            <a href="https://www.tiktok.com/@bo.chicasintimas?_r=1&_t=ZS-9BXKSgJtj4n" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 hover:underline"><Music2 size={17} aria-hidden="true" /> TikTok</a>
            <a href="https://whatsapp.com/channel/0029VakYaoQ4IBhD6xo4vq1u" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 hover:underline"><MessageCircle size={17} aria-hidden="true" /> Canal de WhatsApp</a>
          </div></div>
          <div><h2 className="text-sm font-semibold">Visítanos</h2><p className="mt-3 text-sm leading-6 text-[#e9e0e3]">Boutique Chicas Íntimas, 2003, Valencia, Carabobo</p><a href={locationUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-[#ffb2b7] hover:underline"><MapPin size={17} aria-hidden="true" /> Cómo llegar</a><p><a href="#compras" className="inline-flex min-h-11 items-center text-sm hover:underline">Condiciones de compra</a></p></div>
        </div>
      </footer>
    </div>
  );
}