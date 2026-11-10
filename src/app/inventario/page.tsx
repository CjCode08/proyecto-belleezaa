import Link from "next/link";
import Image from "next/image";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSignedInventoryImageUrls } from "@/lib/inventory/images";
import { inventoryPageHref, inventoryProductsQuery, inventorySearchError, maxInventorySearchLength } from "@/lib/inventory/search";
import { ProductActions } from "./product-actions";
import { logout } from "../login/actions";
import { productStatusClass } from "./ui";
import { audiences } from "@/lib/inventory/product-fields";

export const instant = false;

const pageSize = 25;

function price(value: number | null) {
  return value === null ? "Sin definir" : new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ pagina?: string; buscar?: string; editado?: string; eliminado?: string; limpieza?: string; estado?: string }> }) {
  const profile = await requireInventoryProfile();
  const params = await searchParams;
  const search = typeof params.buscar === "string" ? params.buscar.trim() : "";
  const searchError = inventorySearchError(search);
  const requestedPage = Number(params.pagina ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000
    ? requestedPage
    : 1;
  const supabase = await createSupabaseServerClient();
  const { data: products, error, count } = await inventoryProductsQuery(supabase, searchError ? "" : search, page, pageSize);

  if (error) throw new Error("No se pudo consultar el catálogo.", { cause: error });
  if (!products || count === null) throw new Error("El catálogo no devolvió resultados válidos.");
  const imageUrls = await getSignedInventoryImageUrls(
    supabase,
    products.flatMap((product) => product.product_images.map((image) => image.image_url)),
  );
  const notice = params.eliminado === "1"
    ? "Producto eliminado; la auditoría se conservó."
    : params.limpieza === "pendiente"
      ? "El cambio se guardó, pero algunos archivos de imagen requieren limpieza."
      : params.editado === "1"
        ? "Producto actualizado."
        : params.estado === "inhabilitado"
          ? "Producto inhabilitado."
          : params.estado === "activo"
            ? "Producto reactivado."
            : null;

  return (
    <main className="min-h-screen bg-rose-50/30 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Belleza · Inventario</p>
            <h1 className="mt-1 text-2xl font-semibold">Catálogo de productos</h1>
            <p className="mt-1 text-sm text-slate-500">
              {search && !searchError ? `${count} productos encontrados` : `${count} productos registrados`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/inventario/panel" className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
              Volver al panel
            </Link>
            <Link href="/inventario/auditoria" className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
              Ver auditoría
            </Link>
            <Link href="/inventario/nuevo" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
              Nuevo producto
            </Link>
            <form action={logout}>
              <button className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>

        <form action="/inventario" method="get" role="search" className="mt-6 rounded-2xl border border-rose-100 bg-white p-4">
          <label htmlFor="inventory-search" className="block text-sm font-medium">Buscar productos</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input id="inventory-search" name="buscar" type="search" defaultValue={search}
              maxLength={maxInventorySearchLength} placeholder="Nombre, categoría o SKU"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900" />
            <button type="submit" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Buscar</button>
            {search && <Link href="/inventario" className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Limpiar</Link>}
          </div>
          {searchError && <p role="alert" className="mt-2 text-sm text-red-700">{searchError} Se muestra el inventario sin filtrar.</p>}
        </form>

        {notice && <p role="status" className="mt-5 rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-800">{notice}</p>}
        {products.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-rose-100 bg-white p-6 text-sm text-slate-600">
            {page !== 1 ? "No hay productos en esta página." : search && !searchError ? "No se encontraron productos para esta búsqueda." : "Aún no hay productos registrados."}
          </p>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {products.map((product) => (
              <article key={product.id} className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
                {product.product_images.length > 0 && (
                  <div className="mb-4 flex gap-2 overflow-x-auto">
                    {product.product_images.map((image) => {
                      const src = imageUrls.get(image.image_url);
                      if (!src) throw new Error("No se pudo encontrar la URL firmada de una imagen.");
                      return <Image key={image.id} src={src} alt={`Imagen de ${product.name}`} width={112} height={112}
                        unoptimized className="h-28 w-28 rounded-xl object-cover" />;
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{product.name}</h2>
                    <p className="text-sm text-slate-500">{product.category || "Sin categoría"}</p>
                    <p className="mt-1 text-sm text-slate-500">{audiences.filter((item) => product.audiences.includes(item.value)).map((item) => item.label).join(" · ") || "Sin clasificar"}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${productStatusClass(product.status)}`}>
                    {product.status ?? "Sin estado"}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-slate-500">Unitario</dt><dd className="font-semibold">{price(product.unit_price)}</dd></div>
                  <div><dt className="text-slate-500">3 a 11</dt><dd className="font-semibold">{price(product.promo_price)}</dd></div>
                  <div><dt className="text-slate-500">12 o más</dt><dd className="font-semibold">{price(product.wholesale_price)}</dd></div>
                </dl>
                <h3 className="mt-5 text-sm font-semibold">Variantes</h3>
                {product.product_variants.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Sin variantes registradas.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-rose-50">
                    {product.product_variants.map((variant) => (
                      <li key={variant.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                        <span>{variant.size} · {variant.color} <span className="text-slate-500">({variant.sku || "Sin SKU"})</span></span>
                        <span className="font-semibold">{variant.stock} unidades</span>
                      </li>
                    ))}
                  </ul>
                )}
                <ProductActions productId={product.id} status={product.status ?? "activo"} canDelete={profile.role === "admin"} />
              </article>
            ))}
          </div>
        )}

        <nav aria-label="Páginas del inventario" className="mt-6 flex items-center justify-between gap-4 text-sm">
          {page > 1 ? <Link className="font-semibold text-rose-700" href={inventoryPageHref(page - 1, searchError ? "" : search)}>Anterior</Link> : <span />}
          <span className="text-slate-600">Página {page}</span>
          {page * pageSize < count ? <Link className="font-semibold text-rose-700" href={inventoryPageHref(page + 1, searchError ? "" : search)}>Siguiente</Link> : <span />}
        </nav>
      </div>
    </main>
  );
}
