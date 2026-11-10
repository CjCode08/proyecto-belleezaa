export const secondaryButtonClass =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50 active:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600";

export const fileInputClass =
  "mt-3 block w-full cursor-pointer rounded-lg text-sm text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-rose-600 file:px-4 file:py-2.5 file:font-semibold file:text-white file:transition-colors hover:file:bg-rose-700 active:file:bg-rose-800";

export function productStatusClass(status: string | null): string {
  switch (status?.trim().toLowerCase()) {
    case "activo":
      return "bg-emerald-100 text-emerald-800";
    case "inhabilitado":
      return "bg-red-100 text-red-800";
    case "reabastecer":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
