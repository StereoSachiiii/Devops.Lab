"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { API_ROUTES } from "@/lib/api-routes";
import { getPageType } from "@/lib/utils";

import type { UserSession } from "@/lib/api-types";

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

  const { isAuthPage, isProtectedPage } = getPageType(pathname);

  const { data: user, error, isLoading: isSwrLoading, mutate } = useSWR<UserSession>(
    API_ROUTES.auth.me,
    () => apiClient.get<UserSession>(API_ROUTES.auth.me),
    {
      shouldRetryOnError: false,
      revalidateOnFocus: false,
    }
  );
  
  const isLoading = isSwrLoading && !error && !user;
  const shouldBlockOnAuth = isProtectedPage && isLoading;

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
    if (isLoading) return;

    if (!user && isProtectedPage) {
      router.push("/login");
    } else if (user && isAuthPage) {
      router.push("/");
    }
  }, [user, isLoading, isProtectedPage, isAuthPage, router]);

  const value = {
    user: user || null,
    isLoading: shouldBlockOnAuth,
    logout,
    mutate,
  };

  if (shouldBlockOnAuth) {
    return <div className="p-8">Loading...</div>;
  }

  // Suppress auth fallback errors in the console to keep it clean.

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
