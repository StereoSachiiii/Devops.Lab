"use client";

import useSWR from "swr";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { Bookmark, Users, CheckCircle2, ArrowUpRight } from "lucide-react";
import type { BookmarkedChallenge, FollowedUser } from "@/lib/api-types";
import { useState } from "react";

export function SocialTab() {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<"bookmarks" | "following">("bookmarks");

  const { data: bookmarks, isLoading: loadingBookmarks } = useSWR<BookmarkedChallenge[]>(
    user && subTab === "bookmarks" ? "/api/users/me/bookmarks" : null,
    () => apiClient.users.getBookmarks()
  );

  const { data: following, isLoading: loadingFollowing } = useSWR<FollowedUser[]>(
    user && subTab === "following" ? "/api/users/me/following" : null,
    () => apiClient.users.getFollowing()
  );

  const getDifficultyBadge = (diff: string) => {
    switch (diff) {
      case "EASY":
        return "bg-teal/10 text-teal border-teal/20";
      case "MEDIUM":
        return "bg-amber/10 text-amber border-amber/20";
      case "HARD":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      default:
        return "bg-panel-border/30 text-panel-muted border-panel-border";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Sub-tab selection */}
      <div className="flex items-center gap-3 border-b border-panel-border pb-3">
        <button
          onClick={() => setSubTab("bookmarks")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-mono text-xs transition-colors ${
            subTab === "bookmarks"
              ? "bg-amber/15 text-amber border border-amber/40 font-semibold"
              : "text-panel-muted hover:text-panel-text"
          }`}
        >
          <Bookmark size={14} />
          <span>Saved Challenges {bookmarks ? `(${bookmarks.length})` : ""}</span>
        </button>
        <button
          onClick={() => setSubTab("following")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-mono text-xs transition-colors ${
            subTab === "following"
              ? "bg-amber/15 text-amber border border-amber/40 font-semibold"
              : "text-panel-muted hover:text-panel-text"
          }`}
        >
          <Users size={14} />
          <span>Following {following ? `(${following.length})` : ""}</span>
        </button>
      </div>

      {/* Bookmarks Section */}
      {subTab === "bookmarks" && (
        <div>
          {loadingBookmarks ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !bookmarks || bookmarks.length === 0 ? (
            <div className="p-10 text-center bg-panel-2 border border-panel-border rounded-2xl">
              <Bookmark className="w-8 h-8 text-panel-muted mx-auto mb-3 opacity-60" />
              <h3 className="font-space font-semibold text-panel-text text-base mb-1">
                No Bookmarked Challenges
              </h3>
              <p className="text-panel-muted text-xs font-mono max-w-sm mx-auto mb-4">
                Bookmark production outage scenarios and diagnostic puzzles to build your personalized reference library.
              </p>
              <Link
                href="/challenges"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-panel border border-panel-border text-xs font-mono text-panel-text hover:border-amber transition-colors"
              >
                <span>Browse Challenges</span>
                <ArrowUpRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bookmarks.map((challenge) => (
                <div
                  key={challenge.id}
                  className="p-5 bg-panel-2 border border-panel-border rounded-2xl flex flex-col justify-between hover:border-amber/40 transition-colors group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-semibold ${getDifficultyBadge(
                          challenge.difficulty
                        )}`}
                      >
                        {challenge.difficulty}
                      </span>
                      <span className="text-xs font-mono text-amber font-semibold">
                        +{challenge.xp} XP
                      </span>
                    </div>
                    <h4 className="font-space font-bold text-base text-panel-text group-hover:text-amber transition-colors mb-2">
                      {challenge.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs font-mono text-panel-muted mb-4">
                      <span>Category: {challenge.category}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-panel-border/60 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {challenge.tags?.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded bg-panel border border-panel-border text-[10px] font-mono text-panel-muted"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <Link
                      href={`/challenges/${challenge.id}`}
                      className="inline-flex items-center gap-1 text-xs font-mono text-amber hover:underline shrink-0"
                    >
                      <span>Launch</span>
                      <ArrowUpRight size={13} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Following Section */}
      {subTab === "following" && (
        <div>
          {loadingFollowing ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !following || following.length === 0 ? (
            <div className="p-10 text-center bg-panel-2 border border-panel-border rounded-2xl">
              <Users className="w-8 h-8 text-panel-muted mx-auto mb-3 opacity-60" />
              <h3 className="font-space font-semibold text-panel-text text-base mb-1">
                Not Following Anyone Yet
              </h3>
              <p className="text-panel-muted text-xs font-mono max-w-sm mx-auto mb-4">
                Connect with peer SREs and platform engineers on the global leaderboard to see their incident solutions in your activity feed.
              </p>
              <Link
                href="/leaderboard"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-panel border border-panel-border text-xs font-mono text-panel-text hover:border-amber transition-colors"
              >
                <span>View Leaderboard</span>
                <ArrowUpRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {following.map((person) => {
                const pInitials = person.name ? person.name.slice(0, 2).toUpperCase() : "AN";
                return (
                  <div
                    key={person.id}
                    className="p-5 bg-panel-2 border border-panel-border rounded-2xl flex items-center justify-between gap-4 hover:border-amber/40 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {person.avatarUrl ? (
                        <img
                          src={person.avatarUrl}
                          alt=""
                          className="w-11 h-11 rounded-full object-cover border border-panel-border shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-amber/15 border border-amber/30 text-amber flex items-center justify-center font-space font-bold text-sm shrink-0">
                          {pInitials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="font-space text-sm font-semibold text-panel-text truncate">
                          {person.name || person.username || "Engineer"}
                        </h4>
                        <div className="text-xs font-mono text-panel-muted truncate">
                          {person.jobTitle || `${person.xp || 0} XP`}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal/10 border border-teal/20 text-teal text-[11px] font-mono">
                      <CheckCircle2 size={12} />
                      <span>Following</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
