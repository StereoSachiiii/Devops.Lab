"use client";

import { useEffect, useState } from "react";
import { HelpCircle, CheckCircle2, XCircle, Calendar, ArrowRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";

interface QuizAttemptItem {
  id: string;
  quizId: string;
  quizTitle: string;
  score: number;
  total: number;
  passed: boolean;
  createdAt: string;
}

export function QuizHistoryView() {
  const [attempts, setAttempts] = useState<QuizAttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<{ attempts: QuizAttemptItem[] }>("/api/quizzes/history")
      .then((res) => {
        setAttempts(res.attempts || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load quiz history", err);
        setError("Unable to load quiz history");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-panel border border-panel-border rounded-xl p-5 space-y-3 animate-pulse">
        <div className="h-5 bg-panel-2 rounded w-1/3" />
        <div className="h-10 bg-panel-2 rounded" />
        <div className="h-10 bg-panel-2 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-panel border border-panel-border rounded-xl p-5 text-center text-xs text-panel-muted">
        {error}
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="bg-panel border border-panel-border rounded-xl p-8 text-center space-y-3">
        <HelpCircle className="w-8 h-8 text-panel-muted mx-auto opacity-50" />
        <h3 className="font-space font-bold text-panel-text text-sm">No Quiz Attempts Yet</h3>
        <p className="text-xs text-panel-muted max-w-sm mx-auto">
          Test your conceptual understanding across Docker, Kubernetes, and Linux fundamentals.
        </p>
        <Link
          href="/quizzes"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal text-black font-semibold text-xs hover:opacity-90 transition-opacity"
        >
          <span>Explore Quizzes</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-panel-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-teal" />
          <h3 className="font-space font-bold text-panel-text text-sm">Quiz Progression History</h3>
        </div>
        <span className="text-[11px] font-mono text-panel-muted">{attempts.length} attempts</span>
      </div>

      <div className="divide-y divide-panel-border/60">
        {attempts.map((attempt) => {
          const pct = Math.round((attempt.score / (attempt.total || 1)) * 100);
          return (
            <div key={attempt.id} className="py-3 flex items-center justify-between text-xs gap-4">
              <div className="flex items-center gap-3">
                {attempt.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-teal shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber shrink-0" />
                )}
                <div>
                  <Link
                    href={`/quizzes/${attempt.quizId}`}
                    className="font-semibold text-panel-text hover:text-teal transition-colors"
                  >
                    {attempt.quizTitle}
                  </Link>
                  <div className="flex items-center gap-2 text-[11px] text-panel-muted font-mono mt-0.5">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(attempt.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-mono font-bold text-panel-text">
                    {attempt.score}/{attempt.total} ({pct}%)
                  </div>
                  <span
                    className={`text-[10px] font-mono ${
                      attempt.passed ? "text-teal" : "text-amber"
                    }`}
                  >
                    {attempt.passed ? "PASSED" : "RETRY REQUIRED"}
                  </span>
                </div>
                <Link
                  href={`/quizzes/${attempt.quizId}`}
                  className="p-1.5 rounded-lg bg-panel-2 border border-panel-border hover:border-teal text-panel-text transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
