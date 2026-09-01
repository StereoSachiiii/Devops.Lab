"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { API_ROUTES } from "@/lib/api-routes";
import { CheckCircle, XCircle, Terminal, Play, Heart, Bookmark, Share2, Check } from "lucide-react";
import { useTerminalMachine } from "@/lib/useTerminalMachine";
import type { Challenge, CheckResult } from "@/lib/api-types";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { WorkspaceTabs } from "@/components/workspace/WorkspaceTabs";
import { WorkspaceTerminal } from "@/components/workspace/WorkspaceTerminal";
import { EyebrowHeader } from "@/components/ui/EyebrowHeader";
import { SaveToListModal } from "@/components/challenge/SaveToListModal";

interface PageProps {
  params: Promise<{ id: string }>;
}

function ChallengeWorkspacePage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [listModalOpen, setListModalOpen] = useState(false);

  const {
    data: challenge,
    isLoading: challengeLoading,
    error: challengeError,
  } = useSWR<Challenge>(id ? API_ROUTES.challenges.byId(id) : null, () =>
    apiClient.get<Challenge>(API_ROUTES.challenges.byId(id))
  );

  const { data: history } = useSWR<any[]>(id ? API_ROUTES.challenges.history(id) : null, () =>
    apiClient.challenge.getHistory(id)
  );

  const {
    state,
    session,
    wsRef,
    reconnectAttempt,
    maxReconnectAttempts,
    validationResult,
    isValidating,
    errorMessage,
    progressEvents,
    ttlWarningMinutes,
    isolationDowngraded,
    startSession,
    terminateSession,
    validateSolution,
  } = useTerminalMachine();



  const [activeTab, setActiveTab] = useState<
    "description" | "hints" | "editorial" | "discussion" | "config" | "ask-ai" | "history"
  >("description");
  const [hintsRevealed, setHintsRevealed] = useState<boolean[]>([false, false, false]);

  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([{ role: "assistant", content: "I'm here to help. What are you stuck on?" }]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Challenge interaction state
  const { data: interactions } = useSWR<{ likes: number; liked: boolean; saved: boolean }>(
    id ? `/api/challenges/${id}/interactions` : null,
    () => apiClient.get<{ likes: number; liked: boolean; saved: boolean }>(`/api/challenges/${id}/interactions`)
  );
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [iLiking, setILiking] = useState(false);
  const [iSaving, setISaving] = useState(false);

  const currentLikes = likeCount !== null ? likeCount : (interactions?.likes ?? 0);
  const currentLiked = liked !== null ? liked : (interactions?.liked ?? false);
  const currentSaved = saved !== null ? saved : (interactions?.saved ?? false);

  const handleLike = useCallback(async () => {
    if (!user) { router.push("/login"); return; }
    if (iLiking) return;
    const prev = { likes: currentLikes, liked: currentLiked };
    setLiked(!prev.liked);
    setLikeCount(prev.liked ? prev.likes - 1 : prev.likes + 1);
    setILiking(true);
    try {
      const res = await apiClient.post<{ likes: number; liked: boolean }>(`/api/challenges/${id}/like`);
      setLiked(res.liked);
      setLikeCount(res.likes);
    } catch {
      setLiked(prev.liked);
      setLikeCount(prev.likes);
    } finally { setILiking(false); }
  }, [user, router, id, iLiking, currentLikes, currentLiked]);

  const handleSave = useCallback(async () => {
    if (!user) { router.push("/login"); return; }
    if (iSaving) return;
    const prev = currentSaved;
    setSaved(!prev);
    setISaving(true);
    try {
      const res = await apiClient.post<{ saved: boolean }>(`/api/challenges/${id}/bookmark`);
      setSaved(res.saved);
    } catch { setSaved(prev); } finally { setISaving(false); }
  }, [user, router, id, iSaving, currentSaved]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: challenge?.title ?? "Challenge", url }); } catch {}
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }
  }, [challenge]);

  const handleSendChat = async (msg: string) => {
    if (!msg.trim()) return;
    const newMessages = [...chatMessages, { role: "user" as const, content: msg }];
    setChatMessages(newMessages);
    setChatInput("");
    setIsChatLoading(true);
    try {
      const res = await apiClient.assistant.chat(msg);
      setChatMessages([...newMessages, { role: "assistant", content: res.content }]);
    } catch (e) {
      setChatMessages([
        ...newMessages,
        { role: "assistant", content: "Sorry, I couldn't process that right now." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "ask-ai" && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTab]);

  const [persistedChecks, setPersistedChecks] = useState<CheckResult[]>([]);
  useEffect(() => {
    if (!session) return;
    apiClient
      .get<{ results: { checkId: string; status: string; message: string }[] }>(
        API_ROUTES.sessions.checkResults(session.sessionId)
      )
      .then((d) => {
        if (d.results) {
          const mapped: CheckResult[] = d.results.map((r: any) => ({
            checkId: r.checkId,
            passed: r.status?.toLowerCase() === "passed",
            message: r.message || "",
          }));
          setPersistedChecks(mapped);
        }
      })
      .catch(() => {});
  }, [session]);

  const currentChecks =
    validationResult && validationResult.checkResults && validationResult.checkResults.length > 0
      ? validationResult.checkResults
      : persistedChecks.length > 0
      ? persistedChecks
      : (challenge as any)?.checks?.map((c: any) => ({
          id: c.id,
          description: c.description,
          status: "pending" as const,
        })) || [];

  const passedCount = currentChecks.filter((c: any) => c.status === "passed" || c.passed === true).length;
  const totalChecks = currentChecks.length;

  const handleStart = useCallback(async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setPersistedChecks([]);
    await startSession(challenge!.id);
  }, [user, router, startSession, challenge]);

  const handleTerminateActive = useCallback(async () => {
    try {
      await apiClient.sessions.terminateActive();
      if (challenge) {
        await startSession(challenge.id);
      }
    } catch (e) {
      console.error("Failed to terminate active sessions", e);
    }
  }, [startSession, challenge]);

  const storageKey = user?.id && id ? `session_${user.id}_${id}` : null;

  useEffect(() => {
    if (!storageKey || state !== "IDLE") return;
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      apiClient
        .get<{ status: string }>(API_ROUTES.sessions.byId(parsed.sessionId))
        .then((r) => {
          if (r?.status === "ACTIVE") startSession(id);
          else if (storageKey) localStorage.removeItem(storageKey);
        })
        .catch(() => {
          if (storageKey) localStorage.removeItem(storageKey);
        });
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, id, state, startSession]);

  useEffect(() => {
    if (!storageKey) return;
    if (session && state === "CONNECTED") {
      localStorage.setItem(storageKey, JSON.stringify(session));
    }
    if (state === "SANDBOX_LOST" || state === "IDLE") {
      localStorage.removeItem(storageKey);
    }
  }, [session, state, storageKey]);

  if (challengeLoading)
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-bg">
        <div className="text-center text-panel-muted-dim font-mono text-xs">
          <div className="mb-3 animate-[orbPulse_1.5s_ease-in-out_infinite] flex justify-center">
            <Terminal size={32} className="text-amber" />
          </div>
          Loading challenge…
        </div>
      </div>
    );

  if (challengeError || !challenge)
    return (
      <div className="border border-red/40 p-4 rounded-lg bg-[rgba(244,63,94,0.1)] text-red font-mono text-xs m-4">
        ✗ Failed to load challenge. Check that the gateway is running.
      </div>
    );

  return (
    <div className="flex flex-col gap-0 min-h-[calc(100vh-64px)] bg-bg">

      <WorkspaceHeader
        title={challenge.title}
        difficulty={challenge.difficulty}
        xp={challenge.xp}
        onTourClick={() => {}}
      />

      {/* ── 3-column workspace ── */}
      <div className="grid grid-cols-[320px_1fr_300px] gap-5 flex-1 min-h-0 py-5 max-xl:grid-cols-[280px_1fr_260px] max-lg:grid-cols-[280px_1fr] max-md:flex max-md:flex-col">
        {/* LEFT COLUMN: Challenge Brief & Tabs */}
        <div className="flex flex-col gap-4 bg-panel/70 backdrop-blur-xl border border-panel-border/80 rounded-2xl p-4.5 shadow-[0_8px_32px_rgba(0,0,0,0.25)] overflow-y-auto max-h-[calc(100vh-140px)] max-md:order-2 max-md:max-h-[300px]">
          <div className="pb-3 border-b border-panel-border/60">
            <EyebrowHeader dotColor="teal" className="mb-2 tracking-wider">
              {challenge.category?.toUpperCase()} &middot; ~15 MIN
            </EyebrowHeader>
            <h1 className="m-0 text-[20px] font-space font-extrabold text-panel-text tracking-[-0.02em] leading-tight bg-gradient-to-r from-panel-text to-panel-muted bg-clip-text">
              {challenge.title}
            </h1>
          </div>

          <WorkspaceTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            challenge={challenge}
            hintsRevealed={hintsRevealed}
            setHintsRevealed={setHintsRevealed}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            handleSendChat={handleSendChat}
            isChatLoading={isChatLoading}
            chatEndRef={chatEndRef as any}
            history={history || []}
          />
        </div>

        {/* CENTER COLUMN: Terminal & Action Bar */}
        <div
          id="terminal-panel"
          className="flex flex-col gap-3 min-h-0 max-md:order-1 max-md:flex-none max-md:basis-[400px] max-md:min-h-[400px]"
        >
          {ttlWarningMinutes !== null && state === "CONNECTED" && (
            <div className="bg-amber/10 border border-amber/30 text-amber px-4 py-2.5 rounded-xl font-mono text-[11px] flex items-center gap-2 backdrop-blur-md shadow-sm">
               <span className="font-bold">⚠️ Warning:</span> Session will expire and be forcibly terminated in {ttlWarningMinutes} minutes.
            </div>
          )}
          {isolationDowngraded && state === "CONNECTED" && (
            <div id="isolation-downgraded-banner" className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2.5 rounded-xl font-mono text-[11px] flex items-center gap-2 backdrop-blur-md shadow-sm">
              <span className="font-bold">⚠️ Security Notice:</span> Running with standard isolation — enhanced sandboxing unavailable on this host.
            </div>
          )}

          {/* Preserved Terminal */}
          <WorkspaceTerminal
            challengeTitle={challenge.title}
            state={state}
            session={session}
            reconnectAttempt={reconnectAttempt}
            maxReconnectAttempts={maxReconnectAttempts}
            errorMessage={errorMessage}
            progressEvents={progressEvents}
            wsRef={wsRef}
            onLaunchSandbox={handleStart}
            onTerminateActive={handleTerminateActive}
            onStopSandbox={terminateSession}
          />

          {/* Modern Bottom Action Bar */}
          <div
            id="validate-btn"
            className="flex items-center justify-between bg-panel/80 backdrop-blur-xl border border-panel-border/80 rounded-xl px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
          >
            <div className="flex items-center gap-4">
              <button
                onClick={() => validateSolution()}
                disabled={isValidating || state !== "CONNECTED"}
                className={`flex items-center gap-2 py-2 px-5 rounded-lg font-mono text-[11px] font-bold tracking-wide transition-all duration-200 ${
                  isValidating || state !== "CONNECTED"
                    ? "bg-panel-2/70 text-panel-muted-dim cursor-not-allowed border border-panel-border/40"
                    : "bg-gradient-to-r from-teal to-emerald-400 text-bg font-black shadow-[0_0_20px_rgba(53,214,180,0.35)] hover:shadow-[0_0_28px_rgba(53,214,180,0.55)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                }`}
              >
                {isValidating ? (
                  <>
                    <span className="animate-spin text-xs">↻</span> Validating Solution…
                  </>
                ) : (
                  <>
                    <Play size={12} fill="currentColor" /> Validate Solution
                  </>
                )}
              </button>

              <div className="font-mono text-[12px] font-medium text-panel-muted flex items-center gap-2 px-3 py-1.5 rounded-lg bg-panel-2/50 border border-panel-border/50">
                {totalChecks > 0 && passedCount === totalChecks ? (
                  <CheckCircle size={14} className="text-teal animate-bounce" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-panel-muted-dim/60" />
                )}
                <span>
                  <strong className={passedCount === totalChecks && totalChecks > 0 ? "text-teal" : "text-panel-text"}>
                    {passedCount}
                  </strong>{" "}
                  / {totalChecks} checks passed
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Challenge interaction buttons */}
              <button
                id="challenge-like-btn"
                onClick={handleLike}
                disabled={iLiking}
                title={currentLiked ? "Unlike" : "Like this challenge"}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-mono text-[11px] font-semibold transition-all duration-200 ${
                  currentLiked
                    ? "bg-red/15 border-red/40 text-red"
                    : "bg-panel-2/60 border-panel-border/60 text-panel-muted hover:border-red/30 hover:text-red"
                }`}
              >
                <Heart size={12} className={currentLiked ? "fill-current" : ""} />
                <span className="tabular-nums">{currentLikes}</span>
              </button>

              <div className="inline-flex items-center rounded-lg border border-panel-border/60 bg-panel-2/60 overflow-hidden">
                <button
                  id="challenge-save-btn"
                  onClick={handleSave}
                  disabled={iSaving}
                  title={currentSaved ? "Remove bookmark" : "Quick save challenge"}
                  className={`flex items-center gap-1 px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-all duration-200 cursor-pointer ${
                    currentSaved
                      ? "bg-amber/15 text-amber"
                      : "text-panel-muted hover:text-amber"
                  }`}
                >
                  <Bookmark size={12} className={currentSaved ? "fill-current" : ""} />
                </button>
                <button
                  onClick={() => setListModalOpen(true)}
                  title="Add to custom list track"
                  className="px-2 py-1.5 font-mono text-[11px] font-semibold text-panel-muted hover:text-panel-text border-l border-panel-border/60 transition-colors cursor-pointer"
                >
                  + List
                </button>
              </div>

              <button
                id="challenge-share-btn"
                onClick={handleShare}
                title="Copy link"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-mono text-[11px] font-semibold transition-all duration-200 ${
                  shareCopied
                    ? "bg-teal/15 border-teal/40 text-teal"
                    : "bg-panel-2/60 border-panel-border/60 text-panel-muted hover:border-teal/30 hover:text-teal"
                }`}
              >
                {shareCopied ? <Check size={12} /> : <Share2 size={12} />}
              </button>

              <div className="flex items-center gap-1.5 text-[11px] font-mono pl-2 border-l border-panel-border/40">
                <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
                <span className="text-panel-muted text-[10.5px]">Auto-grading ready</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Status & Resources */}
        <div className="flex flex-col gap-4 border-l border-panel-border/60 pl-5 overflow-y-auto max-h-[calc(100vh-140px)] max-lg:hidden">
          {/* Solution Checklist */}
          {currentChecks.length > 0 && (
            <div className="bg-panel/70 backdrop-blur-xl border border-panel-border/80 rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[11px] font-bold text-panel-text uppercase tracking-wider">
                  Verification Checks
                </span>
                <span className="font-mono text-[10px] text-panel-muted px-2 py-0.5 rounded-md bg-panel-2 border border-panel-border/60">
                  {passedCount}/{totalChecks}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {currentChecks.map((c: any, i: number) => {
                  const isPassed = c.passed || c.status === "passed";
                  const isPending = c.status === "pending";
                  const text = c.message || c.description;

                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all duration-200 ${
                        isPassed
                          ? "bg-teal/5 border-teal/25 text-teal"
                          : isPending
                            ? "bg-panel-2/40 border-panel-border/60 text-panel-muted"
                            : "bg-red/5 border-red/25 text-red"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isPassed ? (
                          <CheckCircle size={14} className="text-teal" />
                        ) : isPending ? (
                          <div className="w-3.5 h-3.5 rounded-full border border-panel-muted-dim/40 flex items-center justify-center">
                            <div className="w-1 h-1 rounded-full bg-panel-muted-dim/40" />
                          </div>
                        ) : (
                          <XCircle size={14} className="text-red" />
                        )}
                      </div>
                      <div className="font-mono text-[11px] leading-relaxed select-text flex-1">
                        {text}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Validation Feedback & Celebratory Badge Unlocked Alert */}
          {validationResult && (
            <div className="flex flex-col gap-3">
              {validationResult.passed && (
                <div className="bg-gradient-to-r from-amber/20 via-teal/15 to-amber/20 border-2 border-amber/50 rounded-2xl p-4 shadow-[0_0_30px_rgba(245,158,11,0.2)] animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber/20 border border-amber/40 flex items-center justify-center text-xl shadow-inner animate-bounce">
                      🎉
                    </div>
                    <div>
                      <div className="font-space font-bold text-sm text-panel-text flex items-center gap-1.5">
                        <span>Challenge Solved!</span>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber/20 text-amber border border-amber/40">
                          +{challenge.xp} XP
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-panel-muted mt-0.5">
                        Progress recorded. Milestone badges and daily streak updated.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div
                className={`border rounded-2xl p-4 backdrop-blur-xl transition-all shadow-[0_4px_20px_rgba(0,0,0,0.25)] ${
                  validationResult.passed
                    ? "bg-teal/10 border-teal/30"
                    : "bg-red/10 border-red/30"
                }`}
              >
                <div
                  className={`font-mono text-[11px] font-bold mb-2.5 flex items-center gap-1.5 ${
                    validationResult.passed ? "text-teal" : "text-red"
                  }`}
                >
                  <span>{validationResult.passed ? "✓" : "✗"}</span>
                  <span>Validator Result</span>
                </div>
                <pre className="m-0 font-mono text-[10.5px] text-panel-muted whitespace-pre-wrap break-words leading-[1.65] bg-bg/50 p-2.5 rounded-lg border border-panel-border/40">
                  {validationResult.feedback}
                </pre>
              </div>
            </div>
          )}

          {/* Quick Docs & Resources */}
          <div className="bg-panel/70 backdrop-blur-xl border border-panel-border/80 rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
            <div className="font-mono text-[11px] font-bold text-panel-text mb-3 uppercase tracking-wider">
              Helpful Resources
            </div>
            <div className="flex flex-col gap-1">
              {[
                { label: `${challenge.category} & System Manuals`, url: "https://man7.org/linux/man-pages/" },
                { label: "DevOps Best Practices Guide", url: "https://learn.microsoft.com/en-us/devops/" },
              ].map((r) => (
                <a
                  key={r.label}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between font-mono text-[11px] text-panel-muted no-underline p-2 rounded-lg transition-colors hover:text-teal hover:bg-teal/5 border border-transparent hover:border-teal/20"
                >
                  <span>{r.label}</span>
                  <span className="text-panel-muted-dim text-xs">↗</span>
                </a>
              ))}
            </div>
          </div>

          {/* Environment persistence note */}
          <div className="bg-panel/50 backdrop-blur-md border border-panel-border/60 rounded-2xl p-3.5 text-[10.5px] font-mono leading-relaxed text-panel-muted">
            <div className="flex items-center gap-1.5 text-teal font-bold mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal" />
              <span>State Persistence</span>
            </div>
            <p className="m-0 text-panel-muted-dim">
              Container file modifications and environment state remain saved during this active session.
            </p>
          </div>
        </div>
      </div>

      {/* Save to Custom List Modal */}
      <SaveToListModal
        isOpen={listModalOpen}
        onClose={() => setListModalOpen(false)}
        challengeId={id}
        challengeTitle={challenge?.title}
      />
    </div>
  );
}

export default function WrappedChallengeWorkspacePage(props: any) {
  return (
    <WorkspaceLayout>
      <ChallengeWorkspacePage {...props} />
    </WorkspaceLayout>
  );
}
