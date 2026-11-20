import { notFound } from "next/navigation";
import { LoginForm } from "@/app/login/form";

export default function SellersLoginPage() {
  if (process.env.SELLERS_PREVIEW_ENABLED !== "true") notFound();

  return (
    <main className="seller-surface grid min-h-dvh place-items-center px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-[var(--seller-line)] bg-[var(--seller-paper)] p-6 sm:p-8">
      <header className="border-b border-[var(--seller-line)] pb-4">
        <p className="font-serif text-xl font-bold text-[var(--seller-accent)]">Belleezaa</p>
        <h1 className="mt-2 text-2xl font-semibold">Acceso de vendedores</h1>
      </header>
      <LoginForm sellers />
      </section>
    </main>
  );
}