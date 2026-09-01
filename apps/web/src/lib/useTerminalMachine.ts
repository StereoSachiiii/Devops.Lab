"use client";

/**
 * useTerminalMachine - the central state machine for the challenge page.
 *
 * Encodes all states described in the design report (Part 6):
 *
 *   IDLE → REQUESTING_SANDBOX → PROVISIONING → CONNECTING → CONNECTED
 *                                                   |               ↓ (ws closes unexpectedly)
 *                                                FAILED         RECONNECTING → CONNECTED (success)
 *                                                                   ↓ (budget exhausted OR server confirms alive:false)
 *                                                             SANDBOX_LOST → IDLE (user-triggered restart)
 *
 * Reconnect policy (exponential backoff with jitter, bounded):
 *   1s → 2s → 4s → 8s → cap 15s, ±10% jitter, max 6 attempts.
 *   On each attempt, GET /api/session/:id/health is called first.
 *   If alive:false is returned, skip to SANDBOX_LOST immediately.
 *   WebSocket close code 1000/1001 (intentional) short-circuits retries.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { API_ROUTES } from "@/lib/api-routes";
import type { SandboxHealth, CheckResult } from "@/lib/api-types";

// ── State types ───────────────────────────────────────────────────────────────

export type TerminalState =
  | "IDLE"
  | "REQUESTING_SANDBOX"
  | "PROVISIONING"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "SANDBOX_LOST"
  | "FAILED";

export interface SessionInfo {
  sessionId: string;
  terminalUrl: string;
  validateUrl: string;
  ttlMins?: number;
  challengeTitle?: string;
}

export interface ValidationResult {
  passed: boolean;
  feedback: string;
  checkResults: CheckResult[];
}

export interface TerminalMachineState {
  state: TerminalState;
  session: SessionInfo | null;
  wsRef: React.RefObject<WebSocket | null>;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  validationResult: ValidationResult | null;
  isValidating: boolean;
  errorMessage: string | null;
  progressEvents: Array<{ stage: string; message: string }>;
  ttlWarningMinutes: number | null;
  isolationDowngraded: boolean;
  // Actions
  startSession: (challengeId: string) => Promise<void>;
  terminateSession: () => Promise<void>;
  validateSolution: () => Promise<void>;
  retryAfterLoss: (challengeId: string) => Promise<void>;
}

// ── Reconnect constants ───────────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const JITTER_FACTOR = 0.1; // ±10%

function backoffMs(attempt: number): number {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  const jitter = base * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTerminalMachine(): TerminalMachineState {
  const [state, setState] = useState<TerminalState>("IDLE");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<Array<{ stage: string; message: string }>>([]);
  const [ttlWarningMinutes, setTtlWarningMinutes] = useState<number | null>(null);
  const [isolationDowngraded, setIsolationDowngraded] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const sessionRef = useRef<SessionInfo | null>(null);
  // Track whether a WebSocket close was intentional (terminate/cleanup)
  const intentionalCloseRef = useRef(false);

  // Keep sessionRef in sync so the WebSocket close handler can access it
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // ── WebSocket close handler ───────────────────────────────────────────────
  const handleWsClose = useCallback((event: CloseEvent) => {
    // Intentional close (terminate, unmount) - don't reconnect
    if (intentionalCloseRef.current) {
      return;
    }

    // WS close codes 1000 (normal) and 1001 (going away) mean the server
    // intentionally closed the connection - the sandbox is gone. Don't retry.
    if (event.code === 1000 || event.code === 1001) {
      setState("SANDBOX_LOST");
      return;
    }

    // Unexpected close - attempt reconnect
    setState("RECONNECTING");
    scheduleReconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect (or reconnect) to WebSocket ──────────────────────────────────
  const connectWs = useCallback(
    (terminalUrl: string) => {
      if (wsRef.current) {
        intentionalCloseRef.current = true;
        wsRef.current.close();
        intentionalCloseRef.current = false;
      }

      setState("CONNECTING");
      // Pass token via query and/or Sec-WebSocket-Protocol
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const protocols = token ? ["terminal", `bearer.${token}`] : ["terminal"];
      const ws = new WebSocket(terminalUrl, protocols);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
        setErrorMessage(null);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === "string") {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "progress") {
              setProgressEvents((prev) => [...prev, { stage: data.stage, message: data.message }]);
              if (data.stage === "READY") {
                setState("CONNECTED");
              }
              if (data.stage === "ISOLATION_DOWNGRADED") {
                setIsolationDowngraded(true);
              }
            } else if (data.type === "ttl_warning") {
              setTtlWarningMinutes(data.minutesRemaining);
            }
          } catch (err) {
            /* ignore non-json control messages */
          }
        }
      };

      ws.onclose = (event) => handleWsClose(event);

      ws.onerror = () => {
        // onerror always fires before onclose - let onclose drive state
      };
    },
    [handleWsClose]
  );

  // ── Reconnect scheduler ───────────────────────────────────────────────────
  const scheduleReconnect = useCallback(() => {
    const attempt = reconnectAttemptRef.current;

    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      setState("SANDBOX_LOST");
      return;
    }

    const delay = backoffMs(attempt);
    reconnectAttemptRef.current = attempt + 1;
    setReconnectAttempt(attempt + 1);

    reconnectTimerRef.current = setTimeout(async () => {
      const currentSession = sessionRef.current;
      if (!currentSession) {
        setState("SANDBOX_LOST");
        return;
      }

      // Before reconnecting, check if the sandbox is actually still alive.
      // This is the key distinction: Failure Mode A (WS dropped, sandbox alive)
      // vs. Failure Mode B (sandbox actually dead). Don't retry a dead sandbox.
      try {
        const health = await apiClient.get<SandboxHealth>(
          API_ROUTES.sessions.health(currentSession.sessionId)
        );
        if (!health.alive) {
          setState("SANDBOX_LOST");
          return;
        }

        // Also check if the sandbox worker itself is up (Kong returns 502 if down)
        const sandboxHealthUrl = currentSession.terminalUrl
          .replace("ws://", "http://")
          .replace("wss://", "https://")
          .replace("/terminal", "/health");
        
        await apiClient.get(sandboxHealthUrl);
      } catch (err: any) {
        // If Kong returns 502 Bad Gateway, the sandbox service is completely down
        if (err?.response?.status === 502) {
          setErrorMessage("Sandbox service is currently unavailable. Please try again later.");
          setState("FAILED");
          return;
        }
        // Otherwise (network blip), keep retrying
      }

      connectWs(currentSession.terminalUrl);
    }, delay);
  }, [connectWs]);

  // ── Start session ─────────────────────────────────────────────────────────
  const startSession = useCallback(
    async (challengeId: string) => {
      setState("REQUESTING_SANDBOX");
      setErrorMessage(null);
      setValidationResult(null);
      setProgressEvents([]);
      setIsolationDowngraded(false);

      try {
        const res = await apiClient.post<SessionInfo>(API_ROUTES.challenges.start(challengeId));
        setSession(res);
        sessionRef.current = res;
        setState("PROVISIONING");

        // Check if sandbox worker is up before connecting
        const sandboxHealthUrl = res.terminalUrl
          .replace("ws://", "http://")
          .replace("wss://", "https://")
          .replace("/terminal", "/health");
        
        try {
          await apiClient.get(sandboxHealthUrl);
        } catch (err: any) {
          if (err?.response?.status === 502) {
            setErrorMessage("Sandbox service is currently unavailable. Please try again later.");
            setState("FAILED");
            return;
          }
        }

        // Connect immediately to WebSocket to stream real progress events
        connectWs(res.terminalUrl);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to start sandbox.";
        setErrorMessage(msg);
        setState("FAILED");
      }
    },
    [connectWs]
  );

  // ── Terminate session ─────────────────────────────────────────────────────
  const terminateSession = useCallback(async () => {
    if (!session) return;

    intentionalCloseRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    intentionalCloseRef.current = false;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    try {
      await apiClient.delete(API_ROUTES.sessions.byId(session.sessionId));
    } catch {
      // Best-effort - the session may already be gone
    }

    setSession(null);
    sessionRef.current = null;
    setValidationResult(null);
    setErrorMessage(null);
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    setState("IDLE");
  }, [session]);

  // ── Retry after sandbox loss ──────────────────────────────────────────────
  const retryAfterLoss = useCallback(
    async (challengeId: string) => {
      setSession(null);
      sessionRef.current = null;
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      await startSession(challengeId);
    },
    [startSession]
  );

  // ── Validate solution ─────────────────────────────────────────────────────
  const validateSolution = useCallback(async () => {
    if (!session) return;
    setIsValidating(true);
    setErrorMessage(null);

    try {
      const data = await apiClient.rawPost<{
        passed: boolean;
        feedback: string;
        checkResults?: CheckResult[];
      }>(session.validateUrl);
      setValidationResult({
        passed: data.passed,
        feedback: data.feedback || "",
        checkResults: data.checkResults || [],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to validate solution.";
      setErrorMessage(msg);
    } finally {
      setIsValidating(false);
    }
  }, [session]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  return {
    state,
    session,
    wsRef,
    reconnectAttempt,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    validationResult,
    isValidating,
    errorMessage,
    progressEvents,
    ttlWarningMinutes,
    isolationDowngraded,
    startSession,
    terminateSession,
    validateSolution,
    retryAfterLoss,
  };
}
