import { useEffect, useRef } from "react";
import { Terminal, CheckCircle } from "lucide-react";

const VM_STAGES = [
  { id: "pull", label: "Pulling container image", icon: "⬇" },
  { id: "create", label: "Creating sandbox layer", icon: "🔧" },
  { id: "tmux", label: "Starting shell session", icon: "⚡" },
  { id: "ready", label: "Sandbox ready", icon: "✓" },
];

export function VmBootAnimation({
  state,
  progressEvents = [],
}: {
  state: string;
  progressEvents?: Array<{ stage: string; message: string }>;
}) {
  const logRef = useRef<HTMLDivElement>(null);

  // Compute stageIdx dynamically from real progressEvents
  let stageIdx = 0;
  const stagesSeen = new Set(progressEvents.map((e) => e.stage));

  if (stagesSeen.has("READY")) {
    stageIdx = 3;
  } else if (stagesSeen.has("TMUX_ATTACHED")) {
    stageIdx = 2;
  } else if (stagesSeen.has("CONTAINER_CREATED") || stagesSeen.has("CONTAINER_STARTED") || stagesSeen.has("IMAGE_PULL_COMPLETE")) {
    stageIdx = 1;
  } else if (stagesSeen.has("IMAGE_PULL_START")) {
    stageIdx = 0;
  }

  // Derive log lines dynamically from real progressEvents
  const logLines = progressEvents.map((e) => {
    if (
      e.stage.endsWith("_COMPLETE") ||
      e.stage === "CONTAINER_CREATED" ||
      e.stage === "CONTAINER_STARTED" ||
      e.stage === "READY"
    ) {
      return `  ✓ ${e.message}`;
    }
    return `  → ${e.message}`;
  });

  if (logLines.length === 0 && (state === "PROVISIONING" || state === "CONNECTING")) {
    logLines.unshift("$ sandbox init --env devops-lab");
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progressEvents]);

  if (state !== "PROVISIONING" && state !== "CONNECTING") return null;

  return (
    <div className="absolute inset-0 z-10 bg-bg flex flex-col items-center justify-center gap-7 py-8 px-6">
      <div className="relative w-[72px] h-[72px]">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,157,92,0.4)_0%,transparent_70%)] animate-[orbPulse_1.8s_ease-in-out_infinite]" />
        <div className="absolute inset-2 rounded-full border-2 border-amber shadow-[0_0_18px_rgba(255,157,92,0.5)] flex items-center justify-center animate-[orbSpin_3s_linear_infinite]">
          <Terminal size={20} className="text-amber" />
        </div>
      </div>
      <div className="flex flex-col gap-2.5 w-full max-w-[360px]">
        {VM_STAGES.map((s, i) => {
          const done = i < stageIdx;
          const active = i === stageIdx;
          return (
            <div
              key={s.id}
              className="flex items-center gap-2.5 transition-opacity duration-400"
              style={{ opacity: done || active ? 1 : 0.25 }}
            >
              <div
                className={`w-6 h-6 rounded-full shrink-0 border-[1.5px] flex items-center justify-center text-[11px] transition-all duration-400 ${
                  done
                    ? "border-teal bg-[rgba(53,214,180,0.1)]"
                    : active
                      ? "border-amber bg-[rgba(255,157,92,0.1)] shadow-[0_0_8px_rgba(255,157,92,0.6)]"
                      : "border-panel-border bg-transparent"
                }`}
              >
                {done ? (
                  <CheckCircle size={13} className="text-teal" />
                ) : active ? (
                  <span className="text-amber animate-[dotBlink_0.8s_ease-in-out_infinite]">●</span>
                ) : (
                  <span className="text-panel-muted-dim text-[10px]">{i + 1}</span>
                )}
              </div>
              <span
                className={`font-mono text-xs transition-colors duration-400 ${
                  done ? "text-teal" : active ? "text-amber" : "text-panel-muted-dim"
                }`}
              >
                {s.icon} {s.label}
                {active && <span className="animate-[dotBlink_0.8s_ease-in-out_infinite]">…</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div
        ref={logRef}
        className="w-full max-w-[420px] bg-panel border border-panel-border rounded-lg py-3 px-3.5 max-h-[120px] overflow-y-auto font-mono text-[10.5px] leading-[1.8] [scrollbar-width:none]"
      >
        {logLines.map((l, i) => (
          <div
            key={i}
            className={`${
              l.startsWith("  ✓")
                ? "text-teal"
                : l.startsWith("$")
                  ? "text-amber"
                  : "text-panel-muted-dim"
            }`}
          >
            {l}
          </div>
        ))}
        <span className="text-amber animate-[cursorBlink_1s_step-end_infinite]">▋</span>
      </div>
    </div>
  );
}
