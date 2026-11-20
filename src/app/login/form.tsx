"use client";

import { useActionState } from "react";
import { login, loginSeller } from "./actions";

export function LoginForm({ sellers = false }: { sellers?: boolean }) {
  const [state, action, pending] = useActionState(sellers ? loginSeller : login, {});
  const field = sellers
    ? "mt-1 min-h-11 w-full rounded-md border border-[var(--seller-line)] bg-[var(--seller-canvas)] px-3 focus-visible:outline-2 focus-visible:outline-[var(--seller-accent)]"
    : "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-rose-500";

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-slate-700">Usuario</label>
        <input id="username" name="username" autoComplete="username" required maxLength={32}
          className={field} />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024}
          className={field} />
      </div>
      {state.error && <p role="alert" className={sellers ? "text-sm text-[var(--seller-accent)]" : "text-sm text-red-700"}>{state.error}</p>}
      <button disabled={pending} className={sellers ? "w-full rounded-md bg-[var(--seller-action)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--seller-hover)] disabled:opacity-60" : "w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"}>
        {pending ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
