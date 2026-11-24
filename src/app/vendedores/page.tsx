import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { logoutSeller } from "@/app/login/actions";
import { getActiveProfile } from "@/lib/auth/active-profile";
import { staffDestination } from "@/lib/auth/staff-destination";
import { parseCommercialProduct } from "@/lib/catalog/commercial";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OrdersPanel, type SellerOrder } from "./orders-panel";
import { SellersCart } from "./sellers-cart";

const pageSize = 24;
const lastPage = Math.floor(1000000 / pageSize) + 1;
export const metadata: Metadata = {
  title: "Belleezaa | Ventas",
  description: "Módulo interno de ventas y pedidos de Belleezaa",
};
export const instant = false;

export default async function SellersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; pagina?: string | string[]; vista?: string | string[] }> }) {
  if (process.env.SELLERS_PREVIEW_ENABLED !== "true") notFound();
  await connection();

  const profile = await getActiveProfile();
  const destination = staffDestination(profile, true);
  if (!profile || destination !== "/vendedores") redirect("/vendedores/login");

  const { q, pagina, vista } = await searchParams;
  const view = vista === "en-proceso" || vista === "completadas" || vista === "creadas" ? vista : "catalogo";
  const search = typeof q === "string" ? q.trim().slice(0, 120) : "";
  const requestedPage = typeof pagina === "string" && /^\d+$/.test(pagina) ? Number(pagina) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= lastPage ? requestedPage : 1;
  const supabase = await createSupabaseServerClient();
  const imageUrls: Record<string, string> = {};
  let products = [] as ReturnType<typeof parseCommercialProduct>[];
  let orders: SellerOrder[] = [];
  let catalogError: { code?: string } | null = null;
  let hasNextPage = false;

  if (view === "catalogo") {
    const { data, error } = await supabase.rpc("sellers_catalog_products", { p_search: search, p_offset: (page - 1) * pageSize });
    catalogError = error;
    if (error?.code === "42501") redirect("/vendedores/login");
    hasNextPage = Boolean(data && data.length > pageSize);
    products = (data ?? []).slice(0, pageSize).map(parseCommercialProduct);
  }

  if (view === "catalogo" && products.length) {
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

  if (view !== "catalogo") {
    const status = view === "en-proceso" ? "en_proceso" : view === "completadas" ? "completada" : "todas";
    const { data, error } = await supabase.rpc("sellers_list_orders", { p_status: status, p_offset: (page - 1) * pageSize });
    if (error?.code === "42501") redirect("/vendedores/login");
    hasNextPage = Boolean(data && data.length > pageSize);
    if (!error) orders = (data ?? []).slice(0, pageSize).map((order) => ({
      ...order,
      customer_name: typeof order.customer_name === "string" ? order.customer_name : null,
      customer_id: typeof order.customer_id === "string" ? order.customer_id : null,
      items: Array.isArray(order.items) ? order.items as unknown as SellerOrder["items"] : [],
    }));
    catalogError = error;
  }

  const viewHref = (tab: string) => `/vendedores?${new URLSearchParams({ vista: tab })}`;
  const pageHref = (number: number) => `/vendedores?${new URLSearchParams({ vista: view, q: search, pagina: String(number) })}`;
  const viewLinkClass = (tab: string) => `inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm font-semibold ${view === tab ? "bg-rose-600 text-white" : "border border-rose-200 text-rose-700 hover:bg-rose-50"}`;

  return (
    <main className="seller-surface min-h-dvh bg-rose-50/30 text-slate-800">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Vendedores</p>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Ventas en tienda</h1>
          <p className="mt-1 [overflow-wrap:anywhere] text-sm text-slate-600">{profile.full_name}</p>
        </div>
        <form action={logoutSeller}>
          <button type="submit" className="min-h-11 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2">
            Cerrar sesi&oacute;n
          </button>
        </form>
      </header>
      <nav aria-label="Secciones de ventas" className="mt-6 flex gap-2 overflow-x-auto rounded-2xl border border-rose-100 bg-white p-2 shadow-sm">
        <Link aria-current={view === "catalogo" ? "page" : undefined} href={viewHref("catalogo")} className={viewLinkClass("catalogo")} prefetch={false}>Cat&aacute;logo</Link>
        <Link aria-current={view === "creadas" ? "page" : undefined} href={viewHref("creadas")} className={viewLinkClass("creadas")} prefetch={false}>Creadas</Link>
        <Link aria-current={view === "en-proceso" ? "page" : undefined} href={viewHref("en-proceso")} className={viewLinkClass("en-proceso")} prefetch={false}>En proceso</Link>
        <Link aria-current={view === "completadas" ? "page" : undefined} href={viewHref("completadas")} className={viewLinkClass("completadas")} prefetch={false}>Completadas</Link>
      </nav>
      {view === "catalogo" && <Form action="/vendedores" key={search} className="mt-6 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <label htmlFor="seller-search" className="block text-sm font-medium">Nombre, categor&iacute;a o SKU</label>
          <input id="seller-search" name="q" type="search" defaultValue={search} maxLength={120} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:border-rose-500" />
        </div>
        <button type="submit" className="min-h-11 rounded-xl bg-rose-600 px-4 font-semibold text-white hover:bg-rose-700">Buscar</button>
      </Form>}
      {catalogError && <p role="alert" className="mt-4 text-sm">No se pudo cargar la informacion. <Link href={view === "catalogo" ? pageHref(page) : viewHref(view)} className="underline" prefetch={false}>Reintentar</Link></p>}
      {view === "catalogo" && <SellersCart key={profile.id} sellerId={profile.id} products={products} imageUrls={imageUrls} catalogUnavailable={Boolean(catalogError)} />}
      {view !== "catalogo" && !catalogError && <OrdersPanel orders={orders} />}
      {!catalogError && (page > 1 || (hasNextPage && page < lastPage)) && (
        <nav aria-label="Paginacion de resultados" className="mt-5 flex flex-wrap items-center gap-4 text-sm">
          {page > 1 && <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center underline" prefetch={false}>Anterior</Link>}
          <span>P&aacute;gina {page}</span>
          {hasNextPage && page < lastPage && <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center underline" prefetch={false}>Siguiente</Link>}
        </nav>
      )}
      </div>
    </main>
  );
}