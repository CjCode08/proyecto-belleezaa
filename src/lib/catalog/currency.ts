import { parseExchangeRate } from "../inventory/exchange-rate.ts";

export function convertUsdCentsToVesCents(usdCents: number, rate: string): bigint {
  if (!Number.isSafeInteger(usdCents) || usdCents < 0) throw new RangeError("El importe en dólares no es válido.");
  const parsed = parseExchangeRate(rate);
  if (parsed === null) throw new RangeError("La tasa de cambio no es válida.");
  const [whole, fraction = ""] = parsed.split(".");
  const scale = BigInt(1000000);
  const rateUnits = BigInt(whole) * scale + BigInt(fraction.padEnd(6, "0"));
  return (BigInt(usdCents) * rateUnits + BigInt(500000)) / scale;
}

export function formatVesCents(cents: bigint): string {
  if (cents < BigInt(0)) throw new RangeError("El importe en bolívares no es válido.");
  const whole = (cents / BigInt(100)).toLocaleString("es-VE");
  const fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `Bs. ${whole},${fraction}`;
}
