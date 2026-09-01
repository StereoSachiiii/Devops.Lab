"use client";

import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import type { UserProfile, ActiveSession, SecurityLogResponse } from "@devops/types";
import { useAuth } from "@/providers/AuthProvider";
import {
  User,
  Shield,
  Target,
  Award,
  Flame,
  Laptop,
  Key,
  ShieldCheck,
  Mail,
  Bell,
  Download,
  Trash2,
  GitBranch,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";

export function ProfileContent() {
  const { user } = useAuth();
  const router = useRouter();

  // Active tab state
  const [activeTab, setActiveTab] = useState<"overview" | "security" | "preferences">("overview");

  useEffect(() => {
    if (user === null) {
      router.push("/login");
    }
  }, [user, router]);

  // Use the extended user object which includes the new schema fields
  // In a real app we'd fetch from `/api/auth/me` but `useAuth` might already provide it.
  const { data: profile, mutate } = useSWR(user ? "/api/auth/me" : null, () =>
    apiClient.get<UserProfile>("/api/auth/me")
  );

  const { data: sessions } = useSWR(
    user && activeTab === "security" ? "/api/auth/sessions" : null,
    () => apiClient.get<ActiveSession[]>("/api/auth/sessions")
  );

  const { data: securityLog } = useSWR(
    user && activeTab === "security" ? "/api/auth/security-log" : null,
    () => apiClient.get<SecurityLogResponse>("/api/auth/security-log")
  );

  if (!user || !profile)
    return (
      <div className="flex justify-center p-20 text-panel-muted animate-pulse">
        Loading profile...
      </div>
    );

  const initials = profile.name ? profile.name.slice(0, 2).toUpperCase() : "AN";

  return (
    <div className="flex flex-col gap-[30px] p-6 md:p-10 max-w-[1200px] mx-auto w-full animate-fade-in-up">
      {/* ── Header Block ── */}
      <section className="bg-panel border border-panel-border rounded-[24px] p-8 md:p-10 flex flex-col md:flex-row gap-8 items-center md:items-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,157,92,0.1)_0%,transparent_60%)] pointer-events-none transition-opacity duration-1000 group-hover:opacity-100 opacity-50" />

        <div className="relative">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt="Avatar"
              className="w-[120px] h-[120px] rounded-full border-4 border-panel-border object-cover shadow-[0_0_40px_rgba(255,157,92,0.15)]"
            />
          ) : (
            <div className="w-[120px] h-[120px] rounded-full bg-gradient-to-br from-amber to-amber-dim flex items-center justify-center shrink-0 shadow-[0_0_40px_rgba(255,157,92,0.2)]">
              <span className="font-space text-[40px] font-bold text-[#241505]">{initials}</span>
            </div>
          )}
          <div className="absolute -bottom-3 -right-3 bg-panel-2 border border-panel-border p-2 rounded-full shadow-lg">
            <Award size={20} className="text-amber" />
          </div>
        </div>

        <div className="flex-1 text-center md:text-left z-10">
          <div className="flex flex-wrap justify-center md:justify-start items-center gap-3 mb-3">
            <h1 className="font-space text-[36px] font-bold text-panel-text tracking-tight">
              {profile.name || "Anonymous User"}
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-[rgba(255,157,92,0.1)] text-amber border border-[rgba(255,157,92,0.2)] shadow-[0_0_15px_rgba(255,157,92,0.1)]">
              {profile.role} PLAN
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-panel-muted font-mono text-sm mb-6">
            <div className="flex items-center gap-2">
              <Mail size={14} />
              {profile.email}
            </div>
            {profile.jobTitle && (
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-panel-muted/50" />
                {profile.jobTitle}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-panel-muted/50" />
              Member since{" "}
              {profile.createdAt ? format(new Date(profile.createdAt), "MMMM yyyy") : "Unknown"}
            </div>
          </div>
        </div>
      </section>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-6 border-b border-panel-border overflow-x-auto no-scrollbar">
        {[
          { id: "overview", label: "Overview", icon: User },
          { id: "security", label: "Security & Devices", icon: ShieldCheck },
          { id: "preferences", label: "Preferences", icon: Bell },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 pb-4 px-2 font-mono text-sm transition-all relative ${activeTab === tab.id ? "text-amber font-semibold" : "text-panel-muted hover:text-panel-text"}`}
          >
            <tab.icon size={16} />
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber shadow-[0_-2px_10px_rgba(255,157,92,0.5)] rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="min-h-[400px]">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            {/* Stats Column */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-panel-2 border border-panel-border rounded-2xl p-6 relative overflow-hidden group hover:border-[rgba(255,157,92,0.3)] transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[rgba(255,157,92,0.1)] flex items-center justify-center text-amber">
                      <Target size={20} />
                    </div>
                  </div>
                  <div className="text-panel-muted font-mono text-sm mb-1 uppercase tracking-wider">
                    Total XP
                  </div>
                  <div className="text-3xl font-space font-bold text-panel-text">
                    {profile.xp?.toLocaleString() || 0}
                  </div>
                  <div className="absolute -bottom-10 -right-10 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                    <Target size={120} />
                  </div>
                </div>

                <div className="bg-panel-2 border border-panel-border rounded-2xl p-6 relative overflow-hidden group hover:border-[rgba(255,107,107,0.3)] transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[rgba(255,107,107,0.1)] flex items-center justify-center text-[var(--color-red)]">
                      <Flame size={20} />
                    </div>
                  </div>
                  <div className="text-panel-muted font-mono text-sm mb-1 uppercase tracking-wider">
                    Current Streak
                  </div>
                  <div className="text-3xl font-space font-bold text-panel-text">
                    {profile.currentStreak || 0}{" "}
                    <span className="text-lg text-panel-muted font-normal">days</span>
                  </div>
                  <div className="absolute -bottom-10 -right-10 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
                    <Flame size={120} />
                  </div>
                </div>
              </div>

              {/* Badges Grid Showcase */}
              <div className="bg-panel-2 border border-panel-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Award size={18} className="text-amber" />
                    <h3 className="font-space text-lg font-bold">Badges & Achievements</h3>
                  </div>
                  <span className="text-panel-muted font-mono text-xs px-2.5 py-1 rounded-full bg-panel border border-panel-border">
                    {profile.badges?.length || 0} unlocked
                  </span>
                </div>
                {(profile.badges?.length ?? 0) > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                    {profile.badges?.map((userBadge: any) => (
                      <div
                        key={userBadge.badge.id}
                        className="bg-panel/90 border border-panel-border/80 rounded-xl p-4 flex items-start gap-3.5 hover:border-amber/40 hover:bg-panel transition-all shadow-sm group"
                      >
                        <div className="w-11 h-11 rounded-xl bg-amber/10 border border-amber/25 flex items-center justify-center text-amber text-2xl shrink-0 group-hover:scale-105 transition-transform">
                          {userBadge.badge.iconRef?.length > 2 ? (
                            <img src={userBadge.badge.iconRef} alt="" className="w-7 h-7" />
                          ) : (
                            userBadge.badge.iconRef || "🏆"
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-panel-text group-hover:text-amber transition-colors truncate">
                            {userBadge.badge.title}
                          </div>
                          <p className="text-[11px] text-panel-muted font-mono leading-tight mt-0.5 line-clamp-2">
                            {userBadge.badge.description || "Earned via engineering milestones."}
                          </p>
                          <div className="text-[10px] font-mono text-teal mt-2">
                            Unlocked {format(new Date(userBadge.earnedAt), "MMM d, yyyy")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-panel-border rounded-xl text-panel-muted">
                    <Award size={32} className="mb-3 opacity-50" />
                    <p className="font-mono text-sm">No badges earned yet.</p>
                    <p className="text-xs mt-1">Complete challenges and build daily streaks to unlock badges.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Column */}
            <div className="flex flex-col gap-6">
              <div className="bg-panel-2 border border-panel-border rounded-2xl p-6">
                <h3 className="font-space text-lg font-bold mb-6">Identity</h3>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-panel border border-panel-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center">
                        <GitBranch size={16} />
                      </div>
                      <span className="font-mono text-sm">GitHub</span>
                    </div>
                    {profile.githubId ? (
                      <span className="text-xs font-mono text-teal">Connected</span>
                    ) : (
                      <span className="text-xs font-mono text-panel-muted">Not Connected</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-panel border border-panel-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center">
                        <Mail size={16} />
                      </div>
                      <span className="font-mono text-sm">Email Status</span>
                    </div>
                    {profile.emailVerified ? (
                      <span className="text-xs font-mono text-teal">Verified</span>
                    ) : (
                      <span className="text-xs font-mono text-amber">Pending</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-panel border border-panel-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center">
                        <Shield size={16} />
                      </div>
                      <span className="font-mono text-sm">Password</span>
                    </div>
                    {profile.hasPassword ? (
                      <button className="text-xs font-mono text-amber hover:underline">
                        Change
                      </button>
                    ) : (
                      <span className="text-xs font-mono text-panel-muted">OAuth Only</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECURITY TAB */}
        {activeTab === "security" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Active Sessions */}
            <div className="bg-panel-2 border border-panel-border rounded-2xl p-6">
              <h3 className="font-space text-lg font-bold mb-6 flex items-center gap-2">
                <Laptop size={18} className="text-amber" />
                Active Devices
              </h3>

              <div className="flex flex-col gap-3">
                {!sessions ? (
                  <div className="py-4 text-center text-panel-muted font-mono text-sm">
                    Loading sessions...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="py-4 text-center text-panel-muted font-mono text-sm">
                    No active sessions.
                  </div>
                ) : (
                  sessions.map((session: any) => (
                    <div
                      key={session.id}
                      className="p-4 rounded-xl bg-panel border border-panel-border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-bold text-sm mb-1">
                          {session.userAgent || "Unknown Device"}
                        </div>
                        <div className="text-xs font-mono text-panel-muted flex flex-wrap gap-x-4 gap-y-1">
                          <span>IP: {session.ip || "Unknown"}</span>
                          <span>
                            Last seen: {formatDistanceToNow(new Date(session.lastSeenAt))} ago
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm("Revoke this session?")) {
                            await apiClient.post(`/api/auth/sessions/${session.id}/revoke`);
                            mutate();
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[rgba(255,107,107,0.1)] text-[var(--color-red)] text-xs font-mono hover:bg-[rgba(255,107,107,0.2)] transition-colors self-start sm:self-auto shrink-0"
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Security Log */}
            <div className="bg-panel-2 border border-panel-border rounded-2xl p-6">
              <h3 className="font-space text-lg font-bold mb-6 flex items-center gap-2">
                <Key size={18} className="text-amber" />
                Security Log
              </h3>

              <div className="flex flex-col gap-0 border-l border-panel-border ml-2">
                {!securityLog ? (
                  <div className="py-4 pl-6 text-panel-muted font-mono text-sm">
                    Loading logs...
                  </div>
                ) : securityLog.logs?.length === 0 ? (
                  <div className="py-4 pl-6 text-panel-muted font-mono text-sm">
                    No security events found.
                  </div>
                ) : (
                  securityLog.logs?.map((log: any) => (
                    <div key={log.id} className="relative pl-6 pb-6 last:pb-0">
                      <div className="absolute left-[-5px] top-1 w-[9px] h-[9px] rounded-full bg-panel border-2 border-panel-muted" />
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-sm font-bold">{log.action}</span>
                        <span className="text-xs text-panel-muted font-mono">
                          {formatDistanceToNow(new Date(log.createdAt))} ago
                        </span>
                      </div>
                      <div className="text-xs text-panel-muted">
                        {log.ip && <span className="mr-3">IP: {log.ip}</span>}
                        {log.userAgent && (
                          <span className="truncate block mt-1 opacity-70 max-w-full overflow-hidden text-ellipsis">
                            {log.userAgent}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* PREFERENCES TAB */}
        {activeTab === "preferences" && (
          <div className="flex flex-col gap-6 animate-fade-in max-w-2xl">
            <div className="bg-panel-2 border border-panel-border rounded-2xl p-6">
              <h3 className="font-space text-lg font-bold mb-6">Email Notifications</h3>

              <div className="flex flex-col gap-6">
                {/* Example Toggles (UI only for now, wire to API in real app) */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-sm mb-1">Weekly Digest</div>
                    <div className="text-xs text-panel-muted">
                      Get a summary of your learning progress and new challenges.
                    </div>
                  </div>
                  <button className="w-10 h-6 bg-amber rounded-full relative flex-shrink-0 transition-colors">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                  </button>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-sm mb-1">Product Updates</div>
                    <div className="text-xs text-panel-muted">
                      Occasional announcements about new features and major content drops.
                    </div>
                  </div>
                  <button className="w-10 h-6 bg-panel border border-panel-border rounded-full relative flex-shrink-0 transition-colors">
                    <div className="absolute left-1 top-1 w-4 h-4 bg-panel-muted rounded-full shadow-sm" />
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-panel-2 border border-[rgba(255,107,107,0.3)] rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--color-red)]" />
              <h3 className="font-space text-lg font-bold mb-2 flex items-center gap-2 text-[var(--color-red)]">
                <AlertTriangle size={18} />
                Danger Zone
              </h3>
              <p className="text-sm text-panel-muted mb-6">
                Actions here are permanent and cannot be undone.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <button className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-panel border border-panel-border font-mono text-sm hover:bg-panel-2 transition-colors">
                  <Download size={16} />
                  Export Data
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.2)] text-[var(--color-red)] font-mono text-sm hover:bg-[rgba(255,107,107,0.2)] transition-colors">
                  <Trash2 size={16} />
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
