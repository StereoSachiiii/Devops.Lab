import { Terminal, WifiOff, AlertCircle } from "lucide-react";
import dynamic from "next/dynamic";
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
}) {
  const isConnected = state === "CONNECTED";
  const showTerminal = !["IDLE", "FAILED"].includes(state);

  return (
    <div
      className={`flex flex-col flex-1 bg-bg border border-panel-border rounded-[10px] overflow-hidden relative min-h-[440px] transition-shadow duration-600 ${
        isConnected ? "shadow-[0_0_30px_rgba(53,214,180,0.06)]" : "shadow-none"
      }`}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3.5 py-[9px] bg-panel-2 border-b border-panel-border shrink-0">
        {[
          isConnected
            ? "bg-teal"
            : state === "RECONNECTING"
              ? "bg-amber"
              : state === "SANDBOX_LOST" || state === "FAILED"
                ? "bg-red"
                : "bg-panel-border",
          "bg-panel-border",
          "bg-panel-border",
        ].map((c, i) => (
          <div
            key={i}
            className={`w-[9px] h-[9px] rounded-full transition-all duration-400 ${c} ${
              i === 0 && isConnected ? "shadow-[0_0_6px_rgba(53,214,180,0.5)]" : ""
            } ${
              (state === "PROVISIONING" || state === "CONNECTING") && i === 0
                ? "animate-[orbPulse_1.5s_ease-in-out_infinite]"
                : ""
            }`}
          />
        ))}
        <span
          className={`ml-2 font-mono text-[11px] flex-1 tracking-[0.02em] ${
            isConnected ? "text-panel-muted" : "text-panel-muted-dim"
          }`}
        >
          {isConnected && session
            ? `${challengeTitle.toLowerCase().replace(/\s+/g, "-")} - sandbox-${session.sessionId.slice(0, 8)}`
            : state === "IDLE"
              ? "no active session"
              : state.toLowerCase().replace(/_/g, " ")}
        </span>
        {isConnected && onStopSandbox && (
          <button
            onClick={onStopSandbox}
            className="font-mono text-[10px] bg-red/10 text-red border border-red/20 px-2 py-0.5 rounded hover:bg-red/20 transition-all cursor-pointer mr-2"
          >
            Stop Sandbox
          </button>
        )}
        {(isConnected || state === "RECONNECTING") && (
          <ConnectionBadge state={state} attempt={reconnectAttempt} max={maxReconnectAttempts} />
        )}
      </div>

      {/* Terminal body */}
      <div className="flex-1 min-h-0 relative">
        <VmBootAnimation state={state} progressEvents={progressEvents ?? []} />

        {state === "SANDBOX_LOST" && (
          <div className="absolute inset-0 bg-bg flex flex-col items-center justify-center gap-4 font-mono text-center p-6">
            <WifiOff size={28} className="text-red" />
            <div>
              <div className="text-red font-bold text-[13px] mb-2">Sandbox stopped</div>
              <div className="text-panel-muted text-[11px] leading-[1.7]">
                {session ? `sandbox-${session.sessionId.slice(0, 8)}` : "Session"} was terminated.
                <br />
                Your files and verified checks are saved.
              </div>
            </div>
          </div>
        )}

        {state === "IDLE" && (
          <div className="absolute inset-0 bg-bg flex flex-col items-center justify-center gap-3.5">
            <div className="w-14 h-14 rounded-full border border-panel-border bg-panel flex items-center justify-center">
              <Terminal size={22} className="text-panel-muted-dim" />
            </div>
            <div className="text-center">
              <div className="font-mono text-panel-muted text-xs mb-[5px]">No active session</div>
              <div className="font-mono text-panel-muted-dim text-[10.5px] mb-4">
                Click &ldquo;Launch Sandbox&rdquo; to begin
              </div>
              <button
                onClick={onLaunchSandbox}
                className="bg-amber text-bg font-mono font-bold text-xs py-2 px-4 rounded hover:bg-amber-dim transition-colors cursor-pointer"
              >
                Launch Sandbox
              </button>
            </div>
          </div>
        )}

        {state === "FAILED" && (
          <div className="absolute inset-0 bg-bg flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle size={28} className="text-red" />
            <div className="text-red font-mono text-xs">
              {errorMessage || "Failed to start sandbox"}
            </div>
            {errorMessage?.includes("Concurrency limit reached") && onTerminateActive && (
              <button
                onClick={onTerminateActive}
                className="mt-2 bg-red text-white font-mono font-bold text-xs py-2 px-4 rounded hover:bg-red/80 transition-colors cursor-pointer"
              >
                Terminate Active Sessions
              </button>
            )}
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
