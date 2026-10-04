"use client";

import useSWR from "swr";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { History, CheckCircle2, XCircle, ArrowUpRight } from "lucide-react";
import type { QuizHistoryResponse } from "@/lib/api-types";
import { formatDistanceToNow } from "date-fns";

export function QuizHistoryTab() {
  const { user } = useAuth();

  const { data: historyData, isLoading } = useSWR<QuizHistoryResponse>(
    user ? "/api/content/quizzes/history" : null,
    async () => apiClient.quizzes.getAllHistory()
  );

  const attempts = historyData?.attempts || [];

  if (!user) {
    return (
      <div className="p-8 text-center bg-panel border border-panel-border rounded-xl">
        <p className="text-panel-muted text-sm font-mono mb-4">
          Sign in to track your comprehensive quiz attempts and SRE assessment scores over time.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-[#04241d] font-semibold text-xs transition-transform hover:scale-[1.02]"
        >
          Sign in &rarr;
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="p-10 text-center bg-panel border border-panel-border rounded-xl">
        <History className="w-8 h-8 text-panel-muted mx-auto mb-3 opacity-60" />
        <h3 className="font-space font-semibold text-panel-text text-base mb-1">
          No Quiz Attempts Yet
        </h3>
        <p className="text-panel-muted text-xs font-mono max-w-sm mx-auto mb-4">
          Take your first knowledge check to benchmark your production incident diagnosis skills.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-teal" />
          <h2 className="font-space font-semibold text-panel-text text-base">
            Recent Assessment Attempts
          </h2>
        </div>
        <span className="text-xs font-mono text-panel-muted">
          {attempts.length} attempts recorded
        </span>
      </div>

      <div className="bg-panel border border-panel-border rounded-xl divide-y divide-panel-border overflow-hidden">
        {attempts.map((attempt) => {
          const percentage = Math.round((attempt.score / attempt.total) * 100);

          return (
            <div
              key={attempt.id}
              className="p-4.5 flex items-center justify-between hover:bg-panel-2/40 transition-colors"
            >
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5">
                  {attempt.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-teal" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                </div>
                <div>
                  <h4 className="font-space text-sm font-semibold text-panel-text mb-1">
                    {attempt.quizTitle}
                  </h4>
                  <div className="flex items-center gap-3 text-xs font-mono text-panel-muted">
                    <span>
                      Score: <strong className={attempt.passed ? "text-teal" : "text-rose-400"}>{attempt.score}/{attempt.total}</strong> ({percentage}%)
                    </span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(attempt.createdAt), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${
                    attempt.passed
                      ? "bg-teal/10 border-teal/30 text-teal"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  }`}
                >
                  {attempt.passed ? "Passed" : "Needs Review"}
                </span>

                <Link
                  href={`/quizzes/${attempt.quizId}`}
                  className="p-1.5 rounded-lg border border-panel-border text-panel-muted hover:text-panel-text hover:border-teal transition-colors"
                  title="Retake Quiz"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
