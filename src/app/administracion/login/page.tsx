import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/form";
import { canAccessAdministration } from "@/lib/auth/staff-destination";
import { getActiveProfile } from "@/lib/auth/active-profile";

export const metadata: Metadata = { title: "Belleezaa | Administración" };
export const instant = false;

export default async function AdministrationLoginPage() {
  const profile = await getActiveProfile();
  if (canAccessAdministration(profile)) redirect("/administracion");

  return (
    <main className="flex min-h-screen items-center justify-center bg-rose-50 px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-bold uppercase tracking-widest text-rose-600">Belleezaa</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Administración</h1>
        <p className="mt-2 text-sm text-slate-600">Ingresa con la cuenta de administrador.</p>
        <LoginForm administration />
      </section>
    </main>
  );
}