"use client";

import { useState } from "react";

type Period = "day" | "month" | "year";

const monthOptions = [
  ["01", "Enero"], ["02", "Febrero"], ["03", "Marzo"], ["04", "Abril"],
  ["05", "Mayo"], ["06", "Junio"], ["07", "Julio"], ["08", "Agosto"],
  ["09", "Septiembre"], ["10", "Octubre"], ["11", "Noviembre"], ["12", "Diciembre"],
] as const;

function monthBounds(value: string) {
  const [year, month] = value.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${value}-01`, end: `${value}-${String(lastDay).padStart(2, "0")}` };
}

function yearBounds(year: string) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function getRangeLimits(period: Period, month: string, year: string, yearMonth: string) {
  if (period === "month") return monthBounds(month);
  if (period === "year" && yearMonth) return monthBounds(`${year}-${yearMonth}`);
  if (period === "year") return yearBounds(year);
  return null;
}

export function SalesFilters({
  initialPeriod,
  initialStart,
  initialEnd,
  initialMonth,
  initialYear,
  initialYearMonth,
  today,
}: {
  initialPeriod: Period;
  initialStart: string;
  initialEnd: string;
  initialMonth: string;
  initialYear: string;
  initialYearMonth: string;
  today: string;
}) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [day, setDay] = useState(initialStart);
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [yearMonth, setYearMonth] = useState(initialYearMonth);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const limits = getRangeLimits(period, month, year, yearMonth);

  function changePeriod(value: Period) {
    setPeriod(value);
    if (value === "day") {
      setDay(start);
      setStart(start);
      setEnd(start);
    } else if (value === "month") {
      const selectedMonth = start.slice(0, 7) || today.slice(0, 7);
      setMonth(selectedMonth);
      const bounds = monthBounds(selectedMonth);
      setStart(bounds.start);
      setEnd(bounds.end);
    } else {
      const selectedYear = start.slice(0, 4) || today.slice(0, 4);
      setYear(selectedYear);
      setYearMonth("");
      const bounds = yearBounds(selectedYear);
      setStart(bounds.start);
      setEnd(bounds.end);
    }
  }

  function changeMonth(value: string) {
    setMonth(value);
    const bounds = monthBounds(value);
    setStart(bounds.start);
    setEnd(bounds.end);
  }

  function changeYear(value: string) {
    setYear(value);
    const bounds = getRangeLimits("year", month, value, yearMonth) ?? yearBounds(value);
    setStart(bounds.start);
    setEnd(bounds.end);
  }

  function changeYearMonth(value: string) {
    setYearMonth(value);
    const bounds = value ? monthBounds(`${year}-${value}`) : yearBounds(year);
    setStart(bounds.start);
    setEnd(bounds.end);
  }

  function changeStart(value: string) {
    setStart(value);
    if (value > end) setEnd(value);
  }

  function changeEnd(value: string) {
    setEnd(value);
    if (value < start) setStart(value);
  }

  return (
    <form action="/administracion" method="get" className="mt-5 grid gap-3 border-b border-rose-100 pb-5 sm:grid-cols-2 xl:grid-cols-5 xl:items-end">
      <label htmlFor="sales-period" className="text-sm font-semibold">Periodo
        <select id="sales-period" name="periodo" value={period} onChange={(event) => changePeriod(event.target.value as Period)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200">
          <option value="day">Diario</option>
          <option value="month">Mensual</option>
          <option value="year">Anual</option>
        </select>
      </label>

      {period === "day" && <label htmlFor="sales-day" className="text-sm font-semibold">Día
        <input id="sales-day" name="fecha" type="date" required value={day} onChange={(event) => { setDay(event.target.value); setStart(event.target.value); setEnd(event.target.value); }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200" />
      </label>}

      {period === "month" && <label htmlFor="sales-month" className="text-sm font-semibold">Mes
        <input id="sales-month" name="mes" type="month" required value={month} onChange={(event) => changeMonth(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200" />
      </label>}

      {period === "year" && <>
        <label htmlFor="sales-year" className="text-sm font-semibold">Año
          <input id="sales-year" name="anio" type="number" min="1900" max={today.slice(0, 4)} required value={year} onChange={(event) => changeYear(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200" />
        </label>
        <label htmlFor="sales-year-month" className="text-sm font-semibold">Mes
          <select id="sales-year-month" name="mesAnual" value={yearMonth} onChange={(event) => changeYearMonth(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200">
            <option value="">Todos los meses</option>
            {monthOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </>}

      {period !== "day" && <>
        <input type="hidden" name="desde" value={start} />
        <input type="hidden" name="hasta" value={end} />
        <label htmlFor="sales-start" className="text-sm font-semibold">Desde
          <input id="sales-start" type="date" required min={limits?.start} max={limits?.end} value={start} onChange={(event) => changeStart(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200" />
        </label>
        <label htmlFor="sales-end" className="text-sm font-semibold">Hasta
          <input id="sales-end" type="date" required min={limits?.start} max={limits?.end} value={end} onChange={(event) => changeEnd(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200" />
        </label>
      </>}

      {period === "day" && <>
        <input type="hidden" name="desde" value={day} />
        <input type="hidden" name="hasta" value={day} />
      </>}

      <div className="flex gap-2 sm:col-span-2 xl:col-span-1">
        <button type="submit" className="min-h-11 flex-1 rounded-lg bg-rose-700 px-5 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">Consultar</button>
        <a href="/administracion" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50">Hoy</a>
      </div>
    </form>
  );
}