import { Check, Target } from "lucide-react";
import { TagPill } from "@/components/ui/TagPill";

export function DescriptionTab({ challenge }: { challenge: any }) {
  // Extract specific objectives dynamically from description or fallback to structured steps
  const getObjectives = () => {
    if (challenge.checks && Array.isArray(challenge.checks) && challenge.checks.length > 0) {
      return challenge.checks.map((c: any) => c.description || c.title || String(c));
    }
    
    // Parse description sentences or provide intuitive step targets
    const desc = challenge.description || "";
    const sentences = desc
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 10);

    if (sentences.length >= 2) {
      return sentences;
    }

    return [
      `Analyze the ${challenge.category || "system"} configuration and environment state`,
      `Implement the required fixes and verify service integrity`,
      `Pass all automated validation checks and test endpoints`,
    ];
  };

  const objectives = getObjectives();

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[13px] text-panel-text/90 font-sans leading-[1.7] whitespace-pre-line bg-panel-2/30 p-3.5 rounded-xl border border-panel-border/50">
        {challenge.description}
      </div>

      {challenge.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {challenge.tags.map((tag: string) => (
            <TagPill key={tag} className="text-[10px] py-0.5 px-2">#{tag}</TagPill>
          ))}
        </div>
      )}

      <div className="bg-gradient-to-b from-panel-2/80 to-panel/90 border border-panel-border/80 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center gap-1.5 mb-3 text-panel-muted font-mono text-[10.5px] uppercase tracking-wider font-bold">
          <Target size={13} className="text-teal" />
          <span>Target Objectives</span>
        </div>
        
        <div className="flex flex-col gap-2">
          {objectives.map((obj: string, i: number) => (
            <div
              key={i}
              className="flex items-start gap-2.5 font-sans text-[12px] text-panel-text leading-snug"
            >
              <div className="w-4 h-4 rounded-full bg-teal/15 text-teal border border-teal/30 flex items-center justify-center shrink-0 mt-0.5">
                <Check size={10} strokeWidth={3} />
              </div>
              <span className="font-medium text-panel-text/90">{obj}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
