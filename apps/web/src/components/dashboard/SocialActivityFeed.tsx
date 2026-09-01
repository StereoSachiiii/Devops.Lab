"use client";

import useSWR from "swr";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { Users, CheckCircle2, Award, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FeedItem {
  id: string;
  type: "CHALLENGE_SOLVED" | "BADGE_EARNED";
  user: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    jobTitle: string | null;
  };
  challenge?: {
    id: string;
    title: string;
    difficulty: string;
    category: string;
    xp: number;
  };
  badge?: {
    id: string;
    title: string;
    description: string;
    iconRef: string;
  };
  timestamp: string;
}

export function SocialActivityFeed() {
  const { data, isLoading } = useSWR<{ feed: FeedItem[] }>(
    "/api/users/me/feed",
    (url: string) => apiClient.get(url) as Promise<{ feed: FeedItem[] }>
  );

  if (isLoading) {
    return (
      <div className="bg-panel border border-panel-border rounded-xl p-6">
        <h3 className="font-space font-medium text-panel-text mb-4 flex items-center gap-2">
          <Users size={16} className="text-teal" /> Network Activity
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-panel-2 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const items = data?.feed || [];

  if (items.length === 0) {
    return (
      <div className="bg-panel border border-panel-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-space font-medium text-panel-text flex items-center gap-2">
            <Users size={16} className="text-teal" /> Network Activity
          </h3>
          <Link
            href="/community"
            className="text-[11px] font-mono text-teal hover:underline flex items-center gap-1"
          >
            Find Engineers <ArrowRight size={11} />
          </Link>
        </div>
        <p className="font-mono text-xs text-panel-muted leading-relaxed mb-4">
          Follow other engineers across the platform to see their completions, streak milestones, and earned badges here.
        </p>
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-2 border border-panel-border text-xs font-mono text-panel-text hover:border-teal/40 hover:text-teal transition-all"
        >
          <Users size={13} />
          <span>Discover Community Members</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-panel-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-space font-medium text-panel-text flex items-center gap-2">
          <Users size={16} className="text-teal" /> Following Activity
        </h3>
        <span className="font-mono text-xs text-panel-muted">{items.length} updates</span>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const initials = (item.user.name ?? item.user.username ?? "U")
            .slice(0, 2)
            .toUpperCase();

          return (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-panel-2 border border-panel-border/60 hover:border-panel-border transition-colors"
            >
              {item.user.avatarUrl ? (
                <img
                  src={item.user.avatarUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover shrink-0 border border-panel-border"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-panel-border flex items-center justify-center font-mono text-xs font-bold text-teal shrink-0">
                  {initials}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/profile/${item.user.username || item.user.id}`}
                    className="font-mono text-xs font-semibold text-panel-text hover:text-teal transition-colors truncate"
                  >
                    {item.user.name || item.user.username}
                  </Link>
                  <span className="font-mono text-[10px] text-panel-muted shrink-0">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </span>
                </div>

                {item.type === "CHALLENGE_SOLVED" && item.challenge && (
                  <p className="font-mono text-xs text-panel-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    <span>Solved</span>
                    <Link
                      href={`/challenges/${item.challenge.id}`}
                      className="text-panel-text hover:text-teal font-medium transition-colors underline decoration-panel-border hover:decoration-teal"
                    >
                      {item.challenge.title}
                    </Link>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-panel border border-panel-border text-amber">
                      +{item.challenge.xp} XP
                    </span>
                  </p>
                )}

                {item.type === "BADGE_EARNED" && item.badge && (
                  <p className="font-mono text-xs text-panel-muted mt-0.5 flex items-center gap-1.5">
                    <Award size={12} className="text-amber shrink-0" />
                    <span>Unlocked badge</span>
                    <span className="text-panel-text font-medium">
                      {item.badge.iconRef} {item.badge.title}
                    </span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
