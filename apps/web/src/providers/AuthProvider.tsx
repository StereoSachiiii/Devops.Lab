"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";

interface UserSession {
  id: string;
  email: string;
  name: string | null;
  role: string;
  xp: number;
  emailVerified: string | null;
  mfaEnabled: boolean;
}

interface AuthContextType {
  user: UserSession | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  mutate: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const authPages = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];
  // When `pathname` is temporarily empty during the very first client render,
  // don't block the UI (it should be non-auth pages only).
  const isAuthPage = pathname ? authPages.some((p) => pathname.startsWith(p)) : true;
  const meKey = isAuthPage ? null : "/api/auth/me";

  const [authBootTimedOut, setAuthBootTimedOut] = React.useState(false);
  const { data: user, error, isLoading, mutate } = useSWR<UserSession>(
    meKey,
    () => apiClient.get<UserSession>("/api/auth/me"),
    {
      shouldRetryOnError: false,
      revalidateOnFocus: true,
      loadingTimeout: 10000,
      onLoadingSlow: () => setAuthBootTimedOut(true),
      onSuccess: () => setAuthBootTimedOut(false),
      onError: () => setAuthBootTimedOut(false),
    }
  );
  // Never block rendering on auth pages; users should always see login/register UI
  // even if auth bootstrap or backend is slow/unreachable.
  const shouldBlockOnAuth = !isAuthPage && isLoading && !authBootTimedOut;

  const logout = async () => {
    try {
      await apiClient.post("/api/auth/logout");
    } catch {
      // Ignore failures on logout API call
    }
    await mutate(undefined, { revalidate: false });
    router.push("/login");
  };

  useEffect(() => {
    if (shouldBlockOnAuth) return;

    if (!user && !isAuthPage) {
      router.push("/login");
    } else if (user && isAuthPage) {
      router.push("/");
    }
  }, [user, shouldBlockOnAuth, pathname, router, isAuthPage]);

  const value = {
    user: user || null,
    isLoading: shouldBlockOnAuth,
    logout,
    mutate,
  };

  if (shouldBlockOnAuth) {
    return <div className="p-8">Loading...</div>;
  }

  if (error) {
    console.warn("Auth bootstrap fallback:", error);
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
