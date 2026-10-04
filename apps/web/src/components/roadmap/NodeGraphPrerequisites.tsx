"use client";

import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { Network, ArrowUpRight, ArrowDownRight, GitCommit, CheckCircle2 } from "lucide-react";

interface NodeGraphPrerequisitesProps {
  nodeId: string;
  isCompleted?: boolean | undefined;
}

export function NodeGraphPrerequisites({ nodeId, isCompleted: _isCompleted }: NodeGraphPrerequisitesProps) {
  const { data: parentsData, isLoading: loadingParents } = useSWR(
    nodeId ? `/api/content/nodes/${nodeId}/parents` : null,
    async () => apiClient.nodes.getParents(nodeId)
  );

  const { data: childrenData, isLoading: loadingChildren } = useSWR(
    nodeId ? `/api/content/nodes/${nodeId}/children` : null,
    async () => apiClient.nodes.getChildren(nodeId)
  );

  const parents = parentsData?.nodes || [];
  const children = childrenData?.nodes || [];

  if (loadingParents && loadingChildren) {
    return (
      <div className="p-4 rounded-lg bg-panel-2 border border-panel-border flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (parents.length === 0 && children.length === 0) {
    return null;
  }

  return (
    <div className="bg-panel-2 border border-panel-border rounded-xl p-4 my-4 space-y-4">
      <div className="flex items-center gap-2 text-panel-muted font-mono text-xs uppercase tracking-wider">
        <Network className="w-4 h-4 text-teal" />
        <span>Knowledge Graph Lineage (DAG)</span>
      </div>

      {/* Parents / Prerequisites */}
      {parents.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-panel-muted mb-2">
            <ArrowUpRight className="w-3.5 h-3.5 text-amber" />
            <span>Prerequisites (Incoming):</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {parents.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-panel border border-panel-border text-xs font-space text-panel-text"
              >
                <GitCommit className="w-3 h-3 text-amber" />
                {p.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Children / Unlocks */}
      {children.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-panel-muted mb-2">
            <ArrowDownRight className="w-3.5 h-3.5 text-teal" />
            <span>Unlocks (Outgoing):</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-panel border border-panel-border text-xs font-space text-teal"
              >
                <CheckCircle2 className="w-3 h-3 text-teal" />
                {c.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
