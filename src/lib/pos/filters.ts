export type PosFilterParams = { desde?: string | string[]; hasta?: string | string[]; moneda?: string | string[] };

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parsePosFilters(params: PosFilterParams) {
  const from = typeof params.desde === "string" ? params.desde : "";
  const to = typeof params.hasta === "string" ? params.hasta : "";
  const currency = typeof params.moneda === "string" ? params.moneda : "";
  const valid = [params.desde, params.hasta, params.moneda].every(value => value === undefined || typeof value === "string")
    && (!from || validDate(from)) && (!to || validDate(to)) && (!from || !to || from <= to)
    && (currency === "" || currency === "bolivares" || currency === "divisas");
  return { from, to, currency, valid };
}