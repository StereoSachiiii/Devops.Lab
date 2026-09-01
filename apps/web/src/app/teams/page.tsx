"use client";

import { TeamOverview } from "@/components/teams/TeamOverview";
import { TeamMembersList } from "@/components/teams/TeamMembersList";
import { CustomScenarios } from "@/components/teams/CustomScenarios";
import { TeamAssignmentMatrix } from "@/components/teams/TeamAssignmentMatrix";
import { Building2 } from "lucide-react";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";

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
  const { data: org, error, isLoading } = useSWR<OrgInfo>(
    "/api/orgs/me",
    () => apiClient.get<OrgInfo>("/api/orgs/me"),
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
            <a
              href="/dashboard"
              className="w-full py-2.5 px-4 rounded-xl bg-teal text-bg font-semibold text-sm hover:bg-teal/90 transition-colors shadow-sm text-center no-underline"
            >
              Back to Dashboard
            </a>
          </div>
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
            <div className="bg-panel border border-panel-border rounded-xl p-6 h-full flex flex-col justify-center items-center text-center">
              <div className="w-16 h-16 bg-panel-2 rounded-full border border-panel-border flex items-center justify-center mb-4">
                <span className="text-[24px]">📈</span>
              </div>
              <h3 className="font-space font-semibold text-[17px] text-panel-text mb-2">Team Analytics</h3>
              <p className="text-[14px] text-panel-muted mb-6">
                Connect your organization's Slack or email to receive weekly skill reports and training velocity.
              </p>
              <button className="bg-teal text-bg px-4 py-2 rounded-lg font-semibold text-[13px] hover:bg-teal/90 transition-colors shadow-sm">
                Configure Integration
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <CustomScenarios />
        </div>
      </div>
    </div>
  );
}
