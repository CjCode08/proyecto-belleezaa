import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessAdministration } from "@/lib/auth/staff-destination";
import { getActiveProfile } from "@/lib/auth/active-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProcessCommissionForm } from "./process-commission-form";

export const metadata: Metadata = { title: "Belleezaa | Comisiones" };
export const instant = false;

type PendingSeller = {
    seller_id: string;
    seller_name: string;
    seller_username: string;
    sales_count: number;
    total_sales_usd: number;
    bolivares_sales_usd: number;
    usd_sales: number;
    commission_usd: number;
};

type PendingCommissions = {
  commission_percent: number;
  sellers: PendingSeller[];
};

const usd = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeZone: "UTC" });

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function currentCaracasDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentRange() {
  const today = currentCaracasDate();
  const date = new Date(`${today}T12:00:00Z`);
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  return {
    start: weekStart.toISOString().slice(0, 10),
    end: weekEnd.toISOString().slice(0, 10),
  };
}

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; resultado?: string }>;
}) {
  const profile = await getActiveProfile();
  if (!profile || !canAccessAdministration(profile)) redirect("/administracion/login");

  const params = await searchParams;
  const defaults = currentRange();
  const start = typeof params.desde === "string" && isDate(params.desde) ? params.desde : defaults.start;
  const end = typeof params.hasta === "string" && isDate(params.hasta) ? params.hasta : defaults.end;
  const validRange = start <= end;
  const supabase = await createSupabaseServerClient();
  const { data, error } = validRange
    ? await supabase.rpc("admin_commission_pending", { p_range_start: start, p_range_end: end })
    : { data: null, error: null };
  if (error) console.error("No se pudo cargar el cálculo de comisiones:", error.code, error.message);
  const response = data as unknown as { commission_percent?: unknown; sellers?: unknown } | null;
  const report = response && !Array.isArray(response) && typeof response.commission_percent === "number" && Array.isArray(response.sellers)
    ? response as PendingCommissions
    : null;
  const sellers = report?.sellers ?? [];
  const rangeLabel = validRange
    ? `${dateFormat.format(new Date(`${start}T12:00:00Z`))} - ${dateFormat.format(new Date(`${end}T12:00:00Z`))}`
    : "Rango inválido";
  const processedUrl = `/administracion/comisiones/procesadas?${new URLSearchParams({ desde: start, hasta: end }).toString()}`;

  return (
    <main className="min-h-dvh bg-rose-50/30 px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rose-100 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase text-rose-700">Belleezaa · Administración</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Comisiones</h1>
            <p className="mt-1 text-sm text-slate-600">{report?.commission_percent ?? 10}% de las ventas completadas en USD equivalente</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={processedUrl} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50">Comisiones procesadas</Link>
            <Link href="/administracion" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50">Volver a Administración</Link>
          </div>
        </header>

        <form action="/administracion/comisiones" method="get" className="mt-5 grid gap-3 border-b border-rose-100 pb-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
          <label htmlFor="commission-start" className="text-sm font-semibold">Desde
            <input id="commission-start" name="desde" type="date" required defaultValue={start} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200" />
          </label>
          <label htmlFor="commission-end" className="text-sm font-semibold">Hasta
            <input id="commission-end" name="hasta" type="date" required defaultValue={end} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-rose-700 px-5 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">Consultar rango</button>
          <Link href="/administracion/comisiones" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50">Rango actual</Link>
        </form>

        {!validRange ? (
          <p role="alert" className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">La fecha inicial debe ser anterior o igual a la fecha final.</p>
        ) : error || !report ? (
          <p role="alert" className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
            No se pudo cargar el cálculo. Verifica que la migración de tasa del 10% esté aplicada y que tu perfil activo tenga rol admin.
          </p>
        ) : (
          <>
            <section aria-label="Rango de comisiones" className="mt-5 flex flex-wrap items-end justify-between gap-4 border-l-4 border-rose-700 bg-white p-4 sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-600">Ventas completadas · rango seleccionado</p>
                <h2 className="mt-1 text-xl font-semibold">{rangeLabel}</h2>
              </div>
              <p className="text-sm font-semibold text-rose-800">Comisión: {report.commission_percent}%</p>
            </section>

            <section className="mt-5 overflow-hidden rounded-lg border border-rose-100 bg-white">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rose-100 px-4 py-4 sm:px-5">
                <h2 className="text-lg font-semibold">Pendientes de procesar</h2>
                <p className="text-sm text-slate-600">Ventas en bolívares se muestran por su equivalente USD guardado</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <caption className="sr-only">Ventas pendientes de comisión por vendedor del {start} al {end}</caption>
                  <thead className="bg-rose-50 text-xs font-semibold text-slate-700">
                    <tr>
                      <th scope="col" className="px-4 py-3">Vendedor</th>
                      <th scope="col" className="px-4 py-3 text-right">Ventas</th>
                      <th scope="col" className="px-4 py-3 text-right">Total ventas · USD eq.</th>
                      <th scope="col" className="px-4 py-3 text-right">Cobradas en Bs. · USD eq.</th>
                      <th scope="col" className="px-4 py-3 text-right">Cobradas en USD</th>
                      <th scope="col" className="px-4 py-3 text-right">Comisión · USD</th>
                      <th scope="col" className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((seller) => <tr key={seller.seller_id} className="border-t border-slate-100">
                      <th scope="row" className="px-4 py-4 font-medium">
                        {seller.seller_name}
                        <span className="mt-1 block font-mono text-xs font-normal text-slate-500">{seller.seller_username}</span>
                      </th>
                      <td className="px-4 py-4 text-right tabular-nums">{seller.sales_count}</td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums">{usd.format(seller.total_sales_usd)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{usd.format(seller.bolivares_sales_usd)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{usd.format(seller.usd_sales)}</td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums text-rose-800">{usd.format(seller.commission_usd)}</td>
                      <td className="px-4 py-4 text-right"><ProcessCommissionForm sellerId={seller.seller_id} sellerName={seller.seller_name} start={start} end={end} /></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              {!sellers.length && <p className="p-6 text-sm text-slate-600">No hay ventas pendientes de comisión en este rango. Las ventas ya procesadas se consultan en Comisiones procesadas.</p>}
              {params.resultado === "procesada" && <p role="status" className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Comisión procesada. Las ventas de ese vendedor ya no aparecen como pendientes en este rango.</p>}
              {params.resultado === "error" && <p role="alert" className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">No se pudo procesar la comisión. Puede que las ventas ya hayan sido procesadas; revisa Comisiones procesadas.</p>}
              <p className="border-t border-rose-100 px-4 py-3 text-xs text-slate-600 sm:px-5">Procesar registra el cálculo informativo; no ejecuta ni confirma un pago.</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}