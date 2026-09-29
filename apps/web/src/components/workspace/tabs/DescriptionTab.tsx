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
      {/* Brief Card */}
      <div className="text-[13px] text-panel-text/95 font-sans leading-[1.75] whitespace-pre-line bg-[#0c1017]/80 backdrop-blur-md p-4 rounded-xl border border-panel-border/70 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal/[0.03] rounded-full blur-2xl pointer-events-none" />
        {challenge.description}
      </div>

      {/* Tags */}
      {challenge.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {challenge.tags.map((tag: string) => (
            <TagPill key={tag} className="text-[10.5px] py-1 px-2.5 font-mono bg-panel-2/60 border-panel-border/60 hover:border-teal/30 hover:text-teal transition-colors">
              #{tag}
            </TagPill>
          ))}
        </div>
      )}

      {/* Target Objectives Section */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#111622]/90 to-[#0c0f16]/95 border border-panel-border/80 rounded-xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.25)]">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-teal/30 to-transparent" />
        
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2 text-panel-muted font-mono text-[11px] uppercase tracking-wider font-bold">
            <div className="w-5 h-5 rounded-md bg-teal/10 border border-teal/30 flex items-center justify-center">
              <Target size={12} className="text-teal" />
            </div>
            <span className="text-panel-text/90">Target Objectives</span>
          </div>
          <span className="font-mono text-[10px] text-teal/80 bg-teal/10 border border-teal/20 px-2 py-0.5 rounded-full font-semibold">
            {objectives.length} required
          </span>
        </div>
        
        <div className="flex flex-col gap-2.5">
          {objectives.map((obj: string, i: number) => (
            <div
              key={i}
              className="group flex items-start gap-3 p-2.5 rounded-lg bg-panel-2/40 border border-panel-border/40 hover:border-teal/30 hover:bg-panel-2/70 transition-all duration-200"
            >
              <div className="w-5 h-5 rounded-full bg-teal/15 text-teal border border-teal/40 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_8px_rgba(53,214,180,0.2)] group-hover:scale-105 transition-transform">
                <Check size={11} strokeWidth={3} />
              </div>
              <span className="font-sans text-[12.5px] font-medium text-panel-text/90 group-hover:text-panel-text leading-snug">
                {obj}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

