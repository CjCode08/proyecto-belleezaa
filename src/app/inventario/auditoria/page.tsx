import Link from "next/link";
import { requireInventoryProfile } from "@/lib/auth/inventory-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { secondaryButtonClass } from "../ui";

export const instant = false;
const pageSize = 25;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const profile = await requireInventoryProfile();
  const requestedPage = Number((await searchParams).pagina ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 40001
    ? requestedPage
    : 1;
  const supabase = await createSupabaseServerClient();
  const { data: movements, error } = await supabase.rpc("inventory_audit_list", {
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error("No se pudo consultar la auditoría.", { cause: error });
  if (!movements) throw new Error("La consulta de auditoría no devolvió resultados válidos.");
  const total = movements[0]?.total_count ?? 0;

  return (
    <main className="min-h-screen bg-rose-50/30 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-5xl">
        <Link href="/inventario" className={secondaryButtonClass}>← Volver al inventario</Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Movimientos de inventario</h1>
          <form action={logout}>
            <button className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
              Cerrar sesión
            </button>
          </form>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {profile.role === "admin" ? "Auditoría global" : "Solo tus movimientos"} · {total} movimientos
        </p>
        {movements.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-rose-100 bg-white p-5 text-sm text-slate-600">
            {page === 1 ? "Aún no hay movimientos registrados." : "No hay movimientos en esta página."}
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
          {page > 1 ? <Link className="font-semibold text-rose-700" href={`/inventario/auditoria?pagina=${page - 1}`}>Anterior</Link> : <span />}
          <span className="text-slate-600">Página {page}</span>
          {page * pageSize < total ? <Link className="font-semibold text-rose-700" href={`/inventario/auditoria?pagina=${page + 1}`}>Siguiente</Link> : <span />}
        </nav>
      </div>
    </main>
  );
}
