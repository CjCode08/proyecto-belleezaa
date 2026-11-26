import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import Image from "next/image";
import { connection } from "next/server";
import { ClipboardList, ReceiptText } from "lucide-react";
import { requirePosProfile } from "@/lib/auth/pos-access";
import { logoutPos } from "@/app/login/actions";
import { parsePosAvailability, parsePosOrder, posMoney, posReadError, posReservationExpired, type PosSummary } from "@/lib/pos/order";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PosEditor } from "./pos-editor";
import { ExpiredOrderActions } from "./expired-order-actions";

export const metadata: Metadata = { title: "Belleezaa | Caja" };
export const instant = false;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PosPage({ searchParams }: { searchParams: Promise<{ orden?: string; q?: string; pagina?: string; vista?: string }> }) {
  await connection();
  const profile = await requirePosProfile();
  const params = await searchParams;
  const orderId = typeof params.orden === "string" && uuid.test(params.orden) ? params.orden : null;
  const completed = params.vista === "recibos";
  const search = typeof params.q === "string" ? params.q.trim().slice(0,120) : "";
  const requested = Number(params.pagina ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 && requested <= 41667 ? requested : 1;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("pos_list_orders", { p_completed: completed, p_search: search, p_offset: (page-1)*24 });
  const summaries = Array.isArray(data) ? data as unknown as PosSummary[] : [];
  const detail = orderId ? await client.rpc("pos_get_order", { p_order: orderId }) : null;
  const selected = detail?.data ? parsePosOrder(detail.data) : null;
  const availabilityResult = selected?.status === "en_proceso"
    ? await client.rpc("pos_order_availability", { p_order: selected.id })
    : null;
  const availability = parsePosAvailability(availabilityResult?.data);
  const readError = error ?? detail?.error ?? availabilityResult?.error;
  if (readError) console.error("Consulta POS rechazada", JSON.stringify({ operation: error ? "pos_list_orders" : "pos_get_order", code: readError.code, message: readError.message }));
  const serverTime = new Date().toISOString();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const pageHref = (number: number) => `/pos?${new URLSearchParams({ q: search, pagina: String(number), vista: completed ? "recibos" : "cola" })}`;
  const returnHref = pageHref(page);
  const navigationClass = (active: boolean) => `inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-center text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 motion-reduce:transition-none motion-reduce:active:scale-100 ${active ? "bg-rose-600 text-white shadow-sm hover:bg-rose-700" : "text-slate-600 hover:bg-rose-50 hover:text-rose-700"}`;
  return (
    <main className="min-h-dvh bg-rose-50/30 px-4 py-6 text-slate-800 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-rose-100 pb-5">
          <div className="flex items-center gap-3"><Image src="/faviconBelleezaa.png" alt="Belleezaa" width={36} height={36} /><div><h1 className="text-2xl font-semibold">Punto de venta</h1><p className="text-sm text-slate-600">{profile.full_name}</p></div></div>
          <form action={logoutPos}><button className="min-h-11 rounded-xl border border-rose-200 px-4 text-sm text-rose-700 hover:bg-rose-50">Cerrar sesion</button></form>
        </header>
        <nav aria-label="Vistas de caja" className="mt-5 grid w-full grid-cols-2 gap-1 rounded-lg border border-rose-100 bg-white p-1 sm:inline-grid sm:w-auto">
          <Link href="/pos" prefetch={false} aria-current={!completed ? "page" : undefined} className={navigationClass(!completed)}><ClipboardList size={18} className="shrink-0" aria-hidden="true" /><span>Ordenes pendientes</span></Link>
          <Link href="/pos?vista=recibos" prefetch={false} aria-current={completed ? "page" : undefined} className={navigationClass(completed)}><ReceiptText size={18} className="shrink-0" aria-hidden="true" /><span>Recibos</span></Link>
        </nav>
        <Form action="/pos" className="my-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="vista" value={completed ? "recibos" : "cola"} />
          <label className="min-w-0 flex-1 text-sm">Buscar orden: numero, cliente o cedula<input name="q" type="search" maxLength={120} defaultValue={search} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /></label>
          <button className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700">Buscar</button>
        </Form>
        {readError && <p role="alert" className="my-4 text-sm text-red-700">{posReadError(readError)} <Link href={pageHref(page)} prefetch={false} className="underline">Reintentar</Link></p>}
        <section aria-label="Ordenes de caja">
          {!error && !summaries.length && <p className="py-6 text-sm text-slate-600">No hay ordenes en esta vista.</p>}
          <ul className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summaries.slice(0,24).map(order => {
              const expired = posReservationExpired(order,Date.parse(serverTime));
              const href = `${returnHref}&orden=${order.id}`;
              return <li key={order.id} className={`flex min-w-0 flex-col rounded-lg border bg-white p-5 shadow-sm ${expired ? "border-slate-300" : "border-rose-100"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-sm font-semibold">ORD-{order.id.slice(0,8).toUpperCase()}</p><span className={`text-xs font-semibold ${expired ? "text-slate-500" : completed ? "text-emerald-700" : "text-rose-700"}`}>{expired ? "Inhabilitada: reserva vencida" : completed ? "Pagada" : "Pendiente de cobro"}</span></div>
                <p className="mt-3 break-words font-semibold">{order.customer_name ?? "Sin datos de cliente"}</p><p className="text-sm text-slate-600">Cedula: {order.customer_id ?? "Sin cedula"}</p><p className="mt-1 break-words text-sm text-slate-600">Asesor: {order.advisor_name}</p>
                <p className="mt-3 font-semibold tabular-nums">{posMoney(order.total_usd)}</p>{order.total_ves !== null && <p className="text-sm tabular-nums">{posMoney(order.total_ves,"bolivares")}</p>}
                <Link href={href} prefetch={false} aria-haspopup="dialog" className={`mt-5 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 ${expired ? "border border-slate-300 text-slate-600 hover:bg-slate-100" : "bg-rose-600 text-white hover:bg-rose-700"}`}>{completed ? "Ver recibo" : expired ? "Habilitar orden" : "Cobrar"}</Link>
                {!completed && expired && <ExpiredOrderActions orderId={order.id} />}
              </li>;
            })}
          </ul>
        </section>
        {selected && <PosEditor key={`${selected.id}:${selected.revision}`} order={selected} availability={availability} today={today} serverTime={serverTime} returnHref={returnHref} />}
        {(page > 1 || summaries.length > 24) && <nav aria-label="Paginas de resultados" className="mt-5 flex gap-4 text-sm">{page>1 && <Link href={pageHref(page-1)} prefetch={false} className="underline">Anterior</Link>}<span>Pagina {page}</span>{summaries.length>24 && <Link href={pageHref(page+1)} prefetch={false} className="underline">Siguiente</Link>}</nav>}
      </div>
    </main>
  );
}