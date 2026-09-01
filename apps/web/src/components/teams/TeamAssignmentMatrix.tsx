"use client";

import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { CheckCircle2, Clock, FileSpreadsheet } from "lucide-react";
import { useState } from "react";

interface AssignmentProgress {
  pathId: string;
  pathTitle: string;
  totalChallenges: number;
  completedChallenges: number;
  percentage: number;
  status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
}

interface EngineerMatrixRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  orgRole: string;
  xp: number;
  assignments: AssignmentProgress[];
}

export function TeamAssignmentMatrix() {
  const [downloading, setDownloading] = useState(false);
  const { data: matrix, isLoading } = useSWR<EngineerMatrixRow[]>(
    "/api/orgs/me/assignments/matrix",
    () => apiClient.get<EngineerMatrixRow[]>("/api/orgs/me/assignments/matrix")
  );

  const handleExportCSV = async () => {
    setDownloading(true);
    try {
      const response = await fetch("/api/orgs/me/compliance-export", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance_training_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-panel border border-panel-border rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-panel-border">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-space text-lg font-bold text-panel-text">
              Engineer Training & Compliance Matrix
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal/10 text-teal border border-teal/20">
              Enterprise
            </span>
          </div>
          <p className="text-panel-muted text-sm mt-1">
            Real-time track completion by engineer across assigned curriculum paths.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-panel-2 border border-panel-border hover:border-teal/50 text-panel-text font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <FileSpreadsheet className="w-4 h-4 text-teal" />
          {downloading ? "Generating CSV..." : "Export Compliance CSV"}
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-panel-muted font-mono text-sm">
          Loading progress matrix...
        </div>
      ) : !matrix || matrix.length === 0 ? (
        <div className="py-8 text-center text-panel-muted text-sm">
          No team members or assignments found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-panel-border text-xs uppercase tracking-wider text-panel-muted font-mono">
                <th className="py-3 px-4">Engineer</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">XP</th>
                <th className="py-3 px-4">Assigned Paths & Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border">
              {matrix.map((row) => (
                <tr key={row.userId} className="hover:bg-panel-2/50 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-medium text-panel-text">{row.name}</div>
                    <div className="text-xs text-panel-muted font-mono">{row.email}</div>
                  </td>
                  <td className="py-3.5 px-4 text-panel-muted text-xs">
                    <span className="px-2 py-0.5 rounded bg-panel-2 border border-panel-border">
                      {row.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-amber text-xs">
                    {row.xp.toLocaleString()} XP
                  </td>
                  <td className="py-3.5 px-4">
                    {row.assignments.length === 0 ? (
                      <span className="text-xs text-panel-muted italic">No active path assignments</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {row.assignments.map((asg) => (
                          <div key={asg.pathId} className="flex items-center gap-3 min-w-[260px]">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-panel-text font-medium">{asg.pathTitle}</span>
                                <span className="font-mono text-panel-muted">
                                  {asg.completedChallenges}/{asg.totalChallenges} ({asg.percentage}%)
                                </span>
                              </div>
                              <div className="w-full bg-panel-2 h-1.5 rounded-full overflow-hidden border border-panel-border">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    asg.percentage === 100
                                      ? "bg-teal"
                                      : asg.percentage > 0
                                      ? "bg-amber"
                                      : "bg-panel-muted"
                                  }`}
                                  style={{ width: `${asg.percentage}%` }}
                                />
                              </div>
                            </div>
                            {asg.status === "COMPLETED" ? (
                              <CheckCircle2 className="w-4 h-4 text-teal shrink-0" />
                            ) : (
                              <Clock className="w-4 h-4 text-amber shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
