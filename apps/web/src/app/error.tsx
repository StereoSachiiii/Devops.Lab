"use client";

import { normalizeError } from "@/lib/errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const details = normalizeError(error);

  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-[60vh]">
      <div className="max-w-md w-full p-6 rounded-2xl bg-[#0e1219]/90 backdrop-blur-xl border border-rose-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <div>
          <h2 className="text-lg font-heading font-bold text-foreground">
            Something went wrong
          </h2>
          <p className="text-sm font-mono text-panel-muted mt-1.5 leading-relaxed">
            {details.message}
          </p>
          {error.digest && (
            <p className="text-[11px] font-mono text-panel-muted/60 mt-1">
              Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-xl bg-teal/10 hover:bg-teal/20 text-teal border border-teal/30 text-xs font-mono font-semibold transition-all shadow-[0_0_12px_rgba(53,214,180,0.15)]"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.assign("/")}
            className="px-4 py-2 rounded-xl bg-panel-2 hover:bg-panel-border/40 text-panel-text border border-panel-border/80 text-xs font-mono transition-all"
          >
            Return Home
          </button>
        </div>
      </div>
    </div>
  );
}
