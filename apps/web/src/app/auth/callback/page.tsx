"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { API_ROUTES } from "@/lib/api-routes";
import { API_BASE_URL } from "@/lib/apiBase";

/**
 * /auth/callback
 *
 * Landing page for OAuth flows (Google, GitHub).
 *
 * The backend now redirects here with ?exchange_token=<uuid> (NOT ?success=true).
 * A short-lived single-use UUID is stored in Redis (60s TTL).
 *
 * Flow:
 * 1. Read `exchange_token` from the URL search params.
 * 2. Immediately POST it to /api/auth/exchange (same-origin XHR — no cross-site
 *    cookie timing issues). The backend validates + deletes the token and sets
 *    both `token` and `refreshToken` cookies in this same-origin response.
 * 3. Force the shared SWR cache to revalidate /api/auth/me so AuthProvider
 *    picks up the new session.
 * 4. Redirect to /dashboard on success, or /login?error=oauth_failed on any failure.
 * 5. An 8-second hard timeout prevents infinite hangs.
 */

type ExchangeState = "idle" | "exchanging" | "success" | "error";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate } = useSWRConfig();
  const [state, setState] = useState<ExchangeState>("idle");
  const done = useRef(false);

  const failRedirect = () => {
    if (done.current) return;
    done.current = true;
    if (typeof window !== "undefined") {
      window.location.href = "/login?error=oauth_failed";
    } else {
      router.replace("/login?error=oauth_failed");
    }
  };

  const succeedRedirect = () => {
    if (done.current) return;
    done.current = true;
    if (typeof window !== "undefined") {
      window.location.href = "/dashboard";
    } else {
      router.replace("/dashboard");
    }
  };

  useEffect(() => {
    let exchangeToken: string | null = null;
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      exchangeToken = urlParams.get("exchange_token");
    }
    if (!exchangeToken) {
      exchangeToken = searchParams.get("exchange_token");
    }

    if (!exchangeToken) {
      if (typeof window !== "undefined" && !window.location.search.includes("exchange_token")) {
        failRedirect();
      }
      return;
    }

    setState("exchanging");

    // POST the exchange_token to the backend. This is a same-origin (localhost:3000
    // → localhost:8005) credentialed request, so Set-Cookie in the response is
    // committed to the browser immediately without any SameSite/timing issues.
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}${API_ROUTES.auth.exchange}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exchange_token: exchangeToken }),
          credentials: "include", // ensure cookies are set from the response
        });

        if (!res.ok) {
          // Token expired, already used, or backend error.
          setState("error");
          failRedirect();
          return;
        }

        setState("success");

        // Force the global SWR cache for /me to re-fetch now that cookies are set.
        // This updates AuthProvider's user state before we navigate.
        await mutate(API_ROUTES.auth.me);

        succeedRedirect();
      } catch {
        setState("error");
        failRedirect();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // run when searchParams is populated

  // Hard timeout — never hang forever if something goes wrong.
  useEffect(() => {
    const timeout = setTimeout(failRedirect, 8000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label =
    state === "exchanging"
      ? "Verifying session…"
      : state === "success"
        ? "Signing you in…"
        : state === "error"
          ? "Something went wrong…"
          : "Completing sign-in…";

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-panel-text">
        <svg
          className="animate-spin h-8 w-8 text-amber"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="font-mono text-sm text-panel-muted">{label}</p>
      </div>
    </div>
  );
}

const SpinnerFallback = (
  <div className="min-h-screen bg-bg flex items-center justify-center">
    <div className="flex flex-col items-center gap-4 text-panel-text">
      <svg
        className="animate-spin h-8 w-8 text-amber"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="font-mono text-sm text-panel-muted">Completing sign-in…</p>
    </div>
  </div>
);

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={SpinnerFallback}>
      <AuthCallbackInner />
    </Suspense>
  );
}
