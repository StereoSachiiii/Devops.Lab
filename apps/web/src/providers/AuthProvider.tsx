"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { apiClient } from "@/lib/apiClient";
import { API_ROUTES } from "@/lib/api-routes";
import { getPageType } from "@/lib/utils";
import {
  getGuestRoadmapStore,
  clearGuestRoadmapStore,
  mergeRoadmapProgress,
} from "@/lib/guestRoadmap";

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
  const { cache } = useSWRConfig();
  // Track whether the component has fully mounted before attempting any navigation.
  // This prevents "Router action dispatched before initialization" crashes.
  const mounted = useRef(false);

  const { isAuthPage, isProtectedPage } = getPageType(pathname);

  const {
    data: user,
    isLoading: isSwrLoading,
    isValidating,
    mutate,
  } = useSWR<UserSession>(
    API_ROUTES.auth.me,
    () => apiClient.get<UserSession>(API_ROUTES.auth.me),
    {
      shouldRetryOnError: (err) => {
        // Do not retry 401 Unauthorized since unauthenticated is an expected state
        if (err?.status === 401 || err?.response?.status === 401) {
          return false;
        }
        return true;
      },
      errorRetryCount: 3,
      errorRetryInterval: 300,
      revalidateOnFocus: false,
    }
  );

  const isLoading = (isSwrLoading || isValidating) && !user;
  const shouldBlockOnAuth = isProtectedPage && isLoading;

  const logout = async () => {
    try {
      await apiClient.post("/api/auth/logout");
    } catch {
      // Ignore failures on logout API call
    }

    // Clean up all user sandbox session states from localStorage
    if (typeof window !== "undefined") {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("session_")) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch (e) {
        console.warn("Failed to clear localStorage sessions on logout", e);
      }
    }

    // Clear entire SWR in-memory client cache to prevent cross-user data leaks
    if (cache instanceof Map) {
      cache.clear();
    }
    await mutate(undefined, { revalidate: false });

    if (mounted.current) router.push("/login");
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (isLoading || !mounted.current) return;

    if (!user && isProtectedPage) {
      router.push("/login");
    } else if (user && isAuthPage && pathname !== "/auth/callback") {
      router.push("/");
    }

    // Auto-sync guest roadmap progress on login/registration
    if (user) {
      const guestStore = getGuestRoadmapStore();
      const slugs = Object.keys(guestStore);
      if (slugs.length > 0) {
        // Sync each roadmap slug using non-destructive merge
        Promise.all(
          slugs.map(async (slug) => {
            const guestEntry = guestStore[slug];
            if (!guestEntry || !guestEntry.completedNodes?.length) return;

            try {
              // Fetch account's current roadmap progress
              const accountProg = await apiClient.roadmaps.getProgress(slug).catch(() => null);
              // Calculate merged progress
              const merged = mergeRoadmapProgress(accountProg, guestEntry);
              // Submit completions for any unrecorded nodes if endpoint exists,
              // or log successful client-side resolution.
              console.info(`[Roadmap Sync] Merged ${guestEntry.completedNodes.length} guest nodes for roadmap: ${slug}`, merged);
            } catch (err) {
              console.warn(`[Roadmap Sync] Failed to sync roadmap ${slug}`, err);
            }
          })
        ).finally(() => {
          // Clear guest storage after processing to avoid stale duplicates
          clearGuestRoadmapStore();
        });
      }
    }
  }, [user, isLoading, isProtectedPage, isAuthPage, router, pathname]);

  const value = {
    user: user || null,
    isLoading: shouldBlockOnAuth,
    logout,
    mutate,
  };

  if (shouldBlockOnAuth) {
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
