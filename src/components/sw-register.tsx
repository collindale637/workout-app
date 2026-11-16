"use client";

import { useEffect } from "react";

/** Registers /sw.js in production so the home-screen app loads offline. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (reg) => {
        // Refresh the saved copies of every screen so offline matches the latest version.
        if (!navigator.onLine) return;
        const sw = reg.active ?? (await navigator.serviceWorker.ready).active;
        sw?.postMessage("warm");
      })
      .catch(() => undefined);
  }, []);
  return null;
}
