import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessAdministration } from "@/lib/auth/staff-destination";
import { getActiveProfile } from "@/lib/auth/active-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Belleezaa | Comisiones procesadas" };
export const instant = false;

type ProcessedCommissions = {
  total_count: number;
  batches: {
    id: string;
    seller_name: string;
    seller_username: string;
    range_start: string;
    range_end: string;
    commission_percent: number;
    sales_count: number;
    total_sales_usd: number;
    commission_usd: number;
    processed_by_name: string;
    processed_at: string;
  }[];
};

const usd = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });
const pageSize = 25;

function pageHref(page: number) {
  return page > 1 ? `/administracion/comisiones/procesadas?pagina=${page}` : "/administracion/comisiones/procesadas";
}

export default async function ProcessedCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const profile = await getActiveProfile();
  if (!profile || !canAccessAdministration(profile)) redirect("/administracion/login");

  const params = await searchParams;
  const requestedPage = Number(params.pagina ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 40001 ? requestedPage : 1;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_commission_processed", { p_offset: (page - 1) * pageSize });
  if (error) console.error("No se pudo cargar el historial de comisiones:", error.code, error.message);
  const report = data as unknown as ProcessedCommissions | null;

  return (
    <main className="min-h-dvh bg-rose-50/30 px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rose-100 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase text-rose-700">Belleezaa · Administración</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Comisiones procesadas</h1>
            <p className="mt-1 text-sm text-slate-600">Historial de cálculos registrados · sin pagos asociados</p>
          </div>
          <Link href="/administracion/comisiones" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50">Volver a pendientes</Link>
        </header>

        {error || !report ? (
          <p role="alert" className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">No se pudo cargar el historial. Verifica que la migración de procesamiento de comisiones esté aplicada y que tu perfil activo tenga rol admin.</p>
        ) : (
          <>
            <section aria-label="Historial de comisiones" className="mt-5 overflow-hidden rounded-lg border border-rose-100 bg-white">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rose-100 px-4 py-4 sm:px-5">
                <h2 className="text-lg font-semibold">Cálculos registrados</h2>
                <p className="text-sm text-slate-600">{report.total_count} comisiones</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px] text-left text-sm">
                  <caption className="sr-only">Comisiones procesadas con rango, ventas y monto de comisión</caption>
                  <thead className="bg-rose-50 text-xs font-semibold text-slate-700">
                    <tr>
                      <th scope="col" className="px-4 py-3">Vendedor</th>
                      <th scope="col" className="px-4 py-3">Rango calculado</th>
                      <th scope="col" className="px-4 py-3 text-right">Ventas</th>
                      <th scope="col" className="px-4 py-3 text-right">Total ventas · USD</th>
                      <th scope="col" className="px-4 py-3 text-right">Comisión · USD</th>
                      <th scope="col" className="px-4 py-3">Procesada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.batches.map((batch) => <tr key={batch.id} className="border-t border-slate-100">
                      <th scope="row" className="px-4 py-4 font-medium">
                        {batch.seller_name}
                        <span className="mt-1 block font-mono text-xs font-normal text-slate-500">{batch.seller_username}</span>
                      </th>
                      <td className="px-4 py-4">{dateFormat.format(new Date(`${batch.range_start}T12:00:00Z`))} - {dateFormat.format(new Date(`${batch.range_end}T12:00:00Z`))}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{batch.sales_count}</td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums">{usd.format(batch.total_sales_usd)}</td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums text-rose-800">{usd.format(batch.commission_usd)}<span className="mt-1 block text-xs font-normal text-slate-500">{batch.commission_percent}%</span></td>
                      <td className="px-4 py-4"><time dateTime={batch.processed_at}>{dateTimeFormat.format(new Date(batch.processed_at))}</time><span className="mt-1 block text-xs text-slate-500">{batch.processed_by_name}</span></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              {!report.batches.length && <p className="p-6 text-sm text-slate-600">Todavía no hay comisiones procesadas.</p>}
            </section>

            <nav aria-label="Páginas de comisiones procesadas" className="mt-5 flex items-center justify-between gap-4 text-sm">
              {page > 1 ? <Link className="font-semibold text-rose-700" href={pageHref(page - 1)}>Anterior</Link> : <span />}
              <span className="text-slate-600">Página {page}</span>
              {page * pageSize < report.total_count ? <Link className="font-semibold text-rose-700" href={pageHref(page + 1)}>Siguiente</Link> : <span />}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}