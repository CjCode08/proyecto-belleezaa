"use client";

import { useActionState } from "react";
import { formatExchangeRateDate } from "@/lib/inventory/exchange-rate";
import { deleteExchangeRate } from "./actions";
import { ExchangeRateForm, type RateRecord } from "./form";

export function RateActions({ record }: { record: RateRecord }) {
  const [state, action, pending] = useActionState(deleteExchangeRate, {});
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <details className="w-full rounded-xl border border-rose-100 p-3 sm:w-auto sm:min-w-64">
        <summary className="cursor-pointer font-semibold text-rose-700">Modificar</summary>
        <div className="mt-4"><ExchangeRateForm record={record} /></div>
      </details>
      <details className="w-full rounded-xl border border-red-200 p-3 sm:w-auto sm:min-w-64">
        <summary className="cursor-pointer font-semibold text-red-700">Eliminar</summary>
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={record.rate_id} />
          <input type="hidden" name="updatedAt" value={record.updated_at} />
          <p className="text-sm text-red-800">
            Vas a eliminar la tasa del <strong>{formatExchangeRateDate(record.effective_date)}</strong>:
            {" "}<strong>1 USD = {record.rate.replace(".", ",")} Bs.</strong>
            {" "}Esta acción no se puede deshacer. Si es la tasa de hoy, dejará de estar disponible.
          </p>
          <label className="block text-sm font-medium">Motivo de eliminación
            <textarea name="reason" required maxLength={1000} rows={2}
              className="mt-2 block w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-slate-900" />
          </label>
          {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
          {state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
          <button disabled={pending} className="min-h-11 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
            {pending ? "Eliminando..." : "Confirmar eliminación"}
          </button>
        </form>
      </details>
    </div>
  );
}
