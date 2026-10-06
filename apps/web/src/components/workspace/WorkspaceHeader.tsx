import { Zap, Clock, UserPlus, Activity } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { TagPill } from "@/components/ui/TagPill";
import Link from "next/link";

export function WorkspaceHeader({
  title,
  difficulty,
  xp,
  onTourClick,
  isGuestTrial,
  trialSecondsLeft,
  trialExpired,
  telemetryOpen,
  onToggleTelemetry,
}: {
  title: string;
  difficulty: string;
  xp: number;
  onTourClick: () => void;
  isGuestTrial?: boolean;
  trialSecondsLeft?: number | null;
  trialExpired?: boolean;
  telemetryOpen?: boolean;
  onToggleTelemetry?: () => void;
}) {
  const diffVariant = difficulty === "SENIOR" ? "amber" : difficulty === "MID" ? "amber" : "teal";

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      id="challenge-header"
      className="flex items-center justify-between py-4 border-b border-panel-border/60"
    >
      <div className="flex items-center gap-3">
        <Breadcrumbs items={[{ label: "Challenges", href: "/challenges" }, { label: title }]} />
      </div>

      <div className="flex items-center gap-2.5">
        {isGuestTrial && trialSecondsLeft !== null && trialSecondsLeft !== undefined && (
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono text-[11px] font-bold ${
                trialSecondsLeft <= 120 || trialExpired
                  ? "bg-red/10 border-red/40 text-red animate-pulse"
                  : "bg-amber/10 border-amber/30 text-amber"
              }`}
            >
              <Clock size={12} />
              <span>Trial: {trialExpired ? "0:00 (Expired)" : formatTimer(trialSecondsLeft)}</span>
            </div>

            {(trialSecondsLeft <= 120 || trialExpired) && (
              <Link
                href="/register"
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal text-bg font-mono text-[11px] font-bold hover:bg-teal/90 transition-all shadow-sm cursor-pointer"
              >
                <UserPlus size={12} />
                <span>Keep Learning &mdash; Sign Up</span>
              </Link>
            )}
          </div>
        )}

        <TagPill variant={diffVariant}>{difficulty}</TagPill>
        <TagPill variant="amber">
          <Zap size={11} className="fill-amber" />
          {xp} XP
        </TagPill>
        {onToggleTelemetry && (
          <button
            onClick={onToggleTelemetry}
            className={`font-mono text-[11px] font-semibold flex items-center gap-1 px-3 py-1 rounded-lg cursor-pointer transition-all duration-200 ${
              telemetryOpen 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]" 
                : "text-panel-muted bg-panel-2/80 border border-panel-border hover:text-panel-text hover:border-panel-muted-dim hover:bg-panel-2"
            }`}
          >
            <Activity size={12} className={telemetryOpen ? "text-cyan-400 animate-pulse" : ""} />
            Telemetry
          </button>
        )}
        <button
          onClick={onTourClick}
          className="font-mono text-[11px] font-semibold text-panel-muted bg-panel-2/80 border border-panel-border px-3 py-1 rounded-lg cursor-pointer transition-all duration-200 hover:text-panel-text hover:border-panel-muted-dim hover:bg-panel-2"
        >
          ? Tour
        </button>
      </div>
    </div>
  );
}
