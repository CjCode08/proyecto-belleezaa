"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const channelNames = ["belleza:seller-orders-updated", "belleza:catalog-stock-updated"];
const refreshIntervalMs = 30000;

export function RefreshSellerOrders({ manual = false }: { manual?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const refreshAutomatically = useEffectEvent(() => {
    router.refresh();
    setLastRefreshed(new Date());
  });
  const refreshManually = () => {
    startTransition(() => {
      router.refresh();
      setLastRefreshed(new Date());
    });
  };

  useEffect(() => {
    let lastRefresh = 0;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 1000) return;
      lastRefresh = Date.now();
      refreshAutomatically();
    };

    const channels = typeof BroadcastChannel === "undefined"
      ? []
      : channelNames.map((name) => new BroadcastChannel(name));
    channels.forEach((channel) => channel.addEventListener("message", refreshIfVisible));
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    const interval = window.setInterval(refreshIfVisible, refreshIntervalMs);

    return () => {
      channels.forEach((channel) => {
        channel.removeEventListener("message", refreshIfVisible);
        channel.close();
      });
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.clearInterval(interval);
    };
  }, []);

  if (!manual) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={refreshManually}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        <RefreshCw size={17} aria-hidden="true" className={pending ? "animate-spin motion-reduce:animate-none" : ""} />
        {pending ? "Actualizando..." : "Actualizar catálogo"}
      </button>
      <span className="text-xs text-slate-500" aria-live="polite">
        {lastRefreshed ? `Actualizado a las ${lastRefreshed.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}` : "Se actualiza automáticamente"}
      </span>
    </div>
  );
}