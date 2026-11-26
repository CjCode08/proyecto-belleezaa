import Link from "next/link";
import { ArrowDownUp, ClipboardList, ReceiptText } from "lucide-react";

export function PosNavigation({ active }: { active: "orders" | "receipts" | "transactions" }) {
  const navigationClass = (selected: boolean) => `inline-flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-center text-xs font-semibold leading-tight transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 motion-reduce:transition-none motion-reduce:active:scale-100 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${selected ? "bg-rose-600 text-white shadow-sm hover:bg-rose-700" : "text-slate-600 hover:bg-rose-50 hover:text-rose-700"}`;

  return (
    <nav aria-label="Vistas de caja" className="grid w-full grid-cols-3 gap-1 rounded-lg border border-rose-100 bg-white p-1 sm:inline-grid sm:w-auto">
      <Link href="/pos" prefetch={false} aria-current={active === "orders" ? "page" : undefined} className={navigationClass(active === "orders")}><ClipboardList size={18} className="shrink-0" aria-hidden="true" /><span>Órdenes pendientes</span></Link>
      <Link href="/pos?vista=recibos" prefetch={false} aria-current={active === "receipts" ? "page" : undefined} className={navigationClass(active === "receipts")}><ReceiptText size={18} className="shrink-0" aria-hidden="true" /><span>Recibos</span></Link>
      <Link href="/pos/transacciones" prefetch={false} aria-current={active === "transactions" ? "page" : undefined} className={navigationClass(active === "transactions")}><ArrowDownUp size={18} className="shrink-0" aria-hidden="true" /><span>Transacciones</span></Link>
    </nav>
  );
}