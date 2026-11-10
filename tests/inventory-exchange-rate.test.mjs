import assert from "node:assert/strict";
import { test } from "node:test";
import { exchangeRateChangeError, formatExchangeRateDate, isValidExchangeRateDate, parseExchangeRate } from "../src/lib/inventory/exchange-rate.ts";

test("acepta tasas positivas de hasta seis decimales", () => {
  assert.equal(parseExchangeRate(" 897.5383 "), "897.5383");
  assert.equal(parseExchangeRate("0,000001"), "0.000001");
  assert.equal(parseExchangeRate("9999999999.999999"), "9999999999.999999");
});

test("valida y muestra fechas sin convertirlas a otra zona horaria", () => {
  assert.equal(isValidExchangeRateDate("2026-11-09"), true);
  assert.equal(isValidExchangeRateDate("2028-02-29"), true);
  for (const date of ["2026-02-29", "2026-11-31", "0000-01-01", "09-11-2026", ""]) {
    assert.equal(isValidExchangeRateDate(date), false);
  }
  assert.equal(formatExchangeRateDate("2026-11-09"), "09/11/2026");
  assert.throws(() => formatExchangeRateDate("2026-02-29"), RangeError);
});

test("rechaza tasas nulas, negativas, imprecisas o fuera del límite", () => {
  for (const rate of ["", "0", "-1", "1.0000001", "10000000000", "1e3", "NaN", "1,5.1"]) {
    assert.equal(parseExchangeRate(rate), null);
  }
});

test("explica los conflictos de fecha y los cambios simultáneos", () => {
  assert.match(exchangeRateChangeError("23505"), /Ya existe una tasa para esa fecha/);
  assert.match(exchangeRateChangeError("P0002"), /Recarga la página/);
  assert.match(exchangeRateChangeError("42501"), /No se pudo guardar/);
});
