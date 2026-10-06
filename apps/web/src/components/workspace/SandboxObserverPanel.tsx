"use client";

import { useState } from "react";
import type { SandboxObserverState, ObserverEventSeverity } from "@/lib/useSandboxObserver";
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Info, 
  Copy, 
  Trash2, 
  X, 
  ChevronDown, 
  ChevronRight,
  Server,
  Radio,
  Clock
} from "lucide-react";

interface SandboxObserverPanelProps {
  observer: SandboxObserverState;
  open: boolean;
  onClose: () => void;
}

export function SandboxObserverPanel({ observer, open, onClose }: SandboxObserverPanelProps) {
  const [filter, setFilter] = useState<"ALL" | ObserverEventSeverity>("ALL");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const { events, serviceHealth, reconnectCountdownMs, state, clearEvents, copyEventsJson } = observer;

  const filteredEvents = events.filter(e => {
    if (filter === "ALL") return true;
    return e.severity === filter;
  });

  const handleCopy = () => {
    copyEventsJson();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStateBadge = () => {
    switch (state) {
      case "CONNECTED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>CONNECTED</span>;
      case "CONNECTING":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>CONNECTING</span>;
      case "RECONNECTING":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>RECONNECTING</span>;
      case "FAILED":
      case "SANDBOX_LOST":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>{state}</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">{state}</span>;
    }
  };

  const getSeverityIcon = (sev: ObserverEventSeverity) => {
    switch (sev) {
      case "ok":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
      case "warn":
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case "error":
        return <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[440px] z-50 bg-[#0c0f17]/95 backdrop-blur-xl border-l border-zinc-800 shadow-2xl flex flex-col transition-all duration-300">
      {/* Header */}
      <div className="p-3.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="font-semibold text-sm text-zinc-100 tracking-wide">Sandbox Telemetry</span>
          {getStateBadge()}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            title="Copy logs JSON to clipboard"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-xs flex items-center gap-1"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? "Copied!" : "Export"}</span>
          </button>
          <button
            onClick={clearEvents}
            title="Clear logs"
            className="p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Close telemetry"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Reconnect Banner (if active) */}
      {reconnectCountdownMs !== null && (
        <div className="p-2.5 bg-amber-950/40 border-b border-amber-800/50 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 animate-spin" />
            <span>Reconnecting in {(reconnectCountdownMs / 1000).toFixed(1)}s...</span>
          </div>
          <span className="font-mono text-[11px] opacity-80">Attempt {observer.reconnectAttempt}/{observer.maxReconnectAttempts}</span>
        </div>
      )}

      {/* Hop / Service Status Grid */}
      <div className="p-3 border-b border-zinc-800/60 bg-zinc-950/40">
        <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Server className="w-3 h-3 text-zinc-500" />
          <span>Hop Health & Gateway Probes</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {serviceHealth.map((svc) => {
            const isOk = svc.status === "ok";
            const isErr = svc.status === "error";
            return (
              <div
                key={svc.label}
                className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium truncate">{svc.label}</span>
                  <span className={`w-2 h-2 rounded-full ${isOk ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : isErr ? "bg-rose-500" : "bg-zinc-600"}`} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-1 font-mono">
                  <span>{svc.statusCode ? `${svc.statusCode}` : svc.status}</span>
                  {svc.latencyMs !== null && <span>{svc.latencyMs}ms</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center justify-between bg-zinc-950/20">
        <div className="flex items-center gap-1 text-xs">
          {(["ALL", "error", "warn", "ok", "info"] as const).map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded capitalize text-[11px] transition-colors ${
                  active 
                    ? "bg-zinc-800 text-zinc-100 font-medium border border-zinc-700" 
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-zinc-500 font-mono">{filteredEvents.length} events</span>
      </div>

      {/* Event Stream Log */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 font-mono text-xs select-text">
        {filteredEvents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-xs py-8">
            <Clock className="w-6 h-6 mb-2 stroke-[1.5]" />
            <span>No events recorded yet</span>
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const isExpanded = expandedId === evt.id;
            const timeStr = new Date(evt.ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const hasDetail = !!evt.detail || evt.latencyMs !== undefined;

            return (
              <div
                key={evt.id}
                className="p-2 rounded bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/80 transition-colors"
              >
                <div 
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => hasDetail && setExpandedId(isExpanded ? null : evt.id)}
                >
                  <div className="flex items-start gap-1.5 min-w-0">
                    {getSeverityIcon(evt.severity)}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-500">{timeStr}</span>
                        <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-800/80 text-zinc-400 font-sans uppercase tracking-tight">
                          {evt.kind}
                        </span>
                      </div>
                      <div className="text-zinc-200 text-xs mt-0.5 break-words font-sans">
                        {evt.message}
                      </div>
                    </div>
                  </div>
                  {hasDetail && (
                    <button className="text-zinc-500 hover:text-zinc-300 p-0.5">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>

                {isExpanded && hasDetail && (
                  <div className="mt-2 pt-1.5 border-t border-zinc-800/60 text-[11px] text-zinc-400 space-y-1">
                    {evt.detail && (
                      <div className="p-1.5 rounded bg-zinc-950/60 border border-zinc-800/40 text-zinc-300 break-all">
                        {evt.detail}
                      </div>
                    )}
                    {evt.latencyMs !== undefined && (
                      <div className="text-zinc-500">
                        Latency: <span className="text-zinc-300">{evt.latencyMs}ms</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
