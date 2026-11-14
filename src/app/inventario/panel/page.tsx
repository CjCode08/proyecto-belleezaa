import { AlertTriangle, Boxes, ShieldCheck } from "lucide-react";
import { getInventoryDashboardData } from "@/lib/inventory/queries";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import Link from "next/link";
import { logout } from "../../login/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatExchangeRateDate } from "@/lib/inventory/exchange-rate";

export const instant = false;

function formatTime(dateIso: string) {
  const now = Date.now();
  const diff = Math.max(0, now - new Date(dateIso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `Hace ${hours} h`;
}

export default async function Home() {
  const profile = await requireInventoryProfile();
  const data = await getInventoryDashboardData();
  const rateResult = profile.role === "admin"
    ? await (await createSupabaseServerClient()).rpc("inventory_exchange_rate_context")
    : null;
  if (rateResult?.error) console.error("No se pudo consultar la tasa de cambio:", rateResult.error.code, rateResult.error.message);
  const rate = rateResult?.data?.[0];

  return (
    <div className="min-h-screen bg-rose-50/30 text-slate-800">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <section className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Inventario</p>
              <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Panel General del Almacén</h1> 
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-600">{profile.full_name}</span>
              <Link href="/inventario" className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
                Ver inventario
              </Link>
              {process.env.NODE_ENV === "development" && <Link href="/inventario/vista-previa" className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50">
                Vista previa local
              </Link>}
              {profile.role === "admin" && <Link href="/inventario/tasa" className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                Tasa de cambio
              </Link>}
              <form action={logout}>
                <button className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </section>

        {profile.role === "admin" && (rateResult?.error || !rate?.is_today) && (
          <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {rateResult?.error
              ? "No se pudo comprobar la tasa de cambio. Revisa la conexión y la configuración."
              : rate
                ? `No hay una tasa para hoy. La última tasa anterior corresponde al ${formatExchangeRateDate(rate.effective_date)}.`
                : "No hay una tasa registrada para hoy ni tasas anteriores disponibles."}
          </p>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-500">Productos activos</p>
              <Boxes className="h-5 w-5 text-rose-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{data.activeProducts}</p>
            <p className="mt-1 text-sm text-slate-500">de {data.totalProducts} registrados</p>
          </article>

          <article className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-red-500">Alertas stock crítico</p>
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-red-600">{data.criticalVariants}</p>
            <p className="mt-1 text-sm text-slate-500">variantes con riesgo</p>
          </article>

          <article className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-500">Operaciones auditadas</p>
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{data.latestMovements.length}</p>
            <p className="mt-1 text-sm text-slate-500">últimos eventos</p>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-5">
          <article className="xl:col-span-3 rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Variantes con Stock Crítico</h2>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                {data.lowStockVariants.length} resultados
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-rose-100 text-slate-500">
                    <th className="py-2 font-semibold">Producto</th>
                    <th className="py-2 font-semibold">SKU</th>
                    <th className="py-2 font-semibold">Talla</th>
                    <th className="py-2 font-semibold">Color</th>
                    <th className="py-2 font-semibold">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowStockVariants.map((variant) => (
                    <tr key={variant.id} className="border-b border-rose-50">
                      <td className="py-3 font-medium">{variant.productName}</td>
                      <td className="py-3 text-slate-600">{variant.sku ?? "—"}</td>
                      <td className="py-3">{variant.size}</td>
                      <td className="py-3">{variant.color}</td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            variant.stock <= 0
                              ? "bg-red-100 text-red-700"
                              : variant.stock <= 3
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {variant.stock}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="xl:col-span-2 rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Últimos Movimientos</h2>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Recientes</span>
            </div>
            <div className="space-y-3">
              {data.latestMovements.map((movement) => (
                <div key={movement.id} className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">
                      {movement.actionType}
                    </span>
                    <span className="text-xs text-slate-500">{formatTime(movement.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{movement.comment ?? "Sin comentario"}</p>
                  {typeof movement.quantityChange === "number" && (
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      Cambio: {movement.quantityChange > 0 ? `+${movement.quantityChange}` : movement.quantityChange}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
