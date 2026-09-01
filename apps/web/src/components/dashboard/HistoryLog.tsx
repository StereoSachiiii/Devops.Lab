"use client";

// import React from "react";
import { CheckCircle2, XCircle, Clock, RotateCcw } from "lucide-react";

export interface HistoryItem {
  id: string;
  createdAt: string;
  status: "PASSED" | "FAILED" | "COMPLETED" | "RUNNING" | "PENDING" | string;
  score?: number;
  total?: number;
  passed?: boolean;
}

export function HistoryLog({
  items,
  title = "Activity History",
}: {
  items: HistoryItem[];
  title?: string;
}) {
  if (!items || items.length === 0) {
    return (
      <div className="bg-panel border border-panel-border rounded-xl p-6">
        <h3 className="font-space font-semibold text-panel-text text-[15px] mb-2 flex items-center gap-2">
          <RotateCcw size={16} className="text-panel-muted" />
          {title}
        </h3>
        <p className="text-panel-muted text-[13px]">No history available yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-panel-border rounded-xl p-6">
      <h3 className="font-space font-semibold text-panel-text text-[15px] mb-4 flex items-center gap-2">
        <RotateCcw size={16} className="text-panel-muted" />
        {title}
      </h3>
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const date = new Date(item.createdAt);
          const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const dateStr = date.toLocaleDateString();

          let isSuccess = item.status === "PASSED" || item.status === "COMPLETED";
          if (item.passed !== undefined) isSuccess = item.passed;
          else if (
            item.score !== undefined &&
            item.total !== undefined &&
            item.score === item.total &&
            item.total > 0
          )
            isSuccess = true;

          const isPending = item.status === "RUNNING" || item.status === "PENDING";

          return (
            <div
              key={item.id}
              className="flex items-center gap-4 py-3 border-b border-panel-border last:border-0 last:pb-0"
            >
              <div className="shrink-0">
                {isSuccess ? (
                  <CheckCircle2 size={18} className="text-teal" />
                ) : isPending ? (
                  <Clock size={18} className="text-amber" />
                ) : (
                  <XCircle size={18} className="text-red" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="font-mono text-[13px] text-panel-text truncate">
                    {item.score !== undefined && item.total !== undefined
                      ? `Score: ${item.score}/${item.total}`
                      : `Status: ${item.status}`}
                  </div>
                  <div className="font-mono text-[11px] text-panel-muted whitespace-nowrap">
                    {dateStr} {timeStr}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
