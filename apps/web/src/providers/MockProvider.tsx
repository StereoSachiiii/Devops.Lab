"use client";

import { useEffect } from "react";

// Module-level guard: prevents double-start across React strict-mode double-invocations
// and hot-reloads in Next.js dev.
let _started = false;

export function MockProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled" || _started) return;
    _started = true;

    import("@/mocks/browser")
      .then(({ worker }) =>
        // Promise.resolve handles the case where worker.start() returns undefined
        // (MSW v2 behaviour when the worker is already active after a hot-reload)
        Promise.resolve(
          worker.start({
            onUnhandledRequest: "bypass",
            serviceWorker: { url: "/mockServiceWorker.js" },
          })
        )
      )
      .catch((err) => console.warn("[MSW] failed to start:", err));
  }, []);

  // Never block rendering — router context must be available immediately.
  return <>{children}</>;
}
