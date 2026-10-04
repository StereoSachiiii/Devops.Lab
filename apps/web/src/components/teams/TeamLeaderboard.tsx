"use client";

import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { Trophy, Flame, Users } from "lucide-react";

interface TeamLeaderboardProps {
  orgId: string;
}

export function TeamLeaderboard({ orgId }: TeamLeaderboardProps) {
  const { data, isLoading } = useSWR(
    orgId ? `/api/orgs/${orgId}/leaderboard` : null,
    () => apiClient.dashboard.getOrgLeaderboard(orgId)
  );

  const leaderboard = data?.leaderboard || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="p-8 text-center bg-panel border border-panel-border rounded-xl">
        <Users className="w-8 h-8 text-panel-muted mx-auto mb-2 opacity-60" />
        <h4 className="font-space font-semibold text-panel-text text-sm">No internal rankings yet</h4>
        <p className="text-panel-muted text-xs font-mono mt-1">
          Have team members solve scenarios to populate the internal org leaderboard.
        </p>
      </div>
    );
  }

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <div className="w-6 h-6 rounded-full bg-amber/20 border border-amber/40 text-amber flex items-center justify-center text-xs font-bold font-mono">
            1
          </div>
        );
      case 2:
        return (
          <div className="w-6 h-6 rounded-full bg-slate-300/20 border border-slate-300/40 text-slate-200 flex items-center justify-center text-xs font-bold font-mono">
            2
          </div>
        );
      case 3:
        return (
          <div className="w-6 h-6 rounded-full bg-amber-700/20 border border-amber-700/40 text-amber-500 flex items-center justify-center text-xs font-bold font-mono">
            3
          </div>
        );
      default:
        return <span className="font-mono text-xs text-panel-muted w-6 text-center">{rank}</span>;
    }
  };

  return (
    <div className="bg-panel border border-panel-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-panel-border bg-panel-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber" />
          <h3 className="font-space font-semibold text-panel-text text-base">
            Internal Team Leaderboard
          </h3>
        </div>
        <span className="text-xs font-mono text-panel-muted">
          {leaderboard.length} engineers ranked
        </span>
      </div>

      <div className="divide-y divide-panel-border">
        {leaderboard.map((member: any) => {
          const initials = member.name ? member.name.slice(0, 2).toUpperCase() : "EN";

          return (
            <div
              key={member.id}
              className="px-6 py-3.5 flex items-center justify-between hover:bg-panel-2/50 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                {getRankBadge(member.rank)}
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover border border-panel-border shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-panel-2 border border-panel-border text-teal flex items-center justify-center text-xs font-mono font-bold shrink-0">
                    {initials}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-space text-sm font-semibold text-panel-text">
                      {member.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-panel-2 border border-panel-border text-panel-muted">
                      {member.orgRole}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-panel-muted">
                    {member.jobTitle || "Engineer"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1 text-xs font-mono text-amber">
                  <Flame className="w-3.5 h-3.5" />
                  <span>{member.currentStreak || 0}d</span>
                </div>
                <div className="font-mono text-sm font-bold text-teal min-w-[70px] text-right">
                  {member.xp?.toLocaleString()} XP
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
