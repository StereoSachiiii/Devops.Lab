"use client";

import { ShieldAlert, Database, GitBranch, ArrowRight, Plus } from "lucide-react";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";

interface OrgScenario {
  id: string;
  title: string;
  type: string;
  description: string;
  difficulty: string;
  status?: string;
}

export function CustomScenarios() {
  const { data: scenarios, error, isLoading } = useSWR<OrgScenario[]>(
    "/api/orgs/me/scenarios",
    (url: string) => apiClient.get<OrgScenario[]>(url)
  );

  const getIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "security drill":
        return <ShieldAlert className="w-6 h-6 text-amber" />;
      case "load testing":
        return <GitBranch className="w-6 h-6 text-[#8b5cf6]" />;
      default:
        return <Database className="w-6 h-6 text-red-500" />;
    }
  };

  return (
    <div className="bg-panel border border-panel-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-space font-semibold text-panel-text text-[18px] mb-1">Custom Scenarios</h2>
          <p className="text-[14px] text-panel-muted">Private challenges modeled after your organization's real incidents.</p>
        </div>
        <button className="text-[13px] font-medium bg-panel-2 text-panel-text px-4 py-2 rounded-lg border border-panel-border hover:bg-panel hover:border-teal/50 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Create Scenario
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-[14px] text-panel-muted font-mono">
          Loading custom scenarios...
        </div>
      ) : error || !scenarios ? (
        <div className="py-8 text-center text-[14px] text-red-auth font-mono">
          Failed to load scenarios.
        </div>
      ) : scenarios.length === 0 ? (
        <div className="py-8 text-center text-[14px] text-panel-muted font-mono">
          No custom scenarios created yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {scenarios.map((s, i) => (
            <div key={s.id || i} className="flex flex-col p-5 bg-panel-2 border border-panel-border rounded-xl hover:border-teal/50 transition-colors group">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-panel rounded-xl border border-panel-border flex items-center justify-center shadow-sm">
                  {getIcon(s.type)}
                </div>
                <div className="text-[11px] font-mono tracking-wider uppercase text-panel-muted bg-panel px-2.5 py-1 rounded-md border border-panel-border">
                  {s.difficulty}
                </div>
              </div>
              
              <h3 className="font-space font-semibold text-[16px] text-panel-text leading-tight mb-2 group-hover:text-teal transition-colors">
                {s.title}
              </h3>
              
              <p className="text-[13.5px] text-panel-muted leading-relaxed mb-6 flex-1">
                {s.description}
              </p>
              
              <div className="pt-4 border-t border-panel-border flex items-center justify-between mt-auto">
                <span className="text-[12px] font-medium text-panel-muted">{s.type}</span>
                <button className="text-teal p-1 rounded-md hover:bg-teal/10 transition-colors border-none bg-transparent cursor-pointer">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

