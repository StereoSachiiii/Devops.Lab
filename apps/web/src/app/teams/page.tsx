"use client";

import { TeamOverview } from "@/components/teams/TeamOverview";
import { TeamMembersList } from "@/components/teams/TeamMembersList";
import { CustomScenarios } from "@/components/teams/CustomScenarios";
import { TeamAssignmentMatrix } from "@/components/teams/TeamAssignmentMatrix";
import { Building2 } from "lucide-react";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";

import { useState } from "react";
import { CreateOrgModal } from "@/components/teams/CreateOrgModal";
import { TeamLeaderboard } from "@/components/teams/TeamLeaderboard";

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  seatsPurchased: number;
  seatsUsed: number;
  myRole: string;
}

export default function TeamsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data: org, error, isLoading, mutate } = useSWR<OrgInfo>(
    "/api/orgs/me",
    () => apiClient.org.getMe(),
    {
      shouldRetryOnError: false,
      revalidateOnFocus: false,
    }
  );

  if (isLoading) {
    return (
      <div className="flex-1 bg-bg min-h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-panel-muted font-mono text-sm animate-pulse">Loading organization...</div>
      </div>
    );
  }

  if (error || !org || !org.id) {
    return (
      <div className="flex-1 bg-bg min-h-[calc(100vh-64px)] py-16 px-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-panel border border-panel-border rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-amber/10 border border-amber/20 flex items-center justify-center mx-auto mb-5 text-amber">
            <Building2 className="w-7 h-7" />
          </div>
          <h2 className="font-space text-2xl font-bold text-panel-text mb-2">
            No Organization Found
          </h2>
          <p className="text-panel-muted text-sm leading-relaxed mb-6">
            You are not currently a member of any organization or enterprise team. Join a team with an invite link or create a new organization.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-teal text-[#04241d] font-semibold text-sm hover:scale-[1.02] transition-transform shadow-sm text-center cursor-pointer border-none"
            >
              Create New Organization
            </button>
            <a
              href="/dashboard"
              className="w-full py-2.5 px-4 rounded-xl bg-panel-2 border border-panel-border text-panel-text font-semibold text-sm hover:bg-panel transition-colors text-center no-underline"
            >
              Back to Dashboard
            </a>
          </div>

          <CreateOrgModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => mutate()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-bg min-h-[calc(100vh-64px)] py-10">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal to-amber flex items-center justify-center shadow-lg">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-space text-[28px] font-bold text-panel-text leading-tight">
              {org?.name}
            </h1>
            <p className="text-panel-muted text-[15px]">
              Team Dashboard & Organization Settings ({org?.planTier} Tier)
            </p>
          </div>
        </div>

        <TeamOverview />

        <div className="mb-8">
          <TeamAssignmentMatrix />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <TeamMembersList myRole={org?.myRole} />
          </div>
          <div className="lg:col-span-1">
            <TeamLeaderboard orgId={org?.id || "me"} />
          </div>
        </div>

        <div className="mt-8">
          <CustomScenarios />
        </div>
      </div>
    </div>
  );
}
