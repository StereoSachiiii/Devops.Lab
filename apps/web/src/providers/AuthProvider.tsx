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

  const { data: user, isLoading, mutate } = useSWR<UserSession>(
    "/api/auth/me",
    () => apiClient.get<UserSession>("/api/auth/me"),
    {
      shouldRetryOnError: false,
      revalidateOnFocus: true,
    }
  );

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

    const authPages = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];
    const isAuthPage = authPages.some((p) => pathname.startsWith(p));

    if (!user && !isAuthPage) {
      router.push("/login");
    } else if (user && isAuthPage) {
      router.push("/");
    }
  }, [user, isLoading, pathname, router]);

  const value = {
    user: user || null,
    isLoading,
    logout,
    mutate,
  };

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
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
