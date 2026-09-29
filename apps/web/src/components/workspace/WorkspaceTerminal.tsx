import { Terminal, WifiOff, AlertCircle, UserPlus, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { VmBootAnimation } from "./VmBootAnimation";
import { ConnectionBadge } from "./ConnectionBadge";

const XtermTerminal = dynamic(() => import("@/components/terminal/XtermTerminal"), { ssr: false });

export function WorkspaceTerminal({
  challengeTitle,
  state,
  session,
  reconnectAttempt,
  maxReconnectAttempts,
  errorMessage,
  progressEvents,
  wsRef,
  onLaunchSandbox,
  onTerminateActive,
  onStopSandbox,
  isGuest,
  isTrialEligible,
  trialUsed,
  trialExpired,
}: {
  challengeTitle: string;
  state: string;
  session: any | null;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  errorMessage: string | null;
  progressEvents?: Array<{ stage: string; message: string }>;
  wsRef: React.MutableRefObject<WebSocket | null>;
  onLaunchSandbox?: () => void;
  onTerminateActive?: () => void;
  onStopSandbox?: () => void;
  isGuest?: boolean;
  isTrialEligible?: boolean;
  trialUsed?: boolean;
  trialExpired?: boolean;
}) {
  const isConnected = state === "CONNECTED";
  const showTerminal = !["IDLE", "FAILED"].includes(state);

  return (
    <div
      className={`flex flex-col flex-1 bg-[#090b10] border rounded-2xl overflow-hidden relative min-h-[460px] transition-all duration-500 ${
        isConnected
          ? "border-teal/30 shadow-[0_0_40px_rgba(53,214,180,0.12),0_12px_32px_rgba(0,0,0,0.4)]"
          : state === "RECONNECTING"
            ? "border-amber/30 shadow-[0_0_30px_rgba(255,157,92,0.1)]"
            : "border-panel-border/80 shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
      }`}
    >
      {/* Sleek Terminal Title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0f131a]/95 backdrop-blur-md border-b border-panel-border/80 shrink-0">
        <div className="flex items-center gap-3">
          {/* macOS window controls with subtle glow */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] shadow-[0_0_6px_rgba(255,95,86,0.4)] hover:brightness-110 transition-all cursor-default" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] shadow-[0_0_6px_rgba(255,189,46,0.4)] hover:brightness-110 transition-all cursor-default" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] shadow-[0_0_6px_rgba(39,201,63,0.4)] hover:brightness-110 transition-all cursor-default" />
          </div>

          <div className="h-4 w-[1px] bg-panel-border/60 mx-0.5" />

          {/* Session breadcrumb */}
          <div className="flex items-center gap-2 font-mono text-[11.5px]">
            <Terminal size={12} className={isConnected ? "text-teal" : "text-panel-muted-dim"} />
            <span
              className={`tracking-wide font-medium ${
                isConnected ? "text-panel-text" : "text-panel-muted"
              }`}
            >
              {isConnected && session
                ? `${challengeTitle.toLowerCase().replace(/\s+/g, "-")} @ sandbox-${session.sessionId.slice(0, 8)} ${session.isGuestTrial ? "(Trial)" : ""}`
                : state === "IDLE"
                  ? "no active terminal session"
                  : state.toLowerCase().replace(/_/g, " ")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isConnected && onStopSandbox && (
            <button
              onClick={onStopSandbox}
              className="font-mono text-[10.5px] font-semibold bg-red/10 text-red hover:bg-red/20 border border-red/30 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-sm active:scale-95"
            >
              Stop Sandbox
            </button>
          )}

          {(isConnected || state === "RECONNECTING") && (
            <ConnectionBadge state={state} attempt={reconnectAttempt} max={maxReconnectAttempts} />
          )}
        </div>
      </div>

      {/* Terminal body */}
      <div className="flex-1 min-h-0 relative">
        <VmBootAnimation state={state} progressEvents={progressEvents ?? []} />

        {state === "SANDBOX_LOST" && (
          <div className="absolute inset-0 bg-bg flex flex-col items-center justify-center gap-4 font-mono text-center p-6">
            <WifiOff size={28} className={trialExpired ? "text-amber" : "text-red"} />
            <div>
              <div className={`font-bold text-[13px] mb-2 ${trialExpired ? "text-amber" : "text-red"}`}>
                {trialExpired ? "10-Minute Trial Expired" : "Sandbox stopped"}
              </div>
              <div className="text-panel-muted text-[11px] leading-[1.7] max-w-sm mx-auto">
                {trialExpired ? (
                  <>
                    Your 10-minute trial session has ended. Create a free account to continue solving scenarios with 60-minute sessions and XP tracking.
                  </>
                ) : (
                  <>
                    {session ? `sandbox-${session.sessionId.slice(0, 8)}` : "Session"} was terminated.
                    <br />
                    Your files and verified checks are saved.
                  </>
                )}
              </div>
            </div>

            {trialExpired ? (
              <Link
                href="/register"
                className="mt-2 flex items-center gap-2 bg-teal text-bg font-mono font-bold text-xs py-2 px-5 rounded-lg hover:bg-teal/90 transition-all shadow-md cursor-pointer"
              >
                <UserPlus size={14} />
                <span>Create Free Account</span>
              </Link>
            ) : null}
          </div>
        )}

        {state === "IDLE" && (
          <div className="absolute inset-0 bg-bg flex flex-col items-center justify-center gap-3.5 p-6">
            <div className="w-14 h-14 rounded-full border border-panel-border bg-panel flex items-center justify-center">
              {isGuest && isTrialEligible && !trialUsed ? (
                <Sparkles size={22} className="text-teal animate-pulse" />
              ) : (
                <Terminal size={22} className="text-panel-muted-dim" />
              )}
            </div>
            <div className="text-center">
              <div className="font-mono text-panel-muted text-xs mb-[5px]">
                {isGuest && isTrialEligible && !trialUsed
                  ? "Guest Sandbox Trial Available"
                  : "No active session"}
              </div>
              <div className="font-mono text-panel-muted-dim text-[10.5px] mb-4 max-w-xs mx-auto leading-relaxed">
                {isGuest && isTrialEligible && !trialUsed ? (
                  "Test your skills in an ephemeral 10-minute sandbox container. No sign-up required."
                ) : isGuest && trialUsed ? (
                  "You have completed your trial sandbox. Sign up to unlock unlimited 60-minute sessions."
                ) : (
                  "Click “Launch Sandbox” to begin"
                )}
              </div>

              {isGuest && isTrialEligible && !trialUsed ? (
                <button
                  onClick={onLaunchSandbox}
                  className="bg-gradient-to-r from-teal to-emerald-400 text-bg font-mono font-black text-xs py-2.5 px-5 rounded-lg hover:shadow-[0_0_24px_rgba(53,214,180,0.4)] transition-all cursor-pointer"
                >
                  Launch 10-Min Trial Sandbox
                </button>
              ) : isGuest && trialUsed ? (
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 bg-teal text-bg font-mono font-bold text-xs py-2 px-4 rounded-lg hover:bg-teal/90 transition-colors cursor-pointer"
                >
                  <UserPlus size={14} />
                  <span>Sign Up for Full Access</span>
                </Link>
              ) : (
                <button
                  onClick={onLaunchSandbox}
                  className="bg-amber text-bg font-mono font-bold text-xs py-2 px-4 rounded hover:bg-amber-dim transition-colors cursor-pointer"
                >
                  Launch Sandbox
                </button>
              )}
            </div>
          </div>
        )}

        {state === "FAILED" && (
          <div className="absolute inset-0 bg-bg flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle size={28} className="text-red" />
            <div className="text-red font-mono text-xs max-w-sm">
              {errorMessage || "Failed to start sandbox"}
            </div>
            {errorMessage?.includes("Trial quota exceeded") ? (
              <Link
                href="/register"
                className="mt-2 bg-teal text-bg font-mono font-bold text-xs py-2 px-4 rounded-lg hover:bg-teal/90 transition-colors cursor-pointer"
              >
                Sign Up for Full Access
              </Link>
            ) : errorMessage?.includes("Concurrency limit reached") && onTerminateActive ? (
              <button
                onClick={onTerminateActive}
                className="mt-2 bg-red text-white font-mono font-bold text-xs py-2 px-4 rounded hover:bg-red/80 transition-colors cursor-pointer"
              >
                Terminate Active Sessions
              </button>
            ) : null}
          </div>
        )}

        {showTerminal && state !== "SANDBOX_LOST" && (
          <XtermTerminal
            socket={wsRef.current}
            dimmed={state === "RECONNECTING"}
            className="absolute inset-0"
          />
        )}
      </div>
    </div>
  );
}
