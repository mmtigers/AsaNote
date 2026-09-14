"use client";

import { useEffect } from "react";
import { registerSyncListeners } from "@/lib/db/sync";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    }

    registerSyncListeners();
  }, []);

  return null;
}
