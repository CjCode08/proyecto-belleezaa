import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginForm } from "@/app/login/form";

export const metadata: Metadata = { title: "Belleezaa | Caja" };
export default function PosLoginPage() {
  if (process.env.POS_PREVIEW_ENABLED !== "true") notFound();
  return (
    <main className="flex min-h-screen items-center justify-center bg-rose-50 px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-bold uppercase tracking-widest text-rose-600">Belleezaa</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Acceso a caja</h1>
        <LoginForm pos />
      </section>
    </main>
  );
}