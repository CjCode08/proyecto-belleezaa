import Link from "next/link";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { secondaryButtonClass } from "../ui";

export const instant = false;
const pageSize = 25;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const filterFieldClass = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200";

function auditPageHref(page: number, month: string, userId: string) {
  const params = new URLSearchParams();
  if (page > 1) params.set("pagina", String(page));
  if (month) params.set("mes", month);
  if (userId) params.set("usuario", userId);
  const query = params.toString();
  return query ? `/inventario/auditoria?${query}` : "/inventario/auditoria";
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ pagina?: string; mes?: string; usuario?: string }> }) {
  const profile = await requireInventoryProfile();
  const params = await searchParams;
  const month = typeof params.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : "";
  const userId = profile.role === "admin" && typeof params.usuario === "string" && uuidPattern.test(params.usuario)
    ? params.usuario
    : "";
  const requestedPage = Number(params.pagina ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 40001
    ? requestedPage
    : 1;
  const supabase = await createSupabaseServerClient();
  const [movementsResult, usersResult] = await Promise.all([
    supabase.rpc("inventory_audit_list_filtered", {
      p_offset: (page - 1) * pageSize,
      p_month: month || null,
      p_user_id: userId || null,
    }),
    supabase.rpc("inventory_audit_users"),
  ]);
  if (movementsResult.error) throw new Error("No se pudo consultar la auditoría.", { cause: movementsResult.error });
  if (usersResult.error) throw new Error("No se pudieron consultar los usuarios de auditoría.", { cause: usersResult.error });
  if (!movementsResult.data || !usersResult.data) throw new Error("La consulta de auditoría no devolvió resultados válidos.");
  const movements = movementsResult.data;
  const total = movements[0]?.total_count ?? 0;

  return (
    <main className="min-h-screen bg-rose-50/30 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-5xl">
        <Link href="/inventario" className={secondaryButtonClass}>← Volver al inventario</Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Movimientos de inventario</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {profile.role === "admin" ? "Auditoría global" : "Solo tus movimientos"} · {total} movimientos
        </p>
        <form action="/inventario/auditoria" method="get" className="mt-5 grid gap-3 rounded-2xl border border-rose-100 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
          <label htmlFor="audit-month" className="text-sm font-medium">Mes
            <input id="audit-month" name="mes" type="month" defaultValue={month} className={filterFieldClass} />
          </label>
          {profile.role === "admin" ? <label htmlFor="audit-user" className="text-sm font-medium">Usuario
            <select id="audit-user" name="usuario" defaultValue={userId} className={filterFieldClass}>
              <option value="">Todos los usuarios</option>
              {usersResult.data.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label> : <input type="hidden" name="usuario" value="" />}
          <button type="submit" className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Filtrar</button>
          <Link href="/inventario/auditoria" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Limpiar</Link>
        </form>
        {movements.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-rose-100 bg-white p-5 text-sm text-slate-600">
            {month || userId ? "No hay movimientos con esos filtros." : page === 1 ? "Aún no hay movimientos registrados." : "No hay movimientos en esta página."}
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {movements.map((movement) => (
              <li key={movement.id} className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">{movement.action_type}</span>
                  <time dateTime={movement.created_at} className="text-sm text-slate-500">
                    {new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(movement.created_at))}
                  </time>
                </div>
                <p className="mt-3 text-sm"><strong>Usuario:</strong> {movement.actor_name}</p>
                <p className="mt-1 text-sm"><strong>Producto:</strong> {movement.product_name ?? "Producto no disponible"}</p>
                {movement.variant_size && <p className="mt-1 text-sm"><strong>Variante:</strong> {movement.variant_size} · {movement.variant_color}</p>}
                {movement.quantity_change !== null && <p className="mt-1 text-sm"><strong>Cambio de unidades:</strong> {movement.quantity_change > 0 ? "+" : ""}{movement.quantity_change}</p>}
                <p className="mt-1 whitespace-pre-wrap text-sm"><strong>Comentario:</strong> {movement.comment || "Sin comentario"}</p>
              </li>
            ))}
          </ul>
        )}
        <nav aria-label="Páginas de auditoría" className="mt-6 flex items-center justify-between gap-4 text-sm">
          {page > 1 ? <Link className="font-semibold text-rose-700" href={auditPageHref(page - 1, month, userId)}>Anterior</Link> : <span />}
          <span className="text-slate-600">Página {page}</span>
          {page * pageSize < total ? <Link className="font-semibold text-rose-700" href={auditPageHref(page + 1, month, userId)}>Siguiente</Link> : <span />}
        </nav>
      </div>
    </main>
  );
}
