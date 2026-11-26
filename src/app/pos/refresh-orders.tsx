"use client";

import { useEffect, useEffectEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function RefreshPosOrders() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh = useEffectEvent(() => router.refresh());

  useEffect(() => {
    let lastRefresh = 0;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 1000) return;
      lastRefresh = Date.now();
      refresh();
    };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("belleza:pos-orders-updated");
    channel?.addEventListener("message", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    const interval = window.setInterval(refreshIfVisible, 5000);

    return () => {
      channel?.removeEventListener("message", refreshIfVisible);
      channel?.close();
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <button type="button" onClick={() => startTransition(() => router.refresh())} disabled={pending}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-60">
      <RefreshCw size={17} aria-hidden="true" />
      {pending ? "Cargando órdenes..." : "Cargar órdenes"}
    </button>
  );
}