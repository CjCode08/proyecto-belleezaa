import Form from "next/form";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { logoutSeller } from "@/app/login/actions";
import { getActiveProfile } from "@/lib/auth/active-profile";
import { staffDestination } from "@/lib/auth/staff-destination";
import { parseCommercialProduct } from "@/lib/catalog/commercial";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SellersCart } from "./sellers-cart";

const pageSize = 24;
const lastPage = Math.floor(1000000 / pageSize) + 1;

export default async function SellersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; pagina?: string | string[] }> }) {
  if (process.env.SELLERS_PREVIEW_ENABLED !== "true") notFound();

  const profile = await getActiveProfile();
  const destination = staffDestination(profile, true);
  if (!profile || destination !== "/vendedores") redirect("/vendedores/login");

  const { q, pagina } = await searchParams;
  const search = typeof q === "string" ? q.trim().slice(0, 120) : "";
  const requestedPage = typeof pagina === "string" && /^\d+$/.test(pagina) ? Number(pagina) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= lastPage ? requestedPage : 1;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("sellers_catalog_products", { p_search: search, p_offset: (page - 1) * pageSize });
  if (error?.code === "42501") redirect("/vendedores/login");

  const products = (data ?? []).slice(0, pageSize).map(parseCommercialProduct);
  const imageUrls: Record<string, string> = {};
  if (products.length) {
    const { data: images } = await supabase.rpc("sellers_inventory_images", { p_product_ids: products.map((product) => product.id) });
    if (images?.length) {
      const { data: signed } = await supabase.storage.from("inventario-privado").createSignedUrls(images.map((image) => image.image_url), 300);
      const byPath = new Map((signed ?? []).map((image) => [image.path, image.signedUrl]));
      for (const image of images) {
        const url = byPath.get(image.image_url);
        if (url) imageUrls[image.product_id] = url;
      }
    }
  }
  const pageHref = (number: number) => `/vendedores?${new URLSearchParams({ q: search, pagina: String(number) })}`;

  return (
    <main className="seller-surface min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--seller-line)] pb-5">
        <div>
          <p className="font-serif text-lg font-bold text-[var(--seller-accent)]">Belleezaa</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Ventas en tienda</h1>
          <p className="mt-1 [overflow-wrap:anywhere] text-sm text-[var(--seller-muted)]">{profile.full_name}</p>
        </div>
        <form action={logoutSeller}>
          <button type="submit" className="min-h-11 rounded-md border border-current px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
            Cerrar sesi&oacute;n
          </button>
        </form>
      </header>
      <Form action="/vendedores" key={search} className="mt-6 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <label htmlFor="seller-search" className="block text-sm font-medium">Nombre, categor&iacute;a o SKU</label>
          <input id="seller-search" name="q" type="search" defaultValue={search} maxLength={120} className="mt-1 min-h-11 w-full rounded-md border border-[var(--seller-line)] bg-[var(--seller-paper)] px-3 focus-visible:outline-2 focus-visible:outline-[var(--seller-accent)]" />
        </div>
        <button type="submit" className="min-h-11 rounded-md bg-[var(--seller-action)] px-4 font-medium text-white hover:bg-[var(--seller-hover)]">Buscar</button>
      </Form>
      {error && <p role="alert" className="mt-4 text-sm">No se pudo consultar el cat&aacute;logo. El borrador sigue disponible. <Link href={pageHref(page)} className="underline" prefetch={false}>Reintentar</Link></p>}
      <SellersCart key={profile.id} sellerId={profile.id} products={products} imageUrls={imageUrls} catalogUnavailable={Boolean(error)} />
      {!error && (page > 1 || (data && data.length > pageSize && page < lastPage)) && (
        <nav aria-label="Paginaci&oacute;n del cat&aacute;logo" className="mt-5 flex flex-wrap items-center gap-4 text-sm">
          {page > 1 && <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center underline" prefetch={false}>Anterior</Link>}
          <span>P&aacute;gina {page}</span>
          {data && data.length > pageSize && page < lastPage && <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center underline" prefetch={false}>Siguiente</Link>}
        </nav>
      )}
      </div>
    </main>
  );
}