"use client";

import useSWR from "swr";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { Compass, CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import type { NodeFrontierResponse } from "@/lib/api-types";

export function KnowledgeFrontierWidget() {
  const { user } = useAuth();

  const { data: frontierData, isLoading } = useSWR<NodeFrontierResponse>(
    user?.id ? `/api/content/users/${user.id}/frontier` : null,
    async () => {
      if (!user?.id) return { nodes: [] };
      return apiClient.nodes.getUserFrontier(user.id);
    }
  );

  const frontierNodes = frontierData?.nodes || [];

  if (!user) return null;

  return (
    <div className="bg-panel border border-panel-border rounded-xl p-6 relative overflow-hidden shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal/10 text-teal">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-space font-semibold text-panel-text text-lg flex items-center gap-2">
              Next Up in Knowledge Graph
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-teal/15 text-teal border border-teal/20 font-medium">
                DAG Frontier
              </span>
            </h2>
            <p className="text-panel-muted text-xs font-mono mt-0.5">
              Prerequisites verified — ready to be tackled next
            </p>
          </div>
        </div>

        {frontierNodes.length > 0 && (
          <span className="text-xs font-mono text-panel-muted bg-panel-2 border border-panel-border px-2.5 py-1 rounded-full">
            {frontierNodes.length} unlocked
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-teal border-t-transparent rounded-full animate-spin" />
        </div>
      ) : frontierNodes.length === 0 ? (
        <div className="py-6 px-4 rounded-lg bg-panel-2/50 border border-panel-border/60 text-center">
          <Sparkles className="w-6 h-6 text-amber mx-auto mb-2 opacity-80" />
          <p className="text-sm font-space text-panel-text font-medium mb-1">
            Knowledge frontier cleared or all base prerequisites unlocked!
          </p>
          <p className="text-xs text-panel-muted max-w-md mx-auto mb-4">
            Explore new learning paths and challenges to expand your mastery DAG.
          </p>
          <Link
            href="/roadmaps"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-amber hover:underline"
          >
            Explore Roadmaps <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-4">
          {frontierNodes.slice(0, 3).map((node) => {
            const nodeLink =
              node.type === "QUIZ"
                ? `/quizzes/${(node.metadata?.["slug"] as string) || node.id}`
                : `/challenges/${node.id}`;

            return (
              <Link
                key={node.id}
                href={nodeLink}
                className="group flex flex-col justify-between p-4 rounded-lg bg-panel-2 border border-panel-border hover:border-teal/50 hover:bg-panel-2/80 transition-all duration-200"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-panel border border-panel-border text-panel-muted">
                      {node.type}
                    </span>
                    <span className="text-[11px] font-mono text-teal flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                    </span>
                  </div>

                  <h3 className="font-space text-sm font-semibold text-panel-text group-hover:text-teal transition-colors line-clamp-1 mb-1">
                    {node.title}
                  </h3>
                  <p className="text-xs text-panel-muted line-clamp-2 leading-relaxed">
                    {node.description || "Master this core infrastructure concept."}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-panel-border/60 flex items-center justify-between text-xs font-mono text-teal">
                  <span>Start learning</span>
                  <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
