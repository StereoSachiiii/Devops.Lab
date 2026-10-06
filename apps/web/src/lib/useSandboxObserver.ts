"use client";

/**
 * useSandboxObserver
 *
 * A thin instrumentation layer that wraps useTerminalMachine and captures
 * every meaningful event (FSM transitions, WS lifecycle, HTTP calls, reconnect
 * steps) into a capped, timestamped ring buffer stored in a ref — so 500 log
 * lines cause zero extra re-renders.
 *
 * The hook re-exports everything from useTerminalMachine and adds:
 *   - events          : ObserverEvent[] snapshot (updated every 500ms)
 *   - clearEvents()   : flush the ring buffer
 *   - copyEventsJson(): serialize full log to clipboard
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTerminalMachine } from "./useTerminalMachine";
import type { TerminalState, TerminalMachineState } from "./useTerminalMachine";
import { API_BASE_URL } from "./apiBase";

// ── Event schema ──────────────────────────────────────────────────────────────

export type ObserverEventKind =
  | "STATE_CHANGE"
  | "WS_CONNECTING"
  | "WS_OPEN"
  | "WS_MESSAGE"
  | "WS_CLOSE"
  | "WS_ERROR"
  | "RECONNECT_SCHEDULED"
  | "RECONNECT_HEALTH_CHECK"
  | "RECONNECT_HEALTH_RESULT"
  | "RECONNECT_WORKER_CHECK"
  | "RECONNECT_WORKER_RESULT"
  | "HTTP_REQUEST"
  | "HTTP_RESPONSE"
  | "HTTP_ERROR"
  | "VALIDATION_START"
  | "VALIDATION_RESULT"
  | "INFO";

export type ObserverEventSeverity = "ok" | "warn" | "error" | "info";

export interface ObserverEvent {
  id: number;
  ts: number;          // Date.now()
  kind: ObserverEventKind;
  severity: ObserverEventSeverity;
  message: string;
  detail?: string | undefined;     // extra context (url, payload preview, etc.)
  latencyMs?: number | undefined;
}

// ── Service health snapshot ───────────────────────────────────────────────────

export interface ServiceHealth {
  label: string;
  endpoint: string;
  status: "ok" | "error" | "loading" | "unknown";
  statusCode: number | null;
  latencyMs: number | null;
  detail: string | null;
  checkedAt: number | null;
}

// ── Full observer state ───────────────────────────────────────────────────────

export interface SandboxObserverState extends TerminalMachineState {
  events: ObserverEvent[];
  serviceHealth: ServiceHealth[];
  reconnectCountdownMs: number | null;
  clearEvents: () => void;
  copyEventsJson: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RING_BUFFER_CAP = 500;
const SNAPSHOT_INTERVAL_MS = 500;
const HEALTH_POLL_INTERVAL_MS = 5000;

const INITIAL_SERVICES: ServiceHealth[] = [
  { label: "Core Service",   endpoint: "/api/core/health",   status: "unknown", statusCode: null, latencyMs: null, detail: null, checkedAt: null },
  { label: "Auth Service",   endpoint: "/api/auth/health",   status: "unknown", statusCode: null, latencyMs: null, detail: null, checkedAt: null },
  { label: "Notifications",  endpoint: "/api/notify/health", status: "unknown", statusCode: null, latencyMs: null, detail: null, checkedAt: null },
  { label: "API Gateway",    endpoint: "/api/challenges",    status: "unknown", statusCode: null, latencyMs: null, detail: null, checkedAt: null },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityForKind(kind: ObserverEventKind, extra?: { code?: number | undefined; alive?: boolean | undefined }): ObserverEventSeverity {
  if (kind === "WS_OPEN" || (kind === "RECONNECT_HEALTH_RESULT" && extra?.alive)) return "ok";
  if (kind === "STATE_CHANGE") return "info";
  if (
    kind === "WS_CLOSE" ||
    kind === "WS_ERROR" ||
    kind === "HTTP_ERROR" ||
    (kind === "RECONNECT_HEALTH_RESULT" && extra?.alive === false)
  ) return "error";
  if (kind === "RECONNECT_SCHEDULED" || kind === "RECONNECT_WORKER_CHECK" || kind === "RECONNECT_HEALTH_CHECK") return "warn";
  if (kind === "HTTP_RESPONSE" && extra?.code && extra.code >= 400) return "error";
  return "info";
}

function makeEvent(
  idRef: { current: number },
  kind: ObserverEventKind,
  message: string,
  opts: { detail?: string | undefined; latencyMs?: number | undefined; severityOverride?: ObserverEventSeverity | undefined; code?: number | undefined; alive?: boolean | undefined } = {}
): ObserverEvent {
  const evt: ObserverEvent = {
    id: ++idRef.current,
    ts: Date.now(),
    kind,
    severity: opts.severityOverride ?? severityForKind(kind, { code: opts.code, alive: opts.alive }),
    message,
  };
  if (opts.detail !== undefined) {
    evt.detail = opts.detail;
  }
  if (opts.latencyMs !== undefined) {
    evt.latencyMs = opts.latencyMs;
  }
  return evt;
}

async function pingService(svc: ServiceHealth): Promise<ServiceHealth> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${API_BASE_URL}${svc.endpoint}`, {
      credentials: "include",
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Date.now() - t0;
    let detail: string | null = null;
    try {
      const json = await res.clone().json();
      detail = json.status ?? json.message ?? null;
    } catch {
      detail = res.statusText || null;
    }
    return {
      ...svc,
      status: res.ok ? "ok" : "error",
      statusCode: res.status,
      latencyMs,
      detail,
      checkedAt: Date.now(),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ...svc,
      status: "error",
      statusCode: null,
      latencyMs: Date.now() - t0,
      detail: msg.slice(0, 80),
      checkedAt: Date.now(),
    };
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSandboxObserver(): SandboxObserverState {
  const machine = useTerminalMachine();

  const eventIdRef = useRef(0);

  // Ring buffer (ref — no re-renders on push)
  const bufRef = useRef<ObserverEvent[]>([]);
  const pushEvent = useCallback((e: ObserverEvent) => {
    const buf = bufRef.current;
    buf.push(e);
    if (buf.length > RING_BUFFER_CAP) buf.splice(0, buf.length - RING_BUFFER_CAP);
  }, []);

  // Snapshot state (re-renders at SNAPSHOT_INTERVAL_MS)
  const [events, setEvents] = useState<ObserverEvent[]>([]);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth[]>(INITIAL_SERVICES);
  const [reconnectCountdownMs, setReconnectCountdownMs] = useState<number | null>(null);

  // Track FSM state to detect transitions
  const prevStateRef = useRef<TerminalState>("IDLE");
  const reconnectScheduledAtRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef<number | null>(null);

  // ── FSM transition detection ────────────────────────────────────────────────
  useEffect(() => {
    const prev = prevStateRef.current;
    const next = machine.state;
    if (prev === next) return;
    prevStateRef.current = next;

    pushEvent(makeEvent(eventIdRef, "STATE_CHANGE", `${prev} → ${next}`, {
      detail: machine.session ? `session: ${machine.session.sessionId.slice(0, 8)}…` : undefined,
      severityOverride: next === "CONNECTED" ? "ok" : next === "FAILED" || next === "SANDBOX_LOST" ? "error" : next === "RECONNECTING" ? "warn" : "info",
    }));

    if (next === "RECONNECTING") {
      // Record when reconnect started so we can compute countdown
      reconnectScheduledAtRef.current = Date.now();
    }
    if (next === "CONNECTED") {
      reconnectScheduledAtRef.current = null;
      reconnectDelayRef.current = null;
      setReconnectCountdownMs(null);
    }
  }, [machine.state, machine.session, pushEvent]);

  // ── Reconnect attempt detection ─────────────────────────────────────────────
  const prevAttemptRef = useRef(0);
  useEffect(() => {
    if (machine.reconnectAttempt === prevAttemptRef.current) return;
    const attempt = machine.reconnectAttempt;
    prevAttemptRef.current = attempt;

    if (attempt === 0) return;

    // Estimate the backoff delay from the attempt number (mirrors machine logic)
    const base = Math.min(1000 * 2 ** (attempt - 1), 15000);
    reconnectDelayRef.current = base;
    reconnectScheduledAtRef.current = Date.now();

    pushEvent(makeEvent(eventIdRef, "RECONNECT_SCHEDULED", `Reconnect attempt ${attempt}/${machine.maxReconnectAttempts}`, {
      detail: `backoff ≈${base}ms`,
      severityOverride: "warn",
    }));

    // Health check — observe via session probe
    if (machine.session) {
      const sid = machine.session.sessionId;
      pushEvent(makeEvent(eventIdRef, "RECONNECT_HEALTH_CHECK", `GET /api/session/${sid.slice(0, 8)}…/health`, {
        detail: `sessionId: ${sid}`,
        severityOverride: "warn",
      }));
    }
  }, [machine.reconnectAttempt, machine.maxReconnectAttempts, machine.session, pushEvent]);

  // ── Progress events from the machine ───────────────────────────────────────
  const prevProgressLenRef = useRef(0);
  useEffect(() => {
    const events = machine.progressEvents;
    const newItems = events.slice(prevProgressLenRef.current);
    prevProgressLenRef.current = events.length;
    newItems.forEach((pe) => {
      pushEvent(makeEvent(
        eventIdRef,
        "WS_MESSAGE",
        `progress: ${pe.stage}`,
        {
          detail: pe.message,
          severityOverride: pe.stage === "READY" ? "ok" : pe.stage === "FAILED" ? "error" : "info",
        }
      ));
    });
  }, [machine.progressEvents, pushEvent]);

  // ── Validation events ───────────────────────────────────────────────────────
  const wasValidatingRef = useRef(false);
  useEffect(() => {
    if (machine.isValidating && !wasValidatingRef.current) {
      wasValidatingRef.current = true;
      pushEvent(makeEvent(eventIdRef, "VALIDATION_START", "Validation started", { detail: machine.session?.validateUrl }));
    }
    if (!machine.isValidating && wasValidatingRef.current) {
      wasValidatingRef.current = false;
      if (machine.validationResult) {
        pushEvent(makeEvent(
          eventIdRef,
          "VALIDATION_RESULT",
          machine.validationResult.passed ? "✓ Validation PASSED" : "✗ Validation FAILED",
          {
            detail: machine.validationResult.feedback?.slice(0, 120),
            severityOverride: machine.validationResult.passed ? "ok" : "error",
          }
        ));
      }
    }
  }, [machine.isValidating, machine.validationResult, machine.session, pushEvent]);

  // ── Snapshot flush (500ms) ─────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setEvents([...bufRef.current].reverse()); // newest first
    }, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // ── Reconnect countdown ticker ─────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (reconnectScheduledAtRef.current === null || reconnectDelayRef.current === null) {
        setReconnectCountdownMs(null);
        return;
      }
      const elapsed = Date.now() - reconnectScheduledAtRef.current;
      const remaining = reconnectDelayRef.current - elapsed;
      setReconnectCountdownMs(Math.max(0, remaining));
    }, 100);
    return () => clearInterval(id);
  }, []);

  // ── Service health polling (active only when session is alive) ─────────────
  useEffect(() => {
    const active = machine.state === "CONNECTING" || machine.state === "CONNECTED" || machine.state === "RECONNECTING";
    if (!active) return;

    const poll = async () => {
      const results = await Promise.all(INITIAL_SERVICES.map(pingService));
      setServiceHealth(results);
    };

    poll(); // immediate first ping
    const id = setInterval(poll, HEALTH_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [machine.state]);

  // ── WebSocket state observation via ref polling ────────────────────────────
  // We can't intercept ws events directly (machine owns the ws), so we watch
  // wsRef.current.readyState and session changes as a proxy.
  const prevWsStateRef = useRef<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const ws = machine.wsRef.current;
      const rs = ws ? ws.readyState : null;
      if (rs === prevWsStateRef.current) return;
      prevWsStateRef.current = rs;
      if (rs === WebSocket.OPEN) {
        pushEvent(makeEvent(eventIdRef, "WS_OPEN", "WebSocket OPEN", { severityOverride: "ok", detail: ws?.url }));
      } else if (rs === WebSocket.CONNECTING) {
        pushEvent(makeEvent(eventIdRef, "WS_CONNECTING", "WebSocket CONNECTING", { detail: ws?.url }));
      } else if (rs === WebSocket.CLOSING) {
        pushEvent(makeEvent(eventIdRef, "WS_CLOSE", "WebSocket CLOSING", { severityOverride: "warn" }));
      } else if (rs === WebSocket.CLOSED) {
        pushEvent(makeEvent(eventIdRef, "WS_CLOSE", "WebSocket CLOSED", { severityOverride: machine.state === "RECONNECTING" || machine.state === "SANDBOX_LOST" ? "error" : "info" }));
      }
    }, 200);
    return () => clearInterval(id);
  }, [machine.wsRef, machine.state, pushEvent]);

  // ── Error message observation ──────────────────────────────────────────────
  const prevErrRef = useRef<string | null>(null);
  useEffect(() => {
    if (machine.errorMessage && machine.errorMessage !== prevErrRef.current) {
      prevErrRef.current = machine.errorMessage;
      pushEvent(makeEvent(eventIdRef, "HTTP_ERROR", machine.errorMessage, { severityOverride: "error" }));
    }
  }, [machine.errorMessage, pushEvent]);

  // ── Controls ───────────────────────────────────────────────────────
  const clearEvents = useCallback(() => {
    bufRef.current = [];
    setEvents([]);
  }, []);

  const copyEventsJson = useCallback(() => {
    const report = {
      generatedAt: new Date().toISOString(),
      session: machine.session,
      state: machine.state,
      events: [...bufRef.current],
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2)).catch(() => {});
  }, [machine.session, machine.state]);

  return {
    ...machine,
    events,
    serviceHealth,
    reconnectCountdownMs,
    clearEvents,
    copyEventsJson,
  };
}
