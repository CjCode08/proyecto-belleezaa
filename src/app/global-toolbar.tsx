"use client";

import { LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "./theme-toggle";

export function GlobalToolbar() {
  const pathname = usePathname();
  const showLogout = pathname.startsWith("/inventario");

  return (
    <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-2">
      {showLogout && (
        <form action={logout}>
          <button type="submit" className="theme-toggle inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2">
            <LogOut size={16} aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </form>
      )}
      <ThemeToggle />
    </div>
  );
}