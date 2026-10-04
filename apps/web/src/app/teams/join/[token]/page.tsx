"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/apiClient";
import { Building2, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { getErrorMessage, ErrorCodes } from "@/lib/errors";

export default function JoinOrgPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.org.join(token);
      setSuccess(true);
      setTimeout(() => {
        router.push("/teams");
      }, 2000);
    } catch (err) {
      setError(getErrorMessage(err, getErrorMessage(ErrorCodes.UNKNOWN_ERROR)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-bg min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-panel border border-panel-border rounded-2xl p-8 text-center shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-teal/10 border border-teal/20 flex items-center justify-center mx-auto mb-5 text-teal">
          <Building2 className="w-7 h-7" />
        </div>

        <h1 className="font-space text-2xl font-bold text-panel-text mb-2">
          Enterprise Team Invitation
        </h1>
        <p className="text-panel-muted text-sm leading-relaxed mb-6">
          You have been invited to collaborate with your organization on Devops.Lab. Accept this invitation to access private incident drills and team training matrices.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-mono text-rose-400 flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="p-4 bg-teal/10 border border-teal/20 rounded-xl text-teal text-xs font-mono flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Successfully joined! Redirecting to team dashboard...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-teal text-[#04241d] font-semibold text-sm transition-transform hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#04241d] border-t-transparent rounded-full animate-spin" />
                  <span>Joining Organization...</span>
                </>
              ) : (
                <>
                  <span>Accept Invitation & Join</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <Link
              href="/dashboard"
              className="block text-xs font-mono text-panel-muted hover:text-panel-text transition-colors py-1"
            >
              Decline & Return to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
