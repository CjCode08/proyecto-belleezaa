"use client";

import { processCommission } from "./actions";

export function ProcessCommissionForm({
  sellerId,
  sellerName,
  start,
  end,
}: {
  sellerId: string;
  sellerName: string;
  start: string;
  end: string;
}) {
  return (
    <form action={processCommission} onSubmit={(event) => {
      if (!window.confirm(`¿Procesar la comisión de ${sellerName} para el rango seleccionado?`)) event.preventDefault();
    }}>
      <input type="hidden" name="seller_id" value={sellerId} />
      <input type="hidden" name="desde" value={start} />
      <input type="hidden" name="hasta" value={end} />
      <button className="min-h-10 rounded-md bg-rose-700 px-3 text-xs font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">
        Procesar comisión
      </button>
    </form>
  );
}