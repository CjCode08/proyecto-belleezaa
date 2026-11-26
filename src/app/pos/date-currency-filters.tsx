const fieldClass = "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200";

export function DateCurrencyFilters({ from, to, currency }: { from: string; to: string; currency: string }) {
  return <>
    <label className="min-w-0 flex-1 basis-36 text-sm font-medium">Desde
      <input name="desde" type="date" defaultValue={from} className={fieldClass} />
    </label>
    <label className="min-w-0 flex-1 basis-36 text-sm font-medium">Hasta
      <input name="hasta" type="date" defaultValue={to} className={fieldClass} />
    </label>
    <label className="min-w-0 flex-1 basis-36 text-sm font-medium">Moneda de pago
      <select name="moneda" defaultValue={currency} className={fieldClass}>
        <option value="">Todas</option>
        <option value="bolivares">Bolívares</option>
        <option value="divisas">Divisas</option>
      </select>
    </label>
  </>;
}