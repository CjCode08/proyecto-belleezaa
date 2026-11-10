"use client";

import { useActionState, useId, useState } from "react";
import { editExchangeRate, saveExchangeRate } from "./actions";

const fieldClass = "mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-slate-400 bg-white px-3 py-2 text-base text-slate-900";

export type RateRecord = { rate_id: number; effective_date: string; rate: string; comment: string | null; updated_at: string };

export function ExchangeRateForm({ record }: { record?: RateRecord }) {
  const [state, action, pending] = useActionState(record ? editExchangeRate : saveExchangeRate, {});
  const id = useId();
  const [date, setDate] = useState(record?.effective_date ?? "");
  const [rate, setRate] = useState(record?.rate ?? "");
  const [comment, setComment] = useState(record?.comment ?? "");
  return (
    <form action={action} className="space-y-4">
      {record && <><input type="hidden" name="id" value={record.rate_id} /><input type="hidden" name="updatedAt" value={record.updated_at} /></>}
      <div>
        <label htmlFor={`${id}-date`} className="block text-sm font-medium">Fecha</label>
        <input id={`${id}-date`} name="effectiveDate" type="date" min="0001-01-01" max="9999-12-31" required
          value={date} onChange={(event) => setDate(event.target.value)} aria-describedby={`${id}-date-help`} className={`${fieldClass} [color-scheme:light]`} />
        <p id={`${id}-date-help`} className="mt-1 text-xs text-slate-500">Selecciona la fecha a la que corresponde la tasa.</p>
      </div>
      <div>
        <label htmlFor={`${id}-amount`} className="block text-sm font-medium">Tasa (bolívares por 1 USD)</label>
        <input id={`${id}-amount`} name="rate" type="text" inputMode="decimal" maxLength={17}
          required value={rate} onChange={(event) => setRate(event.target.value)} aria-describedby={`${id}-amount-help`} className={fieldClass} />
        <p id={`${id}-amount-help`} className="mt-1 text-xs text-slate-500">Hasta 6 decimales; usa coma o punto decimal.</p>
      </div>
      <div>
        <label htmlFor={`${id}-comment`} className="block text-sm font-medium">Comentario</label>
        <textarea id={`${id}-comment`} name="comment" required maxLength={1000} rows={3}
          value={comment} onChange={(event) => setComment(event.target.value)} className={fieldClass} />
      </div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-emerald-700">{state.success}</p>}
      <button disabled={pending} className="min-h-11 w-full rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 active:bg-rose-800 disabled:opacity-60">
        {pending ? "Guardando..." : record ? "Guardar cambios" : "Registrar tasa"}
      </button>
    </form>
  );
}
