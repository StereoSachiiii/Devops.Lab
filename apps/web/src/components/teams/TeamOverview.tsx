"use client";

import { Users, PlayCircle, Award, TrendingUp } from "lucide-react";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";

interface TeamAnalytics {
  totalEngineers: number;
  activeSandboxes: number;
  highResourceSandboxes: number;
  avgSkillScore: number;
  pathsCompleted: number;
  pathsCompletedThisWeek: number;
  scoreChangeLastWeek: number;
  engineersAddedThisMonth: number;
}

export function TeamOverview() {
  const { data: stats } = useSWR<TeamAnalytics>(
    "/api/orgs/me/analytics",
    () => apiClient.get<TeamAnalytics>("/api/orgs/me/analytics")
  );

  const metrics = [
    {
      title: "Total Engineers",
      value: stats ? String(stats.totalEngineers) : "...",
      change: stats ? `+${stats.engineersAddedThisMonth} this month` : "...",
      icon: <Users className="w-5 h-5 text-teal" />,
    },
    {
      title: "Active Sandboxes",
      value: stats ? String(stats.activeSandboxes) : "...",
      change: stats ? `${stats.highResourceSandboxes} high resource` : "...",
      icon: <PlayCircle className="w-5 h-5 text-amber" />,
    },
    {
      title: "Avg Skill Score",
      value: stats ? String(stats.avgSkillScore) : "...",
      change: stats ? `+${stats.scoreChangeLastWeek} pts from last week` : "...",
      icon: <Award className="w-5 h-5 text-[#8b5cf6]" />,
    },
    {
      title: "Paths Completed",
      value: stats ? String(stats.pathsCompleted) : "...",
      change: stats ? `${stats.pathsCompletedThisWeek} this week` : "...",
      icon: <TrendingUp className="w-5 h-5 text-[#3b82f6]" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {metrics.map((m, i) => (
        <div
          key={i}
          className="bg-panel border border-panel-border rounded-xl p-5 hover:border-panel-muted transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-panel-muted text-[14px] font-medium">{m.title}</h3>
            <div className="bg-panel-2 p-2 rounded-lg border border-panel-border">
              {m.icon}
            </div>
          </div>
          <div className="font-space text-[32px] font-bold text-panel-text mb-1">
            {m.value}
          </div>
          <div className="text-[13px] text-panel-muted">{m.change}</div>
        </div>
      ))}
    </div>
  );
}
