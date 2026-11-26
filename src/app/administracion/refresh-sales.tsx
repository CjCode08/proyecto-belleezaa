"use client";

import { useEffect, useEffectEvent } from "react";
import { useRouter } from "next/navigation";

const channelName = "belleza:admin-sales-updated";
const refreshIntervalMs = 5000;

export function RefreshAdminSales() {
  const router = useRouter();
  const refresh = useEffectEvent(() => router.refresh());

  useEffect(() => {
    let lastRefresh = 0;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 1000) return;
      lastRefresh = Date.now();
      refresh();
    };

    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName);
    channel?.addEventListener("message", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    const interval = window.setInterval(refreshIfVisible, refreshIntervalMs);

    return () => {
      channel?.removeEventListener("message", refreshIfVisible);
      channel?.close();
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}