import { EyebrowHeader } from "@/components/ui/EyebrowHeader";
import { TagPill } from "@/components/ui/TagPill";

export function DescriptionTab({ challenge }: { challenge: any }) {
  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 text-[13.5px] text-panel-muted font-sans leading-[1.65] whitespace-pre-line">
        {challenge.description}
      </p>
      {challenge.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {challenge.tags.map((tag: string) => (
            <TagPill key={tag}>#{tag}</TagPill>
          ))}
        </div>
      )}
      <div className="bg-panel-2/60 border border-panel-border/70 rounded-2xl p-4 mt-2 shadow-sm">
        <EyebrowHeader dotColor="none" className="mb-3 uppercase tracking-wider text-[10.5px]">
          Target Objectives
        </EyebrowHeader>
        {[
          "Fix the configuration syntax error",
          "Correct the listening port from 8080 to 80",
          "Ensure the service starts successfully",
        ].map((obj, i) => (
          <div
            key={i}
            className="flex items-start gap-3 mb-2.5 font-mono text-[12px] text-panel-muted leading-relaxed"
          >
            <span className="w-4 h-4 rounded-full bg-teal/15 text-teal border border-teal/30 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
              &check;
            </span>
            <span className="text-panel-text font-medium">{obj}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
