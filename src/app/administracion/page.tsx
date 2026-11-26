import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessAdministration } from "@/lib/auth/staff-destination";
import { getActiveProfile } from "@/lib/auth/active-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logoutAdmin } from "@/app/login/actions";
import { SalesFilters } from "./sales-filters";
import { RefreshAdminSales } from "./refresh-sales";

export const metadata: Metadata = { title: "Belleezaa | Administración" };
export const instant = false;

type Period = "day" | "month" | "year";
type SalesReport = {
  period: Period;
  start_date: string;
  end_date: string;
  sales: {
    receipt_count: number;
    usd_equivalent: number;
    usd_collected: number;
    ves_collected: number;
    units_sold: number;
    bundles_sold: number;
  };
  series: { bucket_date: string; receipt_count: number; usd_equivalent: number }[];
  sellers: {
    seller_id: string;
    seller_name: string;
    seller_username: string;
    receipt_count: number;
    usd_equivalent: number;
    units_sold: number;
    bundles_sold: number;
  }[];
  products: {
    product_id: string;
    product_name: string;
    receipt_count: number;
    units_sold: number;
    bundles_sold: number;
    usd_equivalent: number;
  }[];
};

const periods: { value: Period; label: string }[] = [
  { value: "day", label: "Diario" },
  { value: "month", label: "Mensual" },
  { value: "year", label: "Anual" },
];

const usd = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const chartUsd = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ves = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reportDate = new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeZone: "UTC" });

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

function formatBucketDate(value: string, period: Period) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-VE", period === "year"
    ? { month: "short", timeZone: "UTC" }
    : { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
}

function rangeLabel(start: string, end: string) {
  const first = reportDate.format(new Date(`${start}T12:00:00Z`));
  const last = reportDate.format(new Date(`${end}T12:00:00Z`));
  return start === end ? first : `${first} - ${last}`;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function yearBounds(year: string) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export default async function AdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; fecha?: string; mes?: string; anio?: string; mesAnual?: string; desde?: string; hasta?: string }>;
}) {
  const profile = await getActiveProfile();
  if (!profile || !canAccessAdministration(profile)) redirect("/administracion/login");

  const params = await searchParams;
  const requestedPeriod = typeof params.periodo === "string" ? params.periodo : "day";
  const period = periods.some((option) => option.value === requestedPeriod) ? requestedPeriod as Period : "day";
  const today = currentCaracasDate();
  const monthValue = typeof params.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : today.slice(0, 7);
  const yearValue = typeof params.anio === "string" && /^\d{4}$/.test(params.anio) && Number(params.anio) >= 1900 && Number(params.anio) <= Number(today.slice(0, 4))
    ? params.anio
    : today.slice(0, 4);
  const monthOfYear = typeof params.mesAnual === "string" && /^(0[1-9]|1[0-2])$/.test(params.mesAnual) ? params.mesAnual : "";
  const allowedRange = period === "day"
    ? { start: today, end: today }
    : period === "month"
      ? monthBounds(monthValue)
      : monthOfYear
        ? monthBounds(`${yearValue}-${monthOfYear}`)
        : yearBounds(yearValue);
  const selectedDay = typeof params.fecha === "string" && isDate(params.fecha) ? params.fecha : today;
  const startCandidate = typeof params.desde === "string" && isDate(params.desde) ? params.desde : allowedRange.start;
  const endCandidate = typeof params.hasta === "string" && isDate(params.hasta) ? params.hasta : allowedRange.end;
  const start = period === "day" ? selectedDay : startCandidate >= allowedRange.start && startCandidate <= allowedRange.end ? startCandidate : allowedRange.start;
  const end = period === "day" ? selectedDay : endCandidate >= allowedRange.start && endCandidate <= allowedRange.end ? endCandidate : allowedRange.end;
  const validRange = start <= end;
  const supabase = await createSupabaseServerClient();
  const { data, error } = validRange
    ? await supabase.rpc("admin_sales_dashboard_range", {
      p_period: period,
      p_range_start: start,
      p_range_end: end,
    })
    : { data: null, error: null };
  if (error) console.error("No se pudo cargar el panel administrativo:", error.code, error.message);
  const report = data as unknown as SalesReport | null;
  const maxSeriesValue = Math.max(0, ...(report?.series ?? []).map((point) => point.usd_equivalent));
  const label = periods.find((option) => option.value === period)?.label ?? "Mensual";

  return (
    <main className="min-h-dvh bg-rose-50/30 px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <RefreshAdminSales />
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rose-100 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase text-rose-700">Belleezaa · Control comercial</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Administración de ventas</h1>
            <p className="mt-1 text-sm text-slate-600">{profile.full_name} · Reportes por fecha de pago</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/administracion/comisiones" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800">Comisiones</Link>
            <Link href="/inventario/panel" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50">Inventario</Link>
            <form action={logoutAdmin}>
              <button className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-white">Cerrar sesión</button>
            </form>
          </div>
        </header>

        <SalesFilters initialPeriod={period} initialStart={start} initialEnd={end} initialMonth={monthValue} initialYear={yearValue} initialYearMonth={monthOfYear} today={today} />

        {!validRange ? (
          <p role="alert" className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">La fecha Desde debe ser anterior o igual a la fecha Hasta.</p>
        ) : error || !report ? (
          <p role="alert" className="mt-5 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
            No se pudo cargar el reporte. Verifica que la migración de rangos del panel esté aplicada en Supabase y que tu perfil activo tenga rol admin.
          </p>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{label} · {rangeLabel(report.start_date, report.end_date)}</h2>
              <p className="text-sm text-slate-600">Solo ventas completadas · Fecha de pago</p>
            </div>

            <section aria-label="Resumen de ventas" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-lg border border-rose-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-600">Ventas · equivalente USD</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{usd.format(report.sales.usd_equivalent)}</p>
                <p className="mt-1 text-xs text-slate-500">Conversión guardada en cada venta</p>
              </article>
              <article className="rounded-lg border border-rose-100 bg-white p-4">
                <p className="text-sm font-medium text-slate-600">Operaciones completadas</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{report.sales.receipt_count}</p>
                <p className="mt-1 text-xs text-slate-500">Recibos POS cerrados</p>
              </article>
              <article className="rounded-lg border border-rose-100 bg-white p-4">
                <p className="text-sm font-medium text-slate-600">Prendas vendidas</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{report.sales.units_sold}</p>
                <p className="mt-1 text-xs text-slate-500">Unidades en prendas individuales</p>
              </article>
              <article className="rounded-lg border border-rose-100 bg-white p-4">
                <p className="text-sm font-medium text-slate-600">Bultos</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{report.sales.bundles_sold}</p>
                <p className="mt-1 text-xs text-slate-500">Se cuentan por separado</p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-600">Cobrado en divisas</p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">{usd.format(report.sales.usd_collected)}</p>
              </article>
              <article className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-600">Cobrado en bolívares</p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">Bs. {ves.format(report.sales.ves_collected)}</p>
              </article>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="min-w-0 border-t-2 border-rose-700 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Evolución de ventas</h2>
                    <p className="mt-1 text-sm text-slate-600">Montos en USD equivalente por {period === "year" ? "mes" : "día"}</p>
                  </div>
                  <span className="text-xs font-semibold text-rose-700">{report.series.length} periodos</span>
                </div>
                {report.series.length === 0 ? <p className="py-10 text-sm text-slate-600">Sin ventas en este periodo.</p> : (
                  <>
                    <div aria-hidden="true" className="mt-6 flex h-48 min-w-0 items-end gap-1 overflow-x-auto border-b border-slate-200 px-1">
                      {report.series.map((point) => {
                        const height = maxSeriesValue > 0 ? Math.max(3, (point.usd_equivalent / maxSeriesValue) * 100) : 0;
                        const amount = usd.format(point.usd_equivalent);
                        return <div key={point.bucket_date} className="flex h-full w-28 flex-none flex-col items-center justify-end gap-1">
                          <span title={amount} className="max-w-full truncate whitespace-nowrap text-[10px] font-medium tabular-nums text-slate-700">{chartUsd.format(point.usd_equivalent)}</span>
                          <div className="w-full max-w-8 rounded-t-sm bg-rose-700" style={{ height: `${height}%` }} />
                          <span className="pb-1 text-[10px] text-slate-600">{formatBucketDate(point.bucket_date, period)}</span>
                        </div>;
                      })}
                    </div>
                    <div className="sr-only">
                      <table>
                        <caption>Ventas por periodo, ordenadas por {period === "year" ? "mes" : "día"}</caption>
                        <thead><tr><th>Periodo</th><th>Operaciones</th><th>USD equivalente</th></tr></thead>
                        <tbody>{report.series.map((point) => <tr key={point.bucket_date}><td>{formatBucketDate(point.bucket_date, period)}</td><td>{point.receipt_count}</td><td>{usd.format(point.usd_equivalent)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className="min-w-0 border-t-2 border-emerald-700 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-1 sm:gap-2">
                  <h2 className="text-lg font-semibold">Vendedores</h2>
                  <span className="text-sm text-slate-600">Mejor en ventas: {report.sellers[0] ? <>{report.sellers[0].seller_name} · {chartUsd.format(report.sellers[0].usd_equivalent)}</> : "Sin ventas"}</span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[500px] text-left text-sm">
                    <caption className="sr-only">Ranking de vendedores en el periodo</caption>
                    <thead><tr className="border-b border-slate-200 text-xs text-slate-600"><th className="py-2 pr-2">Vendedor</th><th className="py-2 pr-2">Ventas</th><th className="py-2 pr-2">Prendas</th><th className="py-2 pr-2">Bultos</th><th className="py-2 text-right">USD</th></tr></thead>
                    <tbody>
                      {report.sellers.map((seller, index) => <tr key={seller.seller_id} className="border-b border-slate-100">
                        <td className="py-2 pr-2"><span className="mr-1 font-mono text-xs text-slate-500">{String(index + 1).padStart(2, "0")}</span><span className="font-medium">{seller.seller_name}</span><span className="block pl-6 text-xs text-slate-500">{seller.seller_username}</span></td>
                        <td className="py-2 pr-2 tabular-nums">{seller.receipt_count}</td><td className="py-2 pr-2 tabular-nums">{seller.units_sold}</td><td className="py-2 pr-2 tabular-nums">{seller.bundles_sold}</td><td className="py-2 text-right font-semibold tabular-nums">{chartUsd.format(seller.usd_equivalent)}</td>
                      </tr>)}
                    </tbody>
                  </table>
                  {!report.sellers.length && <p className="py-6 text-sm text-slate-600">Sin ventas de vendedores en este periodo.</p>}
                </div>
              </div>
            </section>

            <section className="mt-6 border-t-2 border-slate-700 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-1 sm:gap-2">
                <div><h2 className="text-lg font-semibold">Prendas y productos vendidos</h2><p className="mt-1 text-sm text-slate-600">Ordenados por aporte al equivalente en USD</p></div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[500px] text-left text-sm">
                  <caption className="sr-only">Resumen de productos vendidos en el periodo</caption>
                  <thead><tr className="border-b border-slate-200 text-xs text-slate-600"><th className="py-2 pr-2">Producto</th><th className="py-2 pr-2">Operaciones</th><th className="py-2 pr-2">Prendas</th><th className="py-2 pr-2">Bultos</th><th className="py-2 text-right">USD</th></tr></thead>
                  <tbody>{report.products.map((product) => <tr key={product.product_id} className="border-b border-slate-100"><td className="py-2 pr-2 font-medium">{product.product_name}</td><td className="py-2 pr-2 tabular-nums">{product.receipt_count}</td><td className="py-2 pr-2 tabular-nums">{product.units_sold}</td><td className="py-2 pr-2 tabular-nums">{product.bundles_sold}</td><td className="py-2 text-right font-semibold tabular-nums">{chartUsd.format(product.usd_equivalent)}</td></tr>)}</tbody>
                </table>
                {!report.products.length && <p className="py-6 text-sm text-slate-600">Sin productos vendidos en este periodo.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}