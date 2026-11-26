import { Clock3, CircleCheck, CircleX } from "lucide-react";
import { attentionChannelLabel } from "@/lib/sellers/attention-channel";

type OrderItem = {
  kind: "variant" | "bundle";
  product_name: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  bundle_description: string | null;
  quantity: number;
  total_usd: number;
};

export type SellerOrder = {
  id: string;
  customer_name: string | null;
  customer_id: string | null;
  attention_channel: string | null;
  deleted_at: string | null;
  deleted_by_name: string | null;
  deleted_by_role: string | null;
  status: string;
  payment_method: string;
  total_usd: number;
  total_ves: number | null;
  exchange_rate: number | null;
  created_at: string;
  expires_at: string;
  items: OrderItem[];
};

const moneyUsd = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" });
const moneyVes = new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES" });
const dateTime = new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" });

const statusLabels: Record<string, string> = {
  en_proceso: "En proceso",
  expirada: "Reserva vencida",
  completada: "Completada",
  cancelada: "Cancelada",
  eliminada: "Eliminada",
};

const methodLabels: Record<string, string> = {
  bolivares: "Bolivares",
  binance: "Binance",
  efectivo: "Efectivo en divisas",
};

export function OrdersPanel({ orders }: { orders: SellerOrder[] }) {
  if (!orders.length) {
    return <p className="mt-6 rounded-2xl border border-rose-100 bg-white p-5 text-sm text-slate-500 shadow-sm">Todavia no hay ordenes en esta pestana.</p>;
  }

  return (
    <section aria-label="Ordenes" className="mt-5 space-y-3">
      {orders.map((order) => (
        <article key={order.id} className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold">ORD-{order.id.slice(0, 8).toUpperCase()}</p>
              {order.customer_name && <p className="mt-1 font-medium">{order.customer_name}</p>}
              {order.customer_id && <p className="text-xs text-[var(--seller-muted)]">Cédula: {order.customer_id}</p>}
              <p className="mt-1 text-xs text-[var(--seller-muted)]">Atencion: {attentionChannelLabel(order.attention_channel)}</p>
              {order.status === "eliminada" && <p className="mt-1 text-xs font-medium text-red-700">Eliminada por {order.deleted_by_role === "admin" ? "Administrador" : "Caja"}: {order.deleted_by_name ?? "Usuario desconocido"}{order.deleted_at ? ` · ${dateTime.format(new Date(order.deleted_at))}` : ""}</p>}
              <p className="mt-1 text-xs text-[var(--seller-muted)]">Creada el {dateTime.format(new Date(order.created_at))}</p>
            </div>
            <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 text-xs font-semibold text-rose-700">
              {order.status === "completada" ? <CircleCheck size={16} aria-hidden="true" /> : order.status === "expirada" || order.status === "cancelada" || order.status === "eliminada" ? <CircleX size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}
              {statusLabels[order.status] ?? "Pendiente"}
            </span>
          </div>
          <ul className="mt-4 divide-y divide-rose-100">
            {order.items.map((item, index) => (
              <li key={`${order.id}:${index}`} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <span className="min-w-0 break-words">{item.quantity} &times; {item.product_name} · {item.kind === "variant" ? [item.size, item.color, item.sku || "Sin SKU"].filter(Boolean).join(" / ") : `Bulto: ${item.bundle_description ?? "Surtido"}`}</span>
                <span className="shrink-0 tabular-nums">{moneyUsd.format(item.total_usd)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-rose-100 pt-3 text-sm">
            <div>
              <p>{methodLabels[order.payment_method] ?? order.payment_method}</p>
              <p className="mt-1 text-xs text-[var(--seller-muted)]">{order.status === "en_proceso" ? `Reserva hasta ${dateTime.format(new Date(order.expires_at))}` : ""}</p>
            </div>
            <div className="text-right font-semibold tabular-nums">
              <p>{moneyUsd.format(order.total_usd)}</p>
              {order.total_ves !== null && <p className="mt-1">{moneyVes.format(order.total_ves)}</p>}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}