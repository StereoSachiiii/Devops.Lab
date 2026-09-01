"use client";

/**
 * TerminalChrome - the decorative wrapper around XtermTerminal.
 *
 * Connection state is reflected here (traffic-light dots + title bar text),
 * not in a separate alert or banner. This matches the established mental model
 * from every terminal app: the chrome area signals status. (Design report, Part 3.)
 *
 * Per-state presentation (design report, Part 6 table):
 *
 * IDLE/REQUESTING_SANDBOX  â†’ gray dots pulsing, "Waiting..."
 * PROVISIONING             â†’ gray dots pulsing, rotating status lines
 * CONNECTING               â†’ gray dots pulsing, "Connecting..."
 * CONNECTED                â†’ green/gray/gray, "session-{shortId}"
 * RECONNECTING             â†’ amber/gray/gray, "reconnectingâ€¦ (attempt N/M)"
 * SANDBOX_LOST             â†’ red/gray/gray, "sandbox stopped"
 * FAILED                   â†’ red/gray/gray, error message
 */

// import React from "react";
import type { TerminalState } from "@/lib/useTerminalMachine";

interface TerminalChromeProps {
  state: TerminalState;
  sessionId?: string | null;
  reconnectAttempt?: number;
  maxReconnectAttempts?: number;
  challengeTitle?: string;
  children: React.ReactNode;
  className?: string;
}

// Dot colors for each state
function getDotColors(state: TerminalState): [string, string, string] {
  switch (state) {
    case "CONNECTED":
      return ["#35d6b4", "#262626", "#262626"]; // teal / dark / dark
    case "RECONNECTING":
      return ["#ff9d5c", "#262626", "#262626"]; // amber / dark / dark
    case "SANDBOX_LOST":
    case "FAILED":
      return ["#ff6b6b", "#262626", "#262626"]; // red / dark / dark
    default:
      return ["#262626", "#262626", "#262626"]; // all dark
  }
}

function getTitleText(
  state: TerminalState,
  sessionId?: string | null,
  reconnectAttempt?: number,
  maxReconnectAttempts?: number,
  challengeTitle?: string
): string {
  const shortId = sessionId ? sessionId.slice(0, 8) : "--------";
  switch (state) {
    case "IDLE":
      return "No active session";
    case "REQUESTING_SANDBOX":
      return "Requesting sandbox...";
    case "PROVISIONING":
      return "Starting sandbox...";
    case "CONNECTING":
      return "Connecting...";
    case "CONNECTED":
      return challengeTitle ? `${challengeTitle} - sandbox-${shortId}` : `sandbox-${shortId}`;
    case "RECONNECTING":
      return `reconnecting... (attempt ${reconnectAttempt ?? 1}/${maxReconnectAttempts ?? 6})`;
    case "SANDBOX_LOST":
      return "sandbox stopped";
    case "FAILED":
      return "failed to start";
    default:
      return "";
  }
}

const isPulsing = (state: TerminalState) =>
  state === "IDLE" ||
  state === "REQUESTING_SANDBOX" ||
  state === "PROVISIONING" ||
  state === "CONNECTING";

export default function TerminalChrome({
  state,
  sessionId,
  reconnectAttempt,
  maxReconnectAttempts,
  challengeTitle,
  children,
  className,
}: TerminalChromeProps) {
  const [d1, d2, d3] = getDotColors(state);
  const titleText = getTitleText(
    state,
    sessionId,
    reconnectAttempt,
    maxReconnectAttempts,
    challengeTitle
  );
  const pulsing = isPulsing(state);

  return (
    <div
      className={className}
      style={{
        borderRadius: "10px",
        border: "1px solid #1d232e",
        background: "#07090c",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "9px 14px",
          background: "#10141b",
          borderBottom: "1px solid #1d232e",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {/* Traffic-light dots */}
        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
          {[d1, d2, d3].map((color, i) => (
            <div
              key={i}
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: color,
                transition: "background 0.3s ease",
                animation: pulsing && i === 0 ? "pulse 2s ease-in-out infinite" : "none",
              }}
            />
          ))}
        </div>

        {/* Session title */}
        <span
          style={{
            marginLeft: "8px",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color:
              state === "RECONNECTING"
                ? "#ff9d5c"
                : state === "SANDBOX_LOST" || state === "FAILED"
                  ? "#ff6b6b"
                  : "#4b5262",
            transition: "color 0.3s ease",
            letterSpacing: "0.02em",
          }}
        >
          {titleText}
        </span>

        {/* Spacer + status badge for RECONNECTING */}
        {state === "RECONNECTING" && (
          <div
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: "rgba(255,157,92,0.12)",
              color: "#ff9d5c",
              border: "1px solid rgba(255,157,92,0.2)",
            }}
          >
            reconnecting
          </div>
        )}

        {/* Live dot for CONNECTED */}
        {state === "CONNECTED" && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#35d6b4",
                animation: "livePulse 2.5s ease-in-out infinite",
              }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#35d6b4" }}>
              live
            </span>
          </div>
        )}
      </div>

      {/* Terminal body */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>

      {/* Keyframe animations injected inline - avoids globals.css churn */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
