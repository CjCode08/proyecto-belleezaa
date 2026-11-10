export function parseExchangeRate(value: string): string | null {
  const raw = value.trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(raw)) return null;
  return /[1-9]/.test(raw) ? raw : null;
}

export function isValidExchangeRateDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function formatExchangeRateDate(value: string): string {
  if (!isValidExchangeRateDate(value)) throw new RangeError("Fecha de tasa inválida.");
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function exchangeRateChangeError(code: string): string {
  if (code === "23505") return "Ya existe una tasa para esa fecha. Modifica la registrada.";
  if (code === "P0002") return "La tasa cambió o ya no existe. Recarga la página antes de continuar.";
  return "No se pudo guardar el cambio. Comprueba la conexión y los permisos.";
}
