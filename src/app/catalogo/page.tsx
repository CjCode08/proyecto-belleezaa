import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { Camera, MessageCircle } from "lucide-react";
import { Lobster, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { catalogPageHref, catalogPageSize, validCatalogAudience, validCatalogSearch } from "@/lib/catalog/search";
import { parseCommercialProduct } from "@/lib/catalog/commercial";
import { isCheckoutTestEnabled } from "@/lib/catalog/checkout-origin";
import { CommercialCart, CommercialCartLink, ProductDetails } from "./commercial-cart";
import { CatalogFilters } from "./filters";

export const instant = false;
export const metadata: Metadata = {
  title: "Belleza | Catálogo",
  description: "Catálogo de productos disponibles de Belleza.",
};

const outfit = Outfit({ subsets: ["latin"], variable: "--font-catalog-heading", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-catalog-body", display: "swap" });
const lobster = Lobster({ weight: "400", subsets: ["latin"], variable: "--font-catalog-brand", display: "swap" });
const advisors = [
  { name: "Mairobi", phone: "584128361315" },
  { name: "Yorgelis", phone: "584124953870" },
  { name: "Noemi", phone: "584244959960" },
];
const storeAddress = "Boutique Chicas Íntimas, 2003, Valencia, Carabobo";
const storeMapUrl = "https://maps.app.goo.gl/S1K6KRjyCaNy12wM6";
const storeMapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(storeAddress)}&output=embed`;

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ buscar?: string; pagina?: string; tipo?: string; categoria?: string }> }) {
  await connection();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("host")?.split(",")[0].trim();
  const currentOrigin = requestHost ? `${process.env.NODE_ENV === "development" ? "http" : "https"}://${requestHost}` : "";
  const configuredTestOrigin = process.env.CHECKOUT_TEST_ORIGIN ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  const isDeployPreviewTest = process.env.NODE_ENV === "production";
  const testCheckoutEnabled = process.env.CHECKOUT_TEST_ENABLED === "true" && isCheckoutTestEnabled(currentOrigin, process.env.NODE_ENV ?? "", {
    enabled: process.env.CHECKOUT_TEST_ENABLED,
    configuredOrigin: configuredTestOrigin,
    publicSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    testSupabaseUrl: isDeployPreviewTest ? process.env.CHECKOUT_TEST_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL,
    testServiceRoleKey: isDeployPreviewTest ? process.env.CHECKOUT_TEST_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY,
    testTurnstileSecret: isDeployPreviewTest ? process.env.CHECKOUT_TEST_TURNSTILE_SECRET_KEY : process.env.TURNSTILE_SECRET_KEY,
    testTurnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    testWhatsappNumber: isDeployPreviewTest ? process.env.CHECKOUT_TEST_WHATSAPP_NUMBER : process.env.WHATSAPP_NUMBER,
  });
  if (process.env.NODE_ENV === "production" && process.env.CATALOG_MAINTENANCE === "true") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9f6] px-5 py-12 text-[#1e1a1c]">
        <section className="w-full max-w-lg rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#b50638]">Belleezaa</p>
          <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">Estamos actualizando nuestro catálogo</h1>
          <p className="mt-4 leading-relaxed text-slate-600">
            Pronto podrás volver a consultar nuestros productos. Gracias por tu paciencia.
          </p>
        </section>
      </main>
    );
  }
  const params = await searchParams;
  const search = typeof params.buscar === "string" ? params.buscar.trim() : "";
  const audience = typeof params.tipo === "string" ? params.tipo : "";
  const category = typeof params.categoria === "string" ? params.categoria : "";
  const validSearch = validCatalogSearch(search);
  const validFilters = validCatalogAudience(audience) && validCatalogSearch(category);
  const valid = validSearch && validFilters;
  const requestedPage = Number(params.pagina ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 41667 ? requestedPage : 1;
  const supabase = await createSupabaseServerClient();
  const { data: rates, error: rateError } = await supabase.rpc("catalog_current_rate");
  if (rateError || !rates) throw new Error("No se pudo consultar la tasa del catálogo.", { cause: rateError });
  const rate = rates[0] ?? null;
  const { data: categories, error: categoriesError } = await supabase.rpc("catalog_filter_categories");
  if (categoriesError || !categories) throw new Error("No se pudieron consultar las categorías del catálogo.", { cause: categoriesError });
  const { data, error } = valid
    ? await supabase.rpc("catalog_commercial_products", { p_search: search, p_offset: (page - 1) * catalogPageSize, p_audience: audience, p_category: category })
    : { data: [], error: null };
  if (error) throw new Error("No se pudo consultar el catálogo público.", { cause: error });
  if (!data) throw new Error("El catálogo no devolvió resultados válidos.");
  const products = data.slice(0, catalogPageSize).map(parseCommercialProduct);
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
  const checkoutMode = process.env.NODE_ENV === "development" || testCheckoutEnabled ? "test" : "production";
  const checkoutSiteKey = (
    testCheckoutEnabled ||
    (checkoutMode === "production" && process.env.CHECKOUT_PRODUCTION_ENABLED === "true" && process.env.CHECKOUT_PRODUCTION_ORIGIN === "https://www.belleezaa.com" && process.env.CATALOG_MAINTENANCE === "false")
  ) ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null : null;

  return (
    <div className={`${outfit.variable} ${jakarta.variable} ${lobster.variable} min-h-screen bg-[#faf9f6] font-[family-name:var(--font-catalog-body)] text-[#1e1a1c]`}>
      <CommercialCart rate={rate?.rate ?? null} checkoutMode={checkoutMode} checkoutSiteKey={checkoutSiteKey}>
      <a href="#productos" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-[#92002a] focus:outline-2">Ir a los productos</a>
      <header className="sticky top-12 z-40 border-b border-[#e8e6e1] bg-[#faf9f6]">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/catalogo" aria-label="Belleezaa, catálogo" className="font-[family-name:var(--font-catalog-brand)] text-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b50638]">
            Belleezaa<span className="text-[#b50638]">.</span>
          </Link>
          <nav aria-label="Navegación del catálogo" className="hidden items-center gap-8 text-sm font-semibold lg:flex">
            <a href="#productos" className="text-[#b50638] underline decoration-2 underline-offset-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b50638]">Catálogo</a>
            <a href="#buscar" className="text-[#5b4041] hover:text-[#b50638] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b50638]">Buscar prendas</a>
          </nav>
          <CommercialCartLink />
        </div>
      </header>
      <main id="productos" className="mx-auto max-w-7xl scroll-mt-4 px-4 pb-12 sm:px-6 lg:px-8">
        <section className="border-b border-[#efe6e8] pb-6 pt-7 sm:pb-8 sm:pt-10">
          <p className="font-[family-name:var(--font-catalog-heading)] text-xs font-bold uppercase tracking-[0.18em] text-[#b50638]">Belleza · Colección</p>
          <h1 className="mt-1 font-[family-name:var(--font-catalog-brand)] text-5xl font-normal sm:text-6xl lg:text-7xl">Catálogo</h1>
          <div aria-hidden="true" className="mt-2 h-1 w-12 bg-[#b50638]" />
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#5b4041]">Descubre las prendas disponibles de nuestra tienda y elige tus favoritas.</p>
        </section>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs leading-5 text-[#5b4041]">
        <p>
          {checkoutSiteKey ? checkoutMode === "test" ? "Solicitud de prueba: no es una compra real." : "El vendedor confirmará precios y disponibilidad." : "Los pedidos no están habilitados en este momento."}
        </p>
        </div>
        <div id="buscar" className="scroll-mt-4">
          <div className="py-5 lg:hidden"><CatalogFilters key={JSON.stringify([search, audience, category])} search={search} audience={audience} category={category} categories={categories} mobile /></div>
        </div>
        {!validSearch && <p role="alert" className="mt-2 text-sm text-red-700">La búsqueda admite hasta 120 caracteres sin caracteres de control.</p>}
        {!validFilters && <p role="alert" className="mt-2 text-sm text-red-700">Los filtros no son válidos. Selecciona un tipo y una categoría de la lista.</p>}
        <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-8 lg:pt-6">
        <aside aria-label="Filtros del catálogo" className="hidden border-r border-[#efe6e8] pr-6 lg:block">
          <CatalogFilters key={JSON.stringify([search, audience, category])} search={search} audience={audience} category={category} categories={categories} mobile={false} />
        </aside>
        <div className="min-w-0">
        {valid && products.length === 0 ? (
          <p className="mt-6 rounded-xl bg-[#fbf1f4] p-5 text-sm text-[#5b4041]">
            {page > 1 ? "No hay productos en esta página." : "No se encontraron productos disponibles."}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-6 lg:mt-0 lg:gap-x-5 lg:gap-y-8">
            {products.map((product) => {
              const path = primaryImages.get(product.id);
              const imageUrl = path ? urls.get(path) : undefined;
              if (path && !imageUrl) throw new Error("No se pudo preparar una imagen del catálogo.");
              return <article key={product.id} className="min-w-0"><ProductDetails product={product} imageUrl={imageUrl} rate={rate?.rate ?? null} /></article>;
            })}
          </div>
        )}
        {valid && <nav aria-label="Páginas del catálogo" className="mt-10 flex items-center justify-between border-t border-[#efe6e8] pt-5 text-sm">
          {page > 1 ? <Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#92002a] hover:bg-[#fbf1f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]" href={catalogPageHref(page - 1, search, audience, category)}>Anterior</Link> : <span />}
          <span>Página {page}</span>
          {data.length > catalogPageSize ? <Link className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-[#92002a] hover:bg-[#fbf1f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b50638]" href={catalogPageHref(page + 1, search, audience, category)}>Siguiente</Link> : <span />}
        </nav>}
        </div>
        </div>
      </main>
      </CommercialCart>
      <footer className="bg-[#1e1a1c] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-[family-name:var(--font-catalog-brand)] text-3xl">Belleezaa<span className="text-[#ffb2b7]">.</span></p>
            <p className="mt-2 text-sm text-[#e9e0e3]">Prendas para acompañarte cada día.</p>
          </div>
          <section aria-labelledby="catalog-social-title">
            <h2 id="catalog-social-title" className="text-sm font-semibold">Síguenos</h2>
            <div className="mt-3 flex flex-col items-start gap-3 text-sm text-[#f8eef1]">
              <a href="https://www.instagram.com/bo.chicasintimas/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 underline decoration-[#8f6f71] underline-offset-4 hover:text-[#ffb2b7]">
                <Camera size={18} aria-hidden="true" /> Instagram
              </a>
              <a href="https://whatsapp.com/channel/0029VakYaoQ4IBhD6xo4vq1u" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 underline decoration-[#8f6f71] underline-offset-4 hover:text-[#ffb2b7]">
                <MessageCircle size={18} aria-hidden="true" /> Canal de WhatsApp
              </a>
            </div>
          </section>
          <section aria-labelledby="catalog-advisors-title">
            <h2 id="catalog-advisors-title" className="text-sm font-semibold">Atención directa</h2>
            <div className="mt-3 flex flex-col items-start gap-2">
              {advisors.map((advisor) => <a key={advisor.name}
                href={`https://wa.me/${advisor.phone}?text=${encodeURIComponent(`Hola, ${advisor.name} necesito ayuda con mi pedido.`)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 text-sm text-[#f8eef1] underline decoration-[#8f6f71] underline-offset-4 hover:text-[#ffb2b7]">
                <MessageCircle size={16} aria-hidden="true" /> Asesora {advisor.name}
              </a>)}
            </div>
          </section>
          <section aria-labelledby="catalog-location-title">
            <h2 id="catalog-location-title" className="text-sm font-semibold">Visítanos</h2>
            <p className="mt-3 text-sm text-[#e9e0e3]">{storeAddress}</p>
            <a href={storeMapUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#ffb2b7] underline underline-offset-4 hover:text-white">
              Cómo llegar
            </a>
            <iframe title="Mapa de Boutique Chicas Íntimas en Valencia" src={storeMapEmbedUrl} loading="lazy"
              referrerPolicy="no-referrer-when-downgrade" className="mt-3 h-40 w-full rounded-lg border border-[#625a5c] bg-[#252526]" />
          </section>
        </div>
      </footer>
    </div>
  );
}
