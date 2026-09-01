"use client";

import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { DashboardData } from "@/lib/api-types";
import { Flame } from "lucide-react";
import { NewUserDashboard } from "./NewUserDashboard";
import { ReturningUserDashboard } from "./ReturningUserDashboard";

export function DashboardContent() {
  const { user } = useAuth();

  const { data: dashboardData, error } = useSWR<DashboardData>(
    user ? "/api/me/dashboard" : null,
    (url: string) => apiClient.get(url) as Promise<DashboardData>
  );

  const greeting = getGreeting();

  if (!dashboardData && !error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-amber border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex justify-between items-end mb-10 pb-6 border-b border-panel-border">
        <div>
          <h1 className="text-3xl font-space font-bold tracking-tight text-panel-text">
            {greeting}, {user?.name?.split(" ")[0] || "there"}
          </h1>
          {dashboardData?.hasActivity && dashboardData.stats.streak === 0 && (
            <p className="text-panel-muted mt-2 font-mono text-sm">
              Welcome back — good to see you again
            </p>
          )}
        </div>

        {/* Streak indicator widget */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 bg-panel border border-panel-border px-4 py-2.5 rounded-xl shadow-sm hover:border-amber/40 transition-colors">
            <div className={`p-1.5 rounded-lg ${dashboardData?.stats.streak ? "bg-amber/10 text-amber" : "bg-panel-border/30 text-panel-muted"}`}>
              <Flame className={`w-5 h-5 ${dashboardData?.stats.streak ? "text-amber fill-amber/20 animate-pulse" : "text-panel-muted"}`} />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-space font-bold text-lg text-panel-text">
                  {dashboardData?.stats.streak || 0}
                </span>
                <span className="font-mono text-xs text-panel-muted">
                  day streak
                </span>
              </div>
              {dashboardData?.stats.longestStreak !== undefined && dashboardData.stats.longestStreak > 0 && (
                <p className="font-mono text-[10px] text-panel-muted">
                  best: <span className="text-panel-text font-semibold">{dashboardData.stats.longestStreak}d</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {dashboardData?.hasActivity ? (
        <ReturningUserDashboard data={dashboardData} />
      ) : (
        <NewUserDashboard />
      )}
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
