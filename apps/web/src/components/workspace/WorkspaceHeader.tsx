import { Zap } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { TagPill } from "@/components/ui/TagPill";

export function WorkspaceHeader({
  title,
  difficulty,
  xp,
  onTourClick,
}: {
  title: string;
  difficulty: string;
  xp: number;
  onTourClick: () => void;
}) {
  const diffVariant = difficulty === "SENIOR" ? "amber" : difficulty === "MID" ? "amber" : "teal";

  return (
    <div
      id="challenge-header"
      className="flex items-center justify-between py-4 border-b border-panel-border/60"
    >
      <div className="flex items-center gap-3">
        <Breadcrumbs items={[{ label: "Challenges", href: "/challenges" }, { label: title }]} />
      </div>

      <div className="flex items-center gap-2.5">
        <TagPill variant={diffVariant}>{difficulty}</TagPill>
        <TagPill variant="amber">
          <Zap size={11} className="fill-amber" />
          {xp} XP
        </TagPill>
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
