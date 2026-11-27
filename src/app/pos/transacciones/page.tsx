import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { ReceiptText, Search } from "lucide-react";
import { logoutPos } from "@/app/login/actions";
import { requirePosProfile } from "@/lib/auth/pos-access";
import { posMethods, posMoney, type PosCurrency } from "@/lib/pos/order";
import { parsePosFilters } from "@/lib/pos/filters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DateCurrencyFilters } from "../date-currency-filters";
import { PosNavigation } from "../navigation";

export const metadata: Metadata = { title: "Belleezaa | Transacciones" };
export const instant = false;
const pageSize = 24;
const dateFormat = new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeZone: "UTC" });
const bolivarAmountFormat = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function transactionsHref(from: string, to: string, currency: string, page: number) {
  const params = new URLSearchParams();
  if (from) params.set("desde", from);
  if (to) params.set("hasta", to);
  if (currency) params.set("moneda", currency);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/pos/transacciones?${query}` : "/pos/transacciones";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string | string[]; hasta?: string | string[]; moneda?: string | string[]; pagina?: string | string[] }>;
}) {
  await connection();
  const profile = await requirePosProfile();
  const params = await searchParams;
  const { from, to, currency: selectedCurrency, valid: validFilters } = parsePosFilters(params);
  const requestedPage = typeof params.pagina === "string" && /^\d+$/.test(params.pagina) ? Number(params.pagina) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 41667 ? requestedPage : 1;
  const client = await createSupabaseServerClient("pos");
  const result = validFilters
    ? await client.rpc("pos_list_money_movements_filtered", { p_from: from || null, p_to: to || null, p_currency: selectedCurrency || null, p_offset: (page - 1) * pageSize })
    : null;
  if (result?.error) console.error("No se pudieron consultar las transacciones:", result.error.code, result.error.message);
  const transactions = result?.data ?? [];
  const missingCashierMigration = transactions.some((transaction) => !("cashier_username" in transaction));
  const errorMessage = result?.error && ["PGRST202", "42883"].includes(result.error.code)
    ? "Falta aplicar la migración de filtros de Caja en Supabase."
    : result?.error?.code === "42501"
      ? "No tienes permiso para consultar las transacciones de Caja."
      : "No se pudieron cargar las transacciones. Revisa la conexión y vuelve a intentarlo.";
  const receiptQuery = new URLSearchParams({ origen: "transacciones" });
  if (from) receiptQuery.set("desde", from);
  if (to) receiptQuery.set("hasta", to);
  if (selectedCurrency) receiptQuery.set("moneda", selectedCurrency);
  if (page > 1) receiptQuery.set("pagina", String(page));

  return (
    <main className="min-h-dvh bg-rose-50/30 px-4 py-6 text-slate-800 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rose-100 pb-5">
          <div className="flex items-center gap-3"><Image src="/faviconBelleezaa.png" alt="Belleezaa" width={36} height={36} /><div><h1 className="text-2xl font-semibold">Punto de venta</h1><p className="text-sm text-slate-600">{profile.full_name}</p></div></div>
          <form action={logoutPos}><button className="min-h-11 rounded-xl border border-rose-200 px-4 text-sm text-rose-700 hover:bg-rose-50">Cerrar sesión</button></form>
        </header>

        <div className="mt-5"><PosNavigation active="transactions" /></div>
        <div className="mt-6"><h2 className="text-xl font-semibold">Transacciones</h2><p className="mt-1 text-sm text-slate-600">Cobros registrados en Caja</p></div>

        <form action="/pos/transacciones" method="get" className="my-5 flex flex-wrap items-end gap-3">
          <DateCurrencyFilters from={from} to={to} currency={selectedCurrency} />
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"><Search size={17} aria-hidden="true" /> Filtrar</button>
          {(from || to || selectedCurrency) && <Link href="/pos/transacciones" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50">Limpiar</Link>}
        </form>

        {missingCashierMigration && <p role="alert" className="mb-4 text-sm text-red-700">Falta aplicar la migración de usuario de Caja en Supabase para identificar los cobros.</p>}
        {!validFilters ? <p role="alert" className="text-sm text-red-700">Revisa las fechas y la moneda: Desde debe ser anterior o igual a Hasta.</p>
          : result?.error ? <p role="alert" className="text-sm text-red-700">{errorMessage} <Link href={transactionsHref(from, to, selectedCurrency, page)} prefetch={false} className="font-semibold underline">Reintentar</Link></p>
            : transactions.length === 0 ? <p className="border-t border-rose-100 py-6 text-sm text-slate-600">No hay transacciones para las fechas seleccionadas.</p>
              : <div role="region" aria-label="Tabla de transacciones" tabIndex={0} className="overflow-x-auto rounded-lg border border-rose-100 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600">
                <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                  <caption className="sr-only">Ingresos y salidas por vuelto registrados en Caja</caption>
                  <thead className="bg-rose-50 text-xs font-semibold text-slate-700">
                    <tr>
                      <th scope="col" className="border-b border-r border-rose-100 px-3 py-3">Fecha de pago</th>
                      <th scope="col" className="border-b border-r border-rose-100 px-3 py-3">Movimiento</th>
                      <th scope="col" className="border-b border-r border-rose-100 px-3 py-3">Usuario de caja</th>
                      <th scope="col" className="border-b border-r border-rose-100 px-3 py-3">Modalidad</th>
                      <th scope="col" className="border-b border-r border-rose-100 px-3 py-3">Forma de pago</th>
                      <th scope="col" className="border-b border-r border-rose-100 px-3 py-3 text-right">Monto</th>
                      <th scope="col" className="border-b border-r border-rose-100 px-3 py-3">Referencia</th>
                      <th scope="col" className="border-b border-r border-rose-100 px-3 py-3">Recibo</th>
                      <th scope="col" className="border-b border-rose-100 px-3 py-3">Comentarios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, pageSize).map((transaction) => {
                      const currency: PosCurrency = transaction.currency === "bolivares" ? "bolivares" : "divisas";
                      const method = posMethods[currency].find((option) => option.value === transaction.method)?.label ?? transaction.method;
                      return <tr key={`${transaction.receipt_id}:${transaction.movement_type}`}>
                        <td className="border-b border-r border-rose-100 px-3 py-3 whitespace-nowrap"><time dateTime={transaction.paid_on}>{dateFormat.format(new Date(`${transaction.paid_on}T12:00:00Z`))}</time></td>
                        <td className="border-b border-r border-rose-100 px-3 py-3 font-medium">{transaction.movement_type === "vuelto" ? "Salida · vuelto" : "Ingreso"}</td>
                        <td className="border-b border-r border-rose-100 px-3 py-3">{transaction.cashier_name || "Nombre no disponible"}<span className="block text-xs text-slate-600">{transaction.cashier_username || "Usuario no disponible"}</span></td>
                        <td className="border-b border-r border-rose-100 px-3 py-3">{currency === "bolivares" ? "Bolívares" : "Divisas"}</td>
                        <td className="border-b border-r border-rose-100 px-3 py-3">{method}</td>
                        <td className="border-b border-r border-rose-100 px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{transaction.amount === null ? "No registrado" : `${transaction.movement_type === "vuelto" ? "-" : "+"}${currency === "bolivares" ? `Bs. ${bolivarAmountFormat.format(Number(transaction.amount))}` : posMoney(Number(transaction.amount), currency)}`}</td>
                        <td className="max-w-56 border-b border-r border-rose-100 px-3 py-3 [overflow-wrap:anywhere]">{transaction.reference || "Sin referencia"}</td>
                        <td className="border-b border-r border-rose-100 px-3 py-3"><Link href={`/pos/${transaction.order_id}/recibo?${receiptQuery.toString()}`} prefetch={false} className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap font-semibold text-rose-700 underline hover:text-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"><ReceiptText size={17} aria-hidden="true" /> {transaction.receipt_id.slice(0, 8).toUpperCase()}</Link></td>
                        <td className="max-w-72 border-b border-rose-100 px-3 py-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{transaction.comment || "Sin comentarios"}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>}

        {validFilters && !result?.error && (page > 1 || transactions.length > pageSize) && <nav aria-label="Páginas de transacciones" className="mt-5 flex flex-wrap items-center gap-4 text-sm">
          {page > 1 && <Link href={transactionsHref(from, to, selectedCurrency, page - 1)} prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-rose-700 underline">Anterior</Link>}
          <span>Página {page}</span>
          {transactions.length > pageSize && page < 41667 && <Link href={transactionsHref(from, to, selectedCurrency, page + 1)} prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-rose-700 underline">Siguiente</Link>}
        </nav>}
      </div>
    </main>
  );
}