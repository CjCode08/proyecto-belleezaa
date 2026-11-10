import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatExchangeRateDate } from "@/lib/inventory/exchange-rate";
import { secondaryButtonClass } from "../ui";
import { ExchangeRateForm } from "./form";
import { RateActions } from "./rate-actions";

export const instant = false;

export default async function ExchangeRatePage({ searchParams }: { searchParams: Promise<{ pagina?: string; movimientos?: string }> }) {
  const profile = await requireInventoryProfile();
  if (profile.role !== "admin") redirect("/inventario/panel");
  const params = await searchParams;
  const requestedPage = Number(params.pagina ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 50001 ? requestedPage : 1;
  const requestedMovementsPage = Number(params.movimientos ?? "1");
  const movementsPage = Number.isSafeInteger(requestedMovementsPage) && requestedMovementsPage > 0 && requestedMovementsPage <= 50001 ? requestedMovementsPage : 1;
  const pageHref = (ratePage: number, movementPage: number) => `/inventario/tasa?pagina=${ratePage}&movimientos=${movementPage}`;

  const supabase = await createSupabaseServerClient();
  const [context, history, movements] = await Promise.all([
    supabase.rpc("inventory_exchange_rate_context"),
    supabase.rpc("inventory_exchange_rate_history", { p_offset: (page - 1) * 20 }),
    supabase.rpc("inventory_exchange_rate_movements", { p_offset: (movementsPage - 1) * 20 }),
  ]);
  if (context.error) throw new Error("No se pudo consultar la tasa de cambio.", { cause: context.error });
  if (history.error) throw new Error("No se pudo consultar el historial de tasas.", { cause: history.error });
  if (movements.error) throw new Error("No se pudieron consultar los movimientos de tasas.", { cause: movements.error });
  if (!context.data || !history.data || !movements.data) throw new Error("La consulta de tasas no devolvió resultados válidos.");
  const current = context.data[0];
  const total = history.data[0]?.total_count ?? 0;

  return (
    <main className="min-h-screen bg-rose-50/30 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-7xl">
        <Link href="/inventario/panel" className={secondaryButtonClass}>← Volver al panel</Link>
        <header className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Belleza · Inventario</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Tasa de cambio USD/VES</h1>
          <p className="mt-1 text-sm text-slate-600">Consulta y registra las tasas de cambio de la tienda.</p>
        </header>

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
          <section aria-labelledby="current-rate-heading" className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 id="current-rate-heading" className="text-sm font-semibold uppercase tracking-wide text-rose-700">Tasa del día</h2>
            {current?.is_today ? (
              <>
                <p className="mt-4 text-sm text-slate-600">1 USD equivale a</p>
                <p className="mt-1 break-words text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                  {current.rate.replace(".", ",")} <span className="text-2xl text-rose-600">Bs.</span>
                </p>
                <p className="mt-4 text-sm font-medium text-slate-700">Fecha: {formatExchangeRateDate(current.effective_date)}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Registrada por {current.actor_name} el {new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(current.updated_at))}.
                </p>
              </>
            ) : (
              <>
                <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                  No hay una tasa registrada para hoy. Los pedidos requerirán una tasa del día.
                </p>
                {current ? (
                  <div className="mt-4">
                    <p className="text-sm text-slate-600">Última tasa anterior · {formatExchangeRateDate(current.effective_date)}</p>
                    <p className="mt-1 break-words text-2xl font-semibold text-slate-800">1 USD = {current.rate.replace(".", ",")} Bs.</p>
                    <p className="mt-1 text-xs text-slate-500">Solo como referencia; no es la tasa de hoy.</p>
                  </div>
                ) : <p className="mt-4 text-sm text-slate-600">No hay tasas anteriores registradas por el administrador.</p>}
              </>
            )}
            <p className="mt-5 border-t border-rose-50 pt-4 text-sm text-slate-600">
              Se usa la tasa del día actual en Caracas. Puedes registrar tasas futuras.
            </p>
          </section>

          <section aria-labelledby="register-rate-heading" className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 id="register-rate-heading" className="text-lg font-semibold">Registrar tasa</h2>
            <p className="mt-1 text-sm text-slate-600">Indica la fecha a la que corresponde la tasa.</p>
            <div className="mt-5"><ExchangeRateForm /></div>
          </section>
        </div>

        <section aria-labelledby="rate-history-heading" className="mt-6 rounded-2xl border border-rose-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="rate-history-heading" className="text-lg font-semibold">Tasas registradas y movimientos</h2>
          <p className="mt-1 text-sm text-slate-600">Fecha, tasa y comentario de cada registro.</p>
          {history.data.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">{page === 1 ? "Aún no hay tasas registradas." : "No hay tasas en esta página."}</p>
          ) : (
            <ul className="mt-4 divide-y divide-rose-100">
              {history.data.map((item) => (
                <li key={item.rate_id} className="py-4 text-sm">
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div><dt className="text-slate-500">Fecha</dt><dd className="mt-1 font-semibold text-slate-900">{formatExchangeRateDate(item.effective_date)}</dd></div>
                    <div><dt className="text-slate-500">Tasa</dt><dd className="mt-1 break-words font-semibold text-rose-700">1 USD = {item.rate.replace(".", ",")} Bs.</dd></div>
                    <div><dt className="text-slate-500">Comentario</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">{item.comment || "Sin comentario"}</dd></div>
                  </dl>
                  <RateActions record={item} />
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Páginas del histórico de tasas" className="mt-5 flex items-center justify-between gap-4 text-sm">
            {page > 1 ? <Link className="font-semibold text-rose-700" href={pageHref(page - 1, movementsPage)}>Anterior</Link> : <span />}
            <span>Página {page}</span>
            {page * 20 < total ? <Link className="font-semibold text-rose-700" href={pageHref(page + 1, movementsPage)}>Siguiente</Link> : <span />}
          </nav>
        </section>
        <section aria-labelledby="rate-movements-heading" className="mt-6 rounded-2xl border border-rose-100 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="rate-movements-heading" className="text-lg font-semibold">Auditoría de tasas</h2>
          <p className="mt-1 text-sm text-slate-600">Creaciones, modificaciones y eliminaciones, incluso de tasas retiradas.</p>
          {movements.data.length === 0 ? <p className="mt-3 text-sm text-slate-600">No hay movimientos en esta página.</p> : (
            <ul className="mt-4 divide-y divide-rose-100">
              {movements.data.map((movement) => (
                <li key={movement.id} className="space-y-1 py-4 text-sm">
                  <p className="font-semibold">{movement.action} · {movement.actor_name}</p>
                  <p className="text-slate-600">{new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(movement.occurred_at))}</p>
                  {movement.old_date && <p>Anterior: {formatExchangeRateDate(movement.old_date)} · {movement.old_rate?.replace(".", ",")} Bs.</p>}
                  {movement.old_comment && <p className="whitespace-pre-wrap break-words text-slate-600">Comentario anterior: {movement.old_comment}</p>}
                  {movement.new_date && <p>Registro: {formatExchangeRateDate(movement.new_date)} · {movement.new_rate?.replace(".", ",")} Bs.</p>}
                  <p className="whitespace-pre-wrap break-words text-slate-600">Comentario: {movement.reason}</p>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Páginas de auditoría de tasas" className="mt-5 flex items-center justify-between gap-4 text-sm">
            {movementsPage > 1 ? <Link className="font-semibold text-rose-700" href={pageHref(page, movementsPage - 1)}>Anterior</Link> : <span />}
            <span>Página {movementsPage}</span>
            {movementsPage * 20 < (movements.data[0]?.total_count ?? 0) ? <Link className="font-semibold text-rose-700" href={pageHref(page, movementsPage + 1)}>Siguiente</Link> : <span />}
          </nav>
        </section>
      </div>
    </main>
  );
}
