"use client";

import { useState } from "react";
import { Trophy, Medal, Flame, Building2 } from "lucide-react";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import Link from "next/link";

interface LeaderboardUser {
  rank: number;
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  xp: number;
  currentStreak?: number;
  badgeCount?: number;
  categorySolves?: number;
  org?: { id: string; name: string; slug: string } | null;
}

interface LeaderboardResponse {
  context: string;
  category?: string;
  orgId?: string | null;
  leaderboard: LeaderboardUser[];
  total: number;
}

const CATEGORIES = [
  { id: "ALL", label: "All Categories" },
  { id: "KUBERNETES", label: "Kubernetes" },
  { id: "DOCKER", label: "Docker" },
  { id: "CICD", label: "CI/CD" },
  { id: "TERRAFORM", label: "Terraform" },
  { id: "BASH", label: "Linux / Bash" },
  { id: "SECURITY", label: "Security" },
  { id: "MONITORING", label: "Monitoring" },
];

export function LeaderboardContent() {
  const [activeCategory, setActiveCategory] = useState("ALL");

  const queryUrl =
    activeCategory === "ALL"
      ? "/api/leaderboard?limit=50"
      : `/api/leaderboard?category=${activeCategory}&limit=50`;

  const { data, error, isLoading } = useSWR<LeaderboardResponse>(queryUrl, () =>
    apiClient.get<LeaderboardResponse>(queryUrl)
  );

  const users = data?.leaderboard || [];

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return <Medal className="w-5 h-5 text-amber" />;
      case 2:
        return <Medal className="w-5 h-5 text-slate-300" />;
      case 3:
        return <Medal className="w-5 h-5 text-amber-700" />;
      default:
        return <span className="font-mono text-sm text-panel-muted font-bold">#{rank}</span>;
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-panel-border">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber/10 border border-amber/20 flex items-center justify-center text-amber">
              <Trophy className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-space font-bold tracking-tight text-panel-text">
              Platform Leaderboard
            </h1>
          </div>
          <p className="text-panel-muted text-sm">
            Top engineers ranked by verified problem-solving XP, streak consistency, and category mastery.
          </p>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-medium whitespace-nowrap transition-colors cursor-pointer border ${
              activeCategory === cat.id
                ? "bg-teal text-black border-teal font-bold shadow-sm"
                : "bg-panel border-panel-border text-panel-muted hover:text-panel-text hover:border-panel-border"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Leaderboard Table */}
      <div className="bg-panel border border-panel-border rounded-2xl overflow-hidden shadow-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-panel-border text-xs font-mono text-panel-muted uppercase tracking-wider bg-panel-2/60">
              <th className="py-3.5 px-6 font-medium w-16 text-center">Rank</th>
              <th className="py-3.5 px-6 font-medium">Engineer</th>
              <th className="py-3.5 px-6 font-medium text-center">Streak</th>
              <th className="py-3.5 px-6 font-medium text-right">Total XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-panel-border">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-panel-muted font-mono text-sm">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-amber border-t-transparent rounded-full animate-spin"></div>
                    Loading top engineers...
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-red-auth font-mono text-sm">
                  Failed to load leaderboard rankings.
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-panel-muted font-mono text-sm">
                  No ranked engineers in this category yet. Be the first to solve a challenge!
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const initials = u.name ? u.name.slice(0, 2).toUpperCase() : "DE";
                return (
                  <tr
                    key={u.id}
                    className="hover:bg-panel-2/40 transition-colors group"
                  >
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center">
                        {getRankBadge(u.rank)}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-panel-2 border border-panel-border flex items-center justify-center font-mono text-xs font-bold text-teal overflow-hidden">
                          {u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            initials
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {u.username ? (
                              <Link
                                href={`/users/${u.username}`}
                                className="font-space font-semibold text-sm text-panel-text hover:text-teal transition-colors"
                              >
                                {u.name}
                              </Link>
                            ) : (
                              <span className="font-space font-semibold text-sm text-panel-text">{u.name}</span>
                            )}
                            {u.org && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-panel-2 border border-panel-border text-panel-muted">
                                <Building2 className="w-2.5 h-2.5" />
                                <span>{u.org.name}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-panel-muted">{u.jobTitle || "Infrastructure Engineer"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="inline-flex items-center gap-1 font-mono text-xs text-amber font-semibold">
                        <Flame className="w-3.5 h-3.5" />
                        <span>{u.currentStreak || 0}d</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="font-mono text-sm font-bold text-teal">
                        {u.xp.toLocaleString()} XP
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
