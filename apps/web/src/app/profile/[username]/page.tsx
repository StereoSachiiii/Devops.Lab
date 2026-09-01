"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import {
  MapPin,
  Link2,
  Calendar,
  Flame,
  Zap,
  UserPlus,
  UserCheck,
  Star,
  CheckCircle2,
  Globe,
  Shield,
  Terminal,
  Cpu,
  GitBranch,
  Award,
  ArrowLeft,
} from "lucide-react";

interface PublicProfile {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  jobTitle: string | null;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  badges: { badge: { id: string; slug: string; title: string; iconRef: string; description: string }; earnedAt: string }[];
  completedChallenges: { id: string; title: string; difficulty: string; category: string; xp: number }[];
  articleLikes: { article: { id: string; slug: string; title: string; category: string } }[];
}

const difficultyColors: Record<string, string> = {
  JUNIOR: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  MID: "text-amber border-amber/30 bg-amber/10",
  SENIOR: "text-red border-red/30 bg-red/10",
};

const categoryIcons: Record<string, React.ReactNode> = {
  KUBERNETES: <Globe size={13} />,
  DOCKER: <Terminal size={13} />,
  CICD: <GitBranch size={13} />,
  TERRAFORM: <Cpu size={13} />,
  BASH: <Terminal size={13} />,
  SECURITY: <Shield size={13} />,
  MONITORING: <Zap size={13} />,
};

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3 bg-panel-2/60 border border-panel-border/60 rounded-xl min-w-[80px]">
      <div className="text-teal">{icon}</div>
      <div className="font-space font-black text-lg text-panel-text tabular-nums">{value}</div>
      <div className="font-mono text-[10px] text-panel-muted uppercase tracking-wider">{label}</div>
    </div>
  );
}

export default function PublicProfilePage() {
  const params = useParams();
  const username = (params && typeof params["username"] === "string" ? params["username"] : "") || "";
  const { user: selfUser } = useAuth();

  const { data: profile, isLoading, error, mutate } = useSWR<PublicProfile>(
    username ? `/api/users/${username}/profile` : null,
    () => apiClient.get<PublicProfile>(`/api/users/${username}/profile`)
  );

  // Follow state
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [followLoading, setFollowLoading] = useState(false);

  const currentFollowing = following !== null ? following : (profile?.isFollowing ?? false);
  const currentFollowers = followerCount !== null ? followerCount : (profile?.followersCount ?? 0);

  const handleFollow = useCallback(async () => {
    if (!selfUser || !profile) return;
    setFollowLoading(true);
    try {
      const res = await apiClient.post<{ following: boolean; followingCount: number; followersCount: number }>(
        `/api/users/${profile.id}/follow`
      );
      setFollowing(res.following);
      setFollowerCount(res.followersCount);
      mutate();
    } catch {
      // ignore
    } finally {
      setFollowLoading(false);
    }
  }, [selfUser, profile, mutate]);

  const isSelf = selfUser && profile && selfUser.id === profile.id;

  const [activeSection, setActiveSection] = useState<"challenges" | "articles">("challenges");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg py-12 px-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-10">
          <div className="w-20 h-20 rounded-full bg-panel-border/50 animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-6 w-40 bg-panel-border/50 rounded animate-pulse" />
            <div className="h-4 w-60 bg-panel-border/30 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-panel-border/20 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center p-10 border border-panel-border rounded-2xl bg-panel max-w-sm">
          <div className="text-4xl mb-4">👤</div>
          <h2 className="font-space font-bold text-panel-text mb-2">Profile Not Found</h2>
          <p className="font-mono text-xs text-panel-muted mb-6">
            This profile is private or doesn't exist.
          </p>
          <Link href="/" className="text-teal font-mono text-xs hover:underline">← Go home</Link>
        </div>
      </div>
    );
  }

  const initials = profile.name
    ? profile.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : (profile.username?.[0] ?? "U").toUpperCase();

  return (
    <div className="min-h-screen bg-bg text-panel-text py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-2 font-mono text-xs text-panel-muted hover:text-teal transition-colors">
          <ArrowLeft size={13} /> Back
        </Link>

        {/* Profile Hero */}
        <div className="bg-panel border border-panel-border rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name ?? profile.username}
                  className="w-20 h-20 rounded-full object-cover border-2 border-panel-border"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-teal to-blue-500 flex items-center justify-center font-space font-black text-bg text-2xl">
                  {initials}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="font-space font-black text-2xl text-panel-text">
                    {profile.name ?? profile.username}
                  </h1>
                  {profile.username && (
                    <p className="font-mono text-sm text-panel-muted">@{profile.username}</p>
                  )}
                  {profile.jobTitle && (
                    <p className="font-mono text-xs text-teal mt-0.5">{profile.jobTitle}</p>
                  )}
                </div>

                {/* Follow / Edit */}
                {isSelf ? (
                  <Link
                    href="/settings"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-panel-border bg-panel-2 text-panel-muted font-mono text-xs hover:border-teal/40 hover:text-teal transition-all"
                  >
                    Edit Profile
                  </Link>
                ) : (
                  <button
                    id="follow-btn"
                    onClick={handleFollow}
                    disabled={followLoading || !selfUser}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border font-mono text-xs font-semibold transition-all duration-200 ${
                      currentFollowing
                        ? "border-teal/40 bg-teal/10 text-teal"
                        : "border-panel-border bg-panel-2 text-panel-muted hover:border-teal/40 hover:text-teal"
                    }`}
                  >
                    {currentFollowing ? <UserCheck size={13} /> : <UserPlus size={13} />}
                    {currentFollowing ? "Following" : "Follow"}
                  </button>
                )}
              </div>

              {/* Bio */}
              {profile.bio && (
                <p className="mt-3 text-sm text-panel-muted leading-relaxed">{profile.bio}</p>
              )}

              {/* Meta row */}
              <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-panel-muted">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} /> {profile.location}
                  </span>
                )}
                {profile.websiteUrl && (
                  <a
                    href={profile.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-teal transition-colors"
                  >
                    <Link2 size={12} /> {profile.websiteUrl.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <Calendar size={12} /> Joined {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="mt-6 flex flex-wrap gap-3">
            <StatCard label="XP" value={profile.xp.toLocaleString()} icon={<Zap size={16} />} />
            <StatCard label="Streak" value={`${profile.currentStreak}d`} icon={<Flame size={16} />} />
            <StatCard label="Best Streak" value={`${profile.longestStreak}d`} icon={<Flame size={16} className="text-amber" />} />
            <StatCard label="Solved" value={profile.completedChallenges.length} icon={<CheckCircle2 size={16} />} />
            <button
              onClick={() => {}}
              className="flex flex-col items-center gap-1 px-4 py-3 bg-panel-2/60 border border-panel-border/60 rounded-xl min-w-[80px] hover:border-teal/30 transition-all cursor-pointer"
            >
              <div className="text-panel-muted"><Star size={16} /></div>
              <div className="font-space font-black text-lg text-panel-text tabular-nums">{currentFollowers}</div>
              <div className="font-mono text-[10px] text-panel-muted uppercase tracking-wider">Followers</div>
            </button>
            <button
              onClick={() => {}}
              className="flex flex-col items-center gap-1 px-4 py-3 bg-panel-2/60 border border-panel-border/60 rounded-xl min-w-[80px] hover:border-teal/30 transition-all cursor-pointer"
            >
              <div className="text-panel-muted"><UserPlus size={16} /></div>
              <div className="font-space font-black text-lg text-panel-text tabular-nums">{profile.followingCount}</div>
              <div className="font-mono text-[10px] text-panel-muted uppercase tracking-wider">Following</div>
            </button>
          </div>
        </div>

        {/* Badges */}
        {profile.badges.length > 0 && (
          <div className="bg-panel border border-panel-border rounded-2xl p-5 shadow-sm">
            <h2 className="font-space font-bold text-sm text-panel-text mb-4 flex items-center gap-2">
              <Award size={16} className="text-amber" /> Badges
            </h2>
            <div className="flex flex-wrap gap-3">
              {profile.badges.map(({ badge }) => (
                <div
                  key={badge.id}
                  title={badge.description}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-panel-2/60 border border-panel-border/60 hover:border-amber/30 transition-all group"
                >
                  <span className="text-lg">{badge.iconRef}</span>
                  <span className="font-mono text-xs text-panel-muted group-hover:text-panel-text transition-colors">
                    {badge.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Tabs */}
        <div className="bg-panel border border-panel-border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-panel-border/60">
            {(["challenges", "articles"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={`flex-1 py-3 font-mono text-xs font-semibold uppercase tracking-wider transition-all ${
                  activeSection === tab
                    ? "text-teal border-b-2 border-teal bg-teal/5"
                    : "text-panel-muted hover:text-panel-text"
                }`}
              >
                {tab === "challenges" ? `Solved (${profile.completedChallenges.length})` : `Liked Articles (${profile.articleLikes.length})`}
              </button>
            ))}
          </div>

          <div className="p-4">
            {activeSection === "challenges" && (
              <>
                {profile.completedChallenges.length === 0 ? (
                  <p className="text-center font-mono text-xs text-panel-muted py-8">No completed challenges yet.</p>
                ) : (
                  <div className="space-y-2">
                    {profile.completedChallenges.map((c) => (
                      <Link
                        key={c.id}
                        href={`/challenges/${c.id}`}
                        className="flex items-center justify-between p-3 rounded-xl border border-panel-border/60 bg-panel-2/40 hover:border-teal/30 hover:bg-teal/5 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-teal text-panel-muted">{categoryIcons[c.category] ?? <Terminal size={13} />}</span>
                          <div>
                            <div className="font-space font-semibold text-sm text-panel-text group-hover:text-teal transition-colors">
                              {c.title}
                            </div>
                            <div className="font-mono text-[10px] text-panel-muted mt-0.5">{c.category}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md border font-mono text-[10px] font-bold ${difficultyColors[c.difficulty] ?? ""}`}>
                            {c.difficulty}
                          </span>
                          <span className="font-mono text-[11px] text-amber flex items-center gap-1">
                            <Zap size={11} />{c.xp} XP
                          </span>
                          <CheckCircle2 size={14} className="text-teal" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeSection === "articles" && (
              <>
                {profile.articleLikes.length === 0 ? (
                  <p className="text-center font-mono text-xs text-panel-muted py-8">No liked articles yet.</p>
                ) : (
                  <div className="space-y-2">
                    {profile.articleLikes.map(({ article }) => (
                      <Link
                        key={article.id}
                        href={`/articles/${article.slug}`}
                        className="flex items-center justify-between p-3 rounded-xl border border-panel-border/60 bg-panel-2/40 hover:border-teal/30 hover:bg-teal/5 transition-all group"
                      >
                        <div>
                          <div className="font-space font-semibold text-sm text-panel-text group-hover:text-teal transition-colors">
                            {article.title}
                          </div>
                          <div className="font-mono text-[10px] text-panel-muted mt-0.5">{article.category}</div>
                        </div>
                        <span className="text-red">❤️</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
