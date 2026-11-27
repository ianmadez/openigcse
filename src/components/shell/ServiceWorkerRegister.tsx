"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SIGNED_OUT = ["/login", "/pair"];

/**
 * Registers /sw.js on every page (Step 7.3) so the app is installable and /today opens offline.
 * Development skips it: a caching worker fights hot reload. After registering, the page tells the
 * worker which scripts and styles it loaded, so the first visit already works offline.
 */
export function ServiceWorkerRegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (cancelled) return;
        // Sign-out reaches /login through the client router, which the worker never sees as a
        // navigation; tell it directly so the saved plan does not outlive the session.
        if (SIGNED_OUT.includes(pathname)) {
          registration.active?.postMessage({ type: "signed-out" });
          return;
        }
        const assets = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => name.startsWith(location.origin + "/_next/static/"));
        registration.active?.postMessage({ type: "warm", assets, page: pathname });
      })
      .catch(() => {
        /* No worker (private window, blocked): the app still works online. */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
