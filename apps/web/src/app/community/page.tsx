"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { Users, Search, Flame, UserPlus, UserCheck } from "lucide-react";

interface DiscoverUser {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  followersCount: number;
  topBadge: {
    id: string;
    title: string;
    iconRef: string;
  } | null;
  isFollowing: boolean;
  isSelf: boolean;
}

export default function CommunityPage() {
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  const { data, isLoading, mutate } = useSWR<{ users: DiscoverUser[] }>(
    `/api/users/discover${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`,
    (url: string) => apiClient.get(url) as Promise<{ users: DiscoverUser[] }>
  );

  const handleFollowToggle = async (targetId: string, currentStatus: boolean) => {
    if (!currentUser) return;
    setLoadingMap((prev) => ({ ...prev, [targetId]: true }));
    const newStatus = !currentStatus;
    setFollowingMap((prev) => ({ ...prev, [targetId]: newStatus }));

    try {
      await apiClient.post(`/api/users/${targetId}/follow`);
      mutate();
    } catch {
      setFollowingMap((prev) => ({ ...prev, [targetId]: currentStatus }));
    } finally {
      setLoadingMap((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  const users = data?.users || [];

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-6 border-b border-panel-border">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-teal" />
            <span className="font-mono text-xs uppercase tracking-wider text-teal font-semibold">
              Community & Social Graph
            </span>
          </div>
          <h1 className="text-3xl font-space font-bold tracking-tight text-panel-text">
            Discover Engineers
          </h1>
          <p className="text-panel-muted font-mono text-xs mt-1.5 max-w-lg">
            Connect with DevOps, SRE, and platform engineers. Follow peers to track their live challenge solves and streak records.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-panel-muted" />
          <input
            type="text"
            placeholder="Search by name, role, or @handle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-panel border border-panel-border rounded-xl text-xs font-mono text-panel-text placeholder:text-panel-muted focus:outline-none focus:border-teal/60 transition-colors"
          />
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-panel border border-panel-border rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && users.length === 0 && (
        <div className="bg-panel border border-panel-border rounded-2xl p-12 text-center flex flex-col items-center justify-center">
          <Users size={36} className="text-panel-muted mb-3 opacity-40" />
          <h3 className="font-space font-bold text-panel-text mb-1">No engineers found</h3>
          <p className="font-mono text-xs text-panel-muted">
            {searchQuery ? `No active members match "${searchQuery}".` : "No public community profiles registered yet."}
          </p>
        </div>
      )}

      {/* User Grid */}
      {!isLoading && users.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => {
            const isFollowing = followingMap[u.id] !== undefined ? followingMap[u.id] : u.isFollowing;
            const isLoadingFollow = !!loadingMap[u.id];
            const initials = (u.name ?? u.username ?? "U").slice(0, 2).toUpperCase();

            return (
              <div
                key={u.id}
                className="bg-panel border border-panel-border/80 rounded-2xl p-5 flex flex-col justify-between hover:border-panel-border transition-all shadow-sm group"
              >
                <div>
                  {/* Top Bar: Avatar & Follow Button */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <Link
                      href={`/profile/${u.username || u.id}`}
                      className="flex items-center gap-3 group-hover:opacity-95 transition-opacity"
                    >
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="w-12 h-12 rounded-xl object-cover border border-panel-border"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-panel-2 border border-panel-border flex items-center justify-center font-mono font-bold text-sm text-teal">
                          {initials}
                        </div>
                      )}
                      <div>
                        <div className="font-space font-bold text-sm text-panel-text group-hover:text-teal transition-colors truncate max-w-[130px]">
                          {u.name || u.username}
                        </div>
                        <div className="font-mono text-[11px] text-panel-muted truncate max-w-[130px]">
                          @{u.username || "user"}
                        </div>
                      </div>
                    </Link>

                    {!u.isSelf && currentUser && (
                      <button
                        onClick={() => handleFollowToggle(u.id, !!isFollowing)}
                        disabled={isLoadingFollow}
                        className={`px-3 py-1.5 rounded-lg font-mono text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                          isFollowing
                            ? "bg-panel-2 border border-panel-border text-panel-muted hover:border-red/40 hover:text-red hover:bg-red/5"
                            : "bg-teal/10 border border-teal/30 text-teal hover:bg-teal/20"
                        }`}
                      >
                        {isLoadingFollow ? (
                          <span className="animate-spin text-xs">↻</span>
                        ) : isFollowing ? (
                          <>
                            <UserCheck size={12} />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={12} />
                            <span>Follow</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Role / Job Title */}
                  <p className="font-mono text-[11px] text-panel-muted leading-relaxed line-clamp-1 mb-3">
                    {u.jobTitle || "DevOps Practitioner"}
                  </p>
                </div>

                {/* Bottom Stats & Highlights */}
                <div className="pt-3 border-t border-panel-border/60 flex items-center justify-between font-mono text-[11px]">
                  {/* Streak & XP */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-amber">
                      <Flame size={13} className={u.currentStreak > 0 ? "fill-amber/30 animate-pulse" : ""} />
                      <span className="font-bold">{u.currentStreak}d</span>
                    </div>
                    <div className="text-panel-muted">
                      <span className="font-semibold text-panel-text">{u.xp}</span> XP
                    </div>
                  </div>

                  {/* Top Badge or Followers */}
                  {u.topBadge ? (
                    <div className="flex items-center gap-1 text-panel-muted text-[10.5px] max-w-[110px] truncate" title={u.topBadge.title}>
                      <span>{u.topBadge.iconRef}</span>
                      <span className="truncate">{u.topBadge.title}</span>
                    </div>
                  ) : (
                    <div className="text-panel-muted text-[10.5px]">
                      {u.followersCount} follower{u.followersCount === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
