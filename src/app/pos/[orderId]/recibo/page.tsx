import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { requirePosProfile } from "@/lib/auth/pos-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePosOrder, posMethods, posMoney } from "@/lib/pos/order";
import { PrintButton } from "./print-button";
import { attentionChannelLabel } from "@/lib/sellers/attention-channel";

export const metadata: Metadata = { title: "Belleezaa | Recibo" };
export const instant = false;

export default async function ReceiptPage({ params, searchParams }: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ origen?: string; desde?: string; hasta?: string; moneda?: string; pagina?: string; q?: string }>;
}) {
  await connection();
  await requirePosProfile();
  const { orderId } = await params;
  const search = await searchParams;
  const transactionParams = new URLSearchParams();
  if (typeof search.desde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.desde)) transactionParams.set("desde", search.desde);
  if (typeof search.hasta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.hasta)) transactionParams.set("hasta", search.hasta);
  if (search.moneda === "bolivares" || search.moneda === "divisas") transactionParams.set("moneda", search.moneda);
  if (typeof search.pagina === "string" && /^\d{1,5}$/.test(search.pagina)) transactionParams.set("pagina", search.pagina);
  if (typeof search.q === "string" && search.q.length <= 120 && search.origen !== "transacciones") transactionParams.set("q", search.q);
  const transactionQuery = transactionParams.toString();
  const backHref = search.origen === "transacciones"
    ? `/pos/transacciones${transactionQuery ? `?${transactionQuery}` : ""}`
    : `/pos?vista=recibos${transactionQuery ? `&${transactionQuery}` : ""}`;
  const client = await createSupabaseServerClient("pos");
  const { data, error } = await client.rpc("pos_get_order", { p_order: orderId });
  if (error || !data) return <main className="p-6"><p role="alert">No se pudo consultar el recibo. <Link href={backHref} className="underline">Volver a {search.origen === "transacciones" ? "transacciones" : "caja"}</Link></p></main>;
  const order = parsePosOrder(data);
  const receipt = order.receipt;
  if (!receipt) return <main className="p-6"><p>Esta orden todavia no tiene recibo.</p><Link className="underline" href={`/pos?orden=${order.id}`}>Volver a la orden</Link></main>;
  const date = new Intl.DateTimeFormat("es-VE", { dateStyle:"short",timeZone:"America/Caracas" });
  const method = posMethods[receipt.payment.currency].find(method => method.value === receipt.payment.method)?.label ?? receipt.payment.method;
  return (
    <main className="mx-auto max-w-lg px-4 py-8 text-slate-800">
      <nav className="pos-no-print mb-5 flex flex-wrap items-center justify-between gap-3"><Link href={backHref} className="text-sm text-rose-700 underline">{search.origen === "transacciones" ? "Volver a transacciones" : "Volver a caja"}</Link><PrintButton /></nav>
      <article className="pos-receipt border-y border-rose-100 py-5 text-sm">
        <header className="text-center"><Image src="/faviconBelleezaa.png" alt="" width={32} height={32} className="mx-auto" /><h1 className="mt-2 text-xl font-bold">Belleezaa</h1><p>Recibo de compra</p><p className="mt-2 font-mono">Orden: {order.id.slice(0,8).toUpperCase()}</p><p className="mt-1 font-mono text-xs">Recibo: {receipt.id.slice(0,8).toUpperCase()}</p></header>
        <div className="my-4 border-t border-rose-100 pt-4"><p className="break-words">Cliente: {receipt.customer_name ?? "Sin nombre"}</p><p>Cedula: {receipt.customer_id ?? "Sin cedula"}</p><p>Atencion: {attentionChannelLabel(receipt.attention_channel)}</p><p className="break-words">Asesor: {receipt.advisor_name}</p><p className="break-words">Caja: {receipt.cashier_name}</p></div>
        <ul className="divide-y divide-rose-100">{receipt.items.map((item,index) => <li key={index} className="py-3"><div className="flex justify-between gap-3"><span className="min-w-0 break-words">{item.quantity} x {item.product_name}</span><span className="shrink-0 tabular-nums">Ref. {item.total_usd.toFixed(2)}</span></div><p className="break-words text-xs">{item.kind === "variant" ? [item.size,item.color,item.sku || "Sin SKU"].join(" / ") : `Bulto: ${item.bundle_description}`}</p><p className="text-xs">{item.kind === "bundle" ? "Precio por bulto" : "Precio unitario"}: Ref. {(item.kind === "bundle" ? item.bundle_price_usd : item.regular_price_usd)?.toFixed(2) ?? "Sin precio"}</p>{item.promotion_units>0 && <p className="mt-1 break-words text-xs">Promo: {item.promotion_units} unidades a Ref. {item.promotion_price_usd?.toFixed(2)} c/u {item.promotion_description}</p>}</li>)}</ul>
        <div className="mt-4 border-t border-rose-100 pt-4"><p className="text-lg font-semibold">Total pagado: {posMoney(receipt.payment.amount,receipt.payment.currency)}</p><p>{receipt.payment.currency === "bolivares" ? "Bolivares" : "Divisas"} · {method}</p>{receipt.payment.received_amount !== undefined && <p>Monto entregado: {posMoney(receipt.payment.received_amount,receipt.payment.currency)}</p>}{receipt.payment.change_amount !== undefined && <p>Vuelto: {posMoney(receipt.payment.change_amount,receipt.payment.currency)}</p>}{receipt.payment.reference && <p className="break-all">Referencia: {receipt.payment.reference}</p>}<p>Fecha del pago: {date.format(new Date(`${receipt.payment.paid_on}T12:00:00Z`))}</p><p>Registrado: {date.format(new Date(receipt.payment.registered_at))}</p>{receipt.payment.comment && <p className="mt-2 whitespace-pre-wrap break-words">{receipt.payment.comment}</p>}</div>
      </article>
    </main>
  );
}