"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-slate-700">Usuario</label>
        <input id="username" name="username" autoComplete="username" required maxLength={32}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-rose-500" />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-rose-500" />
      </div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
        {pending ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
