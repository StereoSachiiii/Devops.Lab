"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, ShieldCheck, Terminal, Award, Calendar, Eye, Share2, ArrowRight } from "lucide-react";
import Link from "next/link";

interface VerifiedCheck {
  checkId: string;
  status: "PASSED" | "FAILED";
  message: string;
}

interface ShareData {
  token: string;
  type: string;
  createdAt: string;
  views: number;
  solver: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    jobTitle: string | null;
    xp: number;
    currentStreak: number;
  };
  challenge: {
    id: string;
    title: string;
    difficulty: string;
    category: string;
    xp: number;
    tags: string[];
  } | null;
  metadata: {
    challengeTitle?: string;
    difficulty?: string;
    category?: string;
    xpEarned?: number;
    completedAt?: string;
    verifiedChecks?: VerifiedCheck[];
  };
  seal: {
    issuer: string;
    verifiedAt: string;
    signatureAlgorithm: string;
  };
}

export default function SharePage() {
  const params = useParams();
  const token = params?.["token"] as string;

  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/shares/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Proof of skill not found or link has expired." : "Failed to load proof");
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-panel border border-panel-border rounded-2xl p-8 text-center animate-pulse">
          <div className="w-16 h-16 bg-panel-2 rounded-full mx-auto mb-4" />
          <div className="h-6 bg-panel-2 rounded-lg w-3/4 mx-auto mb-2" />
          <div className="h-4 bg-panel-2 rounded w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-panel border border-rose-500/30 rounded-2xl p-8 text-center">
          <ShieldCheck className="w-12 h-12 text-panel-muted mx-auto mb-4" />
          <h2 className="text-xl font-bold text-panel-text mb-2">Verification Notice</h2>
          <p className="text-sm text-panel-muted mb-6">{error || "Unable to verify link"}</p>
          <Link
            href="/challenges"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-black font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Explore Public Labs
          </Link>
        </div>
      </div>
    );
  }

  const { solver, challenge, metadata, seal } = data;
  const verifiedChecks = metadata.verifiedChecks || [];

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Top Navbar */}
      <div className="w-full max-w-3xl flex items-center justify-between mb-6">
        <Link href="/" className="flex items-center gap-2 text-panel-text font-space font-bold tracking-tight">
          <Terminal className="w-5 h-5 text-teal" />
          <span>DevOps.lab</span>
        </Link>
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel border border-panel-border hover:border-teal text-xs font-medium text-panel-text transition-colors cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5 text-teal" />
          {copied ? "Link Copied!" : "Share Link"}
        </button>
      </div>

      {/* Main Verification Card */}
      <div className="w-full max-w-3xl bg-panel border border-panel-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-teal/10 via-panel-2 to-amber/10 border-b border-panel-border p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-panel border-2 border-teal overflow-hidden flex items-center justify-center font-space text-lg font-bold text-teal shadow-lg">
                {solver.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={solver.avatarUrl} alt={solver.name || solver.username} className="w-full h-full object-cover" />
                ) : (
                  solver.username?.slice(0, 2).toUpperCase() || "US"
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-bold text-panel-text font-space">{solver.name || `@${solver.username}`}</h1>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal/20 text-teal border border-teal/30">
                    Verified Solver
                  </span>
                </div>
                <p className="text-xs text-panel-muted">{solver.jobTitle || "Infrastructure Engineer"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:flex-col sm:items-end">
              <div className="flex items-center gap-1.5 text-xs text-amber font-mono font-bold">
                <Award className="w-4 h-4" />
                <span>+{metadata.xpEarned || challenge?.xp || 100} XP Earned</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-panel-muted font-mono">
                <Eye className="w-3 h-3" />
                <span>{data.views} verified views</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Challenge Solved Section */}
          <div className="bg-panel-2/70 border border-panel-border rounded-xl p-5">
            <div className="text-xs font-mono uppercase tracking-wider text-teal mb-1">Hands-On Scenario Verification</div>
            <h2 className="text-xl sm:text-2xl font-bold text-panel-text font-space mb-2">
              {metadata.challengeTitle || challenge?.title || "Production Incident Response"}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-0.5 rounded bg-panel border border-panel-border text-panel-text font-mono">
                {metadata.category || challenge?.category || "DOCKER"}
              </span>
              <span className="px-2.5 py-0.5 rounded bg-panel border border-panel-border text-panel-muted font-mono">
                {metadata.difficulty || challenge?.difficulty || "JUNIOR"}
              </span>
              <div className="flex items-center gap-1 text-panel-muted ml-auto font-mono text-[11px]">
                <Calendar className="w-3.5 h-3.5" />
                <span>{new Date(data.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Automated Check Breakdown */}
          {verifiedChecks.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-panel-text font-space mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal" />
                <span>Automated Kernel & Sandbox Validator Proofs</span>
              </h3>
              <div className="space-y-2">
                {verifiedChecks.map((check, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-panel-2/40 border border-panel-border/60 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-teal shrink-0 mt-0.5" />
                    <div>
                      <div className="font-mono font-semibold text-panel-text">{check.checkId}</div>
                      <div className="text-panel-muted mt-0.5">{check.message || "All pass criteria met"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Platform Seal of Authenticity */}
          <div className="border-t border-panel-border pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-panel-muted">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal" />
              <span>{seal.issuer}</span>
            </div>
            <div className="font-mono text-[11px]">
              Signature: {seal.signatureAlgorithm}
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="bg-panel-2/90 border-t border-panel-border p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-panel-muted text-center sm:text-left">
            Want to practice this scenario yourself in an isolated container sandbox?
          </p>
          <Link
            href={challenge?.id ? `/challenges/${challenge.id}` : "/challenges"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal text-black font-semibold text-xs hover:opacity-90 transition-opacity whitespace-nowrap shadow-md"
          >
            <span>Launch Interactive Lab</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
